// CR-76 (F9l) review driver: photographs the network tag in the header, on the build that is in
// dist/, and measures it. Local review only; nothing here runs in the site. Pictures and the log go
// to the git-ignored review-shots/f9l/.
//
// Usage, from frontend/ (build dist/ first for the chain you want to look at):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9l-shots.mjs 31337
//   VITE_CHAIN_ID=1     npm run build && node scripts/f9l-shots.mjs 1
//   VITE_CHAIN_ID=11155111 npm run build && node scripts/f9l-shots.mjs 11155111
//
// It serves the built site with the hosting headers of vercel.json on 127.0.0.1:4270 — never 4173,
// 5173 or 8545 — drives headless Edge, and reports every policy violation, console message and
// sideways scroll it sees. On the local-chain build the policy's connect-src is pointed at the local
// node, as the real local build is served; the mainnet and Sepolia builds keep the policy
// vercel.json writes for them and (having no contracts yet) contact nothing at all.
//
// It never sends a transaction: it opens pages, presses the theme switch and the menu button, and on
// the local chain picks a test wallet from the wallet menu (an address the local node signs for; no
// key, no transaction).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const CHAIN = process.argv[2] ?? '31337';
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f9l/chain-${CHAIN}`);
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4270;
const DEBUG_PORT = 9390;
const PROFILE_NAME = 'uptown-f9l-shots-profile';
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

/** What the page is actually drawing: the tag, where it sits, and whether anything in the row is clipped or wraps. */
const TAG = `(() => {
  const round = (n) => Math.round(n * 100) / 100;
  const tag = document.querySelector('.net-tag');
  if (!tag) return { missing: true, strip: !!document.querySelector('.chain-bar') };
  const row = document.querySelector('.header-row').getBoundingClientRect();
  const btn = document.querySelector('.wallet-btn').getBoundingClientRect();
  const t = tag.getBoundingClientRect();
  const cs = getComputedStyle(tag);
  const shown = [...tag.children].filter((c) => getComputedStyle(c).display !== 'none' && !c.classList.contains('visually-hidden')).map((c) => c.textContent);
  const hidden = tag.querySelector('.visually-hidden');
  // Nothing in the header row may be on more than one line: an inline run that wrapped would have
  // one client rectangle per line, so more than one rectangle means wrapped text.
  const wrapped = [...document.querySelectorAll('.header-row a.wordmark span, .header-row .net-tag span, .header-row .day-chip, .header-row .site-nav a')]
    .filter((el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 1)
    .map((el) => (el.className || el.tagName) + ' on ' + el.getClientRects().length + ' lines');
  return {
    strip: !!document.querySelector('.chain-bar'),
    chainAttr: tag.dataset.chain,
    role: tag.getAttribute('role'),
    visible: shown.join('|'),
    screenReader: hidden ? hidden.textContent.replace(/\\s+/g, ' ').trim() : null,
    title: tag.getAttribute('title'),
    marked: tag.classList.contains('net-test'),
    colour: cs.color,
    background: cs.backgroundColor,
    border: cs.borderTopWidth + ' ' + cs.borderTopColor,
    box: round(t.width) + ' x ' + round(t.height),
    where: cs.position === 'absolute' ? 'above the wallet button' : 'beside the wallet button',
    rowHeight: round(row.height),
    insideRow: t.top >= row.top - 0.5 && t.bottom <= row.bottom + 0.5,
    rightEdges: round(t.right) + ' / ' + round(btn.right),
    gapToButton: cs.position === 'absolute' ? round(btn.top - t.bottom) : round(t.left - btn.left < 0 ? btn.left - t.right : 0),
    overlapsButton: !(t.right <= btn.left + 0.5 || t.bottom <= btn.top + 0.5),
    wrapped,
    clickDoesNothing: tag.tagName.toLowerCase() === 'span' && !tag.getAttribute('href') && !tag.onclick,
    cursor: cs.cursor,
  };
})()`;

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
async function open() {
  await send('Page.navigate', { url: SITE });
  await sleep(900);
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('.net-tag')")) break;
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
/** The tag drawn four times larger, to read its text and see its mark. */
async function closeUp(name, sel) {
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  const clip = { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: box.w + 20, height: box.h + 20, scale: 4 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png  (${Math.round(clip.width)} x ${Math.round(clip.height)} css pixels, drawn four times larger)`);
}
/** The tag's own report, checked as it is read. */
async function report(label) {
  const t = await evalJs(TAG);
  say(`   ${label}: ${JSON.stringify(t)}`);
  if (t.missing) problems.push(`${label}: no tag on the page`);
  if (t.strip) problems.push(`${label}: the chain-bar strip is still rendered`);
  if (t.wrapped?.length) problems.push(`${label}: text in the header row wrapped: ${t.wrapped.join(', ')}`);
  if (!t.insideRow) problems.push(`${label}: the tag is outside the header row`);
  if (t.overlapsButton) problems.push(`${label}: the tag overlaps the wallet button`);
  return t;
}

