// Shared building blocks: the app context, cards, figures, notices, expanders and buttons.
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useState } from 'preact/hooks';
import type { ChainState, Scenario, WalletState } from '../data/types';
import { SAMPLE_FIGURES } from '../data/placeholder';
import { ChevronIcon, ExternalIcon, InfoIcon, NoteIcon, WarnIcon } from './icons';
import type { ChainId, Network } from '../lib/network';

export interface AppState {
  scenario: Scenario;
  chain: ChainState;
  /** The connected wallet, or null when no wallet is connected. */
  wallet: WalletState | null;
  /** The chain shown, its explorer and the contract addresses (the network module). */
  network: Network;
  /** Preview only: switch the network, to see the explorer links on each chain. */
  setChainId: (id: ChainId) => void;
  toggleWallet: () => void;
  setScenario: (id: string) => void;
  toast: (message: string) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext missing');
  return ctx;
}

/** The small badge that marks placeholder figures, one per card header. Phase two removes it with SAMPLE_FIGURES. */
export function SampleBadge() {
  if (!SAMPLE_FIGURES) return null;
  return (
    <span class="sample-badge" title="Placeholder figures for the design preview, not read from the contracts">
      Sample figures
    </span>
  );
}

/** A card with an optional title and the sample badge in its header. */
export function Card({
  title,
  children,
  sample = true,
  class: cls,
  id,
  action,
}: {
  title?: ComponentChildren;
  children: ComponentChildren;
  /** Show the "Sample figures" badge (cards that hold placeholder figures). */
  sample?: boolean;
  class?: string;
  id?: string;
  /** Something small at the right of the header, before the badge. */
  action?: ComponentChildren;
}) {
  const hasHead = title || (sample && SAMPLE_FIGURES) || action;
  return (
    <section class={`card${cls ? ' ' + cls : ''}`} id={id}>
      {hasHead && (
        <div class="card-head">
          {title ? <h2 class="card-title">{title}</h2> : <span />}
          <div class="card-head-end">
            {action}
            {sample && <SampleBadge />}
          </div>
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

/** A button that would send a transaction in phase two. In the preview it explains itself. */
export function ActionButton({
  label,
  explain,
  variant = 'primary',
  disabled,
  block,
}: {
  label: string;
  explain: string;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  block?: boolean;
}) {
  const { toast } = useApp();
  return (
    <button
      type="button"
      class={`btn btn-${variant}${block ? ' btn-block' : ''}`}
      disabled={disabled}
      onClick={() => toast(`Preview only: nothing was sent. In the finished site this button will ${explain}`)}
    >
      {label}
    </button>
  );
}

/** Shown where a wallet is needed and none is connected. */
export function ConnectPrompt({ what, block }: { what: string; block?: boolean }) {
  const { toggleWallet } = useApp();
  return (
    <div class="connect-prompt">
      <p>Connect a wallet to see {what}.</p>
      <button type="button" class={`btn btn-primary${block ? ' btn-block' : ''}`} onClick={toggleWallet}>
        Connect wallet
      </button>
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
        <span class="verify-note">(no block explorer on the {network.name.toLowerCase()})</span>
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
