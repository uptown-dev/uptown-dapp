// CR-88 (F9s) review driver: photographs and reads back the footer's row of platform marks on the
// build in dist/, now that the row has its own column to the right of the contract addresses, the
// heading reads "Official Links", GMGN is shown from today with GMGN's own pixel-art mark, and all
// four marks carry their platforms' brand colours at sizes chosen by what the eye sees.
//
// It checks, on the built site: the heading, and that "Find UpTown" is nowhere; the four marks and
// their order; that X and Telegram are still the same links and OpenSea still leads nowhere and
// says "soon"; that GMGN is shown, is not a link, has no href and says "at launch"; that GMGN's
// drawing is the task brief's own bytes, element for element and attribute for attribute, that its
// clip-path id is unique on the page and that its colours are its own and no stylesheet rule
// paints it; each mark's painted colour, including X's black on light and white on dark; each
// mark's size and the size of the drawing that actually shows, the OpenSea boat measured inside its
// disc; where the block sits at each width; the footer's height; that the licence files are still
// published; and every page's width at the three narrow widths.
//
// Usage, from frontend/ (build dist/ first for the chain you want to look at):
//   VITE_CHAIN_ID=31337 npm run build && node scripts/f9s-shots.mjs 31337
//   VITE_CHAIN_ID=1     npm run build && node scripts/f9s-shots.mjs 1
//   VITE_CHAIN_ID=11155111 npm run build && node scripts/f9s-shots.mjs 11155111
//
// It serves the built site with the hosting headers of vercel.json on 127.0.0.1:4284 — never 4173,
// 5173 or 8545 — drives headless Edge, and reports every policy violation, console message and
// sideways scroll it sees. It opens pages, rests the pointer on the two marks that lead nowhere and
// moves the keyboard to them; it follows no link, connects no wallet and sends nothing anywhere.
// Local review only; nothing here runs in the site. Pictures and the log go to the git-ignored
// review-shots/f9s/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';

const CHAIN = process.argv[2] ?? '31337';
const DIST = resolve('dist');
const OUT = resolve(`review-shots/f9s/chain-${CHAIN}`);
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const RPC = 'http://127.0.0.1:8545';
const PORT = 4284;
const DEBUG_PORT = 9384;
const DEV_PORT = 4285;
const PROFILE_NAME = 'uptown-f9s-shots-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const say = (s) => {
  console.log(s);
  logLines.push(s);
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no dist/index.html: run VITE_CHAIN_ID=${CHAIN} npm run build first`);

// ---- GMGN's drawing, read out of the task brief itself ------------------------------------------
// The brief carries GMGN's own file in a fenced block. The page is compared against those bytes, not
// against a copy of them: every element inside the clipped group, with every attribute it carries.
const BRIEF = readFileSync(resolve('../docs/tasks/F9s-frontend.md'), 'utf8').replace(/\r\n/g, '\n');
const briefSvg = /```svg\s*\n([\s\S]*?)\n```/.exec(BRIEF)?.[1];
if (!briefSvg) throw new Error('the task brief has no fenced svg block');
const parseEl = (line) => {
  const tag = /^<([a-zA-Z]+)/.exec(line.trim())[1];
  const attrs = {};
  for (const m of line.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  return { tag, attrs };
};
const BRIEF_SHAPES = /<g clip-path="url\(#clip0_468_9437\)">\n([\s\S]*?)\n<\/g>/
  .exec(briefSvg)[1]
  .split('\n')
  .map(parseEl);
const BRIEF_CLIP_RECT = parseEl(/<clipPath id="clip0_468_9437">\n([\s\S]*?)\n<\/clipPath>/.exec(briefSvg)[1]);
say(`the brief's GMGN drawing: ${BRIEF_SHAPES.length} shapes (${BRIEF_SHAPES.map((s) => s.tag).join(', ')}), clip rect ${JSON.stringify(BRIEF_CLIP_RECT.attrs)}`);
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

