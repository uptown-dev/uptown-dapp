// The contract interfaces the site calls, in viem's human-readable form. Copied by hand from
// src/interfaces/** (the seven UpTown contracts), the ERC-20 standard, and Uniswap's V4Quoter and
// Universal Router and Permit2 (R1b A1 and A2). Only what the site reads or sends is listed, plus every custom
// error the interfaces declare, so a failed call can be explained in plain words.
import { parseAbi } from 'viem';

/** Every custom error in src/interfaces/**, once each (several contracts share a name and selector). */
export const UPTOWN_ERRORS = [
  'error NotStarted()',
  'error AlreadyStarted()',
  'error OnlyLauncher()',
  'error NothingToClaim()',
  'error CycleNotReady()',
  'error AlreadyClaimed()',
  'error LockTooShort()',
  'error NotLater()',
  'error StillLocked()',
  'error InvalidRecipient()',
  'error RenounceDisabled()',
  'error OnlyOwner()',
  'error AlreadyLaunched()',
  'error OnlyPoolManager()',
  'error WrongPool()',
  'error AlreadyInitialized()',
  'error LiquidityLocked()',
  'error PartialFill()',
  'error OnlyTreasury()',
  'error ZeroAmount()',
  'error InvalidTier()',
  'error NoPosition()',
  'error PositionExists()',
  'error NotAnUpgrade()',
  'error InsufficientPayment()',
  'error StalePrice()',
  'error ZeroPrice()',
  'error WrongFeedDecimals()',
  'error RefundFailed()',
  'error ForwardFailed()',
  'error FeedChangeNotReady()',
  'error NoPendingFeed()',
  'error SpendRateOutOfBounds()',
  'error InsufficientOwnerEth()',
  // Treasury, owner changes with a delay (CR-46).
  'error StakingNotContract()',
  'error SameStaking()',
  'error NoPendingStaking()',
  'error StakingChangeNotReady()',
  'error PauseAlreadyAnnounced()',
  'error AlreadyPaused()',
  'error NoPendingPause()',
  'error NotPaused()',
  // Treasury, the application window (CR-48) and the candidate checks (CR-49).
  'error StakingChangeExpired()',
  'error StakingWrongTreasury()',
  'error StakingWrongWeth()',
  'error StakingDelegated()',
] as const;

/** Errors from libraries and Uniswap that a site action can meet. */
export const OTHER_ERRORS = [
  // OpenZeppelin v5 ERC-20, ReentrancyGuard, Ownable, SafeERC20.
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
  'error ERC20InvalidSpender(address spender)',
  'error ERC20InvalidReceiver(address receiver)',
  'error ReentrancyGuardReentrantCall()',
  'error OwnableUnauthorizedAccount(address account)',
  'error OwnableInvalidOwner(address owner)',
  'error SafeERC20FailedOperation(address token)',
  // Uniswap v4 router and pool manager (v4-periphery, v4-core) and the Universal Router.
  'error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)',
  'error V4TooMuchRequested(uint256 maxAmountInRequested, uint256 amountRequested)',
  'error TransactionDeadlinePassed()',
  'error DeadlinePassed(uint256 deadline)',
  'error ExecutionFailed(uint256 commandIndex, bytes message)',
  'error WrappedError(address target, bytes4 selector, bytes reason, bytes details)',
  'error PriceLimitAlreadyExceeded(uint160 sqrtPriceCurrentX96, uint160 sqrtPriceLimitX96)',
  'error NotEnoughLiquidity(bytes32 poolId)',
  'error InsufficientETH()',
  'error UnexpectedRevertBytes(bytes revertData)',
  // Permit2 (a sell's TOWN reaches the router through it; CR-43).
  'error AllowanceExpired(uint256 deadline)',
  'error InsufficientAllowance(uint256 amount)',
] as const;

export const ERRORS_ABI = parseAbi([...UPTOWN_ERRORS, ...OTHER_ERRORS]);

/**
 * OpenZeppelin `Ownable2Step`, which the Treasury, TownStaking and LPVault use (their interfaces
 * name it without redeclaring it): the owner, the address offered ownership, the offer and the
 * acceptance (CR-64, the owner page).
 */
const OWNABLE_2STEP = [
  'function owner() view returns (address)',
  'function pendingOwner() view returns (address)',
  'function transferOwnership(address newOwner)',
  'function acceptOwnership()',
] as const;

export const TOKEN_ABI = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  ...UPTOWN_ERRORS,
  ...OTHER_ERRORS,
]);

