// THE NETWORK MODULE: the one place that knows which chain the site shows, how to reach it, its
// block explorer and where the contracts live. It holds, per chain: the name, the chain ID, the
// RPC URL, the explorer base and the address set (from `src/addresses/<chainId>.json`). Every
// explorer link on the site is built here: the "Don't trust, verify" links beside checkable
// claims, the footer's list of contracts and transaction links (CR-40, spec "Frontend ->
// Verify"). Links are plain navigation the visitor clicks; the site itself never contacts the
// explorer.
//
// Which chain a build shows (F9h, CL-53): every production build names it in `VITE_CHAIN_ID` (1,
// 11155111 or 31337; `npm run build` stops without it) and carries only that chain's network entry
// and address file, through the module `virtual:uptown-site-chains` that `vite.config.ts` writes.
// So a mainnet or Sepolia build holds no local test wallet, no local owner and no local RPC host.
// Only the development server without `VITE_CHAIN_ID` carries all three chains and picks at run
// time: the first, in the order mainnet, Sepolia, local, whose address file names the contracts.

import { getAddress } from 'viem';
import { ADDRESS_FILES, CHAIN_IDS, CHAIN_INFO, FIXED_CHAIN_ID } from 'virtual:uptown-site-chains';
import type { Address, ContractName, Deployment } from '../data/types';
import { CONTRACT_NAMES } from '../data/types';
import type { ChainContracts, ChainId, ChainInfo } from './chains';

export type { ChainId } from './chains';

/** The shape of `src/addresses/<chainId>.json`. */
interface AddressFile {
  chainId: number;
  source: string | null;
  /**
   * The token's symbol, from the deployment record (CR-102, D12a): "SKYLINE" for this generation of
   * the contracts. A file without it is the retired first deployment's (TOWN) or older, and the site
   * reads it as "not deployed" (see `readFile`).
   */
  tokenSymbol?: string | null;
  contracts: Record<string, string> | null;
  owner: string | null;
  positionTokenId: string | null;
  /** The second position's token ID (CR-102); null before the launch, or absent in an older file. */
  secondPositionTokenId?: string | null;
  /**
   * Mainnet only (F12a): the launch time and the pool ID, null after phase 1 and filled after phase 2.
   * Not used to decide whether UpTown has launched: the site asks Launcher.launched() (CR-86).
   */
  launchTime?: string | null;
  poolId?: string | null;
  uniswap: Record<string, string> | null;
  testWallets: string[];
}

export interface Network {
  chainId: ChainId;
  /** The chain's name, as the site shows it. */
  name: string;
  /** The JSON-RPC endpoint the site reads from (and, on the local chain, sends through). */
  rpcUrl: string;
  /** The block explorer's base address, without a trailing slash; `null` where there is none. */
  explorer: string | null;
  /** The explorer's name, for link titles. */
  explorerName: string | null;
  /** The Uniswap app's name for the chain; `null` where the app does not run. The site links to no other place to trade (CR-64). */
  uniswapChain: string | null;
  /** Uniswap v4 and helper contracts (PositionManager, V4Quoter, Universal Router 2.1.2, Permit2, Multicall3, WETH). */
  uniswap: ChainContracts | null;
  /**
   * Chainlink's ETH/USD feed on this chain, the site's own (`src/lib/chains.ts`, CR-102): every dollar
   * figure reads it directly. `null` where the chain has none: no dollar figure is then shown.
   */
  ethUsdFeed: Address | null;
  /** The seven contracts, the owner and the locked positions; `null`: not deployed on this chain yet. */
  deployment: Deployment | null;
  /** The private local chain: transactions go to the node from a test wallet, without a key. */
  local: boolean;
  /** The local chain's test wallets (no key exists for any of them), owner last; empty elsewhere. */
  testWallets: { label: string; address: Address }[];
  /**
   * Every staking contract the Treasury has ever paid on this chain, oldest first (CR-50), from
   * the hand-kept list below; empty when the contracts are not deployed here.
   */
  stakingContracts: StakingRecord[];
}

/** One staking contract the Treasury has paid (CR-50). */
export interface StakingRecord {
  address: Address;
  /** When the Treasury stopped paying it (seconds since 1970); null while it is the one paid. */
  replacedOn: number | null;
}

