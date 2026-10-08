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

/** TOWN left to burn before the burn floor: totalSupply - BURN_FLOOR, never negative. */
export function leftToBurn(chain: ChainState): bigint {
  const { totalSupply } = chain.token;
  const floor = chain.hook.BURN_FLOOR;
  return totalSupply > floor ? totalSupply - floor : 0n;
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

/**
 * The rebate rate a cycle is heading for, before the claim fee, in basis points (may carry
 * decimals): 5% while 5% of the cycle's total stays under its cap, else cap / total.
 */
export function rebateRateBps(chain: ChainState, cycle: number): number {
  const total = chain.hook.cycleTotal[cycle] ?? 0n;
  const cap = chain.rewards.cap[cycle] ?? 0n;
  if (total === 0n) return 500;
  const capped = (cap * BPS * 100n) / total; // hundredths of a basis point
  const bps = capped < 50_000n ? Number(capped) / 100 : 500;
  return bps;
}

/** The fee-adjusted share: what reaches the buyer of a gross amount (claim fee 5%). */
export function afterClaimFee(chain: ChainState, gross: bigint): bigint {
  return gross - (gross * BigInt(chain.rewards.CLAIM_FEE_BPS)) / BPS;
}

export type CycleStatus = 'claimed' | 'ready' | 'waiting';

export function cycleStatus(wallet: WalletState, cycle: number, current: number): CycleStatus {
  if (wallet.claimed[cycle]) return 'claimed';
  return cycle + 2 <= current ? 'ready' : 'waiting';
}

/**
 * The wallet's estimated rebate for one cycle, gross (before the claim fee). For a finalised
 * cycle it is exact; otherwise it uses min(cap, 5% of the total so far) and is an estimate.
 */
export function cycleRebateGross(chain: ChainState, wallet: WalletState, cycle: number): bigint {
  const mine = wallet.bought[cycle] ?? 0n;
  const info = chain.rewards.cycleInfo[cycle];
  const total = info?.total ?? chain.hook.cycleTotal[cycle] ?? 0n;
  if (total === 0n || mine === 0n) return 0n;
  if (info?.finalized) return (mine * info.emitted) / total;
  const cap = chain.rewards.cap[cycle] ?? 0n;
  const fivePct = (total * 5n) / 100n;
  const pot = fivePct < cap ? fivePct : cap;
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
  const current = chain.rewards.currentCycle;
  return walletCycles(wallet).filter((c) => cycleStatus(wallet, c, current) === 'ready');
}

// --- treasury --------------------------------------------------------------------------

/** The ETH that feeds the stakers' payouts: the Treasury balance less the owner reserve. */
export function forStakers(chain: ChainState): bigint {
  const { balance, ownerEthAvailable } = chain.treasury;
  return balance > ownerEthAvailable ? balance - ownerEthAvailable : 0n;
}

/** Hook fees (buy fees) and any other arrivals: totalEthReceived - TownStaking.totalVaultFees (spec "Frontend"). */
export function hookFeesReceived(chain: ChainState): bigint {
  const r = chain.treasury.totalEthReceived;
  const v = chain.staking.totalVaultFees;
  return r > v ? r - v : 0n;
}

export type BudgetState =
  | { kind: 'paid'; amount: bigint }
  | { kind: 'below-minimum'; amount: bigint }
  | { kind: 'waiting'; estimate: bigint };

/** What has happened to this day's payout so far. */
export function budgetState(chain: ChainState): BudgetState {
  const t = chain.treasury;
  if (t.lastDistributedCycle === t.currentCycle) return { kind: 'paid', amount: t.budget };
  if (t.nextDistributionTime > chain.blockTimestamp) return { kind: 'below-minimum', amount: t.budget };
  return { kind: 'waiting', estimate: (forStakers(chain) * BigInt(t.spendBps)) / BPS };
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
