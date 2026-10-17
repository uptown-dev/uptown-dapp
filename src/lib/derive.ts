// Figures the site works out from contract views. Every input is a field of ChainState or
// WalletState (read by src/lib/reads.ts); nothing here invents a number.
import type { ChainState, FixedRules, SellFeeShares, WalletState } from '../data/types';

const BPS = 10_000n;

// --- time ---------------------------------------------------------------------------------

/**
 * The row of the daily-limit schedule a cycle is in (0 to 7): seven 100-cycle epochs, whose limit
 * halves each time (2,500,000 down to 39,062.5 SKYLINE for cycles 600 to 699), then the 25,000 SKYLINE
 * tail from cycle 700 on (spec "Emission schedule", CR-93 amended 2026-10-14).
 */
export function epochIndex(cycle: number): number {
  return Math.min(7, Math.floor(cycle / 100));
}

/** One day in seconds: the contracts' cycle length (86,400). */
export const DAY = 86_400;

/**
 * When the next day begins, in seconds: the next midnight UTC as the contracts define it,
 * `(launchTime / 86400 + currentCycle + 1) × 86400` (spec "Ground rules -> Shared clock", CR-94: cycle
 * `c = timestamp / 86400 - launchTime / 86400`, so cycle c ends at that midnight). The header's
 * countdown and the Stats page's "keep counting until" both use it.
 */
export function nextDayStart(launchTime: number, cycle: number): number {
  return (Math.floor(launchTime / DAY) + cycle + 1) * DAY;
}

/** When a day began: the launch moment for the launch day (cycle 0), else midnight UTC (CR-94). */
export function dayStartTime(launchTime: number, cycle: number): number {
  return cycle === 0 ? launchTime : (Math.floor(launchTime / DAY) + cycle) * DAY;
}

/**
 * The page's "now" for the header countdown (CR-95 item 1), in whole seconds: the RPC's latest block
 * time, the clock the rest of the site uses, stepped forward by the seconds since it was read. A new
 * read never moves it backwards by a few seconds (a block's time lags the moment it is read by up to
 * a block's interval, so restarting from each block would make the countdown jump back on every
 * read): the clock keeps the later of the new block's time and its own stepped time, unless the two
 * are more than a minute apart, when it takes the block's time (a tab woken from sleep, a local chain
 * whose clock was moved).
 */
export interface ChainClock {
  /** The chain time, in seconds, at `atMs`. */
  ts: number;
  /** The visitor's clock, in milliseconds, when `ts` was taken. */
  atMs: number;
}

/** The clock's time at the visitor's moment `nowMs`. */
export function clockNow(clock: ChainClock, nowMs: number): number {
  return Math.floor(clock.ts + Math.max(0, (nowMs - clock.atMs) / 1000));
}

/** The clock after a new read of a block with time `blockTs` made at `readAtMs`. */
export function stepClock(prev: ChainClock | null, blockTs: number, readAtMs: number): ChainClock {
  if (!prev) return { ts: blockTs, atMs: readAtMs };
  const stepped = prev.ts + (readAtMs - prev.atMs) / 1000;
  if (Math.abs(stepped - blockTs) > 60) return { ts: blockTs, atMs: readAtMs };
  return stepped > blockTs ? { ts: stepped, atMs: readAtMs } : { ts: blockTs, atMs: readAtMs };
}

/**
 * The header's day and countdown (CR-95 item 1): the day the figures were read in (`currentCycle`)
 * and the seconds left until the next day begins, never below 0. At the boundary the countdown rests
 * at 0 until the next read brings the next day, which then counts down from its own midnight.
 */
export function dayCountdown(launchTime: number, cycle: number, now: number): { cycle: number; target: number; left: number } {
  const target = nextDayStart(launchTime, cycle);
  return { cycle, target, left: Math.max(0, target - now) };
}


// --- buying -------------------------------------------------------------------------------

/** The buy fee taken from `amountIn` at `feeBps`: ethSpecified * f / 10000 (spec "Fees"). */
export function buyFee(amountIn: bigint, feeBps: number): bigint {
  return (amountIn * BigInt(feeBps)) / BPS;
}

