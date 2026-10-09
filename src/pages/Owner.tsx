// The owner page (CR-64): every power in the spec's "Owner powers" table, each next to the current
// setting it changes. Shown only to the owner wallet, an address offered ownership, or a signer of
// an owner that is a Safe multisig. Every action is first checked with a read-only call and the
// answer shown in plain words; a confirmation states the consequence; the four actions that cannot
// be undone need their name typed. For a multisig owner the page prepares the call (target, value
// and data) for the Safe app instead of sending it.
//
// The page is hidden, not locked: every owner function refuses any caller but the owner in the
// contract itself.
import { useContext, useState } from 'preact/hooks';
import { createContext, type ComponentChildren } from 'preact';
import type { TransactionReceipt } from 'viem';
import { formatEther, formatUnits, getAddress } from 'viem';
import { useApp, useTx, Card, FieldError, Notice, PageHead, TxStatus, Uses, type Tx } from '../components/ui';
import { amountOrNull } from '../lib/amount';
import { UNLISTED_STAKING, listedStaking } from '../lib/network';
import { targetProblem } from '../lib/wallet';
import { CheckIcon, ExternalIcon, WarnIcon } from '../components/icons';
import type { Address, ChainState, Multisig, OwnerState } from '../data/types';
import { PriceSource } from '../data/types';
import { ownerTx, type OwnerTarget } from '../lib/actions';
import { budgetState, pausePending, stakingChange } from '../lib/derive';
import { explainError } from '../lib/errors';
import { dayName, fmtBps, fmtDuration, fmtEth, fmtInt, fmtLocalUtc, fmtTown, fmtUsd8 } from '../lib/format';
import {
  checkAddress,
  checkAmount,
  checkPrice,
  checkRate,
  checkUnlock,
  localInputValue,
  networkLabel,
  ownershipOf,
  pageAccess,
  prepare,
  roleFor,
  safeAppUrl,
  type Access,
  type Checked,
  type Owned,
  type Prepared,
  type Role,
} from '../lib/owner';
import type { TxRequest } from '../lib/wallet';
import { CandidateMark } from './Stats';

const ZERO: Address = '0x0000000000000000000000000000000000000000';

/** Every address a check result or confirmation names is shown in full, checksummed (CR-72): never shortened, which a look-alike could imitate. */
const fullAddress = (a: string): string => getAddress(a);

/** What the connected wallet can do with one action: send it, prepare it for a multisig, or nothing (and why). */
type Actor = Role | { kind: 'off'; reason: string };

export function Owner() {
  const { owner, chain, account, data, network } = useApp();
  if (!network.deployment) {
    return (
      <div class="wrap page narrow">
        <PageHead title="Owner" lead={`UpTown on ${network.name}.`} />
        <Notice kind="info" title={`Not deployed on ${network.name} yet`}>
          <p>UpTown’s contracts are not deployed on this network yet.</p>
        </Notice>
      </div>
    );
  }
  if (!owner) {
    return (
      <div class="wrap page narrow">
        <PageHead title="Owner" lead="Reading the contracts." />
        {data.state === 'error' ? (
          <Notice kind="warn" title="Could not read the contracts">
            <p>{data.error}</p>
          </Notice>
        ) : (
          <p class="muted">Reading the contracts on {network.name}…</p>
        )}
      </div>
    );
  }
  const access = pageAccess(owner, account);
  if (access.kind === 'closed') return <ForOwnerOnly />;
  return <OwnerPage o={owner} chain={chain} access={access} />;
}

/** Anyone else who opens the page by its address sees only this. */
export function ForOwnerOnly() {
  return (
    <div class="wrap page narrow">
      <PageHead title="Owner" lead="This page is for the owner wallet." />
      <Notice kind="info" title="For the owner wallet only">
        <p>This page lists the owner’s settings and actions. It opens only when the owner’s wallet, or a signer of the owner’s multisig, is connected.</p>
      </Notice>
    </div>
  );
}

export function OwnerPage({ o, chain, access }: { o: OwnerState; chain: ChainState | null; access: Access }) {
  const { account, network } = useApp();
  const readOnly = access.kind === 'read-only';
  const actor = (holder: Address | null, who: string): Actor => {
    if (readOnly) return { kind: 'off', reason: 'Read-only: this page cannot tell who signs for the owner (see the note at the top).' };
    const r = roleFor(o, holder, account);
    return r.kind === 'none' ? { kind: 'off', reason: `Only ${who} can do this, and the connected wallet is not it.` } : r;
  };
  const anyone: Actor = readOnly ? { kind: 'off', reason: 'Read-only: this page cannot tell who signs for the owner.' } : { kind: 'wallet' };
  const ctx: Ctx = { o, chain, actor, anyone };
  const stakingName = chain && network.deployment && chain.staking.address.toLowerCase() !== network.deployment.contracts.TownStaking.toLowerCase() ? 'Staking contract' : 'TownStaking';
  return (
    <div class="wrap page owner-page">
      <PageHead
        title="Owner"
        lead="Every owner power, next to the setting it changes. Each action is checked first with a read-only call; nothing is sent until you confirm."
      />
      <ModeNotice o={o} access={access} />
      {!o.launcher.launched && <LauncherCard ctx={ctx} />}
      {chain ? (
        <>
          <TreasuryCard ctx={ctx} chain={chain} />
          <StakingCard ctx={ctx} chain={chain} name={stakingName} />
          <VaultCard ctx={ctx} chain={chain} />
        </>
      ) : (
        <Card title="Ownership">
          <p class="small muted card-lead">The other settings appear here once UpTown has launched; ownership can be handed over before that.</p>
          {(['Treasury', 'TownStaking', 'LPVault'] as const).map((c) => (
            <OwnershipPower key={c} ctx={ctx} contract={c} />
          ))}
        </Card>
      )}
      <p class="small faint owner-foot">This page is hidden, not locked: every owner function refuses any caller but the owner in the contract itself.</p>
    </div>
  );
}

interface Ctx {
  o: OwnerState;
  chain: ChainState | null;
  /** How the connected wallet can act for `holder`, described as `who` when it cannot. */
  actor: (holder: Address | null, who: string) => Actor;
  /** For the calls anyone may make (applying an announced change). */
  anyone: Actor;
}

