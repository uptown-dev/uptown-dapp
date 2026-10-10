// CR-73 (F9j) review driver: the proof that the Owner page carries a replaced staking contract's
// own powers, plus the policy check and the photographs. Local review only; nothing here runs in the
// site. Pictures and the log go to the git-ignored review-shots/f9j/.
//
// Usage, from frontend/ (the local chain must be running):
//   node scripts/cr73-proof.mjs
//   (SKIP_BUILD=1 reuses the build already in dist/; ONLY=... is not used here)
//
// What a replacement looks like needs two things the local chain cannot give on its own: a second
// staking contract in the site's own list (CR-72: the list is the only source of a staking target),
// and a Treasury that pays it. So:
//
// 1. The script makes a stand-in build. It patches one line of src/lib/network.ts — the local
//    chain's staking list — so the list reads: the real TownStaking, replaced on 10 Oct 2026, and a
//    second listed contract, STAND_IN, paid now. It builds that, then puts network.ts back at once,
//    before the browser starts. Nothing of the patch survives the run (the script prints the file's
//    state afterwards), and dist/ must be built again from the committed source after it.
// 2. The stand-in RPC: the DevTools Fetch domain pauses every request to http://127.0.0.1:8545 and
//    this script answers it after forwarding it to the real node. Treasury.staking() answers
//    STAND_IN, and reads of STAND_IN inside a multicall are served by the real TownStaking, so the
//    site sees a working staking contract at the address the treasury pays now. The replaced card
//    then reads the real TownStaking, with its real owner, price and feed.
//
// The owner's actions are only ever checked (a read-only eth_call), never sent: every
// eth_sendTransaction is logged and fails the run.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { decodeFunctionData, decodeFunctionResult, encodeAbiParameters, encodeFunctionResult, getAddress, toFunctionSelector } from 'viem';

const DIST = resolve('dist');
const OUT = resolve('review-shots/f9j');
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4263;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

const dep = JSON.parse(readFileSync(resolve('../script/deployments/31337.json'), 'utf8'));
const TREASURY = getAddress(dep.treasury);
const STAKING = getAddress(dep.townStaking); // the real contract: the replaced one in this run
const OWNER = getAddress(dep.owner);
const MULTICALL = getAddress(dep.multicall3);
/** The second listed staking contract: the one the treasury pays in this run. Nothing is deployed there. */
const STAND_IN = getAddress('0x2ec70000000000000000000000000000000c0ffe');
const REPLACED_ON = '2026-10-10 12:00';
/** Chainlink BTC/USD on mainnet: an unrelated address that reports 8 decimals, so announceFeed accepts it. */
const FEED_8DEC = getAddress('0xf4030086522a5beea4988f8ca5b36dbc97bee88c');
const SEL = { staking: toFunctionSelector('staking()') };
const AGG3 = [
  {
    type: 'function',
    name: 'aggregate3',
    stateMutability: 'payable',
    inputs: [{ name: 'calls', type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'allowFailure', type: 'bool' }, { name: 'callData', type: 'bytes' }] }],
    outputs: [{ name: 'returnData', type: 'tuple[]', components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }] }],
  },
];

// ---- the stand-in build -------------------------------------------------------------------------
const NETWORK_TS = resolve('src/lib/network.ts');
const PLAIN = "  31337: [{ address: 'TownStaking', replacedOn: null }],";
const PATCHED = `  31337: [{ address: 'TownStaking', replacedOn: '${REPLACED_ON}' }, { address: '${STAND_IN.toLowerCase()}', replacedOn: null }],`;

