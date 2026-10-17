// Failed calls in plain words: one sentence for every custom error the interfaces declare
// (src/interfaces/**), for the library and Uniswap errors a site action can meet, and for the
// wallet's own refusals. Unknown failures get a general sentence plus the error's name.
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Hex } from 'viem';
import { ERRORS_ABI } from './abi';
import { fmtEth, fmtTown } from './format';

const PLAIN: Record<string, string> = {
  // BuyerRewards, Treasury, LPVault
  NotStarted: 'UpTown has not launched yet, so this cannot be done.',
  AlreadyStarted: 'This contract has already been started; it can be started only once.',
  OnlyLauncher: 'Only the Launcher contract can do this, once, at launch.',
  NothingToClaim: 'There are no days in this claim. Pick at least one day to claim.',
  CycleNotReady: 'A day in this claim is not ready yet: each day can be claimed from the start of the next day.',
  AlreadyClaimed: 'This wallet has already claimed a day in this claim. Refresh to see what is left to claim.',
  LockTooShort: 'The liquidity lock must last at least 10 years.',
  NotLater: 'A new unlock time must be later than the current one: the lock can be extended, never shortened.',
  StillLocked: 'The liquidity is still locked; it cannot be withdrawn before the unlock time.',
  InvalidRecipient: 'That address cannot receive the pool fees.',
  SecondAlreadyWithdrawn: 'The second position has already been withdrawn from LPVault, so it can be neither withdrawn again nor have its fees collected there.',
  RenounceDisabled: 'Ownership cannot be given up; it can only be handed over in two steps.',
  SpendRateOutOfBounds: 'The daily payout rate must be between 1% and 25%.',
  InsufficientOwnerEth: 'That is more than the owner reserve holds.',
  // Treasury, owner changes with a delay (CR-46)
  StakingNotContract: 'The announced staking contract must be a contract; that address has no code.',
  SameStaking: 'That is already the staking contract the treasury pays.',
  NoPendingStaking: 'No staking contract change is announced, so there is nothing to apply.',
  StakingChangeNotReady: 'The announced staking contract cannot be applied yet: the 2-day wait has not passed.',
  PauseAlreadyAnnounced: 'A pause of the payouts is already announced.',
  AlreadyPaused: 'The payouts are already paused.',
  NoPendingPause: 'No pause of the payouts is announced, so there is nothing to cancel.',
  NotPaused: 'The payouts are not paused.',
  // Treasury, the application window (CR-48) and the candidate checks (CR-49)
  StakingChangeExpired:
    'The announced staking contract can no longer be applied: its 7-day window has passed. The owner must announce it again, with a new 2-day wait.',
  StakingWrongTreasury:
    'That address does not look like a staking contract: it does not name this treasury as its treasury, so the treasury refuses it.',
  StakingWrongWeth: 'That address does not look like a staking contract: it does not name WETH as its reward token, so the treasury refuses it.',
  StakingDelegated: 'That address is a wallet whose code can be changed at any time, not a fixed staking contract, so the treasury refuses it.',
  // Launcher
  OnlyOwner: 'Only the owner can do this.',
  AlreadyLaunched: 'UpTown has already launched; the launch cannot be repeated.',
  WrongLaunchValue: 'The launch must be sent with exactly 0.13 ETH: 0.1 ETH for the launch buy and 0.03 ETH for the second position.',
  EthTransferFailed: 'The launch could not send the unused ETH back to the owner wallet, so nothing happened.',
  // SkylineHook
  OnlyPoolManager: 'Only Uniswap’s pool manager can call SkylineHook.',
  WrongPool: 'This is not the $SKYLINE pool that SkylineHook serves.',
  AlreadyInitialized: 'The $SKYLINE pool already exists.',
  LiquidityLocked: 'The $SKYLINE pool accepts no liquidity besides the two positions added at the launch.',
  PartialFill: 'The pool could not fill the whole buy, so it was cancelled and you keep your ETH. Try a smaller amount.',
  // SkylineStaking (CR-102)
  OnlyTreasury: 'Only the Treasury can send rewards to staking.',
  ZeroAmount: 'Enter an amount above zero.',
  InsufficientStake: 'That is more $SKYLINE than this wallet has staked. Unstake at most your stake.',
  // OpenZeppelin
  ERC20InsufficientBalance: 'This wallet does not hold enough $SKYLINE for that.',
  ERC20InsufficientAllowance: 'The staking contract may not move that much of your $SKYLINE yet. Press the button again: it asks for the approval first.',
  ERC20InvalidSpender: 'That address cannot be approved to move $SKYLINE.',
  ERC20InvalidReceiver: 'That address cannot receive $SKYLINE.',
  ReentrancyGuardReentrantCall: 'The contract refused a call made from inside another call.',
  OwnableUnauthorizedAccount: 'Only the owner can do this.',
  OwnableInvalidOwner: 'That address cannot become the owner.',
  SafeERC20FailedOperation: 'A token transfer failed, so nothing happened.',
  // Uniswap
  V4TooMuchRequested: 'The buy would cost more ETH than allowed, so it was cancelled and you keep your ETH.',
  TransactionDeadlinePassed: 'The buy waited too long to be included and was cancelled. Try again.',
  DeadlinePassed: 'The buy waited too long to be included and was cancelled. Try again.',
  PriceLimitAlreadyExceeded: 'The pool’s price moved past the limit, so the buy was cancelled.',
  NotEnoughLiquidity: 'The pool does not hold enough $SKYLINE for this buy. Try a smaller amount.',
  InsufficientETH: 'Not enough ETH was sent with the buy.',
  // Permit2 (a sell's second approval)
  AllowanceExpired: 'The router’s permission to move your $SKYLINE has expired. Press the sell button again: it renews the permission, then sells.',
  InsufficientAllowance: 'The router may not move your $SKYLINE yet. Press the sell button again: it asks for the permission first, then sells.',
};

