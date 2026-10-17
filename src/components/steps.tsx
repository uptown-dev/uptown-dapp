// One press, several transactions (CR-82): a sale's or a stake's missing approvals and then the
// action, each sent as soon as the one before is confirmed on chain. Every transaction still goes
// through `wallet.ts` (its target check, chain check and read-only rehearsal) and the wallet still
// asks the visitor to confirm each one. The run stops, sending nothing more, when the visitor
// rejects a transaction, when one fails or is not confirmed, or when anything the form watches
// changes: the wallet, the account, the network, the amount, the minimum, or the form
// itself (another tab, another page). Pressing the button again carries on from what is missing.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TransactionReceipt } from 'viem';
import { TX_MESSAGE_MS, txTimer, useApp, useWalletEpoch } from './ui';
import { ExternalIcon, WarnIcon } from './icons';
import { chosenWallet, sendTx, waitForTx, type TxRequest } from '../lib/wallet';
import { explainError, type TradeKind } from '../lib/errors';
import { txUrl } from '../lib/network';
import { fmtInt, shortAddress } from '../lib/format';

export type StepState = 'todo' | 'checking' | 'wallet' | 'pending' | 'done' | 'failed';

export interface RunStep {
  id: string;
  label: string;
  state: StepState;
  hash?: string;
  gasUsed?: bigint;
}

export interface RunState {
  phase: 'idle' | 'running' | 'done' | 'stopped';
  /** What the run does, e.g. "Sell SKYLINE". */
  title: string;
  steps: RunStep[];
  /** The outcome in plain words. */
  message?: string;
  /** Why it stopped, for the record (data-error): the custom error's name, "UserRejected", "Changed", ... */
  error?: string | null;
}

/** The parts a run watches, each named so a stop can say which one changed. */
export type Watched = Record<string, string>;

/** The sentence for each watched part that changed. */
const CHANGED: Record<string, string> = {
  page: 'The form was closed (another tab or page, or the wallet was disconnected)',
  wallet: 'The wallet changed',
  account: 'The account changed',
  network: 'The wallet’s network changed',
  amount: 'The amount changed',
  minimum: 'The minimum received changed',
  staking: 'The staking contract the treasury pays changed',
};

/** Ends a run: nothing more is sent. */
export class Stop extends Error {
  constructor(
    message: string,
    readonly errorName: string | null = null,
    /** False when the message already says what pressing again does. */
    readonly again = true,
  ) {
    super(message);
  }
}

/** What a run's body can do. */
export interface Runner {
  /** Replaces the list of steps, after the body has read what is still missing. */
  plan(steps: { id: string; label: string }[]): void;
  /** Sends one step's transaction and waits until it is confirmed; throws `Stop` on anything else. */
  send(id: string, build: () => TxRequest): Promise<TransactionReceipt>;
  /** Throws `Stop` when a watched part changed. */
  check(): void;
  /** How many of this run's transactions are confirmed so far. */
  confirmed(): number;
}

export interface Run extends RunState {
  busy: boolean;
  /**
   * Runs `body` with `steps` as the first plan. `body` gives back the sentence shown when it is done.
   * `kind` makes a failed trade's sentence fit a buy or a sell.
   */
  start(title: string, steps: { id: string; label: string }[], body: (r: Runner) => Promise<string>, kind?: TradeKind): Promise<void>;
  reset(): void;
  /** The parts watched, as the form last rendered them (set by `useWatch`). */
  watched: { current: { owner: object; parts: Watched } | null };
}

const AGAIN =
  'Pressing the button again carries on from what is still missing: approvals already on chain are read, not asked for again.';

let runSeq = 0;
const IDLE_RUN: RunState = { phase: 'idle', title: '', steps: [] };

/**
 * The transactions of one form, run in order. CR-104: once the whole run is confirmed, its finished
 * step list and message clear themselves `TX_MESSAGE_MS` (2 seconds) after the last confirmation; a
 * run that stopped (a refusal, a failure, a change) keeps its message until the visitor acts. A run
 * belongs to the wallet it started with: when the wallet changes, its state is cleared at once and
 * nothing it reports later is shown.
 */