/** The minimum received for a slippage tolerance in basis points. */
export function minReceived(estimate: bigint, slippageBps: number): bigint {
  return (estimate * (BPS - BigInt(slippageBps))) / BPS;
}

/** A minimum this far below the estimate, or further, is warned about (CR-72): 5%. */
export const MIN_WARN_BPS = 500n;

/**
 * The minimum received against the estimate (CR-72, spec "Frontend -> Trade"): `zero`, refused (a
 * trade with no minimum is unprotected); `farBelow`, more than 5% below the estimate, warned (a bot
 * can take the difference) but allowed; `above`, above the estimate, warned (the trade would almost
 * certainly be cancelled). Without an estimate only `zero` can be told.
 */
export function minCheck(min: bigint | null, estimate: bigint | null): { zero: boolean; farBelow: boolean; above: boolean } {
  const zero = min === 0n;
  if (min === null || estimate === null || zero) return { zero, farBelow: false, above: false };
  return { zero, farBelow: min * BPS < estimate * (BPS - MIN_WARN_BPS), above: min > estimate };
}

// --- freshness -----------------------------------------------------------------------------

/** The network service is called behind when its latest block is older than this (CR-72): 2 minutes. */
export const STALE_AFTER_SECONDS = 120;

/**
 * True when the RPC's latest block (`blockTimestamp`, seconds) is more than 2 minutes older than the
 * visitor's clock (`nowMs`). A block ahead of the clock (the local chain's clock can be moved forward
 * by tests) is never stale.
 */
export function rpcBehind(blockTimestamp: number, nowMs: number): boolean {
  return nowMs / 1000 - blockTimestamp > STALE_AFTER_SECONDS;
}

// --- burning ---------------------------------------------------------------------------

/** All SKYLINE destroyed since the mint: sell fees and voluntary burns together. */
export function burned(chain: ChainState): bigint {
  return chain.token.INITIAL_SUPPLY - chain.token.totalSupply;
}

/**
 * The burn floor in SKYLINE units: SkylineHook.BURN_FLOOR() when the figures have been read; the
 * spec's 200,000,000 SKYLINE (CR-55, CR-102) only where the contracts are not deployed on this
 * network yet.
 */
export function burnFloor(chain: FixedRules | null): bigint {
  return chain ? chain.hook.BURN_FLOOR : SPEC_BURN_FLOOR;
}
const SPEC_BURN_FLOOR = 200_000_000n * 10n ** 18n;

/** SKYLINE left to burn before the burn floor: totalSupply - BURN_FLOOR, never negative. */
export function leftToBurn(chain: ChainState): bigint {
  const { totalSupply } = chain.token;
  const floor = chain.hook.BURN_FLOOR;
  return totalSupply > floor ? totalSupply - floor : 0n;
}

// --- the sell fee (CR-56, CR-57, CR-93) -----------------------------------------------------

/**
 * The four ways the next sell's 2% can divide, from SkylineHook.sellFeeShares() (CR-93; spec "SkylineHook
 * -> Fees"):
 * - `burn` (200, 0, 0): 2% of the SKYLINE sold, burned (SKYLINE mode before day 401);
 * - `burn-reserve` (100, 100, 0): 2% of the SKYLINE sold, half burned and half to the rebate reserve
 *   (SKYLINE mode from day 401, cycle RESERVE_FEE_START = 400);
 * - `eth` (0, 0, 200): 2% of the ETH the sale brings in, to the treasury (ETH mode, CR-57);
 * - `split` (0, 100, 100): at or below the burn floor, 1% of the SKYLINE sold to the rebate reserve and
 *   1% of the ETH to the treasury.
 */
export type SellFeeState = 'burn' | 'burn-reserve' | 'eth' | 'split';

/** The state named by the three figures of SkylineHook.sellFeeShares(). */
export function sellFeeState(s: SellFeeShares): SellFeeState {
  if (s.ethBps > 0) return s.reserveBps > 0 ? 'split' : 'eth';
  return s.reserveBps > 0 ? 'burn-reserve' : 'burn';
}

