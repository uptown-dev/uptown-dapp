// Shared building blocks: the app context, cards, figures, notices, expanders, buttons and the
// transaction status line.
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useState } from 'preact/hooks';
import type { PublicClient, TransactionReceipt } from 'viem';
import type { Address, ChainState, WalletState } from '../data/types';
import { ChevronIcon, ExternalIcon, InfoIcon, NoteIcon, WarnIcon } from './icons';
import { txUrl, type Network } from '../lib/network';
import { explainError } from '../lib/errors';
import { sendTx, waitForTx, type TxRequest } from '../lib/wallet';
import { fmtInt, shortAddress } from '../lib/format';

/** Where the figures stand: being read, read, failed to read, or nothing deployed on this chain. */
export interface DataStatus {
  state: 'loading' | 'ready' | 'error' | 'not-deployed';
  /** The last read's failure, in plain words (the figures shown are then the previous read's). */
  error: string | null;
  /** When the figures were last read, on this computer's clock (ms). */
  readAt: number | null;
}

export interface AppState {
  /** The chain shown, its RPC, its explorer and the contract addresses (the network module). */
  network: Network;
  /** Every figure, read from the chain at one block; null until the first read. */
  chain: ChainState | null;
  /** The connected wallet's figures, or null when no wallet is connected. */
  wallet: WalletState | null;
  /** The connected address (an injected wallet's account, or the local test wallet picked). */
  account: Address | null;
  /** The label of the local test wallet in use. */
  accountLabel: string | null;
  data: DataStatus;
  client: PublicClient;
  /** Reads every figure again now. */
  refresh: () => Promise<void>;
  /** Connects the injected wallet, or opens the local test wallet picker. */
  connect: () => void;
  disconnect: () => void;
  /** The injected wallet is on another chain than the site's. */
  wrongNetwork: boolean;
  switchNetwork: () => void;
  toast: (message: string) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext missing');
  return ctx;
}

/** The figures, on pages that are only shown once they have been read. */
export function useChain(): ChainState {
  const { chain } = useApp();
  if (!chain) throw new Error('figures not read yet');
  return chain;
}

