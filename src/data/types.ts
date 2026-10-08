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
    /** TownHook.cycleTotal(c), for the cycles the site shows. */
    cycleTotal: Record<number, bigint>;
  };

  /** BuyerRewards. */
  rewards: {
    /** BuyerRewards.RESERVE() */
    RESERVE: bigint;
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
  };

  /** TownStaking. */
  staking: {
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
