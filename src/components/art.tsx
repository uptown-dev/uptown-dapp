// UpTown's illustrations, drawn for this site as inline SVG. Every graphic stands on the
// street-level line (brick red) with the town rising above it.
import type { JSX } from 'preact';

const C = {
  sky: '#151a3d',
  skyDeep: '#0e1130',
  wall: '#262c5c',
  wallDark: '#1d234f',
  wallLight: '#343c78',
  edge: '#46508f',
  brick: '#b5462f',
  brickDeep: '#7d2c1d',
  gold: '#e9b44c',
  goldSoft: '#f4d690',
  stone: '#c9c4b8',
  stoneDark: '#8e897d',
  slate: '#8d91a6',
  slateDark: '#5f6378',
  ground: '#0b0d22',
};

/** Deterministic pseudo-random in [0, 1) for window patterns. */
function rnd(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type SvgProps = { title?: string; class?: string };

function Title({ title }: { title?: string }) {
  return title ? <title>{title}</title> : null;
}

/** The street-level line every graphic stands on. */
function Street({ y, w }: { y: number; w: number }) {
  return (
    <g>
      <rect x="0" y={y} width={w} height="4" fill={C.brick} />
      <rect x="0" y={y + 4} width={w} height="14" fill={C.ground} opacity="0.55" />
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Bellamy, the rooftop pigeon
// ---------------------------------------------------------------------------------------------

export function Bellamy({ x = 0, y = 0, scale = 1, flip = false }: { x?: number; y?: number; scale?: number; flip?: boolean }) {
  const id = `neck-${Math.round(x)}-${Math.round(y)}`;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3b4385" />
          <stop offset="0.55" stop-color="#5a62a8" />
          <stop offset="1" stop-color={C.gold} />
        </linearGradient>
      </defs>
      {/* tail */}
      <path d="M-30 -6 L-46 -2 L-44 4 L-28 2 Z" fill={C.slateDark} />
      {/* body */}
      <ellipse cx="-8" cy="-8" rx="24" ry="14" fill={C.slate} />
      {/* wing */}
      <path d="M-26 -10 Q-8 -24 10 -12 Q-4 -2 -26 -4 Z" fill={C.slateDark} />
      <path d="M-20 -8 L-6 -9 M-18 -5 L-4 -6" stroke="#4c5064" stroke-width="1.4" />
      {/* neck */}
      <path d="M6 -16 Q16 -22 16 -30 L22 -30 Q24 -16 12 -4 Z" fill={`url(#${id})`} />
      {/* head */}
      <circle cx="19" cy="-33" r="8" fill={C.slate} />
      <circle cx="21.5" cy="-34.5" r="1.8" fill="#f2e6c9" />
      <circle cx="22" cy="-34.5" r="0.9" fill="#1b1b24" />
      <path d="M26 -33 L33 -31 L26 -29.5 Z" fill="#d9c7a0" />
      {/* legs and the brick-red band No. 0 */}
      <path d="M-10 5 L-12 13 M-2 5 L0 13" stroke="#c98a7c" stroke-width="2" stroke-linecap="round" />
      <rect x="-4.5" y="6.5" width="6" height="3.4" rx="1" fill={C.brick} />
      <path d="M-15 13 L-8 13 M-3 13 L4 13" stroke="#c98a7c" stroke-width="1.6" stroke-linecap="round" />
    </g>
  );
}

export function BellamyBadge({ title = 'Bellamy, the rooftop pigeon' }: SvgProps) {
  return (
    <svg viewBox="0 0 120 90" role="img" aria-label={title}>
      <Title title={title} />
      <rect x="0" y="70" width="120" height="3" fill={C.brick} />
      <Bellamy x={62} y={66} scale={1.15} />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Small icons
// ---------------------------------------------------------------------------------------------

export function BellIcon({ title }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
      <Title title={title} />
      <path d="M12 2.5c.8 0 1.4.6 1.4 1.3v.7c3 .7 5 3.3 5 6.4v4.2l1.8 2.4H3.8l1.8-2.4v-4.2c0-3.1 2-5.7 5-6.4v-.7c0-.7.6-1.3 1.4-1.3z" fill={C.gold} />
      <path d="M9.6 19.2a2.4 2.4 0 0 0 4.8 0z" fill={C.goldSoft} />
      <path d="M7.4 11c.2-1.8 1.3-3.2 2.9-3.8" stroke="#fff3cf" stroke-width="1.2" fill="none" stroke-linecap="round" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke={C.stone} stroke-width="1.8" />
      <rect x="11" y="10" width="2" height="7" rx="1" fill={C.stone} />
      <circle cx="12" cy="7" r="1.3" fill={C.stone} />
    </svg>
  );
}

export function WarnIcon({ color = C.gold }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.8 22 20.5H2z" fill="none" stroke={color} stroke-width="1.8" stroke-linejoin="round" />
      <rect x="11" y="9" width="2" height="6.5" rx="1" fill={color} />
      <circle cx="12" cy="17.6" r="1.2" fill={color} />
    </svg>
  );
}

export function ScrollIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h11a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1h11v1a1.5 1.5 0 0 0 3 0" fill="none" stroke={C.goldSoft} stroke-width="1.6" stroke-linejoin="round" />
      <path d="M8 7h7M8 10h7M8 13h5" stroke={C.goldSoft} stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

export function PileIcon() {
  return (
    <svg viewBox="0 0 34 26" aria-hidden="true">
      <rect x="0" y="23" width="34" height="2" fill={C.brick} />
      <path d="M3 23c0-3 2-5 4-5s4 2 4 5zM11 23c0-4 3-7 6-7s6 3 6 7zM22 23c0-3 2-5 4.5-5S31 20 31 23z" fill={C.gold} />
      <path d="M14 9c1.5 2 3 3.6 3 5.2a3 3 0 0 1-6 0C11 12.6 12.5 11 14 9z" fill="#8fb3e8" />
      <path d="M22 4c1.2 1.6 2.4 2.9 2.4 4.2a2.4 2.4 0 0 1-4.8 0c0-1.3 1.2-2.6 2.4-4.2z" fill="#8fb3e8" />
    </svg>
  );
}

export function TowerGlyph() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M9 29V12h3V8h3V3h2v5h3v4h3v17z" fill={C.gold} />
      <path d="M12 15h2v2h-2zM18 15h2v2h-2zM12 20h2v2h-2zM18 20h2v2h-2z" fill={C.skyDeep} />
      <rect x="3" y="29" width="26" height="2" fill={C.brick} />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// The skyline: grows taller with each Age
// ---------------------------------------------------------------------------------------------

const BUILDINGS = [
  { x: 6, w: 46, h0: 38, g: 11 },
  { x: 56, w: 34, h0: 52, g: 9 },
  { x: 94, w: 56, h0: 42, g: 14 },
  { x: 154, w: 40, h0: 62, g: 10 },
  { x: 198, w: 64, h0: 46, g: 13 },
  { x: 368, w: 50, h0: 56, g: 12 },
  { x: 422, w: 38, h0: 40, g: 16 },
  { x: 464, w: 64, h0: 48, g: 11 },
  { x: 532, w: 42, h0: 64, g: 9 },
  { x: 578, w: 58, h0: 36, g: 14 },
];

const STARS = Array.from({ length: 42 }, (_, i) => ({ x: rnd(i) * 640, y: rnd(i + 99) * 120, r: rnd(i + 7) > 0.85 ? 1.5 : 0.9 }));

export function Skyline({
  age,
  title,
  compact = false,
  showBellamy = true,
}: SvgProps & { age: number; compact?: boolean; showBellamy?: boolean }) {
  const ground = 208;
  const a = Math.max(0, Math.min(6, age));
  return (
    <svg viewBox="0 0 640 252" role="img" aria-label={title ?? `The UpTown skyline in Age ${a + 1}`} preserveAspectRatio="xMidYMax meet">
      <Title title={title} />
      {!compact && (
        <g>
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fdf3d6" opacity={0.35 + rnd(i + 3) * 0.6} />
          ))}
        </g>
      )}
      {BUILDINGS.map((b, i) => {
        const h = b.h0 + b.g * a;
        const next = a < 6 ? b.h0 + b.g * (a + 1) : h;
        const top = ground - h;
        const cols = Math.floor((b.w - 8) / 11);
        const rows = Math.floor((h - 10) / 14);
        return (
          <g key={i}>
            {a < 6 && !compact && (
              <rect x={b.x + 0.5} y={ground - next} width={b.w - 1} height={next - h} fill="none" stroke={C.edge} stroke-dasharray="3 4" opacity="0.7" />
            )}
            <rect x={b.x} y={top} width={b.w} height={h} fill={i % 2 ? C.wall : C.wallDark} />
            <rect x={b.x} y={top} width={b.w} height="3" fill={C.edge} />
            {!compact &&
              Array.from({ length: rows }).map((_, r) =>
                Array.from({ length: cols }).map((__, c) => {
                  const lit = rnd(i * 97 + r * 13 + c) > 0.62;
                  return (
                    <rect
                      key={`${r}-${c}`}
                      class={lit ? 'lit' : undefined}
                      x={b.x + 6 + c * 11}
                      y={top + 8 + r * 14}
                      width="5"
                      height="7"
                      fill={lit ? C.gold : '#141836'}
                      opacity={lit ? 0.92 : 1}
                    />
                  );
                }),
              )}
          </g>
        );
      })}
      {/* The Tower: five floors, always standing */}
      <g>
        <rect x="270" y={ground - 150} width="92" height="150" fill={C.wallLight} />
        {[0, 1, 2, 3, 4].map((f) => (
          <g key={f}>
            <rect x="270" y={ground - 30 * (f + 1)} width="92" height="1.5" fill={C.edge} />
            {!compact &&
              [0, 1, 2, 3, 4].map((w) => (
                <rect key={w} class="lit" x={279 + w * 16} y={ground - 30 * (f + 1) + 9} width="8" height="13" fill={rnd(f * 7 + w) > 0.35 ? C.gold : '#141836'} />
              ))}
          </g>
        ))}
        <path d={`M266 ${ground - 150} h100 l-8 -10 l-10 6 l-8 -14 l-8 12 l-8 -16 l-8 16 l-8 -12 l-8 14 l-10 -6 z`} fill={C.gold} />
        {!compact && <path d={`M316 ${ground - 176} v-22 M316 ${ground - 196} l12 3 l-12 3`} stroke={C.stone} stroke-width="2" fill={C.stone} />}
        {showBellamy && !compact && <Bellamy x={340} y={ground - 157} scale={0.55} />}
      </g>
      <Street y={ground} w={640} />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// The Tower, floor by floor
// ---------------------------------------------------------------------------------------------

export interface FloorView {
  lit: number; // windows lit, 0 to 6
  empty: boolean;
  pile: boolean;
  mine: boolean;
  name: string;
}

export function TowerArt({ floors, vane, title }: SvgProps & { floors: FloorView[]; vane: 'ok' | 'frozen' | 'stopped' }) {
  const base = 344;
  const fh = 50;
  const x = 70;
  const w = 170;
  return (
    <svg viewBox="0 0 310 380" role="img" aria-label={title ?? 'The Tower: five floors, the Crown at the top'}>
      <Title title={title} />
      {floors.map((f, i) => {
        const y = base - fh * (i + 1);
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={fh} fill={i % 2 ? C.wall : C.wallLight} stroke={f.mine ? C.gold : C.edge} stroke-width={f.mine ? 3 : 1} />
            {[0, 1, 2, 3, 4, 5].map((k) => {
              const on = k < f.lit;
              return <rect key={k} class={on ? 'lit' : undefined} x={x + 12 + k * 26} y={y + 12} width="16" height="26" rx="1" fill={on ? C.gold : '#11142e'} stroke={on ? C.goldSoft : '#2b3166'} stroke-width="1" />;
            })}
            <text x={x - 10} y={y + fh / 2 + 5} text-anchor="end" fill={f.mine ? C.goldSoft : C.stone} font-size="14" font-family="Cinzel, serif" font-weight="700">{i + 1}</text>
            {f.pile && (
              <g transform={`translate(${x + w + 6} ${y + fh - 4})`}>
                <path d="M0 0c0-6 4-10 8-10s8 4 8 10zM12 0c0-8 5-13 10-13s10 5 10 13z" fill={C.gold} />
                <path d="M16 -24c2 3 4 5 4 7.5a4 4 0 0 1-8 0c0-2.5 2-4.5 4-7.5z" fill="#8fb3e8" />
              </g>
            )}
          </g>
        );
      })}
      {/* the Crown's parapet */}
      <path d={`M${x - 6} ${base - fh * 5} h${w + 12} l-10 -14 l-14 8 l-12 -18 l-12 14 l-14 -22 l-14 22 l-12 -14 l-12 18 l-14 -8 z`} fill={C.gold} />
      {/* the Weathervane */}
      <g transform={`translate(${x + w / 2} ${base - fh * 5 - 22})`}>
        <path d="M0 0 v-34" stroke={vane === 'ok' ? C.stone : '#9fb6d9'} stroke-width="2.5" />
        <path d="M-18 -30 h30 l6 -4 l-6 -4 h-30 l4 4 z" fill={vane === 'ok' ? C.stone : vane === 'frozen' ? '#9fb6d9' : C.stoneDark} transform={vane === 'ok' ? 'rotate(-8 0 -34)' : undefined} />
        {vane !== 'ok' && <path d="M-14 -26 v6 M-4 -26 v8 M6 -26 v5" stroke="#cfe0f7" stroke-width="2" stroke-linecap="round" />}
      </g>
      <Bellamy x={x + w - 26} y={base - fh * 5 - 2} scale={0.62} />
      {/* the front steps of the Stoop */}
      <path d={`M${x + 64} ${base} h42 v-6 h-36 z`} fill={C.stoneDark} />
      <Street y={base} w={310} />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// The places
// ---------------------------------------------------------------------------------------------

export function GateArt({ title, toll }: SvgProps & { toll?: boolean }) {
  return (
    <svg viewBox="0 0 320 220" role="img" aria-label={title ?? 'The Gate, with the masked Gatekeeper and the Ledger'}>
      <Title title={title} />
      {toll && (
        <g aria-hidden="true">
          {[-60, -30, 0, 30, 60].map((a) => (
            <path key={a} d="M160 180 L160 60" transform={`rotate(${a} 160 180)`} stroke="#ff9a4a" stroke-width="5" stroke-linecap="round" opacity="0.55" />
          ))}
          <path d="M80 180a80 80 0 0 1 160 0z" fill="#ff8a3d" opacity="0.8" />
        </g>
      )}
      <path d="M40 180V70l20-14 20 14v110zM240 180V70l20-14 20 14v110z" fill={C.wallLight} stroke={C.edge} />
      <path d="M80 180V96a80 64 0 0 1 160 0v84h-26V100a54 44 0 0 0-108 0v80z" fill={C.wall} stroke={C.edge} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={108 + i * 18} y="98" width="4" height="82" fill={C.slateDark} />
      ))}
      <rect x="104" y="120" width="112" height="4" fill={C.slateDark} />
      <rect x="104" y="150" width="112" height="4" fill={C.slateDark} />
      <path d="M140 40h40l-6-10h-28z" fill={C.gold} />
      <rect x="150" y="40" width="20" height="18" fill={C.gold} />
      {/* the Gatekeeper */}
      <g transform="translate(262 180)">
        <path d="M-16 0c0-24 6-40 16-40s16 16 16 40z" fill="#3a2f55" />
        <circle cx="0" cy="-48" r="10" fill="#3a2f55" />
        <rect x="-9" y="-52" width="18" height="6" rx="3" fill={C.gold} />
      </g>
      {/* the Ledger */}
      <g transform="translate(26 166)">
        <rect x="0" y="0" width="34" height="14" fill={C.brick} />
        <path d="M0 0l17-6 17 6" fill="#f0e3c4" stroke={C.brickDeep} />
      </g>
      <Street y={180} w={320} />
    </svg>
  );
}

