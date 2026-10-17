// The shape of every figure the site shows. Each field is named after the contract view it
// comes from; the comment on each field names that view. `src/lib/reads.ts` fills this shape
// from the chain through Multicall3, all at one block. Units are the contracts' raw units: wei
// for ETH and WETH, 10^18 units for SKYLINE, basis points for rates, seconds since 1970 for times.
//
// CR-102 (17 October 2026): the token is SKYLINE and the hook SkylineHook; the contracts keep the
// first deployment's function names that say "town" (`townToken()`, `ownerTownAvailable()`, ...).
// SkylineStaking replaced TownStaking: free staking, one pool, no prices and no owner.

export type Address = `0x${string}`;

/** ISkylineStaking.StreamInfo, as returned by `streamInfo()`: the one WETH stream of the one pool. */
export interface StreamInfo {
  /** WETH streamed per second to the pool, raw units. */
  rewardRate: bigint;
  /** When the current stream ends (stored value; pushed forward by the time the pool is empty, CL-33). */
  periodFinish: number;
  /** The last accumulator update. */
  lastUpdateTime: number;
  /** Accumulated WETH per staked SKYLINE, scaled by PRECISION (10^36). Not shown on the site. */
  rewardPerTokenStored: bigint;
}

/**
 * The Chainlink ETH/USD feed's latest round, read straight from the feed with `latestRoundData()`
 * (CR-102: the dollar figures no longer go through a staking contract). 8 decimals.
 */
export interface EthUsd {
  /** The feed the site read: its own address for this network (`src/lib/chains.ts`). */
  feed: Address;
  /** `answer`, 8 decimals; when it is not positive the dollar figures are hidden. */
  answer: bigint;
  /** `updatedAt`, seconds since 1970; when it is more than 3 hours old the dollar figures are hidden. */
  updatedAt: number;
}

/** SkylineHook.sellFeeShares(): the next sell's 2% (200 basis points) in three parts (CR-93). */
export interface SellFeeShares {
  /** Burned, of the SKYLINE sold: 200, 100 or 0. */
  burnedBps: number;
  /** Sent to the rebate reserve (BuyerRewards) in SKYLINE, of the SKYLINE sold: 0 or 100. */
  reserveBps: number;
  /** Charged in ETH to the Treasury, of the ETH the sale brings in: 0, 100 or 200. */
  ethBps: number;
}

/** BuyerRewards.cycleInfo(c). */
export interface CycleInfo {
  /** SKYLINE bought by everyone in the cycle (read live from SkylineHook.cycleTotal). */
  total: bigint;
  /** SKYLINE emitted for the cycle; 0 until finalised. */
  emitted: bigint;
  finalized: boolean;
}