async function run(cmd, args, env = {}) {
  return new Promise((done) => {
    const p = spawn(cmd, args, { shell: true, env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => done({ code, out }));
  });
}

if (process.env.SKIP_BUILD !== '1') {
  const original = readFileSync(NETWORK_TS, 'utf8');
  if (!original.includes(PLAIN)) throw new Error(`network.ts: the local chain's staking list is not the line this script patches:\n  ${PLAIN}`);
  say(`== stand-in build: the local chain's staking list becomes TownStaking (replaced on ${REPLACED_ON}) and ${STAND_IN} (paid now)`);
  try {
    writeFileSync(NETWORK_TS, original.replace(PLAIN, PATCHED));
    const r = await run('npm', ['run', 'build'], { VITE_CHAIN_ID: '31337' });
    say(`  build exit ${r.code}: ${r.out.split('\n').filter((l) => /built in|error|Error/.test(l)).join(' | ')}`);
    if (r.code !== 0) throw new Error(`the stand-in build failed:\n${r.out}`);
  } finally {
    writeFileSync(NETWORK_TS, original);
    say(`  network.ts put back: patch present ${readFileSync(NETWORK_TS, 'utf8').includes(PATCHED)}, original line present ${readFileSync(NETWORK_TS, 'utf8').includes(PLAIN)}`);
  }
}
if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: build first, or drop SKIP_BUILD=1');

// ---- the static server, with the hosting headers ------------------------------------------------
const vercel = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
function serve(dir, port, rpcOrigin) {
  const base = vercel.headers.find((h) => h.source === '/(.*)').headers;
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(dir, path === '/' ? 'index.html' : path);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    for (const h of base) res.setHeader(h.key, h.key === 'Content-Security-Policy' ? h.value.replace(/connect-src [^;]+/, `connect-src ${rpcOrigin}`) : h.value);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}
const servers = [await serve(DIST, PORT, RPC)];
const SITE = `http://127.0.0.1:${PORT}/`;

// ---- the browser --------------------------------------------------------------------------------
const profile = resolve(tmpdir(), 'uptown-f9j-proof-profile');
rmSync(profile, { recursive: true, force: true });
const debugPort = 9383;
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${debugPort}`, '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
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
const violations = [];
const consoleMsgs = [];
const issues = [];
const rpcLog = [];
let standInReads = 0;

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
    const text = m.params.args.map((a) => a.value ?? a.description).join(' ');
    if (text.startsWith('__csp ')) violations.push(text.slice(6));
    else consoleMsgs.push(`${m.params.type}: ${text}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleMsgs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  } else if (m.method === 'Log.entryAdded') {
    consoleMsgs.push(`log ${m.params.entry.level}: ${m.params.entry.text}`);
  } else if (m.method === 'Audits.issueAdded') {
    issues.push(JSON.stringify(m.params.issue).slice(0, 300));
  } else if (m.method === 'Fetch.requestPaused') {
    void answer(m.params);
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

// The stand-in RPC: Treasury.staking() answers STAND_IN; reads of STAND_IN are served by the real
// TownStaking. Only reads inside a multicall are rewritten, so a transaction, a gas estimate or a
// direct call naming STAND_IN shows up in the log instead of being hidden.
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const aggSelector = toFunctionSelector(AGG3[0]);
function rewriteCall(params) {
  const [tx] = params;
  if (!same(tx?.to, MULTICALL) || !tx.data?.startsWith(aggSelector)) return { params, fix: null };
  const { args } = decodeFunctionData({ abi: AGG3, data: tx.data });
  const calls = args[0].map((c) => ({ ...c }));
  const marks = [];
  calls.forEach((c, i) => {
    if (same(c.target, STAND_IN)) {
      standInReads++;
      c.target = STAKING;
    }
    if (same(c.target, TREASURY) && c.callData === SEL.staking) marks.push([i, encodeAbiParameters([{ type: 'address' }], [STAND_IN])]);
  });
  const data = aggSelector + encodeAbiParameters(AGG3[0].inputs, [calls]).slice(2);
  return {
    params: [{ ...tx, data }, ...params.slice(1)],
    fix: (result) => {
      if (!marks.length) return result;
      const out = decodeFunctionResult({ abi: AGG3, functionName: 'aggregate3', data: result }).map((r) => ({ ...r }));
      for (const [i, value] of marks) out[i] = { success: true, returnData: value };
      return encodeFunctionResult({ abi: AGG3, functionName: 'aggregate3', result: out });
    },
  };
}
async function handleOne(msg) {
  const { method, params = [] } = msg;
  const to = params[0]?.to;
  if (method === 'eth_sendTransaction' || method === 'eth_sendRawTransaction') rpcLog.push(`A TRANSACTION WAS REQUESTED: ${method} from ${params[0]?.from} to ${to} data ${String(params[0]?.data ?? params[0]?.input).slice(0, 10)}`);
  if (['eth_sendTransaction', 'eth_estimateGas', 'eth_call', 'eth_sendRawTransaction'].includes(method) && same(to, STAND_IN)) rpcLog.push(`NAMED THE STAND-IN: ${method} to ${to}`);
  if (method.startsWith('anvil_') || method.startsWith('evm_')) throw new Error(`the page asked for ${method}`);
  let fwd = msg;
  let fix = null;
  if (method === 'eth_call') {
    const r = rewriteCall(params);
    fwd = { ...msg, params: r.params };
    fix = r.fix;
  }
  const res = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fwd) })).json();
  if (fix && res.result) res.result = fix(res.result);
  return res;
}
async function answer(p) {
  try {
    let body = p.request.postData;
    if (!body && p.request.postDataEntries) body = p.request.postDataEntries.map((x) => Buffer.from(x.bytes ?? '', 'base64').toString('utf8')).join('');
    if (p.request.method !== 'POST' || !body) {
      await send('Fetch.continueRequest', { requestId: p.requestId });
      return;
    }
    const msg = JSON.parse(body);
    const out = Array.isArray(msg) ? await Promise.all(msg.map(handleOne)) : await handleOne(msg);
    await send('Fetch.fulfillRequest', {
      requestId: p.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Access-Control-Allow-Origin', value: '*' },
      ],
      body: Buffer.from(JSON.stringify(out)).toString('base64'),
    });
  } catch (e) {
    say(`stand-in RPC error: ${e.stack ?? e.message}`);
    await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' });
  }
}

