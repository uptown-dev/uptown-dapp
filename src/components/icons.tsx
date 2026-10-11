// The site's own drawings: the owner's logo (CR-75), a handful of line icons and the one flow
// graphic. The line icons and the flow graphic take their colours from CSS custom properties, so
// they follow the light or dark theme; the logo carries one drawing per theme and the stylesheet
// shows the one that belongs to the theme in force.

/**
 * The UpTown logo (CR-75): the owner's skyline of five towers with lit windows, copied exactly
 * from `frontend/logo/uptown-lamplight-on-light.svg` and `frontend/logo/uptown-lamplight-on-dark.svg`
 * (same viewBox, same shapes, same colours, same drawing order).
 *
 * Both versions sit in the page at once and the stylesheet shows one of them (`.skyline-light`,
 * `.skyline-dark` in global.css) — the same cascade that decides every other colour on the site.
 * So the right version is there on the very first paint, with no flash, and it changes the instant
 * the theme switch or the browser's own light/dark setting changes. The windows are the same in
 * both versions, so they are drawn once, between the towers and the ground bar, exactly where each
 * of the owner's two files draws them.
 */
export function SkylineMark() {
  return (
    <svg viewBox="10 73 492 367" class="skyline" aria-hidden="true">
      {/* Light theme: solid dark-indigo towers */}
      <g class="skyline-light" fill="#1E1B4B">
        <path d="M24 420 L24 327.143 L40 315.714 L40 420 Z" />
        <path d="M48 420 L48 310 L62 300 L100 327.143 L100 420 Z" />
        <path d="M108 420 L108 233.5 L124 223.5 L124 420 Z" />
        <path d="M132 420 L132 218.5 L152 206 L196 233.5 L196 420 Z" />
        <path d="M204 420 L204 155.6 L220 146 L220 420 Z" />
        <path d="M228 420 L228 141.2 L250 128 L296 155.6 L296 420 Z" />
        <path d="M304 420 L304 233.391 L320 222.957 L320 420 Z" />
        <path d="M328 420 L328 217.739 L346 206 L388 233.391 L388 420 Z" />
        <path d="M396 420 L396 107.6 L412 98 L412 420 Z" />
        <path d="M420 420 L420 93.2 L442 80 L488 107.6 L488 420 Z" />
      </g>
      {/* Dark theme: the same skyline with a cream outline */}
      <g class="skyline-dark" fill="#141233" stroke="#F5EFE2" stroke-width="8" stroke-linejoin="miter">
        <path d="M20 420 V330 L62 300 L104 330 V420 Z" />
        <path d="M20 420 V330 L44 313 V420 Z" />
        <path d="M104 420 V236 L152 206 L200 236 V420 Z" />
        <path d="M104 420 V236 L128 221 V420 Z" />
        <path d="M300 420 V236 L346 206 L392 236 V420 Z" />
        <path d="M300 420 V236 L324 220 V420 Z" />
        <path d="M392 420 V110 L442 80 L492 110 V420 Z" />
        <path d="M392 420 V110 L416 96 V420 Z" />
        <path d="M200 420 V158 L250 128 L300 158 V420 Z" />
        <path d="M200 420 V158 L224 144 V420 Z" />
      </g>
      {/* The lit windows, identical in both versions */}
      <g fill="#F2B544">
        <rect x="54" y="348" width="16" height="20" />
        <rect x="78" y="348" width="16" height="20" />
        <rect x="54" y="380" width="16" height="20" />
        <rect x="78" y="380" width="16" height="20" />
        <rect x="138" y="254" width="16" height="20" />
        <rect x="174" y="254" width="16" height="20" />
        <rect x="138" y="286" width="16" height="20" />
        <rect x="174" y="286" width="16" height="20" />
        <rect x="138" y="318" width="16" height="20" />
        <rect x="174" y="318" width="16" height="20" />
        <rect x="138" y="350" width="16" height="20" />
        <rect x="174" y="350" width="16" height="20" />
        <rect x="138" y="382" width="16" height="20" />
        <rect x="174" y="382" width="16" height="20" />
        <rect x="234" y="176" width="16" height="20" />
        <rect x="274" y="176" width="16" height="20" />
        <rect x="234" y="208" width="16" height="20" />
        <rect x="274" y="208" width="16" height="20" />
        <rect x="234" y="240" width="16" height="20" />
        <rect x="274" y="240" width="16" height="20" />
        <rect x="234" y="272" width="16" height="20" />
        <rect x="274" y="272" width="16" height="20" />
        <rect x="234" y="304" width="16" height="20" />
        <rect x="274" y="304" width="16" height="20" />
        <rect x="234" y="336" width="16" height="20" />
        <rect x="274" y="336" width="16" height="20" />
        <rect x="234" y="368" width="16" height="20" />
        <rect x="274" y="368" width="16" height="20" />
        <rect x="334" y="254" width="16" height="20" />
        <rect x="366" y="254" width="16" height="20" />
        <rect x="334" y="286" width="16" height="20" />
        <rect x="366" y="286" width="16" height="20" />
        <rect x="334" y="318" width="16" height="20" />
        <rect x="366" y="318" width="16" height="20" />
        <rect x="334" y="350" width="16" height="20" />
        <rect x="366" y="350" width="16" height="20" />
        <rect x="334" y="382" width="16" height="20" />
        <rect x="366" y="382" width="16" height="20" />
        <rect x="426" y="128" width="16" height="20" />
        <rect x="466" y="128" width="16" height="20" />
        <rect x="426" y="160" width="16" height="20" />
        <rect x="466" y="160" width="16" height="20" />
        <rect x="426" y="192" width="16" height="20" />
        <rect x="466" y="192" width="16" height="20" />
        <rect x="426" y="224" width="16" height="20" />
        <rect x="466" y="224" width="16" height="20" />
        <rect x="426" y="256" width="16" height="20" />
        <rect x="466" y="256" width="16" height="20" />
        <rect x="426" y="288" width="16" height="20" />
        <rect x="466" y="288" width="16" height="20" />
        <rect x="426" y="320" width="16" height="20" />
        <rect x="466" y="320" width="16" height="20" />
        <rect x="426" y="352" width="16" height="20" />
        <rect x="466" y="352" width="16" height="20" />
      </g>
      <path class="skyline-light" d="M12 412 H500 V438 H12 Z" fill="#1E1B4B" />
      <path class="skyline-dark" d="M12 412 H500 V438 H12 Z" fill="#F5EFE2" />
    </svg>
  );
}

