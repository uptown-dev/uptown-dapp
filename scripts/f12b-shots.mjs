// CR-101 (F12b) review driver: the footer's OpenSea mark shows one message, the owner's words
// "Uptowners collection soon", on hover and on keyboard focus, and nothing else.
//
// On the build in dist/ it checks, at 1280, 1024, 390, 360 and 320 px, in light and dark:
//   - the OpenSea mark has no `title`, and nothing inside it has one, so the browser has no label of
//     its own to draw beside the site's bubble (a headless browser never paints that label, so its
//     absence is proved by the attribute's absence, not by a picture);
//   - it has no other name or description; its bubble is hidden from screen readers, and the text a
//     screen reader reads is exactly "OpenSea: Uptowners collection soon";
//   - with a real pointer resting on it, the bubble shows exactly "Uptowners collection soon" and
//     sits wholly inside the window and inside the footer, the page does not scroll sideways, the
//     bubble covers none of the other marks, and each of the other marks is still the thing a
//     click at its centre reaches;
//   - the same bubble shows with the keyboard on the mark, and Tab walks Telegram, GMGN, OpenSea;
//   - where the bubble would have been had it stayed centred under its mark (the F9q placement),
//     so the reason for lining it up with the mark's right edge is measured, not assumed;
//   - the links (X, Telegram, and GMGN now that the chain-1 address file names TOWN) keep their
//     `title`.
// It photographs the footer with the bubble showing, and the row drawn larger.
//
// Usage, from frontend/ (build dist/ first for the chain you want to look at):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f12b-shots.mjs 31337
//   VITE_CHAIN_ID=1     npm run build && node scripts/f12b-shots.mjs 1
//
// It serves the built site with the hosting headers of vercel.json on 127.0.0.1:4290 — never 4173,
// 5173 or 8545 — and drives headless Edge (debugging port 9390). It opens the home page, moves the
// pointer and the keyboard; it follows no link, connects no wallet and sends nothing anywhere. On
// the local build the page reads the local chain; on the mainnet build it makes the site's own
// read-only calls. Local review only; nothing here runs in the site. Pictures and the log go to the
// git-ignored review-shots/f12b/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const CHAIN = process.argv[2] ?? '31337';
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f12b/chain-${CHAIN}`);
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4290;
const DEBUG_PORT = 9390;
const PROFILE_NAME = 'uptown-f12b-shots-profile';
const MESSAGE = 'Uptowners collection soon';
const SPOKEN = `OpenSea: ${MESSAGE}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no dist/index.html: run VITE_CHAIN_ID=${CHAIN} npm run build first`);
const builtFor = /"chainId":\s*(\d+)/.exec(readFileSync(join(DIST, 'index.html'), 'utf8'))?.[1];
say(`dist/ built for chain ${builtFor ?? '(not named in index.html)'}; this run is for chain ${CHAIN}`);

// ---- the static server, with the hosting headers -------------------------------------------------
const vercel = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
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
say(`serving dist/ with the vercel.json headers on ${SITE}`);

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
let recording = true;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (!recording) return;
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

const problems = [];
const sideways = [];
const notes = [];

async function view(width, theme) {
  // 320 px is looked at as a narrow desktop window, not as a phone: at that width the header's tools
  // reach 23 px past the window (before and apart from this task), and a phone-sized window then
  // shows the whole wider page scaled to fit, which puts a mouse event somewhere other than where
  // the page says the mark is. 360 and 390 px, the widths the brief names, are phones.
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 && width !== 320 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
async function open() {
  await send('Page.navigate', { url: SITE });
  await sleep(900);
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('[data-place=\"OpenSea\"]')")) break;
    await sleep(250);
  }
  // Let the page finish reading its figures, so the footer does not move between a measurement and
  // its photograph. Not a check of this task: the figures are not what it is about.
  for (let i = 0; i < 120; i++) {
    if (await evalJs("!!document.querySelector('.read-line')?.dataset.block || !!document.querySelector('.footer-note') || !!document.querySelector('.notice')")) break;
    await sleep(250);
  }
  await sleep(600);
  await evalJs('document.fonts.ready.then(() => 1)');
}
// The page width against the window, and every element that reaches past the window's right edge
// without a clipping parent, so a sideways scroll can be traced to what causes it.
const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 0.5) { let p = el.parentElement, clipped = false; while (p && p !== document.body) { const s = getComputedStyle(p); if (['auto','hidden','scroll','clip'].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push({ el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(' ').filter(Boolean).join('.') : ''), right: Math.round(r.right), inFooter: !!el.closest('footer') }); } } return { scrollW: document.documentElement.scrollWidth, vw, scrollX: window.scrollX, visualScale: window.visualViewport ? Math.round(window.visualViewport.scale * 1000) / 1000 : null, out: out.slice(0, 8) }; })()`;

