// The owner page's rules (CR-64), as pure functions: who may see the page, who may act for each
// contract, and the checks on what the owner types. Nothing here reads the chain or sends: the
// figures come from `reads.ts` (OwnerState), and `wallet.ts` sends.
//
// The page is hidden, not locked. Every owner function refuses any caller but the owner in the
// contract itself; these rules only spare everyone else a page of buttons that would fail.
import { encodeFunctionData, getAddress, isAddress } from 'viem';
import { COMMA_MESSAGE, parseAmount } from './amount';
import type { Address, Multisig, OwnerState } from '../data/types';
import type { TxRequest } from './wallet';
import type { Network } from './network';

/** The two contracts with two-step ownership (CR-102: SkylineStaking has no owner). */
export type Owned = 'Treasury' | 'LPVault';
export const OWNED: readonly Owned[] = ['Treasury', 'LPVault'];

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * How the connected wallet can act for an address that holds a power (an owner, or an address
 * offered ownership): it is that address (`wallet`: sends directly), one of the signers of the
 * multisig at that address (`safe`: prepares the call for the multisig's own app), or neither.
 */
export type Role = { kind: 'wallet' } | { kind: 'safe'; safe: Multisig } | { kind: 'none' };

export function roleFor(o: OwnerState, holder: Address | null, account: Address | null): Role {
  if (!holder || !account) return { kind: 'none' };
  if (same(holder, account)) return { kind: 'wallet' };
  const ms = o.multisigs[holder.toLowerCase()];
  if (ms && ms.signers && ms.signers.some((s) => same(s, account))) return { kind: 'safe', safe: ms };
  return { kind: 'none' };
}

/** A contract's ownership in the owner state. */
export function ownershipOf(o: OwnerState, c: Owned) {
  return c === 'Treasury' ? o.treasury : o.lpVault;
}

/** Every address holding a power now: the two owners and offered owners, and the Launcher's owner before launch. */
export function holders(o: OwnerState): Address[] {
  const list = [o.launcher.launched ? null : o.launcher.owner, ...OWNED.flatMap((c) => [ownershipOf(o, c).owner, ownershipOf(o, c).pendingOwner])];
  const out: Address[] = [];
  for (const a of list) if (a && !out.some((x) => same(x, a))) out.push(a);
  return out;
}

/**
 * Who sees the page. `open`: the connected wallet is an owner or an address offered ownership (or
 * signs for one that is a multisig). `read-only`: some owner is a contract whose signers could not
 * be read, so the page shows the settings, and no action, to anyone who connects, and says why.
 * `closed`: the page says it is for the owner wallet and shows nothing else.
 */
export type Access = { kind: 'open' } | { kind: 'read-only'; unreadable: Address[] } | { kind: 'closed' };

export function pageAccess(o: OwnerState | null, account: Address | null): Access {
  if (!o || !account) return { kind: 'closed' };
  if (holders(o).some((h) => roleFor(o, h, account).kind !== 'none')) return { kind: 'open' };
  const unreadable = holders(o).filter((h) => {
    const ms = o.multisigs[h.toLowerCase()];
    return !!ms && ms.signers === null;
  });
  return unreadable.length ? { kind: 'read-only', unreadable } : { kind: 'closed' };
}

/** The navigation shows "Owner" only to a wallet the page opens for (CR-64). */
export function showsOwnerLink(o: OwnerState | null, account: Address | null): boolean {
  return pageAccess(o, account).kind === 'open';
}

// ---------------------------------------------------------------------------------------------
// The checks on what the owner types (CR-64, "Every action"). Each gives back a value, or a sentence
// saying what is wrong.
// ---------------------------------------------------------------------------------------------

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** An address: 0x and 40 hex characters; mixed case must carry a correct checksum. */
export function checkAddress(text: string, opts: { notZero?: boolean; special?: boolean } = {}): Checked<Address> {
  const t = text.trim();
  if (t === '') return { ok: false, error: 'Enter an address.' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(t)) return { ok: false, error: 'That is not an address: it must be 0x followed by 40 letters and digits (0 to 9, a to f).' };
  if (!isAddress(t, { strict: true }))
    return { ok: false, error: 'The capital letters in this address do not match its checksum, so it may have a typing mistake. Copy it again.' };
  const a = getAddress(t);
  const n = BigInt(a);
  if (opts.special && n <= 2n) return { ok: false, error: 'That address cannot receive the pool fees: the PositionManager treats 0x…0000, 0x…0001 and 0x…0002 specially.' };
  if (opts.notZero && n === 0n) return { ok: false, error: 'The zero address cannot be used here.' };
  return { ok: true, value: a };
}

/**
 * An amount with `decimals` decimals, above zero and not above `max`. A point is the decimal mark; a
 * comma only between thousands ("1,000.5"), any other comma is refused (CR-72).
 */
export function checkAmount(text: string, decimals: number, max: bigint, unit: string, fmtMax: string): Checked<bigint> {
  const p = parseAmount(text, decimals);
  if (p.kind === 'empty') return { ok: false, error: `Enter an amount in ${unit}.` };
  if (p.kind === 'comma') return { ok: false, error: p.error };
  if (p.kind === 'decimals') return { ok: false, error: `${unit} has at most ${decimals} decimals.` };
  if (p.kind === 'invalid') return { ok: false, error: `Enter a number of ${unit}, for example 0.5.` };
  const v = p.value;
  if (v <= 0n) return { ok: false, error: 'Enter an amount above zero.' };
  if (v > max) return { ok: false, error: `That is more than is available: at most ${fmtMax} ${unit}.` };
  return { ok: true, value: v };
}

/** The daily payout rate typed as a percentage (up to two decimals), as basis points from 100 to `maxBps`; a comma is refused (CR-72). */
export function checkRate(text: string, maxBps: number): Checked<number> {
  const t = text.replace('%', '').trim();
  if (t === '') return { ok: false, error: 'Enter a rate in %, for example 10.' };
  if (t.includes(',')) return { ok: false, error: COMMA_MESSAGE };
  if (!/^\d+(\.\d{1,2})?$/.test(t) && !/^\.\d{1,2}$/.test(t)) return { ok: false, error: 'Enter a percentage with at most two decimals, for example 12.5.' };
  const bps = Math.round(Number(t) * 100);
  if (bps < 100 || bps > maxBps) return { ok: false, error: `The rate must be between 1% and ${maxBps / 100}%.` };
  return { ok: true, value: bps };
}

/**
 * A new unlock date typed in the visitor's own time (an `<input type="datetime-local">` value such as
 * 2036-10-27T14:00), as seconds since 1970; it must be later than the current unlock time.
 */
export function checkUnlock(text: string, current: number): Checked<number> {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) return { ok: false, error: 'Pick a date and a time.' };
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const ts = Math.floor(d.getTime() / 1000);
  if (!Number.isFinite(ts)) return { ok: false, error: 'Pick a date and a time.' };
  if (ts <= current) return { ok: false, error: 'The new unlock date must be later than the current one: the lock can be extended, never shortened.' };
  return { ok: true, value: ts };
}

