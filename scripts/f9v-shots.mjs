// CR-95 items 2 and 3 (F9v) review driver: photographs the Trade (buy and sell), Rewards, Stake and
// Stats pages of the build in dist/, with Test wallet 1 picked, at 1280 and 390 px in both themes,
// and reads back the dollar figures each page shows.
//
// It checks, on the built site: that the Trade page has no "Buy here" line; that each page shows
// dollar figures and that every one carries the fallback mark while the chain reports the owner's
// fallback price (the local chain does: local-chain.sh sets it); TOWN's price line on Trade; that
// no dollar figure stands without its amount (each sits in an element that also shows ETH, WETH or
// TOWN); and that no page scrolls sideways. It reports every policy violation and console message.
//
// Usage, from frontend/ (build dist/ first for the local chain, with the chain running):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9v-shots.mjs
//
// It serves the built site with the hosting headers of vercel.json on 127.0.0.1:4296 — never 4173,
// 5173 or 8545 — and drives headless Edge. It picks the local test wallet the way the site's own
// picker remembers it (the page's storage), types a sell amount into the form, and sends nothing
// anywhere. Local review only; nothing here runs in the site. Pictures and the log go to the
// git-ignored review-shots/f9v/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const DIST = resolve('dist');
const OUT = resolve('review-shots/f9v');
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4296;
const DEBUG_PORT = 9396;
const PROFILE_NAME = 'uptown-f9v-shots-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: run VITE_CHAIN_ID=31337 npm run build first');
const addressFile = JSON.parse(readFileSync(resolve('src/addresses/31337.json'), 'utf8'));
const WALLET = addressFile.testWallets?.[0];
if (!WALLET) throw new Error('src/addresses/31337.json names no test wallet: start the local chain and build for 31337 first');