/** Why today's sell fee is charged the way it is. */
export type SellFeeReason =
  /** The supply is at or below the burn floor: every sell pays 1% in SKYLINE to the reserve and 1% in ETH (CR-93). */
  | 'floor'
  /** Nothing is available in the rebate reserve: the fee is in SKYLINE (CR-57). */
  | 'reserve'
  /** Day 1 has no day before it: the fee is in SKYLINE. */
  | 'first-day'
  /** Yesterday's burn against yesterday's rebate pot: ETH only when the burn was larger. */
  | 'compare';

export interface SellFeeMode {
  /** The state, from SkylineHook.sellFeeShares() (CR-93). */
  state: SellFeeState;
  /** The fee is all in ETH today (state `eth`). */
  inEth: boolean;
  reason: SellFeeReason;
  /** Yesterday's index; null on day 0. */
  yesterday: number | null;
  /** SkylineHook.burned(yesterday). */
  burnedYesterday: bigint | null;
  /** BuyerRewards.emissionEstimate(yesterday): yesterday's rebate pot. */
  rebatesYesterday: bigint | null;
}

/**
 * Today's sell fee, from SkylineHook.sellFeeShares() (the state the next sell is charged in; CR-93),
 * with the reason the spec's rule gives for it: at or below the floor, split; while nothing is
 * available in the reserve, SKYLINE; day 1 SKYLINE; otherwise ETH only when yesterday's `burned` was larger
 * than yesterday's `emissionEstimate` (spec "SkylineHook -> Sell fee currency"). SKYLINE mode burns 2%
 * before day 401 and 1%, with 1% to the reserve, from day 401.
 */
export function sellFeeMode(chain: ChainState): SellFeeMode {
  const c = chain.hook.currentCycle;
  const state = sellFeeState(chain.hook.sellFeeShares);
  const inEth = state === 'eth';
  const yesterday = c >= 1 ? c - 1 : null;
  const burnedYesterday = yesterday !== null ? (chain.hook.burned[yesterday] ?? null) : null;
  const rebatesYesterday = yesterday !== null ? (chain.rewards.emissionEstimate[yesterday] ?? null) : null;
  const reason: SellFeeReason =
    state === 'split' ? 'floor' : !inEth && chain.rewards.reserveExhausted ? 'reserve' : yesterday === null ? 'first-day' : 'compare';
  return { state, inEth, reason, yesterday, burnedYesterday, rebatesYesterday };
}

/** The pool's trading fee in pips: 0.5% (`fee = 5000`, spec "Fixed parameters"). */
export const POOL_FEE_PIPS = 5000n;

/** Where an exact-input sell's fees go, by amount (CR-93; spec "SkylineHook -> Fees"). Every figure is 0 where the state charges nothing. */
export interface SellFees {
  /** The SKYLINE the hook takes before the swap: 2% of the SKYLINE sold in SKYLINE mode, 1% in split mode, 0 in ETH mode. */
  townFee: bigint;
  /** The part of `townFee` burned: all of it before day 401, half from day 401 (rounded down), 0 in split mode; never below the floor. */
  burned: bigint;
  /** The part of `townFee` sent to the rebate reserve: the rest of it. */
  toReserve: bigint;
  /** This sell reaches the burn floor: only `totalSupply - BURN_FLOOR` is burned and the rest of its 2% goes to the reserve. */
  reachesFloor: boolean;
  /** The ETH taken to the treasury, worked back from the ETH the seller receives: 2% in ETH mode, 1% in split mode, else 0; null without an estimate. */
  ethFee: bigint | null;
  /** The pool's 0.5% fee, in SKYLINE, on what the pool swaps (the SKYLINE sold less `townFee`). */
  poolFee: bigint;
}

