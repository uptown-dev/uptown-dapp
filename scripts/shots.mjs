// Review screenshots with headless Microsoft Edge over the Chrome DevTools Protocol.
// For each wallet and route it saves page slices and checks for sideways scrolling.
// Local review only: the pictures go to the git-ignored frontend/review-shots/.
//
// Usage (with the built site served, e.g. `npx vite preview --port 4191 --strictPort`):
//   node scripts/shots.mjs <outDir> <desktop|mobile> <light|dark> [routes] [wallets] [baseUrl]
//   routes:    comma list, '' for home (default: ,trade,trade/sell,rewards,stake,stats,docs)
//   wallets:   comma list of local test wallet addresses to connect, 'none' for no wallet (default: none)
//   baseUrl:   default http://127.0.0.1:4191/
//   'open' as an eighth argument opens every "Details" expander before the pictures are taken.
// The figures come from the chain the build reads (the local chain: start it first); each page is
// photographed once its figures have been read.
// The theme is applied the way a first visit sees it: through the emulated system setting
// (prefers-color-scheme), with a fresh browser profile and no remembered choice.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = process.argv[2] || 'review-shots';
const MODE = process.argv[3] || 'desktop';
const THEME = process.argv[4] || 'light';
const PAGES = (process.argv[5] ?? ',trade,trade/sell,rewards,stake,stats,docs').split(',');
const WALLETS = (process.argv[6] || 'none').split(',');
const BASE = process.argv[7] || 'http://127.0.0.1:4191/';
const OPEN = process.argv[8] === 'open';
const W = MODE === 'mobile' ? 390 : 1280;
const H = MODE === 'mobile' ? 844 : 800;
const SLICE = MODE === 'mobile' ? 1400 : 1000;
mkdirSync(OUT, { recursive: true });

const port = 9351 + (MODE === 'mobile' ? 1 : 0) + (THEME === 'dark' ? 2 : 0);
const profile = resolve(`${OUT}/profile-${MODE}-${THEME}`);
for (let i = 0; i < 20; i++) {
  try {
    rmSync(profile, { recursive: true, force: true });
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500)); // a previous run's Edge may still be closing
  }
}
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], {
  stdio: 'ignore',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let id = 0;
const pending = new Map();
for (let i = 0; i < 150; i++) {
  try {
    const j = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const p = j.find((t) => t.type === 'page');
    if (p) {
      ws = new WebSocket(p.webSocketDebuggerUrl);
      break;
    }
  } catch {}
  await sleep(200);
}
await new Promise((r) => ws.addEventListener('open', r));
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
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: MODE === 'mobile' });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: THEME }] });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;

const OVERFLOW = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 0.5) {
      let p = el.parentElement, clipped = false;
      while (p) { const s = getComputedStyle(p); if (s.overflowX === 'auto' || s.overflowX === 'hidden' || s.overflowX === 'scroll') { if (p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } } p = p.parentElement; }
      if (!clipped) out.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '') + ' ' + Math.round(r.right));
    }
  }
  return { scrollW: document.documentElement.scrollWidth, vw, theme: getComputedStyle(document.documentElement).colorScheme, out: out.slice(0, 8) };
})()`;

const problems = [];
for (const wallet of WALLETS) {
  // The local test wallet is remembered in the page's storage (key uptown-local-wallet).
  await send('Page.navigate', { url: BASE });
  await sleep(500);
  await evalJs(wallet === 'none' ? "localStorage.removeItem('uptown-local-wallet'), 1" : `localStorage.setItem('uptown-local-wallet', '${wallet}'), 1`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(800);
  const scen = wallet === 'none' ? 'nowallet' : `w${wallet.slice(2, 6).toLowerCase()}`;
  for (const p of PAGES) {
    await send('Page.navigate', { url: `${BASE}#/${p}` });
    await sleep(900);
    for (let i = 0; i < 60; i++) {
      if (await evalJs("!!document.querySelector('.read-line')?.dataset.block")) break;
      await sleep(250);
    }
    await sleep(1200);
    await evalJs('document.fonts.ready.then(()=>1)');
    if (OPEN) await evalJs("document.querySelectorAll('details').forEach((d) => (d.open = true)), 1");
    await sleep(150);
    const check = await evalJs(OVERFLOW);
    if (check.scrollW > check.vw || check.out.length) problems.push({ scen, page: p || 'home', ...check });
    const total = await evalJs('document.documentElement.scrollHeight');
    const name = (p || 'home').replace(/\//g, '-');
    let n = 0;
    for (let y = 0; y < total; y += SLICE) {
      const h = Math.min(SLICE, total - y);
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width: W, height: h, scale: 1 } });
      writeFileSync(`${OUT}/${MODE}-${THEME}-${scen}-${name}${OPEN ? '-details' : ''}-${String(n++).padStart(2, '0')}.png`, Buffer.from(r.result.data, 'base64'));
    }
    console.log(`${MODE} ${THEME} ${scen} ${name}: height ${total}, ${n} slice(s), scrollWidth ${check.scrollW}/${check.vw}, colour scheme ${check.theme}`);
  }
}
console.log(problems.length ? `SIDEWAYS SCROLL OR OVERFLOW: ${JSON.stringify(problems)}` : 'No sideways scrolling and no element past the right edge.');
// Close every Edge process using this run's profile. Edge relaunches itself on start, so the
// process spawned above is not the one that keeps running; match on the profile path instead.
ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
await sleep(800);
edge.kill();
const leftovers = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${basename(profile)}*' -and $_.CommandLine -like '*review-shots*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
await new Promise((r) => spawn('powershell', ['-NoProfile', '-Command', leftovers], { stdio: 'ignore' }).on('exit', r));
for (let i = 0; i < 10; i++) {
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
    break;
  } catch {
    /* Edge still closing: try again */
  }
}
process.exit(0);