// ---- the static server, with the hosting headers -------------------------------------------------
const vercel = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const base = vercel.headers.find((h) => h.source === '/(.*)').headers;
const server = await new Promise((r) => {
  const s = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path === '/' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    for (const h of base) res.setHeader(h.key, h.key === 'Content-Security-Policy' ? h.value.replace(/connect-src [^;]+/, `connect-src ${RPC}`) : h.value);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  s.listen(PORT, '127.0.0.1', () => r(s));
});
const SITE = `http://127.0.0.1:${PORT}/`;
say(`serving dist/ (chain 31337) with the vercel.json headers on ${SITE}; wallet ${WALLET} (Test wallet 1)`);

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
await send('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });

const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 0.5) { let p = el.parentElement, clipped = false; while (p) { const s = getComputedStyle(p); if (['auto','hidden','scroll'].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').join('.') + ' ' + Math.round(r.right)); } } return { scrollW: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) }; })()`;

/**
 * The dollar figures on the shown page (hidden tab panels left out): how many, how many carry the
 * fallback mark, the first few with the amount they stand beside, and any that stands alone (its
 * nearest row, cell, figure or sentence shows no ETH, WETH or TOWN amount).
 */
const USD = `(() => {
  const shown = [...document.querySelectorAll('main .usd')].filter((u) => u.getClientRects().length > 0);
  const holder = (u) => u.closest('.fig, .row, td, .swap-box, .uses, p, li, .hint, .setting, .price-line') ?? u.parentElement;
  // A table cell's unit may be in its column's heading (or, stacked on a phone, its label).
  const context = (u) => {
    const h = holder(u);
    let t = h.innerText.replace(u.innerText, '');
    if (h.tagName === 'TD') t += ' ' + (h.dataset.label ?? '') + ' ' + (h.closest('table')?.querySelectorAll('thead th')[h.cellIndex]?.textContent ?? '');
    return t;
  };
  // Beside an amount: its row, cell, figure or sentence also shows a number with ETH, WETH or TOWN
  // (in a table cell the unit can be in the column's heading or the table's own words).
  const lone = shown.filter((u) => !/[0-9]/.test(context(u)) || (!/ETH|WETH|TOWN/.test(context(u)) && !/TOWN|ETH/.test(u.closest('table')?.innerText ?? '')));
  const sample = shown.slice(0, 4).map((u) => holder(u).innerText.replace(/\\s+/g, ' ').trim().slice(0, 90));
  return { count: shown.length, marked: shown.filter((u) => u.classList.contains('fallback') && u.querySelector('svg')).length, lone: lone.map((u) => holder(u).innerText.slice(0, 60)), sample };
})()`;

const sideways = [];
const problems = [];

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
async function open(hash) {
  // A fresh load for every page: a change of the address's hash alone would keep the page before.
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await sleep(900);
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('.read-line')?.dataset.block && !!document.querySelector('main .card')")) break;
    await sleep(250);
  }
  await sleep(1200);
  await evalJs('document.fonts.ready.then(() => 1)');
}
/** Sets an input the way typing does, then waits for the estimate. */
async function typeIn(sel, value) {
  await evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  // The estimate comes from the quoter a moment later.
  for (let i = 0; i < 40; i++) {
    if (await evalJs("!!document.querySelector('#trade-panel-sell .swap-output-usd .usd')")) break;
    await sleep(250);
  }
  await sleep(400);
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
async function shot(name, sel, pad = 10) {
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; window.scrollTo(0, 0); const r = e.getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; })()`);
  if (!box) {
    problems.push(`${name}: nothing on the page matches ${sel}`);
    return;
  }
  const vw = await evalJs('document.documentElement.clientWidth');
  const clip = { x: 0, y: Math.max(0, Math.round(box.y - pad)), width: vw, height: Math.round(box.h + 2 * pad), scale: 1 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`   photo ${name}.png  ${clip.width} x ${clip.height}`);
}

const PAGES = [
  ['trade', '#/trade'],
  ['trade-sell', '#/trade/sell'],
  ['rewards', '#/rewards'],
  ['stake', '#/stake'],
  ['stats', '#/stats'],
];

try {
  // Pick Test wallet 1 the way the site's own picker remembers it.
  await send('Page.navigate', { url: SITE });
  await sleep(600);
  await evalJs(`localStorage.setItem('uptown-local-wallet', '${WALLET}'), 1`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(800);
  for (const width of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
      await view(width, theme);
      const label = `${width}-${theme}`;
      for (const [name, hash] of PAGES) {
        await open(hash);
        if (name === 'trade-sell') await typeIn('#sell-town', '1,000,000');
        const u = await evalJs(USD);
        const bg = await evalJs('getComputedStyle(document.body).backgroundColor');
        say(`${label} ${name}: ${u.count} dollar figures shown, ${u.marked} with the fallback mark; page background ${bg}`);
        say(`   for example: ${u.sample.join(' | ')}`);
        if (u.count === 0) problems.push(`${label} ${name}: no dollar figure`);
        if (u.marked !== u.count) problems.push(`${label} ${name}: ${u.count - u.marked} dollar figures without the fallback mark while the chain reports the fallback price`);
        if (u.lone.length) problems.push(`${label} ${name}: dollar figures without an amount beside them: ${u.lone.join(' / ')}`);
        if (name === 'trade') {
          const line = await evalJs("document.querySelector('.price-line')?.innerText.replace(/\\s+/g, ' ').trim() ?? null");
          const credit = await evalJs("!!document.querySelector('.credit-line') || document.body.innerText.includes('Buy here so the rebate')");
          say(`   TOWN price line: ${line}; the "Buy here" line present: ${credit}`);
          if (!line || !/^TOWN price ≈ \$0\.\d+ [\d.,]+ gwei per TOWN in the pool at ETH \$[\d,.]+, the owner’s fallback price$/.test(line)) problems.push(`${label}: the price line reads "${line}"`);
          if (credit) problems.push(`${label}: the "Buy here" line is still there`);
          await shot(`trade-card-${label}`, '.swap-card');
        }
        if (name === 'trade-sell') await shot(`trade-sell-card-${label}`, '.swap-card');
        const o = await evalJs(OVERFLOW);
        if (o.scrollW > o.vw || o.out.length) sideways.push({ label, name, ...o });
        await photoPage(`${name}-${label}`);
      }
    }
  }
} finally {
  say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
  say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
  say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
  say(`== what this run found wrong: ${problems.length ? problems.join(' || ') : 'nothing'}`);
}
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
console.log(bad ? 'FAILED: see the lines above' : 'OK: dollar figures on every page photographed, all marked as the fallback price, no "Buy here" line, no policy violation, no console message, no sideways scrolling');
process.exit(bad ? 1 : 0);