/** Everything about the OpenSea mark that decides how many messages it gives, and to whom. */
const SEA = `(() => {
  const m = document.querySelector('[data-place="OpenSea"]');
  const titled = [m, ...m.querySelectorAll('*')].filter((e) => e.hasAttribute('title') || e.tagName.toLowerCase() === 'title').map((e) => e.tagName.toLowerCase());
  const named = ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-description'].filter((a) => m.hasAttribute(a));
  const out = [];
  const walk = (n) => { if (n.nodeType === 3) out.push(n.textContent); else if (n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true') n.childNodes.forEach(walk); };
  walk(m);
  const bubbles = [...m.querySelectorAll('.place-word')];
  return {
    tag: m.tagName.toLowerCase(),
    href: m.getAttribute('href'),
    role: m.getAttribute('role'),
    tabindex: m.getAttribute('tabindex'),
    title: m.getAttribute('title'),
    titledInside: titled,
    named,
    bubbles: bubbles.map((b) => ({ text: b.textContent, ariaHidden: b.getAttribute('aria-hidden') })),
    heard: out.join('').replace(/\\s+/g, ' ').trim(),
    links: [...document.querySelectorAll('.footer-places a.place')].map((a) => ({ place: a.dataset.place, title: a.getAttribute('title'), href: a.getAttribute('href') })),
  };
})()`;

/** Where the bubble is, against the window, the footer, the other marks and its own mark. */
const BUBBLE = `(() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10, top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
  const m = document.querySelector('[data-place="OpenSea"]');
  const w = m.querySelector('.place-word');
  const wb = w.getBoundingClientRect();
  const mb = m.getBoundingClientRect();
  const fb = document.querySelector('footer.site-footer').getBoundingClientRect();
  const wrap = document.querySelector('footer.site-footer .wrap') ?? document.querySelector('footer.site-footer');
  const cs = getComputedStyle(wrap);
  const contentRight = wrap.getBoundingClientRect().right - parseFloat(cs.paddingRight);
  const vw = document.documentElement.clientWidth;
  const others = [...document.querySelectorAll('.footer-places .place')].filter((e) => e !== m);
  const overlaps = others.filter((o) => { const b = o.getBoundingClientRect(); return !(b.right <= wb.left || b.left >= wb.right || b.bottom <= wb.top || b.top >= wb.bottom); }).map((o) => o.dataset.place);
  // Each other mark is still what a click at its centre reaches.
  const reach = others.map((o) => { const b = o.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { place: o.dataset.place, reached: !!hit && (hit === o || o.contains(hit)) }; });
  // What F9q's centred placement would have given with these words: the same width, centred on the mark.
  const centre = mb.left + mb.width / 2;
  const centred = { left: Math.round((centre - wb.width / 2) * 10) / 10, right: Math.round((centre + wb.width / 2) * 10) / 10 };
  return {
    text: w.textContent,
    opacity: getComputedStyle(w).opacity,
    bubble: r(w),
    mark: r(m),
    vw,
    footer: { left: Math.round(fb.left), right: Math.round(fb.right), bottom: Math.round(fb.bottom) },
    contentRight: Math.round(contentRight * 10) / 10,
    insideWindow: wb.left >= 0 && wb.right <= vw,
    insideFooter: wb.bottom <= fb.bottom && wb.top >= fb.top,
    roomBelow: Math.round(fb.bottom - wb.bottom),
    rightEdgeToMark: Math.round((mb.right - wb.right) * 10) / 10,
    overlaps,
    reach,
    centred: { ...centred, pastWindow: Math.max(0, Math.round((centred.right - vw) * 10) / 10), pastContent: Math.max(0, Math.round((centred.right - contentRight) * 10) / 10) },
    lines: w.getClientRects().length,
  };
})()`;

