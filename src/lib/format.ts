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

/** SKYLINE amounts: whole SKYLINE, two decimals below 1,000. */
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

/**
 * A rebate rate in basis points as a percentage, cut (never rounded up) to `maxFrac` decimals:
 * 513.52 -> "5.135%", 514.5 -> "5.145%" (CR-47; a rate after the claim fee can carry decimals).
 */
export function fmtRate(bps: number, maxFrac = 3): string {
  const scale = 10 ** maxFrac;
  const v = Math.floor((bps / 100) * scale + 1e-9) / scale;
  return `${v}%`;
}

/** An 8-decimal Chainlink price as dollars: 271240000000 -> "$2,712.40". */
export function fmtUsd8(price: bigint): string {
  return '$' + fmtUnits(price, 8, 2, 2);
}

/**
 * A dollar estimate (CR-95), from dollars × 10^18 (`usdOf` in derive.ts), cut and never rounded up.
 * Ordinary figures: two decimals with thousands separators ("$1,234.56"), "< $0.01" for a non-zero
 * amount below a cent, "$0.00" for nothing. `unitPrice` (SKYLINE's price for one SKYLINE): below a dollar,
 * three significant digits so a price under a cent still says something ("$0.0000271", "$0.0123",
 * "$0.512"); from a dollar up, two decimals. The caller adds the "≈".
 */
export function fmtUsd(usd18: bigint, unitPrice = false): string {
  if (usd18 <= 0n) return '$0.00';
  const ONE = 10n ** 18n;
  if (!unitPrice || usd18 >= ONE) {
    if (usd18 < 10n ** 16n) return '< $0.01';
    return '$' + fmtUnits(usd18, 18, 2, 2);
  }
  const frac = usd18.toString().padStart(18, '0');
  const lead = frac.search(/[1-9]/);
  let digits = frac.slice(0, lead + 3).replace(/0+$/, '');
  if (digits.length < 2) digits = digits.padEnd(2, '0');
  return `$0.${digits}`;
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

/**
 * The header's countdown to the next day (CR-95 item 1): hours, then minutes and seconds with two
 * digits each, so the figure keeps one width as it ticks: 83,292 -> "23h 08m 12s", 59 -> "0h 00m 59s",
 * a whole day -> "24h 00m 00s". With units, not "23:08:12", so it reads as time left and not as a
 * time of day.
 */
export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const p = (x: number) => String(x).padStart(2, '0');
  return `${Math.floor(s / 3600)}h ${p(Math.floor((s % 3600) / 60))}m ${p(s % 60)}s`;
}

/** The same time left in words, for screen readers, to the minute: "23 hours 8 minutes", "1 hour", "less than a minute". */
export function fmtCountdownWords(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  if (m === 0) return 'less than a minute';
  const h = Math.floor(m / 60);
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m % 60) parts.push(`${m % 60} ${m % 60 === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

/** A daily limit in SKYLINE, keeping the half SKYLINE of days 601 to 700 (CR-93): "39,062.5", "2,500,000". */
export function fmtCap(value: bigint): string {
  return fmtUnits(value, 18, 2);
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

/**
 * The day number the site shows for cycle `c`: `c + 1`, so the launch day (cycle 0) is day 1 (spec
 * "Ground rules -> Shared clock", CR-94). A day is a calendar day in UTC: it runs from midnight to
 * midnight UTC, except day 1, which starts at launch and so is shorter. Contract calls and their
 * `data-view` labels keep the cycle index itself.
 */
export function dayNumber(c: number): number {
  return c + 1;
}

/** "Day 42" for cycle 41, with thousands separators for later days (CR-94: cycle c is day c + 1). */
export function dayName(c: number): string {
  return `Day ${fmtInt(dayNumber(c))}`;
}

/** "days 37, 38 and 40" style list of the day numbers of the given cycles. */
export function listDays(cycles: number[]): string {
  const names = cycles.map((c) => fmtInt(dayNumber(c)));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * A moment in the visitor's own time, with UTC beside it (the owner page, CR-64):
 * "16 Nov 2026, 17:00 your time (15:00 UTC)"; the UTC date is added when it differs.
 */
export function fmtLocalUtc(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  const local = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
  const sameDay = d.getDate() === d.getUTCDate() && d.getMonth() === d.getUTCMonth() && d.getFullYear() === d.getUTCFullYear();
  const utc = sameDay ? `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC` : fmtDateTime(ts);
  return `${local} your time (${utc})`;
}