// ---- the wide view, both themes ------------------------------------------------------------------
for (const theme of ['light', 'dark']) {
  await view(1280, theme);
  await open();
  say(`== 1280 px, ${theme}`);
  await report('tag');
  await shot(`header-1280-${theme}`, 'header.site-header');
  await closeUp(`tag-1280-${theme}-x4`, '.net-tag');
}

// ---- 768 px: the middle width the brief asks for -------------------------------------------------
for (const theme of ['light']) {
  await view(768, theme);
  await open();
  say(`== 768 px, ${theme}`);
  await report('tag');
  await shot(`header-768-${theme}`, 'header.site-header');
  await closeUp(`tag-768-${theme}-x4`, '.net-tag');
}

// ---- 560 px: the band where the tag shows its short name -----------------------------------------
await view(560, 'light');
await open();
say('== 560 px, light (the short-name band)');
await report('tag');
await shot('header-560-light', 'header.site-header');
await closeUp('tag-560-light-x4', '.net-tag');

// ---- the phone, menu closed and open -------------------------------------------------------------
for (const theme of ['light', 'dark']) {
  await view(390, theme);
  await open();
  say(`== 390 px, ${theme}`);
  await report('tag');
  await shot(`header-390-${theme}-menu-closed`, 'header.site-header');
  await closeUp(`tag-390-${theme}-x4`, '.net-tag');
  await evalJs("document.querySelector('header .nav-toggle').click(), 1");
  await sleep(350);
  say(`   menu open: ${await evalJs("document.querySelector('header .nav-toggle').getAttribute('aria-expanded')")}`);
  await report('tag, menu open');
  await shot(`header-390-${theme}-menu-open`, 'header.site-header', 4);
  await shot(`header-390-${theme}-menu-open-full`, '.site-nav.open', 70);
  await evalJs("document.querySelector('header .nav-toggle').click(), 1");
  await sleep(250);
}

// ---- a wallet connected (the local chain only: the other builds have no wallet here) -------------
if (CHAIN === '31337') {
  for (const width of [1280, 390]) {
    await view(width, 'light');
    await open();
    await evalJs("document.querySelector('.wallet-btn').click(), 1");
    await sleep(350);
    await evalJs("document.querySelector('.wallet-option[data-address]').click(), 1");
    await sleep(1600);
    const who = await evalJs("document.querySelector('.wallet-btn').textContent.trim()");
    say(`== ${width} px, light, a test wallet picked from the wallet menu: the button now reads "${who}"`);
    await report('tag');
    await shot(`header-${width}-light-wallet-connected`, 'header.site-header');
    await closeUp(`tag-${width}-light-wallet-connected-x4`, '.net-tag');
    await evalJs("localStorage.removeItem('uptown-local-wallet'), 1");
  }
}

// ---- 360 px: the row was already wider than the screen before this task, and the tag adds nothing -
// The tag is out of the row's flow below 480 px, so taking it off the page must leave the scroll
// width exactly where it was. (360 px is narrower than any width the brief asks for.)
await view(360, 'light');
await open();
const with360 = await evalJs(OVERFLOW);
await evalJs("document.querySelector('.net-tag').remove(), 1");
await sleep(250);
const without360 = await evalJs(OVERFLOW);
say(`== 360 px (outside the brief's widths): scroll width with the tag ${with360.scrollW}/${with360.vw}, with the tag taken off the page ${without360.scrollW}/${without360.vw}`);
if (with360.scrollW !== without360.scrollW) problems.push(`360 px: the tag changes the scroll width (${with360.scrollW} vs ${without360.scrollW})`);

say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
say(`== hosts contacted: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
say(`== what the tag's own report found wrong: ${problems.length ? problems.join(' || ') : 'nothing'}`);

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
console.log(bad ? 'FAILED: see the lines above' : 'OK: no policy violation, no console message, no sideways scrolling, nothing wrong with the tag');
process.exit(bad ? 1 : 0);
