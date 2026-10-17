// The actions the site sends (docs/tasks/F8b-frontend.md, "Transactions"), each built as one
// contract call. Nothing here sends: `wallet.ts` does, after its checks.
import { encodeAbiParameters, type Abi } from 'viem';
import { LAUNCHER_ABI, LPVAULT_ABI, PERMIT2_ABI, REWARDS_ABI, ROUTER_ABI, STAKING_ABI, TOKEN_ABI, TREASURY_ABI } from './abi';
import { UNLISTED_STAKING, listedStaking, type Network } from './network';
import { buyerHookData, poolKey } from './reads';
import type { TxRequest } from './wallet';
import type { Address } from '../data/types';

/**
 * Staking transactions carry this gas limit so the day's payout can run alongside (spec "Frontend ->
 * Stake"; CR-25, CR-32, CR-35). It also covers the Deployer's finding (D12a): a staking call priced on
 * one block and sent a few blocks later can find the day's payout due and need more gas than its
 * estimate said; with the limit set here no estimate is used at all.
 */
export const STAKING_GAS_LIMIT = 700_000n;

/** How long a buy or a sell may wait to be included before the router refuses it. */
export const BUY_DEADLINE_SECONDS = 20 * 60;

/** How long the router's Permit2 allowance (a sell's second approval) lasts: 30 days, as the Uniswap app uses; then it is renewed. */
export const ROUTER_ALLOWANCE_SECONDS = 30 * 24 * 60 * 60;

/** The largest Permit2 allowance (uint160): the router's permission, without a limit (CR-83). */
export const MAX_UINT160 = 2n ** 160n - 1n;
/** The largest token allowance (uint256): SKYLINE's approval of Permit2, without a limit, once ever (CR-83). */
export const MAX_UINT256 = 2n ** 256n - 1n;

// Universal Router command and action codes (R1b A2).
const V4_SWAP = '0x10';
const SWAP_EXACT_IN_SINGLE_SETTLE_ALL_TAKE_ALL = '0x060c0f';

const POOL_KEY = {
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ],
} as const;

/** ExactInputSingleParams of Universal Routers 2.1.1 and later, with `minHopPriceX36` (R1b A2). */
const EXACT_INPUT_SINGLE = [
  {
    type: 'tuple',
    components: [
      { name: 'poolKey', ...POOL_KEY },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountIn', type: 'uint128' },
      { name: 'amountOutMinimum', type: 'uint128' },
      { name: 'minHopPriceX36', type: 'uint256' },
      { name: 'hookData', type: 'bytes' },
    ],
  },
] as const;

const CURRENCY_AMOUNT = [{ type: 'address' }, { type: 'uint256' }] as const;

/**
 * Buy SKYLINE: Universal Router 2.1.2 `execute(0x10, [abi.encode(actions, params)], deadline)`, one
 * exact-input single swap of ETH for SKYLINE with the buyer's address as `hookData`, the minimum
 * received as `amountOutMinimum` (and as TAKE_ALL's minimum), `minHopPriceX36 = 0`, then
 * SETTLE_ALL (ETH in) and TAKE_ALL (SKYLINE out). `msg.value` is the ETH paid.
 */
export function buyTx(n: Network, buyer: Address, amountIn: bigint, minOut: bigint, deadline: bigint): TxRequest {
  const key = poolKey(n);
  const swap = encodeAbiParameters(EXACT_INPUT_SINGLE, [
    { poolKey: key, zeroForOne: true, amountIn, amountOutMinimum: minOut, minHopPriceX36: 0n, hookData: buyerHookData(buyer) },
  ]);
  const settle = encodeAbiParameters(CURRENCY_AMOUNT, [key.currency0, amountIn]);
  const take = encodeAbiParameters(CURRENCY_AMOUNT, [key.currency1, minOut]);
  const input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [SWAP_EXACT_IN_SINGLE_SETTLE_ALL_TAKE_ALL, [swap, settle, take]]);
  return {
    address: n.uniswap!.universalRouter,
    abi: ROUTER_ABI as Abi,
    functionName: 'execute',
    args: [V4_SWAP, [input], deadline],
    value: amountIn,
  };
}

/**
 * Sell SKYLINE: Universal Router 2.1.2 `execute(0x10, [abi.encode(actions, params)], deadline)`, one
 * exact-input single swap of SKYLINE for ETH (`zeroForOne = false`, no `hookData`), the minimum ETH
 * as `amountOutMinimum` (and as TAKE_ALL's minimum), `minHopPriceX36 = 0`, then SETTLE_ALL (SKYLINE
 * in, paid through Permit2 after the swap, spec "Known risks -> Pay-first routers") and TAKE_ALL
 * (ETH out to the seller). No ETH is sent with it.
 */
export function sellTx(n: Network, amountIn: bigint, minOut: bigint, deadline: bigint): TxRequest {
  const key = poolKey(n);
  const swap = encodeAbiParameters(EXACT_INPUT_SINGLE, [{ poolKey: key, zeroForOne: false, amountIn, amountOutMinimum: minOut, minHopPriceX36: 0n, hookData: '0x' }]);
  const settle = encodeAbiParameters(CURRENCY_AMOUNT, [key.currency1, amountIn]);
  const take = encodeAbiParameters(CURRENCY_AMOUNT, [key.currency0, minOut]);
  const input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [SWAP_EXACT_IN_SINGLE_SETTLE_ALL_TAKE_ALL, [swap, settle, take]]);
  return {
    address: n.uniswap!.universalRouter,
    abi: ROUTER_ABI as Abi,
    functionName: 'execute',
    args: [V4_SWAP, [input], deadline],
  };
}

