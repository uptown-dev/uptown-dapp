// THE PLACEHOLDER DATA MODULE: the only place the site's numbers come from in phase one.
//
// Every scenario below is a complete `ChainState` plus `WalletState` (see `types.ts`, where each
// field names the contract view it mirrors). The figures are samples, chosen to be consistent
// with the spec: tier shares 100/125/150/175/200 of 750, the 5% claim fee, the 10% owner
// reserve, the emission caps, the vault price formula, the running totals adding up
// (Treasury.totalDistributed = TownStaking.totalRewardsNotified, and so on).
//
// Phase two (F8b) replaces this module with one that reads the same shape from the chain and
// sets SAMPLE_FIGURES to false, which removes every "sample figures" badge and the scenario bar.

import { parseUnits } from 'viem';
import {
  PriceSource,
  TIERS,
  type Address,
  type ChainState,
  type CycleInfo,
  type PerTier,
  type Scenario,
  type StreamInfo,
  type Tier,
  type WalletState,
} from './types';

/** True while the site shows placeholder figures. Phase two sets it to false. */
export const SAMPLE_FIGURES = true;

// ---------------------------------------------------------------------------------------------
// Constants, as the contracts define them (spec "Fixed parameters").
// ---------------------------------------------------------------------------------------------

const DAY = 86_400;
const T = (n: string | number) => parseUnits(String(n), 18); // TOWN, 18 decimals
const E = (n: string | number) => parseUnits(String(n), 18); // ETH or WETH, 18 decimals
const USD8 = (n: string | number) => parseUnits(String(n), 8); // Chainlink answer, 8 decimals

const TIER_USD: PerTier<number> = { 1: 5, 2: 10, 3: 20, 4: 30, 5: 50 };
const TIER_WEIGHT: PerTier<number> = { 1: 100, 2: 125, 3: 150, 4: 175, 5: 200 };
const TOTAL_WEIGHT = 750;
const STREAM_LENGTH = 7 * DAY;
const RESERVE = T('500000000');
const INITIAL_SUPPLY = T('1000000000');
const BURN_FLOOR = T('1000000');
const CLAIM_FEE_BPS = 500;
const OWNER_ETH_BPS = 1000;

/** A sample launch moment for the preview only. The real launch date is the owner's decision. */
const SAMPLE_LAUNCH_TIME = Date.UTC(2026, 10, 16, 15, 0, 0) / 1000;

/** Mirrors BuyerRewards.cap(c) for the sample data (spec "Emission schedule"). */
function capOf(c: number): bigint {
  const epoch = Math.floor(c / 100);
  return epoch <= 5 ? T('2500000') >> BigInt(epoch) : T('78125');
}

/** Mirrors TownStaking.notifyReward's split: by weight, the rounding remainder to tier 5. */
function splitByWeight(amount: bigint): PerTier<bigint> {
  const out = {} as PerTier<bigint>;
  let given = 0n;
  for (const t of [1, 2, 3, 4] as Tier[]) {
    out[t] = (amount * BigInt(TIER_WEIGHT[t])) / BigInt(TOTAL_WEIGHT);
    given += out[t];
  }
  out[5] = amount - given;
  return out;
}

/** Mirrors TownStaking.vaultPriceWei: usd * 10^26 / price, rounded down. */
function priceWei(usd: number, price: bigint): bigint {
  return (BigInt(usd) * 10n ** 26n) / price;
}