export function GranaryArt({ title, open = true }: SvgProps & { open?: boolean }) {
  return (
    <svg viewBox="0 0 320 220" role="img" aria-label={title ?? 'The Granary'}>
      <Title title={title} />
      <rect x="196" y="44" width="70" height="136" rx="6" fill={C.stoneDark} />
      <path d="M196 50a35 22 0 0 1 70 0z" fill={C.stone} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x="196" y={66 + i * 16} width="70" height="2" fill="#6f6a60" />
      ))}
      <path d="M44 180V96l76-48 76 48v84z" fill={C.brick} />
      <path d="M36 100l84-56 84 56" fill="none" stroke={C.brickDeep} stroke-width="8" stroke-linejoin="round" />
      <rect x="92" y="116" width="56" height="64" fill={open ? '#2a1c0c' : C.brickDeep} />
      {open ? (
        <g>
          <circle cx="120" cy="146" r="22" fill={C.gold} opacity="0.25" />
          <path d="M100 180c0-10 9-16 20-16s20 6 20 16z" fill={C.gold} />
          <path d="M92 116l-16 8v56l16-6zM148 116l16 8v56l-16-6z" fill={C.brickDeep} />
        </g>
      ) : (
        <path d="M92 116l56 64M148 116l-56 64" stroke="#5b2014" stroke-width="5" />
      )}
      <circle cx="120" cy="84" r="9" fill={C.gold} />
      <Street y={180} w={320} />
    </svg>
  );
}

