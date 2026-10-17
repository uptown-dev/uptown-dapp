// Every figure the site shows, read from contract views through Multicall3, all at one block
// (spec "Frontend -> Data rule": no event scanning, no indexer, no server). Three short rounds,
// each a single eth_call: the global views, the current day and the staking contract the Treasury
// pays; then the views that depend on those (that contract's figures, the limits, today's rate and
// the days behind it, the wallet's tally per day, the announced staking contract's answers, the
// wallet's stakes in replaced staking contracts); then the views for the wallet's days. The owner
// page's views (CR-64) ride in the same rounds: each owned contract's owner and offered owner in
// round 1, and in round 3 the signers of any owner that is a multisig. Round 1 also reads the pool's
// current price through Uniswap's StateView (CR-95) and Chainlink's ETH/USD feed directly (CR-102),
// for the dollar figures. Before launch (CR-86, F12a) only the owner page's views and the fixed rules
// are read (the constants, the settings, the supply and where it sits): most other views revert with
// NotStarted until then, and those that answer mean nothing yet (the day count, the sell-fee shares,
// the empty reserve), so they are not shown.
//
// CR-102: SkylineStaking (one pool, free staking, no owner) replaced TownStaking (paid staking,
// prices, a fallback price and an owner); LPVault holds a second position, locked 14 days; the
// Launcher's launch buys 0.1 ETH for the owner and funds the second position with 0.03 ETH.
import { createPublicClient, defineChain, encodeAbiParameters, http, keccak256, type Hex, type PublicClient } from 'viem';
import { CANDIDATE_ABI, CHAINLINK_ABI, HOOK_ABI, LAUNCHER_ABI, LPVAULT_ABI, PERMIT2_ABI, QUOTER_ABI, REWARDS_ABI, SAFE_ABI, STAKING_ABI, STATEVIEW_ABI, TOKEN_ABI, TREASURY_ABI } from './abi';
import { type Network, type StakingRecord } from './network';
import type { Address, CandidateCheck, ChainState, CycleInfo, EthUsd, Multisig, OldStake, OwnerState, PrelaunchState, StreamInfo, WalletState } from '../data/types';

