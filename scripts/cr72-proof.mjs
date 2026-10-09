// CR-72 (F9i) review driver: the item-1 proof, the built-page policy check and the photographs.
// Local review only; nothing here runs in the site. Pictures and the log go to the git-ignored
// review-shots/f9i/.
//
// Usage, from frontend/ (the local chain running; two builds made beforehand):
//   VITE_CHAIN_ID=1 npm run build && cp -r dist <mainnetDir>
//   VITE_CHAIN_ID=31337 npm run build
//   node scripts/cr72-proof.mjs dist <mainnetDir>
//   (NO_SEND=1 skips the two local transactions; ONLY=policy,unlisted,stale,trade,owner,wallets runs those parts)
//
// - Serves each build on 127.0.0.1 (ports 4261 local, 4262 mainnet), every response with the headers
//   of vercel.json; the Content-Security-Policy header's connect-src is the build's own RPC origin.
// - Drives headless Edge over the DevTools protocol. Every policy violation (a listener added before
//   the page's scripts), console message, page error and DevTools issue is recorded, with each host
//   contacted.
// - The stand-in RPC: the Fetch domain pauses every request to http://127.0.0.1:8545, and this script
//   answers it after forwarding it to the real node. In "unlisted" mode the Treasury's staking()
//   answers STAND_IN, an address the site does not list, and reads of STAND_IN are served by the
//   real TownStaking, so the site sees a working staking contract at an unlisted address. Every
//   request naming STAND_IN outside a read (a transaction, a gas estimate, a direct call) is logged.
//   In "safe" mode the owner address answers as a Safe with Test wallets 1 and 2 as signers; in
//   "stale" mode the latest block's time is 5 minutes before this computer's clock.
// - Two stand-in wallets announce themselves (EIP-6963) on the mainnet build, with data: icons.
// - Sends only ordinary visitor transactions from local test wallets to the local chain (a claim and
//   an unstake in the listed TownStaking); never an anvil_* or evm_* method.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { decodeFunctionData, decodeFunctionResult, encodeAbiParameters, encodeFunctionResult, getAddress, toFunctionSelector } from 'viem';

const LOCAL_DIR = resolve(process.argv[2] || 'dist');
const MAINNET_DIR = process.argv[3] ? resolve(process.argv[3]) : null;
const OUT = resolve('review-shots/f9i');
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

const dep = JSON.parse(readFileSync(resolve('../script/deployments/31337.json'), 'utf8'));
const TREASURY = getAddress(dep.treasury);
const STAKING = getAddress(dep.townStaking);
const OWNER = getAddress(dep.owner);
const MULTICALL = getAddress(dep.multicall3);
const W = dep.testWallets.map((a) => getAddress(a));
const STAND_IN = getAddress('0x5e1f0000000000000000000000000000000c0ffe');
const SEL = { staking: toFunctionSelector('staking()'), getOwners: toFunctionSelector('getOwners()'), getThreshold: toFunctionSelector('getThreshold()') };
const AGG3 = [
  {
    type: 'function',
    name: 'aggregate3',
    stateMutability: 'payable',
    inputs: [{ name: 'calls', type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'allowFailure', type: 'bool' }, { name: 'callData', type: 'bytes' }] }],
    outputs: [{ name: 'returnData', type: 'tuple[]', components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }] }],
  },
];

// ---- the static servers ------------------------------------------------------------------------
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
const servers = [await serve(LOCAL_DIR, 4261, RPC)];
if (MAINNET_DIR) servers.push(await serve(MAINNET_DIR, 4262, 'https://ethereum-rpc.publicnode.com'));
const LOCAL = 'http://127.0.0.1:4261/';
const MAINNET = 'http://127.0.0.1:4262/';

// ---- the browser -------------------------------------------------------------------------------
const profile = resolve(tmpdir(), 'uptown-f9i-proof-profile');
rmSync(profile, { recursive: true, force: true });
const debugPort = 9381;
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
let mode = 'off';
const rpcLog = []; // every request naming STAND_IN outside a read, and every transaction
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

