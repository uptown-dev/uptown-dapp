// CR-82 and CR-83 (F9o) proof on the local chain: drives the built site in headless Edge the way a
// visitor does, with local test wallets (the local node sends from the address picked; no key exists).
//
// 1. Page width at 360, 375 and 390 px on every page, without a wallet and with one.
// 2. A first sale from a test wallet that has no approvals: one press of "Approve and sell" runs
//    the approval of Permit2, the router's permission and the sale; each transaction's receipt is read
//    from the node and the three are listed in the order they were mined.
// 3. The same wallet buys more TOWN and sells again: the button reads "Sell TOWN" and the sale is one
//    transaction (CR-83: the approvals are unlimited).
// 4. A test wallet with no vault: one press of "Approve and open tier 1 vault" runs the exact-amount
//    approval, then the vault.
// 5. Photographs of the sell form before, during and after the run, of the stake, and of the quick
//    amounts on both sides, at 1280 and 390 px, into the git-ignored review-shots/f9o/.
//
// Usage, from frontend/, with the local chain running:
//   VITE_CHAIN_ID=31337 npm run build && SELLER=4 STAKER=6 node scripts/f9o-proof.mjs
//   (SELLER and STAKER name fresh test wallets by number, or "owner"; SELL1 and SELL2 the two sale amounts;
//   WIDTHS_ONLY=1 measures only, sending nothing)
//
// It serves dist/ with the hosting headers of vercel.json on 127.0.0.1:4283 (never 4173, 5173 or
// 8545), reports every policy violation, console message and sideways scroll it sees, and only ever
// sends ordinary visitor transactions from local test wallets through the site; it calls no anvil_*
// or evm_* method.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const CHAIN = '31337';
const DIST = resolve('dist');
const OUT = resolve('review-shots/f9o');
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4283;
const DEBUG_PORT = 9413;
const PROFILE_NAME = 'uptown-f9o-proof-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: run VITE_CHAIN_ID=31337 npm run build first');
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
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Log.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: CSP_LISTENER });

const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 0.5) { let p = el.parentElement, clipped = false; while (p) { const s = getComputedStyle(p); if (['auto','hidden','scroll'].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').join('.') + ' ' + Math.round(r.right)); } } return { scrollW: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) }; })()`;
const sideways = [];
const problems = [];

/** The sell form's mode box, read back out of the rendered page. */

async function view(width, theme = 'light') {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await sleep(250);
}
/** Opens a page of the site and waits for the figures (and the wallet's, when one is picked) to be read. */
async function open(hash = '') {
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await sleep(900);
  let read = false;
  for (let i = 0; i < 200; i++) {
    read = await evalJs("!!document.querySelector('.header-row') && !!document.querySelector('main h1') && !document.body.innerText.includes('Reading the figures from the contracts.')");
    if (read) break;
    await sleep(250);
  }
  if (!read) problems.push(`the page was not ready within 50 seconds (${hash || 'the homepage'})`);
  await sleep(900);
  await evalJs('document.fonts.ready.then(() => 1)');
}
const waitFor = async (expr, ms = 60_000, what = expr) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await evalJs(`(() => { try { return ${expr}; } catch { return null; } })()`);
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
};
const typeIn = (sel, v) =>
  evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'no ' + ${JSON.stringify(sel)};
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(v)});
    el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
