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
  CycleNotReady: 'A day in this claim is not ready yet: each day can be claimed from the start of the day after next.',
  AlreadyClaimed: 'This wallet has already claimed a day in this claim. Refresh to see what is left to claim.',
  LockTooShort: 'The liquidity lock must last at least 10 years.',
  NotLater: 'A new unlock time must be later than the current one: the lock can be extended, never shortened.',
  StillLocked: 'The liquidity is still locked; it cannot be withdrawn before the unlock time.',
  InvalidRecipient: 'That address cannot receive the pool fees.',
  RenounceDisabled: 'Ownership cannot be given up; it can only be handed over in two steps.',
  SpendRateOutOfBounds: 'The daily payout rate must be between 1% and 25%.',
  InsufficientOwnerEth: 'That is more than the owner reserve holds.',
  // Launcher
  OnlyOwner: 'Only the owner can do this.',
  AlreadyLaunched: 'UpTown has already launched; the launch cannot be repeated.',
  // TownHook
  OnlyPoolManager: 'Only Uniswap’s pool manager can call TownHook.',
  WrongPool: 'This is not the TOWN pool that TownHook serves.',
  AlreadyInitialized: 'The TOWN pool already exists.',
  LiquidityLocked: 'The TOWN pool accepts no liquidity besides the launch position.',
  PartialFill: 'The pool could not fill the whole buy, so it was cancelled and you keep your ETH. Try a smaller amount.',
  // TownStaking
  OnlyTreasury: 'Only the Treasury can send rewards to staking.',
  ZeroAmount: 'Enter an amount above zero.',
  InvalidTier: 'That tier does not exist: tiers are 1 to 5.',
  NoPosition: 'This wallet has no open vault. Open one first.',
  PositionExists: 'This wallet already has an open vault. Add TOWN to it or upgrade it instead.',
  NotAnUpgrade: 'A vault can only move to a higher tier; there is no downgrade.',
  InsufficientPayment: 'Not enough ETH was sent for the vault price, which may have just changed. Refresh and try again.',
  StalePrice:
    'No ETH/USD price is available right now, so vaults cannot be opened or upgraded. Adding TOWN, unstaking and claiming still work.',
  ZeroPrice: 'The ETH/USD price in use would make this vault cost nothing, which the contract refuses.',
  WrongFeedDecimals: 'That price feed does not use 8 decimals, so it cannot be used.',
  RefundFailed: 'The staking contract could not send the extra ETH back to this wallet, so nothing happened.',
  ForwardFailed: 'The vault price could not be passed on to the treasury, so nothing happened.',
  FeedChangeNotReady: 'The announced price feed cannot take effect yet: the 7-day wait has not passed.',
  NoPendingFeed: 'No price feed change has been announced.',
  // OpenZeppelin
  ERC20InsufficientBalance: 'This wallet does not hold enough TOWN for that.',
  ERC20InsufficientAllowance: 'The staking contract may not move that much of your TOWN yet. Approve TOWN first (step 1).',
  ERC20InvalidSpender: 'That address cannot be approved to move TOWN.',
  ERC20InvalidReceiver: 'That address cannot receive TOWN.',
  ReentrancyGuardReentrantCall: 'The contract refused a call made from inside another call.',
  OwnableUnauthorizedAccount: 'Only the owner can do this.',
  SafeERC20FailedOperation: 'A token transfer failed, so nothing happened.',
  // Uniswap
  V4TooMuchRequested: 'The buy would cost more ETH than allowed, so it was cancelled and you keep your ETH.',
  TransactionDeadlinePassed: 'The buy waited too long to be included and was cancelled. Try again.',
  DeadlinePassed: 'The buy waited too long to be included and was cancelled. Try again.',
  PriceLimitAlreadyExceeded: 'The pool’s price moved past the limit, so the buy was cancelled.',
  NotEnoughLiquidity: 'The pool does not hold enough TOWN for this buy. Try a smaller amount.',
  InsufficientETH: 'Not enough ETH was sent with the buy.',
  // Permit2 (a sell's step 2)
  AllowanceExpired: 'The router’s permission to move your TOWN has expired. Do step 2, “Allow the router”, again, then sell.',
  InsufficientAllowance: 'The router may not move that much of your TOWN yet. Do step 2, “Allow the router”, for at least this amount, then sell.',
};

/** What a trade is, for the errors that read differently on a sell (CR-43). */
export type TradeKind = 'buy' | 'sell';

/** Sentences that differ on a sell: the seller keeps TOWN, not ETH. */
const SELL: Record<string, string> = {
  PartialFill: 'The pool could not fill the whole sale, so it was cancelled and you keep your TOWN. Try a smaller amount.',
  V4TooMuchRequested: 'The sale would take more TOWN than allowed, so it was cancelled and you keep your TOWN.',
  TransactionDeadlinePassed: 'The sale waited too long to be included and was cancelled. Try again.',
  DeadlinePassed: 'The sale waited too long to be included and was cancelled. Try again.',
  PriceLimitAlreadyExceeded: 'The pool’s price moved past the limit, so the sale was cancelled.',
  NotEnoughLiquidity: 'The pool does not hold enough ETH for this sale. Try a smaller amount.',
  ERC20InsufficientAllowance: 'Permit2 may not move that much of your TOWN yet. Do step 1, “Approve TOWN”, for at least this amount, then sell.',
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
      return `You would receive ${fmtEth(got, 6)} ETH, less than your minimum of ${fmtEth(min, 6)} ETH, so the sale was cancelled and you keep your TOWN. Lower the minimum or try again.`;
    return `You would receive ${fmtTown(got)} TOWN, less than your minimum of ${fmtTown(min)} TOWN, so the buy was cancelled and you keep your ETH. Lower the minimum or try again.`;
  }
  if (kind === 'sell' && SELL[name]) return SELL[name];
  return PLAIN[name] ?? `The contract refused this (${name}). Nothing was changed.`;
}

/**
 * Permit2 moves TOWN with a transfer that hides the token's own error and reverts with the text
 * TRANSFER_FROM_FAILED: on a sell, step 1 does not cover the amount or the wallet holds less TOWN.
 */
function reasonSentence(reason: string, kind?: TradeKind): { message: string; name: string } {
  if (reason === 'TRANSFER_FROM_FAILED' && kind === 'sell')
    return {
      message: 'Permit2 could not move your TOWN: step 1, “Approve TOWN”, does not cover this amount, or the wallet holds less TOWN than this. Check both, then sell.',
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
