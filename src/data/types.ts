// The shape of every figure the site shows. Each field is named after the contract view it
// comes from; the comment on each field names that view. `src/lib/reads.ts` fills this shape
// from the chain through Multicall3, all at one block. Units are the contracts' raw units: wei
// for ETH and WETH, 10^18 units for TOWN, basis points for rates, seconds since 1970 for times.

export type Address = `0x${string}`;

/** A vault tier, 1 to 5 (TownStaking `TIER_COUNT`). */
export type Tier = 1 | 2 | 3 | 4 | 5;
export const TIERS: readonly Tier[] = [1, 2, 3, 4, 5];

/** Per-tier values, indexed by tier number: `staking.tierStaked[3]`. */
export type PerTier<T> = Record<Tier, T>;

/** ITownStaking.PriceSource. */
export enum PriceSource {
  None = 0,
  Feed = 1,
  Fallback = 2,
}

/** ITownStaking.StreamInfo, as returned by `streamInfo(tier)`. */
export interface StreamInfo {
  /** WETH streamed per second to the tier, raw units. */
  rewardRate: bigint;
  /** When the tier's current stream ends (stored value; CL-33). */
  periodFinish: number;
  /** The tier's last accumulator update. */
  lastUpdateTime: number;
  /** Accumulated WETH per staked TOWN, scaled by PRECISION (10^36). Not shown on the site. */
  rewardPerTokenStored: bigint;
}

/** TownHook.sellFeeShares(): the next sell's 2% (200 basis points) in three parts (CR-93). */
export interface SellFeeShares {
  /** Burned, of the TOWN sold: 200, 100 or 0. */
  burnedBps: number;
  /** Sent to the rebate reserve (BuyerRewards) in TOWN, of the TOWN sold: 0 or 100. */
  reserveBps: number;
  /** Charged in ETH to the Treasury, of the ETH the sale brings in: 0, 100 or 200. */
  ethBps: number;
}

/** BuyerRewards.cycleInfo(c). */
export interface CycleInfo {
  /** TOWN bought by everyone in the cycle (read live from TownHook.cycleTotal). */
  total: bigint;
  /** TOWN emitted for the cycle; 0 until finalised. */
  emitted: bigint;
  finalized: boolean;
}

/** Everything read from the seven contracts (and two Uniswap contracts) for one page view. */
export interface ChainState {
  /** `block.timestamp` of the block the figures were read at (the latest block). */
  blockTimestamp: number;
  /** The number of that block. */
  blockNumber: bigint;

  /** UpTownToken. */
  token: {
    /** UpTownToken.totalSupply() */
    totalSupply: bigint;
    /** 1,000,000,000 x 10^18: the supply minted once at deployment (spec "Fixed parameters"). */
    INITIAL_SUPPLY: bigint;
  };

  /** TownHook. */
  hook: {
    /** TownHook.launchTime() */
    launchTime: number;
    /** TownHook.currentCycle() */
    currentCycle: number;
    /** TownHook.currentBuyFeeBps() */
    currentBuyFeeBps: number;
    /** TownHook.currentSellFeeBps() */
    currentSellFeeBps: number;
    /** TownHook.BUY_FEE_BPS() */
    BUY_FEE_BPS: number;
    /** TownHook.ANTI_SNIPE_START_BPS() */
    ANTI_SNIPE_START_BPS: number;
    /** TownHook.ANTI_SNIPE_DURATION() */
    ANTI_SNIPE_DURATION: number;
    /** TownHook.BURN_FLOOR() */
    BURN_FLOOR: bigint;
    /**
     * TownHook.cycleTotal(c), the TOWN buyers received in cycle c, for today and the three days
     * before it (the lean's days; today and yesterday are also the Stats trading volume, CR-61).
     */
    cycleTotal: Record<number, bigint>;
    /**
     * TownHook.sold(c), the TOWN sellers gave up in cycle c before any TOWN sell fee, for the three
     * days before today (CR-47: the selling side of the lean) and for today (CR-61: the Stats
     * trading volume, with yesterday's).
     */
    sold: Record<number, bigint>;
    /**
     * TownHook.sellFeeInEth(): this cycle's mode, ETH or TOWN (CR-56, CR-57). True: 2% of the ETH a
     * sale brings in, to the Treasury; false: 2% of the TOWN sold, burned, and from cycle 400 half
     * burned and half to BuyerRewards. It says nothing about the burn floor (CR-93): the state a sell
     * is charged in is `sellFeeShares`.
     */
    sellFeeInEth: boolean;
    /**
     * TownHook.sellFeeShares(): how the next sell's 2% divides, in basis points (CR-93): burned, to
     * the rebate reserve (BuyerRewards) in TOWN, and in ETH to the Treasury. One of (200, 0, 0),
     * (100, 100, 0), (0, 0, 200) or (0, 100, 100).
     */
    sellFeeShares: SellFeeShares;
    /** TownHook.RESERVE_FEE_START(): the cycle from which a TOWN-mode sell sends half its fee to the reserve (CR-93: 400, day 401). */
    RESERVE_FEE_START: number;
    /** TownHook.burned(c), the TOWN the sell fees burned in cycle c (CR-57), for today and yesterday. */
    burned: Record<number, bigint>;
  };

