// The quick amounts on both sides of the trade panel (CR-82 item 4): 25%, 50%, 75% and 100% of
// the wallet's balance, in whole units (wei), never through a decimal number, so 100% of the TOWN is
// the balance to the last unit. A buy keeps back enough ETH to pay for its own gas.
import { formatUnits } from 'viem';

export const QUICK_SHARES = [25, 50, 75, 100] as const;
export type QuickShare = (typeof QUICK_SHARES)[number];

/** `pct`% of `balance`, rounded down to the unit; 100% is the balance itself. */
export function shareOf(balance: bigint, pct: QuickShare): bigint {
  if (balance <= 0n) return 0n;
  return pct === 100 ? balance : (balance * BigInt(pct)) / 100n;
}

/**
 * The gas a buy is allowed for this purpose: 200,000. A buy through the Universal Router measured
 * about 138,000 to 172,000 gas on a mainnet fork (spec "Known risks -> Gas cost"); a buy carries no
 * explicit gas limit, so the wallet sets its own from its estimate, and 200,000 sits above the
 * dearest buy measured.
 */
export const BUY_GAS_ALLOWANCE = 200_000n;

/**
 * The margin on the gas kept back: three times the allowance at the network's current maximum fee
 * per gas. Wallets add their own headroom to both the gas limit and the fee, and require the whole
 * of it in the balance before they send; three times covers a wallet that adds 50% to the gas and
 * doubles the fee, with room left for the fee rising between the press and the send.
 */
export const BUY_GAS_MARGIN = 3n;

/** The ETH a buy keeps back for its gas: the gas allowance times the current maximum fee per gas, times the margin. */
export function buyGasReserve(maxFeePerGas: bigint): bigint {
  return BUY_GAS_ALLOWANCE * maxFeePerGas * BUY_GAS_MARGIN;
}

/** `pct`% of the ETH left after the gas kept back; null when the balance does not exceed it. */
export function buyShare(balance: bigint, maxFeePerGas: bigint, pct: QuickShare): bigint | null {
  const keep = buyGasReserve(maxFeePerGas);
  if (balance <= keep) return null;
  return shareOf(balance - keep, pct);
}

/** The text a quick button puts in the field: every decimal, no grouping, so the field reads back as exactly `value`. */
export function quickText(value: bigint, decimals = 18): string {
  return formatUnits(value, decimals);
}
