// THE PROJECT'S PLACES (CR-84): the four addresses behind the footer's platform marks.
//
// X and Telegram are the project's own accounts, so they are fixed text, written once here.
//
// GMGN is different: its page is a token page on Ethereum mainnet, so its address is the TOWN
// address from the site's own chain-1 address file, `src/addresses/1.json` — the same file the rest
// of the site reads for mainnet, never typed in by hand. Today that file says "not deployed"
// (`contracts: null`), so there is no address, no link, and the footer shows no GMGN mark at all
// (the owner's decision of 11 October 2026, in place of CR-84's dimmed mark); when the mainnet
// deployment fills that file at milestone 12 the mark appears as a working link, with no further
// change here.
//
// The chain-1 file is imported straight, not through `virtual:uptown-site-chains` (which carries
// only the chain the build is for, F9h/CL-53), so a Sepolia or local build shows exactly the same
// state for this mark as the mainnet build does. The file holds no local-chain data, so a public
// build still carries none (`noLocalData` in vite.config.ts checks that on every build).

import { getAddress } from 'viem';
import MAINNET_FILE from '../addresses/1.json';
import type { Address } from '../data/types';

/** The project's account on X. */
export const X_URL = 'https://x.com/UpTownHook';

/** The project's group on Telegram. */
export const TELEGRAM_URL = 'https://t.me/uptownhook';

/** The part of the chain-1 address file this module reads; every field is null before the deployment. */
const FILE = MAINNET_FILE as { chainId: number; contracts: Record<string, string> | null };
if (FILE.chainId !== 1) throw new Error(`src/addresses/1.json names chain ${FILE.chainId}, not Ethereum mainnet`);

/**
 * TOWN's address on Ethereum mainnet, from the site's own chain-1 address file; `null` while that
 * file names no contracts (today) or names something that is not an address.
 */
export function mainnetTownAddress(): Address | null {
  const a = FILE.contracts?.UpTownToken;
  if (!a) return null;
  try {
    return getAddress(a);
  } catch {
    return null;
  }
}

/** GMGN's page for TOWN on Ethereum; `null` while the site has no mainnet TOWN address, and then no mark is shown. */
export function gmgnUrl(town: Address | null): string | null {
  return town ? `https://gmgn.ai/eth/token/${town}` : null;
}
