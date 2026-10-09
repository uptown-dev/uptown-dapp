// Figures the site works out from contract views. Every input is a field of ChainState or
// WalletState (read by src/lib/reads.ts); nothing here invents a number.
import type { ChainState, Tier, WalletState } from '../data/types';

const BPS = 10_000n;

// --- time ---------------------------------------------------------------------------------

/** The emission epoch (0 to 6) for a cycle: 100-cycle epochs, the last cap from cycle 600 on. */
export function epochIndex(cycle: number): number {
  return Math.min(6, Math.floor(cycle / 100));
}

/** Seconds left in the anti-snipe window, 0 once it has ended. */
export function antiSnipeSecondsLeft(chain: ChainState): number {
  const end = chain.hook.launchTime + chain.hook.ANTI_SNIPE_DURATION;
  return Math.max(0, end - chain.blockTimestamp);
}

/** True while TownHook.currentBuyFeeBps() is above the ordinary 2%. */
export function antiSnipeActive(chain: ChainState): boolean {
  return chain.hook.currentBuyFeeBps > chain.hook.BUY_FEE_BPS;
}

/** The start time of a cycle. */
export function cycleStartTime(chain: ChainState, cycle: number): number {
  return chain.hook.launchTime + cycle * 86_400;
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

// --- burning ---------------------------------------------------------------------------

/** All TOWN destroyed since the mint: sell fees and voluntary burns together. */
export function burned(chain: ChainState): bigint {
  return chain.token.INITIAL_SUPPLY - chain.token.totalSupply;
}

/**
 * The burn floor in TOWN units: TownHook.BURN_FLOOR() when the figures have been read; the spec's
 * 100,000,000 TOWN (CR-55) only where the contracts are not deployed on this network yet.
 */
export function burnFloor(chain: ChainState | null): bigint {
  return chain ? chain.hook.BURN_FLOOR : SPEC_BURN_FLOOR;
}
const SPEC_BURN_FLOOR = 100_000_000n * 10n ** 18n;

/** TOWN left to burn before the burn floor: totalSupply - BURN_FLOOR, never negative. */
export function leftToBurn(chain: ChainState): bigint {
  const { totalSupply } = chain.token;
  const floor = chain.hook.BURN_FLOOR;
  return totalSupply > floor ? totalSupply - floor : 0n;
}

// --- the sell fee's currency (CR-56, CR-57) -------------------------------------------------

/** Why today's sell fee is in the currency it is in. */
export type SellFeeReason =
  /** The supply is at or below the burn floor: every sell pays in ETH (CR-56). */
  | 'floor'
  /** The rebate reserve is spent: the fee is burned until the floor (CR-57). */
  | 'reserve'
  /** Day 0 has no day before it: the fee is burned. */
  | 'first-day'
  /** Yesterday's burn against yesterday's rebate pot: ETH only when the burn was larger. */
  | 'compare';

export interface SellFeeMode {
  /** TownHook.sellFeeInEth(): true for 2% of the ETH a sale brings in, to the Treasury; false for 2% of the TOWN sold, burned. */
  inEth: boolean;
  reason: SellFeeReason;
  /** Yesterday's index; null on day 0. */
  yesterday: number | null;
  /** TownHook.burned(yesterday). */
  burnedYesterday: bigint | null;
  /** BuyerRewards.emissionEstimate(yesterday): yesterday's rebate pot. */
  rebatesYesterday: bigint | null;
}

/**
 * Today's sell-fee currency, from TownHook.sellFeeInEth() (the mode the hook uses, stored at the
 * day's first sell), with the reason the spec's rule gives for it: at or below the floor always ETH;
 * once the reserve is spent always TOWN; day 0 TOWN; otherwise ETH only when yesterday's
 * `burned` was larger than yesterday's `emissionEstimate` (spec "TownHook -> Sell fee currency").
 */
export function sellFeeMode(chain: ChainState): SellFeeMode {
  const c = chain.hook.currentCycle;
  const inEth = chain.hook.sellFeeInEth;
  const yesterday = c >= 1 ? c - 1 : null;
  const burnedYesterday = yesterday !== null ? (chain.hook.burned[yesterday] ?? null) : null;
  const rebatesYesterday = yesterday !== null ? (chain.rewards.emissionEstimate[yesterday] ?? null) : null;
  const atFloor = chain.token.totalSupply <= chain.hook.BURN_FLOOR;
  const reason: SellFeeReason =
    inEth && atFloor ? 'floor' : !inEth && chain.rewards.reserveExhausted ? 'reserve' : yesterday === null ? 'first-day' : 'compare';
  return { inEth, reason, yesterday, burnedYesterday, rebatesYesterday };
}

/**
 * The sell fee of an exact-input sell of `amountIn` TOWN, in TOWN mode: 2% of the TOWN sold, never
 * taking the supply below the burn floor (spec "TownHook -> Fees": `townSpecified * 200 / 10000`,
 * capped by `totalSupply - BURN_FLOOR`).
 */
export function townSellFee(chain: ChainState, amountIn: bigint): bigint {
  const fee = (amountIn * BigInt(chain.hook.currentSellFeeBps)) / BPS;
  const room = leftToBurn(chain);
  return fee < room ? fee : room;
}

/**
 * The sell fee of an exact-input sell in ETH mode, from the ETH the seller receives (the quoter's
 * estimate, which TownHook has already reduced): the fee is `ethSwapped * 200 / 10000` and the
 * seller receives `ethSwapped - fee`, so the fee is about `received * 200 / 9800` (spec "TownHook ->
 * Fees", the ETH-mode exact-input row).
 */
export function ethSellFee(chain: ChainState, received: bigint): bigint {
  const bps = BigInt(chain.hook.currentSellFeeBps);
  return (received * bps) / (BPS - bps);
}

// --- rebates ----------------------------------------------------------------------------

/** TOWN not yet scheduled for any cycle: RESERVE - totalEmitted. */
export function reserveUnscheduled(chain: ChainState): bigint {
  return chain.rewards.RESERVE - chain.rewards.totalEmitted;
}

/** The sum of the caps of the current cycle and the nine after it. */
export function nextTenCaps(chain: ChainState): bigint {
  const c0 = chain.rewards.currentCycle;
  let sum = 0n;
  for (let c = c0; c < c0 + 10; c++) sum += chain.rewards.cap[c] ?? 0n;
  return sum;
}

/** CR-36: true when less than ten days of caps remain in the reserve. */
export function reserveNearlySpent(chain: ChainState): boolean {
  return reserveUnscheduled(chain) < nextTenCaps(chain);
}

/** The spec's rebate rates (CR-47), used only where the contracts are not deployed on this network yet: 5% balanced, 5.25% after only buys, 5.5% after only sells. */
export const SPEC_RATE = { base: 500, buySpan: 25, sellSpan: 50 } as const;

/** The rebate rates in basis points, from BuyerRewards' constants (CR-47): balanced (500), after only buys (525), the highest (550). */
export function rateRange(chain: ChainState | null): { low: number; buyTop: number; high: number } {
  const base = chain ? chain.rewards.RATE_BASE_BPS : SPEC_RATE.base;
  const buy = chain ? chain.rewards.RATE_BUY_SPAN_BPS : SPEC_RATE.buySpan;
  const sell = chain ? chain.rewards.RATE_SELL_SPAN_BPS : SPEC_RATE.sellSpan;
  return { low: base, buyTop: base + buy, high: base + Math.max(buy, sell) };
}

/** A day's rebate rate in basis points, before the claim fee: BuyerRewards.rateBps(c) (CR-47), fixed when the day begins. */
export function dayRateBps(chain: ChainState, cycle: number): number {
  return chain.rewards.rateBps[cycle] ?? chain.rewards.RATE_BASE_BPS;
}

/** A rate after the claim fee: rate x (1 - CLAIM_FEE_BPS / 10000), in basis points with decimals. */
export function afterFeeBps(chain: ChainState | null, rateBps: number): number {
  const fee = chain ? chain.rewards.CLAIM_FEE_BPS : 500;
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
 * was bought and sold in them (TownHook.cycleTotal and sold) and BuyerRewards.lean(today), a
 * number from -1 (only sells) to +1 (only buys).
 */
export function leanToday(chain: ChainState): { days: number[]; bought: bigint; sold: bigint; lean: number } {
  const c = chain.rewards.currentCycle;
  const days = Object.keys(chain.hook.sold)
    .map(Number)
    .filter((d) => d < c)
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

/** The fee-adjusted share: what reaches the buyer of a gross amount (claim fee 5%). */
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

/**
 * TownHook's ETH fees (the buy fees and, on ETH-mode days, the sell fees; CR-56, CR-57) and any other
 * arrivals: totalEthReceived - TownStaking.totalVaultFees (spec "Frontend").
 */
export function hookFeesReceived(chain: ChainState): bigint {
  const r = chain.treasury.totalEthReceived;
  const v = chain.staking.totalVaultFees;
  return r > v ? r - v : 0n;
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

/** True when the Treasury pays a staking contract other than the address file's TownStaking (CR-46). */
export function stakingReplaced(chain: ChainState, townStaking: string | undefined): boolean {
  return !!townStaking && chain.treasury.staking.toLowerCase() !== townStaking.toLowerCase();
}

/** When the Treasury began paying a staking contract, from the network module's hand-kept list (CR-50); null if the list does not say. */
export function stakingPaidSince(records: { address: string; replacedOn: number | null }[], address: string): number | null {
  const i = records.findIndex((r) => r.address.toLowerCase() === address.toLowerCase());
  return i > 0 ? records[i - 1].replacedOn : null;
}

// --- staking -----------------------------------------------------------------------------

/** A tier's share of every payout, in basis points with decimals: 100/750 -> 1333.33. */
export function tierShareBps(chain: ChainState, tier: Tier): number {
  return Math.round((chain.staking.tierWeight[tier] * 1_000_000) / chain.staking.TOTAL_WEIGHT) / 100;
}

/** A tier's multiplier as text: weight 125 -> "1.25x". */
export function tierMultiplier(chain: ChainState, tier: Tier): string {
  return `${chain.staking.tierWeight[tier] / 100}x`;
}

/** True while a tier has no TOWN staked. */
export function tierEmpty(chain: ChainState, tier: Tier): boolean {
  return chain.staking.tierStaked[tier] === 0n;
}

/**
 * The WETH a tier's stream has not yet paid out. While the tier is empty its stream is paused
 * (CL-33): the idle time is added to the stored end, so the remainder is rate * (end - last update).
 */
export function unpaidStream(chain: ChainState, tier: Tier): bigint {
  const s = chain.staking.streamInfo[tier];
  if (s.rewardRate === 0n) return 0n;
  if (tierEmpty(chain, tier)) {
    const left = s.periodFinish - s.lastUpdateTime;
    return left > 0 ? s.rewardRate * BigInt(left) : 0n;
  }
  const left = s.periodFinish - chain.blockTimestamp;
  return left > 0 ? s.rewardRate * BigInt(left) : 0n;
}

/** When a non-empty tier's stream runs dry if no new payout arrives; null while paused or ended. */
export function streamEnd(chain: ChainState, tier: Tier): number | null {
  const s = chain.staking.streamInfo[tier];
  if (s.rewardRate === 0n || tierEmpty(chain, tier)) return null;
  return s.periodFinish > chain.blockTimestamp ? s.periodFinish : null;
}

/** The fallback price stops counting FALLBACK_MAX_AGE after it was set. */
export function fallbackExpiresAt(chain: ChainState): number {
  return chain.staking.fallbackPriceSetAt + chain.staking.FALLBACK_MAX_AGE;
}

// --- liquidity lock ------------------------------------------------------------------

export function daysUntil(chain: ChainState, ts: number): number {
  return Math.max(0, Math.floor((ts - chain.blockTimestamp) / 86_400));
}
