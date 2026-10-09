#!/usr/bin/env node
// Runs first in `npm run build` (F9h, CL-53): every production build names its network in
// VITE_CHAIN_ID, 1 (Ethereum mainnet), 11155111 (Sepolia) or 31337 (the local test chain). Without
// it, or with any other value, the build stops here with a plain message and builds nothing.
// vite.config.ts makes the same check, for a `vite build` started some other way.
//
// Usage: VITE_CHAIN_ID=1 node scripts/check-chain.mjs
import { buildChain } from '../src/lib/chains.ts';

const b = buildChain(process.env.VITE_CHAIN_ID);
if (b.error !== undefined) {
  console.error(`build: ${b.error} Nothing was built.`);
  process.exit(1);
}
console.log(`build: for chain ${b.chainId}`);
