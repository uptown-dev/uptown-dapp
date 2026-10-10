// The fixed facts about each chain the site knows: its name, the public RPC the site reads
// through, its block explorer and the Uniswap and helper contracts it uses. Pure data, no
// imports: `vite.config.ts` reads it to write the content-security policy's connect-src (the
// build's own chain's RPC host only, F9h) and to give a build only its own chain's entry. The site
// itself imports no value from here, only types: the entry it carries comes through
// `virtual:uptown-site-chains` (see `src/lib/network.ts`).
//
// Sources: docs/research/R1b-ethereum-report.md A1 (mainnet), A5 (Multicall3), A6 (Sepolia),
// A7 (public RPCs). The UpTown contracts themselves are not here: they are in the address file
// of each chain, `src/addresses/<chainId>.json`, which the network module reads.

export type ChainId = 1 | 11155111 | 31337;

/** Uniswap v4 and helper contracts on one chain. */
export interface ChainContracts {
  poolManager: `0x${string}`;
  positionManager: `0x${string}`;
  /** V4Quoter: the buy form's estimate (CL-41). */
  v4Quoter: `0x${string}`;
  /** Universal Router 2.1.2: the site's buys and sells (CL-40, CL-41, CR-43). */
  universalRouter: `0x${string}`;
  /** Permit2: a sell's TOWN reaches the router through it (CR-43; R1b A1). */
  permit2: `0x${string}`;
  /** Multicall3: every figure is read through it in one call. */
  multicall3: `0x${string}`;
  weth: `0x${string}`;
}

export interface ChainInfo {
  chainId: ChainId;
  /** The chain's name, as the site shows it. */
  name: string;
  /** The JSON-RPC endpoint the site reads from. Public, without any key. */
  rpcUrl: string;
  /** The block explorer's base address, without a trailing slash; null where there is none. */
  explorer: string | null;
  explorerName: string | null;
  /** The Uniswap app's chain name for links (`?chain=`); null where the app does not run. */
  uniswapChain: string | null;
  /** Uniswap and helpers; for the local chain they come from its address file. */
  contracts: ChainContracts | null;
  /** True only for the private local copy of mainnet (anvil): test wallets without keys. */
  local: boolean;
}

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
/** Permit2: the same address on every chain (R1b A1, A6). */
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export const CHAINS: Record<ChainId, ChainInfo> = {
  1: {
    chainId: 1,
    name: 'Ethereum',
    // PublicNode: no key, answers latest-state reads (all the site needs) and took a burst of 60
    // parallel calls without a refusal in R1b A7. It keeps little history, which the site never reads.
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
    explorerName: 'Etherscan',
    uniswapChain: 'mainnet',
    contracts: {
      poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
      positionManager: '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
      v4Quoter: '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203',
      universalRouter: '0x23617e59A5925b2A4Bf75d73ff6711cD0b29De85',
      permit2: PERMIT2,
      multicall3: MULTICALL3,
      weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    local: false,
  },
  11155111: {
    chainId: 11155111,
    name: 'Sepolia',
    // PublicNode's Sepolia endpoint: no key, confirmed by test in R1b A6; same operator and
    // policy as the mainnet one.
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    explorerName: 'Sepolia Etherscan',
    uniswapChain: 'sepolia',
    // Re-checked for the rehearsal (CR-63, F9a, 9 October 2026, Sepolia block 11,878,774):
    // each address is in Uniswap's v4 deployments page ("Sepolia: 11155111") and
    // deployments.json (Universal Router 2.1.2 = `UniversalRouter#v2.1.2`, source tag 2.1.2), WETH
    // in the Uniswap SDK and PositionManager.WETH9(), Multicall3 in mds1/multicall3's deployment
    // list; each has code on Sepolia (`cast code`), and the router and quoter answer
    // poolManager() with the PoolManager below. `scripts/addresses.mjs --chain 11155111` also
    // copies this set into src/addresses/11155111.json, after checking it against the
    // deployment file.
    contracts: {
      poolManager: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
      positionManager: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4',
      v4Quoter: '0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227',
      universalRouter: '0x7E4f6c5e954Da5c61B3423D81E2277431Ac043f3',
      permit2: PERMIT2,
      multicall3: MULTICALL3,
      weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    },
    local: false,
  },
  31337: {
    chainId: 31337,
    name: 'Local test chain',
    // The private local copy of mainnet (anvil, script/local-chain.sh): this computer only.
    rpcUrl: 'http://127.0.0.1:8545',
    explorer: null,
    explorerName: null,
    uniswapChain: null,
    // Mainnet's, read from the local address file (it is a fork of mainnet).
    contracts: null,
    local: true,
  },
};

/**
 * The order in which the development server picks its chain when VITE_CHAIN_ID is not set:
 * launch chain first. A production build always names its chain (`buildChain` below).
 */
export const CHAIN_ORDER: ChainId[] = [1, 11155111, 31337];

/** The origin (scheme, host and port) of one chain's RPC URL, for the content-security policy. */
export function rpcOrigin(id: ChainId): string {
  return new URL(CHAINS[id].rpcUrl).origin;
}

/** The origin of every RPC URL: the development server's policy, which may show any chain. */
export function rpcOrigins(): string[] {
  return CHAIN_ORDER.map(rpcOrigin);
}

/**
 * The RPC origins of the public networks the site is built for (every chain but the local one):
 * mainnet, then Sepolia. The host's header policy (`vercel.json`, F9p) names these, so one host
 * setting serves a mainnet or a Sepolia build; each built page's own policy still names only its
 * own network's origin, and a browser obeys both, so a page can reach only that one.
 */
export function hostedRpcOrigins(): string[] {
  return CHAIN_ORDER.filter((id) => !CHAINS[id].local).map(rpcOrigin);
}

/**
 * The chain a production build is for (F9h, CL-53). Every `npm run build` names its network in
 * VITE_CHAIN_ID, and the built site then carries that chain's address file, network entry and RPC
 * host and no other chain's. Gives the chain ID, or the message the build stops with.
 */
export function buildChain(value: string | undefined): { chainId: ChainId; error?: undefined } | { chainId?: undefined; error: string } {
  const v = (value ?? '').trim();
  if (/^\d+$/.test(v) && CHAIN_ORDER.includes(Number(v) as ChainId)) return { chainId: Number(v) as ChainId };
  const said = v === '' ? 'VITE_CHAIN_ID is not set' : `VITE_CHAIN_ID is "${v}", which is not a network the site knows`;
  return {
    error:
      `${said}. Every build must name its network: VITE_CHAIN_ID=1 (Ethereum mainnet), VITE_CHAIN_ID=11155111 (Sepolia) ` +
      'or VITE_CHAIN_ID=31337 (the local test chain). For example: VITE_CHAIN_ID=1 npm run build.',
  };
}