// The stand-in RPC (see the header).
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
function rewriteCall(params) {
  const [tx] = params;
  if (!same(tx?.to, MULTICALL) || !tx.data?.startsWith(toFunctionSelector(AGG3[0]))) return { params, fix: null };
  const { args } = decodeFunctionData({ abi: AGG3, data: tx.data });
  const calls = args[0].map((c) => ({ ...c }));
  const marks = [];
  calls.forEach((c, i) => {
    if (mode === 'unlisted' && same(c.target, STAND_IN)) {
      standInReads++;
      c.target = STAKING;
    }
    if (mode === 'unlisted' && same(c.target, TREASURY) && c.callData === SEL.staking) marks.push([i, encodeAbiParameters([{ type: 'address' }], [STAND_IN])]);
    if (mode === 'safe' && same(c.target, OWNER) && c.callData === SEL.getOwners) marks.push([i, encodeAbiParameters([{ type: 'address[]' }], [[W[0], W[1]]])]);
    if (mode === 'safe' && same(c.target, OWNER) && c.callData === SEL.getThreshold) marks.push([i, encodeAbiParameters([{ type: 'uint256' }], [2n])]);
  });
  const data = encodeFunctionDataAgg(calls);
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
function encodeFunctionDataAgg(calls) {
  return toFunctionSelector(AGG3[0]) + encodeAbiParameters(AGG3[0].inputs, [calls]).slice(2);
}
async function handleOne(msg) {
  const { method, params = [] } = msg;
  const to = params[0]?.to;
  if (['eth_sendTransaction', 'eth_estimateGas', 'eth_call', 'eth_sendRawTransaction'].includes(method)) {
    if (method === 'eth_sendTransaction') rpcLog.push(`${method} from ${params[0].from} to ${to} data ${String(params[0].data ?? params[0].input).slice(0, 10)}`);
    if (same(to, STAND_IN)) rpcLog.push(`NAMED THE STAND-IN: ${method} to ${to}`);
  }
  if (method.startsWith('anvil_') || method.startsWith('evm_')) throw new Error(`the page asked for ${method}`);
  let fwd = msg;
  let fix = null;
  if (method === 'eth_call' && mode !== 'off') {
    const r = rewriteCall(params);
    fwd = { ...msg, params: r.params };
    fix = r.fix;
  }
  if (mode === 'safe' && method === 'eth_getCode' && same(params[0], OWNER)) return { jsonrpc: '2.0', id: msg.id, result: '0x608060405236601057600e6013565b005b' };
  const res = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fwd) })).json();
  if (fix && res.result) res.result = fix(res.result);
  if (mode === 'stale' && method === 'eth_getBlockByNumber' && res.result) res.result.timestamp = `0x${(Math.floor(Date.now() / 1000) - 300).toString(16)}`;
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
const ICON_A = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#e2761b"/><path d="M6 8l6 8 6-8z" fill="#fff"/></svg>').toString('base64');
const ICON_B = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#3375bb"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg>').toString('base64');
const WALLETS = `(() => {
  window.__walletCalls = [];
  const mk = (uuid, name, rdns, icon, account) => {
    const provider = {
      request: async ({ method }) => {
        window.__walletCalls.push(name + ':' + method);
        if (method === 'eth_chainId') return '0x1';
        if (method === 'eth_accounts') return sessionStorage.getItem('granted-' + rdns) ? [account] : [];
        if (method === 'eth_requestAccounts') { sessionStorage.setItem('granted-' + rdns, '1'); return [account]; }
        return null;
      },
      on() {},
      removeListener() {},
    };
    return Object.freeze({ info: Object.freeze({ uuid, name, icon, rdns }), provider });
  };
  const list = [
    mk('11111111-1111-4111-8111-111111111111', 'Stand-in Wallet A', 'test.standin.a', ${JSON.stringify(ICON_A)}, '0x00000000000000000000000000000000000000a1'),
    mk('22222222-2222-4222-8222-222222222222', 'Stand-in Wallet B', 'test.standin.b', ${JSON.stringify(ICON_B)}, '0x00000000000000000000000000000000000000b2'),
  ];
  const announce = () => list.forEach((w) => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: w })));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();`;

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
async function open(base, page, wallet) {
  await send('Page.navigate', { url: `${base}#/${page}` });
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
  await sleep(900);
  await evalJs('document.fonts.ready.then(() => 1)');
}
const typeInto = (sel, v) =>
  evalJs(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const clickText = (scope, label) =>
  evalJs(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)} + ' button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (!b) return 'missing'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`);
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
const txDone = async (scope) => {
  for (let i = 0; i < 120; i++) {
    const p = await evalJs(`document.querySelector(${JSON.stringify(scope)} + ' .tx-status')?.dataset.phase ?? ''`);
    if (p === 'done' || p === 'failed') return evalJs(`(() => { const s = document.querySelector(${JSON.stringify(scope)} + ' .tx-status'); return s.dataset.phase + ' ' + s.dataset.hash + ' gas ' + s.dataset.gas + ' ' + s.innerText.replace(/\\s+/g, ' ').slice(0, 160); })()`);
    await sleep(500);
  }
  return 'timeout';
};
const textOf = (sel) => evalJs(`(document.querySelector(${JSON.stringify(sel)})?.innerText ?? '').replace(/\\s+/g, ' ').trim()`);
const call = async (to, data) => (await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) })).json()).result;

