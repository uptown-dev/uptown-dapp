// F9p proof: a Sepolia build, served with exactly the headers of vercel.json (whose policy names the
// mainnet and Sepolia network services), reads Sepolia in headless Edge. Read-only: no wallet is
// connected and nothing is sent to any chain.
//
// 1. Serves dist/ (it must be a VITE_CHAIN_ID=11155111 build) on 127.0.0.1:4291 (never 4173, 5173 or
//    8545) with every header of vercel.json's "/(.*)" rule unchanged, and the cache rules.
// 2. Opens the homepage and the Stats page; waits for the figures; reports the block the site read
//    at and the figures it shows from the contracts (rebate rate today, the staking contract the
//    treasury pays, the liquidity lock's end), then reads the same values straight from the Sepolia
//    network service to compare.
// 3. Reports every policy violation (a listener added before the page's own scripts), every DevTools
//    issue, every console message and every host the page contacted.
// 4. Control, after the site's own checks: from the page, a request to the mainnet network service
//    (allowed by the header, not by the Sepolia page's own policy) and one to the local node must be
//    refused. This shows the browser obeys both policies, so the page reaches only Sepolia.
// 5. Photographs into the git-ignored review-shots/f9p/.
//
// Usage, from frontend/:
//   VITE_CHAIN_ID=11155111 npm run build && node scripts/f9p-proof.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { CHAINS } from '../src/lib/chains.ts';

const DIST = resolve('dist');
const OUT = resolve('review-shots/f9p');
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SEPOLIA_RPC = CHAINS[11155111].rpcUrl;
const MAINNET_RPC = CHAINS[1].rpcUrl;
const LOCAL_RPC = CHAINS[31337].rpcUrl;
const PORT = 4291;
const DEBUG_PORT = 9421;
const PROFILE_NAME = 'uptown-f9p-proof-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};
const problems = [];

