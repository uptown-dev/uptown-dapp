// CR-77 (F9m) review driver: photographs the seven website changes on the build that is in dist/,
// and measures the header and the wallet display. Local review only; nothing here runs in the site.
// Pictures and the log go to the git-ignored review-shots/f9m/.
//
// Usage, from frontend/ (build dist/ first for the chain you want to look at):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9m-shots.mjs 31337
//   VITE_CHAIN_ID=1     npm run build && node scripts/f9m-shots.mjs 1
//   VITE_CHAIN_ID=11155111 npm run build && node scripts/f9m-shots.mjs 11155111
//
// It serves the built site with the hosting headers of vercel.json on 127.0.0.1:4272 — never 4173,
// 5173 or 8545 — drives headless Edge, and reports every policy violation, console message and
// sideways scroll it sees.
//
// Two review-only aids, both switched on by a query the driver puts in the address and both running
// before the site's own scripts, so what is photographed is the site's own markup and stylesheet:
//   ?wc=<hex chain id>  a read-only stub browser wallet (it answers eth_accounts and eth_chainId and
//                       nothing else), so the wallet display can be photographed with a wallet on
//                       the site's own network and on another one. The local-chain build picks a
//                       test wallet from the site's own menu instead, as F9l did.
//   ?clock=<ms>         moves this page's clock forward by that many milliseconds, so the notice
//                       that the network service is behind can be photographed: the local chain's
//                       latest block is hours ahead of the real clock, so nothing is behind until
//                       the clock is moved past it.
//
// It never sends a transaction and never asks a wallet to send one: it opens pages, presses the
// theme switch and the menu button, opens the wallet menu, and on the local chain picks a test
// wallet (an address the local node signs for; no key, no transaction). The "Switch to …" action in
// the wallet menu is photographed but never pressed.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const CHAIN = process.argv[2] ?? '31337';
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f9m/chain-${CHAIN}`);
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4272;
const DEBUG_PORT = 9392;
const PROFILE_NAME = 'uptown-f9m-shots-profile';
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
// The two review-only aids. Both read the address the driver asked for and do nothing without it.
const REVIEW_AIDS = `(() => {
  const q = new URLSearchParams(location.search);
  const ms = Number(q.get('clock') ?? 0);
  if (ms > 0) { const real = Date.now; Date.now = () => real.call(Date) + ms; }
  const wc = q.get('wc');
  if (!wc) return;
  // A made-up address, in its checksummed form (the site refuses any other).
  const account = '0x1F2E3d4C5B6a79889aabBCCdDeeff00112233445';
  window.ethereum = {
    request: ({ method }) =>
      method === 'eth_accounts' || method === 'eth_requestAccounts'
        ? Promise.resolve([account])
        : method === 'eth_chainId'
          ? Promise.resolve(wc)
          : Promise.reject(new Error('review stub: only eth_accounts and eth_chainId are answered')),
    on: () => {},
    removeListener: () => {},
  };
})();`;
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Log.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });
await send('Page.addScriptToEvaluateOnNewDocument', { source: REVIEW_AIDS });

const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 0.5) { let p = el.parentElement, clipped = false; while (p) { const s = getComputedStyle(p); if (['auto','hidden','scroll'].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').join('.') + ' ' + Math.round(r.right)); } } return { scrollW: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) }; })()`;
const sideways = [];
const problems = [];