let code = 0;
/** ONLY=policy,unlisted,stale,trade,owner,wallets runs those sections; all by default. */
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const run = (s) => !ONLY || ONLY.includes(s);
try {
  // ---- 1. The built-page policy: all seven pages of the 31337 build, as the owner ----------------
  if (run('policy')) {
  say('== policy check: the 31337 build, all seven pages, owner wallet, real RPC');
  mode = 'off';
  await view(1280, 'light');
  for (const page of ['', 'trade', 'rewards', 'stake', 'stats', 'docs', 'owner']) {
    await open(LOCAL, page, OWNER);
    const h1 = await textOf('main h1');
    const block = await evalJs("document.querySelector('.read-line')?.dataset.block ?? ''");
    say(`  #/${page}: "${h1}", block ${block}`);
  }
  }

  if (run('unlisted')) {
  // ---- 2. Item 1: the treasury pays an address the site does not list -------------------------------
  say('== item 1: stand-in RPC answering Treasury.staking() with ' + STAND_IN);
  mode = 'unlisted';
  // The wallets, from the live chain: Test wallet 1's vault is kept (the component tests read it);
  // the claim goes from the first other wallet with a vault and earned WETH, the unstake from the
  // next wallet with a vault.
  const word = (a) => a.slice(2).toLowerCase().padStart(64, '0');
  const earnedOf = async (a) => BigInt(await call(STAKING, toFunctionSelector('earned(address)') + word(a)));
  const tierOf = async (a) => Number(BigInt('0x' + (await call(STAKING, toFunctionSelector('positionOf(address)') + word(a))).slice(2, 66)));
  const others = [];
  for (const [i, a] of W.entries()) if (i > 0) others.push({ label: `Test wallet ${i + 1}`, address: a, tier: await tierOf(a), earned: await earnedOf(a) });
  const claimer = others.find((x) => x.tier !== 0 && x.earned > 0n) ?? null;
  const unstaker = others.find((x) => x.tier !== 0 && x !== claimer) ?? null;
  say(`  wallets: ${others.map((x) => `${x.label} tier ${x.tier}, earned ${x.earned}`).join('; ')}`);
  const viewer = claimer ?? others.find((x) => x.tier !== 0) ?? { label: 'Test wallet 1', address: W[0] };
  for (const theme of ['light', 'dark']) {
    await view(1280, theme);
    await open(LOCAL, 'stake', viewer.address);
    await shot(`stake-unlisted-1280-${theme}`, '.notice');
  }
  await view(1280, 'light');
  await open(LOCAL, 'stake', viewer.address);
  const notice = await textOf('.notice');
  const vaultCard = await evalJs(`(() => { const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('.card-title')?.textContent === 'Your vault'); return { text: c.innerText.replace(/\\s+/g, ' ').slice(0, 260), buttons: c.querySelectorAll('button').length }; })()`);
  const oldCard = await evalJs(`(() => { const c = document.querySelector('.old-vault'); return c ? [...c.querySelectorAll('button')].map((b) => b.textContent.trim() + (b.disabled ? ' (off)' : ' (on)')).join(', ') : 'none'; })()`);
  const tierLine = await textOf('.card.flush .card-pad');
  say(`  as ${viewer.label}`);
  say(`  notice: ${notice}`);
  say(`  tier table: ${tierLine}`);
  say(`  "Your vault" card (the unlisted contract): ${vaultCard.buttons} buttons; ${vaultCard.text}`);
  say(`  card for the listed TownStaking: ${oldCard}`);
  await shot('stake-unlisted-old-vault-1280-light', '.old-vault');
  await shot('stake-unlisted-your-vault-1280-light', '.unlisted-off');
  const buttons = await evalJs(`[...document.querySelectorAll('main button')].map((b) => b.textContent.trim() + (b.disabled ? ' (off)' : '')).join(' | ')`);
  say(`  every button on the page: ${buttons}`);
  // Claim in the listed contract (a real transaction on the local chain, from a local test wallet).
  const sending = process.env.NO_SEND !== '1'; // NO_SEND=1: photographs and checks only, no transaction
  if (claimer && sending) {
    say(`  ${claimer.label} earned in TownStaking before: ${claimer.earned} wei`);
    say(`  click Claim in the listed contract: ${await clickText('.old-vault', 'Claim')}`);
    say(`  result: ${await txDone('.old-vault')}`);
    say(`  ${claimer.label} earned in TownStaking after: ${await earnedOf(claimer.address)} wei`);
  } else say(sending ? '  no wallet other than Test wallet 1 has a vault with earned WETH: claim not tried' : '  NO_SEND=1: claim not sent');
  // Unstake in the listed contract.
  if (unstaker && sending) {
    await open(LOCAL, 'stake', unstaker.address);
    say(`  ${unstaker.label} (tier ${unstaker.tier}), click Unstake everything in the listed contract: ${await clickText('.old-vault', 'Unstake everything')}`);
    await sleep(200);
    say(`  confirm: ${await clickText('.old-vault', 'Yes, unstake everything')}`);
    say(`  result: ${await txDone('.old-vault')}`);
    say(`  ${unstaker.label} tier in TownStaking after: ${await tierOf(unstaker.address)}`);
  } else say(sending ? '  no wallet other than Test wallet 1 and the claimer has a vault: unstake not tried' : '  NO_SEND=1: unstake not sent');
  say(`  reads served for the stand-in (inside multicalls): ${standInReads}`);
  const named = rpcLog.filter((l) => l.startsWith('NAMED'));
  say(`  requests naming the stand-in outside a read: ${named.length}${named.length ? ' ' + named.join('; ') : ''}`);
  say(`  transactions sent: ${rpcLog.filter((l) => l.startsWith('eth_sendTransaction')).join(' || ')}`);
  if (named.length) code = 1;
  // The owner page under the same stand-in.
  await open(LOCAL, 'owner', OWNER);
  await shot('owner-unlisted-1280-light', '#owner-staking-card');
  say(`  owner page, staking card: ${(await textOf('#owner-staking-card')).slice(0, 300)}`);
  }

  if (run('stale')) {
  // ---- 3. Item 5: the network service lags ------------------------------------------------------------
  say('== item 5: stand-in RPC whose latest block is 5 minutes old');
  mode = 'stale';
  for (const theme of ['light', 'dark']) {
    await view(1280, theme);
    await open(LOCAL, 'trade', W[0]);
    await shot(`stale-1280-${theme}`, '.read-line');
  }
  say(`  read line: ${await textOf('.read-line')}`);
  say(`  Buy button: ${await evalJs("[...document.querySelectorAll('#trade-panel-buy button')].find((b) => b.textContent.trim().startsWith('Buy TOWN'))?.disabled ? 'off' : 'on'")}`);
  mode = 'off';
  await open(LOCAL, 'trade', W[0]);
  say(`  real RPC (the local block is ahead of the clock): stale notice shown: ${await evalJs("!!document.querySelector('.stale-note')")}`);
  }

  if (run('trade')) {
  // ---- 4. Items 2 and 3 on the Trade page ----------------------------------------------------------------
  say('== items 2 and 3: Trade');
  for (const [width, theme] of [
    [1280, 'light'],
    [1280, 'dark'],
    [390, 'light'],
  ]) {
    await view(width, theme);
    await open(LOCAL, 'trade/sell', W[0]);
    await typeInto('#sell-town', '2,5');
    await sleep(300);
    await shot(`trade-sell-comma-${width}-${theme}`, '#sell-town');
    if (width === 1280 && theme === 'light') say(`  sell "2,5": ${(await textOf('#trade-panel-sell')).match(/Use a point[^.]*\.?\d*/)?.[0] ?? 'no message'}`);
    await open(LOCAL, 'trade', W[0]);
    for (let i = 0; i < 60 && !/\d/.test(await textOf('#trade-panel-buy .swap-output')); i++) await sleep(250);
    const est = BigInt((await textOf('#trade-panel-buy .swap-output')).replace(/,/g, ''));
    const min = (est * 94n) / 100n;
    await typeInto('#buy-min', min.toLocaleString('en-US'));
    await sleep(400);
    await shot(`trade-buy-min-6pc-${width}-${theme}`, '#buy-min');
    if (width === 1280 && theme === 'light') {
      say(`  buy estimate ${est.toLocaleString('en-US')} TOWN, minimum typed ${min.toLocaleString('en-US')} (94%): ${(await textOf('#trade-panel-buy')).match(/More than 5%[^.]*difference/)?.[0] ?? 'no warning'}; Buy ${await evalJs("[...document.querySelectorAll('#trade-panel-buy button')].find((b) => b.textContent.trim().startsWith('Buy TOWN')).disabled ? 'off' : 'on'")}`);
      await typeInto('#buy-min', '0');
      await sleep(300);
      say(`  minimum 0: ${(await textOf('#trade-panel-buy')).match(/The minimum received cannot be 0[^.]*\./)?.[0] ?? 'no message'}; Buy ${await evalJs("[...document.querySelectorAll('#trade-panel-buy button')].find((b) => b.textContent.trim().startsWith('Buy TOWN')).disabled ? 'off' : 'on'")}`);
      await shot('trade-buy-min-zero-1280-light', '#buy-min');
    }
  }
  }

  // ---- 5. Item 4: the Owner page, full addresses and the Safe panel's network ------------------------------
  if (run('owner')) {
  say('== item 4: Owner page, the owner answering as a Safe (signers Test wallets 1 and 2)');
  mode = 'safe';
  for (const theme of ['light', 'dark']) {
    await view(1280, theme);
    await open(LOCAL, 'owner', W[0]);
    await typeInto('#owner-offer-LPVault', W[1].toLowerCase());
    await sleep(200);
    await clickText('[data-action="transferOwnership-LPVault"]', 'Check:');
    for (let i = 0; i < 40 && !(await evalJs("!!document.querySelector('[data-action=\"transferOwnership-LPVault\"] .check-result')")); i++) await sleep(250);
    await shot(`owner-full-address-1280-${theme}`, '[data-action="transferOwnership-LPVault"] .check-result');
    await typeInto('#owner-rate', '12');
    await sleep(200);
    await clickText('[data-action="setSpendRate"]', 'Check:');
    for (let i = 0; i < 40 && !(await evalJs("!!document.querySelector('[data-action=\"setSpendRate\"] .confirm-panel')")); i++) await sleep(250);
    await clickText('[data-action="setSpendRate"]', 'Prepare in Safe');
    await sleep(300);
    await shot(`owner-safe-network-1280-${theme}`, '[data-action="setSpendRate"] .safe-panel');
    if (theme === 'light') {
      say(`  mode notice: ${(await textOf('.notice')).slice(0, 220)}`);
      say(`  check result: ${await textOf('[data-action="transferOwnership-LPVault"] .check-result')}`);
      say(`  Safe panel: ${(await textOf('[data-action="setSpendRate"] .safe-panel')).slice(0, 330)}`);
    }
  }
  mode = 'off';
  }

  // ---- 6. Item 6: the wallet picker on the mainnet build, two stand-in wallets ---------------------------
  if (MAINNET_DIR && run('wallets')) {
    say('== item 6: the mainnet build with two stand-in wallets (EIP-6963)');
    const inject = await send('Page.addScriptToEvaluateOnNewDocument', { source: WALLETS });
    for (const [width, theme] of [
      [1280, 'light'],
      [1280, 'dark'],
      [390, 'light'],
    ]) {
      await view(width, theme);
      await send('Page.navigate', { url: MAINNET });
      await sleep(400);
      await evalJs('sessionStorage.clear(), 1');
      await send('Page.reload', { ignoreCache: true });
      await sleep(1200);
      say(`  ${width} ${theme}: header button "${await textOf('.wallet-btn')}"; click: ${await clickText('.wallet-wrap', 'Connect wallet')}`);
      await sleep(300);
      await shot(`wallet-picker-${width}-${theme}`, null);
      if (width === 1280 && theme === 'light') {
        const icons = await evalJs(`[...document.querySelectorAll('.wallet-choice img')].map((i) => i.naturalWidth + 'x' + i.naturalHeight + ' ' + i.getAttribute('src').slice(0, 26)).join(', ')`);
        say(`  picker: ${await textOf('.wallet-menu')}; icons loaded: ${icons}`);
        await evalJs('window.__walletCalls.length = 0, 1');
        say(`  pick B: ${await clickText('.wallet-menu', 'Stand-in Wallet B')}`);
        await sleep(500);
        say(`  header now "${await textOf('.wallet-btn')}"; wallet calls after picking: ${await evalJs("window.__walletCalls.join(', ')")}`);
        await clickText('.wallet-wrap', '');
        await sleep(300);
        await shot('wallet-picked-1280-light', null);
        say(`  menu: ${await textOf('.wallet-menu')}; session storage choice: ${await evalJs("sessionStorage.getItem('uptown-wallet-choice')")}, local storage: ${await evalJs("localStorage.getItem('uptown-wallet-choice')")}`);
        await send('Page.reload', { ignoreCache: true });
        await sleep(1200);
        say(`  after a reload in the same visit: header "${await textOf('.wallet-btn')}"`);
      }
    }
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inject.result.identifier });
    say('  the mainnet build, all seven pages with the stand-in wallets, for the policy:');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: WALLETS });
    for (const page of ['', 'trade', 'rewards', 'stake', 'stats', 'docs', 'owner']) {
      await send('Page.navigate', { url: `${MAINNET}#/${page}` });
      await sleep(900);
      say(`    #/${page}: "${await textOf('main h1')}"`);
    }
  }
} catch (e) {
  say(`DRIVER ERROR: ${e.stack ?? e}`);
  code = 1;
} finally {
  say(`== policy violations reported by the pages: ${violations.length ? violations.join(' || ') : 'none'}`);
  say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
  say(`== DevTools issues: ${issues.length ? issues.join(' || ') : 'none'}`);
  say(`== hosts contacted: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
  say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
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
