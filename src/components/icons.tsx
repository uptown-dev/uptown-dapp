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
// THE PLATFORM MARKS IN THE FOOTER (CR-84, CR-87, CR-88). The site's security policy allows no
// picture from another host (`img-src 'self' data:`), so every mark is drawn in the page, like
// every other icon here: inline SVG, sharp at any size, and nothing fetched from anywhere.
//
// Each mark is its platform's trademark, drawn here only to point at the project's own account or
// token page on that platform, which is what the marks are for. The project claims nothing in any
// of them. X's and OpenSea's glyphs come from Simple Icons, a public collection of these marks,
// and the drawings themselves carry no licence conditions; GMGN's is GMGN's own, taken from
// `gmgn.ai/static/logo_small2.svg`; the Telegram paper plane is the site's own drawing (the
// owner's choice, CR-87). No path here is redrawn, re-spaced, cropped or part-recoloured.
//
// CR-88 item 6: **each mark now carries its platform's brand colour** instead of following the
// footer's text colour.
//   - X has no single colour: it is published black on light and white on dark. So its fill is the
//     token `--mark-x`, which the stylesheet sets to #000000 on `:root` and to #ffffff in both dark
//     blocks — the same three-block light/dark cascade the owner's skyline logo and every colour on
//     the site already follow, decided by CSS alone with no JavaScript theme check anywhere.
//   - Telegram is #26A5E4, OpenSea #2081E2, and both are the same in either theme, so they are
//     plain tokens on `:root`.
//   - OpenSea's glyph is a filled disc with the boat cut out of it as a hole, so a bare fill would
//     let the footer show through the boat and the boat would turn dark on the dark footer. A white
//     disc is drawn **behind** the glyph (`.mark-opensea-disc`) so the boat reads white in both
//     themes, as the published mark does. The glyph path itself is untouched.
//   - GMGN's mark is a full-colour pixel drawing with no one-colour form, so it keeps its own
//     colours: its root carries `fill="none"` and every shape its own fill, and no rule in the
//     stylesheet paints it.
//
// CR-88 item 7, the sizes: the boxes are not what the eye compares, the visible drawing is. X's
// cross reaches the edges of its box and GMGN's frog fills its own, while Telegram's plane stops
// well short of the edges and OpenSea's boat sits inside a disc and is only about three fifths of
// it. So the four are scaled by what shows, not by their boxes, and the OpenSea disc ends up larger
// than X's box rather than smaller (F9r had shrunk it to 16). Judged in the ordinary-resolution
// photographs in both themes, not only in the enlarged ones.
//
// GMGN's size is also fixed by its drawing: a 32-unit grid of 2-unit blocks, so only 16 px (one
// screen pixel per block) and 32 px (two) land on whole pixels, and 32 px does not fit the 32 px
// mark box (30 px inside its border). Hence 16.
//
// Each mark carries its platform's name for a screen reader and in its tooltip (see `PlaceMark` in
// app.tsx), so nothing depends on recognising a drawing alone.
// ---------------------------------------------------------------------------------------------

/** A platform mark in a 24-unit box; `cls` is the class the stylesheet paints it with. */
function Mark({ size = 20, cls, children }: IconProps & { cls: string; children: preact.ComponentChildren }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" class={`icon mark ${cls}`}>
      {children}
    </svg>
  );
}

/** X: the platform's own mark (Simple Icons), one path, exactly as given, black on light and white on dark. */
export const XMark = (p: IconProps) => (
  <Mark size={18} cls="mark-x" {...p}>
    <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
  </Mark>
);

/** Telegram: the site's own paper plane, shape untouched (the owner likes it), in Telegram's #26A5E4. */
export const TelegramMark = (p: IconProps) => (
  <Mark size={22} cls="mark-telegram" {...p}>
    <path d="M22 2.6 2 10.8l6.6 2.6L9.8 21l3.5-5.4 5.3 5.2z" />
  </Mark>
);

