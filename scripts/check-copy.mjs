#!/usr/bin/env node
// Copy check: scans the site's source and its built output for words the site must never use
// (docs/SPEC_SUMMARY.md sections 11 and 13, docs/tasks/F8a-frontend.md, docs/tasks/F8a3-frontend.md,
// docs/tasks/F8a4-frontend.md)
// and fails if it finds one. Run with `npm run check:copy` after `npm run build`. F8a3 added the
// price-expectation terms and the lore names, which the redesigned site no longer uses. F8a4 added
// lawyer, legal, counsel and advice: the site carries no legal statements (CR-40). F8b lets the
// "returns" rule skip Solidity's `returns (...)` keyword in contract interfaces (code, not copy).
// F8g added words that would make the sell fee's daily currency or the burn read as a trading tip or
// a value claim (deflationary, scarcity, "good time to sell", "should buy", ...).
//
// Where a forbidden word is needed to say what something is NOT, or the owner has approved wording
// that uses one, the exact sentence goes in ALLOWED_SENTENCES below; it is removed before the scan,
// so the same word anywhere else still fails. Keep the list short and list every entry in the
// handoff. F9n added the two CR-80 clauses, the owner's own words for the daily sell-fee message.

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
  // F8b: "returns" is also Solidity's keyword in contract interfaces (`view returns (uint256)`), which
  // the site's ABI (src/lib/abi.ts) and the viem library in the build carry. Those code uses are
  // skipped (isCode: followed by "(" or " (", or written as an identifier: `.returns`, `<returns>`,
  // `|returns|`, `returns\s`); "returns" in prose still fails.
  {
    name: 'returns',
    re: /\breturns\b/gi,
    isCode: (before, after) => /^ ?\(/.test(after) || /^[|>]/.test(after) || /^\\s/.test(after) || /[.<|]$/.test(before),
  },
  // Added by F8a3: the lore names, which the owner asked the site to drop (plain words only).
  {
    name: 'lore name',
    re: /\b(?:granary|bellamy|bellringer|mayor|fountain|aqueduct|weathervane|furnace|cornerstone|ledger|dawn\s+toll|shadow\s+markets?|penthouse|walk-up|the\s+stoop|the\s+loft|the\s+crown|residents?|the\s+gate|gatekeeper|the\s+tower|town\s+hall|long\s+lights|charter|lowlands|tolls?|rations?|bells?)\b/gi,
  },
  // Added by F8a4 (CR-40): no lawyer or legal statements anywhere on the site.
  { name: 'lawyer', re: /\blawyers?/gi },
  { name: 'legal', re: /\blegal/gi },
  { name: 'counsel', re: /\bcounsel/gi },
  { name: 'advice', re: /\badvice/gi },
  // Added by F8g (CR-56, CR-57): the sell fee's daily currency must never read as a tip on when to
  // trade, and the burn must never read as a promise about value.
  { name: 'deflationary', re: /\bdeflation/gi },
  { name: 'scarcity', re: /\bscarc(?:e|ity)\b/gi },
  { name: 'supply shock', re: /\bsupply\s+shock/gi },
  { name: 'buy the dip', re: /\bbuy\s+the\s+dip/gi },
  { name: 'sell now / buy now', re: /\b(?:sell|buy)\s+(?:now|today|tomorrow)\s+(?:to|and|before|while)\b/gi },
  { name: 'time to trade', re: /\b(?:good|best|right|better)\s+(?:time|day)\s+to\s+(?:sell|buy|trade)/gi },
  { name: 'should sell or buy', re: /\b(?:should|must)\s+(?:sell|buy)\b/gi },
  { name: 'cheaper to sell', re: /\b(?:cheaper|dearer)\s+to\s+(?:sell|buy)/gi },
];

/**
 * Exact phrases and sentences allowed to contain a forbidden word. Each is removed from the text
 * before the scan, so the same word anywhere else still fails.
 *
 * The two here are the owner's own words for the daily sell-fee message, approved in CR-80: on a day
 * whose fee is burned, the Trade page's sell form says "inflation exceeded deflation" ("inflation
 * matched deflation" when yesterday's burn and its rebates were exactly equal). They name what
 * happened yesterday, with both figures beside them; they are not the "deflationary" value claim the
 * rule below was written to keep off the site.
 */
const ALLOWED_SENTENCES = ['inflation exceeded deflation', 'inflation matched deflation'];

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
      const end = m.index + m[0].length;
      if (rule.isCode && rule.isCode(text.slice(Math.max(0, m.index - 1), m.index), text.slice(end, end + 2))) continue;
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
