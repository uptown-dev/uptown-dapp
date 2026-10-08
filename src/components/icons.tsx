// The site's own drawings: the header logo, a handful of line icons and the one flow graphic.
// Colours come from CSS custom properties, so every drawing follows the light or dark theme.

/** The UpTown logo glyph, kept from the first design. The windows are cut out, so the page shows through on both themes. */
export function TowerGlyph() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" class="glyph">
      <path
        fill-rule="evenodd"
        d="M9 29V12h3V8h3V3h2v5h3v4h3v17zM12 15h2v2h-2zM18 15h2v2h-2zM12 20h2v2h-2zM18 20h2v2h-2z"
        fill="var(--logo-gold)"
      />
      <rect x="3" y="29" width="26" height="2" fill="var(--logo-base)" />
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
// The one flow graphic: where ETH and TOWN go on every buy and sell.
// ---------------------------------------------------------------------------------------------

function Node({ x, y, w, title, sub }: { x: number; y: number; w: number; title: string; sub: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height="52" rx="10" class="fg-node" />
      <text x={x + w / 2} y={y + 22} class="fg-title" text-anchor="middle">
        {title}
      </text>
      <text x={x + w / 2} y={y + 39} class="fg-sub" text-anchor="middle">
        {sub}
      </text>
    </g>
  );
}

/**
 * Buy: ETH in, 2% to the Treasury, part paid daily to stakers as WETH over seven days; the
 * buyer's rebate from the reserve after two days; 2% of every sell burned.
 */
export function FlowGraphic() {
  return (
    <svg
      viewBox="0 0 360 344"
      class="flow-graphic"
      role="img"
      aria-label="Flow: a buyer pays ETH into the pool and receives TOWN. 2% of the ETH goes to the treasury, which pays part of it to stakers every day as WETH, spread over seven days. Two days after the buy, the buyer can claim a TOWN rebate from the rebate reserve. Every sell burns 2% of the TOWN sold."
    >
      <defs>
        <marker id="fg-arrow-eth" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" class="fg-head-eth" />
        </marker>
        <marker id="fg-arrow-town" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" class="fg-head-town" />
        </marker>
      </defs>

      {/* Row 1: buyer and pool */}
      <Node x={8} y={8} w={136} title="Buyer" sub="pays ETH" />
      <Node x={216} y={8} w={136} title="TOWN pool" sub="Uniswap v4" />
      <path d="M148 26h64" class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x="180" y="20" class="fg-label" text-anchor="middle">ETH</text>
      <path d="M212 48h-64" class="fg-town" marker-end="url(#fg-arrow-town)" />
      <text x="180" y="64" class="fg-label" text-anchor="middle">TOWN</text>

      {/* Pool to treasury */}
      <path d="M284 64v44" class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x="276" y="91" class="fg-label" text-anchor="end">2% of the ETH</text>
      <Node x={216} y={112} w={136} title="Treasury" sub="10% kept for owner" />

      {/* Treasury to stakers */}
      <path d="M284 168v44" class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x="276" y="187" class="fg-label" text-anchor="end">part, daily,</text>
      <text x="276" y="201" class="fg-label" text-anchor="end">as WETH</text>
      <Node x={216} y={216} w={136} title="Stakers" sub="streamed over 7 days" />

      {/* Rebate reserve to buyer */}
      <Node x={8} y={112} w={136} title="Rebate reserve" sub="500,000,000 TOWN" />
      <path d="M76 108V68" class="fg-town" marker-end="url(#fg-arrow-town)" />
      <text x="84" y="85" class="fg-label">rebate,</text>
      <text x="84" y="99" class="fg-label">after 2 days</text>

      {/* Sells burn */}
      <Node x={8} y={216} w={136} title="Every sell" sub="TOWN for ETH" />
      <path d="M76 272v18" class="fg-town" marker-end="url(#fg-arrow-town)" />
      <rect x="8" y="294" width="136" height="40" rx="10" class="fg-burn" />
      <text x="76" y="319" class="fg-title" text-anchor="middle">2% burned</text>

      {/* Legend */}
      <path d="M216 300h22" class="fg-eth" />
      <text x="246" y="304" class="fg-sub">ETH and WETH</text>
      <path d="M216 322h22" class="fg-town" />
      <text x="246" y="326" class="fg-sub">TOWN</text>
    </svg>
  );
}
