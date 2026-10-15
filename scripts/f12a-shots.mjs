// F12a (CR-86, CR-98) review driver: photographs every page of the build in dist/ against the local
// chain, in whichever state the chain is in, and checks what each page shows in that state.
//
//   node scripts/f12a-shots.mjs not-launched   the chain was started with `local-chain.sh start --no-launch`
//   node scripts/f12a-shots.mjs launched       the chain was launched (`local-chain.sh launch`, or a plain start)
//
// The state named must be the chain's own (`Launcher.launched()`), or the run stops. Pages: Home,
// Trade, Rewards, Stake, Stats, Docs and Owner (the owner's test wallet picked for Owner, Test wallet 1
// elsewhere), at 1280 px light and 390 px dark.
//
// Not launched, every page: no day number or countdown in the header, no dollar figure, no TOWN
// price line, no read error, no figure of 0 TOWN, 0 ETH or 0 WETH; the seven contracts in the footer;
// Home's one line that the contracts are live and the pool opens soon; Trade, Rewards and Stake in
// their "before the launch" form with buying, selling, claiming and opening a vault off, each with its
// sentence; the Owner page's Launch and its "From the launch" list. Launched: the header's day and
// countdown, the dollar figures and the price line are back, and no page is in its "before" form.
// Always: no policy violation, no console message, no sideways scrolling.
//
// Usage, from frontend/ (build for the local chain first, with the chain running):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f12a-shots.mjs not-launched
//
// It serves the built site with the hosting headers of vercel.json on 127.0.0.1:4312 (never 4173,
// 5173 or 8545) and drives headless Edge. It picks local test wallets the way the site's own picker
// remembers them and sends nothing anywhere. Pictures and the log go to the git-ignored
// review-shots/f12a/<state>/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const STATE = process.argv[2];
if (STATE !== 'not-launched' && STATE !== 'launched') throw new Error('usage: node scripts/f12a-shots.mjs not-launched|launched');
const BEFORE = STATE === 'not-launched';
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f12a/${STATE}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4312;
const DEBUG_PORT = 9412;
const PROFILE_NAME = 'uptown-f12a-shots-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: run VITE_CHAIN_ID=31337 npm run build first');
const addressFile = JSON.parse(readFileSync(resolve('src/addresses/31337.json'), 'utf8'));
const WALLET = addressFile.testWallets?.[0];
const OWNER = addressFile.owner;
if (!WALLET || !OWNER) throw new Error('src/addresses/31337.json names no test wallet or owner: start the local chain and build for 31337 first');

// The chain's own answer, read-only: Launcher.launched() (selector 0x8091f3bf).
const rpc = async (method, params) => (await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()).result;
const launchedWord = await rpc('eth_call', [{ to: addressFile.contracts.Launcher, data: '0x8091f3bf' }, 'latest']);
const launched = BigInt(launchedWord) !== 0n;
say(`Launcher ${addressFile.contracts.Launcher}.launched() = ${launched} (chain ID ${parseInt(await rpc('eth_chainId', []), 16)})`);
if (launched === BEFORE) throw new Error(`the chain is ${launched ? 'launched' : 'not launched'}, but this run is for "${STATE}"`);

// ---- the static server, with the hosting headers -------------------------------------------------
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
say(`serving dist/ (chain 31337) with the vercel.json headers on ${SITE}; state ${STATE}`);

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

/** What a page shows, for the checks below. */
const FACTS = `(() => {
  const main = document.querySelector('main');
  const t = main.innerText.replace(/\\s+/g, ' ');
  const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0).length;
  return {
    dayClock: vis('.day-chip, .day-line'),
    usd: vis('main .usd'),
    dollarText: /≈ \\$/.test(t),
    priceLine: vis('.price-line'),
    before: !!main.querySelector('[data-state="not-launched"]'),
    launchLine: main.querySelector('.launch-line')?.innerText.trim() ?? null,
    off: [...main.querySelectorAll('.off-action')].map((o) => ({ id: o.dataset.off, disabled: !!o.querySelector('button')?.disabled, why: o.querySelector('p')?.innerText.trim() })),
    offPowers: main.querySelectorAll('[data-off-power]').length,
    launchAction: !!main.querySelector('[data-action="launch"], #owner-launch, [id$="launch"]'),
    zeros: (t.match(/(?:^|[^\\d.,])0(?:\\.0+)? (?:TOWN|ETH|WETH)\\b/g) ?? []).slice(0, 4),
    readError: /Could not read|The last read failed|reading [A-Za-z]+\\.[A-Za-z]+ failed/.test(t) || vis('.read-error') > 0,
    pending: /Reading the (figures|contracts)/.test(t),
    footerContracts: document.querySelectorAll('.footer-contracts li').length,
    contractList: main.querySelectorAll('.contract-list li').length,
    head: main.querySelector('h1')?.innerText.trim(),
  };
})()`;