async function shot(name, sel, padTop, padBottom) {
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e.getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; })()`);
  const vw = await evalJs('document.documentElement.clientWidth');
  const clip = { x: 0, y: Math.max(0, Math.round(box.y - padTop)), width: vw, height: Math.round(box.h + padTop + padBottom), scale: 1 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`   photo ${name}.png  ${clip.width} x ${clip.height}`);
}
async function closeUp(name, sel, pad, below, scale = 3) {
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  const vw = await evalJs('document.documentElement.clientWidth');
  const x = Math.max(0, box.x - pad);
  const clip = { x, y: Math.max(0, box.y - pad), width: Math.min(vw - x, box.w + 2 * pad), height: box.h + pad + below, scale };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`   photo ${name}.png  (${Math.round(clip.width)} x ${Math.round(clip.height)} css pixels, drawn ${scale} times larger)`);
}
async function restNothing() {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, buttons: 0 });
  await evalJs('document.activeElement?.blur?.(), 1');
  await sleep(200);
}
/** Scrolls the footer into view and returns the OpenSea mark's centre, in window coordinates. */
async function seaCentre() {
  return await evalJs(`(() => { document.querySelector('footer.site-footer').scrollIntoView({ block: 'end' }); const r = document.querySelector('[data-place="OpenSea"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
}

function judge(label, b) {
  say(`   ${label}: ${JSON.stringify(b)}`);
  if (b.text !== MESSAGE) problems.push(`${label}: the bubble says "${b.text}"`);
  if (b.opacity !== '1') problems.push(`${label}: the bubble is at opacity ${b.opacity}`);
  if (!b.insideWindow) problems.push(`${label}: the bubble reaches past the window (${JSON.stringify(b.bubble)}, window ${b.vw})`);
  if (!b.insideFooter) problems.push(`${label}: the bubble reaches past the footer (${JSON.stringify(b.bubble)}, footer ${JSON.stringify(b.footer)})`);
  if (b.overlaps.length) problems.push(`${label}: the bubble covers ${b.overlaps.join(', ')}`);
  if (!b.reach.every((x) => x.reached)) problems.push(`${label}: a click no longer reaches ${b.reach.filter((x) => !x.reached).map((x) => x.place).join(', ')}`);
  if (b.lines !== 1) problems.push(`${label}: the words break over ${b.lines} lines`);
}

// ---- every width, both themes ----------------------------------------------------------------------
const MATRIX = [
  [1280, 'light'],
  [1280, 'dark'],
  [1024, 'light'],
  [1024, 'dark'],
  [390, 'light'],
  [390, 'dark'],
  [360, 'light'],
  [360, 'dark'],
  [320, 'dark'],
];
// An optional second argument limits the run to some widths, e.g. `node scripts/f12b-shots.mjs 31337 320`.
const ONLY = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
for (const [width, theme] of MATRIX.filter(([w]) => !ONLY || ONLY.includes(w))) {
  await view(width, theme);
  await open();
  say(`== ${width} px, ${theme}`);

  const sea = await evalJs(SEA);
  say(`   the mark: ${JSON.stringify(sea)}`);
  if (sea.tag !== 'span' || sea.href !== null) problems.push(`${width} ${theme}: OpenSea is a ${sea.tag} with href ${sea.href}`);
  if (sea.title !== null || sea.titledInside.length) problems.push(`${width} ${theme}: OpenSea still carries a title (${sea.title}; inside: ${sea.titledInside.join(', ')})`);
  if (sea.named.length) problems.push(`${width} ${theme}: OpenSea has ${sea.named.join(', ')}`);
  if (sea.bubbles.length !== 1 || sea.bubbles[0].text !== MESSAGE || sea.bubbles[0].ariaHidden !== 'true') problems.push(`${width} ${theme}: bubbles ${JSON.stringify(sea.bubbles)}`);
  if (sea.heard !== SPOKEN) problems.push(`${width} ${theme}: a screen reader hears "${sea.heard}"`);
  if (sea.tabindex !== '0' || sea.role !== 'note') problems.push(`${width} ${theme}: tabindex ${sea.tabindex}, role ${sea.role}`);
  for (const l of sea.links) if (!l.title) problems.push(`${width} ${theme}: the link ${l.place} lost its title`);

  const before = await evalJs(`getComputedStyle(document.querySelector('[data-place="OpenSea"] .place-word')).opacity`);
  if (before !== '0') problems.push(`${width} ${theme}: the bubble shows before anything rests on the mark (opacity ${before})`);
  const o0 = await evalJs(OVERFLOW);
  if (o0.scrollW > o0.vw) {
    if (o0.out.some((x) => x.inFooter)) sideways.push({ name: `${width} ${theme} at rest`, ...o0 });
    else notes.push(`${width} ${theme}: the page is ${o0.scrollW} px wide in a ${o0.vw} px window at rest, before anything rests on the mark, from outside the footer: ${JSON.stringify(o0.out)}`);
  }

  // The pointer, a real mouse move so :hover applies. The page keeps reading the chain and can
  // re-render above the footer, which moves the mark between the measurement and the move; so the
  // move is repeated until the browser itself says the pointer rests on the mark.
  let hovered = false;
  let tries = 0;
  for (; tries < 6 && !hovered; tries++) {
    const c = await seaCentre();
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, buttons: 0 });
    await sleep(300);
    hovered = await evalJs(`document.querySelector('[data-place="OpenSea"]').matches(':hover')`);
    if (!hovered) {
      const at = await evalJs(`(() => { const e = document.elementFromPoint(${c.x}, ${c.y}); const h = [...document.querySelectorAll(':hover')].pop(); return { at: e ? e.tagName.toLowerCase() + '.' + String(e.className) : null, hovering: h ? h.tagName.toLowerCase() + '.' + String(h.className) : null, scrollY: Math.round(scrollY), innerW: innerWidth, vvW: visualViewport?.width }; })()`);
      say(`   move ${tries + 1} to ${JSON.stringify(c)} did not rest on the mark: ${JSON.stringify(at)}`);
    }
  }
  say(`   the pointer rests on OpenSea: ${hovered} (after ${tries} move${tries === 1 ? '' : 's'})`);
  if (!hovered) problems.push(`${width} ${theme}: the pointer could not be rested on OpenSea`);
  const h = await evalJs(BUBBLE);
  judge(`${width} ${theme}, the pointer on OpenSea`, h);
  const o1 = await evalJs(OVERFLOW);
  // The bubble must add nothing to the page's width. A sideways overflow that is there already at
  // rest, and comes from outside the footer, is not this task's and is reported, not counted.
  if (o1.scrollW > o0.scrollW || o1.scrollX !== 0 || o1.out.some((x) => x.inFooter)) sideways.push({ name: `${width} ${theme} with the bubble showing`, ...o1 });
  say(`   page width at rest: ${JSON.stringify(o0)}`);
  say(`   page width with the bubble showing: ${JSON.stringify(o1)}`);
  await shot(`footer-${width}-${theme}-hover`, 'footer.site-footer', 8, 8);
  await closeUp(`places-${width}-${theme}-hover-x3`, '.footer-places', 12, 40);
  await restNothing();

  // The keyboard.
  await evalJs(`(() => { document.querySelector('footer.site-footer').scrollIntoView({ block: 'end' }); document.querySelector('[data-place="OpenSea"]').focus(); return 1; })()`);
  await sleep(250);
  const f = await evalJs(BUBBLE);
  const where = await evalJs("(() => { const a = document.activeElement; return { place: a.dataset?.place ?? null, outline: getComputedStyle(a).outlineWidth + ' ' + getComputedStyle(a).outlineStyle }; })()");
  say(`   the keyboard is on: ${JSON.stringify(where)}`);
  if (where.place !== 'OpenSea') problems.push(`${width} ${theme}: focus did not reach OpenSea (${JSON.stringify(where)})`);
  judge(`${width} ${theme}, the keyboard on OpenSea`, f);
  if (width === 1280 || width === 360) await closeUp(`places-${width}-${theme}-focus-x3`, '.footer-places', 12, 40);
  await restNothing();
}