interface IconProps {
  size?: number;
}

function Line({ size = 18, children }: IconProps & { children: preact.ComponentChildren }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class="icon"
    >
      {children}
    </svg>
  );
}

export const LightModeIcon = (p: IconProps) => (
  <Line {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Line>
);

export const DarkModeIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Line>
);

export const MenuIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Line>
);

export const CloseIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Line>
);

export const InfoIcon = (p: IconProps) => (
  <Line {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6v.1" />
  </Line>
);

export const WarnIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M12 3.5 21.5 20h-19z" />
    <path d="M12 10v4.5M12 17.2v.1" />
  </Line>
);

export const NoteIcon = (p: IconProps) => (
  <Line {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
  </Line>
);

export const CheckIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </Line>
);

export const ChevronIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M6 9l6 6 6-6" />
  </Line>
);

/** A downward arrow, used between the two halves of the buy card (pay, then receive). */
export const ArrowDownIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Line>
);

export const ExternalIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Line>
);

/** Buyer rebates: a coin with a return arrow. */
export const RebateIcon = (p: IconProps) => (
  <Line {...p}>
    <circle cx="13" cy="12" r="7" />
    <path d="M13 8.5v7M10.5 10.5h3.5a1.5 1.5 0 0 1 0 3H11" />
    <path d="M3 8.5 5.5 6 8 8.5" />
    <path d="M5.5 6v6" />
  </Line>
);

/** ETH for stakers: the ETH diamond. */
export const EthIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M12 2.5 5.5 12.2 12 16l6.5-3.8z" />
    <path d="M5.5 13.6 12 21.5l6.5-7.9L12 17.4z" />
  </Line>
);

/** Fixed rules: a closed padlock. */
export const LockIcon = (p: IconProps) => (
  <Line {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    <path d="M12 14.5v2.5" />
  </Line>
);

/** Burn: a simple flame. */
export const FlameIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.3 3.6-8.3.9 1.6 1.8 2.5 2.9 3 .2-2.4 1-4.6 2.6-6.5.6 3.3 4.4 6.2 4.4 11.4 0 3.8-2.7 6.6-7 6.6z" />
  </Line>
);

