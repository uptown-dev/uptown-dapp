// Every figure the site shows, read from contract views through Multicall3, all at one block
// (spec "Frontend -> Data rule": no event scanning, no indexer, no server). Three short rounds,
// each a single eth_call: the global views and the current day; then the day-dependent views
// (the limits, today's total, the wallet's tally per day); then the views for the wallet's days.
import { createPublicClient, defineChain, encodeAbiParameters, http, type Hex, type PublicClient } from 'viem';
import { HOOK_ABI, LPVAULT_ABI, QUOTER_ABI, REWARDS_ABI, STAKING_ABI, TOKEN_ABI, TREASURY_ABI } from './abi';
import type { Network } from './network';
import { PriceSource, TIERS, type Address, type ChainState, type CycleInfo, type PerTier, type StreamInfo, type Tier, type WalletState } from '../data/types';

const MULTICALL3_ABI = [
  {
    type: 'function',
    name: 'getEthBalance',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

/** 1,000,000,000 TOWN: the supply minted once (spec "Fixed parameters"). */
const INITIAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
/** type(uint256).max: Treasury.lastDistributedCycle() before the first distribution (CL-27). */
const MAX_UINT = 2n ** 256n - 1n;
/** The first cycle of each 100-day epoch, for the halving schedule. */
const EPOCH_FIRSTS = [0, 100, 200, 300, 400, 500, 600];

/** A viem chain for the network module's chain, with Multicall3. */
export function viemChain(n: Network) {
  return defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [n.rpcUrl] } },
    contracts: n.uniswap ? { multicall3: { address: n.uniswap.multicall3 } } : undefined,
  });
}

export function makeClient(n: Network): PublicClient {
  // ccipRead off: the site never follows a contract's request to fetch from another host.
  return createPublicClient({ chain: viemChain(n), transport: http(n.rpcUrl, { timeout: 20_000, retryCount: 1 }), ccipRead: false }) as PublicClient;
}

/** One call for multicall: kept loose on purpose, the results are checked one by one below. */
interface Call {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}

type Result = { status: 'success'; result: unknown } | { status: 'failure'; error: Error };

class Batch {
  private calls: Call[] = [];
  private names: string[] = [];
  add(name: string, c: Call): number {
    this.names.push(name);
    return this.calls.push(c) - 1;
  }
  async run(client: PublicClient, n: Network, blockNumber: bigint): Promise<Reader> {
    if (this.calls.length === 0) return new Reader([], []);
    const results = (await client.multicall({
      contracts: this.calls as never,
      allowFailure: true,
      blockNumber,
      multicallAddress: n.uniswap!.multicall3,
      batchSize: 64_000,
    })) as Result[];
    return new Reader(results, this.names);
  }
}

class Reader {
  constructor(
    private results: Result[],
    private names: string[],
  ) {}
  /** The value, or an error naming the view that failed. */
  get<T>(i: number): T {
    const r = this.results[i];
    if (r.status === 'success') return r.result as T;
    throw new Error(`reading ${this.names[i]} failed: ${r.error.message.split('\n')[0]}`);
  }
  /** The value, or null where the view reverted (vault prices without a price, CL-34). */
  maybe<T>(i: number): T | null {
    const r = this.results[i];
    return r.status === 'success' ? (r.result as T) : null;
  }
}

const num = (v: unknown) => Number(v as bigint);

/** Per wallet, the tally of past days never changes (only today's grows), so it is kept here. */
const pastTally = new Map<string, { through: number; bought: Record<number, bigint> }>();

export interface ReadResult {
  chain: ChainState;
  wallet: WalletState | null;
}

