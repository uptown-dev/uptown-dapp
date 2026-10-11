#!/usr/bin/env node
// Tests the hosting rules of F9h (CL-53): the security headers in vercel.json, the policy the built
// page carries, and the build's refusal to run without a network. No network, no chain, no browser.
//
// - vercel.json: every path gets the security headers; its content-security policy is the built
//   page's policy (src/lib/policy.ts) with connect-src exactly the RPC origins of the two public
//   networks in the network module (src/lib/chains.ts), mainnet and Sepolia, never the local chain's
//   (F9p), and frame-ancestors 'none'; X-Frame-Options is DENY; the page is never cached and the
//   hashed assets are cached for a year. Each rule is also shown to fail on a copy of the file with
//   that rule broken.
// - The built page's own policy names only its own network (CL-53), so what a visitor's browser
//   allows (the header and the page together) is that one network's RPC origin.
// - scripts/check-chain.mjs (the first step of `npm run build`): stops without VITE_CHAIN_ID or
//   with any value other than 1, 11155111 or 31337.
// - dist/index.html, when a build exists: the strict policy for one chain's RPC origin and no other,
//   and no referrer; also shown to fail on copies of the page naming two networks.
// - The two font licence files (CR-87): in public/licenses/, carrying the licence text, and copied
//   into dist/licenses/ by the build. The footer's visible licence sentence went with CR-87; the
//   files must still be published, which is what the fonts' licence requires.
//
// Usage: node scripts/test-hosting.mjs   (also part of `npm test`)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAINS, CHAIN_ORDER, hostedRpcOrigins, rpcOrigin } from '../src/lib/chains.ts';
import { hostPolicy, sitePolicy } from '../src/lib/policy.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

const MAINNET_ORIGIN = new URL(CHAINS[1].rpcUrl).origin;
const SEPOLIA_ORIGIN = new URL(CHAINS[11155111].rpcUrl).origin;
const LOCAL_ORIGIN = new URL(CHAINS[31337].rpcUrl).origin;
/** The header's connect-src: the two public networks' RPC origins, mainnet first (F9p). */
const HOSTED = [MAINNET_ORIGIN, SEPOLIA_ORIGIN];