/** Every mark in the footer row, in page order: what it is, where it goes, how it is drawn and how it is painted. */
const MARKS = `(() => {
  const round = (n) => Math.round(n * 100) / 100;
  const row = document.querySelector('.footer-places');
  if (!row) return null;
  const footer = document.querySelector('footer.site-footer');
  const grid = footer.querySelector('.footer-grid');
  const rect = (e) => { const b = e.getBoundingClientRect(); return { left: round(b.left), right: round(b.right), top: round(b.top), bottom: round(b.bottom), w: round(b.width), h: round(b.height) }; };
  const contracts = footer.querySelector('.footer-contracts');
  const links = footer.querySelector('.footer-brand nav');
  return {
    head: row.querySelector('.footer-head')?.textContent ?? null,
    // CR-88: "Find UpTown" is gone from every page.
    findUpTown: /Find UpTown/i.test(document.documentElement.innerHTML),
    // Where the block sits. In the markup it is always inside the brand block; at 1000 px and above
    // the brand block is display:contents, so the block stands as its own grid column.
    inBrandBlock: !!footer.querySelector('.footer-brand .footer-places'),
    withContracts: !!footer.querySelector('.footer-contracts .footer-places'),
    rowCount: footer.querySelectorAll('.footer-places').length,
    brandDisplay: getComputedStyle(footer.querySelector('.footer-brand')).display,
    gridColumns: getComputedStyle(grid).gridTemplateColumns,
    where: { places: rect(row), contracts: rect(contracts), links: links ? rect(links) : null },
    footerHeight: round(footer.getBoundingClientRect().height),
    fontsLine: !!document.querySelector('.footer-fonts'),
    fontsWords: /SIL Open Font Licence/i.test(document.documentElement.innerHTML),
    rowBox: (() => { const r = row.querySelector('.place-row').getBoundingClientRect(); return round(r.width) + ' x ' + round(r.height); })(),
    lines: new Set([...row.querySelectorAll('.place')].map((e) => Math.round(e.getBoundingClientRect().top))).size,
    // The clip-path id GMGN's drawing uses must be unique on the page, and must not be the one the
    // file ships with (which could collide with anything else drawn from the same source).
    ids: (() => {
      const all = [...document.querySelectorAll('[id]')].map((e) => e.id);
      const dupes = all.filter((v, i) => all.indexOf(v) !== i);
      return { total: all.length, duplicates: [...new Set(dupes)], originalGmgnId: all.includes('clip0_468_9437'), inHtml: /clip0_468_9437/.test(document.documentElement.innerHTML) };
    })(),
    marks: [...row.querySelectorAll('li > *')].map((el) => {
      const svg = el.querySelector('svg');
      const word = el.querySelector('.place-word');
      const hidden = el.querySelector('.visually-hidden');
      const b = el.getBoundingClientRect();
      const shapes = svg ? [...svg.querySelectorAll('g > *, svg > path, svg > rect, svg > circle')] : [];
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
        shapeCount: svg ? svg.querySelectorAll('path, rect, circle').length : 0,
        remote: svg ? [...svg.querySelectorAll('*')].some((n) => /^(image|use)$/.test(n.tagName.toLowerCase())) : null,
        box: round(b.width) + ' x ' + round(b.height),
        // The size the mark is drawn at, and the size of the drawing that actually shows inside it:
        // the union of every shape's own box, in CSS pixels. That second figure is what the eye
        // compares (CR-88 item 7), not the box.
        drawnAt: svg ? svg.getAttribute('width') + 'x' + svg.getAttribute('height') : null,
        viewBox: svg ? svg.getAttribute('viewBox') : null,
        rootFill: svg ? svg.getAttribute('fill') : null,
        inkPx: svg
          ? (() => {
              try {
                // The whole drawing's own box, in the svg's user units (so a shape's own transform
                // is taken into account, which a per-shape getBBox would miss), scaled to pixels.
                const bb = svg.getBBox();
                const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
                return round(bb.width * scale) + ' x ' + round(bb.height * scale);
              } catch { return null; }
            })()
          : null,
        // Every shape's painted fill, as the browser resolves it: the brand colour for X, Telegram
        // and OpenSea (and the white disc behind OpenSea's boat), GMGN's own colours for GMGN.
        fills: shapes.map((s) => getComputedStyle(s).fill),
        glyphOpacity: svg ? getComputedStyle(svg).opacity : null,
        colour: getComputedStyle(el).color,
        borderStyle: getComputedStyle(el).borderTopStyle,
        word: word ? word.textContent : null,
        wordShown: word ? getComputedStyle(word).opacity : null,
        forScreenReader: hidden ? hidden.textContent.replace(/\\s+/g, ' ').trim() : null,
      };
    }),
    // GMGN's drawing as the page holds it: every element inside the clipped group with every
    // attribute, plus the clip path's own rect, for comparison with the task brief's bytes.
    gmgnDrawing: (() => {
      const svg = document.querySelector('[data-place="GMGN"] svg');
      if (!svg) return null;
      const attrs = (el) => Object.fromEntries([...el.attributes].filter((a) => a.name !== 'class').map((a) => [a.name, a.value]));
      const g = svg.querySelector('g[clip-path]');
      const clip = svg.querySelector('clipPath');
      return {
        clipRef: g ? g.getAttribute('clip-path') : null,
        clipId: clip ? clip.id : null,
        clipRect: clip?.firstElementChild ? { tag: clip.firstElementChild.tagName.toLowerCase(), attrs: attrs(clip.firstElementChild) } : null,
        shapes: g ? [...g.children].map((el) => ({ tag: el.tagName.toLowerCase(), attrs: attrs(el) })) : [],
        usesCurrentColor: /currentColor/i.test(svg.outerHTML),
      };
    })(),
    // OpenSea's boat is a hole in a filled disc, so what the eye sees is the hole. Measured, not
    // assumed: every point inside the disc that the glyph does not fill.
    openSeaBoat: (() => {
      const p = document.querySelector('[data-place="OpenSea"] svg path');
      if (!p) return null;
      const svg = p.ownerSVGElement;
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let x = 0; x <= 24; x += 0.1) {
        for (let y = 0; y <= 24; y += 0.1) {
          if ((x - 12) ** 2 + (y - 12) ** 2 > 11 ** 2) continue;
          if (p.isPointInFill(new DOMPoint(x, y))) continue;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y);
          x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      return { units: round(x1 - x0) + ' x ' + round(y1 - y0), px: round((x1 - x0) * scale) + ' x ' + round((y1 - y0) * scale) };
    })(),
    images: [...document.images].map((i) => i.currentSrc || i.src).filter((s) => s && !s.startsWith('data:') && !s.startsWith(location.origin)),
  };
})()`;