// ---- page helpers --------------------------------------------------------------------------------
const CSP_LISTENER = `document.addEventListener('securitypolicyviolation', (e) => console.log('__csp ' + e.violatedDirective + ' blocked ' + e.blockedURI + ' at ' + e.sourceFile + ':' + e.lineNumber));`;
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Log.enable');
await send('Audits.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });
await send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:8545*', requestStage: 'Request' }] });

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
async function open(page, wallet) {
  await send('Page.navigate', { url: `${SITE}#/${page}` });
  await sleep(800);
  await evalJs(wallet ? `localStorage.setItem('uptown-local-wallet', '${wallet}'), 1` : "localStorage.removeItem('uptown-local-wallet'), 1");
  await send('Page.reload', { ignoreCache: true });
  await sleep(700);
  if ((await evalJs('location.hash')) !== `#/${page}`) {
    await evalJs(`location.hash = '#/${page}', 1`);
    await sleep(300);
  }
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('.read-line')?.dataset.block || !!document.querySelector('.footer-note')")) break;
    await sleep(250);
  }
  for (let i = 0; i < 40; i++) {
    if (await evalJs("!!document.querySelector('.replaced-card')")) break;
    await sleep(250);
  }
  await sleep(800);
  await evalJs('document.fonts.ready.then(() => 1)');
}
const typeInto = (sel, v) =>
  evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return 'missing'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const clickText = (scope, label) =>
  evalJs(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)} + ' button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (!b) return 'missing'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`);
