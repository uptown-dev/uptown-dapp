// The chains this build carries (F9h, CL-53), written by `vite.config.ts` (plugin
// "uptown-site-chains"). A production build carries exactly one: the chain VITE_CHAIN_ID names,
// with only that chain's network entry (`src/lib/chains.ts`) and address file
// (`src/addresses/<chainId>.json`). The development server without VITE_CHAIN_ID carries all three
// and lets the network module choose at run time. The network module checks the shapes.
declare module 'virtual:uptown-site-chains' {
  /** The chains carried, in the order mainnet, Sepolia, local. */
  export const CHAIN_IDS: number[];
  /** The chain VITE_CHAIN_ID names; null only on the development server without it. */
  export const FIXED_CHAIN_ID: number | null;
  /** Each carried chain's entry from `CHAINS` in `src/lib/chains.ts`. */
  export const CHAIN_INFO: Record<number, unknown>;
  /** Each carried chain's address file. */
  export const ADDRESS_FILES: Record<number, unknown>;
}