/** The word a mark that leads nowhere shows, read while the pointer rests on it or the keyboard is on it. */
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
/** A picture of one part of the page at ordinary resolution, with its own overflow check. */
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
/**
 * One part, photographed at the size a visitor really sees it (`scale` 1) or drawn larger. An
 * enlarged picture hides exactly what the ordinary-resolution one shows — whether the pixel drawing
 * lands on whole screen pixels, and how heavy each mark reads beside the others — so both are taken.
 */
async function closeUp(name, sel, pad = 10, scale = 4) {
  const box = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
  if (!box) {
    problems.push(`${name}: nothing on the page matches ${sel}`);
    return;
  }
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + 2 * pad, height: box.h + 2 * pad, scale };
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  say(`photo ${name}.png  (${Math.round(clip.width)} x ${Math.round(clip.height)} css pixels${scale === 1 ? ', at ordinary resolution' : `, drawn ${scale} times larger`})`);
}

const RGB = { black: 'rgb(0, 0, 0)', white: 'rgb(255, 255, 255)', telegram: 'rgb(38, 165, 228)', opensea: 'rgb(32, 129, 226)' };
/** GMGN's own colours, from its file: every fill in the drawing, lower-cased, as the browser reports them. */
const GMGN_FILLS = ['rgb(158, 212, 85)', 'rgb(69, 127, 44)', RGB.white, RGB.black, RGB.black, 'rgb(213, 248, 107)', 'rgb(208, 156, 79)', 'rgb(208, 156, 79)', 'rgb(208, 156, 79)', 'rgb(208, 156, 79)', 'rgb(87, 167, 86)', RGB.white, RGB.black];