/**
 * The fees of an exact-input sell of `amountIn` SKYLINE in today's state (spec "SkylineHook -> Fees", the
 * exact-input rows; CR-93), given `received`, the ETH the seller receives by the quoter's estimate.
 * The quoter runs the swap through SkylineHook, so `received` already has every fee off; this only says
 * where the fees go.
 * - SKYLINE modes: `fee = amountIn × 200 / 10000`, taken in full; its burn part is `fee` before day 401
 *   and `fee / 2` from day 401; the hook burns `min(burn part, totalSupply − BURN_FLOOR)` and sends
 *   the rest of `fee` to the reserve (so the sell that reaches the floor pays its whole 2% in SKYLINE).
 * - ETH mode: `ethSwapped × 200 / 10000`; the seller receives `ethSwapped − fee`, so the fee is
 *   `received × 200 / 9800`.
 * - Split mode: `amountIn × 100 / 10000` of SKYLINE to the reserve, and `ethSwapped × 100 / 10000` of ETH,
 *   that is `received × 100 / 9900`.
 */
export function sellFees(chain: ChainState, amountIn: bigint, received: bigint | null): SellFees {
  const s = chain.hook.sellFeeShares;
  const state = sellFeeState(s);
  const total = BigInt(chain.hook.currentSellFeeBps); // 200
  let townFee = 0n;
  let burnedPart = 0n;
  let ethBps = 0n;
  if (state === 'burn' || state === 'burn-reserve') {
    townFee = (amountIn * total) / BPS;
    burnedPart = state === 'burn' ? townFee : townFee / 2n;
  } else if (state === 'split') {
    townFee = (amountIn * BigInt(s.reserveBps)) / BPS;
    ethBps = BigInt(s.ethBps);
  } else {
    ethBps = total;
  }
  const room = leftToBurn(chain);
  const burnedAmt = burnedPart < room ? burnedPart : room;
  return {
    townFee,
    burned: burnedAmt,
    toReserve: townFee - burnedAmt,
    reachesFloor: burnedPart > room,
    ethFee: ethBps === 0n ? 0n : received === null ? null : (received * ethBps) / (BPS - ethBps),
    poolFee: ((amountIn - townFee) * POOL_FEE_PIPS) / 1_000_000n,
  };
}

// --- rebates ----------------------------------------------------------------------------


/** The sum of the caps of the current cycle and the nine after it. */
export function nextTenCaps(chain: ChainState): bigint {
  const c0 = chain.rewards.currentCycle;
  let sum = 0n;
  for (let c = c0; c < c0 + 10; c++) sum += chain.rewards.cap[c] ?? 0n;
  return sum;
}

/**
 * CR-36, CR-93: true when less than ten days of caps are available in the reserve
 * (BuyerRewards.available()), but some SKYLINE is; an empty reserve has its own notice.
 */
export function reserveNearlySpent(chain: ChainState): boolean {
  const a = chain.rewards.available;
  return a > 0n && a < nextTenCaps(chain);
}

/**
 * The cycle from which a SKYLINE-mode sell sends half its fee to the reserve: SkylineHook.RESERVE_FEE_START()
 * when the figures have been read; the spec's 400 (day 401; CR-93) only where the contracts are not
 * deployed on this network yet.
 */
export function reserveFeeStart(chain: FixedRules | null): number {
  return chain ? chain.hook.RESERVE_FEE_START : SPEC_RESERVE_FEE_START;
}
const SPEC_RESERVE_FEE_START = 400;

/** CR-93: nothing is available in the reserve (BuyerRewards.available() is 0): rebates pause until SKYLINE arrives. */
export function reserveEmpty(chain: ChainState): boolean {
  return chain.rewards.available === 0n;
}

/** The 500,000,000 SKYLINE the Launcher funds the reserve with at launch (spec "Fixed parameters"): the schedule's shares are of this figure (CR-93). */
export const LAUNCH_FUNDING = 500_000_000n * 10n ** 18n;

/** The spec's rebate rates (CR-47), used only where the contracts are not deployed on this network yet: 5% balanced, 5.25% after only buys, 5.5% after only sells. */
export const SPEC_RATE = { base: 500, buySpan: 25, sellSpan: 50 } as const;

