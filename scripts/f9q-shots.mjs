// SUPERSEDED by scripts/f9r-shots.mjs (CR-87, F9r). This driver is kept as the record of F9q's own
// review. It checks CR-84's dimmed OpenSea mark and the row under the page links, both of which
// CR-87 reversed, so running it against today's site reports those two as faults. Use f9r-shots.mjs.
//
// CR-84 (F9q) review driver: photographs the footer's row of four platform marks on the build in
// dist/, reads back what each mark is (link or dimmed mark, its address, its name for a screen
// reader, its word), and measures every page's width at the three narrow widths. Local review
// only; nothing here runs in the site. Pictures and the log go to the git-ignored review-shots/f9q/.
//
// Usage, from frontend/ (build dist/ first for the chain you want to look at):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9q-shots.mjs 31337
//   VITE_CHAIN_ID=1     npm run build && node scripts/f9q-shots.mjs 1
//   VITE_CHAIN_ID=11155111 npm run build && node scripts/f9q-shots.mjs 11155111
//
// It serves the built site with the hosting headers of vercel.json on 127.0.0.1:4274 — never 4173,
// 5173 or 8545 — drives headless Edge, and reports every policy violation, console message and
// sideways scroll it sees. It opens pages, rests the pointer on a dimmed mark and moves the
// keyboard to one; it follows no link, connects no wallet and sends nothing anywhere.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';

const CHAIN = process.argv[2] ?? '31337';
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f9q/chain-${CHAIN}`);
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4274;
const DEBUG_PORT = 9394;
const DEV_PORT = 4275;
const PROFILE_NAME = 'uptown-f9q-shots-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no dist/index.html: run VITE_CHAIN_ID=${CHAIN} npm run build first`);
say(`dist/index.html connect-src: ${/connect-src ([^;]+)/.exec(readFileSync(join(DIST, 'index.html'), 'utf8'))?.[1] ?? '(none)'}`);

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
// False while the development server's test-gallery page is open: that page is not the built site.
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

const OVERFLOW = `(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 0.5) { let p = el.parentElement, clipped = false; while (p) { const s = getComputedStyle(p); if (['auto','hidden','scroll'].includes(s.overflowX) && p.getBoundingClientRect().right <= vw + 0.5) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ').join('.') + ' ' + Math.round(r.right)); } } return { scrollW: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) }; })()`;
const sideways = [];
const problems = [];

/** Every mark in the footer row, in page order: what it is, where it goes, and how it is drawn. */
const MARKS = `(() => {
  const round = (n) => Math.round(n * 100) / 100;
  const row = document.querySelector('.footer-places');
  if (!row) return null;
  return {
    head: row.querySelector('.footer-head')?.textContent ?? null,
    rowBox: (() => { const r = row.querySelector('.place-row').getBoundingClientRect(); return round(r.width) + ' x ' + round(r.height); })(),
    lines: new Set([...row.querySelectorAll('.place')].map((e) => Math.round(e.getBoundingClientRect().top))).size,
    marks: [...row.querySelectorAll('li > *')].map((el) => {
      const svg = el.querySelector('svg');
      const word = el.querySelector('.place-word');
      const hidden = el.querySelector('.visually-hidden');
      const b = el.getBoundingClientRect();
      return {
        place: el.dataset.place,
        tag: el.tagName.toLowerCase(),
        href: el.getAttribute('href'),
        target: el.getAttribute('target'),
        rel: el.getAttribute('rel'),
        title: el.getAttribute('title'),
        aria: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        tabindex: el.getAttribute('tabindex'),
        shapes: svg ? svg.querySelectorAll('path, rect, circle').length : 0,
        remote: svg ? [...svg.querySelectorAll('*')].some((n) => /^(image|use)$/.test(n.tagName.toLowerCase())) : null,
        box: round(b.width) + ' x ' + round(b.height),
        glyphOpacity: svg ? getComputedStyle(svg).opacity : null,
        colour: getComputedStyle(el).color,
        borderStyle: getComputedStyle(el).borderTopStyle,
        word: word ? word.textContent : null,
        wordShown: word ? getComputedStyle(word).opacity : null,
        forScreenReader: hidden ? hidden.textContent.replace(/\\s+/g, ' ').trim() : null,
      };
    }),
    images: [...document.images].map((i) => i.currentSrc || i.src).filter((s) => s && !s.startsWith('data:') && !s.startsWith(location.origin)),
    // Nothing of GMGN anywhere in the page until TOWN exists on Ethereum (the owner, 11 Oct 2026).
    gmgn: (() => {
      const html = document.documentElement.innerHTML;
      const bad = [];
      if (document.querySelector('[data-place="GMGN"]')) bad.push('a GMGN mark');
      if (document.querySelector('[href*="gmgn"]')) bad.push('a gmgn address');
      if (/gmgn/i.test(html)) bad.push('the word gmgn in the page');
      if (/at launch/i.test(html)) bad.push('the words "at launch" in the page');
      return bad.length ? bad : null;
    })(),
  };
})()`;