// ---------------------------------------------------------------------------------------------
// THE PLATFORM MARKS IN THE FOOTER (CR-84, CR-87). The site's security policy allows no picture
// from another host (`img-src 'self' data:`), so these are drawn in the page, like every other
// icon here: one filled monochrome shape per platform, in a 24-unit box, taking its colour from
// the text colour around it, so each follows the light and dark theme and stays sharp at any size.
//
// CR-87: the X and OpenSea marks are the platforms' own, each a single path on a 24-unit box,
// copied exactly as the task brief gave them and drawn in `currentColor` rather than the brand
// colour, so they follow the theme like the rest of the footer. Both come from Simple Icons, a
// public collection of these marks; the drawings themselves carry no licence conditions. Each mark
// remains its platform's trademark, drawn here only to point at the project's own account on that
// platform. Nothing in either path is redrawn, re-spaced, cropped or part-recoloured.
//
// The Telegram paper plane is the site's own drawing and stays exactly as it was (the owner's
// choice, CR-87); GMGN's candlesticks are the site's own too, and are not rendered until TOWN
// exists on Ethereum. Each mark carries its platform's name for a screen reader and in its tooltip
// (see `PlaceMark` in app.tsx), so nothing depends on recognising the drawing alone.
//
// Sizes: OpenSea's mark is a filled disc and the other two are open shapes, so the disc is drawn a
// little smaller to carry the same visual weight in the row (F9r, checked in the close-up photographs).
// ---------------------------------------------------------------------------------------------

/** A filled mark, 20 units by default: one shape, or a few, in the surrounding text's colour. */
function Mark({ size = 20, children }: IconProps & { children: preact.ComponentChildren }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" class="icon mark">
      {children}
    </svg>
  );
}

/** X: the platform's own mark (Simple Icons), one path, exactly as given, in the surrounding colour. */
export const XMark = (p: IconProps) => (
  <Mark size={18} {...p}>
    <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
  </Mark>
);

/** Telegram: the paper plane, one shape with the notch in its lower edge. */
export const TelegramMark = (p: IconProps) => (
  <Mark {...p}>
    <path d="M22 2.6 2 10.8l6.6 2.6L9.8 21l3.5-5.4 5.3 5.2z" />
  </Mark>
);

/** GMGN: two candlesticks, each a body with its wick, as a token chart draws them. */
export const GmgnMark = (p: IconProps) => (
  <Mark {...p}>
    <rect x="6.3" y="3.4" width="1.5" height="17.2" />
    <rect x="4" y="7.4" width="6.1" height="9.2" />
    <rect x="16.2" y="5.4" width="1.5" height="13.2" />
    <rect x="13.9" y="9.4" width="6.1" height="6.2" />
  </Mark>
);

/**
 * OpenSea: the platform's own mark (Simple Icons), one path, exactly as given — the boat stays
 * inside its filled circle — in the surrounding colour. A filled disc reads heavier than the two
 * open marks beside it, so it is drawn at 16 units against X's 18 and Telegram's 20.
 */