/** A timestamp as the value of an `<input type="datetime-local">`, in the visitor's own time. */
export function localInputValue(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------------------------
// Prepared for a multisig (CR-64): the target, the value (0, or the launch's 0.13 ETH) and the calldata, to copy into
// the Safe app, where the signers approve it.
// ---------------------------------------------------------------------------------------------

export interface Prepared {
  to: Address;
  value: bigint;
  data: `0x${string}`;
}

export function prepare(req: TxRequest): Prepared {
  return {
    to: req.address,
    value: req.value ?? 0n,
    data: encodeFunctionData({ abi: req.abi, functionName: req.functionName, args: req.args } as never),
  };
}

/** The network as the multisig panel names it (CR-72): "Ethereum (chain 1)", "Sepolia (chain 11155111)", "Local test chain (chain 31337)". */
export function networkLabel(n: Network): string {
  return `${n.name} (chain ${n.chainId})`;
}

/** The Safe app's page for a Safe on this chain (its own chain prefixes: eth, sep); the app's home elsewhere. */
export function safeAppUrl(n: Network, safe: Address): string {
  const prefix = n.chainId === 1 ? 'eth' : n.chainId === 11155111 ? 'sep' : null;
  return prefix ? `https://app.safe.global/home?safe=${prefix}:${safe}` : 'https://app.safe.global';
}
