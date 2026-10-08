// The actions the site sends (docs/tasks/F8b-frontend.md, "Transactions"), each built as one
// contract call. Nothing here sends: `wallet.ts` does, after its checks.
import { encodeAbiParameters, type Abi } from 'viem';
import { PERMIT2_ABI, REWARDS_ABI, ROUTER_ABI, STAKING_ABI, TOKEN_ABI, TREASURY_ABI } from './abi';
import type { Network } from './network';
import { buyerHookData, poolKey } from './reads';
import type { TxRequest } from './wallet';
import type { Address, Tier } from '../data/types';

/** Staking transactions carry this gas limit so the day's payout can run alongside (spec "Frontend -> Stake"; CR-25, CR-32, CR-35). */
export const STAKING_GAS_LIMIT = 700_000n;

/** How long a buy or a sell may wait to be included before the router refuses it. */
export const BUY_DEADLINE_SECONDS = 20 * 60;

/** How long the router's Permit2 allowance (a sell's step 2) lasts: 30 days, as the Uniswap app uses. */
export const ROUTER_ALLOWANCE_SECONDS = 30 * 24 * 60 * 60;

/** The largest Permit2 allowance (uint160). */
const MAX_UINT160 = 2n ** 160n - 1n;

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
 * Buy TOWN: Universal Router 2.1.2 `execute(0x10, [abi.encode(actions, params)], deadline)`, one
 * exact-input single swap of ETH for TOWN with the buyer's address as `hookData`, the minimum
 * received as `amountOutMinimum` (and as TAKE_ALL's minimum), `minHopPriceX36 = 0`, then
 * SETTLE_ALL (ETH in) and TAKE_ALL (TOWN out). `msg.value` is the ETH paid.
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
 * Sell TOWN: Universal Router 2.1.2 `execute(0x10, [abi.encode(actions, params)], deadline)`, one
 * exact-input single swap of TOWN for ETH (`zeroForOne = false`, no `hookData`), the minimum ETH
 * as `amountOutMinimum` (and as TAKE_ALL's minimum), `minHopPriceX36 = 0`, then SETTLE_ALL (TOWN
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

/** A sell's step 1: `UpTownToken.approve(Permit2, amount)`. */
export function approvePermit2Tx(n: Network, amount: bigint): TxRequest {
  return { address: n.deployment!.contracts.UpTownToken, abi: TOKEN_ABI as Abi, functionName: 'approve', args: [n.uniswap!.permit2, amount] };
}

/** A sell's step 2: `Permit2.approve(TOWN, Universal Router, amount, expiration)`, an on-chain approval (no signed message). */
export function allowRouterTx(n: Network, amount: bigint, expiration: bigint): TxRequest {
  const a = amount > MAX_UINT160 ? MAX_UINT160 : amount;
  return {
    address: n.uniswap!.permit2,
    abi: PERMIT2_ABI as Abi,
    functionName: 'approve',
    args: [n.deployment!.contracts.UpTownToken, n.uniswap!.universalRouter, a, expiration],
  };
}

/** Claim rebates: `BuyerRewards.claim(cycles)`, oldest ready days first. */
export function claimRebatesTx(n: Network, days: number[]): TxRequest {
  return { address: n.deployment!.contracts.BuyerRewards, abi: REWARDS_ABI as Abi, functionName: 'claim', args: [days.map(BigInt)] };
}

/** Approve TOWN: `UpTownToken.approve(TownStaking, amount)`, the exact amount, never unlimited. */
export function approveTx(n: Network, amount: bigint): TxRequest {
  const k = n.deployment!.contracts;
  return { address: k.UpTownToken, abi: TOKEN_ABI as Abi, functionName: 'approve', args: [k.TownStaking, amount] };
}

function staking(n: Network, functionName: string, args: readonly unknown[] = [], value?: bigint): TxRequest {
  return { address: n.deployment!.contracts.TownStaking, abi: STAKING_ABI as Abi, functionName, args, value, gas: STAKING_GAS_LIMIT };
}

/** The ETH sent with a purchase or upgrade: about 1% above the quote; the contract refunds the rest. */
export function withMargin(wei: bigint): bigint {
  return (wei * 101n) / 100n;
}

/** Open a vault: `openVault(tier, amount)` with `vaultPriceWei(tier)` plus about 1%. */
export const openVaultTx = (n: Network, tier: Tier, amount: bigint, priceWei: bigint) => staking(n, 'openVault', [tier, amount], withMargin(priceWei));
/** Add TOWN: `addStake(amount)`. */
export const addStakeTx = (n: Network, amount: bigint) => staking(n, 'addStake', [amount]);
/** Upgrade: `upgradeVault(newTier)` with `upgradePriceWei(wallet, newTier)` plus about 1%. */
export const upgradeTx = (n: Network, tier: Tier, priceWei: bigint) => staking(n, 'upgradeVault', [tier], withMargin(priceWei));
/** Unstake: `unstake()`, a full exit. */
export const unstakeTx = (n: Network) => staking(n, 'unstake');
/** Claim WETH: `TownStaking.claim()`. */
export const claimWethTx = (n: Network) => staking(n, 'claim');

/** Trigger today's payout: `Treasury.poke()`. */
export function pokeTx(n: Network): TxRequest {
  return { address: n.deployment!.contracts.Treasury, abi: TREASURY_ABI as Abi, functionName: 'poke' };
}

/** Put an announced staking contract in use once its 2-day wait has passed: `Treasury.applyStaking()`, open to anyone (CR-46). */
export function applyStakingTx(n: Network): TxRequest {
  return { address: n.deployment!.contracts.Treasury, abi: TREASURY_ABI as Abi, functionName: 'applyStaking' };
}