/** The header: whether a tag is shown, the row's height, and what the wallet display is drawing. */
const HEADER = `(() => {
  const round = (n) => Math.round(n * 100) / 100;
  const row = document.querySelector('.header-row').getBoundingClientRect();
  const tag = document.querySelector('.net-tag');
  const btn = document.querySelector('.wallet-btn');
  const b = btn.getBoundingClientRect();
  const dot = btn.querySelector('.dot');
  const cs = dot ? getComputedStyle(dot) : null;
  const hidden = [...btn.querySelectorAll('.visually-hidden')].map((s) => s.textContent).join(' ');
  const shown = [...btn.childNodes].filter((n) => !(n.nodeType === 1 && n.classList.contains('visually-hidden'))).map((n) => n.textContent).join('').replace(/\\s+/g, ' ').trim();
  const wrapped = [...document.querySelectorAll('.header-row a.wordmark span, .header-row .net-tag span, .header-row .day-chip, .header-row .site-nav a, .header-row .wallet-btn')]
    .filter((el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 1)
    .map((el) => (el.className || el.tagName) + ' on ' + el.getClientRects().length + ' lines');
  return {
    viewport: document.documentElement.clientWidth,
    rowHeight: round(row.height),
    tagInDom: !!tag,
    tagShown: !!tag && getComputedStyle(tag).display !== 'none' && tag.getBoundingClientRect().width > 0,
    tagText: tag ? [...tag.children].filter((c) => getComputedStyle(c).display !== 'none' && !c.classList.contains('visually-hidden')).map((c) => c.textContent).join('|') : null,
    walletShown: shown,
    walletClass: btn.className,
    walletTitle: btn.getAttribute('title'),
    walletAria: btn.getAttribute('aria-label'),
    light: dot ? (dot.classList.contains('dot-wrong') ? 'red triangle' : 'green dot') : 'none (no wallet connected)',
    lightColour: cs ? (cs.borderRadius === '50%' ? cs.backgroundColor : cs.borderBottomColor) : null,
    lightBox: dot ? round(dot.getBoundingClientRect().width) + ' x ' + round(dot.getBoundingClientRect().height) : null,
    forScreenReader: hidden,
    walletWidth: round(b.width),
    rowRightEdge: round(b.right),
    wrapped,
    staleNotice: document.querySelector('.stale-wrap .stale-note') ? document.querySelector('.stale-wrap .stale-note').textContent.replace(/\\s+/g, ' ').trim() : null,
    readLine: (() => { const r = document.querySelector('.read-line'); return r ? { children: r.childElementCount, display: getComputedStyle(r).display, block: r.dataset.block } : null; })(),
    readLineText: document.body.innerText.includes('Figures read from') || document.body.innerText.includes('Read now'),
  };
})()`;

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
/** Opens the site (optionally a page, a stub wallet's chain and a clock shift) and waits for the figures. */
async function open({ hash = '', wc = null, clock = 0 } = {}) {
  const q = [wc ? `wc=${wc}` : '', clock ? `clock=${clock}` : ''].filter(Boolean).join('&');
  await send('Page.navigate', { url: `${SITE}${q ? `?${q}` : ''}${hash}` });
  await sleep(900);
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('.header-row')")) break;
    await sleep(250);
  }
  let read = false;
  for (let i = 0; i < 200; i++) {
    read = await evalJs("!!document.querySelector('.read-line')?.dataset.block || !!document.querySelector('.footer-note')");
    if (read) break;
    await sleep(250);
  }
  if (!read) problems.push(`the figures were not read within 50 seconds (${q || 'no query'}${hash})`);
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
/** One part drawn four times larger, to read its text and see the light's colour and shape. */
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
/** The header's own report, checked as it is read. */
async function report(label, want = {}) {
  const h = await evalJs(HEADER);
  say(`   ${label}: ${JSON.stringify(h)}`);
  if (h.wrapped?.length) problems.push(`${label}: text in the header row wrapped: ${h.wrapped.join(', ')}`);
  if (h.readLineText) problems.push(`${label}: the deleted read line is still on the page`);
  if (h.rowHeight !== 60) problems.push(`${label}: the header row is ${h.rowHeight} px, not 60 px`);
  if (want.tagShown !== undefined && h.tagShown !== want.tagShown) problems.push(`${label}: the tag is ${h.tagShown ? 'shown' : 'not shown'}, wanted the opposite`);
  if (want.light !== undefined && h.light !== want.light) problems.push(`${label}: the light is "${h.light}", wanted "${want.light}"`);
  return h;
}
/** The four texts and the card figure, read back from the rendered homepage. */
const TEXTS = `(() => {
  const why = [...document.querySelectorAll('.why p')].map((p) => p.textContent);
  const cards = [...document.querySelectorAll('article.feature')].map((a) => {
    const ps = [...a.querySelectorAll('p')];
    return { heading: a.querySelector('h2').textContent, figure: ps[0].textContent, view: ps[0].getAttribute('data-view'), sentence: ps[1].textContent };
  });
  return { why, cards, ownerLine: document.body.innerText.includes('earns income from fees') };
})()`;