export function TownHallArt({ title, flowing = true }: SvgProps & { flowing?: boolean }) {
  return (
    <svg viewBox="0 0 340 220" role="img" aria-label={title ?? 'The Town Hall, the Fountain and the Aqueduct'}>
      <Title title={title} />
      <path d="M30 70l90-40 90 40z" fill={C.stone} />
      <rect x="34" y="70" width="172" height="12" fill={C.stoneDark} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={44 + i * 28} y="82" width="12" height="80" fill={C.stone} />
      ))}
      <rect x="28" y="162" width="184" height="18" fill={C.stoneDark} />
      <circle cx="120" cy="56" r="8" fill={C.gold} />
      {/* the Mayor's Purse */}
      <g transform="translate(184 140)">
        <path d="M0 22c-12 0-14-8-10-14l6-6-3-5h14l-3 5 6 6c4 6 2 14-10 14z" fill={C.gold} />
      </g>
      {/* the Fountain */}
      <g transform="translate(120 180)">
        <path d="M-34 0h68l-6-12h-56z" fill={C.stoneDark} />
        <rect x="-4" y="-34" width="8" height="22" fill={C.stone} />
        <path d="M-14 -34h28l-4-6h-20z" fill={C.stone} />
        {flowing && <path d="M0 -42c-10 -10 -18 0 -22 14M0 -42c10 -10 18 0 22 14" stroke="#8fb3e8" stroke-width="2.5" fill="none" stroke-linecap="round" />}
      </g>
      {/* the Aqueduct towards the Tower */}
      <g>
        <rect x="212" y="98" width="128" height="10" fill={C.stoneDark} />
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${216 + i * 31} 180v-60a12 12 0 0 1 24 0v60`} fill="none" stroke={C.stoneDark} stroke-width="7" />
        ))}
        {flowing && <rect x="212" y="94" width="128" height="4" fill="#8fb3e8" opacity="0.85" />}
      </g>
      <Street y={180} w={340} />
    </svg>
  );
}

export function FurnaceArt({ title, cold = false }: SvgProps & { cold?: boolean }) {
  return (
    <svg viewBox="0 0 220 200" role="img" aria-label={title ?? 'The Furnace'}>
      <Title title={title} />
      {!cold && <circle cx="110" cy="118" r="42" fill="#ff8a3d" opacity="0.18" />}
      <rect x="132" y="30" width="26" height="80" fill={C.brickDeep} />
      {!cold && <path d="M145 26c-8-8 6-12-2-22M152 24c6-6-4-10 2-18" stroke="#7d7a92" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7" />}
      <path d="M50 160V100a60 50 0 0 1 120 0v60z" fill={C.brick} />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c) => <rect key={`${r}${c}`} x={56 + c * 22 + (r % 2) * 11} y={104 + r * 14} width="18" height="2" fill={C.brickDeep} />),
      )}
      <path d="M84 160v-30a26 22 0 0 1 52 0v30z" fill={cold ? '#2b2433' : '#3b1a0e'} />
      {!cold && <path d="M96 160c0-12 6-14 6-24 6 6 8 10 8 4 6 8 12 10 12 20z" fill="#ffb347" />}
      <Street y={160} w={220} />
    </svg>
  );
}

export function FoundationArt({ title }: SvgProps) {
  return (
    <svg viewBox="0 0 260 200" role="img" aria-label={title ?? 'The Sealed Foundation'}>
      <Title title={title} />
      <rect x="20" y="60" width="220" height="40" fill={C.wall} />
      <path d="M30 100V70h30v30M74 100V64h30v36M118 100V72h30v28M162 100V66h30v34M206 100V74h26v26" fill={C.wallLight} />
      <rect x="0" y="100" width="260" height="4" fill={C.brick} />
      <rect x="0" y="104" width="260" height="30" fill="#3a3550" />
      <rect x="0" y="134" width="260" height="30" fill="#2c2840" />
      <rect x="0" y="164" width="260" height="36" fill="#1f1c30" />
      <rect x="86" y="118" width="88" height="36" rx="3" fill="#d9c9a3" />
      <path d="M92 126h64M92 134h70M92 142h52" stroke="#8e7f5c" stroke-width="2" />
      <circle cx="166" cy="150" r="13" fill={C.brick} />
      <path d="M160 150l4 4 8-8" stroke="#ffd9cc" stroke-width="2.4" fill="none" stroke-linecap="round" />
    </svg>
  );
}

export function MarketArt({ title }: SvgProps) {
  return (
    <svg viewBox="0 0 260 160" role="img" aria-label={title ?? 'Market Street'}>
      <Title title={title} />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${20 + i * 80} 70)`}>
          <rect x="0" y="20" width="62" height="40" fill={C.wall} />
          <path d={`M-4 20h70l-8-20h-54z`} fill={i === 1 ? C.gold : C.brick} />
          <path d="M6 20v-20M20 20v-20M34 20v-20M48 20v-20" stroke="rgba(0,0,0,0.18)" stroke-width="4" />
          <rect x="8" y="34" width="20" height="26" fill="#11142e" />
          <rect x="36" y="34" width="18" height="12" fill={C.gold} class="lit" />
        </g>
      ))}
      <Street y={130} w={260} />
    </svg>
  );
}