/** The rebate rates in basis points, from BuyerRewards' constants (CR-47): balanced (500), after only buys (525), the highest (550). */
export function rateRange(chain: FixedRules | null): { low: number; buyTop: number; high: number } {
  const base = chain ? chain.rewards.RATE_BASE_BPS : SPEC_RATE.base;
  const buy = chain ? chain.rewards.RATE_BUY_SPAN_BPS : SPEC_RATE.buySpan;
  const sell = chain ? chain.rewards.RATE_SELL_SPAN_BPS : SPEC_RATE.sellSpan;
  return { low: base, buyTop: base + buy, high: base + Math.max(buy, sell) };
}

/** A day's rebate rate in basis points, before the claim fee: BuyerRewards.rateBps(c) (CR-47), fixed when the day begins. */
export function dayRateBps(chain: ChainState, cycle: number): number {
  return chain.rewards.rateBps[cycle] ?? chain.rewards.RATE_BASE_BPS;
}

/** The spec's claim fee (CR-60: 2%), used only where the contracts are not deployed on this network yet. */
export const SPEC_CLAIM_FEE_BPS = 200;

/** The claim fee in basis points: BuyerRewards.CLAIM_FEE_BPS(), or the spec's figure before deployment. */
export function claimFeeBps(chain: FixedRules | null): number {
  return chain ? chain.rewards.CLAIM_FEE_BPS : SPEC_CLAIM_FEE_BPS;
}

/** A rate after the claim fee: rate x (1 - CLAIM_FEE_BPS / 10000), in basis points with decimals. */
export function afterFeeBps(chain: FixedRules | null, rateBps: number): number {
  const fee = claimFeeBps(chain);
  return (rateBps * (10_000 - fee)) / 10_000;
}

/**
 * The rate a day is paying so far, before the claim fee, in basis points (may carry decimals): the
 * day's rate while that share of the day's buying stays under its limit, else limit / total.
 */
export function effectiveRateBps(chain: ChainState, cycle: number): number {
  const rate = dayRateBps(chain, cycle);
  const total = chain.hook.cycleTotal[cycle] ?? 0n;
  const cap = chain.rewards.cap[cycle] ?? 0n;
  if (total === 0n) return rate;
  const capped = (cap * BPS * 100n) / total; // hundredths of a basis point
  return capped < BigInt(rate) * 100n ? Number(capped) / 100 : rate;
}

/** True when the day's buying times its rate has passed the day's limit, so the limit is shared. */
export function limitReached(chain: ChainState, cycle: number): boolean {
  return effectiveRateBps(chain, cycle) < dayRateBps(chain, cycle);
}

/**
 * The days today's rate was set from (CR-47): the previous LEAN_CYCLES days that exist, with what
 * was bought and sold in them (SkylineHook.cycleTotal and sold) and BuyerRewards.lean(today), a
 * number from -1 (only sells) to +1 (only buys).
 */
export function leanToday(chain: ChainState): { days: number[]; bought: bigint; sold: bigint; lean: number } {
  const c = chain.rewards.currentCycle;
  const days = Object.keys(chain.hook.sold)
    .map(Number)
    .filter((d) => d < c && d >= c - chain.rewards.LEAN_CYCLES) // `sold` also holds today's figure (CR-61)
    .sort((x, y) => x - y);
  let bought = 0n;
  let sold = 0n;
  for (const d of days) {
    bought += chain.hook.cycleTotal[d] ?? 0n;
    sold += chain.hook.sold[d] ?? 0n;
  }
  const raw = chain.rewards.lean[c] ?? 0n;
  return { days, bought, sold, lean: Number(raw) / 1e18 };
}

/** The fee-adjusted share: what reaches the buyer of a gross amount (less CLAIM_FEE_BPS, 2% since CR-60). */
export function afterClaimFee(chain: ChainState, gross: bigint): bigint {
  return gross - (gross * BigInt(chain.rewards.CLAIM_FEE_BPS)) / BPS;
}

export type CycleStatus = 'claimed' | 'ready' | 'waiting';