export const HOOK_ABI = parseAbi([
  'function BUY_FEE_BPS() view returns (uint256)',
  'function SELL_FEE_BPS() view returns (uint256)',
  'function ANTI_SNIPE_START_BPS() view returns (uint256)',
  'function ANTI_SNIPE_DURATION() view returns (uint256)',
  'function BURN_FLOOR() view returns (uint256)',
  'function launchTime() view returns (uint256)',
  'function currentBuyFeeBps() view returns (uint256)',
  'function currentSellFeeBps() view returns (uint256)',
  'function currentCycle() view returns (uint256)',
  'function bought(uint256 cycle, address wallet) view returns (uint256)',
  'function cycleTotal(uint256 cycle) view returns (uint256)',
  // The gross TOWN sold in a cycle (CR-47): with cycleTotal, the net flow behind the rebate rate.
  'function sold(uint256 cycle) view returns (uint256)',
  // The sell fee's currency (CR-56, CR-57): this cycle's mode, and the TOWN the sell fees burned in a cycle.
  'function sellFeeInEth() view returns (bool)',
  'function burned(uint256 cycle) view returns (uint256)',
]);

export const REWARDS_ABI = parseAbi([
  'function CLAIM_FEE_BPS() view returns (uint256)',
  'function RESERVE() view returns (uint256)',
  'function launchTime() view returns (uint256)',
  'function totalEmitted() view returns (uint256)',
  'function totalClaimedGross() view returns (uint256)',
  'function totalPaidToBuyers() view returns (uint256)',
  'function totalFeesToTreasury() view returns (uint256)',
  'function currentCycle() view returns (uint256)',
  'function cap(uint256 c) view returns (uint256)',
  'function cycleInfo(uint256 c) view returns (uint256 total, uint256 emitted, bool finalized)',
  'function claimed(address wallet, uint256 cycle) view returns (bool)',
  'function claimable(address wallet, uint256[] cycles) view returns (uint256)',
  'function claim(uint256[] cycles)',
  // The rebate rate from the three-day net flow (CR-47): constants and the two views.
  'function RATE_BASE_BPS() view returns (uint256)',
  'function RATE_BUY_SPAN_BPS() view returns (uint256)',
  'function RATE_SELL_SPAN_BPS() view returns (uint256)',
  'function LEAN_CYCLES() view returns (uint256)',
  'function lean(uint256 c) view returns (int256)',
  'function rateBps(uint256 c) view returns (uint256)',
  // For the sell fee's currency (CR-57): a cycle's rebate pot, and whether the reserve is spent.
  'function emissionEstimate(uint256 c) view returns (uint256)',
  'function reserveExhausted() view returns (bool)',
  ...UPTOWN_ERRORS,
  ...OTHER_ERRORS,
]);

export const TREASURY_ABI = parseAbi([
  'function OWNER_ETH_BPS() view returns (uint256)',
  'function MAX_SPEND_BPS() view returns (uint256)',
  'function MIN_DISTRIBUTION() view returns (uint256)',
  'function currentCycle() view returns (uint256)',
  'function ownerEthAvailable() view returns (uint256)',
  'function ownerTownAvailable() view returns (uint256)',
  'function spendBps() view returns (uint256)',
  'function budget() view returns (uint256)',
  'function lastDistributedCycle() view returns (uint256)',
  'function nextDistributionTime() view returns (uint256)',
  'function totalEthReceived() view returns (uint256)',
  'function totalDistributed() view returns (uint256)',
  'function totalOwnerEthWithdrawn() view returns (uint256)',
  'function totalTownWithdrawn() view returns (uint256)',
  'function poke()',
  // The owner functions, sent only from the owner page (CR-64).
  'function setSpendRate(uint256 bps)',
  'function withdrawOwnerEth(address to, uint256 amount)',
  'function withdrawTown(address to, uint256 amount)',
  // Owner changes with a delay (CR-46): constant, views, the public apply, the owner-only calls
  // (sent only from the owner page, CR-64) and the events.
  'function OWNER_DELAY() view returns (uint256)',
  // How long an announced replacement can be applied once due (CR-48), and WETH, which a
  // candidate must name (CR-49).
  'function APPLY_WINDOW() view returns (uint256)',
  'function weth() view returns (address)',
  'function staking() view returns (address)',
  'function pendingStaking() view returns (address)',
  'function stakingEffectiveAt() view returns (uint256)',
  'function pauseEffectiveAt() view returns (uint256)',
  'function paused() view returns (bool)',
  'function applyStaking()',
  'function announceStaking(address newStaking)',
  'function announcePause()',
  'function cancelPause()',
  'function unpause()',
  'event StakingAnnounced(address indexed newStaking, uint256 effectiveAt)',
  'event StakingReplaced(address indexed oldStaking, address indexed newStaking)',
  'event PauseAnnounced(uint256 effectiveAt)',
  'event PauseCancelled()',
  'event Unpaused()',
  ...OWNABLE_2STEP,
  ...UPTOWN_ERRORS,
  ...OTHER_ERRORS,
]);

