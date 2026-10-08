// Formatting helpers. Pure functions on raw contract units; no network.
import { formatUnits } from 'viem';

/** Groups the integer part with commas and keeps at most `maxFrac` decimals (truncated, never rounded up). */
export function fmtUnits(value: bigint, decimals = 18, maxFrac = 2, minFrac = 0): string {
  const neg = value < 0n;
  const s = formatUnits(neg ? -value : value, decimals);
  const [int, frac = ''] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let f = frac.slice(0, maxFrac).replace(/0+$/, '');
  if (f.length < minFrac) f = f.padEnd(minFrac, '0');
  return (neg ? '-' : '') + grouped + (f ? '.' + f : '');
}

/** TOWN amounts: whole TOWN, two decimals below 1,000. */
export function fmtTown(value: bigint): string {
  return fmtUnits(value, 18, value < 1000n * 10n ** 18n ? 2 : 0);
}

/** ETH and WETH amounts: four decimals, six for very small values, "< 0.000001" below that (never a bare 0 for a non-zero amount). */
export function fmtEth(value: bigint, maxFrac = 4): string {
  if (value > 0n && value < 10n ** 12n) return '< 0.000001';
  if (value > 0n && value < 10n ** 15n) return fmtUnits(value, 18, 6);
  return fmtUnits(value, 18, maxFrac);
}

/** Basis points as a percentage: 200 -> "2%", 5480 -> "54.8%", 1333.33 -> "13.33%". */
export function fmtBps(bps: number, maxFrac = 2): string {
  const v = bps / 100;
  return `${Number(v.toFixed(maxFrac))}%`;
}

/** An 8-decimal Chainlink price as dollars: 271240000000 -> "$2,712.40". */
export function fmtUsd8(price: bigint): string {
  return '$' + fmtUnits(price, 8, 2, 2);
}

export function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A plain UTC date and time: "16 Nov 2026, 15:00 UTC". */
export function fmtDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/** A plain UTC date: "16 Nov 2036". */
export function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A duration in words: "9 min", "6 h 12 min", "2 days 5 h". */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const dLabel = d === 1 ? '1 day' : `${d} days`;
  return h % 24 ? `${dLabel} ${h % 24} h` : dLabel;
}

/** Time left until a moment, rounded up to the minute so a 2-day wait read a second later still says "2 days". */
export function fmtUntil(seconds: number): string {
  return fmtDuration(Math.ceil(Math.max(0, seconds) / 60) * 60);
}

/** A whole number of days as an adjective ("2-day"); other lengths in words. */
export function fmtDelay(seconds: number): string {
  return seconds % 86_400 === 0 ? `${seconds / 86_400}-day` : fmtDuration(seconds);
}

/** Minutes and seconds: 540 -> "9:00". */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A shortened address: 0x7a1D…9F00. */
export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** "Day 42", with thousands separators for later days. A day is the 24-hour cycle counted from launch. */
export function dayName(c: number): string {
  return `Day ${fmtInt(c)}`;
}

/** "days 37, 38 and 40" style list of day numbers. */
export function listDays(cycles: number[]): string {
  const names = cycles.map((c) => fmtInt(c));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