/** Everything read from the seven contracts (and the Uniswap and Chainlink contracts) for one page view. */
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

  /** SkylineHook. */
  hook: {
    /** SkylineHook.launchTime() */
    launchTime: number;
    /** SkylineHook.currentCycle() */
    currentCycle: number;
    /** SkylineHook.currentBuyFeeBps(): always 200, from the first second (CR-102). */
    currentBuyFeeBps: number;
    /** SkylineHook.currentSellFeeBps() */
    currentSellFeeBps: number;
    /** SkylineHook.BUY_FEE_BPS() */
    BUY_FEE_BPS: number;
    /** SkylineHook.BURN_FLOOR(): 200,000,000 SKYLINE (CR-102). */
    BURN_FLOOR: bigint;
    /**
     * SkylineHook.cycleTotal(c), the SKYLINE buyers received in cycle c, for today and the three days
     * before it (the lean's days; today and yesterday are also the Stats trading volume, CR-61).
     */
    cycleTotal: Record<number, bigint>;
    /**
     * SkylineHook.sold(c), the SKYLINE sellers gave up in cycle c before any SKYLINE sell fee, for the
     * three days before today (CR-47: the selling side of the lean) and for today (CR-61: the Stats
     * trading volume, with yesterday's).
     */
    sold: Record<number, bigint>;
    /**
     * SkylineHook.sellFeeInEth(): this cycle's mode, ETH or SKYLINE (CR-56, CR-57). True: 2% of the
     * ETH a sale brings in, to the Treasury; false: 2% of the SKYLINE sold, burned, and from cycle 400
     * half burned and half to BuyerRewards. It says nothing about the burn floor (CR-93): the state a
     * sell is charged in is `sellFeeShares`.
     */
    sellFeeInEth: boolean;
    /**
     * SkylineHook.sellFeeShares(): how the next sell's 2% divides, in basis points (CR-93): burned, to
     * the rebate reserve (BuyerRewards) in SKYLINE, and in ETH to the Treasury. One of (200, 0, 0),
     * (100, 100, 0), (0, 0, 200) or (0, 100, 100).
     */
    sellFeeShares: SellFeeShares;
    /** SkylineHook.RESERVE_FEE_START(): the cycle from which a SKYLINE-mode sell sends half its fee to the reserve (CR-93: 400, day 401). */
    RESERVE_FEE_START: number;
    /** SkylineHook.burned(c), the SKYLINE the sell fees burned in cycle c (CR-57), for today and yesterday. */
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
     * (CR-57), for yesterday: the figure SkylineHook.burned(yesterday) is compared with.
     */
    emissionEstimate: Record<number, bigint>;
    /**
     * BuyerRewards.reserveExhausted(): nothing is available right now (`available() == 0`), so a day
     * that starts now charges its sell fee in SKYLINE (CR-57). False again once SKYLINE arrives (CR-93).
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
    /** Treasury.ownerTownAvailable(): the SKYLINE claim fees (the function keeps its first name). */
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
    /** Treasury.totalEthReceived(): every wei of ETH the treasury has taken in (CR-102: the hook's fees and any other ETH sent). */
    totalEthReceived: bigint;
    /** Treasury.totalDistributed() */
    totalDistributed: bigint;
    /** Treasury.totalOwnerEthWithdrawn() */
    totalOwnerEthWithdrawn: bigint;
    /** Treasury.totalTownWithdrawn(): the SKYLINE the owner has withdrawn. */
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
    /** Treasury.staking(): the contract these figures come from and the only one the site stakes in. */
    address: Address;
    /** SkylineStaking.STREAM_LENGTH(): 7 days. */
    STREAM_LENGTH: number;
    /** SkylineStaking.streamInfo(): the pool's one stream. */
    streamInfo: StreamInfo;
    /** SkylineStaking.totalStaked() */
    totalStaked: bigint;
    /** SkylineStaking.totalRewardsNotified(): the WETH the Treasury has sent it. */
    totalRewardsNotified: bigint;
    /** SkylineStaking.totalRewardsPaid(): the WETH stakers have claimed. */
    totalRewardsPaid: bigint;
  };

  /** LPVault: the two positions and their locks (CR-102). */
  lpVault: {
    /** LPVault.unlockTime(): the launch position's lock. */
    unlockTime: number;
    /** LPVault.lockDuration() */
    lockDuration: number;
    /** LPVault.secondTokenId(): the second position's NFT. */
    secondTokenId: bigint;
    /** LPVault.secondUnlockTime(): the second position's 14-day lock. */
    secondUnlockTime: number;
    /** LPVault.secondWithdrawn() */
    secondWithdrawn: boolean;
    /** LPVault.SECOND_LOCK(): 14 days. */
    SECOND_LOCK: number;
  };

  /** The Launcher's launch figures (CR-102), its constants: the launch buy and the second position's ETH. */
  launch: {
    /** Launcher.LAUNCH_BUY_ETH(): 0.1 ETH, bought for the owner in the launch transaction. */
    LAUNCH_BUY_ETH: bigint;
    /** Launcher.SECOND_POSITION_ETH(): 0.03 ETH, in the second position. */
    SECOND_POSITION_ETH: bigint;
  };

  /** The SKYLINE pool (CR-95: the dollar figures). */
  pool: {
    /**
     * StateView.getSlot0(poolId).sqrtPriceX96: the pool's current price, SKYLINE per ETH as a square
     * root in Q64.96 (spec "Pool and launch position -> Price direction"). `null` when the read failed
     * or the site has no StateView address for the chain: the SKYLINE dollar figures are then hidden.
     */
    sqrtPriceX96: bigint | null;
  };

  /**
   * Chainlink's ETH/USD feed, `latestRoundData()` (CR-102); `null` when the site has no feed for this
   * network or the read failed: every dollar figure is then hidden.
   */
  ethUsd: EthUsd | null;
}

/** Everything read for the connected wallet. */
export interface WalletState {
  address: Address;
  /** eth_getBalance(wallet) */
  ethBalance: bigint;
  /** UpTownToken.balanceOf(wallet): the wallet's SKYLINE. */
  townBalance: bigint;
  /** UpTownToken.allowance(wallet, the staking contract the Treasury pays). */
  townAllowanceToStaking: bigint;
  /** UpTownToken.allowance(wallet, Permit2): a sell's step 1 (CR-43). */
  townAllowanceToPermit2: bigint;
  /** Permit2.allowance(wallet, SKYLINE, Universal Router): a sell's step 2, with its expiry (unix seconds). */
  routerAllowance: { amount: bigint; expiration: number };
  /** SkylineHook.bought(c, wallet) for every cycle since launch; only non-zero entries are kept. */
  bought: Record<number, bigint>;
  /** BuyerRewards.claimed(wallet, c), for the cycles in `bought`. */
  claimed: Record<number, boolean>;
  /** BuyerRewards.claimable(wallet, readyCycles), oldest first. */
  claimable: bigint;
  /** SkylineStaking.stakeOf(wallet) */
  stakeOf: bigint;
  /** SkylineStaking.earned(wallet) */
  earned: bigint;
  /**
   * The wallet's stakes in staking contracts the Treasury no longer pays (CR-50), from the network
   * module's hand-kept list: only those with SKYLINE staked or WETH earned.
   */
  oldStakes: OldStake[];
}