/** The word a dimmed mark shows, read while the pointer rests on it or the keyboard is on it. */
const wordNow = (place) =>
  `(() => { const e = document.querySelector('[data-place="${place}"] .place-word'); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent, opacity: getComputedStyle(e).opacity, box: Math.round(r.width) + ' x ' + Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right) }; })()`;

async function view(width, theme) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}
/** Opens a page and waits for its figures (or the "not deployed" note on a chain with no deployment). */
async function open(hash = '') {
  await send('Page.navigate', { url: `${SITE}${hash}` });
  await sleep(900);
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('.footer-places')")) break;
    await sleep(250);
  }
  let read = false;
  for (let i = 0; i < 200; i++) {
    read = await evalJs("!!document.querySelector('.read-line')?.dataset.block || !!document.querySelector('.footer-note')");
    if (read) break;
    await sleep(250);
  }
  if (!read) problems.push(`the figures were not read within 50 seconds (${hash || 'home'})`);
  await sleep(500);
  await evalJs('document.fonts.ready.then(() => 1)');
}
/** A picture of one part of the page, with its own overflow check. */
async function shot(name, sel, pad = 12) {
  const o = await evalJs(OVERFLOW);
  if (o.scrollW > o.vw || o.out.length) sideways.push({ name, ...o });
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; })()`);
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
/** One part drawn four times larger, to read the drawings and the word. */
async function closeUp(name, sel, pad = 10) {
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  if (!box) {
    problems.push(`${name}: nothing on the page matches ${sel}`);
    return;
  }
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + 2 * pad, height: box.h + 2 * pad, scale: 4 };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png  (${Math.round(clip.width)} x ${Math.round(clip.height)} css pixels, drawn four times larger)`);
}
/** The row's own report, checked as it is read. */
async function report(label) {
  const m = await evalJs(MARKS);
  if (!m) {
    problems.push(`${label}: there is no .footer-places row on the page`);
    return null;
  }
  say(`   ${label}: head "${m.head}", row ${m.rowBox}, on ${m.lines} line(s)`);
  for (const k of m.marks) say(`      ${JSON.stringify(k)}`);
  const order = m.marks.map((k) => k.place).join(',');
  // Today the site's chain-1 address file names no TOWN, so there is no GMGN mark at all.
  if (order !== 'X,Telegram,OpenSea') problems.push(`${label}: the marks are in the order ${order}`);
  if (m.gmgn) problems.push(`${label}: the page still holds GMGN: ${JSON.stringify(m.gmgn)}`);
  const by = Object.fromEntries(m.marks.map((k) => [k.place, k]));
  for (const [place, href, what] of [
    ['X', 'https://x.com/UpTownHook', 'UpTown on X'],
    ['Telegram', 'https://t.me/uptownhook', 'UpTown on Telegram'],
  ]) {
    const k = by[place];
    if (!k) problems.push(`${label}: no ${place} mark`);
    else if (k.tag !== 'a' || k.href !== href || k.target !== '_blank' || k.rel !== 'noopener noreferrer' || k.aria !== `${what} (opens in a new tab)`) {
      problems.push(`${label}: the ${place} mark is ${JSON.stringify(k)}`);
    }
  }
  {
    const k = by.OpenSea;
    if (!k) problems.push(`${label}: no OpenSea mark`);
    else if (k.tag === 'a' || k.href !== null || k.word !== 'soon' || k.tabindex !== '0' || k.forScreenReader !== 'OpenSea: soon') {
      problems.push(`${label}: the dimmed OpenSea mark is ${JSON.stringify(k)}`);
    } else if (k.wordShown !== '0') problems.push(`${label}: the OpenSea mark's word is showing before the pointer or the keyboard reaches it (opacity ${k.wordShown})`);
  }
  for (const k of m.marks) {
    if (k.shapes === 0) problems.push(`${label}: the ${k.place} mark draws no shape`);
    if (k.remote) problems.push(`${label}: the ${k.place} mark loads something from elsewhere`);
  }
  // A live mark must be plainly stronger than the dimmed one.
  const glyph = Number(by.OpenSea?.glyphOpacity ?? 1);
  say(`      the live marks' colour ${by.X?.colour} against the dimmed ${by.OpenSea?.colour}; the dimmed drawing at opacity ${glyph}`);
  if (glyph >= 0.9) problems.push(`${label}: the OpenSea mark is not dimmed (glyph opacity ${glyph})`);
  if (Number(by.X?.glyphOpacity ?? 0) !== 1) problems.push(`${label}: a live mark is dimmed (glyph opacity ${by.X?.glyphOpacity})`);
  if (m.images.length) problems.push(`${label}: the page loads pictures from elsewhere: ${m.images.join(', ')}`);
  return m;
}
/** Rests the pointer on a mark (a real mouse move, so :hover applies) and reads its word. */
async function hover(place) {
  const box = await evalJs(`(() => { const e = document.querySelector('[data-place="${place}"]'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 });
  await sleep(250);
  return await evalJs(wordNow(place));
}
/** Moves the keyboard to a mark (focus, as a Tab would) and reads its word. */
async function focus(place) {
  await evalJs(`(() => { const e = document.querySelector('[data-place="${place}"]'); e.scrollIntoView({ block: 'center' }); e.focus(); return 1; })()`);
  await sleep(250);
  const where = await evalJs("(() => { const a = document.activeElement; return { tag: a.tagName.toLowerCase(), place: a.dataset?.place ?? null, outline: getComputedStyle(a).outlineWidth + ' ' + getComputedStyle(a).outlineStyle }; })()");
  return { where, word: await evalJs(wordNow(place)) };
}
/** Takes the pointer and the keyboard off the row again. */
async function restNothing() {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4, buttons: 0 });
  await evalJs('document.activeElement?.blur?.(), 1');
  await sleep(200);
}

// ---- the footer at the three widths, in both themes ----------------------------------------------
for (const [width, theme] of [
  [1280, 'light'],
  [1280, 'dark'],
  [390, 'light'],
  [390, 'dark'],
  [360, 'light'],
  [360, 'dark'],
]) {
  await view(width, theme);
  await open();
  say(`== the footer at ${width} px, ${theme}`);
  await report(`footer ${width} ${theme}`);
  await shot(`footer-${width}-${theme}`, 'footer.site-footer', 10);
  await shot(`places-${width}-${theme}`, '.footer-places', 14);
  await closeUp(`places-${width}-${theme}-x4`, '.place-row');

  // The word, with the pointer resting on OpenSea and then with the keyboard on it.
  const h = await hover('OpenSea');
  say(`   the pointer resting on OpenSea: ${JSON.stringify(h)}`);
  if (h?.opacity !== '1' || h?.text !== 'soon') problems.push(`${width} ${theme}: OpenSea shows ${JSON.stringify(h)} with the pointer on it`);
  await shot(`places-${width}-${theme}-hover-opensea`, '.footer-places', 14);
  await closeUp(`places-${width}-${theme}-hover-opensea-x4`, '.place-row', 30);
  await restNothing();

  const f = await focus('OpenSea');
  say(`   the keyboard on OpenSea: ${JSON.stringify(f)}`);
  if (f.word?.opacity !== '1' || f.word?.text !== 'soon') problems.push(`${width} ${theme}: OpenSea shows ${JSON.stringify(f.word)} with the keyboard on it`);
  if (f.where.place !== 'OpenSea') problems.push(`${width} ${theme}: the keyboard did not reach the OpenSea mark (it is on ${JSON.stringify(f.where)})`);
  await closeUp(`places-${width}-${theme}-focus-opensea-x4`, '.place-row', 30);
  // The word must not reach past the page's right edge while it is showing.
  const o = await evalJs(OVERFLOW);
  if (o.scrollW > o.vw || o.out.length) sideways.push({ name: `${width} ${theme} with a word showing`, ...o });
  await restNothing();
}

// ---- a keyboard reaches the dimmed mark by pressing Tab ------------------------------------------
await view(1280, 'light');
await open();
say('== a keyboard walking the footer row with Tab');
await evalJs("(() => { const e = document.querySelector('[data-place=\"Telegram\"]'); e.scrollIntoView({ block: 'center' }); e.focus(); return 1; })()");
const walk = [];
for (let i = 0; i < 2; i++) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await sleep(220);
  walk.push(
    await evalJs(
      "(() => { const a = document.activeElement; const w = a.querySelector?.('.place-word'); return { tag: a.tagName.toLowerCase(), place: a.dataset?.place ?? null, word: w ? w.textContent + ' at opacity ' + getComputedStyle(w).opacity : null, says: a.querySelector?.('.visually-hidden')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null }; })()",
    ),
  );
}
say(`   after Telegram, Tab reaches: ${JSON.stringify(walk)}`);
if (walk[0]?.place !== 'OpenSea' || !/soon at opacity 1/.test(walk[0]?.word ?? '')) problems.push(`Tab after Telegram reached ${JSON.stringify(walk[0])}`);
await restNothing();

// ---- every page's width at the three narrow widths -----------------------------------------------
const PAGES = ['', 'trade', 'trade/sell', 'rewards', 'stake', 'stats', 'docs'];
say('== the page width against the window width, every page');
for (const width of [360, 375, 390]) {
  await view(width, 'light');
  for (const p of PAGES) {
    await open(`#/${p}`);
    const o = await evalJs(OVERFLOW);
    const row = await evalJs("(() => { const r = document.querySelector('.place-row').getBoundingClientRect(); return Math.round(r.width) + ' x ' + Math.round(r.height); })()");
    say(`   ${String(width).padStart(3)} px  ${(p || 'home').padEnd(11)}: page ${o.scrollW} px, window ${o.vw} px${o.scrollW === o.vw ? ' (equal)' : ' DIFFERENT'}; the marks row ${row}`);
    if (o.scrollW !== o.vw || o.out.length) sideways.push({ name: `${width} px ${p || 'home'}`, ...o });
  }
}