export function CharterArt({ title }: SvgProps) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={title ?? 'The Charter, carved in stone'}>
      <Title title={title} />
      <path d="M40 170V50a60 30 0 0 1 120 0v120z" fill={C.stone} stroke="#efeadf" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="58" y={70 + i * 22} width={84 - (i % 2) * 18} height="6" rx="2" fill={C.stoneDark} />
      ))}
      <rect x="30" y="170" width="140" height="10" fill={C.stoneDark} />
      <rect x="0" y="180" width="200" height="4" fill={C.brick} />
    </svg>
  );
}

export function AgeThumb({ age, label }: { age: number; label: string }) {
  return (
    <svg viewBox="0 0 64 48" role="img" aria-label={label}>
      <rect width="64" height="48" rx="4" fill={C.skyDeep} />
      {[4, 14, 30, 44, 54].map((x, i) => {
        const h = 6 + (age + 1) * (2 + (i % 3)) + (i === 2 ? 8 : 0);
        return <rect key={i} x={x} y={42 - h} width={i === 2 ? 12 : 8} height={h} fill={i === 2 ? C.wallLight : C.wall} />;
      })}
      <rect x="30" y={42 - (6 + (age + 1) * 4 + 8) - 3} width="12" height="3" fill={C.gold} />
      <rect x="0" y="42" width="64" height="2" fill={C.brick} />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// The map of flows between the places
// ---------------------------------------------------------------------------------------------

function Box({ x, y, w, h, title, sub, accent }: { x: number; y: number; w: number; h: number; title: string; sub: string; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="8" fill={accent ? '#2c335f' : '#1d234f'} stroke={accent ? C.gold : '#46508f'} stroke-width={accent ? 2 : 1.2} />
      <text x={x + w / 2} y={y + h / 2 - 3} text-anchor="middle" fill="#ebe7de" font-family="Cinzel, serif" font-weight="700" font-size="14">{title}</text>
      <text x={x + w / 2} y={y + h / 2 + 15} text-anchor="middle" fill="#b9b7d3" font-family="Public Sans, sans-serif" font-size="11.5">{sub}</text>
    </g>
  );
}

function Arrow({ d, label, lx, ly, anchor = 'middle' }: { d: string; label?: string; lx?: number; ly?: number; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <g>
      <path d={d} fill="none" stroke="#c9c4b8" stroke-width="1.6" marker-end="url(#arrowhead)" />
      {label && (
        <text x={lx} y={ly} text-anchor={anchor} fill="#f4d690" font-family="Public Sans, sans-serif" font-size="11.5" font-weight="600">{label}</text>
      )}
    </g>
  );
}

function ArrowDefs() {
  return (
    <defs>
      <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="#c9c4b8" />
      </marker>
    </defs>
  );
}

/** Wide layout of the map, for tablets and desktops. */
export function FlowMapWide(): JSX.Element {
  return (
    <svg viewBox="0 0 780 460" role="img" aria-labelledby="flowmap-wide-title">
      <title id="flowmap-wide-title">Map of UpTown: every trade passes the Gate, which feeds the Town Hall and the Furnace</title>
      <ArrowDefs />
      <Box x={20} y={20} w={190} h={60} title="Departures" sub="sellers" />
      <Box x={295} y={20} w={190} h={60} title="The Gate" sub="TownHook, the Ledger" accent />
      <Box x={570} y={20} w={190} h={60} title="Builders" sub="buyers" />
      <Box x={20} y={190} w={190} h={60} title="Town Hall" sub="Treasury, the Fountain" />
      <Box x={295} y={190} w={190} h={60} title="Market Street" sub="the ETH/TOWN pool" />
      <Box x={570} y={190} w={190} h={60} title="The Furnace" sub="burns to the Cornerstone" />
      <Box x={20} y={350} w={190} h={60} title="The Tower" sub="TownStaking, 5 floors" />
      <Box x={295} y={350} w={190} h={60} title="Sealed Foundation" sub="LPVault, 10-year seal" />
      <Box x={570} y={350} w={190} h={60} title="The Granary" sub="BuyerRewards, 500M TOWN" />
      <Arrow d="M210 50H293" label="sell" lx={251} ly={42} />
      <Arrow d="M570 50H487" label="buy" lx={528} ly={42} />
      <Arrow d="M340 80V130H115V188" label="2% toll in ETH" lx={228} ly={124} />
      <Arrow d="M440 80V130H665V188" label="2% of TOWN, burned" lx={552} ly={124} />
      <Arrow d="M390 80V188" />
      <Arrow d="M390 250V348" label="deed sealed 10 years" lx={398} ly={304} anchor="start" />
      <Arrow d="M60 250V348" label="WETH, once a Bell" lx={66} ly={296} anchor="start" />
      <Arrow d="M182 350V252" label="rent in ETH, paid once" lx={188} ly={322} anchor="start" />
      <Arrow d="M760 380H772V50H762" />
      <text x="700" y="300" text-anchor="end" fill="#f4d690" font-family="Public Sans, sans-serif" font-size="11.5" font-weight="600">rebates, 2 Bells later</text>
      <Arrow d="M665 410V430H8V220H18" label="1/20 of each claim, to the Town Hall for the owner" lx={390} ly={450} />
    </svg>
  );
}