/**
 * A sell's first approval (CR-83): `UpTownToken.approve(Permit2, type(uint256).max)`, without a
 * limit, once ever, as the Uniswap app does. Permit2 then moves the wallet's SKYLINE only for a spender
 * the wallet itself has allowed in Permit2 (the router, below).
 */
export function approvePermit2Tx(n: Network): TxRequest {
  return { address: n.deployment!.contracts.UpTownToken, abi: TOKEN_ABI as Abi, functionName: 'approve', args: [n.uniswap!.permit2, MAX_UINT256] };
}

/**
 * A sell's second approval (CR-83): `Permit2.approve(SKYLINE, Universal Router, type(uint160).max,
 * expiration)`, without a limit until `expiration` (30 days on), an on-chain approval (no signed
 * message). The router moves a wallet's SKYLINE only in a trade that wallet itself sends.
 */
export function allowRouterTx(n: Network, expiration: bigint): TxRequest {
  return {
    address: n.uniswap!.permit2,
    abi: PERMIT2_ABI as Abi,
    functionName: 'approve',
    args: [n.deployment!.contracts.UpTownToken, n.uniswap!.universalRouter, MAX_UINT160, expiration],
  };
}

/** Claim rebates: `BuyerRewards.claim(cycles)`, oldest ready days first. */
export function claimRebatesTx(n: Network, days: number[]): TxRequest {
  return { address: n.deployment!.contracts.BuyerRewards, abi: REWARDS_ABI as Abi, functionName: 'claim', args: [days.map(BigInt)] };
}

/** Thrown when a staking transaction is asked for a contract the site does not list (CR-72). */
export class UnlistedStakingError extends Error {
  constructor(address: string) {
    super(`${UNLISTED_STAKING}: it does not list ${address}, so nothing is sent there.`);
  }
}

/**
 * The listed staking contract at `address` (CR-72): the site's own copy of the address, from the
 * network module's list. A staking transaction is never built for an address the RPC alone names.
 */
function listed(n: Network, address: Address): Address {
  const a = listedStaking(n, address);
  if (!a) throw new UnlistedStakingError(address);
  return a;
}

/**
 * Approve SKYLINE: `UpTownToken.approve(staking, amount)`, the exact amount, never unlimited (CR-82).
 * The spender is the staking contract the Treasury pays now, `Treasury.staking()` (CR-50), and only
 * when the site lists it (CR-72).
 */
export function approveTx(n: Network, stakingAddress: Address, amount: bigint): TxRequest {
  return { address: n.deployment!.contracts.UpTownToken, abi: TOKEN_ABI as Abi, functionName: 'approve', args: [listed(n, stakingAddress), amount] };
}

/**
 * A staking action, sent to the given staking contract, which must be listed in the site's own files
 * (CR-72): staking only ever to the one the Treasury pays now (CR-50); unstake and claim also to a
 * replaced one, for a stake left there. Every one carries the 700,000 gas limit.
 */
function staking(n: Network, stakingAddress: Address, functionName: string, args: readonly unknown[] = []): TxRequest {
  return { address: listed(n, stakingAddress), abi: STAKING_ABI as Abi, functionName, args, gas: STAKING_GAS_LIMIT };
}

/** Stake: `stake(amount)`, in the current staking contract only. Free: no ETH is sent (CR-102 amended). */
export const stakeTx = (n: Network, stakingAddress: Address, amount: bigint) => staking(n, stakingAddress, 'stake', [amount]);
/** Unstake: `unstake(amount)`, any amount up to the stake; also in a replaced staking contract (CR-50). */
export const unstakeTx = (n: Network, stakingAddress: Address, amount: bigint) => staking(n, stakingAddress, 'unstake', [amount]);
/** Claim WETH: `claim()`; also in a replaced staking contract (CR-50). */
export const claimWethTx = (n: Network, stakingAddress: Address) => staking(n, stakingAddress, 'claim');

/** Trigger today's payout: `Treasury.poke()`. */
export function pokeTx(n: Network): TxRequest {
  return { address: n.deployment!.contracts.Treasury, abi: TREASURY_ABI as Abi, functionName: 'poke' };
}

/** Put an announced staking contract in use once its 2-day wait has passed: `Treasury.applyStaking()`, open to anyone (CR-46). */
export function applyStakingTx(n: Network): TxRequest {
  return { address: n.deployment!.contracts.Treasury, abi: TREASURY_ABI as Abi, functionName: 'applyStaking' };
}

// ---------------------------------------------------------------------------------------------
// The owner page (CR-64): every power in the spec's "Owner powers" table, one call each. The
// contracts refuse each owner-only call from anyone but the owner; the page only arranges them.
// ---------------------------------------------------------------------------------------------

/** The contract each owner action goes to (CR-102: SkylineStaking has no owner). */
export type OwnerTarget = 'Treasury' | 'LPVault' | 'Launcher';

const OWNER_ABIS = { Treasury: TREASURY_ABI, LPVault: LPVAULT_ABI, Launcher: LAUNCHER_ABI } as const;

/** One owner call, to a contract from the address file; `value` only for the launch (CR-102: 0.13 ETH). */
export function ownerTx(n: Network, target: OwnerTarget, functionName: string, args: readonly unknown[] = [], value?: bigint): TxRequest {
  return { address: n.deployment!.contracts[target], abi: OWNER_ABIS[target] as Abi, functionName, args, ...(value !== undefined ? { value } : {}) };
}
