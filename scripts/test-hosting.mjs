#!/usr/bin/env node
// Tests the hosting rules of F9h (CL-53): the security headers in vercel.json, the policy the built
// page carries, and the build's refusal to run without a network. No network, no chain, no browser.
//
// - vercel.json: every path gets the security headers; its content-security policy is the built
//   page's policy (src/lib/policy.ts) with connect-src the mainnet RPC origin of the network module
//   (src/lib/chains.ts) and frame-ancestors 'none'; X-Frame-Options is DENY; the page is never
//   cached and the hashed assets are cached for a year. Each rule is also shown to fail on a copy of
//   the file with that rule broken.
// - scripts/check-chain.mjs (the first step of `npm run build`): stops without VITE_CHAIN_ID or
//   with any value other than 1, 11155111 or 31337.
// - dist/index.html, when a build exists: the strict policy for one chain's RPC origin, and no
//   referrer.
//
// Usage: node scripts/test-hosting.mjs   (also part of `npm test`)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAINS, CHAIN_ORDER, rpcOrigin } from '../src/lib/chains.ts';
import { hostPolicy, sitePolicy } from '../src/lib/policy.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

const MAINNET_ORIGIN = new URL(CHAINS[1].rpcUrl).origin;

/** The headers every path must carry, exactly as the brief (docs/tasks/F9h-frontend.md) lists them. */
const EVERY_PATH = {
  'Content-Security-Policy': hostPolicy(MAINNET_ORIGIN),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=(), clipboard-read=(), clipboard-write=(self), browsing-topics=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const CACHE = {
  '/': 'no-cache',
  '/index.html': 'no-cache',
  '/assets/(.*)': 'public, max-age=31536000, immutable',
};

/** The directives of a policy, by name. */
function directives(policy) {
  const out = new Map();
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out.set(name.toLowerCase(), values);
  }
  return out;
}

/** Everything wrong with a vercel.json; empty when it is right. */
function problems(config) {
  const p = [];
  const rules = Array.isArray(config?.headers) ? config.headers : [];
  const headersOf = (source) => {
    const r = rules.find((x) => x.source === source);
    return r ? new Map(r.headers.map((h) => [h.key.toLowerCase(), h.value])) : null;
  };
  const all = headersOf('/(.*)');
  if (!all) return ['no rule for every path ("/(.*)")'];
  const csp = all.get('content-security-policy');
  if (!csp) p.push('no Content-Security-Policy');
  else {
    const d = directives(csp);
    const connect = (d.get('connect-src') ?? []).join(' ');
    if (connect !== MAINNET_ORIGIN) p.push(`connect-src is "${connect}", not the mainnet RPC origin ${MAINNET_ORIGIN}`);
    if ((d.get('frame-ancestors') ?? []).join(' ') !== "'none'") p.push("frame-ancestors 'none' is missing");
    if (csp !== hostPolicy(MAINNET_ORIGIN)) p.push(`the policy is not the built page's policy plus frame-ancestors 'none': ${csp}`);
  }
  if ((all.get('x-frame-options') ?? '').toUpperCase() !== 'DENY') p.push('X-Frame-Options: DENY is missing');
  for (const [k, v] of Object.entries(EVERY_PATH)) {
    if (all.get(k.toLowerCase()) !== v) p.push(`${k} is ${JSON.stringify(all.get(k.toLowerCase()) ?? null)}, not ${JSON.stringify(v)}`);
  }
  for (const [source, v] of Object.entries(CACHE)) {
    const h = headersOf(source);
    if (h?.get('cache-control') !== v) p.push(`Cache-Control on ${source} is ${JSON.stringify(h?.get('cache-control') ?? null)}, not ${JSON.stringify(v)}`);
  }
  return p;
}

// 1. vercel.json as committed.
const file = join(ROOT, 'vercel.json');
const config = JSON.parse(readFileSync(file, 'utf8'));
const found = problems(config);
check('vercel.json: every header on every path, the policy with the mainnet RPC origin and frame-ancestors \'none\', X-Frame-Options DENY, the cache rules', found.length === 0, found.join('; '));
check(
  `vercel.json: connect-src is exactly the mainnet network entry's RPC origin (${MAINNET_ORIGIN})`,
  (directives(EVERY_PATH['Content-Security-Policy']).get('connect-src') ?? []).join(' ') === MAINNET_ORIGIN && rpcOrigin(1) === MAINNET_ORIGIN,
);

