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
// The one flow graphic, with the hook at its centre: every trade passes through the UpTown hook,
// which sends 2% of a buy's ETH to the treasury, records the buy in the tally and burns 2% of a
// sell's TOWN; the treasury pays stakers and the tally decides the buyers' rebates.
// ---------------------------------------------------------------------------------------------

function Node({ x, y, w, title, sub, cls = 'fg-node' }: { x: number; y: number; w: number; title: string; sub: string; cls?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height="52" rx="10" class={cls} />
      <text x={x + w / 2} y={y + 22} class="fg-title" text-anchor="middle">
        {title}
      </text>
      <text x={x + w / 2} y={y + 39} class="fg-sub" text-anchor="middle">
        {sub}
      </text>
    </g>
  );
}

/** A labelled downward arrow in one of the three columns (x is the column's left edge). */
function Down({ x, y1, y2, kind, lines }: { x: number; y1: number; y2: number; kind: 'eth' | 'town' | 'data'; lines: string[] }) {
  const mid = (y1 + y2) / 2 - (lines.length - 1) * 7 + 4;
  return (
    <g>
      <path d={`M${x + 20} ${y1}V${y2}`} class={`fg-${kind}`} marker-end={`url(#fg-arrow-${kind === 'eth' ? 'eth' : 'town'})`} />
      {lines.map((l, i) => (
        <text key={l} x={x + 30} y={mid + i * 14} class="fg-label">
          {l}
        </text>
      ))}
    </g>
  );
}

export function FlowGraphic() {
  return (
    <svg
      viewBox="0 0 360 412"
      class="flow-graphic"
      role="img"
      aria-label="Flow: every trade in the TOWN pool passes through the UpTown hook on Uniswap v4. On a buy the hook sends 2% of the ETH to the treasury and records the buy in the day's tally; on a sell it burns 2% of the TOWN sold. The treasury pays part of its ETH to stakers every day as WETH, spread over seven days. From the tally, buyers claim a TOWN rebate from the reserve two days later."
    >
      <defs>
        <marker id="fg-arrow-eth" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" class="fg-head-eth" />
        </marker>
        <marker id="fg-arrow-town" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" class="fg-head-town" />
        </marker>
      </defs>

      {/* The trader */}
      <Node x={110} y={8} w={140} title="You" sub="buy or sell TOWN" />
      <path d="M160 62v38" class="fg-eth" marker-end="url(#fg-arrow-eth)" />
      <text x="152" y="86" class="fg-label" text-anchor="end">ETH in</text>
      <path d="M200 100V62" class="fg-town" marker-end="url(#fg-arrow-town)" />
      <text x="208" y="86" class="fg-label">TOWN out</text>

      {/* The hook, at the centre */}
      <rect x="8" y="104" width="344" height="64" rx="12" class="fg-hook" />
      <text x="180" y="132" class="fg-hook-title" text-anchor="middle">UpTown hook</text>
      <text x="180" y="152" class="fg-sub" text-anchor="middle">Uniswap v4 · every trade in the TOWN pool</text>

      {/* Hook to treasury, tally and burn */}
      <Down x={8} y1={172} y2={226} kind="eth" lines={['2% of ETH', 'on buys']} />
      <Down x={126} y1={172} y2={226} kind="data" lines={['records', 'each buy']} />
      <Down x={244} y1={172} y2={226} kind="town" lines={['2% of TOWN', 'on sells']} />
      <Node x={8} y={230} w={108} title="Treasury" sub="10% for owner" />
      <Node x={126} y={230} w={108} title="Buy tally" sub="TOWN per day" />
      <Node x={244} y={230} w={108} title="Burned" sub="until 1,000,000" cls="fg-burn" />

      {/* Treasury to stakers, tally to rebates */}
      <Down x={8} y1={286} y2={340} kind="eth" lines={['daily,', 'as WETH']} />
      <Down x={126} y1={286} y2={340} kind="town" lines={['after', '2 days']} />
      <Node x={8} y={344} w={108} title="Stakers" sub="over 7 days" />
      <Node x={126} y={344} w={108} title="Rebates" sub="from the reserve" />

      {/* Legend */}
      <path d="M252 356h22" class="fg-eth" />
      <text x="280" y="360" class="fg-sub">ETH, WETH</text>
      <path d="M252 376h22" class="fg-town" />
      <text x="280" y="380" class="fg-sub">TOWN</text>
      <path d="M252 396h22" class="fg-data" />
      <text x="280" y="400" class="fg-sub">record</text>
    </svg>
  );
}