/** Who the connected wallet is, for this page: the owner wallet, a multisig signer, an address offered ownership, or read-only. */
function ModeNotice({ o, access }: { o: OwnerState; access: Access }) {
  const { account } = useApp();
  if (access.kind === 'read-only')
    return (
      <Notice kind="warn" title="Read-only">
        <p>
          The owner {access.unreadable.length > 1 ? 'addresses' : 'address'} {access.unreadable.map((a, i) => (
            <span key={a}>
              {i > 0 && ', '}
              <code class="break">{fullAddress(a)}</code>
            </span>
          ))}{' '}
          {access.unreadable.length > 1 ? 'are contracts' : 'is a contract'}, but {access.unreadable.length > 1 ? 'they' : 'it'} did not answer when asked
          for {access.unreadable.length > 1 ? 'their' : 'its'} signers (a Safe’s getOwners()), so this page cannot tell who may act for{' '}
          {access.unreadable.length > 1 ? 'them' : 'it'}. The settings are shown; actions are off. Prepare them in the multisig’s own app.
        </p>
      </Notice>
    );
  const { network } = useApp();
  const safes = Object.values(o.multisigs).filter((m) => m.signers?.some((s) => s.toLowerCase() === account?.toLowerCase()));
  const owners = [...(['Treasury', 'TownStaking', 'LPVault'] as const).map((c) => ownershipOf(o, c).owner), ...(o.launcher.launched ? [] : [o.launcher.owner])];
  const direct = owners.some((a) => a.toLowerCase() === account?.toLowerCase());
  return (
    <Notice kind="info" title={safes.length ? 'Prepared for the Safe, not sent' : direct ? 'Sent from this wallet' : 'Offered ownership'}>
      {safes.map((m) => (
        <p key={m.address}>
          The owner <code class="break">{m.address}</code> is a Safe multisig on {networkLabel(network)}; this wallet is one of its {signersText(m)}. Each
          action here is checked, then prepared for the Safe app, where the signers approve it. Nothing is sent from this page.
        </p>
      ))}
      {direct && <p>This wallet is the owner. Each action is checked first, then sent from this wallet once you confirm.</p>}
      {!safes.length && !direct && <p>This wallet has been offered ownership of a contract below. It can accept the offer; the owner’s other actions are off.</p>}
    </Notice>
  );
}

function signersText(m: Multisig): string {
  const n = m.signers?.length ?? 0;
  return m.threshold !== null ? `${n} signers, ${m.threshold} of whom must approve each transaction` : `${n} signers`;
}

// ---------------------------------------------------------------------------------------------
// Layout: a power is its settings beside its action.
// ---------------------------------------------------------------------------------------------

/**
 * One transaction state per power, shared by its actions, so the result of an action stays in view
 * when the action itself gives way to the next one (announcing a pause shows Cancel; accepting an
 * offer removes Accept).
 */
const PowerTx = createContext<Tx | null>(null);

function Power({ title, settings, children, id }: { title: string; settings: ComponentChildren; children: ComponentChildren; id: string }) {
  const tx = useTx();
  return (
    <div class="power" id={`power-${id}`}>
      <div class="power-setting">
        <h3 class="power-title">{title}</h3>
        <dl class="settings">{settings}</dl>
      </div>
      <div class="power-actions">
        <PowerTx.Provider value={tx}>{children}</PowerTx.Provider>
        <TxStatus tx={tx} />
      </div>
    </div>
  );
}

function Setting({ label, value, view, note }: { label: ComponentChildren; value: ComponentChildren; view: string; note?: ComponentChildren }) {
  return (
    <div class="setting">
      <dt>{label}</dt>
      <dd class="setting-value" data-view={view}>
        {value}
      </dd>
      {note && <dd class="setting-note">{note}</dd>}
    </div>
  );
}

function Addr({ a }: { a: Address }) {
  return <code class="break">{a}</code>;
}