// ---- the row as it will look once TOWN is on Ethereum (four marks) -------------------------------
// The built site reads the real chain-1 address file, which names no TOWN, so the four-mark row
// cannot appear on it. The component tests render both states from the site's own component; in
// gallery mode they leave each one on the page under its own id. This opens that page on the
// project's own development server and photographs the two rows side by side, so the owner can see
// today's three marks and tomorrow's four. Nothing on this page is part of the built site, so its
// console messages and policy reports are not counted against the build.
recording = false;
process.env.VITE_CHAIN_ID = '31337'; // the test page reads the local chain, as `npm test` does
const dev = await createViteServer({ root: resolve('.'), configFile: resolve('vite.config.ts'), logLevel: 'warn', server: { host: '127.0.0.1', port: DEV_PORT, strictPort: true, hmr: false } });
await dev.listen();
say(`== the two states of the row, rendered by the component tests on http://127.0.0.1:${DEV_PORT}/test/index.html?gallery`);
try {
  for (const theme of ['light', 'dark']) {
    await view(1280, theme);
    await send('Page.navigate', { url: `http://127.0.0.1:${DEV_PORT}/test/index.html?gallery` });
    let done = false;
    for (let i = 0; i < 300 && !done; i++) {
      await sleep(500);
      done = await evalJs('!!window.__results');
    }
    if (!done) {
      problems.push('the component-test gallery did not finish within 150 seconds');
      break;
    }
    await sleep(600);
    await evalJs('document.fonts.ready.then(() => 1)');
    for (const [id, what] of [
      ['cr84-today', 'today'],
      ['cr84-filled', 'filled'],
    ]) {
      const marks = await evalJs(`(() => { const e = document.querySelector('#${id}'); return e ? [...e.querySelectorAll('.place')].map((p) => p.dataset.place + (p.tagName === 'A' ? ' (link ' + p.getAttribute('href') + ')' : ' (dimmed, "' + p.querySelector('.place-word').textContent + '")')) : null; })()`);
      say(`   ${what}: ${marks ? marks.join(', ') : 'NOT ON THE PAGE'}`);
      if (!marks) problems.push(`the component-test gallery has no #${id}`);
      else await closeUp(`row-${what}-1280-${theme}-x4`, `#${id} .place-row`, 12);
    }
  }
} finally {
  await dev.close();
}
recording = true;

say(`== policy violations reported by the page: ${violations.length ? violations.join(' || ') : 'none'}`);
say(`== console messages and page errors: ${consoleMsgs.length ? consoleMsgs.join(' || ') : 'none'}`);
say(`== hosts contacted: ${[...hosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}`);
say(`== sideways scrolling: ${sideways.length ? JSON.stringify(sideways) : 'none'}`);
say(`== what this run found wrong: ${problems.length ? problems.join(' || ') : 'nothing'}`);
// Counted here, before the browser is closed: shutting Edge down produces log entries of its own.
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
console.log(bad ? 'FAILED: see the lines above' : 'OK: the four marks are as CR-84 asks, no policy violation, no console message, no sideways scrolling');
process.exit(bad ? 1 : 0);