const MULTICALL3_ABI = [
  {
    type: 'function',
    name: 'getEthBalance',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

/** 1,000,000,000 SKYLINE: the supply minted once (spec "Fixed parameters"). */
const INITIAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
/** type(uint256).max: Treasury.lastDistributedCycle() before the first distribution (CL-27). */
const MAX_UINT = 2n ** 256n - 1n;
/** The first cycle of each 100-day epoch and of the 25,000 SKYLINE tail (cycle 700), for the schedule (CR-93). */
const EPOCH_FIRSTS = [0, 100, 200, 300, 400, 500, 600, 700];
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
  /** The value, or null where the view reverted (the ETH/USD feed, the pool's price; an announced contract's answers, CR-49). */
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
  /** Deployed, not launched (CR-86): the fixed rules and the supply; `null` once launched. */
  prelaunch: PrelaunchState | null;
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

/**
 * Chainlink's latestRoundData() as the site keeps it (CR-102): the feed, its answer and its time;
 * null when the read failed. Whether the answer may be shown (positive, at most 3 hours old) is
 * decided where the dollar figures are made, `ethUsdPrice` in derive.ts.
 */
export function ethUsdFrom(feed: Address, round: readonly [bigint, bigint, bigint, bigint, bigint] | null): EthUsd | null {
  return round ? { feed, answer: round[1], updatedAt: Number(round[3]) } : null;
}

export async function readAll(client: PublicClient, n: Network, account: Address | null): Promise<ReadResult> {
  const d = n.deployment;
  if (!d || !n.uniswap) throw new Error('not deployed');
  const k = d.contracts;
  const block = await client.getBlock({ blockTag: 'latest' });
  const bn = block.number;

  // Round 1: global views, constants, the current day, the staking contract the Treasury pays, and
  // the wallet's basics.
  const a = new Batch();
  const H = (fn: string, args?: unknown[]) => a.add(`SkylineHook.${fn}`, { address: k.SkylineHook, abi: HOOK_ABI, functionName: fn, args });
  const R = (fn: string, args?: unknown[]) => a.add(`BuyerRewards.${fn}`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: fn, args });
  const T = (fn: string, args?: unknown[]) => a.add(`Treasury.${fn}`, { address: k.Treasury, abi: TREASURY_ABI, functionName: fn, args });
  const V = (fn: string) => a.add(`LPVault.${fn}`, { address: k.LPVault, abi: LPVAULT_ABI, functionName: fn });
  const L = (fn: string) => a.add(`Launcher.${fn}`, { address: k.Launcher, abi: LAUNCHER_ABI, functionName: fn });
  const ethBalance = (who: Address) => a.add(`getEthBalance(${who})`, { address: n.uniswap!.multicall3, abi: MULTICALL3_ABI, functionName: 'getEthBalance', args: [who] });

  const i = {
    totalSupply: a.add('UpTownToken.totalSupply', { address: k.UpTownToken, abi: TOKEN_ABI, functionName: 'totalSupply' }),
    launchTime: H('launchTime'),
    hookCycle: H('currentCycle'),
    buyFee: H('currentBuyFeeBps'),
    sellFee: H('currentSellFeeBps'),
    BUY_FEE_BPS: H('BUY_FEE_BPS'),
    BURN_FLOOR: H('BURN_FLOOR'),
    sellFeeInEth: H('sellFeeInEth'),
    sellFeeShares: H('sellFeeShares'),
    RESERVE_FEE_START: H('RESERVE_FEE_START'),
    reserveExhausted: R('reserveExhausted'),
    available: R('available'),
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
    unlockTime: V('unlockTime'),
    lockDuration: V('lockDuration'),
    SECOND_LOCK: V('SECOND_LOCK'),
    secondTokenId: V('secondTokenId'),
    secondUnlockTime: V('secondUnlockTime'),
    secondWithdrawn: V('secondWithdrawn'),
    LAUNCH_BUY_ETH: L('LAUNCH_BUY_ETH'),
    SECOND_POSITION_ETH: L('SECOND_POSITION_ETH'),
    // CR-95: the pool's current price, for the dollar figures; a failed read only hides the SKYLINE ones.
    slot0: n.uniswap.stateView
      ? a.add('StateView.getSlot0(poolId)', { address: n.uniswap.stateView, abi: STATEVIEW_ABI, functionName: 'getSlot0', args: [poolId(n)] })
      : -1,
    // CR-102: Chainlink's ETH/USD feed, read directly; a failed read hides every dollar figure.
    ethUsd: n.ethUsdFeed ? a.add('Chainlink ETH/USD.latestRoundData', { address: n.ethUsdFeed, abi: CHAINLINK_ABI, functionName: 'latestRoundData' }) : -1,
  };
  // The owner page (CR-64): who owns each contract and who has been offered it; the Launcher before launch.
  const oi = {
    launcherOwner: L('owner'),
    launched: L('launched'),
    treasuryOwner: T('owner'),
    treasuryPending: T('pendingOwner'),
    lpVaultOwner: V('owner'),
    lpVaultPending: V('pendingOwner'),
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
        routerAllowance: a.add('Permit2.allowance(wallet, UpTownToken, router)', {
          address: n.uniswap.permit2,
          abi: PERMIT2_ABI,
          functionName: 'allowance',
          args: [account, k.UpTownToken, n.uniswap.universalRouter],
        }),
      }
    : null;
  const r1 = await a.run(client, n, bn);

  // The staking contract the Treasury pays now (CR-46, CR-50). Every staking figure, the stakes the
  // site offers and their approvals come from this contract, whatever the address file names.
  const stakingAddress = r1.get<Address>(i.staking);
  const launch = { LAUNCH_BUY_ETH: r1.get<bigint>(i.LAUNCH_BUY_ETH), SECOND_POSITION_ETH: r1.get<bigint>(i.SECOND_POSITION_ETH) };
  const owner0 = {
    blockTimestamp: Number(block.timestamp),
    blockNumber: bn,
    launcher: {
      owner: r1.get<Address>(oi.launcherOwner),
      launched: r1.get<boolean>(oi.launched),
      // CR-102: launch() is sent with exactly LAUNCH_BUY_ETH + SECOND_POSITION_ETH (0.13 ETH).
      launchValue: launch.LAUNCH_BUY_ETH + launch.SECOND_POSITION_ETH,
    },
    treasury: { owner: r1.get<Address>(oi.treasuryOwner), pendingOwner: orNull(r1.get<Address>(oi.treasuryPending)) },
    lpVault: {
      owner: r1.get<Address>(oi.lpVaultOwner),
      pendingOwner: orNull(r1.get<Address>(oi.lpVaultPending)),
      tokenId: r1.get<bigint>(oi.tokenId),
      unlockTime: num(r1.get(i.unlockTime)),
      MIN_LOCK_DURATION: num(r1.get(oi.MIN_LOCK_DURATION)),
      secondTokenId: r1.get<bigint>(i.secondTokenId),
      secondUnlockTime: num(r1.get(i.secondUnlockTime)),
      secondWithdrawn: r1.get<boolean>(i.secondWithdrawn),
    },
  };
  // Every owner and offered owner (the Launcher's only before launch), asked in round 3 whether it is a multisig.
  const holders = holdersOf(
    owner0.launcher.launched ? null : owner0.launcher.owner,
    owner0.treasury.owner,
    owner0.treasury.pendingOwner,
    owner0.lpVault.owner,
    owner0.lpVault.pendingOwner,
  );
  const codesOf = (list: Address[]) => Promise.all(list.map((h) => client.getCode({ address: h, blockNumber: bn })));

  if (!owner0.launcher.launched) {
    // Before launch: the owner page's views, so the owner can launch (CR-64), and the fixed rules
    // for every page (CR-86, F12a): the stream length, the daily limits, the Launcher's SKYLINE.
    const b0 = new Batch();
    const pre0 = {
      STREAM_LENGTH: b0.add('SkylineStaking.STREAM_LENGTH', { address: stakingAddress, abi: STAKING_ABI, functionName: 'STREAM_LENGTH' }),
      caps: EPOCH_FIRSTS.map((c) => b0.add(`BuyerRewards.cap(${c})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'cap', args: [BigInt(c)] })),
      launcherBalance: b0.add('UpTownToken.balanceOf(Launcher)', { address: k.UpTownToken, abi: TOKEN_ABI, functionName: 'balanceOf', args: [k.Launcher] }),
    };
    const ms = multisigCalls(b0, holders);
    const [r0, codes] = await Promise.all([b0.run(client, n, bn), codesOf(holders)]);
    const cap0: Record<number, bigint> = {};
    EPOCH_FIRSTS.forEach((c, j) => (cap0[c] = r0.get<bigint>(pre0.caps[j])));
    const prelaunch: PrelaunchState = {
      blockTimestamp: Number(block.timestamp),
      blockNumber: bn,
      launcherBalance: r0.get(pre0.launcherBalance),
      token: { totalSupply: r1.get(i.totalSupply), INITIAL_SUPPLY },
      hook: {
        BUY_FEE_BPS: num(r1.get(i.BUY_FEE_BPS)),
        BURN_FLOOR: r1.get(i.BURN_FLOOR),
        RESERVE_FEE_START: num(r1.get(i.RESERVE_FEE_START)),
      },
      rewards: {
        CLAIM_FEE_BPS: num(r1.get(i.CLAIM_FEE_BPS)),
        RATE_BASE_BPS: num(r1.get(i.RATE_BASE_BPS)),
        RATE_BUY_SPAN_BPS: num(r1.get(i.RATE_BUY_SPAN_BPS)),
        RATE_SELL_SPAN_BPS: num(r1.get(i.RATE_SELL_SPAN_BPS)),
        LEAN_CYCLES: num(r1.get(i.LEAN_CYCLES)),
        cap: cap0,
      },
      treasury: {
        spendBps: num(r1.get(i.spendBps)),
        MAX_SPEND_BPS: num(r1.get(i.MAX_SPEND_BPS)),
        OWNER_ETH_BPS: num(r1.get(i.OWNER_ETH_BPS)),
        MIN_DISTRIBUTION: r1.get(i.MIN_DISTRIBUTION),
        OWNER_DELAY: num(r1.get(i.OWNER_DELAY)),
        APPLY_WINDOW: num(r1.get(i.APPLY_WINDOW)),
        staking: stakingAddress,
      },
      staking: { address: stakingAddress, STREAM_LENGTH: num(r0.get(pre0.STREAM_LENGTH)) },
      lpVault: { lockDuration: num(r1.get(i.lockDuration)), SECOND_LOCK: num(r1.get(i.SECOND_LOCK)) },
      launch,
    };
    return { chain: null, prelaunch, wallet: null, owner: { ...owner0, multisigs: multisigsFrom(r0, ms, codes) } };
  }

  const current = num(r1.get(i.rewardsCycle));
  const pendingRaw = r1.get<Address>(i.pendingStaking);
  const pendingStaking = isZero(pendingRaw) ? null : pendingRaw;
  const LEAN_CYCLES = num(r1.get(i.LEAN_CYCLES));

  // Round 2: the current staking contract's figures and the wallet's stake in it; the limits for
  // today, the next nine days and each epoch's first day; today's total, rate and lean, and the
  // bought and sold totals of the days the lean is measured over (CR-47); the wallet's tally for
  // every day since launch (past days from memory once read); the announced staking contract's
  // answers (CR-49); the wallet's stakes in replaced staking contracts (CR-50).
  const b = new Batch();
  const S = (fn: string, args?: unknown[]) => b.add(`SkylineStaking.${fn}`, { address: stakingAddress, abi: STAKING_ABI, functionName: fn, args });
  const si = {
    STREAM_LENGTH: S('STREAM_LENGTH'),
    streamInfo: S('streamInfo'),
    totalStaked: S('totalStaked'),
    totalRewardsNotified: S('totalRewardsNotified'),
    totalRewardsPaid: S('totalRewardsPaid'),
  };
  const ws = account
    ? {
        allowance: b.add('UpTownToken.allowance(wallet, staking)', { address: k.UpTownToken, abi: TOKEN_ABI, functionName: 'allowance', args: [account, stakingAddress] }),
        stake: S('stakeOf', [account]),
        earned: S('earned', [account]),
      }
    : null;

  const capDays = [...new Set([...Array.from({ length: 10 }, (_, j) => current + j), ...EPOCH_FIRSTS])];
  const capIdx = capDays.map((c) => b.add(`BuyerRewards.cap(${c})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'cap', args: [BigInt(c)] }));
  const todayTotalIdx = b.add(`SkylineHook.cycleTotal(${current})`, { address: k.SkylineHook, abi: HOOK_ABI, functionName: 'cycleTotal', args: [BigInt(current)] });
  // Today's rate and lean (CR-47), and the days they are measured over: c - 1 to c - LEAN_CYCLES.
  const leanDays = Array.from({ length: LEAN_CYCLES }, (_, j) => current - 1 - j).filter((c) => c >= 0);
  const rateIdx = b.add(`BuyerRewards.rateBps(${current})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'rateBps', args: [BigInt(current)] });
  const leanIdx = b.add(`BuyerRewards.lean(${current})`, { address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'lean', args: [BigInt(current)] });
  const leanTotalIdx = leanDays.map((c) => b.add(`SkylineHook.cycleTotal(${c})`, { address: k.SkylineHook, abi: HOOK_ABI, functionName: 'cycleTotal', args: [BigInt(c)] }));
  const leanSoldIdx = leanDays.map((c) => b.add(`SkylineHook.sold(${c})`, { address: k.SkylineHook, abi: HOOK_ABI, functionName: 'sold', args: [BigInt(c)] }));
  // The Stats page's trading volume (CR-61): SKYLINE bought and sold yesterday and today so far.
  // Today's sold total is read here; today's bought total is read above, and yesterday's two figures
  // are the lean's first day (read here only if the lean ever measured no day before today).
  const todaySoldIdx = b.add(`SkylineHook.sold(${current})`, { address: k.SkylineHook, abi: HOOK_ABI, functionName: 'sold', args: [BigInt(current)] });
  const yesterdayIdx =
    current >= 1 && !leanDays.includes(current - 1)
      ? {
          total: b.add(`SkylineHook.cycleTotal(${current - 1})`, { address: k.SkylineHook, abi: HOOK_ABI, functionName: 'cycleTotal', args: [BigInt(current - 1)] }),
          sold: b.add(`SkylineHook.sold(${current - 1})`, { address: k.SkylineHook, abi: HOOK_ABI, functionName: 'sold', args: [BigInt(current - 1)] }),
        }
      : null;
  // The sell fee's currency (CR-57): the SKYLINE burned today and yesterday, and yesterday's rebate
  // pot, the two figures the rule compared to set today's mode.
  const burnDays = [current, current - 1].filter((c) => c >= 0);
  const burnedIdx = burnDays.map((c) => b.add(`SkylineHook.burned(${c})`, { address: k.SkylineHook, abi: HOOK_ABI, functionName: 'burned', args: [BigInt(c)] }));
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
        i: b.add(`SkylineHook.bought(${c}, wallet)`, { address: k.SkylineHook, abi: HOOK_ABI, functionName: 'bought', args: [BigInt(c), account] }),
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
  // The wallet's stakes in the staking contracts the Treasury no longer pays (CR-50), from the
  // network module's hand-kept list.
  const oldIdx = account
    ? n.stakingContracts
        .filter((r) => !same(r.address, stakingAddress))
        .map((r) => ({
          record: r,
          stake: b.add(`staking ${r.address}.stakeOf(wallet)`, { address: r.address, abi: STAKING_ABI, functionName: 'stakeOf', args: [account] }),
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
  const candidate: CandidateCheck | null =
    pendingStaking && candIdx
      ? checkCandidate(pendingStaking, r2.maybe<Address>(candIdx.treasury), r2.maybe<Address>(candIdx.weth), candidateCode, k.Treasury, r1.get<Address>(i.weth), candidateImpl)
      : null;
  const oldStakes: OldStake[] = [];
  for (const o of oldIdx) {
    const stake = r2.maybe<bigint>(o.stake) ?? 0n;
    const earned = r2.maybe<bigint>(o.earned) ?? 0n;
    if (stake > 0n || earned > 0n) oldStakes.push({ address: o.record.address, replacedOn: o.record.replacedOn, stake, earned });
  }

  // Round 3: for each day the wallet bought: claimed, the day's figures, its rate (CR-47), and the
  // claimable total (BuyerRewards.claimable skips days not ready or already claimed, CL-27); the
  // signers of any owner that is a multisig (CR-64).
  const c3 = new Batch();
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
  const [r3, holderCodes] = await Promise.all([c3.run(client, n, bn), codesOf(holders)]);
  const owner: OwnerState = { ...owner0, multisigs: multisigsFrom(r3, msIdx, holderCodes) };

  for (const { c, i: idx } of dayCapIdx) cap[c] = r3.get<bigint>(idx);
  const rateBps: Record<number, number> = { [current]: num(r2.get(rateIdx)) };
  for (const { c, i: idx } of dayRateIdx) rateBps[c] = num(r3.get(idx));
  const cycleInfo: Record<number, CycleInfo> = {};
  days.forEach((c, j) => {
    const [total, emitted, finalized] = r3.get<readonly [bigint, bigint, boolean]>(infoIdx[j]);
    cycleInfo[c] = { total, emitted, finalized };
  });
  const ldc = r1.get<bigint>(i.lastDistributedCycle);
  const shares = r1.get<readonly [bigint, bigint, bigint]>(i.sellFeeShares);
  const s = r2.get<{ rewardRate: bigint; periodFinish: bigint; lastUpdateTime: bigint; rewardPerTokenStored: bigint }>(si.streamInfo);
  const stream: StreamInfo = { rewardRate: s.rewardRate, periodFinish: Number(s.periodFinish), lastUpdateTime: Number(s.lastUpdateTime), rewardPerTokenStored: s.rewardPerTokenStored };

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
      BURN_FLOOR: r1.get(i.BURN_FLOOR),
      cycleTotal: { ...leanTotals, [current]: r2.get<bigint>(todayTotalIdx) },
      sold: { ...leanSold, [current]: r2.get<bigint>(todaySoldIdx) },
      sellFeeInEth: r1.get<boolean>(i.sellFeeInEth),
      sellFeeShares: { burnedBps: Number(shares[0]), reserveBps: Number(shares[1]), ethBps: Number(shares[2]) },
      RESERVE_FEE_START: num(r1.get(i.RESERVE_FEE_START)),
      burned: burnedByDay,
    },
    rewards: {
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
      available: r1.get(i.available),
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
      STREAM_LENGTH: num(r2.get(si.STREAM_LENGTH)),
      streamInfo: stream,
      totalStaked: r2.get(si.totalStaked),
      totalRewardsNotified: r2.get(si.totalRewardsNotified),
      totalRewardsPaid: r2.get(si.totalRewardsPaid),
    },
    lpVault: {
      unlockTime: num(r1.get(i.unlockTime)),
      lockDuration: num(r1.get(i.lockDuration)),
      secondTokenId: owner0.lpVault.secondTokenId,
      secondUnlockTime: owner0.lpVault.secondUnlockTime,
      secondWithdrawn: owner0.lpVault.secondWithdrawn,
      SECOND_LOCK: num(r1.get(i.SECOND_LOCK)),
    },
    launch,
    pool: { sqrtPriceX96: poolPrice(i.slot0 >= 0 ? r1.maybe<readonly [bigint, number, number, number]>(i.slot0) : null) },
    ethUsd: n.ethUsdFeed && i.ethUsd >= 0 ? ethUsdFrom(n.ethUsdFeed, r1.maybe<readonly [bigint, bigint, bigint, bigint, bigint]>(i.ethUsd)) : null,
  };

  let wallet: WalletState | null = null;
  if (account && w && ws) {
    const claimed: Record<number, boolean> = {};
    days.forEach((c, j) => (claimed[c] = r3.get<boolean>(claimedIdx[j])));
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
      stakeOf: r2.get(ws.stake),
      earned: r2.get(ws.earned),
      oldStakes,
    };
  }
  return { chain, prelaunch: null, wallet, owner };
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

/** A wallet's stake in each listed staking contract, read now (CR-50); the page's read does the same inside its multicall. */
export async function readStakes(client: PublicClient, records: StakingRecord[], wallet: Address): Promise<OldStake[]> {
  return Promise.all(
    records.map(async (r) => {
      const [stake, earned] = await Promise.all([
        client.readContract({ address: r.address, abi: STAKING_ABI, functionName: 'stakeOf', args: [wallet] }) as Promise<bigint>,
        client.readContract({ address: r.address, abi: STAKING_ABI, functionName: 'earned', args: [wallet] }) as Promise<bigint>,
      ]);
      return { address: r.address, replacedOn: r.replacedOn, stake, earned };
    }),
  );
}

/** The SKYLINE pool's key (spec "Pool and launch position"): native ETH, SKYLINE, 0.5%, spacing 60, SkylineHook. */
export function poolKey(n: Network) {
  const k = n.deployment!.contracts;
  return { currency0: '0x0000000000000000000000000000000000000000' as Address, currency1: k.UpTownToken, fee: 5000, tickSpacing: 60, hooks: k.SkylineHook };
}

/** The pool's ID: keccak256(abi.encode(PoolKey)), as Uniswap v4's PoolIdLibrary computes it. */
export function poolId(n: Network): Hex {
  const key = poolKey(n);
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}

/** StateView.getSlot0's sqrtPriceX96, or null when the read failed or the pool has no price yet (0). */
function poolPrice(slot0: readonly [bigint, number, number, number] | null): bigint | null {
  return slot0 && slot0[0] > 0n ? slot0[0] : null;
}

/** `hookData` naming the buyer: the address in 32 bytes (spec "Buy tally", attribution rule 1). */
export function buyerHookData(buyer: Address): Hex {
  return encodeAbiParameters([{ type: 'address' }], [buyer]);
}

/**
 * The ETH a sell of `amountIn` SKYLINE would receive now, from Uniswap's V4Quoter (CL-41, CR-43): an
 * estimate after the 2% sell fee and the pool fee. The quoter runs the swap through SkylineHook, so
 * the fee is taken in the currency of the day (CR-56, CR-57): in SKYLINE mode 2% of the SKYLINE sold
 * is burned before the swap; in ETH mode 2% of the ETH the swap pays out goes to the Treasury, and
 * the estimate is the remaining 98%. A sell carries no `hookData`.
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
 * The SKYLINE a buy of `amountIn` wei would receive now, from Uniswap's V4Quoter (CL-41): an
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

// ---------------------------------------------------------------------------------------------
// CR-82: the figures a run of approvals and an action reads again at the moment it sends, each set
// read at one block. Nothing here is shown as a figure; the forms show what readAll read.
// ---------------------------------------------------------------------------------------------

/** What a sale needs, read now: the wallet's SKYLINE, its approval to Permit2, and Permit2's permission for the router. */
export interface SellApprovals {
  blockTimestamp: number;
  balance: bigint;
  /** UpTownToken.allowance(wallet, Permit2). */
  toPermit2: bigint;
  /** Permit2.allowance(wallet, SKYLINE, router): the amount and the second it expires. */
  router: { amount: bigint; expiration: number };
}

export async function readSellApprovals(client: PublicClient, n: Network, account: Address): Promise<SellApprovals> {
  const k = n.deployment!.contracts;
  const block = await client.getBlock();
  const at = { blockNumber: block.number! };
  const [balance, toPermit2, router] = await Promise.all([
    client.readContract({ address: k.UpTownToken, abi: TOKEN_ABI, functionName: 'balanceOf', args: [account], ...at }),
    client.readContract({ address: k.UpTownToken, abi: TOKEN_ABI, functionName: 'allowance', args: [account, n.uniswap!.permit2], ...at }),
    client.readContract({ address: n.uniswap!.permit2, abi: PERMIT2_ABI, functionName: 'allowance', args: [account, k.UpTownToken, n.uniswap!.universalRouter], ...at }),
  ]);
  const [amount, expiration] = router as readonly [bigint, number, number];
  return { blockTimestamp: Number(block.timestamp), balance: balance as bigint, toPermit2: toPermit2 as bigint, router: { amount, expiration: Number(expiration) } };
}

/** What staking needs, read now: the wallet's SKYLINE and its approval to the staking contract. */
export async function readStakeApproval(client: PublicClient, n: Network, staking: Address, account: Address): Promise<{ balance: bigint; allowance: bigint }> {
  const token = n.deployment!.contracts.UpTownToken;
  const block = await client.getBlock();
  const at = { blockNumber: block.number! };
  const [balance, allowance] = await Promise.all([
    client.readContract({ address: token, abi: TOKEN_ABI, functionName: 'balanceOf', args: [account], ...at }),
    client.readContract({ address: token, abi: TOKEN_ABI, functionName: 'allowance', args: [account, staking], ...at }),
  ]);
  return { balance: balance as bigint, allowance: allowance as bigint };
}

/** The wallet's SKYLINE, read now (the quick-amount buttons, CR-82). */
export async function readTownBalance(client: PublicClient, n: Network, account: Address): Promise<bigint> {
  return (await client.readContract({ address: n.deployment!.contracts.UpTownToken, abi: TOKEN_ABI, functionName: 'balanceOf', args: [account] })) as bigint;
}