export const STAKING_ABI = parseAbi([
  'function STREAM_LENGTH() view returns (uint256)',
  'function TOTAL_WEIGHT() view returns (uint256)',
  'function PRICE_MAX_AGE() view returns (uint256)',
  'function FALLBACK_MAX_AGE() view returns (uint256)',
  'function FEED_CHANGE_DELAY() view returns (uint256)',
  'function tierUsd(uint8 tier) view returns (uint256)',
  'function tierWeight(uint8 tier) view returns (uint256)',
  'function feed() view returns (address)',
  'function pendingFeed() view returns (address)',
  'function pendingFeedEffectiveAt() view returns (uint256)',
  'function fallbackPrice() view returns (uint256)',
  'function fallbackPriceSetAt() view returns (uint256)',
  'function priceStatus() view returns (uint256 price, uint8 source, uint256 updatedAt)',
  'function vaultPriceWei(uint8 tier) view returns (uint256)',
  'function upgradePriceWei(address wallet, uint8 newTier) view returns (uint256)',
  'function positionOf(address wallet) view returns (uint8 tier, uint256 amount)',
  'function totalStaked() view returns (uint256)',
  'function tierStaked(uint8 tier) view returns (uint256)',
  'function tierVaults(uint8 tier) view returns (uint256)',
  'function earned(address wallet) view returns (uint256)',
  'struct StreamInfo { uint256 rewardRate; uint256 periodFinish; uint256 lastUpdateTime; uint256 rewardPerTokenStored; }',
  'function streamInfo(uint8 tier) view returns (StreamInfo)',
  'function totalRewardsNotified() view returns (uint256)',
  'function totalRewardsPaid() view returns (uint256)',
  'function tierNotified(uint8 tier) view returns (uint256)',
  'function tierPaid(uint8 tier) view returns (uint256)',
  'function totalVaultFees() view returns (uint256)',
  'function openVault(uint8 tier, uint256 amount) payable',
  'function addStake(uint256 amount)',
  'function upgradeVault(uint8 newTier) payable',
  'function unstake()',
  'function claim()',
  // The owner's two price powers and the public apply, sent only from the owner page (CR-64).
  'function setFallbackPrice(uint256 price)',
  'function announceFeed(address newFeed)',
  'function applyFeed()',
  ...OWNABLE_2STEP,
  ...UPTOWN_ERRORS,
  ...OTHER_ERRORS,
]);

export const LPVAULT_ABI = parseAbi([
  'function unlockTime() view returns (uint256)',
  'function lockDuration() view returns (uint256)',
  'function tokenId() view returns (uint256)',
  'function MIN_LOCK_DURATION() view returns (uint256)',
  // The owner functions, sent only from the owner page (CR-64).
  'function collectFees(address recipient)',
  'function extendLock(uint256 newUnlockTime)',
  'function withdrawPosition(address to)',
  ...OWNABLE_2STEP,
  ...UPTOWN_ERRORS,
  ...OTHER_ERRORS,
]);

/** The Launcher: its owner, whether it has run, and the one launch call (CR-64, before launch only). */
export const LAUNCHER_ABI = parseAbi(['function owner() view returns (address)', 'function launched() view returns (bool)', 'function launch()', ...UPTOWN_ERRORS, ...OTHER_ERRORS]);

/**
 * A Safe multisig's signers and how many must approve (CR-64): asked of an owner address that has
 * code. Anything may sit at such an address, so each answer is read with "allow failure".
 */
export const SAFE_ABI = parseAbi(['function getOwners() view returns (address[])', 'function getThreshold() view returns (uint256)']);

/**
 * The two questions the site asks an announced staking contract before marking it verified
 * (CR-49): which Treasury and which WETH it names. Anything may sit at that address, so each
 * answer is read with "allow failure".
 */
export const CANDIDATE_ABI = parseAbi(['function treasury() view returns (address)', 'function weth() view returns (address)']);

/** Uniswap V4Quoter (v4-periphery): not a view, but answers through eth_call (CL-41). */
export const QUOTER_ABI = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
  ...OTHER_ERRORS,
]);

/** Permit2 (R1b A1): the router's allowance to move a wallet's TOWN, set by an on-chain approval (CR-43). */
export const PERMIT2_ABI = parseAbi([
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  ...OTHER_ERRORS,
]);

/** Universal Router 2.1.2 (R1b A2): `execute(commands, inputs, deadline)`. */
export const ROUTER_ABI = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable', ...UPTOWN_ERRORS, ...OTHER_ERRORS]);

/**
 * Uniswap v4 StateView (R1b A1, A6): the pool's current price, for the dollar figures (CR-95). The
 * price is TOWN per ETH (spec "Pool and launch position -> Price direction"): currency0 is ETH,
 * currency1 is TOWN, so (sqrtPriceX96 / 2^96)^2 is TOWN units per wei.
 */
export const STATEVIEW_ABI = parseAbi(['function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)']);
