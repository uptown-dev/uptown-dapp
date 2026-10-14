// F9u review driver (CR-93, CR-94, CR-95 item 1): photographs the header with the day countdown at
// 1280 and 390 px in both themes, the live Trade sell message, Rewards (schedule open), Stats, and
// the Docs rebates and sell-fee items at 390 dark, from the build in dist/; then the states the local
// chain cannot show (the four sell-fee states, the empty and nearly spent reserve) from the fixture
// gallery test/f9u-gallery.html, served by Vite's development server.
//
// Usage, from frontend/ (the chain running; build dist/ for the local chain first):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9u-shots.mjs
//
// Ports: the built site on 127.0.0.1:4298 (with the vercel.json headers), the gallery on 4299, the
// browser's debugging port 9398 — never 4173, 5173 or 8545. It sends nothing anywhere. Pictures and
// the log go to the git-ignored review-shots/f9u/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createServer as createVite } from 'vite';

const DIST = resolve('dist');
const OUT = resolve('review-shots/f9u');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4298;
const GALLERY_PORT = 4299;
const DEBUG_PORT = 9398;
const PROFILE_NAME = 'uptown-f9u-shots-profile';
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

// ---- the static server for dist/, with the hosting headers ---------------------------------------
const vercel = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const headers = vercel.headers.find((h) => h.source === '/(.*)').headers;
const server = await new Promise((r) => {
  const s = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path === '/' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    for (const h of headers) res.setHeader(h.key, h.key === 'Content-Security-Policy' ? h.value.replace(/connect-src [^;]+/, `connect-src ${RPC}`) : h.value);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  s.listen(PORT, '127.0.0.1', () => r(s));
});
const SITE = `http://127.0.0.1:${PORT}/`;
say(`serving dist/ (chain 31337) with the vercel.json headers on ${SITE}; wallet ${WALLET} (Test wallet 1)`);