const sideways = [];
const problems = [];
const expect = (ok, what) => {
  if (!ok) problems.push(what);
};

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
  await sleep(900);
  // Read once: the live pages leave their "Reading the figures" placeholder; Home and Docs show their figures.
  for (let i = 0; i < 80; i++) {
    const ready = await evalJs(
      BEFORE
        ? "!!document.querySelector('[data-state=\"not-launched\"], .launch-line') || (location.hash.startsWith('#/docs') || location.hash.startsWith('#/owner')) && !/Reading the (figures|contracts)/.test(document.querySelector('main').innerText)"
        : "!!document.querySelector('.read-line')?.dataset.block",
    );
    if (ready) break;
    await sleep(250);
  }
  await sleep(1500);
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

const PAGES = [
  ['home', '#/', WALLET],
  ['trade', '#/trade', WALLET],
  ['rewards', '#/rewards', WALLET],
  ['stake', '#/stake', WALLET],
  ['stats', '#/stats', WALLET],
  ['docs', '#/docs', WALLET],
  ['owner', '#/owner', OWNER],
];
const OFF_EXPECTED = { trade: ['buy', 'sell'], rewards: ['claim'], stake: ['stake'] };

try {
  for (const [width, theme] of [
    [1280, 'light'],
    [390, 'dark'],
  ]) {
    await view(width, theme);
    const label = `${width}-${theme}`;
    for (const [name, hash, who] of PAGES) {
      await pickWallet(who);
      await open(hash);
      const f = await evalJs(FACTS);
      say(
        `${label} ${name}: "${f.head}"; day/countdown ${f.dayClock}, dollar figures ${f.usd}, price line ${f.priceLine}, before-launch form ${f.before}, read error ${f.readError}, footer contracts ${f.footerContracts}` +
          (f.launchLine ? `\n   launch line: "${f.launchLine}"` : '') +
          (f.off.length ? `\n   off: ${f.off.map((o) => `${o.id}${o.disabled ? ' (disabled)' : ' (NOT disabled)'}: "${o.why}"`).join(' | ')}` : '') +
          (f.contractList ? `\n   contracts listed in full: ${f.contractList}` : '') +
          (f.offPowers ? `\n   owner powers off until the launch: ${f.offPowers}` : ''),
      );
      const where = `${label} ${name}`;
      expect(!f.readError, `${where}: a read error is shown`);
      expect(!f.pending, `${where}: still "Reading the figures"`);
      expect(f.footerContracts === 7, `${where}: ${f.footerContracts} contracts in the footer`);
      if (BEFORE) {
        expect(f.dayClock === 0, `${where}: a day number or countdown in the header`);
        expect(f.usd === 0 && !f.dollarText, `${where}: a dollar figure before the launch`);
        expect(f.priceLine === 0, `${where}: a price line before the launch`);
        expect(f.zeros.length === 0, `${where}: zero figures shown: ${f.zeros.join(', ')}`);
        if (name === 'home') expect(!!f.launchLine && /contracts are live/.test(f.launchLine) && /pool opens soon/.test(f.launchLine), `${where}: no launch line`);
        if (name === 'home' || name === 'stats') expect(f.contractList === 7, `${where}: ${f.contractList} contracts listed in full`);
        if (OFF_EXPECTED[name]) {
          expect(f.before, `${where}: not in its "before the launch" form`);
          const ids = f.off.map((o) => o.id).join(',');
          expect(ids === OFF_EXPECTED[name].join(',') && f.off.every((o) => o.disabled && o.why), `${where}: off actions ${ids}`);
        }
        if (name === 'owner') expect(f.offPowers === 5 && /Launch/.test(await evalJs("document.querySelector('main').innerText")), `${where}: the owner page before the launch`);
      } else {
        expect(f.dayClock === 1, `${where}: no day and countdown in the header`);
        expect(!f.before && !f.launchLine && f.off.length === 0, `${where}: a "before the launch" form after the launch`);
        if (['home', 'trade', 'rewards', 'stake', 'stats'].includes(name)) expect(f.usd > 0, `${where}: no dollar figure after the launch`);
        if (name === 'trade') expect(f.priceLine === 1, `${where}: no price line after the launch`);
      }
      const o = await evalJs(OVERFLOW);
      if (o.scrollW > o.vw || o.out.length) sideways.push({ label, name, ...o });
      await photoPage(`${name}-${label}`);
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
console.log(bad ? 'FAILED: see the lines above' : `OK: every page in the ${STATE} state photographed and checked; no policy violation, no console message, no sideways scrolling`);
process.exit(bad ? 1 : 0);