/** Day c can be claimed from the start of day c + 1 (spec "Fixed parameters", Claim opens; CR-44). */
export const CLAIM_DELAY_DAYS = 1;

/** The day from which a day's rebate can be claimed: c + 1 (CR-44). */
export function claimOpensOn(cycle: number): number {
  return cycle + CLAIM_DELAY_DAYS;
}

export function cycleStatus(chain: ChainState, wallet: WalletState, cycle: number): CycleStatus {
  if (wallet.claimed[cycle]) return 'claimed';
  return claimOpensOn(cycle) <= chain.rewards.currentCycle ? 'ready' : 'waiting';
}

/**
 * The wallet's estimated rebate for one cycle, gross (before the claim fee). For a finalised
 * cycle it is exact: bought x emitted / cycleTotal. Otherwise it uses the day's pot as finalising
 * would set it, min(cap, total x rateBps(c) / 10000), and is an estimate while the day runs.
 */
export function cycleRebateGross(chain: ChainState, wallet: WalletState, cycle: number): bigint {
  const mine = wallet.bought[cycle] ?? 0n;
  const info = chain.rewards.cycleInfo[cycle];
  const total = info?.total ?? chain.hook.cycleTotal[cycle] ?? 0n;
  if (total === 0n || mine === 0n) return 0n;
  if (info?.finalized) return (mine * info.emitted) / total;
  const cap = chain.rewards.cap[cycle] ?? 0n;
  const atRate = (total * BigInt(dayRateBps(chain, cycle))) / BPS;
  const pot = atRate < cap ? atRate : cap;
  return (mine * pot) / total;
}

/** The wallet's cycles with a non-zero tally, oldest first. */
export function walletCycles(wallet: WalletState): number[] {
  return Object.keys(wallet.bought)
    .map(Number)
    .filter((c) => (wallet.bought[c] ?? 0n) > 0n)
    .sort((a, b) => a - b);
}

/** The cycles a claim includes: ready and unclaimed, oldest first (CR-36). */
export function readyCycles(chain: ChainState, wallet: WalletState): number[] {
  return walletCycles(wallet).filter((c) => cycleStatus(chain, wallet, c) === 'ready');
}

// --- treasury --------------------------------------------------------------------------

/** The ETH that feeds the stakers' payouts: the Treasury balance less the owner reserve. */
export function forStakers(chain: ChainState): bigint {
  const { balance, ownerEthAvailable } = chain.treasury;
  return balance > ownerEthAvailable ? balance - ownerEthAvailable : 0n;
}

export type BudgetState =
  | { kind: 'paused' }
  | { kind: 'paid'; amount: bigint }
  | { kind: 'below-minimum'; amount: bigint }
  | { kind: 'waiting'; estimate: bigint };

/** What has happened to this day's payout so far. */
export function budgetState(chain: ChainState): BudgetState {
  const t = chain.treasury;
  // While paused, poke() does nothing and nextDistributionTime() is 0 (CR-46).
  if (t.paused) return { kind: 'paused' };
  if (t.lastDistributedCycle === t.currentCycle) return { kind: 'paid', amount: t.budget };
  if (t.nextDistributionTime > chain.blockTimestamp) return { kind: 'below-minimum', amount: t.budget };
  return { kind: 'waiting', estimate: (forStakers(chain) * BigInt(t.spendBps)) / BPS };
}

/** A pause announced and not yet in effect (CR-46): its start time, else null. */
export function pausePending(chain: ChainState): number | null {
  const at = chain.treasury.pauseEffectiveAt;
  return !chain.treasury.paused && at > chain.blockTimestamp ? at : null;
}

/**
 * Where an announced staking replacement stands (CR-46, CR-48): waiting for its 2-day delay; open,
 * when anyone can apply it, from `from` up to and including `until`; or expired, more than
 * APPLY_WINDOW after it became due, when only a new announcement or a cancellation can follow.
 */
export type StakingChange = { phase: 'waiting' | 'open' | 'expired'; from: number; until: number };