export const OpenSeaMark = (p: IconProps) => (
  <Mark size={16} {...p}>
    <path d="M12 0C5.374 0 0 5.374 0 12s5.374 12 12 12 12-5.374 12-12S18.629 0 12 0ZM5.92 12.403l.051-.081 3.123-4.884a.107.107 0 0 1 .187.014c.52 1.169.972 2.623.76 3.528-.088.372-.335.876-.614 1.342a2.405 2.405 0 0 1-.117.199.106.106 0 0 1-.09.045H6.013a.106.106 0 0 1-.091-.163zm13.914 1.68a.109.109 0 0 1-.065.101c-.243.103-1.07.485-1.414.962-.878 1.222-1.548 2.97-3.048 2.97H9.053a4.019 4.019 0 0 1-4.013-4.028v-.072c0-.058.048-.106.108-.106h3.485c.07 0 .12.063.115.132-.026.226.017.459.125.67.206.42.636.682 1.099.682h1.726v-1.347H9.99a.11.11 0 0 1-.089-.173l.063-.09c.16-.231.391-.586.621-.992.156-.274.308-.566.43-.86.024-.052.043-.107.065-.16.033-.094.067-.182.091-.269a4.57 4.57 0 0 0 .065-.223c.057-.25.081-.514.081-.787 0-.108-.004-.221-.014-.327-.005-.117-.02-.235-.034-.352a3.415 3.415 0 0 0-.048-.312 6.494 6.494 0 0 0-.098-.468l-.014-.06c-.03-.108-.056-.21-.09-.317a11.824 11.824 0 0 0-.328-.972 5.212 5.212 0 0 0-.142-.355c-.072-.178-.146-.339-.213-.49a3.564 3.564 0 0 1-.094-.197 4.658 4.658 0 0 0-.103-.213c-.024-.053-.053-.104-.072-.152l-.211-.388c-.029-.053.019-.118.077-.101l1.32.357h.01l.173.05.192.054.07.019v-.783c0-.379.302-.686.679-.686a.66.66 0 0 1 .477.202.69.69 0 0 1 .2.484V6.65l.141.039c.01.005.022.01.031.017.034.024.084.062.147.11.05.038.103.086.165.137a10.351 10.351 0 0 1 .574.504c.214.199.454.432.684.691.065.074.127.146.192.226.062.079.132.156.19.232.079.104.16.212.235.324.033.053.074.108.105.161.096.142.178.288.257.435.034.067.067.141.096.213.089.197.159.396.202.598a.65.65 0 0 1 .029.132v.01c.014.057.019.12.024.184a2.057 2.057 0 0 1-.106.874c-.031.084-.06.17-.098.254-.075.17-.161.343-.264.502-.034.06-.075.122-.113.182-.043.063-.089.123-.127.18a3.89 3.89 0 0 1-.173.221c-.053.072-.106.144-.166.209-.081.098-.16.19-.245.278-.048.058-.1.118-.156.17-.052.06-.108.113-.156.161-.084.084-.15.147-.208.202l-.137.122a.102.102 0 0 1-.072.03h-1.051v1.346h1.322c.295 0 .576-.104.804-.298.077-.067.415-.36.816-.802a.094.094 0 0 1 .05-.03l3.65-1.057a.108.108 0 0 1 .138.103z" />
  </Mark>
);

// ---------------------------------------------------------------------------------------------
// The one flow graphic, shown in the home page's hero, with the hook at its top (CR-69: no "Buy
// or sell TOWN" box or ETH in / TOWN out arrows above it): every trade passes through TownHook,
// which sends 2% of a buy's ETH to the treasury and records the buy in the tally. The 2% of a
// sell goes to the "Dynamic" box (CR-66): charged in TOWN and burned, or, on a day after one
// whose burn exceeded its rebates (and always at the burn floor), charged in ETH and sent to the
// treasury like the buy fee (CR-55 to CR-57). So the treasury sits in the middle column, where
// the buy fee and the sell fee's ETH-day path both reach it. The treasury keeps 10% of its ETH
// for the owner and pays the other 90% to stakers as WETH; the tally decides the buyers' rebates
// (spec "At a glance", "Fees", "Sell fee currency", "Owner reserve", "Budget and distribution",
// "Finalising a cycle").
//
// 360 x 412 units. The hook spans the top (y 8-72); under it, three columns: buy tally and
// rebates (x 8-116), treasury and stakers (x 126-220), the sell fee (x 230-352). The "Dynamic"
// box shows only its title and the owner's text; the burn floor is explained on the Docs page
// (CR-68).
// ---------------------------------------------------------------------------------------------

/** A box with a title and one or more lines under it; 52 units tall for one line, 14 more per extra line. */
function Node({ x, y, w, title, sub, cls = 'fg-node' }: { x: number; y: number; w: number; title: string; sub: string[]; cls?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={nodeHeight(sub)} class={cls} />
      <text x={x + w / 2} y={y + 22} class="fg-title" text-anchor="middle">
        {title}
      </text>
      {sub.map((l, i) => (
        <text key={l} x={x + w / 2} y={y + 39 + i * 14} class="fg-sub" text-anchor="middle">
          {l}
        </text>
      ))}
    </g>
  );
}
const nodeHeight = (sub: string[]) => 52 + (sub.length - 1) * 14;

/** A labelled downward arrow: the line at `ax`, its label starting 10 units to its right. */
function Down({ ax, y1, y2, kind, lines }: { ax: number; y1: number; y2: number; kind: 'eth' | 'town' | 'data'; lines: string[] }) {
  const mid = (y1 + y2) / 2 - (lines.length - 1) * 7 + 4;
  return (
    <g>
      <path d={`M${ax} ${y1}V${y2}`} class={`fg-${kind}`} marker-end={`url(#fg-arrow-${kind === 'eth' ? 'eth' : 'town'})`} />
      {lines.map((l, i) => (
        <text key={l} x={ax + 10} y={mid + i * 14} class="fg-label">
          {l}
        </text>
      ))}
    </g>
  );
}