function perTier<V>(f: (t: Tier) => V): PerTier<V> {
  const out = {} as PerTier<V>;
  for (const t of TIERS) out[t] = f(t);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The scenario builder: a few knobs in, one consistent ChainState and WalletState out.
// ---------------------------------------------------------------------------------------------

interface Knobs {
  cycle: number;
  secondsIntoCycle: number;
  buyFeeBps?: number;
  burned: string;
  /** TownHook.cycleTotal for the current cycle and for every cycle the wallet bought in. */
  cycleTotal: Record<number, string>;
  /** Cycles finalised so far, among those listed in cycleTotal. */
  finalized: number[];
  rewards: { totalEmitted: string; totalClaimedGross: string };
  treasury: {
    totalEthReceived: string;
    /** ETH that arrived since the last sync (counted by ownerEthAvailable, not totalEthReceived). */
    unsynced?: string;
    totalDistributed: string;
    totalOwnerEthWithdrawn: string;
    totalTownWithdrawn: string;
    spendBps?: number;
    /** Did a poke in the current cycle set its budget? */
    rolled: boolean;
    /** The budget of the most recent roll. */
    budget: string;
    /** Was this cycle's budget distributed (budget >= 0.001 ETH)? */
    distributedThisCycle: boolean;
    /** The last distributed cycle when it is not the current one; null for never. */
    previousDistributedCycle: number | null;
  };
  staking: {
    tierStaked: PerTier<string>;
    tierVaults: PerTier<number>;
    totalRewardsPaid: string;
    /** WETH still to stream, per tier (for an empty tier: its pile at the door). */
    unpaid: PerTier<string>;
    totalVaultFees: string;
    /** Seconds after its cycle's start at which the most recent payout arrived. */
    payoutOffset: number;
    /** The cycle of the most recent payout; defaults to the current cycle. */
    payoutCycle?: number;
    price:
      | { source: PriceSource.Feed; usd: string; ageSeconds: number }
      | { source: PriceSource.Fallback; usd: string; ageSeconds: number }
      | { source: PriceSource.None };
    pendingFeed?: { address: Address; effectiveIn: number };
  };
  quote: { amountIn: string; amountOut: string };
  wallet: {
    ethBalance: string;
    townBalance: string;
    bought: Record<number, string>;
    claimed: number[];
    position: { tier: 0 | Tier; amount: string };
    earned: string;
  };
}

const SAMPLE_WALLET: Address = '0x7a1D2f4b9C3e8A6d5B0f1E2c3D4a5B6c7D8e9F00';
const SAMPLE_PENDING_FEED: Address = '0x3E5f0c2A9b1D8e7F6a4C3b2D1e0F9a8B7c6D5e4F';

function build(k: Knobs): { chain: ChainState; wallet: WalletState } {
  const launchTime = SAMPLE_LAUNCH_TIME;
  const cycleStart = launchTime + k.cycle * DAY;
  const now = cycleStart + k.secondsIntoCycle;

  // --- caps: current cycle and the next nine, plus the first cycle of each 100-day epoch.
  const cap: Record<number, bigint> = {};
  for (let c = k.cycle; c < k.cycle + 10; c++) cap[c] = capOf(c);
  for (const c of [0, 100, 200, 300, 400, 500, 600]) cap[c] = capOf(c);

  // --- the hook's tally.
  const cycleTotal: Record<number, bigint> = {};
  for (const [c, v] of Object.entries(k.cycleTotal)) cycleTotal[Number(c)] = T(v);

  // --- BuyerRewards.
  const totalEmitted = T(k.rewards.totalEmitted);
  const totalClaimedGross = T(k.rewards.totalClaimedGross);
  const totalFeesToTreasury = (totalClaimedGross * BigInt(CLAIM_FEE_BPS)) / 10_000n;
  const totalPaidToBuyers = totalClaimedGross - totalFeesToTreasury;
  const cycleInfo: Record<number, CycleInfo> = {};
  for (const c of Object.keys(k.wallet.bought).map(Number)) {
    const total = cycleTotal[c] ?? 0n;
    const fin = k.finalized.includes(c);
    const fivePct = (total * 5n) / 100n;
    const emitted = fin ? (fivePct < capOf(c) ? fivePct : capOf(c)) : 0n;
    cycleInfo[c] = { total, emitted, finalized: fin };
    if (!(c in cap)) cap[c] = capOf(c);
  }

  // --- Treasury: the balance and the owner reserve follow from the running totals.
  const tr = k.treasury;
  const received = E(tr.totalEthReceived);
  const unsynced = E(tr.unsynced ?? '0');
  const distributed = E(tr.totalDistributed);
  const ownerOut = E(tr.totalOwnerEthWithdrawn);
  const balance = received + unsynced - distributed - ownerOut;
  const ownerEthAvailable =
    ((received + unsynced) * BigInt(OWNER_ETH_BPS)) / 10_000n - ownerOut;
  const ownerTownAvailable = totalFeesToTreasury - T(tr.totalTownWithdrawn);
  const lastDistributedCycle = tr.distributedThisCycle ? k.cycle : tr.previousDistributedCycle;
  const nextDistributionTime = tr.rolled ? cycleStart + DAY : now;

  // --- TownStaking.
  const st = k.staking;
  const tierNotified = splitByWeight(distributed);
  const paidTotal = E(st.totalRewardsPaid);
  const tierPaidRaw = splitByWeight(paidTotal);
  const tierStaked = perTier((t) => T(st.tierStaked[t]));
  const totalStaked = TIERS.reduce((a, t) => a + tierStaked[t], 0n);
  const payoutTime = launchTime + (st.payoutCycle ?? k.cycle) * DAY + st.payoutOffset;
  const streamInfo = perTier<StreamInfo>((t) => {
    const unpaid = E(st.unpaid[t]);
    if (distributed === 0n) {
      // Before the first distribution: "ended at deployment", rate 0 (CL-38).
      return { rewardRate: 0n, periodFinish: launchTime - DAY, lastUpdateTime: launchTime - DAY, rewardPerTokenStored: 0n };
    }
    const periodFinish = payoutTime + STREAM_LENGTH;
    if (tierStaked[t] === 0n) {
      // An empty tier: the stream is paused at its last update (the payout), CL-33.
      return { rewardRate: unpaid / BigInt(STREAM_LENGTH), periodFinish, lastUpdateTime: payoutTime, rewardPerTokenStored: 0n };
    }
    const left = BigInt(periodFinish - now);
    return { rewardRate: unpaid / left, periodFinish, lastUpdateTime: now - 300, rewardPerTokenStored: 0n };
  });

  let priceStatus: ChainState['staking']['priceStatus'];
  let fallbackPrice = 0n;
  let fallbackPriceSetAt = 0;
  if (st.price.source === PriceSource.None) {
    priceStatus = { price: 0n, source: PriceSource.None, updatedAt: 0 };
    fallbackPriceSetAt = now - 9 * DAY; // a fallback was set once, and has lapsed
    fallbackPrice = USD8('2655.00');
  } else {
    priceStatus = { price: USD8(st.price.usd), source: st.price.source, updatedAt: now - st.price.ageSeconds };
    if (st.price.source === PriceSource.Fallback) {
      fallbackPrice = priceStatus.price;
      fallbackPriceSetAt = priceStatus.updatedAt;
    }
  }
  const p = priceStatus.price;
  const vaultPriceWei = perTier<bigint | null>((t) => (p === 0n ? null : priceWei(TIER_USD[t], p)));

  // --- the wallet.
  const w = k.wallet;
  const bought: Record<number, bigint> = {};
  const claimed: Record<number, boolean> = {};
  for (const [c, v] of Object.entries(w.bought)) {
    bought[Number(c)] = T(v);
    claimed[Number(c)] = w.claimed.includes(Number(c));
  }
  // Mirrors BuyerRewards.claimable over the ready, unclaimed cycles, oldest first.
  let gross = 0n;
  let emittedSoFar = totalEmitted;
  for (const c of Object.keys(bought).map(Number).sort((a, b) => a - b)) {
    if (c + 2 > k.cycle || claimed[c]) continue;
    const info = cycleInfo[c];
    let em = info.emitted;
    if (!info.finalized) {
      const fivePct = (info.total * 5n) / 100n;
      em = fivePct < capOf(c) ? fivePct : capOf(c);
      const left = RESERVE - emittedSoFar;
      if (em > left) em = left;
      emittedSoFar += em;
    }
    if (info.total > 0n) gross += (bought[c] * em) / info.total;
  }
  const claimable = gross - (gross * BigInt(CLAIM_FEE_BPS)) / 10_000n;

  const upgradePriceWei: Partial<PerTier<bigint | null>> = {};
  if (w.position.tier !== 0) {
    for (const t of TIERS) {
      if (t > w.position.tier) {
        upgradePriceWei[t] = p === 0n ? null : priceWei(TIER_USD[t] - TIER_USD[w.position.tier], p);
      }
    }
  }

  const chain: ChainState = {
    blockTimestamp: now,
    token: { totalSupply: INITIAL_SUPPLY - T(k.burned), INITIAL_SUPPLY },
    hook: {
      launchTime,
      currentCycle: k.cycle,
      currentBuyFeeBps: k.buyFeeBps ?? 200,
      currentSellFeeBps: 200,
      BUY_FEE_BPS: 200,
      ANTI_SNIPE_START_BPS: 9000,
      ANTI_SNIPE_DURATION: 900,
      BURN_FLOOR,
      cycleTotal,
    },
    rewards: {
      RESERVE,
      CLAIM_FEE_BPS,
      currentCycle: k.cycle,
      cap,
      cycleInfo,
      totalEmitted,
      totalClaimedGross,
      totalPaidToBuyers,
      totalFeesToTreasury,
    },
    treasury: {
      balance,
      ownerEthAvailable,
      ownerTownAvailable,
      spendBps: tr.spendBps ?? 1000,
      MAX_SPEND_BPS: 2500,
      OWNER_ETH_BPS,
      MIN_DISTRIBUTION: E('0.001'),
      currentCycle: k.cycle,
      budget: E(tr.budget),
      lastDistributedCycle,
      nextDistributionTime,
      totalEthReceived: received,
      totalDistributed: distributed,
      totalOwnerEthWithdrawn: ownerOut,
      totalTownWithdrawn: T(tr.totalTownWithdrawn),
    },
    staking: {
      tierUsd: TIER_USD,
      tierWeight: TIER_WEIGHT,
      TOTAL_WEIGHT,
      STREAM_LENGTH,
      PRICE_MAX_AGE: 3 * 3600,
      FALLBACK_MAX_AGE: 7 * DAY,
      FEED_CHANGE_DELAY: 7 * DAY,
      priceStatus,
      fallbackPrice,
      fallbackPriceSetAt,
      pendingFeed: st.pendingFeed ? st.pendingFeed.address : null,
      pendingFeedEffectiveAt: st.pendingFeed ? now + st.pendingFeed.effectiveIn : 0,
      vaultPriceWei,
      tierStaked,
      tierVaults: st.tierVaults,
      streamInfo,
      tierNotified,
      tierPaid: tierPaidRaw,
      totalStaked,
      totalRewardsNotified: distributed,
      totalRewardsPaid: paidTotal,
      totalVaultFees: E(st.totalVaultFees),
    },
    lpVault: {
      unlockTime: launchTime + 3650 * DAY,
      lockDuration: 3650 * DAY,
    },
    quoter: { sampleAmountIn: E(k.quote.amountIn), sampleAmountOut: T(k.quote.amountOut) },
  };

  const wallet: WalletState = {
    address: SAMPLE_WALLET,
    ethBalance: E(w.ethBalance),
    townBalance: T(w.townBalance),
    townAllowanceToStaking: 0n,
    bought,
    claimed,
    claimable,
    positionOf: { tier: w.position.tier, amount: T(w.position.amount) },
    earned: E(w.earned),
    upgradePriceWei,
  };

  return { chain, wallet };
}

// ---------------------------------------------------------------------------------------------
// The named scenarios.
// ---------------------------------------------------------------------------------------------

/** Day 42 of a busy launch: the ordinary state. */
const NORMAL: Knobs = {
  cycle: 42,
  secondsIntoCycle: 9 * 3600 + 12 * 60,
  burned: '29846120.5',
  cycleTotal: {
    35: '48210000',
    37: '51904300',
    38: '61322800',
    40: '39710450',
    41: '44805200',
    42: '12406330',
  },
  finalized: [35, 37, 38],
  rewards: { totalEmitted: '79812450', totalClaimedGross: '61240880' },
  treasury: {
    totalEthReceived: '3.2914',
    totalDistributed: '1.9472',
    totalOwnerEthWithdrawn: '0.2',
    totalTownWithdrawn: '2000000',
    rolled: true,
    budget: '0.1121',
    distributedThisCycle: true,
    previousDistributedCycle: 41,
  },
  staking: {
    tierStaked: { 1: '3180000', 2: '5420500', 3: '9870000', 4: '7215000', 5: '14960000' },
    tierVaults: { 1: 14, 2: 11, 3: 9, 4: 5, 5: 4 },
    totalRewardsPaid: '1.3018',
    unpaid: { 1: '0.0507', 2: '0.0634', 3: '0.0761', 4: '0.0888', 5: '0.1014' },
    totalVaultFees: '0.7384',
    payoutOffset: 41 * 60,
    price: { source: PriceSource.Feed, usd: '2712.40', ageSeconds: 14 * 60 },
  },
  quote: { amountIn: '0.1', amountOut: '2018240' },
  wallet: {
    ethBalance: '0.8421',
    townBalance: '2480115',
    bought: { 35: '1840000', 37: '920500', 38: '2310000', 40: '655000', 41: '1204300', 42: '410000' },
    claimed: [35],
    position: { tier: 3, amount: '1250000' },
    earned: '0.0123',
  },
};

/** The first fifteen minutes: the anti-snipe buy fee is running. */
const DAWN: Knobs = {
  cycle: 0,
  secondsIntoCycle: 6 * 60,
  buyFeeBps: 5480, // 9000 - 8800 * 360 / 900
  burned: '0',
  cycleTotal: { 0: '46900000' },
  finalized: [],
  rewards: { totalEmitted: '0', totalClaimedGross: '0' },
  treasury: {
    totalEthReceived: '0',
    unsynced: '1.2087',
    totalDistributed: '0',
    totalOwnerEthWithdrawn: '0',
    totalTownWithdrawn: '0',
    rolled: false,
    budget: '0',
    distributedThisCycle: false,
    previousDistributedCycle: null,
  },
  staking: {
    tierStaked: { 1: '0', 2: '0', 3: '0', 4: '0', 5: '0' },
    tierVaults: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    totalRewardsPaid: '0',
    unpaid: { 1: '0', 2: '0', 3: '0', 4: '0', 5: '0' },
    totalVaultFees: '0',
    payoutOffset: 0,
    price: { source: PriceSource.Feed, usd: '2698.15', ageSeconds: 31 * 60 },
  },
  quote: { amountIn: '0.1', amountOut: '4271900' },
  wallet: {
    ethBalance: '1.25',
    townBalance: '0',
    bought: {},
    claimed: [],
    position: { tier: 0, amount: '0' },
    earned: '0',
  },
};

/** The Chainlink feed is stale and the owner's fallback price is in use. */
const FALLBACK: Knobs = {
  ...NORMAL,
  staking: { ...NORMAL.staking, price: { source: PriceSource.Fallback, usd: '2650.00', ageSeconds: 2 * DAY + 5 * 3600 } },
};

/** The feed is stale and no valid fallback exists: vault purchases and upgrades pause. */
const NO_PRICE: Knobs = {
  ...NORMAL,
  staking: { ...NORMAL.staking, price: { source: PriceSource.None } },
};

/** Tier 4 is empty and its share of each payout waits for its first staker. */
const EMPTY_TIER: Knobs = {
  ...NORMAL,
  staking: {
    ...NORMAL.staking,
    tierStaked: { ...NORMAL.staking.tierStaked, 4: '0' },
    tierVaults: { ...NORMAL.staking.tierVaults, 4: 0 },
    unpaid: { ...NORMAL.staking.unpaid, 4: '0.1390' },
    pendingFeed: undefined,
  },
};

/** A quiet stretch: this day's budget is under the 0.001 ETH minimum and waits. */
const BELOW_MINIMUM: Knobs = {
  cycle: 42,
  secondsIntoCycle: 15 * 3600 + 5 * 60,
  burned: '1204880',
  cycleTotal: { 39: '688000', 40: '512400', 41: '730900', 42: '214500' },
  finalized: [39],
  rewards: { totalEmitted: '27015400', totalClaimedGross: '20338100' },
  treasury: {
    totalEthReceived: '0.0391',
    totalDistributed: '0.0262',
    totalOwnerEthWithdrawn: '0',
    totalTownWithdrawn: '0',
    rolled: true,
    budget: '0.000899',
    distributedThisCycle: false,
    previousDistributedCycle: 39,
  },
  staking: {
    tierStaked: { 1: '410000', 2: '0', 3: '880000', 4: '0', 5: '0' },
    tierVaults: { 1: 2, 2: 0, 3: 1, 4: 0, 5: 0 },
    totalRewardsPaid: '0.0151',
    unpaid: { 1: '0.00071', 2: '0.00112', 3: '0.00107', 4: '0.00131', 5: '0.00150' },
    totalVaultFees: '0.0074',
    payoutOffset: 2 * 3600,
    payoutCycle: 39,
    price: { source: PriceSource.Feed, usd: '2712.40', ageSeconds: 40 * 60 },
  },
  quote: { amountIn: '0.1', amountOut: '6540300' },
  wallet: {
    ethBalance: '0.0920',
    townBalance: '310400',
    bought: { 39: '120000', 40: '64000', 41: '91500' },
    claimed: [],
    position: { tier: 1, amount: '150000' },
    earned: '0.00021',
  },
};

/** Day 1,240: fewer than ten days of caps remain in the rebate reserve. */
const RESERVE_LOW: Knobs = {
  cycle: 1240,
  secondsIntoCycle: 4 * 3600,
  burned: '212480930',
  cycleTotal: { 1236: '9840000', 1238: '8120500', 1239: '10210000', 1240: '3304000' },
  finalized: [1236],
  rewards: { totalEmitted: '499360000', totalClaimedGross: '481902340' },
  treasury: {
    totalEthReceived: '61.8805',
    totalDistributed: '52.1172',
    totalOwnerEthWithdrawn: '5.5',
    totalTownWithdrawn: '23500000',
    spendBps: 1200,
    rolled: true,
    budget: '0.4893',
    distributedThisCycle: true,
    previousDistributedCycle: 1239,
  },
  staking: {
    tierStaked: { 1: '18400000', 2: '22750000', 3: '31900000', 4: '27100000', 5: '40600000' },
    tierVaults: { 1: 61, 2: 44, 3: 32, 4: 21, 5: 17 },
    totalRewardsPaid: '48.9020',
    unpaid: { 1: '0.2290', 2: '0.2862', 3: '0.3434', 4: '0.4007', 5: '0.4579' },
    totalVaultFees: '4.1120',
    payoutOffset: 12 * 60,
    price: { source: PriceSource.Feed, usd: '2912.75', ageSeconds: 22 * 60 },
    pendingFeed: { address: SAMPLE_PENDING_FEED, effectiveIn: 4 * DAY + 6 * 3600 },
  },
  quote: { amountIn: '0.1', amountOut: '918400' },
  wallet: {
    ethBalance: '1.9033',
    townBalance: '640200',
    bought: { 1236: '412000', 1238: '198300', 1239: '260000', 1240: '75000' },
    claimed: [],
    position: { tier: 5, amount: '3100000' },
    earned: '0.0287',
  },
};

/** A connected wallet that has bought nothing and holds no vault. */
const NOTHING_TO_CLAIM: Knobs = {
  ...NORMAL,
  wallet: {
    ethBalance: '0.3150',
    townBalance: '0',
    bought: {},
    claimed: [],
    position: { tier: 0, amount: '0' },
    earned: '0',
  },
};

function scenario(id: string, label: string, description: string, knobs: Knobs, walletConnected = true): Scenario {
  return { id, label, description, walletConnected, ...build(knobs) };
}

export const SCENARIOS: Scenario[] = [
  scenario('normal', 'Normal day', 'Day 42: daily payouts running, a wallet with rebates ready and a tier 3 vault.', NORMAL),
  scenario('no-wallet', 'No wallet connected', 'The same Day 42, seen by a visitor who has not connected a wallet.', NORMAL, false),
  scenario('nothing-to-claim', 'Wallet with nothing to claim', 'A connected wallet that has bought nothing yet and holds no vault.', NOTHING_TO_CLAIM),
  scenario('dawn', 'First 15 minutes', 'Six minutes after launch: the anti-snipe buy fee is still falling from 90% to 2%.', DAWN),
  scenario('fallback', 'Fallback price in use', 'The Chainlink feed is unhealthy; vault prices use the owner’s fallback price.', FALLBACK),
  scenario('no-price', 'No price available', 'The feed is stale and no valid fallback exists: opening and upgrading vaults pause.', NO_PRICE),
  scenario('empty-tier', 'An empty tier', 'Tier 4 has no stakers; its share of each payout waits for whoever joins it.', EMPTY_TIER),
  scenario('below-minimum', 'Payout under the minimum', 'A quiet day: the day’s budget is under 0.001 ETH, so it stays in the treasury.', BELOW_MINIMUM),
  scenario('reserve-low', 'Rebate reserve nearly spent', 'Day 1,240: fewer than ten days of caps remain in the rebate reserve.', RESERVE_LOW),
];

export const DEFAULT_SCENARIO_ID = 'normal';

export function getScenario(id: string | null | undefined): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
