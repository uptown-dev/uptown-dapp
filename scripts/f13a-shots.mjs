// F13a (CR-102) review driver: photographs the SKYLINE site and checks what each page shows.
//
//   node scripts/f13a-shots.mjs local     after VITE_CHAIN_ID=31337 npm run build, with the local chain running
//   node scripts/f13a-shots.mjs mainnet   only for a chain-1 address file that is not SKYLINE's (see below)
//
// local: Home, Trade, Stake, Stats, Docs and Owner (the owner's test wallet for Owner, Test wallet 1
// elsewhere), at 1280 px light and 390 px dark. On every page: no word of TOWN outside the
// retired-TOWN notice, which is in the footer once; no read error; the header's day; no policy
// violation, console message or sideways scrolling. Trade: the 2% buy fee row, no notice of a higher
// launch fee, and the price line saying why no dollar figure is shown (the local chain's copy of the
// Chainlink feed is days old). Stake: the three plain facts and the three actions. Stats: the two
// positions and the launch buy. Owner: the second position's two powers.
//
// mainnet: written for F13a, when the committed `src/addresses/1.json` still held the retired TOWN
// deployment's addresses: every page must say "not deployed", show the retired-TOWN notice, name no
// contract address and contact no network service. Since the owner's SKYLINE phase 1 (17 October
// 2026) that file is SKYLINE's, so this mode refuses to run; the mainnet build as it is now is
// photographed and checked by scripts/f13c-shots.mjs.
//
// It serves dist/ with the hosting headers of vercel.json on 127.0.0.1:4313 (never 4173, 5173 or
// 8545) and drives headless Edge (debugging port 9413). It picks local test wallets the way the
// site's own picker remembers them and sends nothing anywhere. Pictures and the log go to the
// git-ignored review-shots/f13a/<mode>/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const MODE = process.argv[2];
if (MODE !== 'local' && MODE !== 'mainnet') throw new Error('usage: node scripts/f13a-shots.mjs local|mainnet');
const LOCAL = MODE === 'local';
if (!LOCAL && JSON.parse(readFileSync(resolve('src/addresses/1.json'), 'utf8')).tokenSymbol === 'SKYLINE') {
  throw new Error("src/addresses/1.json is SKYLINE's (since phase 1, 17 October 2026): use node scripts/f13c-shots.mjs for the mainnet build");
}
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f13a/${MODE}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = LOCAL ? 'http://127.0.0.1:8545' : 'https://ethereum-rpc.publicnode.com';
const PORT = 4313;
const DEBUG_PORT = 9413;
const PROFILE_NAME = 'uptown-f13a-shots-profile';
const RETIRED = '0x994d362B403a5AbE6D815749f63c23B8e807fCF5';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no dist/index.html: run VITE_CHAIN_ID=${LOCAL ? 31337 : 1} npm run build first`);
const builtFor = readFileSync(join(DIST, 'index.html'), 'utf8').match(/connect-src ([^;"]+)/)?.[1].trim();
if (builtFor !== RPC) throw new Error(`dist/ is built for ${builtFor}, not ${RPC}: build for ${LOCAL ? '31337' : '1'} first`);
let WALLET = null;
let OWNER = null;
if (LOCAL) {
  const addressFile = JSON.parse(readFileSync(resolve('src/addresses/31337.json'), 'utf8'));
  WALLET = addressFile.testWallets?.[0];
  OWNER = addressFile.owner;
  if (!WALLET || !OWNER || addressFile.tokenSymbol !== 'SKYLINE') throw new Error('src/addresses/31337.json is not a SKYLINE local chain: start the local chain and build for 31337 first');
}

// ---- the static server, with the hosting headers -------------------------------------------------
const vercel = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const base = vercel.headers.find((h) => h.source === '/(.*)').headers;
const server = await new Promise((r) => {
  const s = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path === '/' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    for (const h of base) res.setHeader(h.key, h.key === 'Content-Security-Policy' && LOCAL ? h.value.replace(/connect-src [^;]+/, `connect-src ${RPC}`) : h.value);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  s.listen(PORT, '127.0.0.1', () => r(s));
});
const SITE = `http://127.0.0.1:${PORT}/`;
say(`serving dist/ (${LOCAL ? 'chain 31337' : 'chain 1'}) with the vercel.json headers on ${SITE}`);

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
const violations = [];
const consoleMsgs = [];
const hosts = new Map();
let recording = true;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (!recording) return;
  if (m.method === 'Runtime.consoleAPICalled') {
    const t = m.params.args.map((a) => a.value ?? a.description).join(' ');
    if (t.startsWith('__csp ')) violations.push(t.slice(6));
    else consoleMsgs.push(`${m.params.type}: ${t}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleMsgs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  } else if (m.method === 'Log.entryAdded') {
    consoleMsgs.push(`log ${m.params.entry.level}: ${m.params.entry.text}`);
  } else if (m.method === 'Network.requestWillBeSent') {
    const u = new URL(m.params.request.url);
    if (u.protocol.startsWith('http')) hosts.set(u.origin, (hosts.get(u.origin) ?? 0) + 1);
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
await send('Log.enable');
await send('Network.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });

const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 0.5) { let p = el.parentElement, clipped = false; while (p) { const s = getComputedStyle(p); if (['auto','hidden','scroll'].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').join('.') + ' ' + Math.round(r.right)); } } return { scrollW: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) }; })()`;

/** What a page shows, for the checks below (the retired notice taken out before the TOWN search). */
const FACTS = `(() => {
  const all = document.body.cloneNode(true);
  all.querySelectorAll('.retired-note').forEach((n) => n.remove());
  all.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
  const words = all.textContent.replace(/\\s+/g, ' ');
  const main = document.querySelector('main');
  const t = main.innerText.replace(/\\s+/g, ' ');
  const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0).length;
  return {
    head: main.querySelector('h1')?.innerText.trim(),
    town: (words.match(/\\bTOWN\\b|TownHook|TownStaking/g) ?? []).length,
    retired: [...document.querySelectorAll('.retired-note')].map((n) => n.innerText.replace(/\\s+/g, ' ').trim()),
    retiredLinked: !!document.querySelector('a[href*="${RETIRED}"], a[href*="${RETIRED.toLowerCase()}"]'),
    dayClock: vis('.day-chip, .day-line'),
    usd: vis('main .usd'),
    priceLine: main.querySelector('.price-line')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
    feeRow: [...main.querySelectorAll('#trade-panel-buy .swap-rows .row dt')].map((d) => d.innerText.trim()).find((x) => x.startsWith('Buy fee')) ?? null,
    facts: [...main.querySelectorAll('[data-fact]')].map((x) => x.dataset.fact).join(','),
    stakeTabs: [...main.querySelectorAll('[role="tab"]')].map((x) => x.innerText.trim()).join(','),
    second: main.querySelector('[data-view="LPVault.secondUnlockTime, LPVault.secondWithdrawn"]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
    launchBuy: main.querySelector('[data-view="Launcher.LAUNCH_BUY_ETH"]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
    ownerSecond: ['collectSecondFees', 'withdrawSecondPosition'].filter((x) => main.querySelector('[data-action="' + x + '"]')).join(','),
    readError: /Could not read|The last read failed|reading [A-Za-z]+\\.[A-Za-z]+ failed/.test(t) || vis('.read-error') > 0,
    pending: /Reading the (figures|contracts)/.test(t),
    notDeployed: /not deployed/i.test(t) || /Not deployed on Ethereum yet/.test(document.querySelector('footer').innerText),
    addresses: (document.body.innerText.match(/0x[0-9a-fA-F]{40}/g) ?? []).filter((a) => a.toLowerCase() !== '${RETIRED.toLowerCase()}' && !/1234567890abcdef/i.test(a)), // the Docs routing note's example buyer is not a contract
    footerContracts: document.querySelectorAll('.footer-contracts li').length,
  };
})()`;

const sideways = [];
const problems = [];
const expect = (ok, what) => {
  if (!ok) problems.push(what);
};

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
async function pickWallet(address) {
  await send('Page.navigate', { url: SITE });
  await sleep(500);
  await evalJs(`localStorage.setItem('uptown-local-wallet', '${address}'), 1`);
}
async function open(hash) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await sleep(900);
  for (let i = 0; i < 80 && LOCAL; i++) {
    if (await evalJs("!!document.querySelector('.read-line')?.dataset.block")) break;
    await sleep(250);
  }
  await sleep(LOCAL ? 1500 : 600);
  await evalJs('document.fonts.ready.then(() => 1)');
}
async function photoPage(name) {
  await evalJs('window.scrollTo(0, 0), 1');
  const total = await evalJs('document.documentElement.scrollHeight');
  const width = await evalJs('document.documentElement.clientWidth');
  const slice = width < 700 ? 1400 : 1000;
  let n = 0;
  for (let y = 0; y < total; y += slice) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width, height: Math.min(slice, total - y), scale: 1 } });
    writeFileSync(join(OUT, `${name}-${String(++n).padStart(2, '0')}.png`), Buffer.from(r.result.data, 'base64'));
  }
  say(`   photos ${name}-01..${String(n).padStart(2, '0')}.png (${width} x ${total})`);
}

