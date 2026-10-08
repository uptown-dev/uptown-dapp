// Drives the built site in headless Microsoft Edge over the Chrome DevTools Protocol, for the
// local-chain checks (F8b): a steps module clicks, types and reads the page the way a visitor
// would. Local review only; nothing here runs in the site.
//
// Usage (built site served, e.g. `npx vite preview --port 4191 --strictPort`, local chain running):
//   node scripts/drive.mjs <steps.mjs> [baseUrl] [width]
// The steps module's default export receives `page` (helpers below) and returns nothing.
// Every request the page makes is recorded; at the end the script prints each host it contacted.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const STEPS = process.argv[2];
const BASE = process.argv[3] || 'http://127.0.0.1:4191/';
const WIDTH = Number(process.argv[4] || 1280);
if (!STEPS) {
  console.error('usage: node scripts/drive.mjs <steps.mjs> [baseUrl] [width]');
  process.exit(2);
}
const OUT = resolve('review-shots/drive');
mkdirSync(OUT, { recursive: true });
const profile = resolve(OUT, 'profile');
rmSync(profile, { recursive: true, force: true });
const port = 9361;
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], {
  stdio: 'ignore',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 150 && !ws; i++) {
  try {
    const j = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const p = j.find((t) => t.type === 'page');
    if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
  } catch {}
  if (!ws) await sleep(200);
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const hosts = new Map();
const consoleErrors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === 'Network.requestWillBeSent') {
    const u = new URL(m.params.request.url);
    if (u.protocol.startsWith('http')) hosts.set(u.origin, (hosts.get(u.origin) ?? 0) + 1);
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
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
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: WIDTH < 700 });

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(`page: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
  return r.result.result.value;
};

/** Finds a button (or link) by its visible text, scrolls it into view and clicks it. */
const CLICK = (text, exact) => `(() => {
  const want = ${JSON.stringify(text)};
  const els = [...document.querySelectorAll('button, a, [role=tab], [role=menuitemradio]')].filter((b) => b.offsetParent !== null);
  const el = els.find((b) => ${exact ? 'b.textContent.trim() === want' : 'b.textContent.trim().includes(want)'});
  if (!el) return 'not found: ' + want + ' among ' + els.map((b) => b.textContent.trim()).filter(Boolean).slice(0, 40).join(' | ');
  if (el.disabled) return 'disabled: ' + want;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return 'ok';
})()`;

const page = {
  base: BASE,
  sleep,
  eval: evalJs,
  async goto(hash, query = '') {
    await send('Page.navigate', { url: `${BASE}${query}#/${hash}` });
    await sleep(800);
  },
  async click(text, { exact = false } = {}) {
    const r = await evalJs(CLICK(text, exact));
    if (r !== 'ok') throw new Error(`click "${text}": ${r}`);
    await sleep(150);
  },
  /** Sets an input's value the way typing does (Preact listens to `input`). */
  async type(selector, value) {
    const r = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'no ' + ${JSON.stringify(selector)};
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
    if (r !== 'ok') throw new Error(`type: ${r}`);
    await sleep(150);
  },
  /** Waits until `expr` is truthy in the page; returns its value. */
  async waitFor(expr, timeoutMs = 60_000, what = expr) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const v = await evalJs(`(() => { try { return ${expr}; } catch { return null; } })()`);
      if (v) return v;
      await sleep(250);
    }
    throw new Error(`timed out waiting for ${what}`);
  },
  /** The text of the first element matching `selector`. */
  text: (selector) => evalJs(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? null`),
  /** Waits for the last transaction status in `scope` to settle; returns phase, hash, gas, error and text. */
  async txResult(scope = 'main', timeoutMs = 120_000) {
    const sel = `${scope} .tx-status`;
    await page.waitFor(`[...document.querySelectorAll(${JSON.stringify(sel)})].some(e => e.dataset.phase === 'done' || e.dataset.phase === 'failed')`, timeoutMs, 'a transaction result');
    return evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.dataset.phase === 'done' || e.dataset.phase === 'failed');
      return { phase: e.dataset.phase, hash: e.dataset.hash, gas: e.dataset.gas, error: e.dataset.error, text: e.innerText.replace(/\\s+/g, ' ').trim() }; })()`);
  },
  async shot(name) {
    const h = await evalJs('document.documentElement.scrollHeight');
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: WIDTH, height: Math.min(h, 4000), scale: 1 } });
    writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  },
  consoleErrors,
  hosts,
};

let failed = null;
try {
  const steps = (await import(pathToFileURL(resolve(STEPS)).href)).default;
  await steps(page);
} catch (e) {
  failed = e;
}
console.log(`hosts contacted by the page: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
console.log(`console errors: ${consoleErrors.length ? consoleErrors.join(' || ') : 'none'}`);
ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
await sleep(800);
edge.kill();
const leftovers = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*review-shots*drive*profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
await new Promise((r) => spawn('powershell', ['-NoProfile', '-Command', leftovers], { stdio: 'ignore' }).on('exit', r));
if (failed) {
  console.error(`FAILED: ${failed.message}`);
  process.exit(1);
}
process.exit(0);
