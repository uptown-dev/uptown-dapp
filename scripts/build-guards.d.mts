/** The frontend folder. */
export const ROOT: string;
/** The local chain's test wallets, owner and deployer, lower case. */
export function localWallets(): string[];
/** Searches every file under `dir` (relative to the frontend folder) for each word, ignoring case. */
export function searchFiles(dir: string, words: string[]): { files: number; hits: string[] };
/** Deletes a folder under the frontend folder (a build that must not be published). */
export function removeDir(dir: string): void;
