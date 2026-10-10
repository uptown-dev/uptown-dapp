// CR-80 (F9n) review driver: photographs the sell form's daily sell-fee message on the build that is
// in dist/, reads the sentence back out of the rendered page, and photographs the same message where
// the Stats page shows it. Local review only; nothing here runs in the site. Pictures and the log go
// to the git-ignored review-shots/f9n/.
//
// Usage, from frontend/ (build dist/ for the local chain first):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9n-shots.mjs 31337
//
// It serves the built site with the hosting headers of vercel.json on 127.0.0.1:4274 — never 4173,
// 5173 or 8545 — drives headless Edge, and reports every policy violation, console message and
// sideways scroll it sees. It opens pages and presses the site's own "Sell" tab; it sends no
// transaction, asks no wallet for one, and connects no wallet at all.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const CHAIN = process.argv[2] ?? '31337';
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f9n/chain-${CHAIN}`);
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4274;
const DEBUG_PORT = 9394;
const PROFILE_NAME = 'uptown-f9n-shots-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no dist/index.html: run VITE_CHAIN_ID=${CHAIN} npm run build first`);
const built = readFileSync(join(DIST, 'index.html'), 'utf8');
say(`dist/index.html connect-src: ${/connect-src ([^;]+)/.exec(built)?.[1] ?? '(none)'}`);

// ---- the static server, with the hosting headers -------------------------------------------------
const vercel = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const base = vercel.headers.find((h) => h.source === '/(.*)').headers;
const server = await new Promise((r) => {
  const s = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path === '/' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    for (const h of base) res.setHeader(h.key, h.key === 'Content-Security-Policy' && CHAIN === '31337' ? h.value.replace(/connect-src [^;]+/, `connect-src ${RPC}`) : h.value);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  s.listen(PORT, '127.0.0.1', () => r(s));
});
const SITE = `http://127.0.0.1:${PORT}/`;
say(`serving dist/ (chain ${CHAIN}) with the vercel.json headers on ${SITE}`);

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
const problems = [];

/** The sell form's mode box, read back out of the rendered page. */
const SELL_MODE = `(() => {
  const box = document.querySelector('#trade-panel-sell .sell-mode');
  if (!box) return null;
  const t = (el) => el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
  return {
    hidden: !!document.querySelector('#trade-panel-sell').hasAttribute('hidden'),
    view: box.getAttribute('data-view'),
    mode: t(box.querySelector('.sell-mode-value')),
    title: t(box.querySelector('.sell-mode-title')),
    reason: t(box.querySelector('p.small.muted')),
    whole: t(box),
  };
})()`;

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
/** Opens a page of the site and waits for the figures to be read. */
async function open(hash = '') {
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await sleep(900);
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('.header-row')")) break;
    await sleep(250);
  }
  let read = false;
  for (let i = 0; i < 200; i++) {
    read = await evalJs("!!document.querySelector('.sell-mode') || !!document.querySelector('.footer-note')");
    if (read) break;
    await sleep(250);
  }
  if (!read) problems.push(`the figures were not read within 50 seconds (${hash || 'the homepage'})`);
  await sleep(600);
  await evalJs('document.fonts.ready.then(() => 1)');
}
/** A picture of one part of the page, with its own overflow check. */
async function shot(name, sel, pad = 12) {
  const o = await evalJs(OVERFLOW);
  if (o.scrollW > o.vw || o.out.length) sideways.push({ name, ...o });
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  if (!box) {
    problems.push(`${name}: nothing on the page matches ${sel}`);
    return;
  }
  const vw = await evalJs('document.documentElement.clientWidth');
  const clip = { x: 0, y: Math.max(0, Math.round(box.y - pad)), width: vw, height: Math.round(box.h + 2 * pad), scale: 1 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png  ${clip.width} x ${clip.height}  (scroll width ${o.scrollW}/${o.vw})`);
}
/** One part drawn four times larger, so every word of the message can be read in the picture. */
async function closeUp(name, sel) {
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  if (!box) {
    problems.push(`${name}: nothing on the page matches ${sel}`);
    return;
  }
  const clip = { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: box.w + 20, height: box.h + 20, scale: 4 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png  (${Math.round(clip.width)} x ${Math.round(clip.height)} css pixels, drawn four times larger)`);
}

// ---- the sell form's message, at both widths and in both themes ----------------------------------
for (const [width, theme] of [
  [1280, 'light'],
  [1280, 'dark'],
  [390, 'light'],
  [390, 'dark'],
]) {
  await view(width, theme);
  await open('#/trade/sell');
  const m = await evalJs(SELL_MODE);
  say(`== the sell form at ${width} px, ${theme}`);
  say(`   ${JSON.stringify(m)}`);
  if (!m) problems.push(`${width} px ${theme}: the sell form has no mode box`);
  else {
    if (m.hidden) problems.push(`${width} px ${theme}: the sell panel is hidden, so the message is not the one a visitor reads`);
    if (/did not burn more than it paid/.test(m.whole)) problems.push(`${width} px ${theme}: the old clause is still on the page`);
    if (/: it inflation|it inflation/.test(m.whole)) problems.push(`${width} px ${theme}: an "it" is left in front of the new clause`);
    if (!/inflation (?:exceeded|matched) deflation, so today the fee is burned\.$/.test(m.reason) && !/it burned more than it paid, so today the fee is in ETH\.$/.test(m.reason) && !/first sell\.$|floor is reached|reserve is spent|no day before it/.test(m.reason))
      problems.push(`${width} px ${theme}: the reason reads "${m.reason}", which is none of the sentences CR-80 allows`);
  }
  await shot(`sell-mode-${width}-${theme}`, '#trade-panel-sell .sell-mode', 16);
  await closeUp(`sell-mode-${width}-${theme}-x4`, '#trade-panel-sell .sell-mode');
  if (width === 1280 && theme === 'light') await shot(`sell-form-${width}-${theme}`, 'section.swap-card', 16);
  if (width === 390 && theme === 'light') await shot(`sell-form-${width}-${theme}`, 'section.swap-card', 16);
}

// ---- the same message where the Stats page shows it ----------------------------------------------
for (const [width, theme] of [
  [1280, 'light'],
  [390, 'light'],
]) {
  await view(width, theme);
  await open('#/stats');
  // The figure's own box (the label, the value and the note beneath it): data-view sits on the value.
  const FIG = '.fig:has([data-view="TownHook.sellFeeInEth"])';
  const fig = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(FIG)}); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);
  say(`== Stats "Sell fee today" at ${width} px, ${theme}: ${JSON.stringify(fig)}`);
  if (!fig) problems.push(`Stats at ${width} px: the "Sell fee today" figure is not on the page`);
  else if (/did not burn more than it paid/.test(fig)) problems.push(`Stats at ${width} px: the old clause is still there`);
  await shot(`stats-sell-fee-${width}-${theme}`, FIG, 16);
  await closeUp(`stats-sell-fee-${width}-${theme}-x4`, FIG);
}

say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
say(`== hosts contacted: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
say(`== what this run found wrong: ${problems.length ? problems.join(' || ') : 'nothing'}`);

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
const bad = violations.length || consoleMsgs.length || sideways.length || problems.length;
console.log(bad ? 'FAILED: see the lines above' : 'OK: no policy violation, no console message, no sideways scrolling, nothing wrong with the message');
process.exit(bad ? 1 : 0);