/** The headers every path must carry, exactly as the brief (docs/tasks/F9h-frontend.md) lists them. */
const EVERY_PATH = {
  'Content-Security-Policy': hostPolicy(HOSTED),
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
    const connect = d.get('connect-src') ?? [];
    if (connect.length !== HOSTED.length || [...connect].sort().join(' ') !== [...HOSTED].sort().join(' ')) {
      p.push(`connect-src is "${connect.join(' ')}", not exactly the mainnet and Sepolia RPC origins ${HOSTED.join(' ')}`);
    }
    if (connect.includes(LOCAL_ORIGIN)) p.push(`connect-src names the local chain's RPC origin ${LOCAL_ORIGIN}`);
    if ((d.get('frame-ancestors') ?? []).join(' ') !== "'none'") p.push("frame-ancestors 'none' is missing");
    if (csp !== hostPolicy(HOSTED)) p.push(`the policy is not the built page's policy (connect-src mainnet and Sepolia) plus frame-ancestors 'none': ${csp}`);
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
check('vercel.json: every header on every path, the policy with the mainnet and Sepolia RPC origins and frame-ancestors \'none\', X-Frame-Options DENY, the cache rules', found.length === 0, found.join('; '));
const HEADER_CSP = config.headers.find((r) => r.source === '/(.*)').headers.find((h) => h.key === 'Content-Security-Policy').value;
const headerConnect = directives(HEADER_CSP).get('connect-src') ?? [];
check(
  `vercel.json: connect-src is exactly the network module's mainnet and Sepolia RPC origins, hostedRpcOrigins() (${HOSTED.join(', ')})`,
  headerConnect.join(' ') === HOSTED.join(' ') && hostedRpcOrigins().join(' ') === HOSTED.join(' ') && rpcOrigin(1) === MAINNET_ORIGIN && rpcOrigin(11155111) === SEPOLIA_ORIGIN,
  headerConnect.join(' '),
);
check(
  `vercel.json: connect-src never names the local chain (${LOCAL_ORIGIN}), nor 'self', * or any other source; the file holds no 127.0.0.1 or localhost`,
  !headerConnect.includes(LOCAL_ORIGIN) && headerConnect.every((s) => HOSTED.includes(s)) && !/127\.0\.0\.1|localhost/i.test(JSON.stringify(config)),
  headerConnect.join(' '),
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
  ['connect-src only the mainnet node (a Sepolia build could read nothing)', (hs) => setCsp(hs, (v) => v.replace(` ${SEPOLIA_ORIGIN}`, '')), /connect-src/],
  ['connect-src only the Sepolia node (a mainnet build could read nothing)', (hs) => setCsp(hs, (v) => v.replace(`${MAINNET_ORIGIN} `, '')), /connect-src/],
  ['connect-src with the local node added', (hs) => setCsp(hs, (v) => v.replace(SEPOLIA_ORIGIN, `${SEPOLIA_ORIGIN} ${LOCAL_ORIGIN}`)), /local chain/],
  ['connect-src with the Sepolia node swapped for the local one', (hs) => setCsp(hs, (v) => v.replace(SEPOLIA_ORIGIN, LOCAL_ORIGIN)), /local chain/],
  ['connect-src with a third host', (hs) => setCsp(hs, (v) => v.replace(SEPOLIA_ORIGIN, `${SEPOLIA_ORIGIN} https://example.com`)), /connect-src/],
  ["connect-src with 'self' added", (hs) => setCsp(hs, (v) => v.replace(SEPOLIA_ORIGIN, `${SEPOLIA_ORIGIN} 'self'`)), /connect-src/],
  ['connect-src with the mainnet node twice and no Sepolia', (hs) => setCsp(hs, (v) => v.replace(SEPOLIA_ORIGIN, MAINNET_ORIGIN)), /connect-src/],
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

// 3. The built page's policy is the host policy without frame-ancestors, for one chain's origin only;
//    what the browser allows (the header and the page together) is that one origin.
for (const id of CHAIN_ORDER) {
  const d = directives(sitePolicy(rpcOrigin(id)));
  check(`the page policy for chain ${id}: connect-src is only ${rpcOrigin(id)}, no 'self', no inline style, images only from the site and data: (wallet icons, CR-72)`,
    (d.get('connect-src') ?? []).join(' ') === rpcOrigin(id) && (d.get('style-src') ?? []).join(' ') === "'self'" && (d.get('img-src') ?? []).join(' ') === "'self' data:" && (d.get('default-src') ?? []).join(' ') === "'none'" && !d.has('frame-ancestors'));
  const page = sitePolicy(rpcOrigin(id));
  check(`the page policy for chain ${id} is the header policy with connect-src narrowed to ${rpcOrigin(id)} and no frame-ancestors`,
    page === HEADER_CSP.replace(/connect-src [^;]+/, `connect-src ${rpcOrigin(id)}`).replace("; frame-ancestors 'none'", ''));
  const both = (d.get('connect-src') ?? []).filter((s) => headerConnect.includes(s));
  if (CHAINS[id].local) {
    check(`a chain ${id} build served with the vercel.json header could reach no RPC (the local chain is never hosted; the local proofs serve it with their own connect-src)`, both.length === 0, both.join(' '));
  } else {
    check(`a chain ${id} build served with the vercel.json header: the browser allows only ${rpcOrigin(id)} (header and page together)`, both.join(' ') === rpcOrigin(id), both.join(' '));
  }
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

// 5. The last build, if there is one: its page names exactly one network.
/** The chain whose strict policy a built page carries, or what is wrong with it. */
function pagePolicy(html) {
  const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/g)];
  if (metas.length !== 1) return { problem: `${metas.length} content-security policies in the page` };
  const policy = metas[0][1];
  const connect = directives(policy).get('connect-src') ?? [];
  if (connect.length !== 1) return { problem: `connect-src names ${connect.length} sources: ${connect.join(' ')}` };
  const chain = CHAIN_ORDER.find((id) => policy === sitePolicy(rpcOrigin(id)));
  return chain === undefined ? { problem: `not the strict policy of any one chain: ${policy}` } : { chain };
}
const built = join(ROOT, 'dist', 'index.html');
if (existsSync(built)) {
  const html = readFileSync(built, 'utf8');
  const r = pagePolicy(html);
  check(`dist/index.html carries the strict policy for one chain's RPC origin and no other${r.chain ? ` (chain ${r.chain}: connect-src ${rpcOrigin(r.chain)})` : ''}`, r.chain !== undefined, r.problem);
  check('dist/index.html carries <meta name="referrer" content="no-referrer">', /<meta name="referrer" content="no-referrer"/.test(html));
  const withPolicy = (policy) => html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/, (_, a, b) => a + policy + b);
  for (const [label, copy] of [
    ['both public networks in the page', withPolicy(sitePolicy(`${MAINNET_ORIGIN} ${SEPOLIA_ORIGIN}`))],
    ['the local node added to the page', withPolicy(sitePolicy(`${rpcOrigin(r.chain ?? 1)} ${LOCAL_ORIGIN}`))],
    ['the header policy copied into the page', withPolicy(hostPolicy(HOSTED))],
  ]) {
    const q = pagePolicy(copy);
    check(`the dist/index.html test fails with ${label}`, q.chain === undefined, q.problem ?? 'no problem found');
  }
} else {
  check('dist/index.html (skipped: no build)', true);
}

// The two font licence files travel with the site (CR-87). The footer no longer carries the
// sentence that pointed at them, so this is what keeps them from being dropped by accident: the
// fonts' own licence requires the licence text to be published with the fonts. They are in
// public/licenses/, which every build copies into dist/.
for (const name of ['OFL-Inter.txt', 'OFL-Cinzel.txt']) {
  const source = join(ROOT, 'public', 'licenses', name);
  const text = existsSync(source) ? readFileSync(source, 'utf8') : '';
  check(`public/licenses/${name} is published with the site and carries the SIL Open Font License`, /SIL Open Font License/i.test(text), existsSync(source) ? 'the file does not carry the licence text' : 'the file is missing');
  const inDist = join(ROOT, 'dist', 'licenses', name);
  if (existsSync(built)) check(`dist/licenses/${name} is in the built site`, existsSync(inDist), 'the build did not copy it');
  else check(`dist/licenses/${name} (skipped: no build)`, true);
}

for (const t of results) console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.ok || !t.detail ? '' : `\n      ${t.detail.replace(/\n/g, '\n      ')}`}`);
const failed = results.filter((t) => !t.ok).length;
console.log(`\nhosting: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