// 2. The same checks fail when a rule is broken.
const broken = (edit) => {
  const c = JSON.parse(JSON.stringify(config));
  edit(c.headers.find((r) => r.source === '/(.*)').headers);
  return problems(c);
};
const setCsp = (hs, f) => {
  const h = hs.find((x) => x.key === 'Content-Security-Policy');
  h.value = f(h.value);
};
const cases = [
  ['connect-src set to the local node', (hs) => setCsp(hs, (v) => v.replace(MAINNET_ORIGIN, 'http://127.0.0.1:8545')), /connect-src/],
  ['connect-src set to the Sepolia node', (hs) => setCsp(hs, (v) => v.replace(MAINNET_ORIGIN, rpcOrigin(11155111))), /connect-src/],
  ['connect-src with a second host', (hs) => setCsp(hs, (v) => v.replace(MAINNET_ORIGIN, `${MAINNET_ORIGIN} https://example.com`)), /connect-src/],
  ["frame-ancestors 'none' removed", (hs) => setCsp(hs, (v) => v.replace("; frame-ancestors 'none'", '')), /frame-ancestors/],
  ['frame-ancestors set to *', (hs) => setCsp(hs, (v) => v.replace("frame-ancestors 'none'", 'frame-ancestors *')), /frame-ancestors/],
  ['X-Frame-Options removed', (hs) => hs.splice(hs.findIndex((x) => x.key === 'X-Frame-Options'), 1), /X-Frame-Options/],
  ['X-Frame-Options set to SAMEORIGIN', (hs) => (hs.find((x) => x.key === 'X-Frame-Options').value = 'SAMEORIGIN'), /X-Frame-Options/],
  ['Strict-Transport-Security removed', (hs) => hs.splice(hs.findIndex((x) => x.key === 'Strict-Transport-Security'), 1), /Strict-Transport-Security/],
];
for (const [label, edit, want] of cases) {
  const p = broken(edit);
  check(`the vercel.json test fails with ${label}`, p.some((x) => want.test(x)), p.join('; ') || 'no problem found');
}

// 3. The built page's policy is the host policy without frame-ancestors, for each chain's origin.
for (const id of CHAIN_ORDER) {
  const d = directives(sitePolicy(rpcOrigin(id)));
  check(`the page policy for chain ${id}: connect-src is only ${rpcOrigin(id)}, no 'self', no inline style, no data: image`,
    (d.get('connect-src') ?? []).join(' ') === rpcOrigin(id) && (d.get('style-src') ?? []).join(' ') === "'self'" && (d.get('img-src') ?? []).join(' ') === "'self'" && (d.get('default-src') ?? []).join(' ') === "'none'" && !d.has('frame-ancestors'));
}

// 4. The build's first step refuses a build that names no network.
const runCheck = (value) => {
  const env = { ...process.env };
  if (value === undefined) delete env.VITE_CHAIN_ID;
  else env.VITE_CHAIN_ID = value;
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-chain.mjs')], { cwd: ROOT, env, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout + r.stderr).trim() };
};
for (const [label, value] of [['not set', undefined], ['empty', ''], ['5 (Goerli)', '5'], ['"mainnet"', 'mainnet'], ['"1.0"', '1.0'], ['"31337x"', '31337x']]) {
  const r = runCheck(value);
  check(`npm run build stops when VITE_CHAIN_ID is ${label} (exit 1, names the three networks, "Nothing was built")`, r.code === 1 && /VITE_CHAIN_ID=1 \(Ethereum mainnet\)/.test(r.out) && /Nothing was built/.test(r.out), r.out);
}
for (const id of CHAIN_ORDER) {
  const r = runCheck(String(id));
  check(`npm run build goes on when VITE_CHAIN_ID is ${id}`, r.code === 0 && r.out === `build: for chain ${id}`, r.out);
}

// 5. The last build, if there is one.
const built = join(ROOT, 'dist', 'index.html');
if (existsSync(built)) {
  const html = readFileSync(built, 'utf8');
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  const chain = CHAIN_ORDER.find((id) => m && m[1] === sitePolicy(rpcOrigin(id)));
  check(`dist/index.html carries the strict policy for one chain's RPC origin${chain ? ` (chain ${chain})` : ''}`, chain !== undefined, m ? m[1] : 'no policy');
  check('dist/index.html carries <meta name="referrer" content="no-referrer">', /<meta name="referrer" content="no-referrer"/.test(html));
} else {
  check('dist/index.html (skipped: no build)', true);
}

for (const t of results) console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.ok || !t.detail ? '' : `\n      ${t.detail.replace(/\n/g, '\n      ')}`}`);
const failed = results.filter((t) => !t.ok).length;
console.log(`\nhosting: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