// ---- the gallery, on Vite's development server (local chain) -------------------------------------
process.env.VITE_CHAIN_ID = '31337';
const vite = await createVite({ root: resolve('.'), configFile: resolve('vite.config.ts'), logLevel: 'warn', server: { host: '127.0.0.1', port: GALLERY_PORT, strictPort: true, hmr: false } });
await vite.listen();
const GALLERY = `http://127.0.0.1:${GALLERY_PORT}/test/f9u-gallery.html`;

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
    else if (/^\[vite\] connect/.test(t)) return; // the gallery's development server saying hello
    else consoleMsgs.push(`${m.params.type}: ${t}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleMsgs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
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
await send('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });

const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; return { scrollW: document.documentElement.scrollWidth, vw }; })()`;
const sideways = [];
const problems = [];

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
async function open(url) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url });
  await sleep(900);
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('.day-chip') && !!document.querySelector('main .card, main .hero')")) break;
    await sleep(250);
  }
  await sleep(1200);
  await evalJs('document.fonts.ready.then(() => 1)');
}
async function shot(name, sel, { pad = 10, scale = 1 } = {}) {
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; window.scrollTo(0, 0); const r = e.getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; })()`);
  if (!box) {
    problems.push(`${name}: nothing on the page matches ${sel}`);
    return;
  }
  const vw = await evalJs('document.documentElement.clientWidth');
  const clip = { x: 0, y: Math.max(0, Math.round(box.y - pad)), width: vw, height: Math.round(box.h + 2 * pad), scale };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`   photo ${name}.png  ${clip.width} x ${clip.height}${scale !== 1 ? ` at ${scale}x` : ''}`);
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
const headerText = `(() => { const v = [...document.querySelectorAll('.day-chip, .day-line')].filter((e) => getComputedStyle(e).display !== 'none'); return v.map((e) => e.className + ': ' + e.querySelector('[aria-hidden]').textContent.replace(/\\s+/g, ' ').trim() + ' | ' + e.querySelector('.visually-hidden').textContent).join(' ; '); })()`;

try {
  await send('Page.navigate', { url: SITE });
  await sleep(600);
  await evalJs(`localStorage.setItem('uptown-local-wallet', '${WALLET}'), 1`);
  // 1. The header at 1280 and 390 px, light and dark.
  for (const width of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
      await view(width, theme);
      const label = `${width}-${theme}`;
      await open(`${SITE}#/`);
      say(`${label} header: ${await evalJs(headerText)}`);
      await shot(`header-${label}`, 'header.site-header', { pad: 0, scale: 2 });
      const o = await evalJs(OVERFLOW);
      if (o.scrollW > o.vw) sideways.push({ label, page: 'home', ...o });
    }
  }
  // 2. The live pages: Trade (sell), Rewards with the schedule open, Stats; at 1280 light.
  await view(1280, 'light');
  await open(`${SITE}#/trade/sell`);
  await evalJs(`(() => { const i = document.querySelector('#sell-town'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '1,000,000'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await sleep(2500);
  say(`1280-light trade-sell (live): ${await evalJs("document.querySelector('.sell-mode').innerText.replace(/\\s+/g, ' ')")}`);
  await shot('trade-sell-live-1280-light', '.swap-card');
  await open(`${SITE}#/rewards`);
  await evalJs("document.querySelectorAll('main details').forEach((d) => (d.open = true)), 1");
  await sleep(400);
  await shot('rewards-schedule-1280-light', 'main details');
  await photoPage('rewards-1280-light');
  await open(`${SITE}#/stats`);
  await photoPage('stats-1280-light');
  await shot('stats-town-1280-light', 'main .grid-2');
  // 3. Stats and the Docs items at 390 dark.
  await view(390, 'dark');
  await open(`${SITE}#/stats`);
  await photoPage('stats-390-dark');
  let o = await evalJs(OVERFLOW);
  if (o.scrollW > o.vw) sideways.push({ label: '390-dark', page: 'stats', ...o });
  await open(`${SITE}#/docs`);
  await shot('docs-rebates-390-dark', '#docs-rebates');
  await shot('docs-burn-390-dark', '#docs-burn');
  await shot('docs-hook-390-dark', '#docs-hook');
  o = await evalJs(OVERFLOW);
  if (o.scrollW > o.vw) sideways.push({ label: '390-dark', page: 'docs', ...o });
  await view(390, 'light');
  await open(`${SITE}#/rewards`);
  await evalJs("document.querySelectorAll('main details').forEach((d) => (d.open = true)), 1");
  await sleep(400);
  await shot('rewards-schedule-390-light', 'main details');

  // 4. The fixture gallery: the four sell-fee states and the reserve notices, at 1280 light (and the empty notice at 390 dark).
  for (const [width, theme, names] of [
    [1280, 'light', ['sell-burn', 'sell-half', 'sell-eth', 'sell-split', 'rewards-empty', 'rewards-low']],
    [390, 'dark', ['sell-split', 'rewards-empty']],
  ]) {
    await view(width, theme);
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await send('Page.navigate', { url: GALLERY });
    for (let i = 0; i < 120; i++) {
      if (await evalJs('!!window.__ready')) break;
      await sleep(250);
    }
    await sleep(800);
    for (const n of names) {
      const t = await evalJs(`(() => { const s = document.querySelector('[data-shot="${n}"]'); const m = s.querySelector('.sell-mode, .notice'); const rows = s.querySelector('#trade-panel-sell .swap-rows'); return (m ? m.innerText : '').replace(/\\s+/g, ' ') + (rows ? ' || ' + rows.innerText.replace(/\\s+/g, ' ').replace(/ Minimum received.*$/, '') : ''); })()`);
      say(`${width}-${theme} ${n}: ${t}`);
      const sel = n.startsWith('sell') ? `[data-shot="${n}"] .swap-card` : `[data-shot="${n}"]`;
      await shot(`${n}-${width}-${theme}`, n.startsWith('rewards') ? `[data-shot="${n}"] .notice` : sel);
    }
    if (width === 1280) await shot('rewards-empty-schedule-1280-light', '[data-shot="rewards-empty"] details');
    o = await evalJs(OVERFLOW);
    if (o.scrollW > o.vw) sideways.push({ label: `${width}-${theme}`, page: 'gallery', ...o });
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
await vite.close();
await new Promise((r) => server.close(r));
writeFileSync(join(OUT, 'shots-log.txt'), logLines.join('\n') + '\n');
console.log(bad ? 'FAILED: see the lines above' : 'OK: header, pages and fixtures photographed; no policy violation, no console message, no sideways scrolling');
process.exit(bad ? 1 : 0);