const textOf = (sel) => evalJs(`(document.querySelector(${JSON.stringify(sel)})?.innerText ?? '').replace(/\\s+/g, ' ').trim()`);
const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 0.5) { let p = el.parentElement, clipped = false; while (p) { const s = getComputedStyle(p); if (['auto','hidden','scroll'].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').join('.') + ' ' + Math.round(r.right)); } } return { scrollW: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) }; })()`;
const sideways = [];
async function shot(name, sel) {
  if (sel) await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.scrollIntoView({ block: 'center' }); return 1; })()`);
  await sleep(250);
  const o = await evalJs(OVERFLOW);
  if (o.scrollW > o.vw || o.out.length) sideways.push({ name, ...o });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png (scroll width ${o.scrollW}/${o.vw})`);
}
/** One tall picture from the top of `from` to the bottom of `to`, so two cards fit in one photograph. */
async function shotClip(name, from, to, max = 3000) {
  const box = await evalJs(
    `(() => { const a = document.querySelector(${JSON.stringify(from)}), b = document.querySelector(${JSON.stringify(to)}); if (!a || !b) return null; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); const y = ra.top + window.scrollY - 12; return { y: Math.max(0, y), h: Math.min(${max}, rb.bottom + window.scrollY + 12 - y), w: document.documentElement.clientWidth }; })()`,
  );
  if (!box) {
    say(`photo ${name}.png: NOT TAKEN (${from} or ${to} missing)`);
    return;
  }
  const o = await evalJs(OVERFLOW);
  if (o.scrollW > o.vw || o.out.length) sideways.push({ name, ...o });
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: box.y, width: box.w, height: box.h, scale: 1 } });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png (${box.w}x${Math.round(box.h)}, scroll width ${o.scrollW}/${o.vw})`);
}
const runCheck = async (scope) => {
  const c = await clickText(scope, 'Check:');
  if (c !== 'clicked') return `Check: ${c}`;
  for (let i = 0; i < 60; i++) {
    const r = await textOf(`${scope} .check-result`);
    if (r) return r;
    await sleep(250);
  }
  return 'no result';
};

let code = 0;
const REPLACED_CARD = `#owner-staking-replaced-${STAKING}`;
const FEED_ACTION = `[data-action="announceFeed-${STAKING}"]`;
const PRICE_ACTION = `[data-action="setFallbackPrice-${STAKING}"]`;
try {
  say(`== the treasury pays ${STAND_IN} (the stand-in RPC's answer); the site lists it, and lists ${STAKING} as replaced on ${REPLACED_ON}`);
  await view(1280, 'light');
  await open('owner', OWNER);

  // What the page shows.
  const cards = await evalJs(`[...document.querySelectorAll('.card-title')].map((h) => h.textContent).join(' | ')`);
  const paidNow = await textOf('[data-view="Treasury.staking"]');
  const replacedText = await textOf(REPLACED_CARD);
  say(`  cards: ${cards}`);
  say(`  treasury "Paid now": ${paidNow}`);
  say(`  replaced card: ${replacedText.slice(0, 520)}`);
  const settings = await evalJs(
    `(() => { const c = document.querySelector(${JSON.stringify(REPLACED_CARD)}); if (!c) return 'no card'; return [...c.querySelectorAll('.setting')].map((s) => s.querySelector('dt').innerText.trim() + ': ' + s.querySelector('.setting-value').innerText.trim() + ' [' + s.querySelector('.setting-value').dataset.view + ']').join(' || '); })()`,
  );
  say(`  replaced card settings: ${settings}`);
  const buttons = await evalJs(
    `(() => { const c = document.querySelector(${JSON.stringify(REPLACED_CARD)}); return c ? [...c.querySelectorAll('button')].map((b) => b.textContent.trim() + (b.disabled ? ' (off)' : '')).join(' | ') : 'no card'; })()`,
  );
  say(`  replaced card buttons: ${buttons}`);
  const currentCard = await textOf('#owner-staking-card');
  say(`  current staking card (the contract paid now): ${currentCard.slice(0, 260)}`);
  if (!replacedText.includes(STAKING)) code = 1;

  // The two cards in one photograph, light and dark.
  for (const theme of ['light', 'dark']) {
    await view(1280, theme);
    await open('owner', OWNER);
    await shotClip(`owner-current-and-replaced-1280-${theme}`, '#owner-staking-card', REPLACED_CARD);
  }

  // The feed power of the replaced contract: checked (read-only), with its confirmation.
  await view(1280, 'light');
  await open('owner', OWNER);
  say(`  type the feed ${FEED_8DEC} into the replaced contract's feed field: ${await typeInto(`#owner-feed-${STAKING}`, FEED_8DEC)}`);
  await sleep(300);
  const feedResult = await runCheck(FEED_ACTION);
  say(`  check result (announce a feed in the replaced contract): ${feedResult}`);
  const feedPanel = await textOf(`${FEED_ACTION} .confirm-panel`);
  say(`  confirmation: ${feedPanel}`);
  const namesReplaced = feedResult.includes(STAKING) && feedPanel.includes(STAKING);
  const namesStandIn = feedResult.includes(STAND_IN) || feedPanel.includes(STAND_IN);
  say(`  the check and the confirmation name the replaced contract: ${namesReplaced}; they name the contract paid now: ${namesStandIn}`);
  if (!namesReplaced || namesStandIn) code = 1;
  await shot('owner-replaced-feed-1280-light', FEED_ACTION);
  await shotClip('owner-replaced-feed-check-1280-light', `${FEED_ACTION}`, `${FEED_ACTION} .confirm-panel`, 1200);

  // The fallback price of the replaced contract, also checked only.
  say(`  type 2500 into the replaced contract's fallback price: ${await typeInto(`#owner-price-${STAKING}`, '2500')}`);
  await sleep(300);
  const priceResult = await runCheck(PRICE_ACTION);
  say(`  check result (set the fallback price in the replaced contract): ${priceResult}`);
  say(`  confirmation: ${await textOf(`${PRICE_ACTION} .confirm-panel`)}`);
  if (!priceResult.includes(STAKING)) code = 1;

  // The narrow screen.
  await view(390, 'light');
  await open('owner', OWNER);
  await shot('owner-replaced-390-light', REPLACED_CARD);
  await shotClip('owner-replaced-card-390-light', REPLACED_CARD, REPLACED_CARD, 2600);

  say(`  reads served for the stand-in (inside multicalls): ${standInReads}`);
  const named = rpcLog.filter((l) => l.startsWith('NAMED'));
  const txs = rpcLog.filter((l) => l.startsWith('A TRANSACTION'));
  say(`  requests naming the stand-in outside a read: ${named.length}${named.length ? ' ' + named.join('; ') : ''}`);
  say(`  transactions requested: ${txs.length ? txs.join(' || ') : 'none'}`);
  if (txs.length) code = 1;
} catch (e) {
  say(`DRIVER ERROR: ${e.stack ?? e}`);
  code = 1;
} finally {
  say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
  say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
  say(`== DevTools issues: ${issues.length ? issues.join(' || ') : 'none'}`);
  say(`== hosts contacted: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
  say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
  say(`== network.ts holds the committed list: ${readFileSync(NETWORK_TS, 'utf8').includes(PLAIN)} (dist/ holds the stand-in build: build again from the committed source)`);
  if (violations.length || sideways.length) code = 1;
  writeFileSync(join(OUT, 'proof-log.txt'), logLines.join('\n') + '\n');
  try {
    ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
  } catch {}
  await sleep(800);
  edge.kill();
  for (const s of servers) s.close();
}
process.exit(code);
