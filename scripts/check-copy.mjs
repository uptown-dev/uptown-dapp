#!/usr/bin/env node
// Copy check: scans the site's source and its built output for words the site must never use
// (docs/SPEC_SUMMARY.md sections 11 and 13, docs/tasks/F8a-frontend.md, docs/tasks/F8a3-frontend.md)
// and fails if it finds one. Run with `npm run check:copy` after `npm run build`. F8a3 added the
// price-expectation terms and the lore names, which the redesigned site no longer uses.
//
// Where a forbidden word is needed to say what something is NOT, the exact sentence goes in
// ALLOWED_SENTENCES below; it is removed before the scan, so the same word anywhere else still
// fails. Keep the list short and list every entry in the handoff.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Each rule: a name and a regular expression. Case-insensitive unless the rule says otherwise. */
const RULES = [
  // Required by the brief.
  { name: 'apy', re: /\bapy\b/gi },
  { name: 'yield', re: /\byield/gi },
  { name: 'dividend', re: /\bdividend/gi },
  { name: 'interest', re: /\binterest/gi },
  { name: 'guarantee', re: /\bguarantee/gi },
  { name: 'moon', re: /\bmoon/gi },
  { name: '100x', re: /\b100x\b/gi },
  { name: 'wagmi', re: /wagmi/gi },
  { name: 'rocket', re: /\brocket/gi },
  { name: 'cashback', re: /\bcash[\s-]?back/gi },
  { name: 'airdrop', re: /\bair[\s-]?drop/gi },
  { name: 'up only', re: /\bup[\s-]+only\b/gi },
  // The old project name, spelt in two pieces so this file does not contain it either.
  { name: 'the old project name', re: new RegExp('so' + 'ar', 'gi') },
  // Added from SPEC_SUMMARY section 11 and 13 and the lore's guardrails.
  { name: 'APR', re: /\bAPR\b/g },
  { name: 'profit', re: /\bprofit/gi },
  { name: 'investment', re: /\binvestment/gi },
  { name: 'passive income', re: /\bpassive\s+income/gi },
  { name: '1000x', re: /\b1000x\b/gi },
  { name: 'price floor', re: /\bprice\s+floor/gi },
  { name: 'can only go up', re: /\bcan\s+only\s+go\s+up/gi },
  { name: "can't go below", re: /\bcan(?:'|’)?t\s+go\s+below/gi },
  { name: 'number go up', re: /\bnumber\s+go\s+up/gi },
  { name: 'bounty (poke pays nothing)', re: /\bbount(?:y|ies)\b/gi },
  { name: 'team wallet', re: /\bteam\s+wallet/gi },
  { name: 'lambo', re: /\blambo/gi },
  // Added by F8a3: no wording that states or hints that TOWN's price is expected to rise.
  { name: 'price will', re: /\bprice\s+will\b/gi },
  { name: 'go up', re: /\bgo\s+up\b/gi },
  { name: 'goes up', re: /\bgoes\s+up\b/gi },
  { name: 'pump', re: /\bpump/gi },
  { name: 'returns', re: /\breturns\b/gi },
  // Added by F8a3: the lore names, which the owner asked the site to drop (plain words only).
  {
    name: 'lore name',
    re: /\b(?:granary|bellamy|bellringer|mayor|fountain|aqueduct|weathervane|furnace|cornerstone|ledger|dawn\s+toll|shadow\s+markets?|penthouse|walk-up|the\s+stoop|the\s+loft|the\s+crown|residents?|the\s+gate|gatekeeper|the\s+tower|town\s+hall|long\s+lights|charter|lowlands|tolls?|rations?|bells?)\b/gi,
  },
];

/**
 * Exact sentences allowed to contain a forbidden word, because they say what something is not.
 * Currently empty: the site's copy says what things are not without the forbidden words.
 */
const ALLOWED_SENTENCES = [];

const SOURCE_DIRS = ['src', 'public'];
const SOURCE_FILES = ['index.html'];
const BUILD_DIR = 'dist';
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.svg', '.json', '.md']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (TEXT_EXT.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

function lineCol(text, index) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, col: index - last };
}

function scan(file) {
  let text = readFileSync(file, 'utf8');
  for (const sentence of ALLOWED_SENTENCES) {
    // Replace with spaces of the same length so positions stay true.
    text = text.split(sentence).join(' '.repeat(sentence.length));
  }
  const hits = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      const { line, col } = lineCol(text, m.index);
      const start = Math.max(0, m.index - 40);
      const context = text.slice(start, m.index + m[0].length + 40).replace(/\s+/g, ' ');
      hits.push({ rule: rule.name, match: m[0], line, col, context });
    }
  }
  return hits;
}

const files = [];
for (const d of SOURCE_DIRS) {
  const p = join(ROOT, d);
  if (existsSync(p)) files.push(...walk(p));
}
for (const f of SOURCE_FILES) {
  const p = join(ROOT, f);
  if (existsSync(p)) files.push(p);
}
const buildPath = join(ROOT, BUILD_DIR);
if (!existsSync(buildPath)) {
  console.error('check:copy: no dist/ folder. Run `npm run build` first, so the built output is checked too.');
  process.exit(2);
}
const buildFiles = walk(buildPath);
files.push(...buildFiles);

let total = 0;
for (const f of files) {
  const hits = scan(f);
  for (const h of hits) {
    total++;
    console.log(`${relative(ROOT, f)}:${h.line}:${h.col}  [${h.rule}]  "${h.match}"  …${h.context}…`);
  }
}

console.log(
  `check:copy: scanned ${files.length} files (${files.length - buildFiles.length} source, ${buildFiles.length} built) against ${RULES.length} rules, ` +
    `${ALLOWED_SENTENCES.length} allowed sentences.`,
);
if (total > 0) {
  console.error(`check:copy: FAILED with ${total} forbidden word${total === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('check:copy: passed, no forbidden words found.');