  /** BuyerRewards. */
  rewards: {
    /** BuyerRewards.CLAIM_FEE_BPS() */
    CLAIM_FEE_BPS: number;
    /** BuyerRewards.currentCycle() */
    currentCycle: number;
    /** BuyerRewards.cap(c), for the current cycle, the next nine, and the first cycle of each 100-day epoch. */
    cap: Record<number, bigint>;
    /** BuyerRewards.cycleInfo(c), for the cycles the wallet bought in. */
    cycleInfo: Record<number, CycleInfo>;
    /** BuyerRewards.totalEmitted() */
    totalEmitted: bigint;
    /** BuyerRewards.totalClaimedGross() */
    totalClaimedGross: bigint;
    /** BuyerRewards.totalPaidToBuyers() */
    totalPaidToBuyers: bigint;
    /** BuyerRewards.totalFeesToTreasury() */
    totalFeesToTreasury: bigint;
    /** BuyerRewards.RATE_BASE_BPS(): the rate at a lean of 0 and the lowest rate (CR-47: 500). */
    RATE_BASE_BPS: number;
    /** BuyerRewards.RATE_BUY_SPAN_BPS(): the rise above the base at a lean of +1, only buys (CR-47: 25). */
    RATE_BUY_SPAN_BPS: number;
    /** BuyerRewards.RATE_SELL_SPAN_BPS(): the rise above the base at a lean of -1, only sells (CR-47: 50). */
    RATE_SELL_SPAN_BPS: number;
    /** BuyerRewards.LEAN_CYCLES(): how many previous days the lean is measured over (CR-47: 3). */
    LEAN_CYCLES: number;
    /** BuyerRewards.rateBps(c), the day's rebate rate in basis points, for today and each day the wallet bought (CR-47). */
    rateBps: Record<number, number>;
    /** BuyerRewards.lean(c), scaled by 10^18 (-10^18 only sells to +10^18 only buys), for today (CR-47). */
    lean: Record<number, bigint>;
    /**
     * BuyerRewards.emissionEstimate(c), a cycle's rebate pot: min(cap(c), cycleTotal(c) x rateBps(c) / 10000)
     * (CR-57), for yesterday: the figure TownHook.burned(yesterday) is compared with.
     */
    emissionEstimate: Record<number, bigint>;
    /**
     * BuyerRewards.reserveExhausted(): nothing is available right now (`available() == 0`), so a day
     * that starts now charges its sell fee in TOWN (CR-57). False again once TOWN arrives (CR-93).
     */
    reserveExhausted: boolean;
    /**
     * BuyerRewards.available(): the reserve available to the next day settled (CR-93): what
     * BuyerRewards holds less what finished days promised and buyers have not yet claimed.
     */
    available: bigint;
  };