/** The row's own report, checked as it is read. */
async function report(label, theme, threeColumns) {
  const m = await evalJs(MARKS);
  if (!m) {
    problems.push(`${label}: there is no .footer-places row on the page`);
    return null;
  }
  say(`   ${label}: head "${m.head}", row ${m.rowBox}, on ${m.lines} line(s); footer ${m.footerHeight} px tall`);
  say(`      the block is in the brand block: ${m.inBrandBlock} (one block on the page: ${m.rowCount === 1}); brand block display ${m.brandDisplay}; grid columns ${m.gridColumns}`);
  say(`      where: places ${JSON.stringify(m.where.places)}; contracts ${JSON.stringify(m.where.contracts)}`);
  for (const k of m.marks) say(`      ${JSON.stringify({ ...k, fills: k.fills.length > 4 ? `${k.fills.length} fills` : k.fills })}`);

  // CR-88 item 2: the heading, everywhere it appears.
  if (m.head !== 'Official Links') problems.push(`${label}: the heading reads "${m.head}", not "Official Links"`);
  if (m.findUpTown) problems.push(`${label}: "Find UpTown" is still in the page`);
  // The block is written once, in the brand block, at every width.
  if (!m.inBrandBlock || m.rowCount !== 1) problems.push(`${label}: the block is ${m.rowCount} row(s), in the brand block: ${m.inBrandBlock}`);
  if (m.withContracts) problems.push(`${label}: the block is inside the contracts block again`);
  // CR-88 item 1: its own column to the right of the addresses where there is room; under the page
  // links where there is not.
  if (threeColumns) {
    const ok = m.brandDisplay === 'contents' && m.where.places.left >= m.where.contracts.right && Math.abs(m.where.places.top - m.where.contracts.top) < 2;
    say(`      third column, to the right of the addresses and level with them: ${ok}`);
    if (!ok) problems.push(`${label}: the marks are not a third column to the right of the addresses (${JSON.stringify(m.where)}, brand display ${m.brandDisplay})`);
  } else {
    const underLinks = m.where.links !== null && m.where.places.top >= m.where.links.bottom;
    const aboveContracts = m.where.places.bottom <= m.where.contracts.top;
    say(`      under the page links: ${underLinks}; above the contract addresses: ${aboveContracts}`);
    if (!underLinks || !aboveContracts) problems.push(`${label}: the marks are not under the page links (${JSON.stringify(m.where)})`);
  }
  if (m.fontsLine || m.fontsWords) problems.push(`${label}: the font licence sentence is back in the page`);

  const order = m.marks.map((k) => k.place).join(',');
  if (order !== 'X,Telegram,GMGN,OpenSea') problems.push(`${label}: the marks are in the order ${order}`);
  const by = Object.fromEntries(m.marks.map((k) => [k.place, k]));

  // The two links, unchanged by CR-88.
  for (const [place, href, what] of [
    ['X', 'https://x.com/UpTownHook', 'UpTown on X'],
    ['Telegram', 'https://t.me/uptownhook', 'UpTown on Telegram'],
  ]) {
    const k = by[place];
    if (!k) problems.push(`${label}: no ${place} mark`);
    else if (k.tag !== 'a' || k.href !== href || k.target !== '_blank' || k.rel !== 'noopener noreferrer' || k.aria !== `${what} (opens in a new tab)`) {
      problems.push(`${label}: the ${place} mark is ${JSON.stringify({ ...k, fills: undefined })}`);
    }
  }
  // OpenSea, unchanged by CR-88, and GMGN, which now has exactly the same treatment with its own word.
  for (const [place, word] of [
    ['OpenSea', 'soon'],
    ['GMGN', 'at launch'],
  ]) {
    const k = by[place];
    if (!k) problems.push(`${label}: no ${place} mark`);
    else if (k.tag === 'a' || k.href !== null || k.word !== word || k.tabindex !== '0' || k.forScreenReader !== `${place}: ${word}` || k.title !== `${place}: ${word}`) {
      problems.push(`${label}: the ${place} mark is ${JSON.stringify({ ...k, fills: undefined })}`);
    } else if (k.wordShown !== '0') problems.push(`${label}: the ${place} mark's word is showing before the pointer or the keyboard reaches it (opacity ${k.wordShown})`);
  }
  for (const k of m.marks) {
    if (k.shapeCount === 0) problems.push(`${label}: the ${k.place} mark draws no shape`);
    if (k.remote) problems.push(`${label}: the ${k.place} mark loads something from elsewhere`);
    if (Number(k.glyphOpacity) !== 1) problems.push(`${label}: the ${k.place} mark's drawing is dimmed (opacity ${k.glyphOpacity})`);
    if (k.borderStyle !== 'solid') problems.push(`${label}: the ${k.place} mark's border is ${k.borderStyle}, not solid`);
  }

  // CR-88 item 6: each mark in its platform's brand colour; X black on light and white on dark.
  const wantX = theme === 'dark' ? RGB.white : RGB.black;
  const colours = {
    X: [wantX],
    Telegram: [RGB.telegram],
    // The white disc behind the glyph, then the glyph itself.
    OpenSea: [RGB.white, RGB.opensea],
    GMGN: GMGN_FILLS,
  };
  say(`      brand colours (${theme}): ${m.marks.map((k) => `${k.place} ${k.fills.length > 4 ? `${k.fills.length} of its own` : k.fills.join(' + ')}`).join(' | ')}`);
  for (const [place, want] of Object.entries(colours)) {
    const got = by[place]?.fills ?? [];
    const same = got.length === want.length && got.every((f, i) => f === want[i]);
    if (!same) problems.push(`${label}: the ${place} mark is painted ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
  }
  // GMGN's root carries fill="none" and nothing in it is currentColor, so no rule can flatten it.
  if (by.GMGN?.rootFill !== 'none') problems.push(`${label}: GMGN's drawing has fill="${by.GMGN?.rootFill}" on its root, not "none"`);
  if (m.gmgnDrawing?.usesCurrentColor) problems.push(`${label}: GMGN's drawing uses currentColor`);

  // CR-88 item 7: the sizes, and the drawing that actually shows inside each box.
  const sizes = { X: '18x18', Telegram: '22x22', GMGN: '16x16', OpenSea: '28x28' };
  say(`      sizes and the drawing that shows: ${m.marks.map((k) => `${k.place} box ${k.box}, drawn ${k.drawnAt}, ink ${k.inkPx} px`).join(' | ')}`);
  say(`      the OpenSea boat inside its disc, measured: ${JSON.stringify(m.openSeaBoat)}`);
  for (const [place, want] of Object.entries(sizes)) {
    if (by[place]?.drawnAt !== want) problems.push(`${label}: the ${place} mark is drawn at ${by[place]?.drawnAt}, not ${want}`);
  }

  // The GMGN drawing, against the task brief's own bytes.
  const d = m.gmgnDrawing;
  const sameShapes = JSON.stringify(d?.shapes) === JSON.stringify(BRIEF_SHAPES);
  const sameRect = JSON.stringify(d?.clipRect) === JSON.stringify(BRIEF_CLIP_RECT);
  say(`      GMGN's drawing is the brief's, element for element and attribute for attribute: ${sameShapes} (${d?.shapes.length} of ${BRIEF_SHAPES.length}); its clip rect: ${sameRect}`);
  if (!sameShapes) problems.push(`${label}: GMGN's drawing is not the brief's: ${JSON.stringify(d?.shapes)}`);
  if (!sameRect) problems.push(`${label}: GMGN's clip rect is ${JSON.stringify(d?.clipRect)}, not ${JSON.stringify(BRIEF_CLIP_RECT)}`);
  say(`      GMGN's clip id "${d?.clipId}" (used as ${d?.clipRef}); ids on the page ${m.ids.total}, duplicates ${JSON.stringify(m.ids.duplicates)}; the file's own id anywhere in the page: ${m.ids.inHtml}`);
  if (!d?.clipId || d.clipRef !== `url(#${d.clipId})`) problems.push(`${label}: GMGN's clip path is ${d?.clipRef} against id ${d?.clipId}`);
  if (m.ids.duplicates.length) problems.push(`${label}: these ids are on the page more than once: ${m.ids.duplicates.join(', ')}`);
  if (m.ids.inHtml) problems.push(`${label}: the drawing still carries its file's own id clip0_468_9437`);

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

// ---- the footer at four widths, in both themes ---------------------------------------------------
for (const [width, theme] of [
  [1280, 'light'],
  [1280, 'dark'],
  [1024, 'light'],
  [1024, 'dark'],
  [390, 'light'],
  [390, 'dark'],
  [360, 'light'],
  [360, 'dark'],
]) {
  const threeColumns = width >= 1000;
  await view(width, theme);
  await open();
  say(`== the footer at ${width} px, ${theme} (${threeColumns ? 'three columns' : 'the marks under the page links'})`);
  await report(`footer ${width} ${theme}`, theme, threeColumns);
  await shot(`footer-${width}-${theme}`, 'footer.site-footer', 10);
  await shot(`places-${width}-${theme}`, '.footer-places', 14);
  // Ordinary resolution first: that is where a pixel drawing on half-pixels, or one mark heavier
  // than the rest, shows. The enlarged picture is for reading the drawings themselves.
  await closeUp(`places-${width}-${theme}-1x`, '.place-row', 10, 1);
  await closeUp(`places-${width}-${theme}-x4`, '.place-row', 10, 4);

  // The two words, with the pointer resting on each mark and then with the keyboard on it.
  for (const [place, word] of [
    ['OpenSea', 'soon'],
    ['GMGN', 'at launch'],
  ]) {
    const h = await hover(place);
    say(`   the pointer resting on ${place}: ${JSON.stringify(h)}`);
    if (h?.opacity !== '1' || h?.text !== word) problems.push(`${width} ${theme}: ${place} shows ${JSON.stringify(h)} with the pointer on it`);
    const inside = await evalJs(
      `(() => { const w = document.querySelector('[data-place="${place}"] .place-word').getBoundingClientRect(); const f = document.querySelector('footer.site-footer').getBoundingClientRect(); return { wordBottom: Math.round(w.bottom), footerBottom: Math.round(f.bottom), room: Math.round(f.bottom - w.bottom) }; })()`,
    );
    say(`   the word's lowest point against the footer's: ${JSON.stringify(inside)}`);
    if (inside.room < 0) problems.push(`${width} ${theme}: the word "${word}" reaches past the foot of the footer (${JSON.stringify(inside)})`);
    await shot(`places-${width}-${theme}-hover-${place.toLowerCase()}`, '.footer-places', 34);
    await closeUp(`places-${width}-${theme}-hover-${place.toLowerCase()}-x4`, '.place-row', 30);
    // The word must not reach past the page's right edge while it is showing.
    const o = await evalJs(OVERFLOW);
    if (o.scrollW > o.vw || o.out.length) sideways.push({ name: `${width} ${theme} with "${word}" showing`, ...o });
    await restNothing();

    const f = await focus(place);
    say(`   the keyboard on ${place}: ${JSON.stringify(f)}`);
    if (f.word?.opacity !== '1' || f.word?.text !== word) problems.push(`${width} ${theme}: ${place} shows ${JSON.stringify(f.word)} with the keyboard on it`);
    if (f.where.place !== place) problems.push(`${width} ${theme}: the keyboard did not reach the ${place} mark (it is on ${JSON.stringify(f.where)})`);
    await closeUp(`places-${width}-${theme}-focus-${place.toLowerCase()}-x4`, '.place-row', 30);
    await restNothing();
  }
}

// ---- a keyboard reaches both marks that lead nowhere by pressing Tab -----------------------------
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
if (walk[0]?.place !== 'GMGN' || !/at launch at opacity 1/.test(walk[0]?.word ?? '')) problems.push(`Tab after Telegram reached ${JSON.stringify(walk[0])}`);
if (walk[1]?.place !== 'OpenSea' || !/soon at opacity 1/.test(walk[1]?.word ?? '')) problems.push(`Tab after GMGN reached ${JSON.stringify(walk[1])}`);
await restNothing();

// ---- the font licence files are still published and still reachable -----------------------------
say('== the font licence files in the built site');
for (const name of ['OFL-Inter.txt', 'OFL-Cinzel.txt']) {
  const onDisk = existsSync(join(DIST, 'licenses', name));
  const r = await fetch(`${SITE}licenses/${name}`);
  const body = await r.text();
  const firstLine = body.split('\n').find((l) => l.trim().length) ?? '';
  const ok = onDisk && r.status === 200 && /SIL Open Font License/i.test(body);
  say(`   dist/licenses/${name}: on disk ${onDisk}, HTTP ${r.status} ${r.headers.get('content-type')}, ${body.length} characters, first line "${firstLine.trim().slice(0, 80)}"`);
  if (!ok) problems.push(`dist/licenses/${name} is not published and reachable (on disk ${onDisk}, HTTP ${r.status})`);
}

// ---- every page's width at the three narrow widths ----------------------------------------------
const PAGES = ['', 'trade', 'trade/sell', 'rewards', 'stake', 'stats', 'docs'];
say('== the page width against the window width, every page');
for (const width of [360, 375, 390]) {
  await view(width, 'light');
  for (const p of PAGES) {
    await open(`#/${p}`);
    const bits = await evalJs(
      "(() => { const html = document.documentElement.innerHTML; return { fonts: !!document.querySelector('.footer-fonts') || /SIL Open Font Licence/i.test(html), findUpTown: /Find UpTown/i.test(html), head: document.querySelector('.footer-places .footer-head')?.textContent ?? null, marks: [...document.querySelectorAll('.footer-places .place')].map((e) => e.dataset.place).join(',') }; })()",
    );
    if (bits.fonts) problems.push(`${width} px ${p || 'home'}: the font licence sentence is back on the page`);
    if (bits.findUpTown) problems.push(`${width} px ${p || 'home'}: "Find UpTown" is still on the page`);
    if (bits.head !== 'Official Links') problems.push(`${width} px ${p || 'home'}: the heading reads "${bits.head}"`);
    if (bits.marks !== 'X,Telegram,GMGN,OpenSea') problems.push(`${width} px ${p || 'home'}: the marks are ${bits.marks}`);
    const o = await evalJs(OVERFLOW);
    const row = await evalJs("(() => { const r = document.querySelector('.place-row').getBoundingClientRect(); return Math.round(r.width) + ' x ' + Math.round(r.height); })()");
    say(`   ${String(width).padStart(3)} px  ${(p || 'home').padEnd(11)}: page ${o.scrollW} px, window ${o.vw} px${o.scrollW === o.vw ? ' (equal)' : ' DIFFERENT'}; "${bits.head}", marks ${bits.marks}, row ${row}`);
    if (o.scrollW !== o.vw || o.out.length) sideways.push({ name: `${width} px ${p || 'home'}`, ...o });
  }
}

// ---- the row as it will look once TOWN is on Ethereum --------------------------------------------
// The built site reads the real chain-1 address file, which names no TOWN, so GMGN's link state
// cannot appear on it. The component tests render both states from the site's own component; in
// gallery mode they leave each one on the page under its own id. This opens that page on the
// project's own development server and photographs the two rows, so the owner can see today's row
// and tomorrow's. Nothing on this page is part of the built site, so its console messages and
// policy reports are not counted against the build.
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
      const marks = await evalJs(`(() => { const e = document.querySelector('#${id}'); return e ? [...e.querySelectorAll('.place')].map((p) => p.dataset.place + (p.tagName === 'A' ? ' (link ' + p.getAttribute('href') + ')' : ' (not a link, "' + p.querySelector('.place-word').textContent + '")')) : null; })()`);
      say(`   ${what}: ${marks ? marks.join(', ') : 'NOT ON THE PAGE'}`);
      if (!marks) problems.push(`the component-test gallery has no #${id}`);
      else {
        await closeUp(`row-${what}-1280-${theme}-1x`, `#${id} .place-row`, 10, 1);
        await closeUp(`row-${what}-1280-${theme}-x4`, `#${id} .place-row`, 12);
      }
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
console.log(
  bad
    ? 'FAILED: see the lines above'
    : 'OK: the marks are as CR-88 asks, the licence files are published, no policy violation, no console message, no sideways scrolling',
);
process.exit(bad ? 1 : 0);