const click = async (sel) => {
  const r = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'no ' + ${JSON.stringify(sel)}; if (el.disabled) return 'disabled ' + ${JSON.stringify(sel)}; el.scrollIntoView({ block: 'center' }); el.click(); return 'ok'; })()`);
  if (r !== 'ok') throw new Error(`click: ${r}`);
  await sleep(150);
};
const textOf = (sel) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);
/** A picture of one part of the page, the full width of the window, with its own overflow check. */
async function shot(name, sel, pad = 12) {
  const o = await evalJs(OVERFLOW);
  if (o.scrollW > o.vw || o.out.length) sideways.push({ name, ...o });
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; })()`);
  if (!box) {
    problems.push(`${name}: nothing on the page matches ${sel}`);
    return;
  }
  const vw = await evalJs('document.documentElement.clientWidth');
  // At the top of the page the sticky header sits above the part photographed, never across it.
  await evalJs('window.scrollTo(0, 0)');
  await sleep(150);
  const clip = { x: 0, y: Math.max(0, Math.round(box.y - pad)), width: vw, height: Math.round(box.h + 2 * pad), scale: 1 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo review-shots/f9o/${name}.png  ${clip.width} x ${clip.height}  (page width ${o.scrollW}, window ${o.vw})`);
}
const rpc = async (method, params) => {
  const r = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result;
};
/** Each hash's receipt: block, place in the block, status and target; sorted in the order they were mined. */
async function mined(hashes) {
  const out = [];
  for (const h of hashes) {
    const r = await rpc('eth_getTransactionReceipt', [h]);
    const t = await rpc('eth_getTransactionByHash', [h]);
    out.push({ hash: h, block: Number(r.blockNumber), index: Number(r.transactionIndex), status: r.status === '0x1' ? 'success' : 'failed', from: r.from, to: r.to, selector: t.input.slice(0, 10), gasUsed: Number(r.gasUsed) });
  }
  return out.sort((a, b) => a.block - b.block || a.index - b.index);
}
const SELECTORS = { '0x095ea7b3': 'UpTownToken.approve', '0x87517c45': 'Permit2.approve', '0x3593564c': 'UniversalRouter.execute' };
const word = (s) => SELECTORS[s] ?? s;
const call = async (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const pad = (a) => a.slice(2).toLowerCase().padStart(64, '0');

/** Picks a local test wallet the way a visitor does: the wallet button, then the wallet in the list. */
async function pick(address) {
  await click('.wallet-btn');
  await waitFor(`!!document.querySelector('[data-address="${address}"]')`, 10_000, 'the wallet list');
  await click(`[data-address="${address}"]`);
  await waitFor(`(document.querySelector('.wallet-btn')?.textContent ?? '').includes(${JSON.stringify(address.slice(0, 6))})`, 20_000, 'the wallet picked');
  await sleep(1500);
}
async function runResult(scope) {
  await waitFor(`(() => { const s = document.querySelector('${scope} .run-status'); return s && (s.dataset.run === 'done' || s.dataset.run === 'stopped'); })()`, 180_000, 'the run to finish');
  return evalJs(`(() => { const s = document.querySelector('${scope} .run-status'); return { run: s.dataset.run, hashes: s.dataset.hashes.split(',').filter(Boolean), error: s.dataset.error, text: s.innerText.replace(/\\s+/g, ' ').trim() }; })()`);
}
/** While a run goes on: photographs it at 1280 and at 390 px as soon as it shows the step given. */
async function during(scope, stepText, names, sel) {
  await waitFor(`(() => { const s = document.querySelector('${scope} .run-status'); return s && s.dataset.run === 'running' && s.innerText.includes(${JSON.stringify(stepText)}); })()`, 60_000, `the run at "${stepText}"`);
  const t = await textOf(`${scope} .run-status`);
  say(`   during the run: "${t}"`);
  await shot(names[0], sel, 16);
  await view(390);
  await shot(names[1], sel, 16);
  await view(1280);
}

const PAGES = ['', '#/trade', '#/trade/sell', '#/rewards', '#/stake', '#/stats', '#/docs', '#/owner'];
async function widths(label) {
  for (const w of [360, 375, 390]) {
    await view(w);
    const row = [];
    for (const p of PAGES) {
      await open(p);
      const o = await evalJs(OVERFLOW);
      const spare = await evalJs(`(() => { const r = document.querySelector('.header-row'); const s = getComputedStyle(r); let used = 0; for (const c of r.children) { if (getComputedStyle(c).display !== 'none') used += c.getBoundingClientRect().width; } const n = [...r.children].filter((c) => getComputedStyle(c).display !== 'none').length; return Math.round((r.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - used - (n - 1) * parseFloat(s.columnGap)) * 10) / 10; })()`);
      row.push(`${p || '#/'} ${o.scrollW}/${o.vw} (header room ${spare})`);
      if (o.scrollW !== o.vw || o.out.length) sideways.push({ name: `${label} ${w} ${p}`, ...o });
    }
    say(`   ${label}, ${w} px: ${row.join(' · ')}`);
  }
  await view(1280);
}

const file = JSON.parse(readFileSync(resolve('src/addresses/31337.json'), 'utf8'));
const TOWN = file.contracts.UpTownToken;
const PERMIT2 = file.uniswap.permit2;
const ROUTER = file.uniswap.universalRouter;
const STAKING = file.contracts.TownStaking;
// The two wallets, by their number in the local list (Test wallet N): the seller must have no approval
// for Permit2 or the router, the staker no vault and no approval for staking. Defaults: 5 and 3.
// "owner" names the owner's address, which the local wallet list also offers.
const SELLER_N = process.env.SELLER ?? '5';
const STAKER_N = process.env.STAKER ?? '3';
const SELLER = SELLER_N === 'owner' ? file.owner : file.testWallets[Number(SELLER_N) - 1];
const STAKER = STAKER_N === 'owner' ? file.owner : file.testWallets[Number(STAKER_N) - 1];
// WIDTHS_ONLY=1: only the page widths, with STAKER connected; no transaction.
const WIDTHS_ONLY = process.env.WIDTHS_ONLY === '1';
const balanceOf = async (a) => BigInt(await call(TOWN, `0x70a08231${pad(a)}`));
const allowance = async (a, s) => BigInt(await call(TOWN, `0xdd62ed3e${pad(a)}${pad(s)}`));
const routerAllowance = async (a) => {
  const r = (await call(PERMIT2, `0x927da105${pad(a)}${pad(TOWN)}${pad(ROUTER)}`)).slice(2);
  return { amount: BigInt('0x' + r.slice(0, 64)), expiration: Number(BigInt('0x' + r.slice(64, 128))) };
};

try {
  // ---- 1. Page widths without a wallet ----------------------------------------------------------
  say('== page width (scroll width / window) on every page, no wallet');
  await widths('no wallet');

  if (WIDTHS_ONLY) {
    await view(1280);
    await open('#/stake');
    await pick(STAKER);
    say(`== page width (scroll width / window) on every page, Test wallet ${STAKER_N} connected`);
    await widths(`Test wallet ${STAKER_N}`);
    throw 'done';
  }
  // ---- 2. The first sale, from a fresh wallet, from one press -----------------------------------
  await view(1280);
  await open('#/trade/sell');
  await pick(SELLER);
  say(`== the first sale: ${SELLER_N === 'owner' ? 'the owner wallet' : `Test wallet ${SELLER_N}`} ${SELLER}`);
  say(`   before: TOWN ${await balanceOf(SELLER)}, approval to Permit2 ${await allowance(SELLER, PERMIT2)}, router ${JSON.stringify(await routerAllowance(SELLER), (k, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
  await open('#/trade/sell');
  // The quick amounts on both sides.
  await shot('sell-quick-1280', 'section.swap-card', 16);
  await click('#trade-tab-buy');
  await waitFor("!!document.querySelector('#trade-panel-buy .quick-note') && /Keeps back/.test(document.querySelector('#trade-panel-buy .quick-note').textContent)", 20_000, 'the gas kept back');
  say(`   buy side: "${await textOf('#trade-panel-buy .quick-note')}" (data-keep ${await evalJs("document.querySelector('#trade-panel-buy .quick-note').dataset.keep")}, max fee per gas ${await evalJs("document.querySelector('#trade-panel-buy .quick-note').dataset.maxFee")} wei)`);
  await click('#trade-panel-buy .quick-btn:nth-child(4)');
  await sleep(600);
  say(`   buy 100% fills "${await evalJs("document.querySelector('#buy-eth').value")}" ETH; ${await textOf('#trade-panel-buy .swap-box .uses')}`);
  await shot('buy-quick-100-1280', 'section.swap-card', 16);
  await view(390);
  await shot('buy-quick-100-390', 'section.swap-card', 16);
  await view(1280);
  await click('#trade-tab-sell');
  await click('#trade-panel-sell .quick-btn:nth-child(1)');
  await sleep(600);
  say(`   sell 25% fills "${await evalJs("document.querySelector('#sell-town').value")}" TOWN; ${await textOf('#trade-panel-sell .swap-box .uses')}`);
  await view(390);
  await shot('sell-quick-25-390', 'section.swap-card', 16);
  await view(1280);
  // The amount for the sale, typed.
  await typeIn('#sell-town', process.env.SELL1 ?? '100,000');
  await waitFor("/\\d/.test(document.querySelector('#trade-panel-sell .swap-output').textContent) && document.querySelector('#trade-panel-sell .swap-output').textContent !== '0'", 30_000, 'the estimate');
  await sleep(800);
  const label = await textOf('#trade-panel-sell .sell-go');
  const plan = await textOf('#trade-panel-sell .run-plan');
  say(`   before the press: button "${label}"; "${plan}"`);
  if (label !== 'Approve and sell') problems.push(`first sale: the button reads "${label}"`);
  await shot('sell-before-1280', 'section.swap-card', 16);
  await view(390);
  await shot('sell-before-390', 'section.swap-card', 16);
  await view(1280);
  await click('#trade-panel-sell .sell-go');
  await during('#trade-panel-sell', 'step 2 of 3', ['sell-during-1280', 'sell-during-390'], 'section.swap-card');
  const first = await runResult('#trade-panel-sell');
  say(`   after: ${first.run}; "${first.text}"`);
  await sleep(1500);
  await shot('sell-after-1280', 'section.swap-card', 16);
  await view(390);
  await shot('sell-after-390', 'section.swap-card', 16);
  await view(1280);
  const m1 = await mined(first.hashes);
  say('   the first sale\'s transactions, in the order they were mined:');
  for (const t of m1) say(`     block ${t.block} #${t.index}  ${t.hash}  ${word(t.selector)}  ${t.status}  gas ${t.gasUsed}  from ${t.from}`);
  if (first.run !== 'done' || m1.length !== 3 || m1.map((t) => word(t.selector)).join(',') !== 'UpTownToken.approve,Permit2.approve,UniversalRouter.execute' || m1.some((t) => t.status !== 'success'))
    problems.push('the first sale did not run approve, allow and sell, in that order, all successful');
  if (!(m1[0].block < m1[1].block && m1[1].block < m1[2].block)) problems.push('the first sale\'s three transactions were not mined in three successive blocks');
  const after1 = { toPermit2: await allowance(SELLER, PERMIT2), router: await routerAllowance(SELLER) };
  say(`   approvals now: TOWN to Permit2 ${after1.toPermit2} (uint256 max: ${after1.toPermit2 === 2n ** 256n - 1n}); Permit2 to the router ${after1.router.amount} (uint160 max: ${after1.router.amount === 2n ** 160n - 1n}), expires ${after1.router.expiration}`);
  if (after1.toPermit2 !== 2n ** 256n - 1n || after1.router.amount !== 2n ** 160n - 1n) problems.push('the approvals are not the unlimited ones');

  // ---- 3. Buy more, then sell again: one transaction ----------------------------------------------
  say('== buy more TOWN with the same wallet, then sell again');
  await open('#/trade');
  await typeIn('#buy-eth', '0.05');
  await waitFor("/\\d/.test(document.querySelector('#trade-panel-buy .swap-output').textContent) && document.querySelector('#trade-panel-buy .swap-output').textContent !== '0'", 30_000, 'the buy estimate');
  await sleep(800);
  await click('#trade-panel-buy .btn-primary.btn-block');
  await waitFor("[...document.querySelectorAll('#trade-panel-buy .tx-status')].some((e) => e.dataset.phase === 'done' || e.dataset.phase === 'failed')", 120_000, 'the buy');
  const buyHash = await evalJs("document.querySelector('#trade-panel-buy .tx-status').dataset.hash");
  const buyPhase = await evalJs("document.querySelector('#trade-panel-buy .tx-status').dataset.phase");
  say(`   buy: ${buyPhase} ${buyHash}`);
  if (buyPhase !== 'done') problems.push('the buy did not go through');
  const held = await balanceOf(SELLER);
  say(`   TOWN held now ${held}; approvals: TOWN to Permit2 ${await allowance(SELLER, PERMIT2)}, router ${(await routerAllowance(SELLER)).amount}`);
  await open('#/trade/sell');
  await typeIn('#sell-town', process.env.SELL2 ?? '50,000');
  await waitFor("/\\d/.test(document.querySelector('#trade-panel-sell .swap-output').textContent) && document.querySelector('#trade-panel-sell .swap-output').textContent !== '0'", 30_000, 'the estimate');
  await sleep(800);
  const label2 = await textOf('#trade-panel-sell .sell-go');
  const plan2 = await textOf('#trade-panel-sell .run-plan');
  say(`   second sale, before the press: button "${label2}"; plan line: ${plan2 === null ? 'none' : `"${plan2}"`}`);
  await shot('sell-again-before-1280', 'section.swap-card', 16);
  await click('#trade-panel-sell .sell-go');
  const second = await runResult('#trade-panel-sell');
  const m2 = await mined(second.hashes);
  say(`   after: ${second.run}; "${second.text}"`);
  for (const t of m2) say(`     block ${t.block} #${t.index}  ${t.hash}  ${word(t.selector)}  ${t.status}  gas ${t.gasUsed}`);
  if (label2 !== 'Sell TOWN' || plan2 !== null || m2.length !== 1 || word(m2[0].selector) !== 'UniversalRouter.execute' || m2[0].status !== 'success') problems.push('the second sale was not a single transaction');
  await shot('sell-again-after-1280', 'section.swap-card', 16);

  // ---- 4. Approve, then open a vault, from one press ----------------------------------------------
  await open('#/stake');
  await pick(STAKER);
  say(`== approve, then stake: Test wallet ${STAKER_N} ${STAKER}; approval to staking before ${await allowance(STAKER, STAKING)}`);
  await open('#/stake');
  // A wallet with no vault opens one; a wallet with a vault adds to it. Both start with the approval.
  const adding = await evalJs("!!document.querySelector('#tab-add')");
  if (adding) {
    await click('#tab-add');
    await typeIn('#add-town', '50,000');
  } else await typeIn('#vault-town', '50,000');
  await sleep(600);
  const sLabel = await textOf('.stake-go');
  const sPlan = await textOf('.action-form .run-plan');
  say(`   before the press: button "${sLabel}"; "${sPlan}"`);
  const vaultCard = "[...document.querySelectorAll('section.card')].find((c) => c.querySelector('.card-title')?.textContent === 'Your vault')";
  await evalJs(`${vaultCard}.id = 'f9o-vault'`);
  await shot('stake-before-1280', '#f9o-vault', 16);
  await view(390);
  await shot('stake-before-390', '#f9o-vault', 16);
  await view(1280);
  await click('.stake-go');
  await during('#f9o-vault', 'step 2 of 2', ['stake-during-1280', 'stake-during-390'], '#f9o-vault');
  const st = await runResult('#f9o-vault');
  say(`   after: ${st.run}; "${st.text}"`);
  await sleep(1500);
  await evalJs(`(${vaultCard} ?? {}).id = 'f9o-vault'`);
  await shot('stake-after-1280', '#f9o-vault', 16);
  const m3 = await mined(st.hashes);
  for (const t of m3) say(`     block ${t.block} #${t.index}  ${t.hash}  ${t.selector === '0x095ea7b3' ? 'UpTownToken.approve' : t.selector}  ${t.status}  gas ${t.gasUsed}  to ${t.to}`);
  say(`   (${adding ? 'added TOWN to the wallet’s vault' : 'opened a vault'})`);
  if (st.run !== 'done' || m3.length !== 2 || m3[0].selector !== '0x095ea7b3' || m3.some((t) => t.status !== 'success') || !(m3[0].block < m3[1].block)) problems.push('approve-then-stake did not run approve, then the stake');
  say(`   approval to staking now ${await allowance(STAKER, STAKING)} (the exact amount is used up by the stake)`);

  // ---- 5. Page widths with a wallet connected -----------------------------------------------------
  say(`== page width (scroll width / window) on every page, Test wallet ${STAKER_N} connected`);
  await widths(`Test wallet ${STAKER_N}`);
} catch (e) {
  if (e !== 'done') problems.push(String(e?.stack ?? e));
}

say(`== hosts contacted by the page: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
say(`== policy violations: ${violations.length ? violations.join(' || ') : 'none'}`);
say(`== console messages: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
say(`== what this run found wrong: ${problems.length ? problems.join(' || ') : 'nothing'}`);

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
writeFileSync(join(OUT, 'proof-log.txt'), logLines.join('\n') + '\n');
const bad = violations.length || consoleMsgs.length || sideways.length || problems.length;
console.log(bad ? 'FAILED: see the lines above' : 'OK: the runs went through in order, no policy violation, no console message, no sideways scrolling');
process.exit(bad ? 1 : 0);
