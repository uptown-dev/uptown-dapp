// THE NETWORK MODULE: the one place that knows which chain the site shows, that chain's block
// explorer and where the contracts live. Every explorer link on the site is built here: the
// "Don't trust, verify" links beside checkable claims and the footer's list of contracts (CR-40,
// spec "Frontend → Verify"). Links are plain navigation the visitor clicks; the site itself
// never contacts the explorer.

import { SAMPLE_DEPLOYMENT } from '../data/placeholder';
import type { Address, ContractName, Deployment } from '../data/types';

export type ChainId = 1 | 11155111 | 31337;

export interface Network {
  chainId: ChainId;
  /** The chain's name, as the site shows it. */
  name: string;
  /** The block explorer's base address, without a trailing slash; `null` where there is none. */
  explorer: string | null;
  /** The explorer's name, for link titles. */
  explorerName: string | null;
  /** Uniswap v4 PositionManager, which holds the launch position's NFT (R1b A1 and A6); `null` on the local chain. */
  positionManager: Address | null;
  /** The seven contracts, the owner and the locked position on this chain. */
  deployment: Deployment;
}

/** Explorer bases: Etherscan for Ethereum mainnet and Sepolia (R1b A6), none for the local chain. */
export const NETWORKS: Record<ChainId, Network> = {
  1: {
    chainId: 1,
    name: 'Ethereum',
    explorer: 'https://etherscan.io',
    explorerName: 'Etherscan',
    positionManager: '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
    // Phase one: sample addresses. Phase two: the mainnet deployment.
    deployment: SAMPLE_DEPLOYMENT,
  },
  11155111: {
    chainId: 11155111,
    name: 'Sepolia',
    explorer: 'https://sepolia.etherscan.io',
    explorerName: 'Sepolia Etherscan',
    positionManager: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4',
    // Phase one: sample addresses. Phase two: the Sepolia rehearsal's deployment.
    deployment: SAMPLE_DEPLOYMENT,
  },
  31337: {
    chainId: 31337,
    name: 'Local test chain',
    explorer: null,
    explorerName: null,
    positionManager: null,
    // Phase one: sample addresses. Phase two: whatever the local deployment script reports.
    deployment: SAMPLE_DEPLOYMENT,
  },
};

export const CHAIN_IDS: ChainId[] = [1, 11155111, 31337];

/** The chain the site shows. Ethereum mainnet (chain ID 1) is the launch chain. */
export const DEFAULT_CHAIN_ID: ChainId = 1;

export function getNetwork(id: number | string | null | undefined): Network {
  const n = Number(id);
  return (NETWORKS as Record<number, Network>)[n] ?? NETWORKS[DEFAULT_CHAIN_ID];
}

// ---------------------------------------------------------------------------------------------
// Link builders. Each gives null when the chain has no explorer (the local chain), so the
// caller shows the link as disabled.
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
export function tokenUrl(n: Network, address: Address): string | null {
  return n.explorer ? `${n.explorer}/token/${address}` : null;
}

/** An NFT's page: `nft/<collection>/<tokenId>`. */
export function nftUrl(n: Network, collection: Address | null, tokenId: bigint | null): string | null {
  return n.explorer && collection && tokenId !== null ? `${n.explorer}/nft/${collection}/${tokenId.toString()}` : null;
}

/** Shorthands for the seven contracts. */
export function contractUrl(n: Network, name: ContractName, page: 'address' | 'code' | 'read' = 'address'): string | null {
  const a = n.deployment.contracts[name];
  return page === 'code' ? codeUrl(n, a) : page === 'read' ? readUrl(n, a) : addressUrl(n, a);
}

/** The launch position's NFT on the Uniswap v4 PositionManager, held by LPVault. */
export function positionUrl(n: Network): string | null {
  return nftUrl(n, n.positionManager, n.deployment.lpTokenId);
}
