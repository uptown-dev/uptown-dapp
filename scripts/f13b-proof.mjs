// F13b (CR-104) review driver: shows, in a real browser on the local chain, that a success message
// clears itself 2 seconds after the confirmation and an error stays, and that the site follows a
// switch of account at once.
//
//   VITE_CHAIN_ID=31337 npm run build      (the local chain running, launched and seeded)
//   node scripts/f13b-proof.mjs
//
// 1. A buy (0.01 ETH) and a stake (1,000 SKYLINE: approval, then stake) through the site's own forms
//    from Test wallet 1. These are real transactions on the private local chain (chain 31337),
//    sent the way the site always sends there: from the test wallet's address, without a key.
//    The time from the moment "Done." appears to the moment it is removed is measured inside the
//    page with a MutationObserver (performance.now(), microsecond clock).
// 2. An error that stays: a buy with a minimum far above the estimate, which the site's read-only
//    rehearsal refuses, so nothing is sent; the message is checked again 6 seconds later.
// 3. A switch of account through the site's local test-wallet menu: the owner to Test wallet 1 and
//    back, on the Stake page and on the Owner page; the time until the old account's figures and
//    the Owner link are gone, and until the new account's figures are shown, measured in the page.
//
// It serves dist/ with the hosting headers of vercel.json on 127.0.0.1:4331 (never 4173, 5173 or
// 8545) and drives headless Edge (debugging port 9431). Pictures and the log go to the git-ignored
// review-shots/f13b/proof/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createPublicClient, formatUnits, http } from 'viem';

