// CR-75 (F9k) review driver: photographs the owner's logo where the site shows it, and the
// browser-tab icon at the two sizes a browser draws it. Local review only; nothing here runs in
// the site. Pictures and the log go to the git-ignored review-shots/f9k/.
//
// Usage, from frontend/ (build dist/ first: VITE_CHAIN_ID=31337 npm run build):
//   node scripts/f9k-shots.mjs
//
// It serves the built site with the hosting headers of vercel.json (the real content-security
// policy, with connect-src pointed at the local node) on 127.0.0.1:4269 — never 4173, 5173 or
// 8545 — drives headless Edge, and reports every policy violation, console message and sideways
// scroll it sees. It never sends a transaction: it only opens pages and presses the theme switch
// and the menu button.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = resolve('dist');
const OUT = resolve('review-shots/f9k');
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4269;
const DEBUG_PORT = 9389;
const PROFILE_NAME = 'uptown-f9k-shots-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: run VITE_CHAIN_ID=31337 npm run build first');

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
say(`serving dist/ with the vercel.json headers on ${SITE}`);

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
await send('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });

const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 0.5) { let p = el.parentElement, clipped = false; while (p) { const s = getComputedStyle(p); if (['auto','hidden','scroll'].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').join('.') + ' ' + Math.round(r.right)); } } return { scrollW: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) }; })()`;
const sideways = [];

/** What the page is actually drawing: which of the two versions is on, and how big it is. */
const MARK = `(() => {
  const out = [];
  for (const a of document.querySelectorAll('a.wordmark')) {
    const svg = a.querySelector('svg.skyline');
    const r = svg.getBoundingClientRect();
    const on = (c) => [...svg.querySelectorAll('.' + c)].every((g) => getComputedStyle(g).display !== 'none');
    const off = (c) => [...svg.querySelectorAll('.' + c)].every((g) => getComputedStyle(g).display === 'none');
    out.push({
      where: a.classList.contains('small') ? 'footer' : 'header',
      shown: on('skyline-light') && off('skyline-dark') ? 'on-light' : on('skyline-dark') && off('skyline-light') ? 'on-dark' : 'BOTH OR NEITHER',
      size: Math.round(r.width * 100) / 100 + ' x ' + Math.round(r.height * 100) / 100,
      ratio: Math.round((r.width / r.height) * 1000) / 1000,
      word: a.textContent.trim(),
      href: a.getAttribute('href'),
      label: a.getAttribute('aria-label'),
      inside: r.left >= a.getBoundingClientRect().left - 0.5 && r.right <= a.getBoundingClientRect().right + 0.5,
    });
  }
  return out;
})()`;

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
async function open() {
  await send('Page.navigate', { url: SITE });
  await sleep(900);
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('a.wordmark svg.skyline')")) break;
    await sleep(250);
  }
  for (let i = 0; i < 60; i++) {
    if (await evalJs("!!document.querySelector('.read-line')?.dataset.block || !!document.querySelector('.footer-note')")) break;
    await sleep(250);
  }
  await sleep(600);
  await evalJs('document.fonts.ready.then(() => 1)');
}
/** A picture of one part of the page, with its own overflow check. */
async function shot(name, sel, pad = 12) {
  const o = await evalJs(OVERFLOW);
  if (o.scrollW > o.vw || o.out.length) sideways.push({ name, ...o });
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  const vw = await evalJs('document.documentElement.clientWidth');
  const clip = { x: 0, y: Math.max(0, Math.round(box.y - pad)), width: vw, height: Math.round(box.h + 2 * pad), scale: 1 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png  ${clip.width} x ${clip.height}  (scroll width ${o.scrollW}/${o.vw})`);
}

/** The same part of the page drawn four times larger, to judge the drawing beside the word. */
async function closeUp(name, sel) {
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  const clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.w + 16, height: box.h + 16, scale: 4 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png  (${Math.round(clip.width)} x ${Math.round(clip.height)} css pixels, drawn four times larger)`);
}

// ---- the wordmark, as a first visit sees it (the browser's own setting, no stored choice) --------
for (const theme of ['light', 'dark']) {
  await view(1280, theme);
  await open();
  say(`== 1280 px, the browser's own setting is ${theme}, nothing remembered`);
  say(`   ${JSON.stringify(await evalJs(MARK))}`);
  await shot(`header-1280-${theme}`, 'header.site-header');
  await closeUp(`wordmark-header-${theme}-x4`, 'header a.wordmark');
  await shot(`footer-1280-${theme}`, '.footer-brand');
  await closeUp(`wordmark-footer-${theme}-x4`, 'footer a.wordmark.small');
}

// ---- the theme switch: the drawing must change with it, on the same page -------------------------
await view(1280, 'light');
await open();
say('== 1280 px, the browser says light, then the visitor presses the switch');
say(`   before: ${JSON.stringify(await evalJs(MARK))}`);
await evalJs("document.querySelector('header .icon-btn[aria-label^=\"Switch to\"]').click(), 1");
await sleep(400);
say(`   after:  ${JSON.stringify(await evalJs(MARK))}`);
say(`   data-theme is now: ${await evalJs("document.documentElement.getAttribute('data-theme')")}`);
await shot('header-1280-light-after-switch-to-dark', 'header.site-header');
// and a reload with that choice remembered: theme-init.js sets it before the page paints
await send('Page.reload', { ignoreCache: true });
await sleep(900);
await open();
say(`   after a reload with the choice remembered: ${JSON.stringify(await evalJs(MARK))}`);
await shot('header-1280-remembered-dark', 'header.site-header');
await evalJs("localStorage.removeItem('uptown-theme'), 1");

// ---- the narrow screen, menu closed and open ------------------------------------------------------
for (const theme of ['light', 'dark']) {
  await view(390, theme);
  await open();
  say(`== 390 px, the browser's own setting is ${theme}`);
  say(`   ${JSON.stringify(await evalJs(MARK))}`);
  await shot(`header-390-${theme}-menu-closed`, 'header.site-header');
  await evalJs("document.querySelector('header .nav-toggle').click(), 1");
  await sleep(350);
  const open1 = await evalJs("document.querySelector('header .nav-toggle').getAttribute('aria-expanded')");
  say(`   menu open: ${open1}`);
  await shot(`header-390-${theme}-menu-open`, 'header.site-header', 4);
  await shot(`header-390-${theme}-menu-open-full`, '.site-nav.open', 70);
  await evalJs("document.querySelector('header .nav-toggle').click(), 1");
  await sleep(250);
  await shot(`footer-390-${theme}`, '.footer-brand');
}

say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
say(`== hosts contacted: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);

// ---- the browser-tab icon at the sizes a browser draws it ------------------------------------------
// A plain local page, outside the served site: it draws public/favicon.svg into a 16 px and a 32 px
// canvas, then blows each up ten times with smoothing off, so the picture shows the real pixels.
const favicon = readFileSync(join(DIST, 'favicon.svg'), 'utf8');
const gallery = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#f4f4f5;font:13px system-ui;padding:16px;color:#18181b}
.row{display:flex;gap:22px;align-items:flex-start}
canvas{image-rendering:pixelated}
.on-dark{background:#0b0b0d;padding:10px;display:inline-block}
h2{font:600 13px system-ui;margin:0 0 6px}
</style><h2>public/favicon.svg — actual size, then ten times larger (real pixels)</h2>
<div class="row" id="app"></div>
<script>
const src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(${JSON.stringify(favicon)})));
window.ready = (async () => {
  const app = document.getElementById('app');
  for (const size of [16, 32]) {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    c.getContext('2d').drawImage(img, 0, 0, size, size);
    const big = document.createElement('canvas'); big.width = size * 10; big.height = size * 10;
    const g = big.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, size * 10, size * 10);
    const wrap = document.createElement('div');
    const h = document.createElement('h2'); h.textContent = size + ' px';
    const small = document.createElement('div'); small.className = 'on-dark'; small.append(c);
    wrap.append(h, small, document.createElement('br'), big);
    app.append(wrap);
  }
  return 1;
})();
</script>`;
const page = join(OUT, 'favicon-sizes.html');
writeFileSync(page, gallery);
await send('Emulation.setDeviceMetricsOverride', { width: 620, height: 520, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await send('Page.navigate', { url: pathToFileURL(page).href });
await sleep(900);
await evalJs('window.ready');
await sleep(250);
const h = await evalJs('document.documentElement.scrollHeight');
const fav = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 620, height: h, scale: 1 } });
writeFileSync(join(OUT, 'favicon-16-and-32.png'), Buffer.from(fav.result.data, 'base64'));
say('photo favicon-16-and-32.png (the icon at 16 px and at 32 px, each also shown ten times larger)');

// ---- close everything this run started -------------------------------------------------------------
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
const bad = violations.length || consoleMsgs.length || sideways.length;
console.log(bad ? 'FAILED: see the lines above' : 'OK: no policy violation, no console message, no sideways scrolling');
process.exit(bad ? 1 : 0);