/** A card with an optional title. */
export function Card({
  title,
  children,
  class: cls,
  id,
  action,
}: {
  title?: ComponentChildren;
  children: ComponentChildren;
  class?: string;
  id?: string;
  /** Something small at the right of the header. */
  action?: ComponentChildren;
}) {
  const hasHead = title || action;
  return (
    <section class={`card${cls ? ' ' + cls : ''}`} id={id}>
      {hasHead && (
        <div class="card-head">
          {title ? <h2 class="card-title">{title}</h2> : <span />}
          {action && <div class="card-head-end">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * One figure: label above, value below, optional note. Figures sit in a `Figures` grid whose
 * rows are shared (CSS subgrid), so values in a row line up on one baseline even when one label
 * runs to two lines. `view` names the contract view the value comes from (kept as data-view).
 */
export function Fig({
  label,
  value,
  unit,
  note,
  view,
  accent,
  large,
}: {
  label: ComponentChildren;
  value: ComponentChildren;
  unit?: string;
  note?: ComponentChildren;
  view: string;
  accent?: boolean;
  large?: boolean;
}) {
  return (
    <div class={`fig${accent ? ' accent' : ''}${large ? ' large' : ''}`}>
      <dt>{label}</dt>
      <dd class="fig-value" data-view={view}>
        <span class="num">{value}</span>
        {unit && <span class="unit">{unit}</span>}
      </dd>
      <dd class="fig-note">{note}</dd>
    </div>
  );
}

export function Figures({ children, cols }: { children: ComponentChildren; cols?: 2 | 3 | 4 }) {
  return <dl class={`figs${cols ? ` cols-${cols}` : ''}`}>{children}</dl>;
}

/** A label and value on one line (value right-aligned, never wrapped). */
export function Row({ label, value, view, strong }: { label: ComponentChildren; value: ComponentChildren; view?: string; strong?: boolean }) {
  return (
    <div class={`row${strong ? ' strong' : ''}`}>
      <dt>{label}</dt>
      <dd class="num" data-view={view}>
        {value}
      </dd>
    </div>
  );
}

export function Rows({ children }: { children: ComponentChildren }) {
  return <dl class="rows">{children}</dl>;
}

export function Notice({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warn' | 'placeholder';
  title?: ComponentChildren;
  children: ComponentChildren;
}) {
  const icon = kind === 'warn' ? <WarnIcon /> : kind === 'placeholder' ? <NoteIcon /> : <InfoIcon />;
  return (
    <div class={`notice ${kind}`} role={kind === 'warn' ? 'note' : undefined}>
      <span class="notice-icon">{icon}</span>
      <div class="notice-body">
        {title && <p class="notice-title">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** A small expander, closed by default, for the longer explanations. */
export function Details({ summary = 'Details', children }: { summary?: string; children: ComponentChildren }) {
  return (
    <details class="details">
      <summary>
        <span>{summary}</span>
        <ChevronIcon size={16} />
      </summary>
      <div class="details-body">{children}</div>
    </details>
  );
}

/** Shown where a wallet is needed and none is connected. */
export function ConnectPrompt({ what, block }: { what: string; block?: boolean }) {
  const { connect, network } = useApp();
  return (
    <div class="connect-prompt">
      <p>{network.local ? `Pick a local test wallet to see ${what}.` : `Connect a wallet to see ${what}.`}</p>
      <button type="button" class={`btn btn-primary${block ? ' btn-block' : ''}`} onClick={connect}>
        {network.local ? 'Pick a test wallet' : 'Connect wallet'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Transactions: one state per form, a status line under its buttons.
// ---------------------------------------------------------------------------------------------

export type TxPhase = 'idle' | 'checking' | 'wallet' | 'pending' | 'done' | 'failed';

export interface TxState {
  phase: TxPhase;
  /** What is being done, e.g. "Claim WETH". */
  label?: string;
  hash?: string;
  /** The outcome in plain words. */
  message?: string;
  gasUsed?: bigint;
  /** The custom error's name when the contract refused (kept for the record in data-error). */
  error?: string | null;
}

export interface Tx extends TxState {
  busy: boolean;
  /** Checks, sends `build()` from the connected wallet, waits for it, then reads every figure again. */
  run: (label: string, build: () => TxRequest, onDone: (r: TransactionReceipt) => string) => Promise<void>;
  reset: () => void;
}

export function useTx(): Tx {
  const app = useApp();
  const [st, setSt] = useState<TxState>({ phase: 'idle' });
  const run: Tx['run'] = async (label, build, onDone) => {
    if (!app.account) {
      app.connect();
      return;
    }
    setSt({ phase: 'checking', label });
    let hash: string | undefined;
    try {
      const req = build();
      setSt({ phase: 'wallet', label });
      hash = await sendTx(app.network, app.client, app.account, req);
      setSt({ phase: 'pending', label, hash });
      const receipt = await waitForTx(app.client, hash as `0x${string}`);
      if (receipt.status === 'success') {
        setSt({ phase: 'done', label, hash, gasUsed: receipt.gasUsed, message: onDone(receipt) });
      } else {
        setSt({ phase: 'failed', label, hash, gasUsed: receipt.gasUsed, message: 'The transaction was included but failed, so nothing changed; only its gas was spent.' });
      }
    } catch (e) {
      const { message, name } = explainError(e);
      setSt({ phase: 'failed', label, hash, message, error: name });
    }
    await app.refresh();
  };
  return { ...st, busy: st.phase === 'checking' || st.phase === 'wallet' || st.phase === 'pending', run, reset: () => setSt({ phase: 'idle' }) };
}

/** The status of a form's last transaction: pending, the hash, then success or failure in plain words. */
export function TxStatus({ tx }: { tx: Tx }) {
  const { network, accountLabel } = useApp();
  if (tx.phase === 'idle') return null;
  const link = tx.hash ? txUrl(network, tx.hash) : null;
  const hash = tx.hash ? (
    <span class="tx-hash">
      Transaction{' '}
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" title={tx.hash}>
          <code>{shortAddress(tx.hash)}</code>
          <ExternalIcon size={12} />
        </a>
      ) : (
        <code title={tx.hash}>{shortAddress(tx.hash)}</code>
      )}
    </span>
  ) : null;
  const kind = tx.phase === 'failed' ? 'failed' : tx.phase === 'done' ? 'done' : 'pending';
  return (
    <div
      class={`tx-status ${kind}`}
      role="status"
      aria-live="polite"
      data-phase={tx.phase}
      data-hash={tx.hash ?? ''}
      data-gas={tx.gasUsed?.toString() ?? ''}
      data-error={tx.error ?? ''}
    >
      {kind === 'pending' && <span class="tx-spinner" aria-hidden="true" />}
      {kind === 'failed' && <WarnIcon size={16} />}
      <div>
        {tx.phase === 'checking' && <p>{tx.label}: checking…</p>}
        {tx.phase === 'wallet' && (
          <p>
            {tx.label}: {network.local ? `sending from ${accountLabel ?? 'the test wallet'}…` : 'confirm it in your wallet…'}
          </p>
        )}
        {tx.phase === 'pending' && <p>{tx.label}: sent, waiting for it to be included.</p>}
        {tx.phase === 'done' && (
          <p>
            <strong>Done.</strong> {tx.message}
          </p>
        )}
        {tx.phase === 'failed' && (
          <p>
            <strong>Not done.</strong> {tx.message}
          </p>
        )}
        {(hash || tx.gasUsed !== undefined) && (
          <p class="small muted">
            {hash}
            {tx.gasUsed !== undefined && <span> · gas used {fmtInt(Number(tx.gasUsed))}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

/** A page's title block: a heading and one short line. */
export function PageHead({ title, lead, children }: { title: string; lead: ComponentChildren; children?: ComponentChildren }) {
  return (
    <header class="page-head">
      <h1>{title}</h1>
      <p class="lead">{lead}</p>
      {children}
    </header>
  );
}

/** Segmented tabs: one panel shown at a time. */
export function Tabs<T extends string>({
  tabs,
  label,
  initial,
  render,
}: {
  tabs: { id: T; label: string }[];
  label: string;
  initial?: T;
  render: (id: T) => ComponentChildren;
}) {
  const [active, setActive] = useState<T>(initial ?? tabs[0].id);
  const current = tabs.some((t) => t.id === active) ? active : tabs[0].id;
  if (tabs.length === 1) {
    // One action only: no tab strip, just its title and panel.
    return (
      <div class="tabs single">
        <p class="tab-single-title">{tabs[0].label}</p>
        <div class="tab-panel">{render(tabs[0].id)}</div>
      </div>
    );
  }
  return (
    <div class="tabs">
      <div class="tab-list" role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <button
            type="button"
            role="tab"
            key={t.id}
            id={`tab-${t.id}`}
            aria-selected={current === t.id}
            aria-controls={`panel-${t.id}`}
            class="tab"
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div class="tab-panel" role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`}>
        {render(current)}
      </div>
    </div>
  );
}

/** Segmented choice chips (aria-pressed). */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" class="chip" key={String(o.value)} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A warning-coloured inline message under an input. */
export function FieldError({ children }: { children: ComponentChildren }) {
  return (
    <span class="field-error">
      <WarnIcon size={14} />
      {children}
    </span>
  );
}

/** One explorer link for `Verify`: what it proves (for the accessible name) and where it goes. */
export interface VerifyLink {
  /** Shown text when a claim needs more than one link, e.g. "unlock time". */
  label?: string;
  /** What the page shows, e.g. "LPVault’s unlock time". */
  what: string;
  /** Built by the network module; null where the chain has no explorer. */
  href: string | null;
}

/**
 * "Don't trust, verify": a small link beside a claim anyone can check on chain (CR-40). One link
 * reads "Don’t trust, verify"; several read "Don’t trust, verify:" followed by their labels.
 * Every link opens the explorer in a new tab. On a chain without an explorer the text shows as
 * disabled with a short note.
 */
export function Verify({ links, inline }: { links: VerifyLink[]; inline?: boolean }) {
  const { network } = useApp();
  const Tag = inline ? 'span' : 'p';
  const usable = links.filter((l) => l.href);
  if (!network.explorer || usable.length === 0) {
    return (
      <Tag class={`verify off${inline ? ' inline' : ''}`}>
        <span class="verify-text" aria-disabled="true">
          Don’t trust, verify
        </span>{' '}
        <span class="verify-note">{network.explorer ? '(not deployed on this network yet)' : `(no block explorer on the ${network.name.toLowerCase()})`}</span>
      </Tag>
    );
  }
  const a = (l: VerifyLink, text: string) => (
    <a
      class="verify-link"
      href={l.href!}
      target="_blank"
      rel="noopener noreferrer"
      title={`${l.what}, on ${network.explorerName}`}
      aria-label={`${text}: ${l.what}, on ${network.explorerName} (opens in a new tab)`}
    >
      {text}
      <ExternalIcon size={12} />
    </a>
  );
  if (usable.length === 1 && !usable[0].label) {
    return <Tag class={`verify${inline ? ' inline' : ''}`}>{a(usable[0], 'Don’t trust, verify')}</Tag>;
  }
  return (
    <Tag class={`verify${inline ? ' inline' : ''}`}>
      <span class="verify-text">Don’t trust, verify:</span>
      {usable.map((l) => (
        <span key={l.href} class="verify-item">
          {a(l, l.label ?? l.what)}
        </span>
      ))}
    </Tag>
  );
}
