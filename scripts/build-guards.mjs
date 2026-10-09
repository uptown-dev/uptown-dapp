// File-system helpers for vite.config.ts (F9h, CL-53), kept in plain JavaScript because the site's
// TypeScript setup has no Node types. Types in build-guards.d.mts.
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The frontend folder. */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The local chain's wallets, lower case: its test wallets, its owner and its deployer, from the
 * site's local address file and the Deployer's local deployment file, where they exist.
 */
export function localWallets() {
  const found = new Set();
  for (const f of [join(ROOT, 'src', 'addresses', '31337.json'), join(ROOT, '..', 'script', 'deployments', '31337.json')]) {
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const list = [...(Array.isArray(j.testWallets) ? j.testWallets : []), j.owner, j.deployer];
    for (const a of list) if (typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)) found.add(a.toLowerCase());
  }
  return [...found];
}

/**
 * Searches every file under `dir` (relative to the frontend folder) for each word, ignoring case.
 * Gives the number of files and one "file: word" line per hit.
 */
export function searchFiles(dir, words) {
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(join(ROOT, dir));
  const hits = [];
  for (const f of files) {
    const text = readFileSync(f, 'latin1').toLowerCase();
    for (const w of words) if (text.includes(w.toLowerCase())) hits.push(`${relative(ROOT, f).replace(/\\/g, '/')}: ${w}`);
  }
  return { files: files.length, hits };
}

/** Deletes a folder under the frontend folder (a build that must not be published). */
export function removeDir(dir) {
  rmSync(join(ROOT, dir), { recursive: true, force: true });
}