  /** Treasury. */
  treasury: {
    /** The Treasury's ETH balance: `eth_getBalance(Treasury)` (a balance, not a view). */
    balance: bigint;
    /** Treasury.ownerEthAvailable() */
    ownerEthAvailable: bigint;
    /** Treasury.ownerTownAvailable() */
    ownerTownAvailable: bigint;
    /** Treasury.spendBps() */
    spendBps: number;
    /** Treasury.MAX_SPEND_BPS() */
    MAX_SPEND_BPS: number;
    /** Treasury.OWNER_ETH_BPS() */
    OWNER_ETH_BPS: number;
    /** Treasury.MIN_DISTRIBUTION() */
    MIN_DISTRIBUTION: bigint;
    /** Treasury.currentCycle() */
    currentCycle: number;
    /** Treasury.budget() */
    budget: bigint;
    /** Treasury.lastDistributedCycle(); `null` stands for type(uint256).max, "never distributed". */
    lastDistributedCycle: number | null;
    /** Treasury.nextDistributionTime() */
    nextDistributionTime: number;
    /** Treasury.totalEthReceived() */
    totalEthReceived: bigint;
    /** Treasury.totalDistributed() */
    totalDistributed: bigint;
    /** Treasury.totalOwnerEthWithdrawn() */
    totalOwnerEthWithdrawn: bigint;
    /** Treasury.totalTownWithdrawn() */
    totalTownWithdrawn: bigint;
    /** Treasury.OWNER_DELAY(): the wait between announcing an owner change and its effect (CR-46). */
    OWNER_DELAY: number;
    /** Treasury.staking(): the staking contract every distribution goes to from now on (CR-46). */
    staking: Address;
    /** Treasury.pendingStaking(); `null` for address(0), nothing announced. */
    pendingStaking: Address | null;
    /** Treasury.stakingEffectiveAt(): from when `applyStaking()` works; 0 when nothing is pending. */
    stakingEffectiveAt: number;
    /** Treasury.pauseEffectiveAt(): from when the payouts are paused; 0 when no pause is announced or in effect. */
    pauseEffectiveAt: number;
    /** Treasury.paused() */
    paused: boolean;
    /** Treasury.APPLY_WINDOW(): how long an announced replacement can be applied once due (CR-48). */
    APPLY_WINDOW: number;
    /** Treasury.weth(): the WETH a staking contract must name (CR-49). */
    weth: Address;
    /** The site's own check of `pendingStaking()` (CR-49); null when nothing is pending. */
    candidate: CandidateCheck | null;
  };

  /** The staking contract the Treasury pays now, `Treasury.staking()`: every figure below is read from it (CR-50). */
  staking: {
    /** Treasury.staking(): the contract these figures come from and the only one the site sells vaults in. */
    address: Address;
    /** TownStaking.tierUsd(tier) */
    tierUsd: PerTier<number>;
    /** TownStaking.tierWeight(tier) */
    tierWeight: PerTier<number>;
    /** TownStaking.TOTAL_WEIGHT() */
    TOTAL_WEIGHT: number;
    /** TownStaking.STREAM_LENGTH() */
    STREAM_LENGTH: number;
    /** TownStaking.PRICE_MAX_AGE() */
    PRICE_MAX_AGE: number;
    /** TownStaking.FALLBACK_MAX_AGE() */
    FALLBACK_MAX_AGE: number;
    /** TownStaking.FEED_CHANGE_DELAY() */
    FEED_CHANGE_DELAY: number;
    /** TownStaking.priceStatus() */
    priceStatus: { price: bigint; source: PriceSource; updatedAt: number };
    /** TownStaking.fallbackPrice() */
    fallbackPrice: bigint;
    /** TownStaking.fallbackPriceSetAt() */
    fallbackPriceSetAt: number;
    /** TownStaking.pendingFeed(); `null` for address(0). */
    pendingFeed: Address | null;
    /** TownStaking.pendingFeedEffectiveAt() */
    pendingFeedEffectiveAt: number;
    /** TownStaking.vaultPriceWei(tier); `null` when the view reverts with StalePrice. */
    vaultPriceWei: PerTier<bigint | null>;
    /** TownStaking.tierStaked(tier) */
    tierStaked: PerTier<bigint>;
    /** TownStaking.tierVaults(tier) */
    tierVaults: PerTier<number>;
    /** TownStaking.streamInfo(tier) */
    streamInfo: PerTier<StreamInfo>;
    /** TownStaking.tierNotified(tier) */
    tierNotified: PerTier<bigint>;
    /** TownStaking.tierPaid(tier) */
    tierPaid: PerTier<bigint>;
    /** TownStaking.totalStaked() */
    totalStaked: bigint;
    /** TownStaking.totalRewardsNotified() */
    totalRewardsNotified: bigint;
    /** TownStaking.totalRewardsPaid() */
    totalRewardsPaid: bigint;
    /** TownStaking.totalVaultFees() */
    totalVaultFees: bigint;
  };

  /** LPVault. */
  lpVault: {
    /** LPVault.unlockTime() */
    unlockTime: number;
    /** LPVault.lockDuration() */
    lockDuration: number;
  };

  /** The TOWN pool (CR-95: the dollar figures). */
  pool: {
    /**
     * StateView.getSlot0(poolId).sqrtPriceX96: the pool's current price, TOWN per ETH as a square
     * root in Q64.96 (spec "Pool and launch position -> Price direction"). `null` when the read failed
     * or the site has no StateView address for the chain: the TOWN dollar figures are then hidden.
     */
    sqrtPriceX96: bigint | null;
  };
}

