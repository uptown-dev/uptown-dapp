// THE PROJECT'S PLACES (CR-84): the four addresses behind the footer's platform marks.
//
// X and Telegram are the project's own accounts, so they are fixed text, written once here.
//
// GMGN is different: its page is a token page on Ethereum mainnet, so its address is the SKYLINE
// address from the site's own chain-1 address file, `src/addresses/1.json` — the same file the rest
// of the site reads for mainnet, never typed in by hand. Only a file that names SKYLINE counts
// (CR-102: `"tokenSymbol": "SKYLINE"`). Since the owner's SKYLINE phase 1 (17 October 2026) that
// file is SKYLINE's, deployed and not launched, so the mark is a working link to the token's page
// there: the link does not wait for the launch. A file with no SKYLINE address (none at all, or the
// retired first deployment's, TOWN, which has no `tokenSymbol`) gives no address and no link: the
// mark is shown all the same (CR-88 item 3), at full strength, not a link, and saying "at launch".
//
// The chain-1 file is imported straight, not through `virtual:uptown-site-chains` (which carries
// only the chain the build is for, F9h/CL-53), so a Sepolia or local build shows exactly the same
// state for this mark as the mainnet build does. The file holds no local-chain data, so a public
// build still carries none (`noLocalData` in vite.config.ts checks that on every build).

import { getAddress } from 'viem';
import MAINNET_FILE from '../addresses/1.json';
import type { Address } from '../data/types';
import { isSkylineFile } from './network';

/** The project's account on X. */
export const X_URL = 'https://x.com/UpTownHook';

/** The project's group on Telegram. */
export const TELEGRAM_URL = 'https://t.me/uptownhook';

/** The part of the chain-1 address file this module reads; every field is null before the deployment. */
const FILE = MAINNET_FILE as { chainId: number; tokenSymbol?: string | null; contracts: Record<string, string> | null };
if (FILE.chainId !== 1) throw new Error(`src/addresses/1.json names chain ${FILE.chainId}, not Ethereum mainnet`);

/**
 * SKYLINE's address on Ethereum mainnet, from the site's own chain-1 address file; `null` while that
 * file names no SKYLINE contracts (for example a file of the retired TOWN deployment) or names
 * something that is not an address. `file` is a parameter only so a test can try other files.
 */
export function mainnetSkylineAddress(file: { tokenSymbol?: string | null; contracts: Record<string, string> | null } = FILE): Address | null {
  if (!isSkylineFile(file)) return null;
  const a = file.contracts?.UpTownToken;
  if (!a) return null;
  try {
    return getAddress(a);
  } catch {
    return null;
  }
}

/** GMGN's page for SKYLINE on Ethereum; `null` while the site has no mainnet SKYLINE address, and the mark then says "at launch". */
export function gmgnUrl(token: Address | null): string | null {
  return token ? `https://gmgn.ai/eth/token/${token}` : null;
}