// ---------------------------------------------------------------------------------------------
// THE STAKING CONTRACTS, KEPT BY HAND (CR-50). The site reads no events, so it cannot find a
// staking contract the Treasury no longer pays. This list names every one it has ever paid on
// each chain, oldest first. "SkylineStaking" stands for the address file's SkylineStaking (CR-102).
// When a replacement is applied (Treasury.applyStaking, event StakingReplaced; the NFT staking
// contract for the "Uptowners" collection is the one planned), add the new contract at the end and
// write the date of the application as `replacedOn` of the one before it, in UTC, for example
// '2027-03-01 14:05'. The site stakes only in the contract Treasury.staking() names; every other
// contract here is shown, to a wallet with a stake in it, as "replaced on <date>: no new rewards;
// unstake and claim only".
//
// CR-72: this list is also the only place a staking transaction's address comes from. Add a new
// staking contract here (with `replacedOn: null`) as soon as the owner announces it, and publish the
// site before the replacement can be applied (the 2-day wait). Until the site lists the contract
// Treasury.staking() names, the Stake page shows its figures but turns off staking with "This site
// has not been updated for the new staking contract yet"; unstaking and claiming stay available in
// the contracts listed here.
//
// (CR-73's owner-page cards for replaced staking contracts are gone with CR-102: SkylineStaking has
// no owner, so a replaced one leaves the owner nothing to do there.)
// ---------------------------------------------------------------------------------------------
const STAKING_HISTORY: Record<ChainId, { address: 'SkylineStaking' | Address; replacedOn: string | null }[]> = {
  1: [{ address: 'SkylineStaking', replacedOn: null }],
  11155111: [{ address: 'SkylineStaking', replacedOn: null }],
  31337: [{ address: 'SkylineStaking', replacedOn: null }],
};

/** '2027-03-01 14:05' (UTC) to seconds since 1970. */
function utcSeconds(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(text.trim());
  if (!m) throw new Error(`staking history: "${text}" is not a date like 2027-03-01 14:05`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) / 1000;
}

function stakingContracts(chainId: ChainId, deployment: Deployment | null): StakingRecord[] {
  if (!deployment) return [];
  return STAKING_HISTORY[chainId].map((r) => ({
    address: r.address === 'SkylineStaking' ? deployment.contracts.SkylineStaking : getAddress(r.address),
    replacedOn: r.replacedOn === null ? null : utcSeconds(r.replacedOn),
  }));
}

// ---------------------------------------------------------------------------------------------
// Staking transactions go only to listed contracts (CR-72, spec "Frontend -> Stake"). The site
// reads Treasury.staking() and shows what it says, but an address from the RPC alone is never a
// transaction's target: every staking transaction (the SKYLINE approval, staking, unstaking,
// claiming) goes to an address from the list above, the site's own files. A contract the RPC names
// that the list does not hold gets no transaction.
// ---------------------------------------------------------------------------------------------

/** The sentence shown wherever a staking action is off because the Treasury pays a contract the site does not list. */
export const UNLISTED_STAKING = 'This site has not been updated for the new staking contract yet';

/** The listed staking contract at `address` (the site's own copy of the address), or null when the site does not list it. */
export function listedStaking(n: Network, address: string | null | undefined): Address | null {
  if (!address) return null;
  return n.stakingContracts.find((r) => r.address.toLowerCase() === address.toLowerCase())?.address ?? null;
}

/**
 * The staking contracts the site's own list marks as replaced (a replacement date), oldest first.
 * The list is the only source: an address the RPC alone names never appears here.
 */
export function replacedStaking(n: Network): StakingRecord[] {
  return n.stakingContracts.filter((r) => r.replacedOn !== null);
}

/**
 * Every address the site ever sends a transaction to, all from its own files: the seven contracts,
 * the listed staking contracts, the Universal Router and Permit2. `wallet.ts` refuses any other target.
 */
export function transactionTargets(n: Network): Address[] {
  const out: Address[] = [];
  if (n.deployment) out.push(...Object.values(n.deployment.contracts));
  out.push(...n.stakingContracts.map((r) => r.address));
  if (n.uniswap) out.push(n.uniswap.universalRouter, n.uniswap.permit2);
  return out;
}

/** The symbol of the token this site is built for (CR-102). */
export const TOKEN_SYMBOL = 'SKYLINE';

/**
 * Whether an address file names this generation's contracts (CR-102): its `tokenSymbol` is
 * "SKYLINE". The retired first deployment's file (TOWN, launched 15 October 2026) has no such field,
 * and neither has any file written before the redeployment; the site reads those as "not deployed",
 * so it can never show, or send a transaction to, the retired contracts as if they were SKYLINE's.
 */
export function isSkylineFile(file: { tokenSymbol?: string | null; contracts: unknown }): boolean {
  return !!file.contracts && file.tokenSymbol === TOKEN_SYMBOL;
}