// The sell fee's box (CR-66): the owner's text only (CR-68: no floor line).
const DYN = { x: 230, y: 134, w: 122 };
const DYN_TEXT = ['charged in TOWN', 'and burnt from', 'day 1, switches', 'to ETH when a', 'previous day’s burn', 'exceeds rebates'];

export function FlowGraphic() {
  const dynBottom = DYN.y + nodeHeight(DYN_TEXT);
  return (
    <svg
      viewBox="0 0 360 412"
      class="flow-graphic"
      role="img"
      aria-label={`Flow: every trade in the TOWN pool passes through TownHook on Uniswap v4. On a buy TownHook sends 2% of the ETH to the treasury and records the TOWN bought in the day's tally for the buyer's wallet. On a sell it takes 2%, and this fee is dynamic: charged in TOWN and burnt from day 1, it switches to ETH, sent to the treasury like the buy fee, when a previous day's burn exceeds rebates. The treasury keeps 10% of its ETH for the owner; the other 90% goes to stakers, paid every day as WETH and streamed over seven days. From the tally, buyers claim 5% to 5.5% of the TOWN they bought from the reserve, from the next day; the rate moves with the last three days' trading.`}
    >
      <defs>
        <marker id="fg-arrow-eth" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" class="fg-head-eth" />
        </marker>
        <marker id="fg-arrow-town" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" class="fg-head-town" />
        </marker>
      </defs>

      {/* The hook, at the top (CR-69: no "Buy or sell TOWN" box above it) */}
      <rect x="8" y="8" width="344" height="64" class="fg-hook" />
      <text x="180" y="36" class="fg-hook-title" text-anchor="middle">TownHook</text>
      <text x="180" y="56" class="fg-sub" text-anchor="middle">Uniswap v4 · every trade in the TOWN pool</text>

      {/* Hook to the tally, the treasury and the sell fee */}
      <Down ax={28} y1={76} y2={130} kind="data" lines={['records', 'each buy']} />
      <path d="M146 76V200" class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x="156" y="102" class="fg-label">2% of ETH</text>
      <text x="156" y="116" class="fg-label">on buys</text>
      {/* The sell fee leaves the hook in one of two currencies: its label sits between an ETH line and a TOWN line (CR-68) */}
      <path d="M244 76V130" class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x="291" y="107" class="fg-label" text-anchor="middle">
        2% of sells
      </text>
      <path d="M338 76V130" class="fg-town" marker-end="url(#fg-arrow-town)" />

      <Node x={8} y={134} w={108} title="Buy tally" sub={['TOWN per wallet,', 'per day']} />
      <Node x={126} y={204} w={94} title="Treasury" sub={['90% to stakers', '10% owner']} />

      {/* The sell fee (CR-66) */}
      <Node x={DYN.x} y={DYN.y} w={DYN.w} title="Dynamic" sub={DYN_TEXT} />
      {/* ETH days: the sell fee's ETH goes to the treasury, like the buy fee */}
      <path d={`M${DYN.x} 166H198V200`} class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x={DYN.x - 4} y="159" class="fg-label" text-anchor="end">
        on ETH days
      </text>
      {/* Burning days: the TOWN is destroyed */}
      <Down ax={258} y1={dynBottom + 4} y2={dynBottom + 54} kind="town" lines={['on burning', 'days']} />
      <rect x={DYN.x} y={dynBottom + 58} width={DYN.w} height="36" class="fg-burn" />
      <text x={DYN.x + DYN.w / 2} y={dynBottom + 81} class="fg-title" text-anchor="middle">
        Burned
      </text>

      {/* Treasury to stakers, tally to rebates */}
      <Down ax={146} y1={274} y2={328} kind="eth" lines={['daily,', 'as WETH']} />
      <Down ax={28} y1={204} y2={258} kind="town" lines={['from the', 'next day']} />
      <Node x={126} y={332} w={94} title="Stakers" sub={['streamed over', '7 days']} />
      <Node x={8} y={262} w={108} title="Rebates" sub={['5% to 5.5%', 'of buys, from', 'the reserve']} />

      {/* Legend */}
      <path d="M16 364h22" class="fg-eth" />
      <text x="44" y="368" class="fg-sub">ETH, WETH</text>
      <path d="M16 384h22" class="fg-town" />
      <text x="44" y="388" class="fg-sub">TOWN</text>
      <path d="M16 404h22" class="fg-data" />
      <text x="44" y="408" class="fg-sub">record</text>
    </svg>
  );
}