/** Everything read for the connected wallet. */
export interface WalletState {
  address: Address;
  /** eth_getBalance(wallet) */
  ethBalance: bigint;
  /** UpTownToken.balanceOf(wallet) */
  townBalance: bigint;
  /** UpTownToken.allowance(wallet, TownStaking) */
  townAllowanceToStaking: bigint;
  /** UpTownToken.allowance(wallet, Permit2): a sell's step 1 (CR-43). */
  townAllowanceToPermit2: bigint;
  /** Permit2.allowance(wallet, TOWN, Universal Router): a sell's step 2, with its expiry (unix seconds). */
  routerAllowance: { amount: bigint; expiration: number };
  /** TownHook.bought(c, wallet) for every cycle since launch; only non-zero entries are kept. */
  bought: Record<number, bigint>;
  /** BuyerRewards.claimed(wallet, c), for the cycles in `bought`. */
  claimed: Record<number, boolean>;
  /** BuyerRewards.claimable(wallet, readyCycles), oldest first. */
  claimable: bigint;
  /** TownStaking.positionOf(wallet) */
  positionOf: { tier: 0 | Tier; amount: bigint };
  /** TownStaking.earned(wallet) */
  earned: bigint;
  /** TownStaking.upgradePriceWei(wallet, tier) for each tier above the current one; null when it reverts (no price). */
  upgradePriceWei: Partial<PerTier<bigint | null>>;
  /**
   * The wallet's vaults in staking contracts the Treasury no longer pays (CR-50), from the network
   * module's hand-kept list: only those with TOWN staked or WETH earned.
   */
  oldVaults: OldVault[];
}

/** A wallet's vault in a replaced staking contract (CR-50): unstake and claim only. */
export interface OldVault {
  /** The replaced contract. */
  address: Address;
  /** When the Treasury stopped paying it, from the network module's list (seconds); null if the list gives no date. */
  replacedOn: number | null;
  /** positionOf(wallet) there. */
  positionOf: { tier: 0 | Tier; amount: bigint };
  /** earned(wallet) there. */
  earned: bigint;
}

/**
 * One staking contract's settings and ownership, as the owner page's price, feed and ownership
 * powers need them (CR-73): the contract the Treasury pays now, or one it has replaced. Every
 * field is read from that contract itself.
 */
export interface StakingControls extends Ownership {
  /** The contract these settings were read from, and the one its powers act on. */
  address: Address;
  /** TownStaking.feed() */
  feed: Address;
  /** TownStaking.priceStatus() */
  priceStatus: { price: bigint; source: PriceSource; updatedAt: number };
  /** TownStaking.fallbackPrice() */
  fallbackPrice: bigint;
  /** TownStaking.fallbackPriceSetAt() */
  fallbackPriceSetAt: number;
  /** TownStaking.pendingFeed(); `null` for address(0). */
  pendingFeed: Address | null;
  /** TownStaking.pendingFeedEffectiveAt() */
  pendingFeedEffectiveAt: number;
  /** TownStaking.FALLBACK_MAX_AGE() */
  FALLBACK_MAX_AGE: number;
  /** TownStaking.FEED_CHANGE_DELAY() */
  FEED_CHANGE_DELAY: number;
}

/**
 * A staking contract the site's own list marks as replaced (CR-73). The Treasury no longer pays it,
 * but the owner still owns it and still holds its two price powers there, so the owner page shows a
 * card of its own for each one.
 */
export interface ReplacedStaking {
  /** The replaced contract, from the site's own list. */
  address: Address;
  /** When the Treasury stopped paying it, from that list (seconds); null if the list gives no date. */
  replacedOn: number | null;
  /** Its own settings and ownership; `null` when the contract could not be read on this chain. */
  controls: StakingControls | null;
  /** Why nothing could be read, in plain words; `null` when `controls` is there. */
  unavailable: string | null;
}

/**
 * What the site found when it asked an announced staking contract which Treasury and which WETH
 * it names (CR-49). `verified` only when both answers match and its code is not an EIP-7702
 * delegation; the Treasury refuses anything else when it is applied.
 */
export interface CandidateCheck {
  address: Address;
  /** Its `treasury()` answer; null when the call failed or gave no address. */
  treasury: Address | null;
  /** Its `weth()` answer; null when the call failed or gave no address. */
  weth: Address | null;
  /** Its code begins with 0xef0100: a wallet with an EIP-7702 delegation. */
  delegated: boolean;
  verified: boolean;
  /**
   * Its EIP-1967 implementation slot is not zero: a proxy whose code can be swapped. The Treasury
   * does not refuse such a contract, so this is a flag beside the mark, not a reason to refuse it.
   */
  upgradeable: boolean;
}

/**
 * One contract's two-step ownership (OpenZeppelin `Ownable2Step`): the owner, and the address it has
 * offered ownership to, which becomes the owner once it accepts.
 */
