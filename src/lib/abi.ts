// The contract interfaces the site calls, in viem's human-readable form. Copied by hand from
// src/interfaces/** (the seven UpTown contracts), the ERC-20 standard, and Uniswap's V4Quoter and
// Universal Router (R1b A1 and A2). Only what the site reads or sends is listed, plus every custom
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
] as const;

export const ERRORS_ABI = parseAbi([...UPTOWN_ERRORS, ...OTHER_ERRORS]);

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
  ...UPTOWN_ERRORS,
  ...OTHER_ERRORS,
]);

export const LPVAULT_ABI = parseAbi([
  'function unlockTime() view returns (uint256)',
  'function lockDuration() view returns (uint256)',
  'function tokenId() view returns (uint256)',
]);

/** Uniswap V4Quoter (v4-periphery): not a view, but answers through eth_call (CL-41). */
export const QUOTER_ABI = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
  ...OTHER_ERRORS,
]);

/** Universal Router 2.1.2 (R1b A2): `execute(commands, inputs, deadline)`. */
export const ROUTER_ABI = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable', ...UPTOWN_ERRORS, ...OTHER_ERRORS]);
