// Runs the component tests (test/components.test.tsx) in headless Microsoft Edge (F8f). It serves
// the source with Vite's dev server on 127.0.0.1 (port 4197 by default, never the Lead's 4173),
// opens test/index.html, waits for the results, prints them and exits 1 on any failure. The tests
// read the local chain (http://127.0.0.1:8545, started with script/local-chain.sh) and send nothing.
//
// Usage: npm test            (or: node scripts/test.mjs [port] [gallery])
// `gallery` also photographs every rendering, styled, at 1280 and 390 px in both themes, into the
// git-ignored review-shots/components/.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.argv[2] || 4197);
const GALLERY = process.argv.includes('gallery');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The tests read the local chain's contracts and test wallets. Once Sepolia's address file is
// filled (CR-63), a build that names no chain would show Sepolia (the network module's order:
// mainnet, Sepolia, local), so the tests name the local chain themselves (F9a).
process.env.VITE_CHAIN_ID = '31337';

const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  logLevel: 'warn',
  server: { host: '127.0.0.1', port: PORT, strictPort: true, hmr: false },
});
await server.listen();

// The browser profile lives outside the project, so the dev server's file watcher never sees it.
const profile = resolve(tmpdir(), 'uptown-component-tests-profile');
mkdirSync(profile, { recursive: true });
rmSync(profile, { recursive: true, force: true });
const debugPort = 9371;
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${debugPort}`, '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], {
  stdio: 'ignore',
});

let code = 1;
try {
  let ws;
  for (let i = 0; i < 150 && !ws; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const p = j.find((t) => t.type === 'page');
      if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
    } catch {}
    if (!ws) await sleep(200);
  }
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const hosts = new Map();
  const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method === 'Network.requestWillBeSent') {
      const u = new URL(m.params.request.url);
      if (u.protocol.startsWith('http')) hosts.set(u.origin, (hosts.get(u.origin) ?? 0) + 1);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/test/index.html` });
  let out = null;
  for (let i = 0; i < 240 && !out; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: 'window.__results ? JSON.stringify(window.__results) : null', returnByValue: true });
    out = r.result?.result?.value ? JSON.parse(r.result.result.value) : null;
  }
  if (!out) {
    console.error('the tests did not finish within 2 minutes');
    if (errors.length) console.error(errors.join('\n'));
  } else {
    for (const t of out.results) console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.detail ? `\n      ${t.detail}` : ''}`);
    console.log(`\n${out.passed} passed, ${out.failed} failed`);
    code = out.failed === 0 ? 0 : 1;
  }
  if (GALLERY) {
    const dir = resolve(ROOT, 'review-shots/components');
    mkdirSync(dir, { recursive: true });
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
    ]) {
      for (const theme of ['light', 'dark']) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/test/index.html?gallery` });
        await sleep(1000);
        for (let i = 0; i < 240; i++) {
          const r = await send('Runtime.evaluate', { expression: '!!window.__results', returnByValue: true });
          if (r.result?.result?.value) break;
          await sleep(500);
        }
        await sleep(800);
        const size = (await send('Runtime.evaluate', { expression: 'JSON.stringify([document.documentElement.scrollHeight, document.documentElement.scrollWidth])', returnByValue: true })).result.result.value;
        const [h, sw] = JSON.parse(size);
        console.log(`gallery ${width} ${theme}: height ${h}, scroll width ${sw}${sw > width ? ' SIDEWAYS SCROLL' : ''}`);
        const slice = width < 700 ? 1400 : 1000;
        for (let y = 0, n = 1; y < h; y += slice, n++) {
          const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width, height: Math.min(slice, h - y), scale: 1 } });
          writeFileSync(resolve(dir, `${width}-${theme}-${String(n).padStart(2, '0')}.png`), Buffer.from(r.result.data, 'base64'));
        }
      }
    }
  }
  console.log(`hosts contacted by the test page: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
  if (errors.length) console.log(`page errors: ${errors.join(' || ')}`);
  ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
  await sleep(800);
} finally {
  edge.kill();
  await server.close();
}
process.exit(code);
