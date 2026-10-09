// Typed amounts (CR-72, spec "Frontend -> Trade"): a point is the decimal mark. A comma is accepted
// only as a thousands separator, in groups of three after the first group ("1,000.5", "12,345,678");
// any other comma ("2,5", "0,001", "1,00", "1,0000") is refused with one sentence, so "2,5" is never
// read as 25 or as 2.5. Every amount field on the site (Trade, Stake, the Owner page) reads its text
// through `parseAmount` and shows the amount it will use, formatted, beside the field (`Uses`).
import { parseUnits } from 'viem';
import { fmtUnits } from './format';

/** The sentence shown for a comma that is not a thousands separator. */
export const COMMA_MESSAGE = 'Use a point for decimals, for example 2.5';

export type ParsedAmount =
  /** Nothing typed. */
  | { kind: 'empty' }
  /** A number the form can use, in the smallest unit. */
  | { kind: 'ok'; value: bigint }
  /** A comma used other than as a thousands separator. */
  | { kind: 'comma'; error: string }
  /** More decimals than the unit has. */
  | { kind: 'decimals'; error: string }
  /** Anything else that is not a number. */
  | { kind: 'invalid' };

/** Digits with an optional point and decimals, no comma: "1000.5", ".5", "5.". */
const PLAIN = /^(\d+\.?\d*|\.\d+)$/;
/** Thousands groups: 1 to 3 digits not starting with 0, then one or more ",ddd", then optional decimals ("0,001" is not a grouping). */
const GROUPED = /^[1-9]\d{0,2}(,\d{3})+(\.\d*)?$/;

/** Reads a typed amount with `decimals` decimals. A leading or trailing space is ignored. */
export function parseAmount(text: string, decimals = 18): ParsedAmount {
  const t = text.trim();
  if (t === '') return { kind: 'empty' };
  let plain: string;
  if (t.includes(',')) {
    if (!GROUPED.test(t)) return { kind: 'comma', error: COMMA_MESSAGE };
    plain = t.replace(/,/g, '');
  } else {
    if (!PLAIN.test(t)) return { kind: 'invalid' };
    plain = t;
  }
  const frac = plain.split('.')[1] ?? '';
  if (frac.length > decimals) return { kind: 'decimals', error: `At most ${decimals} decimals.` };
  try {
    return { kind: 'ok', value: parseUnits(plain.endsWith('.') ? plain.slice(0, -1) : plain.startsWith('.') ? `0${plain}` : plain, decimals) };
  } catch {
    return { kind: 'invalid' };
  }
}

/** The value, or null when the text is empty or not a usable number. */
export function amountOrNull(text: string, decimals = 18): bigint | null {
  const p = parseAmount(text, decimals);
  return p.kind === 'ok' ? p.value : null;
}

/** The sentence for a text that cannot be used: the comma rule's own, else `fallback`; null when it is usable or empty. */
export function amountError(text: string, decimals: number, fallback: string): string | null {
  const p = parseAmount(text, decimals);
  if (p.kind === 'ok' || p.kind === 'empty') return null;
  return p.kind === 'invalid' ? fallback : p.error;
}

/** An amount exactly as the form will use it: thousands grouped, every decimal kept (trailing zeros dropped). */
export function fmtExact(value: bigint, decimals = 18): string {
  return fmtUnits(value, decimals, decimals);
}