// ---- a real Tab walk along the row --------------------------------------------------------------------
await view(1280, 'light');
await open();
say('== a keyboard walking the row with Tab, from Telegram');
await evalJs("(() => { const e = document.querySelector('[data-place=\"Telegram\"]'); e.scrollIntoView({ block: 'center' }); e.focus(); return 1; })()");
const walk = [];
for (let i = 0; i < 2; i++) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await sleep(250);
  walk.push(
    await evalJs(
      "(() => { const a = document.activeElement; const w = a.querySelector?.('.place-word'); return { tag: a.tagName.toLowerCase(), place: a.dataset?.place ?? null, title: a.getAttribute('title'), bubble: w ? w.textContent + ' at opacity ' + getComputedStyle(w).opacity : null }; })()",
    ),
  );
}
say(`   Tab reaches: ${JSON.stringify(walk)}`);
if (walk[1]?.place !== 'OpenSea' || walk[1]?.bubble !== `${MESSAGE} at opacity 1` || walk[1]?.title !== null) problems.push(`Tab reached ${JSON.stringify(walk)}`);
await closeUp('places-1280-light-tab-x3', '.footer-places', 12, 40);
await restNothing();

say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
say(`== hosts contacted: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
say(`== noted, outside this task: ${notes.length ? notes.join(' || ') : 'nothing'}`);
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
console.log(bad ? 'FAILED: see the lines above' : 'OK: one message, "Uptowners collection soon", on hover and on focus; no title; inside the window and the footer at every width; no policy violation, no console message, no sideways scrolling');
process.exit(bad ? 1 : 0);
