// Shared building blocks: the app context, glossary links, figures, panels and notices.
import { createContext, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import type { ChainState, Scenario, WalletState } from '../data/types';
import { SAMPLE_FIGURES } from '../data/placeholder';
import { glossaryEntry } from '../content/glossary';
import { bellName, fmtInt } from '../lib/format';
import { BellIcon, InfoIcon, ScrollIcon, WarnIcon } from './art';

export interface AppState {
  scenario: Scenario;
  chain: ChainState;
  /** The connected wallet, or null when no wallet is connected. */
  wallet: WalletState | null;
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

/** A lore term that links to its glossary entry. */
export function Term({ slug, children }: { slug: string; children: ComponentChildren }) {
  const entry = glossaryEntry(slug);
  return (
    <a class="term" href={`#/glossary/${slug}`} title={entry ? entry.plain : undefined}>
      {children}
    </a>
  );
}

/** The small badge that marks placeholder figures. Phase two removes it with SAMPLE_FIGURES. */
export function SampleBadge() {
  if (!SAMPLE_FIGURES) return null;
  return <span class="sample-badge" title="Placeholder figures for the design preview, not read from the contracts">Sample figures</span>;
}

/** One figure: a label, a value and its unit. `view` names the contract view it comes from. */
export function Stat({
  label,
  value,
  unit,
  note,
  view,
  big,
  gold,
}: {
  label: ComponentChildren;
  value: ComponentChildren;
  unit?: string;
  note?: ComponentChildren;
  view: string;
  big?: boolean;
  gold?: boolean;
}) {
  return (
    <div class={`stat${big ? ' big' : ''}${gold ? ' gold' : ''}`}>
      <dt>{label}</dt>
      <dd class="num" data-view={view}>
        {value}
        {unit && <span class="unit">{unit}</span>}
      </dd>
      {note && <dd class="note">{note}</dd>}
    </div>
  );
}

export function Panel({
  title,
  children,
  sample = true,
  class: cls,
  id,
  headingLevel = 3,
}: {
  title?: ComponentChildren;
  children: ComponentChildren;
  sample?: boolean;
  class?: string;
  id?: string;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section class={`panel${cls ? ' ' + cls : ''}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || sample) && (
        <div class="panel-head">
          {title ? <H>{title}</H> : <span />}
          {sample && <SampleBadge />}
        </div>
      )}
      {children}
    </section>
  );
}

export function Notice({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warn' | 'danger' | 'lore' | 'placeholder';
  title?: ComponentChildren;
  children: ComponentChildren;
}) {
  const icon =
    kind === 'warn' ? <WarnIcon /> : kind === 'danger' ? <WarnIcon color="#e07258" /> : kind === 'lore' ? <BellIcon /> : kind === 'placeholder' ? <ScrollIcon /> : <InfoIcon />;
  return (
    <div class={`notice ${kind}`} role={kind === 'danger' || kind === 'warn' ? 'note' : undefined}>
      {icon}
      <div>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

/** The plain meaning of a Bell number, used at least once on every page. */
export function bellMeaning(c: number): string {
  if (c === 0) return 'launch day, the first 24 hours after the launch transaction';
  return `the 24-hour day that began ${fmtInt(c)} ${c === 1 ? 'day' : 'days'} after launch`;
}

/** "It is Bell 42: the 24-hour day that began 42 days after launch." */
export function BellNow() {
  const { chain } = useApp();
  const c = chain.hook.currentCycle;
  return (
    <p class="bell-line">
      <BellIcon />
      <span>
        It is <strong>{bellName(c)}</strong>: {bellMeaning(c)}. UpTown counts its days in <Term slug="bell">Bells</Term>, 24 hours each, from the moment of launch, not by the calendar. <SampleBadge />
      </span>
    </p>
  );
}

export function PageHero({
  kicker,
  title,
  lead,
  art,
  children,
}: {
  kicker: string;
  title: ComponentChildren;
  lead: ComponentChildren;
  art?: ComponentChildren;
  children?: ComponentChildren;
}) {
  return (
    <header class="page-hero">
      <div class="wrap">
        <div>
          <p class="kicker">{kicker}</p>
          <h1>{title}</h1>
          <p class="lead">{lead}</p>
          {children}
          <BellNow />
        </div>
        {art && <div class="hero-art">{art}</div>}
      </div>
    </header>
  );
}

/** A button that would send a transaction in phase two. In the preview it explains itself. */
export function ActionButton({
  label,
  explain,
  variant = 'gold',
  disabled,
  small,
}: {
  label: string;
  explain: string;
  variant?: 'gold' | 'brick' | 'ghost';
  disabled?: boolean;
  small?: boolean;
}) {
  const { toast } = useApp();
  return (
    <button
      type="button"
      class={`btn btn-${variant}${small ? ' btn-small' : ''}`}
      disabled={disabled}
      onClick={() => toast(`Preview only: nothing was sent. In the finished site this button will ${explain}`)}
    >
      {label}
    </button>
  );
}

/** Shown where a wallet is needed and none is connected. */
export function ConnectPrompt({ what }: { what: string }) {
  const { toggleWallet } = useApp();
  return (
    <div class="notice lore">
      <InfoIcon />
      <div>
        <p>Connect a wallet to see {what}.</p>
        <button type="button" class="btn btn-gold btn-small" onClick={toggleWallet}>
          Connect wallet
        </button>
      </div>
    </div>
  );
}