export async function readAll(client: PublicClient, n: Network, account: Address | null): Promise<ReadResult> {
  const d = n.deployment;
  if (!d || !n.uniswap) throw new Error('not deployed');
  const k = d.contracts;
  const block = await client.getBlock({ blockTag: 'latest' });
  const bn = block.number;

  // Round 1: global views, constants, the current day, and the wallet's basics.
  const a = new Batch();
  const H = (fn: string, args?: unknown[]) => a.add(`TownHook.${fn}`, { address: k.TownHook, abi: HOOK_ABI, functionName: fn, args });
  const R = (fn: string, args?: unknown[]) => a.add(`BuyerRewards.${fn}`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: fn, args });
  const T = (fn: string, args?: unknown[]) => a.add(`Treasury.${fn}`, { address: k.Treasury, abi: TREASURY_ABI, functionName: fn, args });
  const S = (fn: string, args?: unknown[]) => a.add(`TownStaking.${fn}`, { address: k.TownStaking, abi: STAKING_ABI, functionName: fn, args });
  const ethBalance = (who: Address) => a.add(`getEthBalance(${who})`, { address: n.uniswap!.multicall3, abi: MULTICALL3_ABI, functionName: 'getEthBalance', args: [who] });

  const i = {
    totalSupply: a.add('UpTownToken.totalSupply', { address: k.UpTownToken, abi: TOKEN_ABI, functionName: 'totalSupply' }),
    launchTime: H('launchTime'),
    hookCycle: H('currentCycle'),
    buyFee: H('currentBuyFeeBps'),
    sellFee: H('currentSellFeeBps'),
    BUY_FEE_BPS: H('BUY_FEE_BPS'),
    ANTI_SNIPE_START_BPS: H('ANTI_SNIPE_START_BPS'),
    ANTI_SNIPE_DURATION: H('ANTI_SNIPE_DURATION'),
    BURN_FLOOR: H('BURN_FLOOR'),
    RESERVE: R('RESERVE'),
    CLAIM_FEE_BPS: R('CLAIM_FEE_BPS'),
    rewardsCycle: R('currentCycle'),
    totalEmitted: R('totalEmitted'),
    totalClaimedGross: R('totalClaimedGross'),
    totalPaidToBuyers: R('totalPaidToBuyers'),
    totalFeesToTreasury: R('totalFeesToTreasury'),
    treasuryBalance: ethBalance(k.Treasury),
    ownerEthAvailable: T('ownerEthAvailable'),
    ownerTownAvailable: T('ownerTownAvailable'),
    spendBps: T('spendBps'),
    MAX_SPEND_BPS: T('MAX_SPEND_BPS'),
    OWNER_ETH_BPS: T('OWNER_ETH_BPS'),
    MIN_DISTRIBUTION: T('MIN_DISTRIBUTION'),
    treasuryCycle: T('currentCycle'),
    budget: T('budget'),
    lastDistributedCycle: T('lastDistributedCycle'),
    nextDistributionTime: T('nextDistributionTime'),
    totalEthReceived: T('totalEthReceived'),
    totalDistributed: T('totalDistributed'),
    totalOwnerEthWithdrawn: T('totalOwnerEthWithdrawn'),
    totalTownWithdrawn: T('totalTownWithdrawn'),
    TOTAL_WEIGHT: S('TOTAL_WEIGHT'),
    STREAM_LENGTH: S('STREAM_LENGTH'),
    PRICE_MAX_AGE: S('PRICE_MAX_AGE'),
    FALLBACK_MAX_AGE: S('FALLBACK_MAX_AGE'),
    FEED_CHANGE_DELAY: S('FEED_CHANGE_DELAY'),
    priceStatus: S('priceStatus'),
    fallbackPrice: S('fallbackPrice'),
    fallbackPriceSetAt: S('fallbackPriceSetAt'),
    pendingFeed: S('pendingFeed'),
    pendingFeedEffectiveAt: S('pendingFeedEffectiveAt'),
    totalStaked: S('totalStaked'),
    totalRewardsNotified: S('totalRewardsNotified'),
    totalRewardsPaid: S('totalRewardsPaid'),
    totalVaultFees: S('totalVaultFees'),
    unlockTime: a.add('LPVault.unlockTime', { address: k.LPVault, abi: LPVAULT_ABI, functionName: 'unlockTime' }),
    lockDuration: a.add('LPVault.lockDuration', { address: k.LPVault, abi: LPVAULT_ABI, functionName: 'lockDuration' }),
  };
  const perTier = (fn: string) => {
    const out = {} as PerTier<number>;
    for (const t of TIERS) out[t] = S(fn, [t]);
    return out;
  };
  const ti = {
    tierUsd: perTier('tierUsd'),
    tierWeight: perTier('tierWeight'),
    vaultPriceWei: perTier('vaultPriceWei'),
    tierStaked: perTier('tierStaked'),
    tierVaults: perTier('tierVaults'),
    streamInfo: perTier('streamInfo'),
    tierNotified: perTier('tierNotified'),
    tierPaid: perTier('tierPaid'),
  };
  const w = account
    ? {
        eth: ethBalance(account),
        town: a.add('UpTownToken.balanceOf(wallet)', { address: k.UpTownToken, abi: TOKEN_ABI, functionName: 'balanceOf', args: [account] }),
        allowance: a.add('UpTownToken.allowance(wallet, TownStaking)', {
          address: k.UpTownToken,
          abi: TOKEN_ABI,
          functionName: 'allowance',
          args: [account, k.TownStaking],
        }),
        position: S('positionOf', [account]),
        earned: S('earned', [account]),
      }
    : null;
  const r1 = await a.run(client, n, bn);

  const current = num(r1.get(i.rewardsCycle));
  const tierMap = <V>(idx: PerTier<number>, f: (v: unknown) => V, maybe = false) => {
    const out = {} as PerTier<V>;
    for (const t of TIERS) out[t] = maybe ? (r1.maybe(idx[t]) === null ? (null as V) : f(r1.maybe(idx[t]))) : f(r1.get(idx[t]));
    return out;
  };
  const position = w ? r1.get<readonly [number, bigint]>(w.position) : null;

  // Round 2: the limits for today and the next nine days and each epoch's first day, today's
  // total, and the wallet's tally for every day since launch (past days from memory once read).
  const b = new Batch();
  const capDays = [...new Set([...Array.from({ length: 10 }, (_, j) => current + j), ...EPOCH_FIRSTS])];
  const capIdx = capDays.map((c) => b.add(`BuyerRewards.cap(${c})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'cap', args: [BigInt(c)] }));
  const todayTotalIdx = b.add(`TownHook.cycleTotal(${current})`, { address: k.TownHook, abi: HOOK_ABI, functionName: 'cycleTotal', args: [BigInt(current)] });
  let boughtIdx: { c: number; i: number }[] = [];
  let known: Record<number, bigint> = {};
  if (account) {
    const memo = pastTally.get(`${n.chainId}:${account}`);
    const from = memo && memo.through < current ? memo.through + 1 : 0;
    known = memo && memo.through < current ? { ...memo.bought } : {};
    for (let c = from; c <= current; c++) {
      boughtIdx.push({
        c,
        i: b.add(`TownHook.bought(${c}, wallet)`, { address: k.TownHook, abi: HOOK_ABI, functionName: 'bought', args: [BigInt(c), account] }),
      });
    }
  }
  const r2 = await b.run(client, n, bn);
  const cap: Record<number, bigint> = {};
  capDays.forEach((c, j) => (cap[c] = r2.get<bigint>(capIdx[j])));
  const bought: Record<number, bigint> = { ...known };
  for (const { c, i: idx } of boughtIdx) {
    const v = r2.get<bigint>(idx);
    if (v > 0n) bought[c] = v;
  }
  if (account) {
    const past: Record<number, bigint> = {};
    for (const [c, v] of Object.entries(bought)) if (Number(c) < current) past[Number(c)] = v;
    pastTally.set(`${n.chainId}:${account}`, { through: current - 1, bought: past });
  }
  boughtIdx = [];

  // Round 3: for each day the wallet bought: claimed, the day's figures, and the claimable total
  // (BuyerRewards.claimable skips days not ready or already claimed, CL-27); upgrade prices.
  const c3 = new Batch();
  const days = Object.keys(bought)
    .map(Number)
    .sort((x, y) => x - y);
  const claimedIdx = account
    ? days.map((c) => c3.add(`BuyerRewards.claimed(wallet, ${c})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'claimed', args: [account, BigInt(c)] }))
    : [];
  const infoIdx = days.map((c) => c3.add(`BuyerRewards.cycleInfo(${c})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'cycleInfo', args: [BigInt(c)] }));
  // The limit of each of the wallet's days not read above, for the estimate of a day not yet finalised.
  const dayCapIdx = days
    .filter((c) => !(c in cap))
    .map((c) => ({ c, i: c3.add(`BuyerRewards.cap(${c})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'cap', args: [BigInt(c)] }) }));
  const claimableIdx =
    account && days.length
      ? c3.add('BuyerRewards.claimable(wallet, days)', { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'claimable', args: [account, days.map(BigInt)] })
      : -1;
  const upIdx: Partial<PerTier<number>> = {};
  if (account && position && position[0] !== 0) {
    for (const t of TIERS) if (t > position[0]) upIdx[t] = c3.add(`TownStaking.upgradePriceWei(wallet, ${t})`, { address: k.TownStaking, abi: STAKING_ABI, functionName: 'upgradePriceWei', args: [account, t] });
  }
  const r3 = await c3.run(client, n, bn);

  for (const { c, i: idx } of dayCapIdx) cap[c] = r3.get<bigint>(idx);
  const cycleInfo: Record<number, CycleInfo> = {};
  days.forEach((c, j) => {
    const [total, emitted, finalized] = r3.get<readonly [bigint, bigint, boolean]>(infoIdx[j]);
    cycleInfo[c] = { total, emitted, finalized };
  });
  const ps = r1.get<readonly [bigint, number, bigint]>(i.priceStatus);
  const pending = r1.get<Address>(i.pendingFeed);
  const ldc = r1.get<bigint>(i.lastDistributedCycle);

  const chain: ChainState = {
    blockTimestamp: Number(block.timestamp),
    blockNumber: bn,
    token: { totalSupply: r1.get(i.totalSupply), INITIAL_SUPPLY },
    hook: {
      launchTime: num(r1.get(i.launchTime)),
      currentCycle: num(r1.get(i.hookCycle)),
      currentBuyFeeBps: num(r1.get(i.buyFee)),
      currentSellFeeBps: num(r1.get(i.sellFee)),
      BUY_FEE_BPS: num(r1.get(i.BUY_FEE_BPS)),
      ANTI_SNIPE_START_BPS: num(r1.get(i.ANTI_SNIPE_START_BPS)),
      ANTI_SNIPE_DURATION: num(r1.get(i.ANTI_SNIPE_DURATION)),
      BURN_FLOOR: r1.get(i.BURN_FLOOR),
      cycleTotal: { [current]: r2.get<bigint>(todayTotalIdx) },
    },
    rewards: {
      RESERVE: r1.get(i.RESERVE),
      CLAIM_FEE_BPS: num(r1.get(i.CLAIM_FEE_BPS)),
      currentCycle: current,
      cap,
      cycleInfo,
      totalEmitted: r1.get(i.totalEmitted),
      totalClaimedGross: r1.get(i.totalClaimedGross),
      totalPaidToBuyers: r1.get(i.totalPaidToBuyers),
      totalFeesToTreasury: r1.get(i.totalFeesToTreasury),
    },
    treasury: {
      balance: r1.get(i.treasuryBalance),
      ownerEthAvailable: r1.get(i.ownerEthAvailable),
      ownerTownAvailable: r1.get(i.ownerTownAvailable),
      spendBps: num(r1.get(i.spendBps)),
      MAX_SPEND_BPS: num(r1.get(i.MAX_SPEND_BPS)),
      OWNER_ETH_BPS: num(r1.get(i.OWNER_ETH_BPS)),
      MIN_DISTRIBUTION: r1.get(i.MIN_DISTRIBUTION),
      currentCycle: num(r1.get(i.treasuryCycle)),
      budget: r1.get(i.budget),
      lastDistributedCycle: ldc === MAX_UINT ? null : Number(ldc),
      nextDistributionTime: num(r1.get(i.nextDistributionTime)),
      totalEthReceived: r1.get(i.totalEthReceived),
      totalDistributed: r1.get(i.totalDistributed),
      totalOwnerEthWithdrawn: r1.get(i.totalOwnerEthWithdrawn),
      totalTownWithdrawn: r1.get(i.totalTownWithdrawn),
    },
    staking: {
      tierUsd: tierMap(ti.tierUsd, num),
      tierWeight: tierMap(ti.tierWeight, num),
      TOTAL_WEIGHT: num(r1.get(i.TOTAL_WEIGHT)),
      STREAM_LENGTH: num(r1.get(i.STREAM_LENGTH)),
      PRICE_MAX_AGE: num(r1.get(i.PRICE_MAX_AGE)),
      FALLBACK_MAX_AGE: num(r1.get(i.FALLBACK_MAX_AGE)),
      FEED_CHANGE_DELAY: num(r1.get(i.FEED_CHANGE_DELAY)),
      priceStatus: { price: ps[0], source: Number(ps[1]) as PriceSource, updatedAt: Number(ps[2]) },
      fallbackPrice: r1.get(i.fallbackPrice),
      fallbackPriceSetAt: num(r1.get(i.fallbackPriceSetAt)),
      pendingFeed: /^0x0{40}$/i.test(pending) ? null : pending,
      pendingFeedEffectiveAt: num(r1.get(i.pendingFeedEffectiveAt)),
      vaultPriceWei: tierMap(ti.vaultPriceWei, (v) => v as bigint, true),
      tierStaked: tierMap(ti.tierStaked, (v) => v as bigint),
      tierVaults: tierMap(ti.tierVaults, num),
      streamInfo: tierMap(ti.streamInfo, (v) => {
        const s = v as { rewardRate: bigint; periodFinish: bigint; lastUpdateTime: bigint; rewardPerTokenStored: bigint };
        return { rewardRate: s.rewardRate, periodFinish: Number(s.periodFinish), lastUpdateTime: Number(s.lastUpdateTime), rewardPerTokenStored: s.rewardPerTokenStored } as StreamInfo;
      }),
      tierNotified: tierMap(ti.tierNotified, (v) => v as bigint),
      tierPaid: tierMap(ti.tierPaid, (v) => v as bigint),
      totalStaked: r1.get(i.totalStaked),
      totalRewardsNotified: r1.get(i.totalRewardsNotified),
      totalRewardsPaid: r1.get(i.totalRewardsPaid),
      totalVaultFees: r1.get(i.totalVaultFees),
    },
    lpVault: { unlockTime: num(r1.get(i.unlockTime)), lockDuration: num(r1.get(i.lockDuration)) },
  };

  let wallet: WalletState | null = null;
  if (account && w && position) {
    const claimed: Record<number, boolean> = {};
    days.forEach((c, j) => (claimed[c] = r3.get<boolean>(claimedIdx[j])));
    const upgradePriceWei: Partial<PerTier<bigint | null>> = {};
    for (const t of TIERS) if (upIdx[t] !== undefined) upgradePriceWei[t] = r3.maybe<bigint>(upIdx[t]!);
    wallet = {
      address: account,
      ethBalance: r1.get(w.eth),
      townBalance: r1.get(w.town),
      townAllowanceToStaking: r1.get(w.allowance),
      bought,
      claimed,
      claimable: claimableIdx >= 0 ? r3.get<bigint>(claimableIdx) : 0n,
      positionOf: { tier: Number(position[0]) as 0 | Tier, amount: position[1] },
      earned: r1.get(w.earned),
      upgradePriceWei,
    };
  }
  return { chain, wallet };
}

