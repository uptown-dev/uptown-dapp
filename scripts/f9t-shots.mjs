// CR-92 part 1 (F9t) review driver: photographs and reads back the Docs page's new item for whoever
// routes TOWN buys for other people, on the build in dist/, at 1280 and 390 px in both themes.
//
// It checks, on the built site: that the item is in "Things to know", right after "Buy on this site"
// and last; its text; that its two long hex strings sit inside the card at each width; and that no
// page scrolls sideways. It reports every policy violation and console message it sees.
//
// Usage, from frontend/ (build dist/ first for the chain you want to look at):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9t-shots.mjs 31337
//
// It serves the built site with the hosting headers of vercel.json on 127.0.0.1:4294 — never 4173,
// 5173 or 8545 — and drives headless Edge. It opens pages only: it follows no link, connects no
// wallet and sends nothing anywhere. Local review only; nothing here runs in the site. Pictures and
// the log go to the git-ignored review-shots/f9t/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const CHAIN = process.argv[2] ?? '31337';
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f9t/chain-${CHAIN}`);
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4294;
const DEBUG_PORT = 9394;
const PROFILE_NAME = 'uptown-f9t-shots-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no dist/index.html: run VITE_CHAIN_ID=${CHAIN} npm run build first`);

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
/** The item as the built page shows it: its place, its text, and whether each code word stays inside the card. */
const ITEM = `(() => {
  const know = document.querySelector('#docs-know');
  if (!know) return null;
  const items = [...know.querySelectorAll(':scope ul.doc-list > li')];
  const item = know.querySelector('li[data-item="routing"]');
  if (!item) return { found: false, count: items.length };
  const card = know.getBoundingClientRect();
  const codes = [...item.querySelectorAll('code')].map((c) => { const r = c.getBoundingClientRect(); return { text: c.textContent, inside: r.left >= card.left - 0.5 && r.right <= card.right + 0.5 }; });
  const at = items.indexOf(item);
  return { found: true, place: at + 1, count: items.length, before: items[at - 1]?.textContent.slice(0, 17), text: item.textContent, height: Math.round(item.getBoundingClientRect().height), codes };
})()`;

const sideways = [];
const problems = [];
let firstText = null;

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
async function open(hash) {
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await sleep(900);
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('#docs-know li[data-item=\"routing\"]')")) break;
    await sleep(250);
  }
  await sleep(600);
  await evalJs('document.fonts.ready.then(() => 1)');
}
async function shot(name, sel, pad = 12) {
  // The page is scrolled to its top before the picture, so the sticky header stays at the top of the
  // page and is not painted over a part taller than the screen (the section at 390 px).
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; window.scrollTo(0, 0); const r = e.getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; })()`);
  if (!box) {
    problems.push(`${name}: nothing on the page matches ${sel}`);
    return;
  }
  const vw = await evalJs('document.documentElement.clientWidth');
  const clip = { x: 0, y: Math.max(0, Math.round(box.y - pad)), width: vw, height: Math.round(box.h + 2 * pad), scale: 1 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png  ${clip.width} x ${clip.height}`);
}

try {
  for (const width of [1280, 390]) {
    for (const theme of ['light', 'dark']) {
      await view(width, theme);
      await open('#/docs/know');
      const label = `${width}-${theme}`;
      const it = await evalJs(ITEM);
      const bg = await evalJs("getComputedStyle(document.body).backgroundColor");
      if (!it?.found) {
        problems.push(`${label}: the item is not on the page (${JSON.stringify(it)})`);
        continue;
      }
      say(`${label}: the item is ${it.place} of ${it.count}, after "${it.before}…", ${it.height} px tall; page background ${bg}`);
      if (it.place !== it.count || it.before !== 'Buy on this site.') problems.push(`${label}: the item is not right after "Buy on this site" and last`);
      const outside = it.codes.filter((c) => !c.inside).map((c) => c.text);
      say(`   code words: ${it.codes.length}, all inside the card: ${outside.length === 0}${outside.length ? ` (outside: ${outside.join(', ')})` : ''}`);
      if (outside.length) problems.push(`${label}: code words outside the card: ${outside.join(', ')}`);
      if (firstText === null) {
        firstText = it.text;
        say(`   the text: ${it.text}`);
      } else if (it.text !== firstText) problems.push(`${label}: the text differs from the first view`);
      const o = await evalJs(OVERFLOW);
      if (o.scrollW > o.vw || o.out.length) sideways.push({ label, ...o });
      await shot(`docs-know-${label}`, '#docs-know');
      await shot(`docs-routing-item-${label}`, '#docs-know li[data-item="routing"]', 8);
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
console.log(bad ? 'FAILED: see the lines above' : 'OK: the item is in place in all four views, no policy violation, no console message, no sideways scrolling');
process.exit(bad ? 1 : 0);