/** What a trade is, for the errors that read differently on a sell (CR-43). */
export type TradeKind = 'buy' | 'sell';

/** Sentences that differ on a sell: the seller keeps SKYLINE, not ETH. */
const SELL: Record<string, string> = {
  PartialFill: 'The pool could not fill the whole sale, so it was cancelled and you keep your $SKYLINE. Try a smaller amount.',
  V4TooMuchRequested: 'The sale would take more $SKYLINE than allowed, so it was cancelled and you keep your $SKYLINE.',
  TransactionDeadlinePassed: 'The sale waited too long to be included and was cancelled. Try again.',
  DeadlinePassed: 'The sale waited too long to be included and was cancelled. Try again.',
  PriceLimitAlreadyExceeded: 'The pool’s price moved past the limit, so the sale was cancelled.',
  NotEnoughLiquidity: 'The pool does not hold enough ETH for this sale. Try a smaller amount.',
  ERC20InsufficientAllowance: 'Permit2 may not move your $SKYLINE yet. Press the sell button again: it asks for the approval first, then sells.',
};

/** The custom error inside a revert, unwrapping the Universal Router's and the pool manager's wrappers. */
function decodeInner(data: Hex | undefined, depth = 0): { name: string; args: readonly unknown[] } | null {
  if (!data || data.length < 10 || depth > 3) return null;
  try {
    const d = decodeErrorResult({ abi: ERRORS_ABI, data });
    const args = (d.args ?? []) as readonly unknown[];
    if (d.errorName === 'ExecutionFailed') return decodeInner(args[1] as Hex, depth + 1) ?? { name: d.errorName, args };
    if (d.errorName === 'WrappedError') return decodeInner(args[2] as Hex, depth + 1) ?? { name: d.errorName, args };
    if (d.errorName === 'UnexpectedRevertBytes') return decodeInner(args[0] as Hex, depth + 1) ?? { name: d.errorName, args };
    return { name: d.errorName, args };
  } catch {
    return null;
  }
}

function sentence(name: string, args: readonly unknown[], kind?: TradeKind): string {
  if (name === 'V4TooLittleReceived') {
    const [min, got] = args as [bigint, bigint];
    if (kind === 'sell')
      return `You would receive ${fmtEth(got, 6)} ETH, less than your minimum of ${fmtEth(min, 6)} ETH, so the sale was cancelled and you keep your $SKYLINE. Lower the minimum or try again.`;
    return `You would receive ${fmtTown(got)} $SKYLINE, less than your minimum of ${fmtTown(min)} $SKYLINE, so the buy was cancelled and you keep your ETH. Lower the minimum or try again.`;
  }
  if (kind === 'sell' && SELL[name]) return SELL[name];
  return PLAIN[name] ?? `The contract refused this (${name}). Nothing was changed.`;
}

/**
 * Permit2 moves SKYLINE with a transfer that hides the token's own error and reverts with the text
 * TRANSFER_FROM_FAILED: on a sell, SKYLINE is not approved for Permit2 or the wallet holds less SKYLINE.
 */
function reasonSentence(reason: string, kind?: TradeKind): { message: string; name: string } {
  if (reason === 'TRANSFER_FROM_FAILED' && kind === 'sell')
    return {
      message: 'Permit2 could not move your $SKYLINE: $SKYLINE is not approved for Permit2, or the wallet holds less $SKYLINE than this. Check the amount, then press the sell button again.',
      name: 'TRANSFER_FROM_FAILED',
    };
  return { message: `The contract refused this: ${reason}.`, name: 'Error' };
}

/** What went wrong, in one plain sentence, and the error's name for the record (if any). */
export function explainError(e: unknown, kind?: TradeKind): { message: string; name: string | null } {
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (reverted) {
      const inner = decodeInner((reverted as unknown as { raw?: Hex }).raw);
      if (inner) return inner.name === 'Error' ? reasonSentence(String(inner.args[0]), kind) : { message: sentence(inner.name, inner.args, kind), name: inner.name };
      if (reverted.data?.errorName)
        return reverted.data.errorName === 'Error'
          ? reasonSentence(String((reverted.data.args ?? [])[0]), kind)
          : { message: sentence(reverted.data.errorName, (reverted.data.args ?? []) as readonly unknown[], kind), name: reverted.data.errorName };
      if (reverted.reason) return reasonSentence(reverted.reason, kind);
      return { message: 'The contract refused this without giving a reason. Nothing was changed.', name: null };
    }
    const codeOf = (x: unknown) => (x as { code?: number }).code;
    if (e.walk((x) => codeOf(x) === 4001)) return { message: 'You cancelled the request in your wallet. Nothing was sent.', name: 'UserRejected' };
    const text = `${e.shortMessage} ${e.details ?? ''}`.toLowerCase();
    if (text.includes('insufficient funds')) return { message: 'This wallet does not have enough ETH for this transaction and its gas.', name: 'InsufficientFunds' };
    if (e.name === 'HttpRequestError' || e.name === 'TimeoutError' || text.includes('fetch'))
      return { message: 'The network did not answer. Check your connection and try again.', name: e.name };
    if (e.name === 'ChainMismatchError') return { message: 'Your wallet is on another network. Switch it to the network this site uses, then try again.', name: e.name };
    return { message: `Something went wrong: ${e.shortMessage}`, name: e.name };
  }
  if (e instanceof Error) return { message: e.message, name: null };
  return { message: 'Something went wrong.', name: null };
}