export function useRun(): Run {
  const app = useApp();
  const w = useWalletEpoch();
  const [st, setStRaw] = useState<RunState & { epoch: number; id: number }>({ ...IDLE_RUN, epoch: -1, id: 0 });
  const watched = useRef<{ owner: object; parts: Watched } | null>(null);

  const start: Run['start'] = async (title, first, body, kind) => {
    if (!app.account) {
      app.connect();
      return;
    }
    const at = watched.current;
    if (!at) return;
    const epoch = w.now();
    const runId = ++runSeq;
    const ours = () => w.now() === epoch;
    const setSt = (next: RunState | ((p: RunState) => RunState)) => {
      if (!ours()) return;
      setStRaw((p) => ({ ...(typeof next === 'function' ? next(p) : next), epoch, id: runId }));
    };
    const owner = at.owner;
    const snapshot = { ...at.parts };
    const { network, client } = app;
    const account = app.account;
    let steps: RunStep[] = first.map((s) => ({ ...s, state: 'todo' }));
    let confirmed = 0;
    const show = () => setSt((p) => ({ ...p, steps }));
    const update = (id: string, patch: Partial<RunStep>) => {
      steps = steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
      show();
    };
    setSt({ phase: 'running', title, steps });

    const check = () => {
      const now = watched.current;
      if (!now || now.owner !== owner) throw new Stop(`${CHANGED.page}.`, 'Changed');
      for (const [part, was] of Object.entries(snapshot)) {
        if (now.parts[part] !== was) throw new Stop(`${CHANGED[part] ?? `The ${part} changed`}.`, 'Changed');
      }
    };

    const runner: Runner = {
      plan(list) {
        steps = list.map((s) => ({ ...s, state: 'todo' }));
        show();
      },
      async send(id, build) {
        check();
        update(id, { state: 'checking' });
        let req: TxRequest;
        try {
          req = build();
        } catch (e) {
          update(id, { state: 'todo' });
          throw new Stop(explainError(e, kind).message);
        }
        update(id, { state: 'wallet' });
        let hash: `0x${string}`;
        try {
          hash = await sendTx(network, client, account, req);
        } catch (e) {
          update(id, { state: 'todo' });
          const x = explainError(e, kind);
          throw new Stop(x.message, x.name);
        }
        update(id, { state: 'pending', hash });
        let replaced: string | null = null;
        let receipt: TransactionReceipt;
        try {
          receipt = await waitForTx(client, hash, (reason, newHash) => {
            if (reason === 'repriced') update(id, { hash: newHash });
            else replaced = reason;
          });
        } catch {
          update(id, { state: 'failed' });
          throw new Stop(
            'This transaction was not confirmed within 10 minutes: it may have been dropped or replaced. Check your wallet’s activity before trying again.',
            'NotConfirmed',
          );
        }
        if (replaced) {
          update(id, { state: 'failed', hash: receipt.transactionHash });
          throw new Stop('Your wallet replaced this transaction with another one (cancelled or changed), so this step was not done.', 'Replaced');
        }
        if (receipt.status !== 'success') {
          update(id, { state: 'failed', hash: receipt.transactionHash, gasUsed: receipt.gasUsed });
          throw new Stop('The transaction was included but failed, so nothing changed; only its gas was spent.', 'Reverted');
        }
        update(id, { state: 'done', hash: receipt.transactionHash, gasUsed: receipt.gasUsed });
        confirmed++;
        check();
        return receipt;
      },
      check,
      confirmed: () => confirmed,
    };

    try {
      const message = await body(runner);
      if (!ours()) return;
      setSt({ phase: 'done', title, steps, message });
      // CR-104: the finished list and its message clear themselves 2 seconds after the last confirmation.
      txTimer.set(() => setStRaw((p) => (p.id === runId && p.phase === 'done' ? { ...IDLE_RUN, epoch, id: runId } : p)), TX_MESSAGE_MS);
    } catch (e) {
      if (!ours()) return;
      const stop = e instanceof Stop ? e : new Stop(explainError(e, kind).message, explainError(e, kind).name);
      steps = steps.map((s) => (s.state === 'checking' || s.state === 'wallet' ? { ...s, state: 'todo' } : s));
      const done = steps.filter((s) => s.state === 'done').map((s) => s.label);
      const parts = [stop.message];
      if (!/nothing was sent/i.test(stop.message)) parts.push('Nothing more was sent.');
      if (done.length) parts.push(`Done before it stopped: ${done.join(', ')}.`);
      if (steps.length > 1 && stop.again) parts.push(AGAIN);
      setSt({ phase: 'stopped', title, steps, message: parts.join(' '), error: stop.errorName });
    }
    await app.refresh();
  };

  // A run of a previous wallet is not shown (CR-104).
  const shown: RunState = st.epoch === w.epoch ? st : IDLE_RUN;
  return {
    ...shown,
    busy: shown.phase === 'running',
    start,
    reset: () => setStRaw({ ...IDLE_RUN, epoch: -1, id: 0 }),
    watched,
  };
}

/**
 * Called by a form on every render: what its run must not see change. The wallet, the account and
 * the network are added here; the form adds its own (amount, minimum, whether it is shown).
 * When the form goes away (another tab, another page), the run sees it at its next check.
 */