function Field({
  id,
  label,
  value,
  onInput,
  placeholder,
  suffix,
  hint,
  uses,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  hint?: ComponentChildren;
  /** For an amount: the amount the form will use, shown beside the field once valid (CR-72). */
  uses?: ComponentChildren;
  type?: 'text' | 'datetime-local';
}) {
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <div class="input-wrap">
        {type === 'datetime-local' ? (
          <input id={id} type="datetime-local" value={value} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
        ) : (
          <input
            id={id}
            type="text"
            inputMode={suffix && suffix !== 'address' ? 'decimal' : undefined}
            autoComplete="off"
            spellcheck={false}
            placeholder={placeholder}
            value={value}
            onInput={(e) => onInput((e.target as HTMLInputElement).value)}
          />
        )}
        {suffix && suffix !== 'address' && <span class="suffix">{suffix}</span>}
      </div>
      {uses}
      {hint && <span class="hint">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// One action: check (a read-only call), confirm (the consequence; the name typed when it cannot be
// undone), then send, or prepare for the Safe.
// ---------------------------------------------------------------------------------------------

interface Built {
  req: TxRequest;
  /** What the call would do, shown once the read-only check passes. */
  preview: string;
}

interface ActionProps {
  /** For element ids and tests: the function's name, plus a suffix where one function has two uses. */
  id: string;
  /** The button, e.g. "Set the rate". */
  label: string;
  actor: Actor;
  /** The inputs, drawn by the caller. */
  fields?: ComponentChildren;
  /** True once anything has been typed, so a mistake is shown at once. */
  dirty?: boolean;
  build: () => Checked<Built>;
  /** The consequence, from the spec's "Owner powers" table. */
  consequence: ComponentChildren;
  /** For the four actions that cannot be undone: the words the owner must type. */
  confirmWord?: string;
  done: (r: TransactionReceipt) => string;
  /** Off for a reason of its own (for example, before the unlock date). */
  offReason?: string | null;
  /** A plainer sentence for a contract error in this action's context. */
  errorWords?: Record<string, string>;
  /** Clears the inputs after a successful send. */
  onSent?: () => void;
}

const keyOf = (req: TxRequest) => JSON.stringify([req.address, req.functionName, req.args ?? []], (_, v) => (typeof v === 'bigint' ? v.toString() : v));

export function OwnerAction(p: ActionProps) {
  const { client, account, network } = useApp();
  const shared = useContext(PowerTx);
  const own = useTx();
  const tx = shared ?? own;
  const [attempted, setAttempted] = useState(false);
  const [check, setCheck] = useState<{ key: string; state: 'checking' | 'ok' | 'refused'; message: string; error?: string | null } | null>(null);
  const [typed, setTyped] = useState('');
  const [prepared, setPrepared] = useState<{ key: string; p: Prepared } | null>(null);
  // A call to an address the site does not list (CR-72) is not built: its builder throws, and the
  // reason is shown instead of a Check button that would work.
  const built: Checked<Built> = (() => {
    try {
      const b = p.build();
      if (!b.ok) return b;
      const problem = targetProblem(network, b.value.req);
      return problem ? { ok: false, error: problem } : b;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  })();
  const key = built.ok ? keyOf(built.value.req) : null;
  const current = check && check.key === key ? check : null;
  const off = p.actor.kind === 'off' ? p.actor.reason : (p.offReason ?? null);
  const from: Address | null = p.actor.kind === 'safe' ? p.actor.safe.address : account;
  const word = p.confirmWord;
  const wordOk = !word || typed.trim().toLowerCase() === word.toLowerCase();

  const runCheck = async () => {
    setAttempted(true);
    setPrepared(null);
    if (!built.ok || !from) return;
    const k = keyOf(built.value.req);
    setCheck({ key: k, state: 'checking', message: '' });
    const r = built.value.req;
    try {
      await client.simulateContract({ account: from, address: r.address, abi: r.abi, functionName: r.functionName, args: r.args, value: r.value } as never);
      setCheck({ key: k, state: 'ok', message: built.value.preview });
    } catch (e) {
      const x = explainError(e);
      setCheck({ key: k, state: 'refused', message: (x.name && p.errorWords?.[x.name]) || x.message, error: x.name });
    }
  };

  const send = () => {
    if (!built.ok) return;
    const req = built.value.req;
    void tx.run(p.label, () => req, (r) => {
      setCheck(null);
      setTyped('');
      p.onSent?.();
      return p.done(r);
    });
  };

  return (
    <div class="owner-action" data-action={p.id}>
      {p.fields && <div class="owner-fields">{p.fields}</div>}
      {!built.ok && (attempted || p.dirty) && <FieldError>{built.error}</FieldError>}
      <div class="btn-row">
        <button type="button" class="btn btn-secondary" disabled={!!off || tx.busy || current?.state === 'checking'} onClick={() => void runCheck()}>
          {current?.state === 'checking' ? 'Checking…' : `Check: ${p.label}`}
        </button>
      </div>
      {off && <p class="small muted owner-off">{off}</p>}
      {current && current.state !== 'checking' && (
        <div class={`check-result ${current.state}`} role="status" data-check={current.state} data-error={current.error ?? ''}>
          {current.state === 'ok' ? <CheckIcon size={16} /> : <WarnIcon size={16} />}
          <p>
            <strong>{current.state === 'ok' ? 'Check passed.' : 'The contract would refuse this.'}</strong> {current.message}
            {current.state === 'refused' && ' Nothing was sent.'}
          </p>
        </div>
      )}
      {current?.state === 'ok' && !off && (
        <div class="confirm-panel">
          <p class="confirm-title">What this does</p>
          <p class="confirm-text">{p.consequence}</p>
          {word && (
            <div class="field">
              <label for={`confirm-${p.id}`}>
                This cannot be undone. Type <strong class="confirm-word">{word}</strong> to confirm.
              </label>
              <div class="input-wrap">
                <input id={`confirm-${p.id}`} type="text" autoComplete="off" spellcheck={false} value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} />
              </div>
            </div>
          )}
          <div class="btn-row">
            {p.actor.kind === 'safe' ? (
              <button
                type="button"
                class="btn btn-primary"
                disabled={!wordOk}
                onClick={() => built.ok && setPrepared({ key: keyOf(built.value.req), p: prepare(built.value.req) })}
              >
                Prepare in Safe
              </button>
            ) : (
              <button type="button" class="btn btn-primary" disabled={!wordOk || tx.busy} onClick={send}>
                {tx.busy ? 'Sending…' : `Confirm: ${p.label}`}
              </button>
            )}
            <button type="button" class="btn btn-secondary" onClick={() => (setCheck(null), setTyped(''), setPrepared(null))}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {prepared && prepared.key === key && p.actor.kind === 'safe' && <SafePanel prepared={prepared.p} safe={p.actor.safe} network={network} />}
      {!shared && <TxStatus tx={tx} />}
    </div>
  );
}

/** A call prepared for the Safe app: the target, the value (0) and the data, each with a copy button (CR-64). */
export function SafePanel({ prepared, safe, network }: { prepared: Prepared; safe: Multisig; network: ReturnType<typeof useApp>['network'] }) {
  return (
    <div class="safe-panel" data-prepared={prepared.data}>
      <p class="confirm-title">Prepared for the Safe, not sent</p>
      <p class="small muted">
        In the Safe app, start a new transaction with the Transaction Builder, turn on custom data, and paste these three values. The Safe’s signers then
        approve it there{safe.threshold !== null ? ` (${safe.threshold} of ${safe.signers?.length ?? 0})` : ''}.
      </p>
      <div class="copy-row safe-network">
        <span class="copy-label">Network</span>
        <strong class="safe-network-value" data-chain={network.chainId}>
          {networkLabel(network)}
        </strong>
        <span class="copy-end small muted">The Safe app must be on this network.</span>
      </div>
      <p class="small muted">
        The Safe: <code class="break">{fullAddress(safe.address)}</code>
      </p>
      <CopyRow label="To (the contract)" value={prepared.to} />
      <CopyRow label="Value (ETH)" value={formatEther(prepared.value)} />
      <CopyRow label="Data" value={prepared.data} />
      <a class="btn btn-secondary btn-small" href={safeAppUrl(network, safe.address)} target="_blank" rel="noopener noreferrer">
        Open the Safe app
        <ExternalIcon size={14} />
      </a>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [note, setNote] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setNote('Copied');
    } catch {
      // No clipboard access (for example, a page not served over https): select the text instead.
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
      setNote(ok ? 'Copied' : 'Select the value and copy it by hand');
    }
  };
  return (
    <div class="copy-row">
      <span class="copy-label">{label}</span>
      <code class="copy-value break">{value}</code>
      <span class="copy-end">
        <button type="button" class="btn btn-secondary btn-small" onClick={() => void copy()} aria-label={`Copy ${label}`}>
          Copy
        </button>
        {note && (
          <span class="small muted" role="status">
            {note}
          </span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The contracts.
// ---------------------------------------------------------------------------------------------

const nowOf = (o: OwnerState) => Math.max(o.blockTimestamp, Math.floor(Date.now() / 1000));

/**
 * CR-72: the staking contract the treasury pays (`o.staking.address`, read from the RPC) gets the
 * owner's staking powers only when the site lists it; otherwise every such action is off, with why.
 */
function stakingOff(n: ReturnType<typeof useApp>['network'], o: OwnerState): Actor | null {
  return listedStaking(n, o.staking.address) ? null : { kind: 'off', reason: `${UNLISTED_STAKING}: it does not list ${fullAddress(o.staking.address)}, so nothing is sent there.` };
}

function LauncherCard({ ctx }: { ctx: Ctx }) {
  const { network } = useApp();
  const { o } = ctx;
  return (
    <Card title="Launcher" class="owner-card">
      <Power
        id="launch"
        title="Launch"
        settings={
          <>
            <Setting label="Launched" value="Not yet" view="Launcher.launched" />
            <Setting label="Launcher owner (the only address that can launch)" value={<Addr a={o.launcher.owner} />} view="Launcher.owner" />
          </>
        }
      >
        <OwnerAction
          id="launch"
          label="Launch"
          actor={ctx.actor(o.launcher.owner, 'the Launcher’s owner')}
          build={() => ({ ok: true, value: { req: ownerTx(network, 'Launcher', 'launch'), preview: 'The launch would run.' } })}
          consequence="In one transaction: opens the TOWN pool, places the launch position and locks it in LPVault for 10 years, funds the rebate reserve and starts every clock. It runs once and cannot be repeated or undone, so it happens exactly when you send it."
          confirmWord="launch"
          done={() => 'UpTown is launched.'}
        />
      </Power>
    </Card>
  );
}

function TreasuryCard({ ctx, chain }: { ctx: Ctx; chain: ChainState }) {
  const { network } = useApp();
  const { o } = ctx;
  const t = chain.treasury;
  const ownerActor = ctx.actor(o.treasury.owner, 'the Treasury’s owner');
  const c = t.currentCycle;
  const b = budgetState(chain);
  const now = nowOf(o);

  // Rate
  const [rate, setRate] = useState('');
  // Withdrawals
  const [ethTo, setEthTo] = useState('');
  const [ethAmount, setEthAmount] = useState('');
  const [townTo, setTownTo] = useState('');
  const [townAmount, setTownAmount] = useState('');
  // Staking replacement
  const [candidate, setCandidate] = useState('');

  const change = stakingChange(chain);
  const pauseAt = pausePending(chain);
  const tx = (fn: string, args: readonly unknown[] = []) => ownerTx(network, 'Treasury', fn, args);

  return (
    <Card title="Treasury" class="owner-card" id="owner-treasury">
      <Power
        id="spend-rate"
        title="Daily payout rate"
        settings={
          <>
            <Setting
              label="Rate most recently set"
              value={fmtBps(t.spendBps)}
              view="Treasury.spendBps"
              note="A rate set during a day is used from the next day’s budget; the budget of the day in progress keeps the rate it began with."
            />
            <Setting label="Highest rate allowed" value={fmtBps(t.MAX_SPEND_BPS)} view="Treasury.MAX_SPEND_BPS" note="A constant: no call can raise it." />
            <Setting
              label={`${dayName(c)} budget`}
              value={b.kind === 'waiting' ? 'Not set yet' : `${fmtEth(t.budget)} ETH`}
              view="Treasury.budget"
              note={b.kind === 'waiting' ? 'Set by the day’s first trigger.' : b.kind === 'paused' ? 'Payouts are paused.' : 'Set for the day; it never changes.'}
            />
          </>
        }
      >
        <OwnerAction
          id="setSpendRate"
          label="Set the rate"
          actor={ownerActor}
          dirty={rate !== ''}
          fields={
            <Field
              id="owner-rate"
              label="New daily payout rate"
              value={rate}
              onInput={setRate}
              placeholder="10"
              suffix="%"
              hint={`1% to ${fmtBps(t.MAX_SPEND_BPS)}, up to two decimals.`}
              uses={(() => {
                const r = checkRate(rate, t.MAX_SPEND_BPS);
                return <Uses value={r.ok ? BigInt(r.value) : null} decimals={2} unit="%" />;
              })()}
            />
          }
          build={() => {
            const r = checkRate(rate, t.MAX_SPEND_BPS);
            return r.ok ? { ok: true, value: { req: tx('setSpendRate', [BigInt(r.value)]), preview: `The treasury accepts ${fmtBps(r.value)}. It is used from ${dayName(c + 1)}’s budget on.` } } : r;
          }}
          consequence={`From ${dayName(c + 1)}, each day’s payout to stakers is this share of the stakers’ ETH. Between 1% and 25%: payouts slow down or speed up, and ETH still leaves only to stakers.`}
          done={() => `The daily payout rate is now ${rate.trim().replace('%', '')}%, used from ${dayName(c + 1)}’s budget.`}
        />
      </Power>

      <Power
        id="owner-eth"
        title="Owner ETH"
        settings={<Setting label="Owner ETH available" value={`${fmtEth(t.ownerEthAvailable, 6)} ETH`} view="Treasury.ownerEthAvailable" note="10% of all ETH the treasury receives." />}
      >
        <OwnerAction
          id="withdrawOwnerEth"
          label="Withdraw ETH"
          actor={ownerActor}
          dirty={ethTo !== '' || ethAmount !== ''}
          fields={
            <>
              <Field id="owner-eth-to" label="Send to" value={ethTo} onInput={setEthTo} placeholder="0x…" suffix="address" />
              <Field
                id="owner-eth-amount"
                label="Amount"
                value={ethAmount}
                onInput={setEthAmount}
                placeholder="0.0"
                suffix="ETH"
                uses={<Uses value={amountOrNull(ethAmount, 18)} unit="ETH" />}
                hint={
                  <>
                    Up to {fmtEth(t.ownerEthAvailable, 6)} ETH.{' '}
                    <button type="button" class="link-btn" onClick={() => setEthAmount(formatEther(t.ownerEthAvailable))}>
                      All of it
                    </button>
                  </>
                }
              />
            </>
          }
          build={() => {
            const to = checkAddress(ethTo, { notZero: true });
            if (!to.ok) return to;
            const amt = checkAmount(ethAmount, 18, t.ownerEthAvailable, 'ETH', formatEther(t.ownerEthAvailable));
            if (!amt.ok) return amt;
            return { ok: true, value: { req: tx('withdrawOwnerEth', [to.value, amt.value]), preview: `${fmtEth(amt.value, 6)} ETH would go from the owner reserve to ${fullAddress(to.value)}.` } };
          }}
          consequence="Sends ETH from the owner reserve. This is the owner’s income: nothing beyond the 10% reserve can be withdrawn, and the stakers’ ETH is untouched."
          done={() => 'The ETH was sent from the owner reserve.'}
          onSent={() => setEthAmount('')}
        />
      </Power>

      <Power
        id="owner-town"
        title="TOWN claim fees"
        settings={<Setting label="TOWN available" value={`${fmtTown(t.ownerTownAvailable)} TOWN`} view="Treasury.ownerTownAvailable" note="The claim fees on rebates; all of it belongs to the owner." />}
      >
        <OwnerAction
          id="withdrawTown"
          label="Withdraw TOWN"
          actor={ownerActor}
          dirty={townTo !== '' || townAmount !== ''}
          fields={
            <>
              <Field id="owner-town-to" label="Send to" value={townTo} onInput={setTownTo} placeholder="0x…" suffix="address" />
              <Field
                id="owner-town-amount"
                label="Amount"
                value={townAmount}
                onInput={setTownAmount}
                placeholder="0"
                suffix="TOWN"
                uses={<Uses value={amountOrNull(townAmount, 18)} unit="TOWN" />}
                hint={
                  <>
                    Up to {fmtTown(t.ownerTownAvailable)} TOWN.{' '}
                    <button type="button" class="link-btn" onClick={() => setTownAmount(formatUnits(t.ownerTownAvailable, 18))}>
                      All of it
                    </button>
                  </>
                }
              />
            </>
          }
          build={() => {
            const to = checkAddress(townTo, { notZero: true });
            if (!to.ok) return to;
            const amt = checkAmount(townAmount, 18, t.ownerTownAvailable, 'TOWN', fmtTown(t.ownerTownAvailable));
            if (!amt.ok) return amt;
            return { ok: true, value: { req: tx('withdrawTown', [to.value, amt.value]), preview: `${fmtTown(amt.value)} TOWN would go from the treasury to ${fullAddress(to.value)}.` } };
          }}
          consequence="Sends TOWN claim fees held by the treasury. This is the owner’s income; no other token can be withdrawn."
          done={() => 'The TOWN was sent from the treasury.'}
          onSent={() => setTownAmount('')}
        />
      </Power>

      <Power
        id="staking"
        title="Staking contract the treasury pays"
        settings={
          <>
            <Setting label="Paid now" value={<Addr a={t.staking} />} view="Treasury.staking" />
            <Setting
              label="Announced replacement"
              value={t.pendingStaking ? <Addr a={t.pendingStaking} /> : 'None'}
              view="Treasury.pendingStaking"
              note={t.candidate ? <CandidateMark check={t.candidate} /> : undefined}
            />
            {t.pendingStaking && change && (
              <>
                <Setting label="Can be applied from" value={fmtLocalUtc(change.from)} view="Treasury.stakingEffectiveAt" />
                <Setting
                  label="Window ends"
                  value={fmtLocalUtc(change.until)}
                  view="Treasury.stakingEffectiveAt + APPLY_WINDOW"
                  note={change.phase === 'expired' ? 'Expired: it can only be replaced or cancelled.' : undefined}
                />
              </>
            )}
            <Setting label="Wait, then window" value={`${fmtDuration(t.OWNER_DELAY)}, then ${fmtDuration(t.APPLY_WINDOW)}`} view="Treasury.OWNER_DELAY, Treasury.APPLY_WINDOW" />
          </>
        }
      >
        <OwnerAction
          id="announceStaking"
          label="Announce"
          actor={ownerActor}
          dirty={candidate !== ''}
          fields={
            <Field
              id="owner-staking"
              label="New staking contract"
              value={candidate}
              onInput={setCandidate}
              placeholder="0x…"
              suffix="address"
              hint="The check asks the treasury itself: it refuses an address without code, the current contract, a wallet with changeable code, and a contract that does not name this treasury and WETH."
            />
          }
          build={() => {
            const a = checkAddress(candidate, { notZero: true });
            if (!a.ok) return a;
            return {
              ok: true,
              value: {
                req: tx('announceStaking', [a.value]),
                preview: `The treasury accepts ${fullAddress(a.value)}: it names this treasury and WETH. It could be applied from about ${fmtLocalUtc(now + t.OWNER_DELAY)} until ${fmtLocalUtc(now + t.OWNER_DELAY + t.APPLY_WINDOW)}.`,
              },
            };
          }}
          consequence={`After a public wait of ${fmtDuration(t.OWNER_DELAY)}, anyone can apply it within ${fmtDuration(t.APPLY_WINDOW)}; from then on every payout goes to this contract, and what it does with them is up to its code, so a bad choice can send the stakers’ future ETH anywhere. ETH already paid and every stake stay where they are. A new announcement replaces any pending one.`}
          done={() => 'The replacement is announced; the wait has begun.'}
        />
        {t.pendingStaking && (
          <OwnerAction
            id="announceStaking-cancel"
            label="Cancel the announcement"
            actor={ownerActor}
            build={() => ({ ok: true, value: { req: tx('announceStaking', [ZERO]), preview: 'The announced replacement would be withdrawn.' } })}
            consequence="Withdraws the announced replacement; the treasury keeps paying the current contract."
            done={() => 'The announcement is cancelled.'}
          />
        )}
        {t.pendingStaking && change && (
          <OwnerAction
            id="applyStaking"
            label="Apply"
            actor={ctx.anyone}
            offReason={
              change.phase === 'waiting'
                ? `Not yet: it can be applied from ${fmtLocalUtc(change.from)}.`
                : change.phase === 'expired'
                  ? 'Expired: it can only be replaced or cancelled.'
                  : null
            }
            build={() => ({ ok: true, value: { req: tx('applyStaking'), preview: `From now on every payout would go to ${fullAddress(t.pendingStaking!)}.` } })}
            consequence="Every payout from now on goes to the announced contract. ETH already paid keeps streaming where it is, and no stake moves. Anyone may apply it."
            done={() => 'The new staking contract is in use.'}
          />
        )}
      </Power>

      <Power
        id="pause"
        title="Pause the daily payout"
        settings={
          <>
            <Setting
              label="Payouts"
              value={t.paused ? 'Paused' : pauseAt !== null ? 'Running; a pause is announced' : 'Running'}
              view="Treasury.paused"
              note={t.paused ? `Since ${fmtLocalUtc(t.pauseEffectiveAt)}.` : undefined}
            />
            <Setting label="Pause takes effect" value={pauseAt !== null ? fmtLocalUtc(pauseAt) : 'None announced'} view="Treasury.pauseEffectiveAt" />
            <Setting label="Wait before a pause" value={fmtDuration(t.OWNER_DELAY)} view="Treasury.OWNER_DELAY" note="Unpausing is immediate." />
          </>
        }
      >
        {t.paused ? (
          <OwnerAction
            id="unpause"
            label="Unpause"
            actor={ownerActor}
            build={() => ({ ok: true, value: { req: tx('unpause'), preview: 'Payouts would resume at once.' } })}
            consequence="Payouts resume at once: the next trigger pays at the daily rate, with the ETH that waited counted in."
            done={() => 'Payouts have resumed.'}
          />
        ) : pauseAt !== null ? (
          <OwnerAction
            id="cancelPause"
            label="Cancel the pause"
            actor={ownerActor}
            build={() => ({ ok: true, value: { req: tx('cancelPause'), preview: 'The announced pause would be withdrawn.' } })}
            consequence="Withdraws the announced pause; payouts continue as usual."
            done={() => 'The pause is cancelled.'}
          />
        ) : (
          <OwnerAction
            id="announcePause"
            label="Announce a pause"
            actor={ownerActor}
            build={() => ({ ok: true, value: { req: tx('announcePause'), preview: `Payouts would pause from about ${fmtLocalUtc(now + t.OWNER_DELAY)}.` } })}
            consequence={`After a public wait of ${fmtDuration(t.OWNER_DELAY)}, the daily payout stops until the owner unpauses. The stakers’ ETH waits in the treasury and is paid out afterwards; nothing goes to the owner beyond the 10% reserve. It can be cancelled during the wait.`}
            done={() => 'The pause is announced.'}
          />
        )}
        <p class="small muted">
          {t.paused ? 'Unpause appears while payouts are paused; announcing and cancelling appear once they run.' : pauseAt !== null ? 'Cancel appears while a pause is announced; Unpause once it takes effect.' : 'Cancel appears once a pause is announced; Unpause once it takes effect.'}
        </p>
      </Power>

      <OwnershipPower ctx={ctx} contract="Treasury" />
    </Card>
  );
}

function StakingCard({ ctx, chain, name }: { ctx: Ctx; chain: ChainState; name: string }) {
  const { network } = useApp();
  const { o } = ctx;
  const s = chain.staking;
  // CR-72: the staking contract's powers go only to a contract the site lists.
  const unlisted = stakingOff(network, o);
  const ownerActor: Actor = unlisted ?? ctx.actor(o.staking.owner, `${name}’s owner`);
  const anyone: Actor = unlisted ?? ctx.anyone;
  const now = nowOf(o);
  const [price, setPrice] = useState('');
  const [feed, setFeed] = useState('');
  const tx = (fn: string, args: readonly unknown[] = []) => ownerTx(network, 'TownStaking', fn, args, o.staking.address);
  const fallbackEnds = s.fallbackPriceSetAt ? s.fallbackPriceSetAt + s.FALLBACK_MAX_AGE : 0;
  const source = s.priceStatus.source === PriceSource.Feed ? 'The Chainlink feed' : s.priceStatus.source === PriceSource.Fallback ? 'The fallback price' : 'None';
  const feedReady = s.pendingFeed !== null && now >= s.pendingFeedEffectiveAt;
  return (
    <Card title={name} class="owner-card" id="owner-staking-card">
      {unlisted && (
        <div class="card-lead">
          <Notice kind="warn" title={UNLISTED_STAKING}>
            <p>
              The treasury pays <code class="break">{fullAddress(o.staking.address)}</code>, which this site does not list. Its settings are shown; its
              powers are off here. Add it to the site’s list of staking contracts, publish the site, then use them.
            </p>
          </Notice>
        </div>
      )}
      <Power
        id="fallback"
        title="Fallback ETH/USD price"
        settings={
          <>
            <Setting
              label="Price in use"
              value={s.priceStatus.source === PriceSource.None ? 'None' : fmtUsd8(s.priceStatus.price)}
              view="TownStaking.priceStatus"
              note={`${source}${s.priceStatus.source !== PriceSource.None ? `, set ${fmtLocalUtc(s.priceStatus.updatedAt)}` : ': vault purchases and upgrades are refused'}.`}
            />
            <Setting
              label="Fallback price"
              value={s.fallbackPrice > 0n ? fmtUsd8(s.fallbackPrice) : 'Not set'}
              view="TownStaking.fallbackPrice"
              note={s.fallbackPriceSetAt ? `Set ${fmtLocalUtc(s.fallbackPriceSetAt)}.` : undefined}
            />
            <Setting
              label="Fallback expires"
              value={fallbackEnds ? fmtLocalUtc(fallbackEnds) : '—'}
              view="TownStaking.fallbackPriceSetAt + FALLBACK_MAX_AGE"
              note={`Each setting lasts ${fmtDuration(s.FALLBACK_MAX_AGE)}${fallbackEnds && fallbackEnds < now ? '; this one has expired' : ''}.`}
            />
          </>
        }
      >
        <OwnerAction
          id="setFallbackPrice"
          label="Set the fallback"
          actor={ownerActor}
          dirty={price !== ''}
          fields={
            <Field
              id="owner-price"
              label="ETH price in dollars"
              value={price}
              onInput={setPrice}
              placeholder="2500"
              suffix="USD"
              hint="Up to 8 decimals; above zero."
              uses={(() => {
                const p = checkPrice(price);
                return <Uses value={p.ok ? p.value : null} decimals={8} unit="USD" />;
              })()}
            />
          }
          build={() => {
            const p = checkPrice(price);
            return p.ok
              ? {
                  ok: true,
                  value: {
                    req: tx('setFallbackPrice', [p.value]),
                    preview: `The fallback becomes ${fmtUsd8(p.value)}, valid until about ${fmtLocalUtc(now + s.FALLBACK_MAX_AGE)}. It is used only while the Chainlink feed is unhealthy.`,
                  },
                }
              : p;
          }}
          consequence={`Used only while the Chainlink feed is unhealthy, and for at most ${fmtDuration(s.FALLBACK_MAX_AGE)} from now; a healthy feed always wins. A wrong price makes vault prices depart from their dollar targets during a feed outage, and a near-free vault lets its buyer collect an empty tier’s backlog cheaply. Existing stakes and earned rewards are untouched.`}
          done={() => 'The fallback price is set.'}
        />
      </Power>

      <Power
        id="feed"
        title="ETH/USD price feed"
        settings={
          <>
            <Setting label="Feed in use" value={<Addr a={o.staking.feed} />} view="TownStaking.feed" />
            <Setting label="Announced feed" value={s.pendingFeed ? <Addr a={s.pendingFeed} /> : 'None'} view="TownStaking.pendingFeed" />
            {s.pendingFeed && <Setting label="Can be applied from" value={fmtLocalUtc(s.pendingFeedEffectiveAt)} view="TownStaking.pendingFeedEffectiveAt" />}
            <Setting label="Wait before a new feed" value={fmtDuration(s.FEED_CHANGE_DELAY)} view="TownStaking.FEED_CHANGE_DELAY" />
          </>
        }
      >
        <OwnerAction
          id="announceFeed"
          label="Announce a feed"
          actor={ownerActor}
          dirty={feed !== ''}
          fields={<Field id="owner-feed" label="New Chainlink ETH/USD feed" value={feed} onInput={setFeed} placeholder="0x…" suffix="address" hint="It must report 8 decimals." />}
          build={() => {
            const a = checkAddress(feed, { notZero: true });
            if (!a.ok) return a;
            return { ok: true, value: { req: tx('announceFeed', [a.value]), preview: `The feed ${fullAddress(a.value)} reports 8 decimals. It could be applied from about ${fmtLocalUtc(now + s.FEED_CHANGE_DELAY)}.` } };
          }}
          consequence={`After ${fmtDuration(s.FEED_CHANGE_DELAY)}, anyone can apply it. A wrong feed misprices vaults after the wait, with the same effect as a wrong fallback price; existing stakes and earned rewards are untouched. A new announcement replaces any pending one.`}
          done={() => 'The feed is announced; the wait has begun.'}
        />
        {s.pendingFeed && (
          <>
            <OwnerAction
              id="announceFeed-cancel"
              label="Cancel the announced feed"
              actor={ownerActor}
              build={() => ({ ok: true, value: { req: tx('announceFeed', [ZERO]), preview: 'The announced feed would be withdrawn.' } })}
              consequence="Withdraws the announced feed; the current one stays in use."
              done={() => 'The announced feed is cancelled.'}
            />
            <OwnerAction
              id="applyFeed"
              label="Apply the feed"
              actor={anyone}
              offReason={feedReady ? null : `Not yet: it can be applied from ${fmtLocalUtc(s.pendingFeedEffectiveAt)}.`}
              build={() => ({ ok: true, value: { req: tx('applyFeed'), preview: `The feed ${fullAddress(s.pendingFeed!)} would be in use from now on.` } })}
              consequence="Vault prices are read from the new feed from now on. Anyone may apply it."
              done={() => 'The new feed is in use.'}
            />
          </>
        )}
      </Power>

      <OwnershipPower ctx={ctx} contract="TownStaking" name={name} />
    </Card>
  );
}

function VaultCard({ ctx, chain }: { ctx: Ctx; chain: ChainState }) {
  const { network } = useApp();
  const { o } = ctx;
  const v = o.lpVault;
  const ownerActor = ctx.actor(v.owner, 'LPVault’s owner');
  const [feesTo, setFeesTo] = useState('');
  const [until, setUntil] = useState('');
  const [posTo, setPosTo] = useState('');
  const tx = (fn: string, args: readonly unknown[] = []) => ownerTx(network, 'LPVault', fn, args);
  const locked = chain.blockTimestamp < v.unlockTime;
  return (
    <Card title="LPVault" class="owner-card" id="owner-lpvault">
      <Power
        id="fees"
        title="Trading fees of the locked position"
        settings={
          <>
            <Setting label="Position" value={`#${v.tokenId.toString()}`} view="LPVault.tokenId" note="Its fees arrive as ETH from buys and TOWN from sells." />
          </>
        }
      >
        <OwnerAction
          id="collectFees"
          label="Collect the fees"
          actor={ownerActor}
          dirty={feesTo !== ''}
          fields={<Field id="owner-fees-to" label="Send the fees to" value={feesTo} onInput={setFeesTo} placeholder="0x…" suffix="address" />}
          build={() => {
            const a = checkAddress(feesTo, { special: true });
            if (!a.ok) return a;
            return { ok: true, value: { req: tx('collectFees', [a.value]), preview: `The position’s trading fees would go to ${fullAddress(a.value)}.` } };
          }}
          consequence="Sends the position’s accrued trading fees (ETH and TOWN) to this address. This is the owner’s income; the liquidity itself stays locked."
          done={() => 'The fees were collected.'}
        />
      </Power>

      <Power
        id="lock"
        title="The lock"
        settings={
          <>
            <Setting label="Locked until" value={fmtLocalUtc(v.unlockTime)} view="LPVault.unlockTime" />
            <Setting label="Shortest lock allowed" value={`${fmtInt(Math.round(v.MIN_LOCK_DURATION / 86_400))} days`} view="LPVault.MIN_LOCK_DURATION" />
          </>
        }
      >
        <OwnerAction
          id="extendLock"
          label="Extend the lock"
          actor={ownerActor}
          dirty={until !== ''}
          fields={
            <Field
              id="owner-unlock"
              label="New unlock date, your time"
              type="datetime-local"
              value={until || localInputValue(v.unlockTime)}
              onInput={setUntil}
              hint={(() => {
                const r = checkUnlock(until, v.unlockTime);
                return r.ok ? `That is ${fmtLocalUtc(r.value)}.` : 'Later than the current unlock date.';
              })()}
            />
          }
          build={() => {
            const r = checkUnlock(until || localInputValue(v.unlockTime), v.unlockTime);
            if (!r.ok) return r;
            return { ok: true, value: { req: tx('extendLock', [BigInt(r.value)]), preview: `The lock would end on ${fmtLocalUtc(r.value)} instead of ${fmtLocalUtc(v.unlockTime)}.` } };
          }}
          consequence="The liquidity stays locked until the new date. This cannot be undone: the lock can be extended again, but never shortened."
          confirmWord="extend the lock"
          done={() => 'The lock is extended.'}
          onSent={() => setUntil('')}
        />
      </Power>

      <Power
        id="withdraw-position"
        title="Withdraw the position"
        settings={<Setting label="Allowed from" value={fmtLocalUtc(v.unlockTime)} view="LPVault.unlockTime" note={locked ? 'Still locked.' : 'The lock has ended.'} />}
      >
        <OwnerAction
          id="withdrawPosition"
          label="Withdraw the position"
          actor={ownerActor}
          offReason={locked ? `Off until the unlock date, ${fmtLocalUtc(v.unlockTime)}.` : null}
          dirty={posTo !== ''}
          fields={<Field id="owner-position-to" label="Send the position to" value={posTo} onInput={setPosTo} placeholder="0x…" suffix="address" />}
          build={() => {
            const a = checkAddress(posTo, { notZero: true });
            if (!a.ok) return a;
            return { ok: true, value: { req: tx('withdrawPosition', [a.value]), preview: `The position #${v.tokenId.toString()} would go to ${fullAddress(a.value)}.` } };
          }}
          consequence={`Takes the liquidity position out of the vault and sends it to ${(() => {
            const a = checkAddress(posTo, { notZero: true });
            return a.ok ? fullAddress(a.value) : 'this address';
          })()}; the pool’s liquidity can then be removed. This cannot be undone.`}
          confirmWord="withdraw the position"
          done={() => 'The position was withdrawn.'}
        />
      </Power>

      <OwnershipPower ctx={ctx} contract="LPVault" />
    </Card>
  );
}

/** The two-step ownership of one contract: the owner, the open offer, offering, and accepting. */
export function OwnershipPower({ ctx, contract, name }: { ctx: Ctx; contract: Owned; name?: string }) {
  const { network } = useApp();
  const { o } = ctx;
  const own = ownershipOf(o, contract);
  const label = name ?? contract;
  const [to, setTo] = useState('');
  const target: OwnerTarget = contract;
  const tx = (fn: string, args: readonly unknown[] = []) => ownerTx(network, target, fn, args, o.staking.address);
  // CR-72: the staking contract's ownership is handled here only when the site lists it.
  const off = contract === 'TownStaking' ? stakingOff(network, o) : null;
  const offered = checkAddress(to, { notZero: true });
  const kind = (a: Address) => {
    const ms = o.multisigs[a.toLowerCase()];
    return ms ? (ms.signers ? `A Safe multisig: ${signersText(ms)}.` : 'A contract that did not answer as a Safe.') : 'A wallet.';
  };
  return (
    <Power
      id={`ownership-${contract}`}
      title={`Ownership of ${label}`}
      settings={
        <>
          <Setting label="Owner" value={<Addr a={own.owner} />} view={`${contract}.owner`} note={kind(own.owner)} />
          <Setting
            label="Offered to"
            value={own.pendingOwner ? <Addr a={own.pendingOwner} /> : 'No open offer'}
            view={`${contract}.pendingOwner`}
            note={own.pendingOwner ? 'It becomes the owner once it accepts. A new offer replaces this one.' : undefined}
          />
        </>
      }
    >
      <OwnerAction
        id={`transferOwnership-${contract}`}
        label="Offer ownership"
        actor={off ?? ctx.actor(own.owner, `${label}’s owner`)}
        dirty={to !== ''}
        fields={<Field id={`owner-offer-${contract}`} label="New owner" value={to} onInput={setTo} placeholder="0x…" suffix="address" hint="Two steps: this offer, then the new owner accepts." />}
        build={() => {
          const a = checkAddress(to, { notZero: true });
          if (!a.ok) return a;
          if (a.value.toLowerCase() === own.owner.toLowerCase()) return { ok: false, error: `That address already owns ${label}.` };
          return { ok: true, value: { req: tx('transferOwnership', [a.value]), preview: `${fullAddress(a.value)} would be offered ownership of ${label}; it becomes the owner when it accepts.` } };
        }}
        consequence={`Once ${offered.ok ? fullAddress(offered.value) : 'the new owner'} accepts, every owner power of ${label} passes to it, and only it can hand them back. Until then the offer can be replaced by a new one.`}
        confirmWord="offer ownership"
        done={() => `Ownership of ${label} is offered. The new owner must accept it.`}
        onSent={() => setTo('')}
      />
      {own.pendingOwner && (
        <OwnerAction
          id={`acceptOwnership-${contract}`}
          label="Accept ownership"
          actor={off ?? ctx.actor(own.pendingOwner, `the address offered ownership of ${label}`)}
          build={() => ({ ok: true, value: { req: tx('acceptOwnership'), preview: `This would make ${fullAddress(own.pendingOwner!)} the owner of ${label}.` } })}
          consequence={`${fullAddress(own.pendingOwner)} becomes the owner of ${label}, with every owner power listed for it here; the previous owner loses them.`}
          errorWords={{ OwnableUnauthorizedAccount: 'Only the address offered ownership can accept it.' }}
          done={() => `${fullAddress(own.pendingOwner!)} is now the owner of ${label}.`}
        />
      )}
    </Power>
  );
}