/** The TOWN pool's key (spec "Pool and launch position"): native ETH, TOWN, 0.5%, spacing 60, TownHook. */
export function poolKey(n: Network) {
  const k = n.deployment!.contracts;
  return { currency0: '0x0000000000000000000000000000000000000000' as Address, currency1: k.UpTownToken, fee: 5000, tickSpacing: 60, hooks: k.TownHook };
}

/** `hookData` naming the buyer: the address in 32 bytes (spec "Buy tally", attribution rule 1). */
export function buyerHookData(buyer: Address): Hex {
  return encodeAbiParameters([{ type: 'address' }], [buyer]);
}

/**
 * The TOWN a buy of `amountIn` wei would receive now, from Uniswap's V4Quoter (CL-41): an
 * estimate that includes the hook's buy fee and the pool fee. Null when the quoter refuses.
 */
export async function quoteBuy(client: PublicClient, n: Network, amountIn: bigint, buyer: Address | null): Promise<bigint> {
  const { result } = await client.simulateContract({
    address: n.uniswap!.v4Quoter,
    abi: QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [{ poolKey: poolKey(n), zeroForOne: true, exactAmount: amountIn, hookData: buyer ? buyerHookData(buyer) : '0x' }],
  });
  return (result as readonly [bigint, bigint])[0];
}