export function stakingChange(chain: ChainState): StakingChange | null {
  const t = chain.treasury;
  if (t.pendingStaking === null) return null;
  const from = t.stakingEffectiveAt;
  const until = from + t.APPLY_WINDOW;
  const now = chain.blockTimestamp;
  return { phase: now < from ? 'waiting' : now <= until ? 'open' : 'expired', from, until };
}

/** True when the Treasury pays a staking contract other than the address file's SkylineStaking (CR-46). */
export function stakingReplaced(chain: ChainState, skylineStaking: string | undefined): boolean {
  return !!skylineStaking && chain.treasury.staking.toLowerCase() !== skylineStaking.toLowerCase();
}

/** When the Treasury began paying a staking contract, from the network module's hand-kept list (CR-50); null if the list does not say. */
export function stakingPaidSince(records: { address: string; replacedOn: number | null }[], address: string): number | null {
  const i = records.findIndex((r) => r.address.toLowerCase() === address.toLowerCase());
  return i > 0 ? records[i - 1].replacedOn : null;
}

// --- staking (SkylineStaking, CR-102 amended) -------------------------------------------------

/** True while nothing is staked: the stream is paused (CL-33). */
export function poolEmpty(chain: ChainState): boolean {
  return chain.staking.totalStaked === 0n;
}

/**
 * The WETH the stream has not yet paid out. While nothing is staked the stream is paused (CL-33):
 * the idle time is added to the stored end at the next update, so the remainder is
 * rate * (end - last update); otherwise rate * (end - now).
 */
export function unpaidStream(chain: ChainState): bigint {
  const s = chain.staking.streamInfo;
  if (s.rewardRate === 0n) return 0n;
  const left = poolEmpty(chain) ? s.periodFinish - s.lastUpdateTime : s.periodFinish - chain.blockTimestamp;
  return left > 0 ? s.rewardRate * BigInt(left) : 0n;
}

/** When the running stream ends if no new payout arrives; null while paused (nothing staked), or with no stream running. */
export function streamEnd(chain: ChainState): number | null {
  const s = chain.staking.streamInfo;
  if (s.rewardRate === 0n || poolEmpty(chain)) return null;
  return s.periodFinish > chain.blockTimestamp ? s.periodFinish : null;
}

/** The WETH streamed per day at the current rate, while the stream runs (rate × 86,400); 0 when none runs. */
export function streamPerDay(chain: ChainState): bigint {
  return streamEnd(chain) !== null ? chain.staking.streamInfo.rewardRate * BigInt(DAY) : 0n;
}

/**
 * A wallet's share of the pool, in basis points with decimals: its stake over the total staked
 * (rewards follow the SKYLINE each address has staked, one pool; CR-102 amended). 0 with nothing staked.
 */
export function stakeShareBps(chain: ChainState, stake: bigint): number {
  const total = chain.staking.totalStaked;
  if (total === 0n || stake === 0n) return 0;
  return Number((stake * 1_000_000n) / total) / 100;
}

// --- liquidity locks (CR-102: two positions) ------------------------------------------------

export function daysUntil(chain: ChainState, ts: number): number {
  return Math.max(0, Math.floor((ts - chain.blockTimestamp) / 86_400));
}

/**
 * The second position (CR-102): `locked` until its 14 days have passed, then `withdrawable` by the
 * owner, or `withdrawn` once the owner has taken it out of LPVault.
 */
export type SecondPositionState = 'locked' | 'withdrawable' | 'withdrawn';

export function secondPositionState(v: { secondUnlockTime: number; secondWithdrawn: boolean }, now: number): SecondPositionState {
  if (v.secondWithdrawn) return 'withdrawn';
  return now < v.secondUnlockTime ? 'locked' : 'withdrawable';
}

// --- dollar figures (CR-95, CR-102) ----------------------------------------------------------

/** The units a dollar figure is shown beside. */
export type Priced = 'ETH' | 'WETH' | 'SKYLINE';