// ---- the homepage, wide, both themes, and on a phone ---------------------------------------------
for (const [width, theme] of [
  [1280, 'light'],
  [1280, 'dark'],
  [390, 'light'],
  [390, 'dark'],
]) {
  await view(width, theme);
  await open();
  say(`== the homepage at ${width} px, ${theme}`);
  await report(`header ${width} ${theme}`, { tagShown: width >= 480 });
  if (width === 1280 && theme === 'light') say(`   texts: ${JSON.stringify(await evalJs(TEXTS), null, 1)}`);
  await shot(`header-${width}-${theme}`, 'header.site-header');
  await shot(`hero-${width}-${theme}`, 'section.hero');
  await shot(`why-${width}-${theme}`, 'section[aria-labelledby="why-title"]');
  await shot(`cards-${width}-${theme}`, '.feature-grid');
  await shot(`so-far-${width}-${theme}`, 'section[aria-labelledby="live-title"]', 20);
}

// ---- the Docs owner section ----------------------------------------------------------------------
for (const [width, theme] of [
  [1280, 'light'],
  [1280, 'dark'],
  [390, 'light'],
]) {
  await view(width, theme);
  await open({ hash: '#/docs/owner' });
  say(`== the Docs owner section at ${width} px, ${theme}`);
  const earns = await evalJs("(() => { const s = document.querySelector('#docs-owner'); return { earns: s.innerText.includes('What the owner earns'), incomeLists: s.querySelectorAll('.income-list').length, rows: s.querySelectorAll('table.powers tbody tr').length, address: /0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/.exec(s.innerText)?.[0] ?? null }; })()");
  say(`   the owner section: ${JSON.stringify(earns)}`);
  if (earns.earns || earns.incomeLists) problems.push(`Docs at ${width} px: the earnings section is still there`);
  if (earns.rows !== 12) problems.push(`Docs at ${width} px: the powers table has ${earns.rows} rows, wanted 12`);
  await shot(`docs-owner-${width}-${theme}`, '#docs-owner', 16);
}

// ---- the wallet display, on the site's own network and on another one ----------------------------
if (CHAIN === '31337') {
  // The local chain is never "the wrong network" (the site has no wallet chain to compare there):
  // a test wallet picked from the site's own menu shows the green light.
  for (const width of [1280, 390]) {
    await view(width, 'light');
    await open();
    await evalJs("document.querySelector('.wallet-btn').click(), 1");
    await sleep(350);
    await evalJs("document.querySelector('.wallet-option[data-address]').click(), 1");
    await sleep(1600);
    say(`== ${width} px, light, a test wallet picked from the site's own menu`);
    await report(`wallet, right network, ${width} px`, { light: 'green dot', tagShown: width >= 480 });
    await shot(`wallet-right-${width}-light`, 'header.site-header');
    await closeUp(`wallet-right-${width}-light-x4`, '.wallet-wrap');
    await evalJs("localStorage.removeItem('uptown-local-wallet'), 1");
  }
} else {
  // The two public builds: the review stub wallet, first on the site's own network, then on another.
  const RIGHT = CHAIN === '1' ? '0x1' : '0xaa36a7';
  const WRONG = CHAIN === '1' ? '0xaa36a7' : '0x1';
  for (const width of [1280, 390]) {
    for (const [what, wc, light] of [
      ['right', RIGHT, 'green dot'],
      ['wrong', WRONG, 'red triangle'],
    ]) {
      await view(width, 'light');
      await open({ wc });
      say(`== ${width} px, light, the stub wallet on chain ${wc} (the ${what} network for this build)`);
      await report(`wallet, ${what} network, ${width} px`, { light, tagShown: width >= 480 });
      await shot(`wallet-${what}-${width}-light`, 'header.site-header');
      await closeUp(`wallet-${what}-${width}-light-x4`, '.wallet-wrap');
      if (what === 'wrong') {
        // What a visitor gets when they use the display: the menu, its reason and its action.
        await evalJs("document.querySelector('.wallet-btn').click(), 1");
        await sleep(400);
        const menu = await evalJs("(() => { const m = document.querySelector('.wallet-menu'); return m ? { text: m.innerText.replace(/\\s+/g, ' ').trim(), action: m.querySelector('.wallet-switch')?.textContent.trim() ?? null } : null; })()");
        say(`   the wallet menu: ${JSON.stringify(menu)}`);
        if (!menu?.action) problems.push(`${width} px: the wallet menu has no "Switch to …" action on the wrong network`);
        await shot(`wallet-wrong-${width}-light-menu`, '.wallet-menu', 60);
      }
      // The dark theme too, so the red light is checked in both.
      if (width === 1280) {
        await view(width, 'dark');
        await open({ wc });
        await report(`wallet, ${what} network, ${width} px, dark`, { light, tagShown: true });
        await closeUp(`wallet-${what}-${width}-dark-x4`, '.wallet-wrap');
      }
    }
  }
}