if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: run VITE_CHAIN_ID=11155111 npm run build first');
const built = readFileSync(join(DIST, 'index.html'), 'utf8');
const pageConnect = /connect-src ([^;"]+)/.exec(built)?.[1]?.trim() ?? '(none)';
say(`dist/index.html connect-src: ${pageConnect}`);
if (pageConnect !== new URL(SEPOLIA_RPC).origin) throw new Error('dist/ is not a Sepolia build: run VITE_CHAIN_ID=11155111 npm run build first');
const addresses = JSON.parse(readFileSync(resolve('src/addresses/11155111.json'), 'utf8')).contracts;

// ---- the static server, with the hosting headers exactly as in vercel.json ----------------------
const vercel = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const every = vercel.headers.find((h) => h.source === '/(.*)').headers;
const cacheFor = (path) => {
  for (const rule of vercel.headers) {
    if (rule.source === '/(.*)') continue;
    const re = new RegExp(`^${rule.source.replace(/\(\.\*\)/g, '.*')}$`);
    if (re.test(path)) return rule.headers.find((h) => h.key === 'Cache-Control')?.value;
  }
  return undefined;
};
const server = await new Promise((r) => {
  const s = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path === '/' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    for (const h of every) res.setHeader(h.key, h.value);
    const cache = cacheFor(path);
    if (cache) res.setHeader('Cache-Control', cache);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  s.listen(PORT, '127.0.0.1', () => r(s));
});
const SITE = `http://127.0.0.1:${PORT}/`;
const served = await fetch(SITE);
say(`serving dist/ (chain 11155111) on ${SITE}; the page's Content-Security-Policy header:`);
say(`   ${served.headers.get('content-security-policy')}`);
await served.arrayBuffer();

// ---- the browser ---------------------------------------------------------------------------------
const profile = resolve(tmpdir(), PROFILE_NAME);
rmSync(profile, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 150 && !ws; i++) {
  try {
    const j = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    const p = j.find((t) => t.type === 'page');
    if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
  } catch {}
  if (!ws) await sleep(200);
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const hosts = new Map();
const violations = [];
const issues = [];
const consoleMsgs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === 'Network.requestWillBeSent') {
    const u = new URL(m.params.request.url);
    if (u.protocol.startsWith('http')) hosts.set(u.origin, (hosts.get(u.origin) ?? 0) + 1);
  } else if (m.method === 'Runtime.consoleAPICalled') {
    const t = m.params.args.map((a) => a.value ?? a.description).join(' ');
    if (t.startsWith('__csp ')) violations.push(t.slice(6));
    else consoleMsgs.push(`${m.params.type}: ${t}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleMsgs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  } else if (m.method === 'Log.entryAdded') {
    consoleMsgs.push(`log ${m.params.entry.level}: ${m.params.entry.text}`);
  } else if (m.method === 'Audits.issueAdded') {
    const i = m.params.issue;
    issues.push(`${i.code}: ${JSON.stringify(i.details?.contentSecurityPolicyIssueDetails ?? i.details ?? {}).slice(0, 300)}`);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(`page: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
  return r.result?.result?.value;
};
const CSP_LISTENER = `document.addEventListener('securitypolicyviolation', (e) => console.log('__csp ' + e.violatedDirective + ' blocked ' + e.blockedURI + ' at ' + e.sourceFile + ':' + e.lineNumber));`;
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Log.enable');
await send('Audits.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

const text = (sel) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);
/** Opens a page and waits until the site has read the figures (the read line's block is set). */
async function open(hash) {
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await sleep(900);
  let block = '';
  for (let i = 0; i < 240 && !block; i++) {
    block = await evalJs(`(() => { const e = document.querySelector('.read-line'); const h = document.querySelector('main h1'); return e && h && !document.body.innerText.includes('Reading the figures from the contracts.') ? e.dataset.block : ''; })()`).catch(() => '');
    if (!block) await sleep(250);
  }
  if (!block) problems.push(`${hash || 'the homepage'}: no figures read within 60 seconds`);
  await sleep(1200);
  await evalJs('document.fonts.ready.then(() => 1)');
  return block;
}
async function photo(name, full = false) {
  await evalJs('window.scrollTo(0, 0)');
  await sleep(200);
  const size = await evalJs('({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight })');
  const clip = { x: 0, y: 0, width: size.w, height: full ? size.h : 900, scale: 1 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo review-shots/f9p/${name}.png  ${clip.width} x ${clip.height}`);
}
const rpc = async (url, method, params) => {
  const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result;
};
const call = async (to, data) => rpc(SEPOLIA_RPC, 'eth_call', [{ to, data }, 'latest']);

// ---- the site, as a visitor sees it --------------------------------------------------------------
say('== the homepage');
const homeBlock = await open('');
const network = await text('.network-pill, .chain-pill, [data-chain]');
const rate = await text('[data-view="BuyerRewards.rateBps(today)"]');
const notDeployed = await evalJs("document.body.innerText.includes('Not deployed')");
say(`   read at block ${Number(homeBlock).toLocaleString('en-US')} (data-block ${homeBlock})`);
say(`   heading: ${await text('main h1')}`);
if (network) say(`   network shown: ${network}`);
say(`   rebate rate today (BuyerRewards.rateBps(today)): ${rate}`);
say(`   "Not deployed" shown: ${notDeployed}`);
if (!rate) problems.push('the homepage shows no rebate rate');
if (notDeployed) problems.push('the homepage says "Not deployed"');
await photo('sepolia-home-1280');

say('== the Stats page');
const statsBlock = await open('#/stats');
const staking = await evalJs(`(() => { const e = document.querySelector('[data-view="Treasury.staking"]'); return e ? (e.getAttribute('title') || e.innerText).trim() : null; })()`);
const unlock = await text('[data-view="LPVault.unlockTime"]');
say(`   read at block ${Number(statsBlock).toLocaleString('en-US')}`);
say(`   staking contract the treasury pays (Treasury.staking): ${staking}`);
say(`   liquidity lock ends (LPVault.unlockTime): ${unlock}`);
const tiers = await evalJs(`[...document.querySelectorAll('[data-view^="TownStaking.tierVaults"]')].map((e) => e.innerText.trim()).join(', ')`);
say(`   vaults per tier (TownStaking.tierVaults): ${tiers}`);
await photo('sepolia-stats-1280', true);

// ---- the same values straight from Sepolia --------------------------------------------------------
say('== the same values read straight from the Sepolia network service (read-only)');
const chainId = await rpc(SEPOLIA_RPC, 'eth_chainId', []);
const head = Number(await rpc(SEPOLIA_RPC, 'eth_blockNumber', []));
say(`   eth_chainId ${chainId} (${Number(chainId)}); latest block now ${head.toLocaleString('en-US')} (the site's read: ${Number(statsBlock).toLocaleString('en-US')}, ${head - Number(statsBlock)} behind)`);
const stakingOnChain = `0x${(await call(addresses.Treasury, '0x4cf088d9')).slice(-40)}`; // staking()
const unlockOnChain = BigInt(await call(addresses.LPVault, '0x251c1aa3')); // unlockTime()
say(`   Treasury.staking() = ${stakingOnChain}`);
say(`   LPVault.unlockTime() = ${unlockOnChain} (${new Date(Number(unlockOnChain) * 1000).toISOString()})`);
if (Number(chainId) !== 11155111) problems.push(`the network service answered chain ${Number(chainId)}`);
if (!staking || staking.toLowerCase() !== stakingOnChain.toLowerCase()) problems.push(`Treasury.staking on the page (${staking}) is not the chain's (${stakingOnChain})`);
if (Math.abs(head - Number(statsBlock)) > 20) problems.push('the site read a block far from the network head');

// ---- control: the browser obeys the page's own policy too ----------------------------------------
const siteViolations = [...violations];
const siteIssues = [...issues];
const siteConsole = [...consoleMsgs];
say('== control (not the site): requests typed into the page');
for (const [label, url] of [['mainnet network service (in the header, not in the page policy)', MAINNET_RPC], ['local node (in neither)', LOCAL_RPC], ['Sepolia network service (in both)', SEPOLIA_RPC]]) {
  const r = await evalJs(`fetch(${JSON.stringify(url)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' }).then((r) => r.json()).then((j) => 'answered ' + j.result, (e) => 'refused: ' + e.message)`);
  say(`   ${label}: ${r}`);
  if (url === SEPOLIA_RPC ? !r.startsWith('answered 0xaa36a7') : !r.startsWith('refused')) problems.push(`control ${label}: ${r}`);
}
await sleep(500);
const controlViolations = violations.slice(siteViolations.length);
say(`   policy violations the control caused: ${controlViolations.length ? '' : 'none'}`);
for (const v of controlViolations) say(`     ${v}`);
// The browser reports one violation per policy that refuses a request: the mainnet request breaks
// only the page's own policy (one report), the local one breaks both the page's and the header's (two).
const blocked = (url) => controlViolations.filter((v) => v.startsWith(`connect-src blocked ${new URL(url).origin}/`)).length;
say(`   reports: mainnet ${blocked(MAINNET_RPC)} (the page's policy), local node ${blocked(LOCAL_RPC)} (the page's and the header's), Sepolia ${blocked(SEPOLIA_RPC)}`);
if (blocked(MAINNET_RPC) !== 1 || blocked(LOCAL_RPC) !== 2 || blocked(SEPOLIA_RPC) !== 0 || controlViolations.length !== 3) {
  problems.push(`the control's violations were not one for mainnet, two for the local node and none for Sepolia`);
}

say(`== hosts contacted by the page: ${[...hosts].map(([h, n]) => `${h} (${n})`).join(', ')}`);
for (const h of hosts.keys()) if (h !== SITE.slice(0, -1) && h !== new URL(SEPOLIA_RPC).origin && h !== new URL(MAINNET_RPC).origin && h !== new URL(LOCAL_RPC).origin) problems.push(`the page contacted ${h}`);
say(`== policy violations from the site's pages: ${siteViolations.length ? '' : 'none'}`);
for (const v of siteViolations) say(`   ${v}`);
say(`== DevTools issues from the site's pages: ${siteIssues.length ? '' : 'none'}`);
for (const v of siteIssues) say(`   ${v}`);
say(`== console messages from the site's pages: ${siteConsole.length ? '' : 'none'}`);
for (const v of siteConsole) say(`   ${v}`);
if (siteViolations.length) problems.push(`${siteViolations.length} policy violations from the site`);
if (siteIssues.length) problems.push(`${siteIssues.length} DevTools issues from the site`);
if (siteConsole.length) problems.push(`${siteConsole.length} console messages from the site`);

await send('Browser.close').catch(() => {});
edge.kill();
await new Promise((r) => server.close(r));
say(`== what this run found wrong: ${problems.length ? '' : 'nothing'}`);
for (const p of problems) say(`   ${p}`);
say(problems.length ? 'FAILED' : 'OK: the Sepolia build, served with the vercel.json headers, read Sepolia; no policy violation, no console message');
writeFileSync(join(OUT, 'proof-log.txt'), logLines.join('\n') + '\n');
await sleep(300);
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
process.exit(problems.length ? 1 : 0);
