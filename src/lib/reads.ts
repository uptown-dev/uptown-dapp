// Every figure the site shows, read from contract views through Multicall3, all at one block
// (spec "Frontend -> Data rule": no event scanning, no indexer, no server). Three short rounds,
// each a single eth_call: the global views, the current day and the staking contract the Treasury
// pays; then the views that depend on those (that contract's figures, the limits, today's rate and
// the days behind it, the wallet's tally per day, the announced staking contract's answers, the
// wallet's vaults in replaced staking contracts); then the views for the wallet's days. The owner
// page's views (CR-64) ride in the same rounds: each contract's owner and offered owner in rounds 1
// and 2, and in round 3 the signers of any owner that is a multisig. Before launch only the owner
// page's views are read, since most of the others revert until then.
import { createPublicClient, defineChain, encodeAbiParameters, http, type Hex, type PublicClient } from 'viem';
import { CANDIDATE_ABI, HOOK_ABI, LAUNCHER_ABI, LPVAULT_ABI, PERMIT2_ABI, QUOTER_ABI, REWARDS_ABI, SAFE_ABI, STAKING_ABI, TOKEN_ABI, TREASURY_ABI } from './abi';
import type { Network, StakingRecord } from './network';
import {
  PriceSource,
  TIERS,
  type Address,
  type CandidateCheck,
  type ChainState,
  type CycleInfo,
  type Multisig,
  type OldVault,
  type OwnerState,
  type PerTier,
  type StreamInfo,
  type Tier,
  type WalletState,
} from '../data/types';

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
/** The bytes an EIP-7702 delegated wallet's code begins with (CR-49). */
const DELEGATION_PREFIX = '0xef0100';
/**
 * The EIP-1967 implementation slot, keccak256("eip1967.proxy.implementation") - 1: a proxy keeps the
 * address of the code it runs here, so a non-zero value means the contract's code can be swapped.
 */
const EIP1967_IMPLEMENTATION_SLOT: Hex = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

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
  /** The value, or null where the view reverted (vault prices without a price, CL-34; an announced contract's answers, CR-49). */
  maybe<T>(i: number): T | null {
    const r = this.results[i];
    return r.status === 'success' ? (r.result as T) : null;
  }
}

