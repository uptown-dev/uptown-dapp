// SUPERSEDED by CR-88 (F9s): use scripts/f9s-heights.mjs, which measures the same six figures and
// then sweeps every width from 320 to 1440 px, because CR-88's third column can change the footer's
// height at widths none of these six would show. This script still runs and still measures the
// footer correctly; it only knows the two places the row could sit before CR-88.
//
// CR-87 (F9r) footer measure: the footer's own height on the build in dist/, at 1280, 390 and 360
// px, in light and dark. Local review only; nothing here runs in the site. It also says whether the
// footer still carries the row of platform marks and the font licence sentence, so the same script
// can measure the footer before the row existed, the footer with the row under the page links, and
// the footer after CR-87 moved the row and dropped the sentence.
//
// Usage, from frontend/ (build dist/ first):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9r-heights.mjs <a label for the run>
//
// It serves dist/ on 127.0.0.1:4276 — never 4173, 5173 or 8545 — and drives headless Edge.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const LABEL = process.argv[2] ?? 'this build';
const DIST = resolve('dist');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4276;
const DEBUG_PORT = 9396;
const PROFILE_NAME = 'uptown-f9r-heights-profile';
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

console.log(`== the footer's height, ${LABEL}`);
for (const theme of ['light', 'dark']) {
  for (const width of [1280, 390, 360]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    await send('Page.navigate', { url: SITE });
    await sleep(900);
    for (let i = 0; i < 200; i++) {
      if (await evalJs("!!document.querySelector('.read-line')?.dataset.block || !!document.querySelector('.footer-note')")) break;
      await sleep(250);
    }
    await sleep(500);
    await evalJs('document.fonts.ready.then(() => 1)');
    const m = await evalJs(
      `(() => {
        const r2 = (n) => Math.round(n * 100) / 100;
        const f = document.querySelector('footer.site-footer');
        const r = f.getBoundingClientRect();
        const row = f.querySelector('.footer-places');
        const h = (sel) => { const e = f.querySelector(sel); return e ? r2(e.getBoundingClientRect().height) : null; };
        return {
          h: r2(r.height),
          rowWhere: row ? (f.querySelector('.footer-contracts .footer-places') ? 'with the contracts' : 'under the page links') : 'no row',
          fonts: !!f.querySelector('.footer-fonts'),
          marks: [...f.querySelectorAll('.place')].map((p) => p.dataset.place).join(',') || 'none',
          parts: { brand: h('.footer-brand'), contracts: h('.footer-contracts'), places: h('.footer-places'), fontsLine: h('.footer-fonts') },
          inside: row
            ? [...row.children].map((c) => {
                const b = c.getBoundingClientRect();
                return c.tagName.toLowerCase() + '.' + String(c.className).split(' ').join('.') + ' ' + r2(b.width) + 'x' + r2(b.height) + ' display ' + getComputedStyle(c).display;
              })
            : null,
        };
      })()`,
    );
    console.log(`   ${String(width).padStart(4)} px ${theme.padEnd(5)}: footer ${String(m.h).padStart(7)} px  (marks ${m.marks}, ${m.rowWhere}; font licence sentence: ${m.fonts}; parts ${JSON.stringify(m.parts)}; inside ${JSON.stringify(m.inside)})`);
  }
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