const DIST = resolve('dist');
const OUT = resolve('review-shots/f13b/proof');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4331;
const DEBUG_PORT = 9431;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};
const problems = [];
const expect = (ok, what) => {
  if (!ok) problems.push(what);
  return ok;
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/index.html: run VITE_CHAIN_ID=31337 npm run build first');
const builtFor = readFileSync(join(DIST, 'index.html'), 'utf8').match(/connect-src ([^;"]+)/)?.[1].trim();
if (builtFor !== RPC) throw new Error(`dist/ is built for ${builtFor}, not ${RPC}: build for 31337 first`);
const addressFile = JSON.parse(readFileSync(resolve('src/addresses/31337.json'), 'utf8'));
const W1 = addressFile.testWallets[0];
const OWNER = addressFile.owner;
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// What the chain says, to compare with what the page shows.
const rpc = createPublicClient({ transport: http(RPC) });
const ERC20 = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }];
const STK = [{ type: 'function', name: 'stakeOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }];
const onChain = async (who) => {
  const [bal, stake] = await Promise.all([
    rpc.readContract({ address: addressFile.contracts.UpTownToken, abi: ERC20, functionName: 'balanceOf', args: [who] }),
    rpc.readContract({ address: addressFile.contracts.SkylineStaking, abi: STK, functionName: 'stakeOf', args: [who] }),
  ]);
  return { bal: Number(formatUnits(bal, 18)), stake: Number(formatUnits(stake, 18)) };
};
const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, '')));
const near = (shown, want) => shown !== null && Math.abs(shown - want) <= Math.max(1, want * 1e-9);

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
say(`serving dist/ (chain 31337) with the vercel.json headers on ${SITE}`);

// ---- the browser ---------------------------------------------------------------------------------
const profile = resolve(tmpdir(), 'uptown-f13b-proof-profile');
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
const consoleMsgs = [];
const hosts = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === 'Runtime.consoleAPICalled') consoleMsgs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  else if (m.method === 'Runtime.exceptionThrown') consoleMsgs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  else if (m.method === 'Network.requestWillBeSent') {
    const u = new URL(m.params.request.url);
    if (u.protocol.startsWith('http')) hosts.set(u.origin, (hosts.get(u.origin) ?? 0) + 1);
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
const waitFor = async (expr, ms = 30_000) => {
  for (let t = 0; t < ms; t += 50) {
    if (await evalJs(expr)) return true;
    await sleep(50);
  }
  return false;
};
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/** A photograph of the page from its top down to the bottom of `selector` (or the viewport). */
const shot = async (name, selector = null) => {
  await sleep(150);
  const bottom = selector
    ? await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 900; const r = el.getBoundingClientRect(); return Math.ceil(r.bottom + window.scrollY + 24); })()`)
    : 900;
  await evalJs('window.scrollTo(0, 0), 1');
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1280, height: Math.min(bottom, 4000), scale: 1 } });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`   photograph: review-shots/f13b/proof/${name}.png`);
};

const open = async (wallet, hash) => {
  await send('Page.navigate', { url: SITE });
  await waitFor('document.readyState === "complete"');
  await evalJs(`localStorage.setItem('uptown-local-wallet', '${wallet}'), 1`);
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await waitFor(`!!document.querySelector('.read-line[data-block]') && document.querySelector('.read-line').dataset.block !== ''`);
  await sleep(400);
};

// In the page: the life of the next success message, timed with a MutationObserver.
const WATCH = `window.__watch = () => new Promise((res) => {
  let el = null, at = 0, words = '';
  const sel = '.tx-status[data-phase="done"], .run-status[data-run="done"]';
  const tick = () => {
    if (!el) {
      const x = document.querySelector(sel);
      if (x) { el = x; at = performance.now(); words = x.innerText.replace(/\\s+/g, ' ').trim(); window.__doneSeen = true; }
    } else if (!el.isConnected || !el.matches(sel)) {
      obs.disconnect();
      res({ ms: Math.round(performance.now() - at), words });
    }
  };
  window.__doneSeen = false;
  const obs = new MutationObserver(tick);
  obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
}), 1`;
const typeIn = (sel, v) =>
  evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const click = (sel) => evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b || b.disabled) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);

let code = 1;
try {
  // ---- 1. A buy: "Done." then gone, timed ----
  say('\n== 1. a buy of 0.01 ETH from Test wallet 1, through the Trade page ==');
  await open(W1, '#/trade');
  await typeIn('#buy-eth', '0.01');
  await waitFor(`/\\d/.test(document.querySelector('#trade-panel-buy .swap-output').innerText.replace(/^0$/, '')) && !/…/.test(document.querySelector('#trade-panel-buy .swap-output').innerText)`);
  await sleep(300);
  await evalJs(WATCH);
  await evalJs('window.__buy = window.__watch(), 1');
  expect(await click('#trade-panel-buy .btn-primary'), 'the buy button could not be pressed');
  expect(await waitFor('window.__doneSeen === true', 60_000), 'the buy never showed "Done."');
  const buyHash = await evalJs(`document.querySelector('.tx-status[data-phase="done"]')?.dataset.hash ?? ''`);
  await shot('1a-buy-done', '#trade-panel-buy');
  const buy = await evalJs('window.__buy');
  say(`   the message: "${buy.words}"`);
  say(`   transaction ${buyHash}`);
  say(`   "Done." was on the page for ${buy.ms} ms, then removed by the site itself`);
  const buyGone = await evalJs(`!document.querySelector('#trade-panel-buy .tx-status')`);
  await shot('1b-buy-gone', '#trade-panel-buy');
  expect(buy.words.startsWith('Done. Your buy went through') && /^0x[0-9a-f]{64}$/.test(buyHash), 'the buy message is not the success message with its hash');
  expect(buy.ms >= 1_950 && buy.ms <= 2_300 && buyGone, `the buy message lasted ${buy.ms} ms`);

  // ---- 2. A stake (approve, then stake): the whole list, then gone, timed ----
  say('\n== 2. a stake of 1,000 SKYLINE from Test wallet 1 (approval, then stake), through the Stake page ==');
  await send('Page.navigate', { url: `${SITE}#/stake` });
  await waitFor(`!!document.querySelector('#stake-amount')`);
  await typeIn('#stake-amount', '1000');
  await sleep(300);
  const plan = await evalJs(`document.querySelector('.stake-go')?.innerText.trim()`);
  await evalJs(WATCH);
  await evalJs('window.__stake = window.__watch(), 1');
  expect(await click('.stake-go'), 'the stake button could not be pressed');
  expect(await waitFor('window.__doneSeen === true', 60_000), 'the stake never showed "Done."');
  const steps = await evalJs(`[...document.querySelectorAll('.run-status .run-step')].map((s) => s.dataset.step + '=' + s.dataset.state).join(', ')`);
  await shot('2a-stake-done', '.run-status');
  const stake = await evalJs('window.__stake');
  say(`   the button said "${plan}"; the finished list: ${steps || '(one transaction)'}`);
  say(`   the message: "${stake.words}"`);
  say(`   "Done." (with its list) was on the page for ${stake.ms} ms, then removed by the site itself`);
  await shot('2b-stake-gone', '.stake-go');
  expect(stake.words.includes('1,000 SKYLINE is staked'), 'the stake message is not the success message');
  expect(stake.ms >= 1_950 && stake.ms <= 2_300, `the stake message lasted ${stake.ms} ms`);

  // ---- 3. An error stays ----
  say('\n== 3. an error that stays: a buy whose minimum is far above the estimate (refused by the rehearsal; nothing sent) ==');
  await send('Page.navigate', { url: `${SITE}#/trade` });
  await waitFor(`!!document.querySelector('#buy-eth')`);
  await typeIn('#buy-eth', '0.01');
  await waitFor(`/\\d/.test(document.querySelector('#trade-panel-buy .swap-output').innerText.replace(/^0$/, '')) && !/…/.test(document.querySelector('#trade-panel-buy .swap-output').innerText)`);
  await typeIn('#buy-min', '999999999999');
  await sleep(300);
  expect(await click('#trade-panel-buy .btn-primary'), 'the buy button could not be pressed');
  expect(await waitFor(`document.querySelector('#trade-panel-buy .tx-status')?.dataset.phase === 'failed'`, 30_000), 'no error appeared');
  const errWords = await evalJs(`document.querySelector('#trade-panel-buy .tx-status').innerText.replace(/\\s+/g, ' ').trim()`);
  const t0 = Date.now();
  await sleep(6_000);
  const still = await evalJs(`document.querySelector('#trade-panel-buy .tx-status')?.dataset.phase ?? 'gone'`);
  say(`   the message: "${errWords}"`);
  say(`   ${Math.round((Date.now() - t0) / 100) / 10} s later it is still there: ${still === 'failed'}`);
  await shot('3-error-stays-6s-later', '#trade-panel-buy');
  expect(errWords.startsWith('Not done.') && still === 'failed', 'the error did not stay');

  // ---- 4. A switch of account, the Stake page and the Owner page ----
  say('\n== 4. a switch of account through the test-wallet menu: the owner → Test wallet 1 → the owner ==');
  const [chainOwner, chainW1] = await Promise.all([onChain(OWNER), onChain(W1)]);
  say(`   on chain: the owner holds ${chainOwner.bal} SKYLINE, staked ${chainOwner.stake}; Test wallet 1 holds ${chainW1.bal}, staked ${chainW1.stake}`);
  await open(OWNER, '#/stake');
  await waitFor(`!!document.querySelector('[data-view="SkylineStaking.stakeOf(wallet)"]')`);
  const FIGS = `(() => ({
    wallet: document.querySelector('.wallet-btn').innerText.trim(),
    ownerLink: !!document.querySelector('nav#site-nav a[href="#/owner"]'),
    staked: document.querySelector('[data-view="SkylineStaking.stakeOf(wallet)"] .num')?.innerText.trim() ?? null,
    skyline: document.querySelector('#stake-amount')?.closest('.field')?.querySelector('.hint .num')?.innerText.trim() ?? null,
    reading: document.querySelector('[data-reading-wallet]')?.dataset.readingWallet ?? null,
    h1: document.querySelector('main h1')?.textContent.trim() ?? '',
    ownerPage: !!document.querySelector('.owner-page'),
    forOwnerOnly: document.body.innerText.includes('For the owner wallet only'),
  }))()`;
  const before = await evalJs(FIGS);
  say(`   before (the owner): ${JSON.stringify(before)}`);
  await shot('4a-stake-owner-before', '.wallet-btn');
  await shot('4a-stake-owner-before-full', '.card:has(#stake-amount)');
  expect(before.ownerLink && near(num(before.staked), chainOwner.stake) && near(num(before.skyline), chainOwner.bal), 'the owner’s figures before the switch');

  // The switch, timed in the page: the menu is opened, Test wallet 1 picked, and every animation frame
  // checked until the owner's figures and link are gone, then until Test wallet 1's figures are shown.
  const SWITCH = (to, wantStaked) => `(async () => {
    document.querySelector('.wallet-btn').click();
    await new Promise((r) => setTimeout(r, 50));
    const t0 = performance.now();
    document.querySelector('.wallet-option[data-address="${to}"]').click();
    const f = () => ${FIGS};
    let goneAt = null, shownAt = null, first = null;
    for (let i = 0; i < 2000 && shownAt === null; i++) {
      await new Promise((r) => setTimeout(r, 2));
      const x = f();
      if (first === null) first = x;
      if (goneAt === null && x.wallet.includes('${short(to)}') && x.staked !== ${JSON.stringify(before.staked)} ) goneAt = performance.now() - t0;
      if (${wantStaked === null ? 'true' : `x.staked !== null && x.reading === null`}) shownAt = performance.now() - t0;
    }
    return { first, goneAt: Math.round(goneAt), shownAt: Math.round(shownAt), after: f() };
  })()`;
  const sw = await evalJs(SWITCH(W1, true));
  say(`   first frame after picking Test wallet 1: ${JSON.stringify(sw.first)}`);
  say(`   the owner's stake, balance and Owner link gone after ${sw.goneAt} ms; Test wallet 1's figures shown after ${sw.shownAt} ms`);
  say(`   after (Test wallet 1): ${JSON.stringify(sw.after)}`);
  await shot('4b-stake-wallet1-after', '.card:has(#stake-amount)');
  expect(!sw.first.ownerLink && sw.first.staked !== before.staked, 'the first frame after the switch still showed the owner');
  expect(!sw.after.ownerLink && near(num(sw.after.staked), chainW1.stake) && near(num(sw.after.skyline), chainW1.bal), 'Test wallet 1’s figures after the switch');

  // The moment in between, made visible: every network answer delayed by 2 seconds (Chrome's own
  // network emulation), Test wallet 1 → the owner, photographed while the owner's figures are on their way.
  await send('Network.emulateNetworkConditions', { offline: false, latency: 2_000, downloadThroughput: -1, uploadThroughput: -1 });
  await evalJs(`(async () => { document.querySelector('.wallet-btn').click(); await new Promise((r) => setTimeout(r, 50)); document.querySelector('.wallet-option[data-address="${OWNER}"]').click(); return 1; })()`);
  await sleep(300);
  const mid = await evalJs(FIGS);
  await shot('4b2-stake-switching-to-owner-reply-delayed', '.card:has(.connect-prompt)');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitFor(`document.querySelector('[data-view="SkylineStaking.stakeOf(wallet)"] .num')?.innerText.trim() === ${JSON.stringify(before.staked)}`);
  say(`   with every network answer delayed by 2 s, 0.3 s after picking the owner: ${JSON.stringify(mid)}`);
  expect(mid.reading === OWNER && mid.staked === null && mid.skyline === null && mid.ownerLink && mid.wallet.includes(short(OWNER)), 'the in-between state while the owner’s figures are read');
  await evalJs(`(async () => { document.querySelector('.wallet-btn').click(); await new Promise((r) => setTimeout(r, 50)); document.querySelector('.wallet-option[data-address="${W1}"]').click(); return 1; })()`);
  await waitFor(`document.querySelector('[data-view="SkylineStaking.stakeOf(wallet)"] .num')?.innerText.trim() === ${JSON.stringify(sw.after.staked)}`);

  // The Owner page: Test wallet 1 → the owner → Test wallet 1.
  await send('Page.navigate', { url: `${SITE}#/owner` });
  await sleep(500);
  const ownerClosed = await evalJs(FIGS);
  await shot('4c-owner-page-wallet1');
  const toOwner = await evalJs(`(async () => {
    document.querySelector('.wallet-btn').click();
    await new Promise((r) => setTimeout(r, 50));
    const t0 = performance.now();
    document.querySelector('.wallet-option[data-address="${OWNER}"]').click();
    for (let i = 0; i < 2000; i++) { await new Promise((r) => setTimeout(r, 2)); if (document.querySelector('.owner-page')) return Math.round(performance.now() - t0); }
    return null;
  })()`);
  const ownerOpen = await evalJs(FIGS);
  await shot('4d-owner-page-owner');
  const toW1 = await evalJs(`(async () => {
    document.querySelector('.wallet-btn').click();
    await new Promise((r) => setTimeout(r, 50));
    const t0 = performance.now();
    document.querySelector('.wallet-option[data-address="${W1}"]').click();
    for (let i = 0; i < 2000; i++) { await new Promise((r) => setTimeout(r, 2)); if (!document.querySelector('.owner-page') && document.body.innerText.includes('For the owner wallet only')) return Math.round(performance.now() - t0); }
    return null;
  })()`);
  const ownerClosedAgain = await evalJs(FIGS);
  await shot('4e-owner-page-wallet1-again');
  say(`   Owner page with Test wallet 1: ${ownerClosed.forOwnerOnly ? '"For the owner wallet only"' : 'OPEN'}; Owner link ${ownerClosed.ownerLink}`);
  say(`   picking the owner opened the page after ${toOwner} ms (Owner link ${ownerOpen.ownerLink}); picking Test wallet 1 closed it after ${toW1} ms (Owner link ${ownerClosedAgain.ownerLink})`);
  expect(ownerClosed.forOwnerOnly && !ownerClosed.ownerLink, 'the Owner page was open for Test wallet 1');
  expect(ownerOpen.ownerPage && ownerOpen.ownerLink && toOwner !== null && toOwner < 100, 'the Owner page did not open at once for the owner');
  expect(ownerClosedAgain.forOwnerOnly && !ownerClosedAgain.ownerLink && toW1 !== null && toW1 < 100, 'the Owner page did not close at once for Test wallet 1');

  say(`\n== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' | ') : 'none'}`);
  say(`== hosts contacted: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
  say(`== what this run found wrong: ${problems.length ? problems.join(' | ') : 'nothing'}`);
  code = problems.length || consoleMsgs.length ? 1 : 0;
} finally {
  writeFileSync(join(OUT, 'proof-log.txt'), logLines.join('\n') + '\n');
  try {
    ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
  } catch {}
  await sleep(800);
  edge.kill();
  server.close();
}
process.exit(code);
