// THE NETWORK MODULE: the one place that knows which chain the site shows, how to reach it, its
// block explorer and where the contracts live. It holds, per chain: the name, the chain ID, the
// RPC URL, the explorer base and the address set (from `src/addresses/<chainId>.json`). Every
// explorer link on the site is built here: the "Don't trust, verify" links beside checkable
// claims, the footer's list of contracts and transaction links (CR-40, spec "Frontend ->
// Verify"). Links are plain navigation the visitor clicks; the site itself never contacts the
// explorer.
//
// Which chain a build shows: `VITE_CHAIN_ID` (1, 11155111 or 31337) when the build sets it;
// otherwise the first chain, in the order mainnet, Sepolia, local, whose address file names the
// contracts. So filling Sepolia's file (milestone 9) or mainnet's (launch) is all it takes.

import { getAddress } from 'viem';
import mainnetFile from '../addresses/1.json';
import sepoliaFile from '../addresses/11155111.json';
import localFile from '../addresses/31337.json';
import type { Address, ContractName, Deployment } from '../data/types';
import { CONTRACT_NAMES } from '../data/types';
import { CHAINS, CHAIN_ORDER, type ChainContracts, type ChainId } from './chains';

export type { ChainId } from './chains';

/** The shape of `src/addresses/<chainId>.json`. */
interface AddressFile {
  chainId: number;
  source: string | null;
  contracts: Record<string, string> | null;
  owner: string | null;
  positionTokenId: string | null;
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
  /** The seven contracts, the owner and the locked position; `null`: not deployed on this chain yet. */
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
// each chain, oldest first. "TownStaking" stands for the address file's TownStaking. When a
// replacement is applied (Treasury.applyStaking, event StakingReplaced), add the new contract
// at the end and write the date of the application as `replacedOn` of the one before it, in
// UTC, for example '2027-03-01 14:05'. The site offers vaults only in the contract
// Treasury.staking() names; every other contract here is shown, to a wallet with a vault in it,
// as "replaced on <date>: no new rewards; unstake and claim only".
// ---------------------------------------------------------------------------------------------
const STAKING_HISTORY: Record<ChainId, { address: 'TownStaking' | Address; replacedOn: string | null }[]> = {
  1: [{ address: 'TownStaking', replacedOn: null }],
  11155111: [{ address: 'TownStaking', replacedOn: null }],
  31337: [{ address: 'TownStaking', replacedOn: null }],
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
    address: r.address === 'TownStaking' ? deployment.contracts.TownStaking : getAddress(r.address),
    replacedOn: r.replacedOn === null ? null : utcSeconds(r.replacedOn),
  }));
}

function readFile(chainId: ChainId, file: AddressFile): Network {
  const info = CHAINS[chainId];
  if (file.chainId !== chainId) throw new Error(`address file for chain ${chainId} names chain ${file.chainId}`);
  let deployment: Deployment | null = null;
  if (file.contracts) {
    const contracts = {} as Record<ContractName, Address>;
    for (const name of CONTRACT_NAMES) contracts[name] = getAddress(file.contracts[name]);
    deployment = {
      contracts,
      owner: file.owner ? getAddress(file.owner) : null,
      lpTokenId: file.positionTokenId !== null ? BigInt(file.positionTokenId) : null,
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
    deployment,
    local: info.local,
    testWallets,
    stakingContracts: stakingContracts(chainId, deployment),
  };
}

export const NETWORKS: Record<ChainId, Network> = {
  1: readFile(1, mainnetFile as AddressFile),
  11155111: readFile(11155111, sepoliaFile as AddressFile),
  31337: readFile(31337, localFile as AddressFile),
};

function chooseChain(): ChainId {
  const fromBuild = Number(import.meta.env.VITE_CHAIN_ID ?? '');
  if (CHAIN_ORDER.includes(fromBuild as ChainId)) return fromBuild as ChainId;
  return CHAIN_ORDER.find((id) => NETWORKS[id].deployment !== null) ?? 1;
}

/** The chain this build of the site shows and transacts on. Nothing is ever sent to any other. */
export const SITE_CHAIN_ID: ChainId = chooseChain();
export const NETWORK: Network = NETWORKS[SITE_CHAIN_ID];

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

/** The launch position's NFT on the Uniswap v4 PositionManager, held by LPVault. */
export function positionUrl(n: Network): string | null {
  return nftUrl(n, n.uniswap?.positionManager ?? null, n.deployment?.lpTokenId ?? null);
}
