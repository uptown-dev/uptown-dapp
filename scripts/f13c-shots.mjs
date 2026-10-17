// F13c (CR-102) review driver: the mainnet build as visitors see it after SKYLINE's phase 1
// (17 October 2026): the seven contracts on Ethereum, not launched yet.
//
//   node scripts/f13c-shots.mjs     after VITE_CHAIN_ID=1 npm run build
//
// Home, Trade, Stake, Stats and Docs at 1280 px light and 390 px dark, read from Ethereum mainnet
// through the build's own network service (read-only: the page only calls views; no wallet exists
// in the headless browser, so nothing can be connected or sent). For each page it records what the
// page says (its text, saved beside the photographs), the retired-TOWN notice, the header's day,
// the dollar figures, the GMGN mark, the footer's contracts, read errors, and whether the page is in
// its "deployed, not launched" state; it reports policy violations, console messages, hosts
// contacted and sideways scrolling. It reports; it changes nothing on the site.
//
// It serves dist/ with the hosting headers of vercel.json on 127.0.0.1:4341 (never 4173, 5173 or
// 8545) and drives headless Edge (debugging port 9441). Pictures, page texts and the log go to the
// git-ignored review-shots/f13c/mainnet/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const DIST = resolve('dist');
const OUT = resolve('review-shots/f13c/mainnet');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'https://ethereum-rpc.publicnode.com';
const PORT = 4341;
const DEBUG_PORT = 9441;
const PROFILE_NAME = 'uptown-f13c-shots-profile';
const RETIRED = '0x994d362B403a5AbE6D815749f63c23B8e807fCF5';
const SKYLINE = '0x9Ce79b2eB03fd83f3a8051234FF0b9fE4e654567';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: run VITE_CHAIN_ID=1 npm run build first');
const builtFor = readFileSync(join(DIST, 'index.html'), 'utf8').match(/connect-src ([^;"]+)/)?.[1].trim();
if (builtFor !== RPC) throw new Error(`dist/ is built for ${builtFor}, not ${RPC}: run VITE_CHAIN_ID=1 npm run build first`);
const file = JSON.parse(readFileSync(resolve('src/addresses/1.json'), 'utf8'));
if (file.tokenSymbol !== 'SKYLINE' || file.contracts?.UpTownToken !== SKYLINE) throw new Error('src/addresses/1.json is not SKYLINE\'s phase-1 record');

// ---- the static server, with the hosting headers (the policy exactly as vercel.json sends it) ------
const vercel = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const base = vercel.headers.find((h) => h.source === '/(.*)').headers;
const server = await new Promise((r) => {
  const s = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = join(DIST, path === '/' ? 'index.html' : path);
    if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html');
    for (const h of base) res.setHeader(h.key, h.value);
    res.setHeader('Content-Type', TYPES[extname(f)] ?? 'application/octet-stream');
    res.end(readFileSync(f));
  });
  s.listen(PORT, '127.0.0.1', () => r(s));
});
const SITE = `http://127.0.0.1:${PORT}/`;
say(`serving dist/ (chain 1, SKYLINE phase 1) with the vercel.json headers on ${SITE}; reading through ${RPC}`);

// ---- the browser ---------------------------------------------------------------------------------
const profile = resolve(tmpdir(), PROFILE_NAME);
rmSync(profile, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
say(`headless Edge started, process ${edge.pid}`);
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
const rpcMethods = new Map();
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
    // Every JSON-RPC method the page asks the network service for (the proof that it only reads).
    if (u.origin === RPC && m.params.request.postData) {
      try {
        const body = JSON.parse(m.params.request.postData);
        for (const c of Array.isArray(body) ? body : [body]) rpcMethods.set(c.method, (rpcMethods.get(c.method) ?? 0) + 1);
      } catch {
        rpcMethods.set('(unreadable body)', (rpcMethods.get('(unreadable body)') ?? 0) + 1);
      }
    }
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

/** What a page shows (the retired notice taken out before the TOWN search). */
const FACTS = `(() => {
  const all = document.body.cloneNode(true);
  all.querySelectorAll('.retired-note').forEach((n) => n.remove());
  all.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
  const words = all.textContent.replace(/\\s+/g, ' ');
  const main = document.querySelector('main');
  const t = main.innerText.replace(/\\s+/g, ' ');
  const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0);
  const gm = document.querySelector('footer [data-place="GMGN"]');
  return {
    head: main.querySelector('h1')?.innerText.trim() ?? null,
    town: (words.match(/\\bTOWN\\b|TownHook|TownStaking/g) ?? []).length,
    retired: [...document.querySelectorAll('.retired-note')].map((n) => n.innerText.replace(/\\s+/g, ' ').trim()),
    retiredLinked: !!document.querySelector('a[href*="${RETIRED}"], a[href*="${RETIRED.toLowerCase()}"]'),
    day: vis('.day-chip, .day-line').map((e) => e.innerText.replace(/\\s+/g, ' ').trim()),
    usd: vis('main .usd').length,
    usdText: vis('main .usd').slice(0, 4).map((e) => e.innerText.trim()),
    offActions: [...main.querySelectorAll('[data-off]')].map((x) => x.dataset.off + ': ' + x.innerText.replace(/\\s+/g, ' ').trim()),
    notices: [...main.querySelectorAll('.notice')].map((x) => x.innerText.replace(/\\s+/g, ' ').trim().slice(0, 220)),
    gmgn: gm ? { tag: gm.tagName.toLowerCase(), href: gm.getAttribute('href'), target: gm.getAttribute('target'), aria: gm.getAttribute('aria-label'), word: gm.querySelector('.place-word')?.textContent.trim() ?? null } : null,
    network: document.querySelector('header')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
    readError: /Could not read|The last read failed|reading [A-Za-z]+\\.[A-Za-z]+ failed/.test(t) || vis('.read-error').length > 0,
    pending: /Reading the (figures|contracts)/.test(t),
    notDeployed: /not deployed/i.test(t) || /Not deployed on Ethereum yet/.test(document.querySelector('footer').innerText),
    footerContracts: [...document.querySelectorAll('.footer-contracts li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()),
    mainText: main.innerText,
    footerText: document.querySelector('footer').innerText,
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
async function open(hash) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await sleep(1500);
  // Wait for the reads from mainnet to land (up to 40 s): no "Reading the ..." left in the page.
  let waited = 0;
  for (; waited < 160; waited++) {
    if (await evalJs("!/Reading the (figures|contracts)/.test(document.querySelector('main')?.innerText ?? 'Reading the figures')")) break;
    await sleep(250);
  }
  await sleep(2500);
  await evalJs('document.fonts.ready.then(() => 1)');
  return waited * 250 + 1500;
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
  ['home', '#/'],
  ['trade', '#/trade'],
  ['stake', '#/stake'],
  ['stats', '#/stats'],
  ['docs', '#/docs'],
];
const RETIRED_TEXT = `TOWN (${RETIRED}) was UpTown’s first deployment, launched on 15 October 2026 and retired. The project’s token is SKYLINE.`;

try {
  for (const [width, theme] of [
    [1280, 'light'],
    [390, 'dark'],
  ]) {
    await view(width, theme);
    const label = `${width}-${theme}`;
    for (const [name, hash] of PAGES) {
      const ms = await open(hash);
      const f = await evalJs(FACTS);
      writeFileSync(join(OUT, `${name}-${label}.txt`), `${f.mainText}\n\n---- footer ----\n${f.footerText}\n`);
      say(
        `${label} ${name} (read in about ${(ms / 1000).toFixed(1)} s): "${f.head}"; TOWN outside the notice ${f.town}; retired notices ${f.retired.length}; day ${JSON.stringify(f.day)}; dollar figures ${f.usd}${f.usd ? ` ${JSON.stringify(f.usdText)}` : ''}; read error ${f.readError}; still reading ${f.pending}; not deployed ${f.notDeployed}` +
          `\n   header: "${f.network}"` +
          `\n   GMGN: ${JSON.stringify(f.gmgn)}; footer contracts ${f.footerContracts.length}` +
          (f.offActions.length ? `\n   switched off: ${f.offActions.join(' | ')}` : '') +
          (f.notices.length ? `\n   notices: ${f.notices.join(' | ')}` : ''),
      );
      const where = `${label} ${name}`;
      expect(f.town === 0, `${where}: TOWN outside the retired notice`);
      expect(f.retired.length === (name === 'docs' ? 2 : 1) && f.retired.every((r) => r === RETIRED_TEXT), `${where}: retired notices ${JSON.stringify(f.retired)}`);
      expect(!f.retiredLinked, `${where}: TOWN's address is a link`);
      expect(!f.readError, `${where}: a read error is shown`);
      expect(!f.pending, `${where}: still "Reading ..." after 40 s`);
      expect(!f.notDeployed, `${where}: says "not deployed"`);
      expect(f.footerContracts.length === 7, `${where}: ${f.footerContracts.length} contracts in the footer`);
      expect(f.gmgn?.tag === 'a' && f.gmgn.href === `https://gmgn.ai/eth/token/${SKYLINE}` && f.gmgn.target === '_blank', `${where}: GMGN ${JSON.stringify(f.gmgn)}`);
      const o = await evalJs(OVERFLOW);
      if (o.scrollW > o.vw || o.out.length) sideways.push({ label, name, ...o });
      await photoPage(`${name}-${label}`);
    }
  }
} finally {
  say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
  say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
  say(`== hosts contacted: ${[...hosts].map(([h, n]) => `${h} (${n})`).join(', ')}`);
  say(`== JSON-RPC methods asked of ${RPC}: ${[...rpcMethods].map(([m, n]) => `${m} (${n})`).join(', ') || 'none'}`);
  say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
}
const foreign = [...hosts.keys()].filter((h) => h !== `http://127.0.0.1:${PORT}` && h !== RPC);
if (foreign.length) problems.push(`hosts other than the site and its RPC: ${foreign.join(', ')}`);
const READ_ONLY = new Set(['eth_call', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_chainId', 'eth_getBalance', 'eth_getCode', 'eth_getStorageAt']);
const writes = [...rpcMethods.keys()].filter((m) => !READ_ONLY.has(m));
if (writes.length) problems.push(`JSON-RPC methods that are not plain reads: ${writes.join(', ')}`);
say(`== what this run found wrong: ${problems.length ? problems.join(' || ') : 'nothing'}`);
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
console.log(bad ? `FAILED: ${problems.join(' || ')}` : 'OK: every page photographed and checked (mainnet, deployed, not launched); no policy violation, no console message, no sideways scrolling');
process.exit(bad ? 1 : 0);
