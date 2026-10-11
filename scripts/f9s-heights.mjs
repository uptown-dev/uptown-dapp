// CR-88 (F9s) footer measure: the footer's own height on the build in dist/. It prints the six
// figures the task brief asks for (1280, 390 and 360 px, light and dark) and then sweeps every
// width from 320 to 1440 px, because CR-88 adds a third column to the footer and the brief's limit
// is "no taller than it is today **at any width**" — a three-column grid can squeeze the contract
// list into fewer address columns at some middle width and make the footer taller there, which the
// three named widths would never show. The sweep is written to a JSON file as well as printed, so
// the before and after runs can be compared width by width.
//
// Usage, from frontend/ (build dist/ first):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9s-heights.mjs <label> [out.json]
//
// Local review only; nothing here runs in the site. It serves dist/ on 127.0.0.1:4286 — never
// 4173, 5173 or 8545 — and drives headless Edge. It opens pages and measures; it follows no link,
// connects no wallet and sends nothing anywhere.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';

const LABEL = process.argv[2] ?? 'this build';
const OUT_JSON = process.argv[3] ?? null;
const DIST = resolve('dist');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4286;
const DEBUG_PORT = 9386;
const PROFILE_NAME = 'uptown-f9s-heights-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: run npm run build first');

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
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.enable');
await send('Runtime.enable');

const MEASURE = `(() => {
  const r2 = (n) => Math.round(n * 100) / 100;
  const f = document.querySelector('footer.site-footer');
  const r = f.getBoundingClientRect();
  const row = f.querySelector('.footer-places');
  const h = (sel) => { const e = f.querySelector(sel); return e ? r2(e.getBoundingClientRect().height) : null; };
  const cols = (sel) => { const e = f.querySelector(sel); return e ? new Set([...e.children].map((c) => Math.round(c.getBoundingClientRect().left))).size : null; };
  return {
    h: r2(r.height),
    rowWhere: row
      ? f.querySelector('.footer-contracts .footer-places')
        ? 'with the contracts'
        : f.querySelector('.footer-brand .footer-places')
          ? 'in the brand block'
          : 'its own block'
      : 'no row',
    // Which grid column each block occupies, read off the page rather than off the stylesheet.
    columns: (() => {
      const g = f.querySelector('.footer-grid');
      const items = [...g.children].flatMap((c) => (getComputedStyle(c).display === 'contents' ? [...c.children] : [c]));
      return items.map((c) => {
        const b = c.getBoundingClientRect();
        return String(c.className).split(' ')[0] + ' x' + Math.round(b.left) + '-' + Math.round(b.right) + ' y' + Math.round(b.top) + ' h' + r2(b.height);
      });
    })(),
    addressColumns: cols('.footer-contracts > ul'),
    marks: [...f.querySelectorAll('.place')].map((p) => p.dataset.place).join(',') || 'none',
    parts: { brand: h('.footer-brand'), brandMain: h('.footer-brand-main'), contracts: h('.footer-contracts'), places: h('.footer-places'), placeRow: h('.place-row') },
  };
})()`;

async function at(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await send('Page.navigate', { url: SITE });
  await sleep(700);
  for (let i = 0; i < 200; i++) {
    if (await evalJs("!!document.querySelector('.read-line')?.dataset.block || !!document.querySelector('.footer-note')")) break;
    await sleep(200);
  }
  await sleep(300);
  await evalJs('document.fonts.ready.then(() => 1)');
  return await evalJs(MEASURE);
}

console.log(`== the footer's height, ${LABEL}`);
const named = {};
for (const theme of ['light', 'dark']) {
  for (const width of [1280, 390, 360]) {
    const m = await at(width, theme);
    named[`${width}-${theme}`] = m.h;
    console.log(
      `   ${String(width).padStart(4)} px ${theme.padEnd(5)}: footer ${String(m.h).padStart(7)} px  (marks ${m.marks}, ${m.rowWhere}; address columns ${m.addressColumns}; parts ${JSON.stringify(m.parts)}; blocks ${JSON.stringify(m.columns)})`,
    );
  }
}

// The sweep: every width the footer can be asked to lay out, light theme (the two themes measured
// identically at every width in every run so far, and the themes change no size).
console.log(`== the sweep, ${LABEL} (light)`);
const sweep = {};
for (let w = 320; w <= 1440; w += 20) {
  const m = await at(w, 'light');
  sweep[w] = { h: m.h, cols: m.addressColumns, where: m.rowWhere };
  console.log(`   ${String(w).padStart(4)} px: footer ${String(m.h).padStart(7)} px  (${m.addressColumns} address column(s), row ${m.rowWhere})`);
}
if (OUT_JSON) {
  mkdirSync(dirname(resolve(OUT_JSON)), { recursive: true });
  writeFileSync(resolve(OUT_JSON), JSON.stringify({ label: LABEL, named, sweep }, null, 2));
  console.log(`== written to ${OUT_JSON}`);
}

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
process.exit(0);