export function useWatch(run: Run, parts: Watched): void {
  const app = useApp();
  const me = useRef<object>({});
  run.watched.current = {
    owner: me.current,
    parts: { account: app.account ?? '', wallet: chosenWallet()?.uuid ?? '', network: app.wrongNetwork ? 'wrong' : 'right', ...parts },
  };
  useEffect(
    () => () => {
      if (run.watched.current?.owner === me.current) run.watched.current = null;
    },
    [],
  );
}

/** One step's state in words. */
function stepWords(s: RunStep, local: boolean, wallet: string | null, stopped: boolean): string {
  switch (s.state) {
    case 'checking':
      return 'checking…';
    case 'wallet':
      return local ? `sending from ${wallet ?? 'the test wallet'}…` : 'confirm it in your wallet…';
    case 'pending':
      return 'sent, waiting for it to be confirmed…';
    case 'done':
      return 'confirmed';
    case 'failed':
      return 'not done';
    default:
      return stopped ? 'not sent' : 'next';
  }
}

/** A run's progress: each step with its state and transaction, then the outcome in plain words. */
export function RunStatus({ run }: { run: Run }) {
  const { network, accountLabel } = useApp();
  if (run.phase === 'idle') return null;
  const current = run.steps.find((s) => s.state === 'checking' || s.state === 'wallet' || s.state === 'pending');
  const hashes = run.steps.filter((s) => s.hash).map((s) => s.hash!);
  const kind = run.phase === 'stopped' ? 'failed' : run.phase === 'done' ? 'done' : 'pending';
  const phase = run.phase === 'running' ? (current?.state ?? 'checking') : run.phase === 'done' ? 'done' : 'failed';
  const at = current ? run.steps.indexOf(current) + 1 : 0;
  const several = run.steps.length > 1;
  const link = (hash: string) => {
    const href = txUrl(network, hash);
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" title={hash}>
        <code>{shortAddress(hash)}</code>
        <ExternalIcon size={12} />
      </a>
    ) : (
      <code title={hash}>{shortAddress(hash)}</code>
    );
  };
  return (
    <div
      class={`tx-status run-status ${kind}`}
      role="status"
      aria-live="polite"
      data-phase={phase}
      data-run={run.phase}
      data-hash={hashes[hashes.length - 1] ?? ''}
      data-hashes={hashes.join(',')}
      data-gas={run.steps.map((s) => s.gasUsed?.toString() ?? '').join(',')}
      data-error={run.error ?? ''}
    >
      {kind === 'pending' && <span class="tx-spinner" aria-hidden="true" />}
      {kind === 'failed' && <WarnIcon size={16} />}
      <div>
        {run.phase === 'running' && (
          <p>
            {run.title}
            {several && current ? `: step ${at} of ${run.steps.length}` : ''}
            {!several && current ? `: ${stepWords(current, network.local, accountLabel, false)}` : ''}
          </p>
        )}
        {several && (
          <ol class="run-steps">
            {run.steps.map((s) => (
              <li key={s.id} class={`run-step ${s.state}`} data-step={s.id} data-state={s.state}>
                <span class="run-step-label">{s.label}:</span>{' '}
                <span class="run-step-state">
                  {stepWords(s, network.local, accountLabel, run.phase !== 'running')}
                  {s.hash && <> · {link(s.hash)}</>}
                  {s.gasUsed !== undefined && <> · gas {fmtInt(Number(s.gasUsed))}</>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {run.phase === 'done' && (
          <p>
            <strong>Done.</strong> {run.message}
          </p>
        )}
        {run.phase === 'stopped' && (
          <p>
            <strong>Stopped.</strong> {run.message}
          </p>
        )}
        {!several && hashes.length > 0 && (
          <p class="small muted">
            <span class="tx-hash">Transaction {link(hashes[0])}</span>
            {run.steps[0].gasUsed !== undefined && <span> · gas used {fmtInt(Number(run.steps[0].gasUsed))}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Reads again until `ok` holds: just after a confirmation the network service may still answer from
 * an earlier block for a moment. Stops the run when it still does not hold after ten seconds.
 */
export async function readUntil<T>(r: Pick<Runner, 'check'>, read: () => Promise<T>, ok: (x: T) => boolean, what: string): Promise<T> {
  let x = await read();
  for (let i = 0; i < 10 && !ok(x); i++) {
    await new Promise((res) => setTimeout(res, 1_000));
    r.check();
    x = await read();
  }
  if (!ok(x)) throw new Stop(`The network service does not show the approval yet, so ${what} was not sent. Wait a moment, then press the button again.`, 'NotSeenYet');
  return x;
}