const PAGES = [
  ['home', '#/', WALLET],
  ['trade', '#/trade', WALLET],
  ['stake', '#/stake', WALLET],
  ['stats', '#/stats', WALLET],
  ['docs', '#/docs', WALLET],
  ['owner', '#/owner', OWNER],
];
const RETIRED_TEXT = `TOWN (${RETIRED}) was UpTown’s first deployment, launched on 15 October 2026 and retired. The project’s token is SKYLINE.`;

try {
  const sizes = LOCAL
    ? [
        [1280, 'light'],
        [390, 'dark'],
      ]
    : [[1280, 'light']];
  for (const [width, theme] of sizes) {
    await view(width, theme);
    const label = `${width}-${theme}`;
    for (const [name, hash, who] of PAGES) {
      if (LOCAL) await pickWallet(who);
      await open(hash);
      const f = await evalJs(FACTS);
      say(
        `${label} ${name}: "${f.head}"; TOWN outside the notice ${f.town}; retired notices ${f.retired.length}; day ${f.dayClock}; dollar figures ${f.usd}; read error ${f.readError}` +
          (f.priceLine ? `\n   price line: "${f.priceLine}"` : '') +
          (f.feeRow ? `\n   buy fee row: "${f.feeRow}"` : '') +
          (f.facts ? `\n   stake facts: ${f.facts}; tabs: ${f.stakeTabs}` : '') +
          (f.second ? `\n   second position: "${f.second}"; launch buy: "${f.launchBuy}"` : '') +
          (f.ownerSecond ? `\n   owner, second position actions: ${f.ownerSecond}` : '') +
          (!LOCAL ? `\n   not deployed: ${f.notDeployed}; contract addresses on the page: ${f.addresses.length}; footer contracts ${f.footerContracts}` : ''),
      );
      const where = `${label} ${name}`;
      expect(f.town === 0, `${where}: TOWN outside the retired notice`);
      expect(f.retired.length === (name === 'docs' ? 2 : 1) && f.retired.every((r) => r === RETIRED_TEXT), `${where}: retired notices ${JSON.stringify(f.retired)}`);
      expect(!f.retiredLinked, `${where}: TOWN's address is a link`);
      expect(!f.readError, `${where}: a read error is shown`);
      if (LOCAL) {
        expect(!f.pending, `${where}: still "Reading the figures"`);
        expect(f.dayClock === 1, `${where}: no day and countdown in the header`);
        expect(f.footerContracts === 7, `${where}: ${f.footerContracts} contracts in the footer`);
        expect(f.usd === 0, `${where}: a dollar figure although the local feed's answer is days old`);
        if (name === 'trade') {
          expect(f.feeRow === 'Buy fee (2%, to the treasury)', `${where}: buy fee row "${f.feeRow}"`);
          expect(/more than 3 hours, so no dollar figures are shown\.$/.test(f.priceLine ?? ''), `${where}: price line "${f.priceLine}"`);
        }
        if (name === 'stake') expect(f.facts === 'free,share,nft' && f.stakeTabs === 'Stake,Unstake,Claim', `${where}: facts ${f.facts}, tabs ${f.stakeTabs}`);
        if (name === 'stats') expect(!!f.second && /^0\.1\s?ETH/.test(f.launchBuy ?? ''), `${where}: second "${f.second}", launch buy "${f.launchBuy}"`);
        if (name === 'owner') expect(f.ownerSecond === 'collectSecondFees,withdrawSecondPosition', `${where}: owner second-position actions ${f.ownerSecond}`);
      } else {
        expect(f.notDeployed, `${where}: does not say "not deployed"`);
        expect(f.addresses.length === 0 && f.footerContracts === 0, `${where}: contract addresses shown: ${f.addresses.join(', ')}`);
        expect(f.usd === 0 && f.dayClock === 0, `${where}: a figure from the chain`);
      }
      const o = await evalJs(OVERFLOW);
      if (o.scrollW > o.vw || o.out.length) sideways.push({ label, name, ...o });
      await photoPage(`${name}-${label}`);
    }
  }
} finally {
  say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
  say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
  say(`== hosts contacted: ${[...hosts].map(([h, n]) => `${h} (${n})`).join(', ')}`);
  say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
  say(`== what this run found wrong: ${problems.length ? problems.join(' || ') : 'nothing'}`);
}
const foreign = [...hosts.keys()].filter((h) => h !== `http://127.0.0.1:${PORT}` && h !== RPC);
if (foreign.length) problems.push(`hosts other than the site and its RPC: ${foreign.join(', ')}`);
if (!LOCAL && hosts.has(RPC)) problems.push('the mainnet build with a TOWN address file contacted the network service');
const bad = violations.length || consoleMsgs.length || sideways.length || problems.length;
recording = false;

// ---- close everything this run started -----------------------------------------------------------
ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
await sleep(800);
edge.kill();
await new Promise((r) =>
  spawn('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${PROFILE_NAME}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' }).on('exit', r),
);
for (let i = 0; i < 10; i++) {
  await sleep(400);
  try {
    rmSync(profile, { recursive: true, force: true });
    break;
  } catch {
    /* Edge still closing: try again */
  }
}
await new Promise((r) => server.close(r));
writeFileSync(join(OUT, 'shots-log.txt'), logLines.join('\n') + '\n');
console.log(bad ? `FAILED: ${problems.join(' || ')}` : `OK: every page photographed and checked (${MODE}); no policy violation, no console message, no sideways scrolling`);
process.exit(bad ? 1 : 0);
