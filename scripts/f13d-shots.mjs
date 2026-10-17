// F13d (CR-105) review driver: the token symbol written $SKYLINE on the built site, photographed.
//
//   node scripts/f13d-shots.mjs local     after VITE_CHAIN_ID=31337 npm run build, with the local chain running
//   node scripts/f13d-shots.mjs mainnet   after VITE_CHAIN_ID=1 npm run build (reads Ethereum, sends nothing)
//
// local (launched): Home, Trade, Rewards, Stake, Stats, Docs and Owner (the owner's test wallet for
// Owner, Test wallet 1 elsewhere), photographed at 1280 px light and 390 px dark.
// mainnet (deployed, not launched): every page read; Home and Trade photographed at 1280 px light
// and 390 px dark. Read-only: no wallet exists in the headless browser, and every JSON-RPC method
// the page asks of the network service is recorded and must be a plain read.
//
// On every page, at every size, it reads what a visitor or a screen reader can read: the text of
// every element (with every <details> opened, and again after pressing each tab on the page, so
// Trade's Sell form and Stake's Unstake and Claim forms are read too), the attributes read aloud or
// shown on hover (aria-label, aria-description, title, placeholder, alt), the page's title and its
// description. Each "SKYLINE" not preceded by "$" is reported, with its context, and so is a doubled
// "$$SKYLINE". It also reports what wraps: a button, token badge, unit, input suffix, navigation
// link or table cell holding "$SKYLINE" whose text runs over more than one line, and anything that
// sticks out of the page sideways. Page texts are saved beside the photographs.
//
// It serves dist/ with the hosting headers of vercel.json on 127.0.0.1:4351 (never 4173, 5173 or
// 8545) and drives headless Edge (debugging port 9451). Pictures, texts and the log go to the
// git-ignored review-shots/f13d/<mode>/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const MODE = process.argv[2];
if (MODE !== 'local' && MODE !== 'mainnet') throw new Error('usage: node scripts/f13d-shots.mjs local|mainnet');
const LOCAL = MODE === 'local';
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f13d/${MODE}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = LOCAL ? 'http://127.0.0.1:8545' : 'https://ethereum-rpc.publicnode.com';
const PORT = 4351;
const DEBUG_PORT = 9451;
const PROFILE_NAME = 'uptown-f13d-shots-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no dist/index.html: run VITE_CHAIN_ID=${LOCAL ? 31337 : 1} npm run build first`);
const builtFor = readFileSync(join(DIST, 'index.html'), 'utf8').match(/connect-src ([^;"]+)/)?.[1].trim();
if (builtFor !== RPC) throw new Error(`dist/ is built for ${builtFor}, not ${RPC}: build for ${LOCAL ? '31337' : '1'} first`);
let WALLET = null;
let OWNER = null;
if (LOCAL) {
  const addressFile = JSON.parse(readFileSync(resolve('src/addresses/31337.json'), 'utf8'));
  WALLET = addressFile.testWallets?.[0];
  OWNER = addressFile.owner;
  if (!WALLET || !OWNER || addressFile.tokenSymbol !== 'SKYLINE') throw new Error('src/addresses/31337.json is not a SKYLINE local chain: start the local chain and build for 31337 first');
} else if (JSON.parse(readFileSync(resolve('src/addresses/1.json'), 'utf8')).tokenSymbol !== 'SKYLINE') {
  throw new Error("src/addresses/1.json is not SKYLINE's record");
}

// ---- the static server, with the hosting headers -------------------------------------------------
const vercel = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const base = vercel.headers.find((h) => h.source === '/(.*)').headers;
const server = await new Promise((r) => {
  const s = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(DIST, path === '/' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    // The local build talks to the local chain: the policy's connect-src names it, as the build does.
    for (const h of base) res.setHeader(h.key, h.key === 'Content-Security-Policy' && LOCAL ? h.value.replace(/connect-src [^;]+/, `connect-src ${RPC}`) : h.value);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  s.listen(PORT, '127.0.0.1', () => r(s));
});
const SITE = `http://127.0.0.1:${PORT}/`;
say(`serving dist/ (${LOCAL ? 'chain 31337, launched' : 'chain 1, deployed, not launched'}) with the vercel.json headers on ${SITE}; reading through ${RPC}`);

// ---- the browser ---------------------------------------------------------------------------------
const profile = resolve(tmpdir(), PROFILE_NAME);
rmSync(profile, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
say(`headless Edge started, process ${edge.pid}`);
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
const hosts = new Map();
const rpcMethods = new Map();
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
  } else if (m.method === 'Network.requestWillBeSent') {
    const u = new URL(m.params.request.url);
    if (u.protocol.startsWith('http')) hosts.set(u.origin, (hosts.get(u.origin) ?? 0) + 1);
    // Every JSON-RPC method the page asks the network service for (the proof that it only reads).
    if (u.origin === RPC && m.params.request.postData) {
      try {
        const body = JSON.parse(m.params.request.postData);
        for (const c of Array.isArray(body) ? body : [body]) rpcMethods.set(c.method, (rpcMethods.get(c.method) ?? 0) + 1);
      } catch {
        rpcMethods.set('(unreadable body)', (rpcMethods.get('(unreadable body)') ?? 0) + 1);
      }
    }
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
await send('Network.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });

const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 0.5) { let p = el.parentElement, clipped = false; while (p) { const s = getComputedStyle(p); if (['auto','hidden','scroll'].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').join('.') + ' ' + Math.round(r.right)); } } return { scrollW: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) }; })()`;

/**
 * Everything a visitor or a screen reader can read on the page as it is now: the text of the body
 * (scripts and styles left out, every <details> opened), the labels read aloud or shown on hover,
 * the title and the description; each as one piece, with where it came from.
 */
const READ = `(() => {
  const all = document.body.cloneNode(true);
  all.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
  all.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
  const out = [['text', all.textContent]];
  for (const n of document.body.querySelectorAll('*')) for (const a of ['aria-label', 'aria-description', 'title', 'placeholder', 'alt']) { const v = n.getAttribute(a); if (v) out.push(['[' + a + '] <' + n.tagName.toLowerCase() + '>', v]); }
  for (const n of document.body.querySelectorAll('svg title, svg desc')) out.push(['<svg ' + n.tagName + '>', n.textContent]);
  out.push(['<title>', document.title]);
  out.push(['<meta description>', document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '']);
  return out;
})()`;

/** Short controls and cells holding "$SKYLINE" whose text runs over more than one line (each line's top). */
const WRAPS = `(() => {
  const out = [];
  const sel = 'button, a.btn, .token-pill, .unit, .suffix, nav a, th, td, dt, .tab, [role="tab"], .fig-value, .uses, .price-line > span:first-child, svg text';
  for (const el of document.querySelectorAll(sel)) {
    if (!el.textContent.includes('$SKYLINE') || el.getClientRects().length === 0) continue;
    // The boxes of its words, one per line fragment; two boxes are on one line when they overlap
    // vertically (a large figure and its small unit sit on one line with different tops).
    const boxes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || n.parentElement.closest('.usd')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      boxes.push(...[...range.getClientRects()].filter((r) => r.width > 0));
    }
    const lines = [];
    for (const r of boxes.sort((a, b) => a.top - b.top)) {
      const line = lines.find((l) => r.top < l.bottom - 1 && r.bottom > l.top + 1);
      if (line) { line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom); } else lines.push({ top: r.top, bottom: r.bottom });
    }
    const tops = { size: lines.length };
    const wide = el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible';
    if (tops.size > 1 || wide) out.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '') + ' "' + el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60) + '" ' + (tops.size > 1 ? tops.size + ' lines' : 'clipped'));
  }
  return out;
})()`;

/** The hero diagram's labels (CR-105 makes "$SKYLINE" a character longer): each text's box against the drawing's own box. */
const DIAGRAM = `(() => {
  const svg = document.querySelector('svg.flow-graphic');
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  // Each label against its own box: the <rect> beside it in its group (a node), the hook's box for the
  // hook's line, and the drawing itself for the legend.
  const texts = [...svg.querySelectorAll('text')].filter((t) => t.textContent.includes('$SKYLINE') || (t.parentElement.tagName.toLowerCase() === 'g' && t.parentElement.textContent.includes('$SKYLINE'))).map((t) => {
    const own = t.parentElement.tagName.toLowerCase() === 'g' ? t.parentElement.querySelector(':scope > rect') : t.classList.contains('fg-sub') && t.getAttribute('text-anchor') === 'middle' ? svg.querySelector('rect.fg-hook') : null;
    const b = (own ?? svg).getBoundingClientRect();
    const r = t.getBoundingClientRect();
    return { text: t.textContent, box: own ? own.getAttribute('class') : 'svg', inside: r.left >= b.left - 0.5 && r.right <= b.right + 0.5, w: Math.round(r.width), room: Math.round(b.width) };
  });
  return { width: Math.round(box.width), texts };
})()`;

const sideways = [];
const problems = [];
const bare = [];
const wraps = [];
const expect = (ok, what) => {
  if (!ok) problems.push(what);
};
let dollarCount = 0;
let piecesRead = 0;

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
async function pickWallet(address) {
  await send('Page.navigate', { url: SITE });
  await sleep(500);
  await evalJs(`localStorage.setItem('uptown-local-wallet', '${address}'), 1`);
}
async function open(hash) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await sleep(1200);
  for (let i = 0; i < 160; i++) {
    const ready = LOCAL
      ? await evalJs("!!document.querySelector('.read-line')?.dataset.block")
      : await evalJs("!/Reading the (figures|contracts)/.test(document.querySelector('main')?.innerText ?? 'Reading the figures')");
    if (ready) break;
    await sleep(250);
  }
  await sleep(LOCAL ? 1500 : 2500);
  await evalJs('document.fonts.ready.then(() => 1)');
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
/** Reads the page now, and again after each tab is pressed; reports every bare SKYLINE. */
async function readPage(where, fileName) {
  const seen = [];
  const take = async (state) => {
    const pieces = await evalJs(READ);
    for (const [from, s] of pieces) {
      piecesRead++;
      dollarCount += (s.match(/\$SKYLINE/g) ?? []).length;
      for (const m of s.matchAll(/(?<!\$)SKYLINE/g)) bare.push(`${where}${state}, ${from}: "…${s.slice(Math.max(0, m.index - 50), m.index + 25).replace(/\s+/g, ' ')}…"`);
      if (s.includes('$$SKYLINE')) bare.push(`${where}${state}, ${from}: doubled "$$SKYLINE"`);
    }
    seen.push(`==== ${where}${state} ====\n` + pieces.map(([f, s]) => `${f}: ${s.replace(/\s+/g, ' ').trim()}`).join('\n'));
  };
  await take('');
  const tabs = await evalJs(`[...document.querySelectorAll('main [role="tab"]')].map((t) => t.id || t.textContent.trim())`);
  for (const t of tabs) {
    await evalJs(`(() => { const el = [...document.querySelectorAll('main [role="tab"]')].find((x) => (x.id || x.textContent.trim()) === ${JSON.stringify(t)}); el?.click(); return 1; })()`);
    await sleep(300);
    await take(`, tab ${t}`);
    wraps.push(...(await evalJs(WRAPS)).map((w) => `${where}, tab ${t}: ${w}`));
  }
  // Back to the first tab, as the visitor first sees the page, for the photographs.
  if (tabs.length) {
    await evalJs(`(() => { document.querySelector('main [role="tab"]')?.click(); return 1; })()`);
    await sleep(LOCAL ? 2500 : 1500); // the form asks for a fresh quote: let it land before the photograph
  }
  writeFileSync(join(OUT, `${fileName}.txt`), seen.join('\n\n') + '\n');
  return tabs;
}

const PAGES = LOCAL
  ? [
      ['home', '#/', WALLET, true],
      ['trade', '#/trade', WALLET, true],
      ['rewards', '#/rewards', WALLET, true],
      ['stake', '#/stake', WALLET, true],
      ['stats', '#/stats', WALLET, true],
      ['docs', '#/docs', WALLET, true],
      ['owner', '#/owner', OWNER, true],
    ]
  : [
      ['home', '#/', null, true],
      ['trade', '#/trade', null, true],
      ['rewards', '#/rewards', null, false],
      ['stake', '#/stake', null, false],
      ['stats', '#/stats', null, false],
      ['docs', '#/docs', null, false],
      ['owner', '#/owner', null, false],
    ];

try {
  for (const [width, theme] of [
    [1280, 'light'],
    [390, 'dark'],
  ]) {
    await view(width, theme);
    const label = `${width}-${theme}`;
    for (const [name, hash, who, photo] of PAGES) {
      if (LOCAL) await pickWallet(who);
      await open(hash);
      const where = `${label} ${name}`;
      const head = await evalJs("document.querySelector('main h1')?.innerText.trim() ?? null");
      const state = await evalJs("(() => { const t = document.querySelector('main')?.innerText ?? ''; return { readError: /Could not read|The last read failed|reading [A-Za-z]+\\.[A-Za-z]+ failed/.test(t), pending: /Reading the (figures|contracts)/.test(t), notOpen: /not open yet/i.test(t) }; })()");
      const before = bare.length;
      const tabs = await readPage(where, `${name}-${label}`);
      wraps.push(...(await evalJs(WRAPS)).map((w) => `${where}: ${w}`));
      const diagram = name === 'home' ? await evalJs(DIAGRAM) : null;
      say(
        `${where}: "${head}"; title "${await evalJs('document.title')}"; tabs read ${tabs.length ? tabs.join(',') : 'none'}; bare SKYLINE ${bare.length - before}; read error ${state.readError}; still reading ${state.pending}; not launched ${state.notOpen}` +
          (diagram ? `\n   hero diagram (${diagram.width} px): ${diagram.texts.map((t) => `"${t.text}" ${t.w} of ${t.room} px (${t.box}) ${t.inside ? 'inside' : 'OUTSIDE'}`).join(', ')}` : ''),
      );
      expect(!state.readError, `${where}: a read error is shown`);
      expect(!state.pending, `${where}: still "Reading ..."`);
      expect(LOCAL ? !state.notOpen : true, `${where}: says the pool is not open`);
      if (diagram) expect(diagram.texts.length > 0 && diagram.texts.every((t) => t.inside), `${where}: hero diagram ${JSON.stringify(diagram)}`);
      const o = await evalJs(OVERFLOW);
      if (o.scrollW > o.vw || o.out.length) sideways.push({ label, name, ...o });
      if (photo) await photoPage(`${name}-${label}`);
    }
  }
} finally {
  say(`== texts and labels read: ${piecesRead}; "$SKYLINE" seen ${dollarCount} times`);
  say(`== SKYLINE not preceded by "$" (or doubled), in the built pages' visible text and labels: ${bare.length ? '\n   ' + bare.join('\n   ') : 'none'}`);
  say(`== controls and cells with "$SKYLINE" running over more than one line, or clipped: ${wraps.length ? '\n   ' + [...new Set(wraps)].join('\n   ') : 'none'}`);
  say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
  say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
  say(`== hosts contacted: ${[...hosts].map(([h, n]) => `${h} (${n})`).join(', ')}`);
  say(`== JSON-RPC methods asked of ${RPC}: ${[...rpcMethods].map(([m, n]) => `${m} (${n})`).join(', ') || 'none'}`);
  say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
}
const foreign = [...hosts.keys()].filter((h) => h !== `http://127.0.0.1:${PORT}` && h !== RPC);
if (foreign.length) problems.push(`hosts other than the site and its RPC: ${foreign.join(', ')}`);
const READ_ONLY = new Set(['eth_call', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_chainId', 'eth_getBalance', 'eth_getCode', 'eth_getStorageAt', 'eth_getTransactionCount', 'eth_maxPriorityFeePerGas', 'eth_gasPrice', 'eth_feeHistory']);
const writes = [...rpcMethods.keys()].filter((m) => !READ_ONLY.has(m));
if (writes.length) problems.push(`JSON-RPC methods that are not plain reads: ${writes.join(', ')}`);
if (bare.length) problems.push(`${bare.length} SKYLINE without "$" (or doubled) in the built pages`);
say(`== what this run found wrong: ${problems.length ? problems.join(' || ') : 'nothing'}`);
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
console.log(bad ? `FAILED: ${problems.join(' || ')}` : `OK: every page read and photographed (${MODE}); no bare SKYLINE; no policy violation, no console message, no sideways scrolling`);
process.exit(bad ? 1 : 0);