// ---- the notice that the network service is behind ------------------------------------------------
// The local chain's latest block is hours ahead of this computer's clock, so the notice is shown by
// moving this page's clock a week forward: the site's own component, with the site's own figures.
if (CHAIN === '31337') {
  const WEEK = 7 * 24 * 3600 * 1000;
  for (const width of [1280, 390]) {
    await view(width, 'light');
    await open({ clock: WEEK });
    const h = await report(`the stale notice at ${width} px`, { tagShown: width >= 480 });
    if (!h.staleNotice) problems.push(`${width} px: the notice that the network service is behind was not shown with the clock moved a week on`);
    await shot(`stale-${width}-light`, '.stale-wrap', 24);
    await shot(`stale-${width}-light-with-header`, 'header.site-header', 90);
    await closeUp(`stale-${width}-light-x4`, '.stale-wrap');
  }
}

// ---- the widths the tag appears and disappears at, and the row's height at each -------------------
say('== the tag against the viewport width');
for (const width of [1280, 960, 768, 640, 560, 480, 479, 390, 360]) {
  await view(width, 'light');
  await open();
  const h = await evalJs(HEADER);
  say(`   ${String(width).padStart(4)} px: tag ${h.tagShown ? `shown ("${h.tagText}")` : 'not shown'}, header row ${h.rowHeight} px, wallet button ${h.walletWidth} px`);
  if (h.rowHeight !== 60) problems.push(`${width} px: the header row is ${h.rowHeight} px, not 60 px`);
  if (h.tagShown !== width >= 480) problems.push(`${width} px: the tag is ${h.tagShown ? 'shown' : 'not shown'}`);
  const o = await evalJs(OVERFLOW);
  if (o.out.length) sideways.push({ name: `width ${width}`, ...o });
}

// ---- the figures are still read again on their own, with no line and no button --------------------
if (CHAIN === '31337') {
  await view(1280, 'light');
  await open();
  const before = hosts.get(RPC) ?? 0;
  await sleep(20_000);
  const after = hosts.get(RPC) ?? 0;
  say(`== the figures are still read again by themselves: requests to ${RPC} grew from ${before} to ${after} over 20 seconds with nothing touched (the 15-second refresh)`);
  if (after <= before) problems.push('no further reads in 20 seconds: the 15-second refresh may be broken');
}

say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
say(`== hosts contacted: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
say(`== what the header's own report found wrong: ${problems.length ? problems.join(' || ') : 'nothing'}`);

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
console.log(bad ? 'FAILED: see the lines above' : 'OK: no policy violation, no console message, no sideways scrolling, nothing wrong with the header or the texts');
process.exit(bad ? 1 : 0);