export interface Ownership {
  /** owner() */
  owner: Address;
  /** pendingOwner(); `null` for address(0), no offer open. */
  pendingOwner: Address | null;
}

/**
 * A multisig found at an owner address (CR-64): an address with code that is not an EIP-7702
 * delegated wallet. Its signers come from the Safe's `getOwners()`; `null` when that read failed,
 * so the site cannot tell who may act for it.
 */
export interface Multisig {
  address: Address;
  /** getOwners(); `null` when the call failed. */
  signers: Address[] | null;
  /** getThreshold(): how many signers must approve; `null` when the call failed. */
  threshold: number | null;
}

/**
 * Everything the owner page needs besides the figures in `ChainState` (CR-64), read in the same
 * Multicall3 batch and at the same block. Read before launch too, when `ChainState` cannot be.
 */
export interface OwnerState {
  blockTimestamp: number;
  blockNumber: bigint;
  /** The Launcher: its owner (the only caller of `launch`) and whether it has run. */
  launcher: { owner: Address; launched: boolean };
  /** Treasury.owner(), pendingOwner(). */
  treasury: Ownership;
  /** The staking contract the Treasury pays now (Treasury.staking()): owner(), pendingOwner(), feed(). */
  staking: Ownership & { address: Address; feed: Address };
  /**
   * Each staking contract the site's own list marks as replaced (CR-73), oldest first, read from
   * that contract itself: the owner still holds its price and feed powers there.
   */
  replaced: ReplacedStaking[];
  /** LPVault.owner(), pendingOwner(), tokenId(), unlockTime(), MIN_LOCK_DURATION(). */
  lpVault: Ownership & { tokenId: bigint; unlockTime: number; MIN_LOCK_DURATION: number };
  /** Each owner or offered address that is a multisig, by lower-case address. */
  multisigs: Record<string, Multisig>;
}

/** The seven UpTown contracts, in the order the footer lists them. */
export const CONTRACT_NAMES = ['UpTownToken', 'TownHook', 'BuyerRewards', 'Treasury', 'TownStaking', 'LPVault', 'Launcher'] as const;
export type ContractName = (typeof CONTRACT_NAMES)[number];

/** Where the seven contracts live on one chain, plus the owner and the locked position (CR-40, "Verify"). */
export interface Deployment {
  /** Each contract's address. */
  contracts: Record<ContractName, Address>;
  /** The owner's address (one multisig), from the address file; `null` until it is published. */
  owner: Address | null;
  /** The launch position's token ID on the Uniswap v4 PositionManager (LPVault holds it); `null` before launch. */
  lpTokenId: bigint | null;
}

/**
 * The fixed rules, read from the contracts' constants and settings (F12a, CR-86): the part of
 * `ChainState` that means the same before the launch as after it. `ChainState` has every field
 * here, so whatever shows only the rules takes either one.
 */
export interface FixedRules {
  token: Pick<ChainState['token'], 'totalSupply' | 'INITIAL_SUPPLY'>;
  hook: Pick<ChainState['hook'], 'BUY_FEE_BPS' | 'ANTI_SNIPE_START_BPS' | 'ANTI_SNIPE_DURATION' | 'BURN_FLOOR' | 'RESERVE_FEE_START'>;
  rewards: Pick<ChainState['rewards'], 'CLAIM_FEE_BPS' | 'RATE_BASE_BPS' | 'RATE_BUY_SPAN_BPS' | 'RATE_SELL_SPAN_BPS' | 'LEAN_CYCLES' | 'cap'>;
  treasury: Pick<ChainState['treasury'], 'spendBps' | 'MAX_SPEND_BPS' | 'OWNER_ETH_BPS' | 'MIN_DISTRIBUTION' | 'OWNER_DELAY' | 'APPLY_WINDOW' | 'staking'>;
  staking: Pick<ChainState['staking'], 'address' | 'tierUsd' | 'tierWeight' | 'TOTAL_WEIGHT' | 'STREAM_LENGTH'>;
  lpVault: Pick<ChainState['lpVault'], 'lockDuration'>;
}

/**
 * Deployed, not launched (CR-86): what the site reads while `Launcher.launched()` is false. Only
 * views that mean something before the launch: the constants and settings above, the supply and
 * where it sits. Everything that starts at the launch (the day, the price, the rebate reserve, the
 * treasury's money, the lock's end) is left out, not shown as zero.
 */
export interface PrelaunchState extends FixedRules {
  /** `block.timestamp` of the block read. */
  blockTimestamp: number;
  blockNumber: bigint;
  /** UpTownToken.balanceOf(Launcher): until the launch the Launcher holds the whole supply. */
  launcherBalance: bigint;
}