/** 2^192: (sqrtPriceX96)^2 / 2^192 is the pool's price in SKYLINE units per wei. */
const Q192 = 1n << 192n;
/** Chainlink's ETH/USD answer has 8 decimals (spec "Frontend -> Dollar figures"). */
const E8 = 10n ** 8n;
/** One SKYLINE in its smallest units. */
export const ONE_SKYLINE = 10n ** 18n;
/** The dollar figures are hidden when the feed's answer is older than this (spec "Frontend -> Dollar figures"): 3 hours. */
export const ETH_USD_MAX_AGE = 3 * 60 * 60;

/**
 * Whether the Chainlink ETH/USD answer may be shown (CR-102, spec "Frontend -> Dollar figures"):
 * `ok` with the price, or why not: `missing` (no feed on this network, or the read failed),
 * `not-positive` (an answer of 0 or below) or `stale` (updated more than 3 hours before the block
 * the figures were read at). The age is measured against the chain's own clock, so a page left
 * open does not age its figures by the visitor's clock.
 */
export type EthUsdPrice = { ok: true; price: bigint; updatedAt: number } | { ok: false; reason: 'missing' | 'not-positive' | 'stale'; updatedAt: number | null };

export function ethUsdPrice(chain: Pick<ChainState, 'ethUsd' | 'blockTimestamp'> | null): EthUsdPrice {
  const f = chain?.ethUsd ?? null;
  if (!chain || !f) return { ok: false, reason: 'missing', updatedAt: null };
  if (f.answer <= 0n) return { ok: false, reason: 'not-positive', updatedAt: f.updatedAt };
  if (chain.blockTimestamp - f.updatedAt > ETH_USD_MAX_AGE) return { ok: false, reason: 'stale', updatedAt: f.updatedAt };
  return { ok: true, price: f.answer, updatedAt: f.updatedAt };
}

/** A dollar estimate: dollars with 18 decimals, and the ETH price behind it (8 decimals). */
export interface UsdFigure {
  /** Dollars × 10^18, rounded down. */
  usd: bigint;
  /** Chainlink's ETH/USD answer it was made with. */
  price: bigint;
}

/**
 * The dollar estimate of an ETH, WETH or SKYLINE amount (CR-95, CR-102, spec "Frontend -> Dollar
 * figures"), in integer arithmetic; null when it cannot be given, and then the site shows none.
 *
 * - ETH/USD is Chainlink's ETH/USD feed, `latestRoundData()`, read directly (8 decimals). No answer,
 *   an answer that is not positive, or one more than 3 hours old: null (hidden, never shown stale).
 * - ETH and WETH: `amount (wei) × price / 10^8` gives dollars × 10^18.
 * - SKYLINE: the pool's price from StateView.getSlot0(poolId).sqrtPriceX96 is SKYLINE per ETH (spec
 *   "Pool and launch position -> Price direction": currency0 is ETH, currency1 is SKYLINE), so an
 *   amount of SKYLINE is worth `amount × 2^192 / sqrtPriceX96^2` wei; times the ETH price, in one
 *   division so nothing is lost: `amount × 2^192 × price / (sqrtPriceX96^2 × 10^8)`. No pool price: null.
 *
 * Estimates for reading only: nothing the site sends is ever computed from one.
 */
export function usdOf(chain: ChainState | null, amount: bigint, unit: Priced): UsdFigure | null {
  const p = ethUsdPrice(chain);
  if (!chain || !p.ok) return null;
  const price = p.price;
  if (unit !== 'SKYLINE') return { usd: (amount * price) / E8, price };
  const sp = chain.pool.sqrtPriceX96;
  if (sp === null || sp <= 0n) return null;
  return { usd: (amount * Q192 * price) / (sp * sp * E8), price };
}

/** The pool's price of one SKYLINE in wei (rounded down), from the same sqrtPriceX96; null without one. Shown on Trade as gwei per SKYLINE. */
export function skylinePriceWei(chain: ChainState): bigint | null {
  const sp = chain.pool.sqrtPriceX96;
  if (sp === null || sp <= 0n) return null;
  return (ONE_SKYLINE * Q192) / (sp * sp);
}