const num = (v: unknown) => Number(v as bigint);
const isZero = (a: Address) => /^0x0{40}$/i.test(a);
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Per wallet, the tally of past days never changes (only today's grows), so it is kept here. */
const pastTally = new Map<string, { through: number; bought: Record<number, bigint> }>();

export interface ReadResult {
  /** Every figure; `null` before launch (Launcher.launched() is false), when most views revert. */
  chain: ChainState | null;
  wallet: WalletState | null;
  /** The owner page's views (CR-64), before and after launch. */
  owner: OwnerState;
}

/** The distinct owners and offered owners, for the multisig check (CR-64). */
function holdersOf(...list: (Address | null)[]): Address[] {
  const out: Address[] = [];
  for (const a of list) if (a && !isZero(a) && !out.some((x) => same(x, a))) out.push(a);
  return out;
}

/** Asks each owner or offered address for a Safe's signers and threshold (CR-64); an ordinary wallet fails both. */
function multisigCalls(batch: Batch, holders: Address[]) {
  return holders.map((h) => ({
    address: h,
    signers: batch.add(`${h}.getOwners()`, { address: h, abi: SAFE_ABI, functionName: 'getOwners' }),
    threshold: batch.add(`${h}.getThreshold()`, { address: h, abi: SAFE_ABI, functionName: 'getThreshold' }),
  }));
}

/**
 * The multisigs among the owners (CR-64): every address with code that is not an EIP-7702 delegated
 * wallet (such a wallet signs for itself). Its signers are `getOwners()`, or `null` when that failed.
 */
function multisigsFrom(r: Reader, calls: ReturnType<typeof multisigCalls>, codes: (Hex | undefined)[]): Record<string, Multisig> {
  const out: Record<string, Multisig> = {};
  calls.forEach((c, j) => {
    const code = codes[j];
    if (!code || code === '0x' || code.toLowerCase().startsWith(DELEGATION_PREFIX)) return;
    const signers = r.maybe<readonly Address[]>(c.signers);
    const threshold = r.maybe<bigint>(c.threshold);
    out[c.address.toLowerCase()] = { address: c.address, signers: signers ? [...signers] : null, threshold: threshold === null ? null : Number(threshold) };
  });
  return out;
}

const orNull = (a: Address): Address | null => (isZero(a) ? null : a);

export async function readAll(client: PublicClient, n: Network, account: Address | null): Promise<ReadResult> {
  const d = n.deployment;
  if (!d || !n.uniswap) throw new Error('not deployed');
  const k = d.contracts;
  const block = await client.getBlock({ blockTag: 'latest' });
  const bn = block.number;

  // Round 1: global views, constants, the current day, the staking contract the Treasury pays, and
  // the wallet's basics.
  const a = new Batch();
  const H = (fn: string, args?: unknown[]) => a.add(`TownHook.${fn}`, { address: k.TownHook, abi: HOOK_ABI, functionName: fn, args });
  const R = (fn: string, args?: unknown[]) => a.add(`BuyerRewards.${fn}`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: fn, args });
  const T = (fn: string, args?: unknown[]) => a.add(`Treasury.${fn}`, { address: k.Treasury, abi: TREASURY_ABI, functionName: fn, args });
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
    sellFeeInEth: H('sellFeeInEth'),
    RESERVE: R('RESERVE'),
    reserveExhausted: R('reserveExhausted'),
    CLAIM_FEE_BPS: R('CLAIM_FEE_BPS'),
    RATE_BASE_BPS: R('RATE_BASE_BPS'),
    RATE_BUY_SPAN_BPS: R('RATE_BUY_SPAN_BPS'),
    RATE_SELL_SPAN_BPS: R('RATE_SELL_SPAN_BPS'),
    LEAN_CYCLES: R('LEAN_CYCLES'),
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
    OWNER_DELAY: T('OWNER_DELAY'),
    APPLY_WINDOW: T('APPLY_WINDOW'),
    weth: T('weth'),
    staking: T('staking'),
    pendingStaking: T('pendingStaking'),
    stakingEffectiveAt: T('stakingEffectiveAt'),
    pauseEffectiveAt: T('pauseEffectiveAt'),
    paused: T('paused'),
    unlockTime: a.add('LPVault.unlockTime', { address: k.LPVault, abi: LPVAULT_ABI, functionName: 'unlockTime' }),
    lockDuration: a.add('LPVault.lockDuration', { address: k.LPVault, abi: LPVAULT_ABI, functionName: 'lockDuration' }),
  };
  // The owner page (CR-64): who owns each contract and who has been offered it; the Launcher before launch.
  const V = (fn: string) => a.add(`LPVault.${fn}`, { address: k.LPVault, abi: LPVAULT_ABI, functionName: fn });
  const L = (fn: string) => a.add(`Launcher.${fn}`, { address: k.Launcher, abi: LAUNCHER_ABI, functionName: fn });
  const oi = {
    launcherOwner: L('owner'),
    launched: L('launched'),
    treasuryOwner: T('owner'),
    treasuryPending: T('pendingOwner'),
    vaultOwner: V('owner'),
    vaultPending: V('pendingOwner'),
    tokenId: V('tokenId'),
    MIN_LOCK_DURATION: V('MIN_LOCK_DURATION'),
  };
  const w = account
    ? {
        eth: ethBalance(account),
        town: a.add('UpTownToken.balanceOf(wallet)', { address: k.UpTownToken, abi: TOKEN_ABI, functionName: 'balanceOf', args: [account] }),
        permit2Allowance: a.add('UpTownToken.allowance(wallet, Permit2)', {
          address: k.UpTownToken,
          abi: TOKEN_ABI,
          functionName: 'allowance',
          args: [account, n.uniswap.permit2],
        }),
        routerAllowance: a.add('Permit2.allowance(wallet, TOWN, router)', {
          address: n.uniswap.permit2,
          abi: PERMIT2_ABI,
          functionName: 'allowance',
          args: [account, k.UpTownToken, n.uniswap.universalRouter],
        }),
      }
    : null;
  const r1 = await a.run(client, n, bn);

  // The staking contract the Treasury pays now (CR-46, CR-50). Every staking figure, the vaults the
  // site offers and their approvals come from this contract, whatever the address file names.
  const stakingAddress = r1.get<Address>(i.staking);
  const ownerBase = {
    blockTimestamp: Number(block.timestamp),
    blockNumber: bn,
    launcher: { owner: r1.get<Address>(oi.launcherOwner), launched: r1.get<boolean>(oi.launched) },
    treasury: { owner: r1.get<Address>(oi.treasuryOwner), pendingOwner: orNull(r1.get<Address>(oi.treasuryPending)) },
    lpVault: {
      owner: r1.get<Address>(oi.vaultOwner),
      pendingOwner: orNull(r1.get<Address>(oi.vaultPending)),
      tokenId: r1.get<bigint>(oi.tokenId),
      unlockTime: num(r1.get(i.unlockTime)),
      MIN_LOCK_DURATION: num(r1.get(oi.MIN_LOCK_DURATION)),
    },
  };
  // The staking contract's owner, offered owner and feed (CR-64), in round 2 (or before launch, a round of their own).
  const stakingOwnerCalls = (batch: Batch) => {
    const P = (fn: string) => batch.add(`TownStaking.${fn}`, { address: stakingAddress, abi: STAKING_ABI, functionName: fn });
    return { owner: P('owner'), pending: P('pendingOwner'), feed: P('feed') };
  };
  const stakingOwnership = (r: Reader, c: ReturnType<typeof stakingOwnerCalls>): OwnerState['staking'] => ({
    address: stakingAddress,
    owner: r.get<Address>(c.owner),
    pendingOwner: orNull(r.get<Address>(c.pending)),
    feed: r.get<Address>(c.feed),
  });
  // Every owner and offered owner (the Launcher's only before launch), asked in round 3 whether it is a multisig.
  const ownerHolders = (staking: OwnerState['staking']) =>
    holdersOf(
      ownerBase.launcher.launched ? null : ownerBase.launcher.owner,
      ownerBase.treasury.owner,
      ownerBase.treasury.pendingOwner,
      staking.owner,
      staking.pendingOwner,
      ownerBase.lpVault.owner,
      ownerBase.lpVault.pendingOwner,
    );
  const codesOf = (holders: Address[]) => Promise.all(holders.map((h) => client.getCode({ address: h, blockNumber: bn })));

  if (!ownerBase.launcher.launched) {
    // Before launch: the owner page's views only, so the owner can launch (CR-64).
    const b0 = new Batch();
    const so0 = stakingOwnerCalls(b0);
    const r0 = await b0.run(client, n, bn);
    const staking = stakingOwnership(r0, so0);
    const holders = ownerHolders(staking);
    const c0 = new Batch();
    const ms = multisigCalls(c0, holders);
    const [rm, codes] = await Promise.all([c0.run(client, n, bn), codesOf(holders)]);
    return { chain: null, wallet: null, owner: { ...ownerBase, staking, multisigs: multisigsFrom(rm, ms, codes) } };
  }

  const current = num(r1.get(i.rewardsCycle));
  const pendingRaw = r1.get<Address>(i.pendingStaking);
  const pendingStaking = isZero(pendingRaw) ? null : pendingRaw;
  const LEAN_CYCLES = num(r1.get(i.LEAN_CYCLES));

  // Round 2: the current staking contract's figures and the wallet's vault in it; the limits for
  // today, the next nine days and each epoch's first day; today's total, rate and lean, and the
  // bought and sold totals of the days the lean is measured over (CR-47); the wallet's tally for
  // every day since launch (past days from memory once read); the announced staking contract's
  // answers (CR-49); the wallet's vaults in replaced staking contracts (CR-50).
  const b = new Batch();
  const S = (fn: string, args?: unknown[]) => b.add(`TownStaking.${fn}`, { address: stakingAddress, abi: STAKING_ABI, functionName: fn, args });
  const si = {
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
  };
  const so = stakingOwnerCalls(b);
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
  const ws = account
    ? {
        allowance: b.add('UpTownToken.allowance(wallet, staking)', { address: k.UpTownToken, abi: TOKEN_ABI, functionName: 'allowance', args: [account, stakingAddress] }),
        position: S('positionOf', [account]),
        earned: S('earned', [account]),
      }
    : null;

  const capDays = [...new Set([...Array.from({ length: 10 }, (_, j) => current + j), ...EPOCH_FIRSTS])];
  const capIdx = capDays.map((c) => b.add(`BuyerRewards.cap(${c})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'cap', args: [BigInt(c)] }));
  const todayTotalIdx = b.add(`TownHook.cycleTotal(${current})`, { address: k.TownHook, abi: HOOK_ABI, functionName: 'cycleTotal', args: [BigInt(current)] });
  // Today's rate and lean (CR-47), and the days they are measured over: c - 1 to c - LEAN_CYCLES.
  const leanDays = Array.from({ length: LEAN_CYCLES }, (_, j) => current - 1 - j).filter((c) => c >= 0);
  const rateIdx = b.add(`BuyerRewards.rateBps(${current})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'rateBps', args: [BigInt(current)] });
  const leanIdx = b.add(`BuyerRewards.lean(${current})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'lean', args: [BigInt(current)] });
  const leanTotalIdx = leanDays.map((c) => b.add(`TownHook.cycleTotal(${c})`, { address: k.TownHook, abi: HOOK_ABI, functionName: 'cycleTotal', args: [BigInt(c)] }));
  const leanSoldIdx = leanDays.map((c) => b.add(`TownHook.sold(${c})`, { address: k.TownHook, abi: HOOK_ABI, functionName: 'sold', args: [BigInt(c)] }));
  // The Stats page's trading volume (CR-61): TOWN bought and sold yesterday and today so far. Today's
  // sold total is read here; today's bought total is read above, and yesterday's two figures are the
  // lean's first day (read here only if the lean ever measured no day before today).
  const todaySoldIdx = b.add(`TownHook.sold(${current})`, { address: k.TownHook, abi: HOOK_ABI, functionName: 'sold', args: [BigInt(current)] });
  const yesterdayIdx =
    current >= 1 && !leanDays.includes(current - 1)
      ? {
          total: b.add(`TownHook.cycleTotal(${current - 1})`, { address: k.TownHook, abi: HOOK_ABI, functionName: 'cycleTotal', args: [BigInt(current - 1)] }),
          sold: b.add(`TownHook.sold(${current - 1})`, { address: k.TownHook, abi: HOOK_ABI, functionName: 'sold', args: [BigInt(current - 1)] }),
        }
      : null;
  // The sell fee's currency (CR-57): the TOWN burned today and yesterday, and yesterday's rebate pot,
  // the two figures the rule compared to set today's mode.
  const burnDays = [current, current - 1].filter((c) => c >= 0);
  const burnedIdx = burnDays.map((c) => b.add(`TownHook.burned(${c})`, { address: k.TownHook, abi: HOOK_ABI, functionName: 'burned', args: [BigInt(c)] }));
  const potIdx =
    current >= 1
      ? b.add(`BuyerRewards.emissionEstimate(${current - 1})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'emissionEstimate', args: [BigInt(current - 1)] })
      : -1;

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
  // The announced staking contract, asked which Treasury and which WETH it names (CR-49). Anything
  // can sit at that address, so a failed answer is a finding to show, not a read error.
  const candIdx = pendingStaking
    ? {
        treasury: b.add('announced staking contract.treasury()', { address: pendingStaking, abi: CANDIDATE_ABI, functionName: 'treasury' }),
        weth: b.add('announced staking contract.weth()', { address: pendingStaking, abi: CANDIDATE_ABI, functionName: 'weth' }),
      }
    : null;
  // The wallet's vaults in the staking contracts the Treasury no longer pays (CR-50), from the
  // network module's hand-kept list.
  const oldIdx = account
    ? n.stakingContracts
        .filter((r) => !same(r.address, stakingAddress))
        .map((r) => ({
          record: r,
          position: b.add(`staking ${r.address}.positionOf(wallet)`, { address: r.address, abi: STAKING_ABI, functionName: 'positionOf', args: [account] }),
          earned: b.add(`staking ${r.address}.earned(wallet)`, { address: r.address, abi: STAKING_ABI, functionName: 'earned', args: [account] }),
        }))
    : [];
  // The announced contract's code and its EIP-1967 implementation slot, at the same block, read
  // beside round 2: a wallet with an EIP-7702 delegation fails the check (CR-49); a proxy is flagged
  // as upgradeable (F8f housekeeping).
  const [r2, candidateCode, candidateImpl] = await Promise.all([
    b.run(client, n, bn),
    pendingStaking ? client.getCode({ address: pendingStaking, blockNumber: bn }) : Promise.resolve(undefined),
    pendingStaking ? client.getStorageAt({ address: pendingStaking, slot: EIP1967_IMPLEMENTATION_SLOT, blockNumber: bn }) : Promise.resolve(undefined),
  ]);

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
  const leanTotals: Record<number, bigint> = {};
  const leanSold: Record<number, bigint> = {};
  leanDays.forEach((c, j) => {
    leanTotals[c] = r2.get<bigint>(leanTotalIdx[j]);
    leanSold[c] = r2.get<bigint>(leanSoldIdx[j]);
  });
  if (yesterdayIdx) {
    leanTotals[current - 1] = r2.get<bigint>(yesterdayIdx.total);
    leanSold[current - 1] = r2.get<bigint>(yesterdayIdx.sold);
  }
  const burnedByDay: Record<number, bigint> = {};
  burnDays.forEach((c, j) => (burnedByDay[c] = r2.get<bigint>(burnedIdx[j])));
  const emissionEstimate: Record<number, bigint> = potIdx >= 0 ? { [current - 1]: r2.get<bigint>(potIdx) } : {};
  const position = ws ? r2.get<readonly [number, bigint]>(ws.position) : null;
  const candidate: CandidateCheck | null =
    pendingStaking && candIdx
      ? checkCandidate(pendingStaking, r2.maybe<Address>(candIdx.treasury), r2.maybe<Address>(candIdx.weth), candidateCode, k.Treasury, r1.get<Address>(i.weth), candidateImpl)
      : null;
  const oldVaults: OldVault[] = [];
  for (const o of oldIdx) {
    const pos = r2.maybe<readonly [number, bigint]>(o.position);
    const earned = r2.maybe<bigint>(o.earned) ?? 0n;
    const tier = pos ? (Number(pos[0]) as 0 | Tier) : 0;
    const amount = pos ? pos[1] : 0n;
    if (tier !== 0 || amount > 0n || earned > 0n) oldVaults.push({ address: o.record.address, replacedOn: o.record.replacedOn, positionOf: { tier, amount }, earned });
  }

  // Round 3: for each day the wallet bought: claimed, the day's figures, its rate (CR-47), and the
  // claimable total (BuyerRewards.claimable skips days not ready or already claimed, CL-27); upgrade
  // prices in the current staking contract; the signers of any owner that is a multisig (CR-64).
  const c3 = new Batch();
  const stakingOwner = stakingOwnership(r2, so);
  const holders = ownerHolders(stakingOwner);
  const msIdx = multisigCalls(c3, holders);
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
  // The rate of each of the wallet's past days: the rate its pot is (or will be) set at.
  const dayRateIdx = days
    .filter((c) => c !== current)
    .map((c) => ({ c, i: c3.add(`BuyerRewards.rateBps(${c})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'rateBps', args: [BigInt(c)] }) }));
  const claimableIdx =
    account && days.length
      ? c3.add('BuyerRewards.claimable(wallet, days)', { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'claimable', args: [account, days.map(BigInt)] })
      : -1;
  const upIdx: Partial<PerTier<number>> = {};
  if (account && position && position[0] !== 0) {
    for (const t of TIERS)
      if (t > position[0])
        upIdx[t] = c3.add(`TownStaking.upgradePriceWei(wallet, ${t})`, { address: stakingAddress, abi: STAKING_ABI, functionName: 'upgradePriceWei', args: [account, t] });
  }
  const [r3, holderCodes] = await Promise.all([c3.run(client, n, bn), codesOf(holders)]);
  const owner: OwnerState = { ...ownerBase, staking: stakingOwner, multisigs: multisigsFrom(r3, msIdx, holderCodes) };

  for (const { c, i: idx } of dayCapIdx) cap[c] = r3.get<bigint>(idx);
  const rateBps: Record<number, number> = { [current]: num(r2.get(rateIdx)) };
  for (const { c, i: idx } of dayRateIdx) rateBps[c] = num(r3.get(idx));
  const cycleInfo: Record<number, CycleInfo> = {};
  days.forEach((c, j) => {
    const [total, emitted, finalized] = r3.get<readonly [bigint, bigint, boolean]>(infoIdx[j]);
    cycleInfo[c] = { total, emitted, finalized };
  });
  const tierMap = <V>(idx: PerTier<number>, f: (v: unknown) => V, maybe = false) => {
    const out = {} as PerTier<V>;
    for (const t of TIERS) out[t] = maybe ? (r2.maybe(idx[t]) === null ? (null as V) : f(r2.maybe(idx[t]))) : f(r2.get(idx[t]));
    return out;
  };
  const ps = r2.get<readonly [bigint, number, bigint]>(si.priceStatus);
  const pendingFeed = r2.get<Address>(si.pendingFeed);
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
      cycleTotal: { ...leanTotals, [current]: r2.get<bigint>(todayTotalIdx) },
      sold: { ...leanSold, [current]: r2.get<bigint>(todaySoldIdx) },
      sellFeeInEth: r1.get<boolean>(i.sellFeeInEth),
      burned: burnedByDay,
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
      RATE_BASE_BPS: num(r1.get(i.RATE_BASE_BPS)),
      RATE_BUY_SPAN_BPS: num(r1.get(i.RATE_BUY_SPAN_BPS)),
      RATE_SELL_SPAN_BPS: num(r1.get(i.RATE_SELL_SPAN_BPS)),
      LEAN_CYCLES,
      rateBps,
      lean: { [current]: r2.get<bigint>(leanIdx) },
      emissionEstimate,
      reserveExhausted: r1.get<boolean>(i.reserveExhausted),
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
      OWNER_DELAY: num(r1.get(i.OWNER_DELAY)),
      staking: stakingAddress,
      pendingStaking,
      stakingEffectiveAt: num(r1.get(i.stakingEffectiveAt)),
      pauseEffectiveAt: num(r1.get(i.pauseEffectiveAt)),
      paused: r1.get(i.paused),
      APPLY_WINDOW: num(r1.get(i.APPLY_WINDOW)),
      weth: r1.get(i.weth),
      candidate,
    },
    staking: {
      address: stakingAddress,
      tierUsd: tierMap(ti.tierUsd, num),
      tierWeight: tierMap(ti.tierWeight, num),
      TOTAL_WEIGHT: num(r2.get(si.TOTAL_WEIGHT)),
      STREAM_LENGTH: num(r2.get(si.STREAM_LENGTH)),
      PRICE_MAX_AGE: num(r2.get(si.PRICE_MAX_AGE)),
      FALLBACK_MAX_AGE: num(r2.get(si.FALLBACK_MAX_AGE)),
      FEED_CHANGE_DELAY: num(r2.get(si.FEED_CHANGE_DELAY)),
      priceStatus: { price: ps[0], source: Number(ps[1]) as PriceSource, updatedAt: Number(ps[2]) },
      fallbackPrice: r2.get(si.fallbackPrice),
      fallbackPriceSetAt: num(r2.get(si.fallbackPriceSetAt)),
      pendingFeed: isZero(pendingFeed) ? null : pendingFeed,
      pendingFeedEffectiveAt: num(r2.get(si.pendingFeedEffectiveAt)),
      vaultPriceWei: tierMap(ti.vaultPriceWei, (v) => v as bigint, true),
      tierStaked: tierMap(ti.tierStaked, (v) => v as bigint),
      tierVaults: tierMap(ti.tierVaults, num),
      streamInfo: tierMap(ti.streamInfo, (v) => {
        const s = v as { rewardRate: bigint; periodFinish: bigint; lastUpdateTime: bigint; rewardPerTokenStored: bigint };
        return { rewardRate: s.rewardRate, periodFinish: Number(s.periodFinish), lastUpdateTime: Number(s.lastUpdateTime), rewardPerTokenStored: s.rewardPerTokenStored } as StreamInfo;
      }),
      tierNotified: tierMap(ti.tierNotified, (v) => v as bigint),
      tierPaid: tierMap(ti.tierPaid, (v) => v as bigint),
      totalStaked: r2.get(si.totalStaked),
      totalRewardsNotified: r2.get(si.totalRewardsNotified),
      totalRewardsPaid: r2.get(si.totalRewardsPaid),
      totalVaultFees: r2.get(si.totalVaultFees),
    },
    lpVault: { unlockTime: num(r1.get(i.unlockTime)), lockDuration: num(r1.get(i.lockDuration)) },
  };

  let wallet: WalletState | null = null;
  if (account && w && ws && position) {
    const claimed: Record<number, boolean> = {};
    days.forEach((c, j) => (claimed[c] = r3.get<boolean>(claimedIdx[j])));
    const upgradePriceWei: Partial<PerTier<bigint | null>> = {};
    for (const t of TIERS) if (upIdx[t] !== undefined) upgradePriceWei[t] = r3.maybe<bigint>(upIdx[t]!);
    wallet = {
      address: account,
      ethBalance: r1.get(w.eth),
      townBalance: r1.get(w.town),
      townAllowanceToStaking: r2.get(ws.allowance),
      townAllowanceToPermit2: r1.get(w.permit2Allowance),
      routerAllowance: (() => {
        const [amount, expiration] = r1.get<readonly [bigint, number]>(w.routerAllowance);
        return { amount, expiration: Number(expiration) };
      })(),
      bought,
      claimed,
      claimable: claimableIdx >= 0 ? r3.get<bigint>(claimableIdx) : 0n,
      positionOf: { tier: Number(position[0]) as 0 | Tier, amount: position[1] },
      earned: r2.get(ws.earned),
      upgradePriceWei,
      oldVaults,
    };
  }
  return { chain, wallet, owner };
}

/**
 * The site's own check of an announced staking contract (CR-49): it must name this Treasury as
 * `treasury()` and the Treasury's WETH as `weth()`, and its code must not be an EIP-7702
 * delegation. These are the checks the Treasury makes when the contract is announced and again
 * when it is applied, so a contract that fails here would be refused at application. Beside them,
 * a non-zero EIP-1967 implementation slot flags a proxy whose code can change (`upgradeable`); the
 * Treasury does not check this, so it does not affect `verified`.
 */
export function checkCandidate(
  address: Address,
  treasuryAnswer: Address | null,
  wethAnswer: Address | null,
  code: Hex | undefined,
  treasury: Address,
  weth: Address,
  implementationSlot?: Hex,
): CandidateCheck {
  const delegated = !!code && code.toLowerCase().startsWith(DELEGATION_PREFIX);
  return {
    address,
    treasury: treasuryAnswer,
    weth: wethAnswer,
    delegated,
    verified: !delegated && same(treasuryAnswer, treasury) && same(wethAnswer, weth),
    upgradeable: !!implementationSlot && /[1-9a-f]/i.test(implementationSlot.slice(2)),
  };
}

/**
 * The same check, asked of any one address on its own (the latest block). The page's read uses
 * `checkCandidate` inside its multicall; the site's tests use this to point the check at any
 * address, for example WETH.
 */
export async function verifyCandidate(client: PublicClient, address: Address, treasury: Address, weth: Address): Promise<CandidateCheck> {
  const ask = (functionName: 'treasury' | 'weth') =>
    client.readContract({ address, abi: CANDIDATE_ABI, functionName }).then(
      (v) => v as Address,
      () => null,
    );
  const [t, wt, code, impl] = await Promise.all([
    ask('treasury'),
    ask('weth'),
    client.getCode({ address }),
    client.getStorageAt({ address, slot: EIP1967_IMPLEMENTATION_SLOT }),
  ]);
  return checkCandidate(address, t, wt, code, treasury, weth, impl);
}

/** A wallet's vault in each listed staking contract, read now (CR-50); the page's read does the same inside its multicall. */
export async function readVaults(client: PublicClient, records: StakingRecord[], wallet: Address): Promise<OldVault[]> {
  return Promise.all(
    records.map(async (r) => {
      const [pos, earned] = await Promise.all([
        client.readContract({ address: r.address, abi: STAKING_ABI, functionName: 'positionOf', args: [wallet] }) as Promise<readonly [number, bigint]>,
        client.readContract({ address: r.address, abi: STAKING_ABI, functionName: 'earned', args: [wallet] }) as Promise<bigint>,
      ]);
      return { address: r.address, replacedOn: r.replacedOn, positionOf: { tier: Number(pos[0]) as 0 | Tier, amount: pos[1] }, earned };
    }),
  );
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
 * The ETH a sell of `amountIn` TOWN would receive now, from Uniswap's V4Quoter (CL-41, CR-43): an
 * estimate after the 2% sell fee and the pool fee. The quoter runs the swap through TownHook, so the
 * fee is taken in the currency of the day (CR-56, CR-57): in TOWN mode 2% of the TOWN sold is burned
 * before the swap; in ETH mode 2% of the ETH the swap pays out goes to the Treasury, and the estimate
 * is the remaining 98%. A sell carries no `hookData`.
 */
export async function quoteSell(client: PublicClient, n: Network, amountIn: bigint): Promise<bigint> {
  const { result } = await client.simulateContract({
    address: n.uniswap!.v4Quoter,
    abi: QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [{ poolKey: poolKey(n), zeroForOne: false, exactAmount: amountIn, hookData: '0x' }],
  });
  return (result as readonly [bigint, bigint])[0];
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