/**
 * GMGN: GMGN's own mark, the pixel-art frog from `gmgn.ai/static/logo_small2.svg`, used exactly as
 * it is. It is a full-colour drawing with no one-colour form, so it keeps its own colours: nothing
 * here is `currentColor` and no stylesheet rule paints it. The clip path's id is the site's own
 * (`uptown-gmgn-clip` in place of the file's `clip0_468_9437`) so it cannot collide with anything
 * else on the page, and the file's fixed `width="32" height="32"` is gone so the mark is sized the
 * same way the other three are. 16 px: the drawing is a 32-unit grid of 2-unit blocks, so 16 px
 * puts exactly one screen pixel on each block.
 */
export const GmgnMark = ({ size = 16 }: IconProps) => (
  <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true" class="icon mark mark-gmgn">
    <g clip-path="url(#uptown-gmgn-clip)">
      <path d="M8 30V32H30V30H28V26H26V24H28V22H30V20H32V12H30V4H28V2H22V4H20V8H18V4H16V2H10V4H8V12H4V10H0V20H2V22H8V24H12V26H10V30H8Z" fill="#9ED455" />
      <path fill-rule="evenodd" clip-rule="evenodd" d="M16 2H14V4H16V6V8V10H18H20H22V8V6V4L20 4V6V8H18V6V4H16V2ZM6 20H8V22H6H4H2L2 20H4H6ZM4 12H2L2 14L2 16V18L2 20H0V18V16V14V12V10H2H4V12ZM4 12V14H6H8V12H10V10V8V6V4L8 4V6V8V10V12H6H4ZM12 26V24H10H8V22H10H12H14V24V26H12ZM10 30V28V26H12V28V30H10ZM10 30V32H8V30H10ZM30 30H28V28V26H26V24H28V22H30V20H32V18V16V14V12H30V10V8V6V4H28V2H26V4H28V6V8V10V12H30V14V16V18V20H28V22H26H24V24V26H26V28V30H28V32H30V30Z" fill="#457F2C" />
      <rect x="10" y="6" width="4" height="6" fill="white" />
      <rect x="10" y="8" width="2" height="4" fill="black" />
      <rect x="12" y="18" width="2" height="6" transform="rotate(90 12 18)" fill="black" />
      <path fill-rule="evenodd" clip-rule="evenodd" d="M14 4V6L10 6V4H14ZM4 14L4 12H2V14H4ZM4 14H10V16H4V14ZM26 6V4H22V6L26 6Z" fill="#D5F86B" />
      <rect x="22" y="30" width="2" height="10" transform="rotate(90 22 30)" fill="#D09C4F" />
      <rect x="22" y="28" width="2" height="8" transform="rotate(90 22 28)" fill="#D09C4F" />
      <rect x="20" y="26" width="2" height="6" transform="rotate(90 20 26)" fill="#D09C4F" />
      <rect x="20" y="24" width="2" height="4" transform="rotate(90 20 24)" fill="#D09C4F" />
      <path fill-rule="evenodd" clip-rule="evenodd" d="M28 12V6H26V12H28ZM10 14V12H8V14H10ZM6 18V20H2V18H6ZM30 20V18V14H28V18H26V20H22V22V24H20V26H22H24V30H26V32H28V30H26V26H24V22H28V20H30ZM14 20V22H8V20H14ZM14 26V22H16V26H14ZM12 30V26H14V30H12ZM12 30H10V32H12V30ZM22 10V12H20V10H22Z" fill="#57A756" />
      <rect x="22" y="6" width="4" height="6" fill="white" />
      <rect x="22" y="8" width="2" height="4" fill="black" />
    </g>
    <defs>
      <clipPath id="uptown-gmgn-clip">
      <rect width="32" height="32" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

/**
 * OpenSea: the platform's own mark (Simple Icons), one path, exactly as given — the boat stays a
 * hole inside the filled disc — in OpenSea's #2081E2, with a white disc behind it so the boat reads
 * white in either theme (CR-88 item 6). 28 units, the largest of the four: the boat is only about
 * three fifths of the disc, so at X's 18 the boat read far smaller than the X beside it.
 */
export const OpenSeaMark = (p: IconProps) => (
  <Mark size={28} cls="mark-opensea" {...p}>
    <circle class="mark-opensea-disc" cx="12" cy="12" r="11.5" />
    <path d="M12 0C5.374 0 0 5.374 0 12s5.374 12 12 12 12-5.374 12-12S18.629 0 12 0ZM5.92 12.403l.051-.081 3.123-4.884a.107.107 0 0 1 .187.014c.52 1.169.972 2.623.76 3.528-.088.372-.335.876-.614 1.342a2.405 2.405 0 0 1-.117.199.106.106 0 0 1-.09.045H6.013a.106.106 0 0 1-.091-.163zm13.914 1.68a.109.109 0 0 1-.065.101c-.243.103-1.07.485-1.414.962-.878 1.222-1.548 2.97-3.048 2.97H9.053a4.019 4.019 0 0 1-4.013-4.028v-.072c0-.058.048-.106.108-.106h3.485c.07 0 .12.063.115.132-.026.226.017.459.125.67.206.42.636.682 1.099.682h1.726v-1.347H9.99a.11.11 0 0 1-.089-.173l.063-.09c.16-.231.391-.586.621-.992.156-.274.308-.566.43-.86.024-.052.043-.107.065-.16.033-.094.067-.182.091-.269a4.57 4.57 0 0 0 .065-.223c.057-.25.081-.514.081-.787 0-.108-.004-.221-.014-.327-.005-.117-.02-.235-.034-.352a3.415 3.415 0 0 0-.048-.312 6.494 6.494 0 0 0-.098-.468l-.014-.06c-.03-.108-.056-.21-.09-.317a11.824 11.824 0 0 0-.328-.972 5.212 5.212 0 0 0-.142-.355c-.072-.178-.146-.339-.213-.49a3.564 3.564 0 0 1-.094-.197 4.658 4.658 0 0 0-.103-.213c-.024-.053-.053-.104-.072-.152l-.211-.388c-.029-.053.019-.118.077-.101l1.32.357h.01l.173.05.192.054.07.019v-.783c0-.379.302-.686.679-.686a.66.66 0 0 1 .477.202.69.69 0 0 1 .2.484V6.65l.141.039c.01.005.022.01.031.017.034.024.084.062.147.11.05.038.103.086.165.137a10.351 10.351 0 0 1 .574.504c.214.199.454.432.684.691.065.074.127.146.192.226.062.079.132.156.19.232.079.104.16.212.235.324.033.053.074.108.105.161.096.142.178.288.257.435.034.067.067.141.096.213.089.197.159.396.202.598a.65.65 0 0 1 .029.132v.01c.014.057.019.12.024.184a2.057 2.057 0 0 1-.106.874c-.031.084-.06.17-.098.254-.075.17-.161.343-.264.502-.034.06-.075.122-.113.182-.043.063-.089.123-.127.18a3.89 3.89 0 0 1-.173.221c-.053.072-.106.144-.166.209-.081.098-.16.19-.245.278-.048.058-.1.118-.156.17-.052.06-.108.113-.156.161-.084.084-.15.147-.208.202l-.137.122a.102.102 0 0 1-.072.03h-1.051v1.346h1.322c.295 0 .576-.104.804-.298.077-.067.415-.36.816-.802a.094.094 0 0 1 .05-.03l3.65-1.057a.108.108 0 0 1 .138.103z" />
  </Mark>
);

// ---------------------------------------------------------------------------------------------
// The one flow graphic, shown in the home page's hero, with the hook at its top (CR-69: no "Buy
// or sell SKYLINE" box or ETH in / SKYLINE out arrows above it): every trade passes through SkylineHook,
// which sends 2% of a buy's ETH to the treasury and records the buy in the tally. The 2% of a
// sell goes to the "Dynamic" box (CR-66): charged in SKYLINE and burned, or, on a day after one
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
// CR-105: "charged in $SKYLINE" filled the box edge to edge, so the owner's words break over seven
// lines instead of six; the words and their order are unchanged.
const DYN_TEXT = ['charged in', '$SKYLINE and', 'burnt from day 1,', 'switches to ETH', 'when a previous', 'day’s burn', 'exceeds rebates'];

export function FlowGraphic() {
  const dynBottom = DYN.y + nodeHeight(DYN_TEXT);
  return (
    <svg
      viewBox="0 0 360 412"
      class="flow-graphic"
      role="img"
      aria-label={`Flow: every trade in the $SKYLINE pool passes through SkylineHook on Uniswap v4. On a buy SkylineHook sends 2% of the ETH to the treasury and records the $SKYLINE bought in the day's tally for the buyer's wallet. On a sell it takes 2%, and this fee is dynamic: charged in $SKYLINE and burnt from day 1, it switches to ETH, sent to the treasury like the buy fee, when a previous day's burn exceeds rebates. The treasury keeps 10% of its ETH for the owner; the other 90% goes to stakers, paid every day as WETH and streamed over seven days. From the tally, buyers claim 5% to 5.5% of the $SKYLINE they bought from the reserve, from the next day; the rate moves with the last three days' trading.`}
    >
      <defs>
        <marker id="fg-arrow-eth" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" class="fg-head-eth" />
        </marker>
        <marker id="fg-arrow-town" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" class="fg-head-town" />
        </marker>
      </defs>

      {/* The hook, at the top (CR-69: no "Buy or sell SKYLINE" box above it) */}
      <rect x="8" y="8" width="344" height="64" class="fg-hook" />
      <text x="180" y="36" class="fg-hook-title" text-anchor="middle">SkylineHook</text>
      <text x="180" y="56" class="fg-sub" text-anchor="middle">Uniswap v4 · every trade in the $SKYLINE pool</text>

      {/* Hook to the tally, the treasury and the sell fee */}
      <Down ax={28} y1={76} y2={130} kind="data" lines={['records', 'each buy']} />
      <path d="M146 76V200" class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x="156" y="102" class="fg-label">2% of ETH</text>
      <text x="156" y="116" class="fg-label">on buys</text>
      {/* The sell fee leaves the hook in one of two currencies: its label sits between an ETH line and a SKYLINE line (CR-68) */}
      <path d="M244 76V130" class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x="291" y="107" class="fg-label" text-anchor="middle">
        2% of sells
      </text>
      <path d="M338 76V130" class="fg-town" marker-end="url(#fg-arrow-town)" />

      {/* CR-102: "SKYLINE per wallet," is wider than the box, so the owner's words break over three lines, unchanged. */}
      <Node x={8} y={134} w={108} title="Buy tally" sub={['$SKYLINE', 'per wallet,', 'per day']} />
      <Node x={126} y={204} w={94} title="Treasury" sub={['90% to stakers', '10% owner']} />

      {/* The sell fee (CR-66) */}
      <Node x={DYN.x} y={DYN.y} w={DYN.w} title="Dynamic" sub={DYN_TEXT} />
      {/* ETH days: the sell fee's ETH goes to the treasury, like the buy fee */}
      <path d={`M${DYN.x} 166H198V200`} class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x={DYN.x - 4} y="159" class="fg-label" text-anchor="end">
        on ETH days
      </text>
      {/* Burning days: the SKYLINE is destroyed */}
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
      <text x="44" y="388" class="fg-sub">$SKYLINE</text>
      <path d="M16 404h22" class="fg-data" />
      <text x="44" y="408" class="fg-sub">record</text>
    </svg>
  );
}