function readFile(chainId: ChainId, info: ChainInfo, file: AddressFile): Network {
  if (info.chainId !== chainId) throw new Error(`network entry for chain ${chainId} names chain ${info.chainId}`);
  if (file.chainId !== chainId) throw new Error(`address file for chain ${chainId} names chain ${file.chainId}`);
  let deployment: Deployment | null = null;
  if (isSkylineFile(file)) {
    const contracts = {} as Record<ContractName, Address>;
    for (const name of CONTRACT_NAMES) contracts[name] = getAddress(file.contracts![name]);
    deployment = {
      contracts,
      owner: file.owner ? getAddress(file.owner) : null,
      lpTokenId: file.positionTokenId !== null ? BigInt(file.positionTokenId) : null,
      secondTokenId: file.secondPositionTokenId ? BigInt(file.secondPositionTokenId) : null,
    };
  }
  const u = file.uniswap;
  const uniswap: ChainContracts | null =
    info.contracts ??
    (u
      ? {
          poolManager: getAddress(u.poolManager),
          positionManager: getAddress(u.positionManager),
          v4Quoter: getAddress(u.v4Quoter),
          universalRouter: getAddress(u.universalRouter),
          permit2: getAddress(u.permit2),
          multicall3: getAddress(u.multicall3),
          weth: getAddress(u.weth),
          // CR-95 (F9v): the local address file copies StateView from the deployment file; an older
          // file without it leaves the SKYLINE dollar figures hidden rather than stopping the site.
          stateView: u.stateView ? getAddress(u.stateView) : null,
        }
      : null);
  const testWallets = info.local
    ? [
        ...file.testWallets.map((a, i) => ({ label: `Test wallet ${i + 1}`, address: getAddress(a) })),
        ...(file.owner ? [{ label: 'Owner', address: getAddress(file.owner) }] : []),
      ]
    : [];
  return {
    chainId,
    name: info.name,
    rpcUrl: info.rpcUrl,
    explorer: info.explorer,
    explorerName: info.explorerName,
    uniswapChain: info.uniswapChain,
    uniswap,
    ethUsdFeed: info.ethUsdFeed ? getAddress(info.ethUsdFeed) : null,
    deployment,
    local: info.local,
    testWallets,
    stakingContracts: stakingContracts(chainId, deployment),
  };
}

const CARRIED = CHAIN_IDS as ChainId[];

/** The networks this build carries: one in a production build (F9h), all three only on the development server. */
export const NETWORKS: Partial<Record<ChainId, Network>> = Object.fromEntries(
  CARRIED.map((id) => [id, readFile(id, CHAIN_INFO[id] as ChainInfo, ADDRESS_FILES[id] as AddressFile)]),
);

function chooseChain(): ChainId {
  if (FIXED_CHAIN_ID !== null) return FIXED_CHAIN_ID as ChainId;
  return CARRIED.find((id) => NETWORKS[id]!.deployment !== null) ?? CARRIED[0];
}

/** The chain this build of the site shows and transacts on. Nothing is ever sent to any other. */
export const SITE_CHAIN_ID: ChainId = chooseChain();
export const NETWORK: Network = NETWORKS[SITE_CHAIN_ID]!;

// ---------------------------------------------------------------------------------------------
// Link builders. Each gives null when the chain has no explorer (the local chain) or the
// contracts are not deployed there, so the caller shows the link as disabled.
// ---------------------------------------------------------------------------------------------

/** The explorer's page for an address (balances, transactions). */
export function addressUrl(n: Network, address: Address): string | null {
  return n.explorer ? `${n.explorer}/address/${address}` : null;
}

/** A contract's verified source code. */
export function codeUrl(n: Network, address: Address): string | null {
  return n.explorer ? `${n.explorer}/address/${address}#code` : null;
}

/** A contract's read page, where anyone can call its view functions. */
export function readUrl(n: Network, address: Address): string | null {
  return n.explorer ? `${n.explorer}/address/${address}#readContract` : null;
}

/** A token's page (total supply, holders). */
export function tokenUrl(n: Network, address: Address | null | undefined): string | null {
  return n.explorer && address ? `${n.explorer}/token/${address}` : null;
}

/** An NFT's page: `nft/<collection>/<tokenId>`. */
export function nftUrl(n: Network, collection: Address | null, tokenId: bigint | null): string | null {
  return n.explorer && collection && tokenId !== null ? `${n.explorer}/nft/${collection}/${tokenId.toString()}` : null;
}

/** A transaction's page. */
export function txUrl(n: Network, hash: string): string | null {
  return n.explorer ? `${n.explorer}/tx/${hash}` : null;
}

/** Shorthands for the seven contracts. */
export function contractUrl(n: Network, name: ContractName, page: 'address' | 'code' | 'read' = 'address'): string | null {
  const a = n.deployment?.contracts[name];
  if (!a) return null;
  return page === 'code' ? codeUrl(n, a) : page === 'read' ? readUrl(n, a) : addressUrl(n, a);
}

/**
 * The launch position's NFT on the Uniswap v4 PositionManager, held by LPVault: the token ID from the
 * address file, or, where the file was written before the launch (mainnet phase 1, CR-86), the one
 * LPVault.tokenId() answers on chain (0 before the launch: no link then).
 */
export function positionUrl(n: Network, onChain?: bigint | null): string | null {
  const id = n.deployment?.lpTokenId ?? (onChain ? onChain : null);
  return nftUrl(n, n.uniswap?.positionManager ?? null, id);
}

/** The second position's NFT (CR-102): from the address file, or LPVault.secondTokenId() on chain. */
export function secondPositionUrl(n: Network, onChain?: bigint | null): string | null {
  const id = n.deployment?.secondTokenId ?? (onChain ? onChain : null);
  return nftUrl(n, n.uniswap?.positionManager ?? null, id);
}