/** A wallet's stake in a replaced staking contract (CR-50): unstake and claim only. */
export interface OldStake {
  /** The replaced contract. */
  address: Address;
  /** When the Treasury stopped paying it, from the network module's list (seconds); null if the list gives no date. */
  replacedOn: number | null;
  /** stakeOf(wallet) there. */
  stake: bigint;
  /** earned(wallet) there. */
  earned: bigint;
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
 * SkylineStaking has no owner (CR-102), so only the Treasury and LPVault are owned.
 */
export interface OwnerState {
  blockTimestamp: number;
  blockNumber: bigint;
  /**
   * The Launcher: its owner (the only caller of `launch`), whether it has run, and the ETH `launch()`
   * must be sent with (CR-102: LAUNCH_BUY_ETH + SECOND_POSITION_ETH, 0.13 ETH).
   */
  launcher: { owner: Address; launched: boolean; launchValue: bigint };
  /** Treasury.owner(), pendingOwner(). */
  treasury: Ownership;
  /**
   * LPVault.owner(), pendingOwner(), tokenId(), unlockTime(), MIN_LOCK_DURATION(), and the second
   * position's secondTokenId(), secondUnlockTime(), secondWithdrawn() (CR-102).
   */
  lpVault: Ownership & {
    tokenId: bigint;
    unlockTime: number;
    MIN_LOCK_DURATION: number;
    secondTokenId: bigint;
    secondUnlockTime: number;
    secondWithdrawn: boolean;
  };
  /** Each owner or offered address that is a multisig, by lower-case address. */
  multisigs: Record<string, Multisig>;
}

/** The seven UpTown contracts, in the order the footer lists them (CR-102: SkylineHook and SkylineStaking). */
export const CONTRACT_NAMES = ['UpTownToken', 'SkylineHook', 'BuyerRewards', 'Treasury', 'SkylineStaking', 'LPVault', 'Launcher'] as const;
export type ContractName = (typeof CONTRACT_NAMES)[number];

/** Where the seven contracts live on one chain, plus the owner and the locked positions (CR-40, "Verify"). */
export interface Deployment {
  /** Each contract's address. */
  contracts: Record<ContractName, Address>;
  /** The owner's address, from the address file; `null` until it is published. */
  owner: Address | null;
  /** The launch position's token ID on the Uniswap v4 PositionManager (LPVault holds it); `null` before launch. */
  lpTokenId: bigint | null;
  /** The second position's token ID (CR-102; LPVault holds it for 14 days); `null` before launch. */
  secondTokenId: bigint | null;
}

/**
 * The fixed rules, read from the contracts' constants and settings (F12a, CR-86): the part of
 * `ChainState` that means the same before the launch as after it. `ChainState` has every field
 * here, so whatever shows only the rules takes either one.
 */
export interface FixedRules {
  token: Pick<ChainState['token'], 'totalSupply' | 'INITIAL_SUPPLY'>;
  hook: Pick<ChainState['hook'], 'BUY_FEE_BPS' | 'BURN_FLOOR' | 'RESERVE_FEE_START'>;
  rewards: Pick<ChainState['rewards'], 'CLAIM_FEE_BPS' | 'RATE_BASE_BPS' | 'RATE_BUY_SPAN_BPS' | 'RATE_SELL_SPAN_BPS' | 'LEAN_CYCLES' | 'cap'>;
  treasury: Pick<ChainState['treasury'], 'spendBps' | 'MAX_SPEND_BPS' | 'OWNER_ETH_BPS' | 'MIN_DISTRIBUTION' | 'OWNER_DELAY' | 'APPLY_WINDOW' | 'staking'>;
  staking: Pick<ChainState['staking'], 'address' | 'STREAM_LENGTH'>;
  lpVault: Pick<ChainState['lpVault'], 'lockDuration' | 'SECOND_LOCK'>;
  launch: ChainState['launch'];
}

/**
 * Deployed, not launched (CR-86): what the site reads while `Launcher.launched()` is false. Only
 * views that mean something before the launch: the constants and settings above, the supply and
 * where it sits. Everything that starts at the launch (the day, the price, the rebate reserve, the
 * treasury's money, the locks' ends) is left out, not shown as zero.
 */
export interface PrelaunchState extends FixedRules {
  /** `block.timestamp` of the block read. */
  blockTimestamp: number;
  blockNumber: bigint;
  /** UpTownToken.balanceOf(Launcher): until the launch the Launcher holds the whole supply. */
  launcherBalance: bigint;
}
