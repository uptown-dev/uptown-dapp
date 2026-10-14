import { useState } from 'preact/hooks';
import { RunStatus, Stop, readUntil, useRun, useWatch, type Run, type Runner } from '../components/steps';
import { useApp, useChain, useTx, Card, Chips, ConnectPrompt, Details, Fig, FieldError, Figures, Notice, PageHead, Row, Rows, Tabs, TxStatus, Usd, Uses, type Tx } from '../components/ui';
import { amountError, amountOrNull } from '../lib/amount';
import { UNLISTED_STAKING, listedStaking } from '../lib/network';
import { PriceSource, TIERS, type OldVault, type Tier } from '../data/types';
import {
  fallbackExpiresAt,
  pausePending,
  stakingChange,
  stakingPaidSince,
  stakingReplaced,
  streamEnd,
  tierEmpty,
  tierMultiplier,
  tierShareBps,
  unpaidStream,
} from '../lib/derive';
import { fmtBps, fmtDate, fmtDateTime, fmtDuration, fmtEth, fmtInt, fmtTown, fmtUsd8, shortAddress } from '../lib/format';
import { STAKING_GAS_LIMIT, addStakeTx, approveTx, claimWethTx, openVaultTx, unstakeTx, upgradeTx, withMargin } from '../lib/actions';
import { readStakeApproval, readVaultPrice } from '../lib/reads';
import { explainError } from '../lib/errors';
import type { Network } from '../lib/network';
import type { PublicClient } from 'viem';
import type { Address } from '../data/types';

/** A TOWN amount typed (CR-72: a point for decimals, commas only between thousands), or null. */
const parseTown = (s: string): bigint | null => amountOrNull(s, 18);
/** The sentence for a TOWN amount that cannot be used, or null. */
const townError = (s: string): string | null => amountError(s, 18, 'Enter an amount of TOWN, for example 1,000,000.');

export function Stake() {
  return (
    <div class="wrap page">
      <PageHead
        title="Stake"
        lead="Buy a vault in one of five tiers, put TOWN in it and earn a share of the ETH the treasury pays out every day, as WETH."
      />
      <PayoutChanges />
      <OldVaults />
      <PriceStatus />
      <EmptyTiers />
      <TierTable />
      <YourVault />
      <Details>
        <ul class="plain-list">
          <li>
            <strong>Fixed shares per tier.</strong> Every payout is cut into five fixed slices by multiplier (100 : 125 : 150 : 175 : 200 of 750), however many
            stakers each tier has. A lone staker takes the tier’s whole slice; a crowded tier shares it thinly.
          </li>
          <li>
            <strong>Empty tiers.</strong> An empty tier’s waiting ETH goes to whoever joins it, over at most seven days, shared with anyone else who joins
            meanwhile.
          </li>
          <li>
            <strong>When payouts happen.</strong> Once a day, when someone triggers the day: any staking action, or the free button on the{' '}
            <a href="#/stats">Stats page</a>. The day’s budget is paid only if it is at least 0.001 ETH; a smaller one waits. Each payout streams to the tiers
            over seven days, and you earn only while staked.
          </li>
          <li>
            <strong>Only here.</strong> This page offers vaults only in the staking contract the treasury pays now. If the owner ever replaces it, the old
            contract still sells vaults to anyone who reaches it another way, but they earn nothing new; this page shows a vault left there with unstake and
            claim only.
          </li>
          <li>
            <strong>Vaults.</strong> One vault per wallet; it cannot be transferred. No lock and no expiry. Adding TOWN costs no extra vault price. Upgrading
            costs the dollar difference between the two tiers; there is no downgrade.
          </li>
          <li>
            <strong>Prices.</strong> Vault prices are set in dollars and paid in ETH at Chainlink’s ETH/USD price. While the feed is unhealthy (no update for
            over 3 hours, a failed read, or a time in the future), the owner’s fallback price is used for up to 7 days from each setting; with neither, opening
            and upgrading pause. Adding TOWN, unstaking and claiming never use the price.
          </li>
          <li>
            <strong>Gas.</strong> Staking transactions are sent with a gas limit of {fmtInt(Number(STAKING_GAS_LIMIT))}, so the day’s payout can run with your action;
            the first staking action of a day costs more gas for that reason. Small vaults may not cover their gas.
          </li>
        </ul>
      </Details>
    </div>
  );
}

/**
 * CR-46, CR-48, CR-50: the treasury's payouts paused, a pause announced, a different staking
 * contract announced (waiting, open to anyone within its 7-day window, or expired), or already in
 * use; each with a link to the Stats page, where every pending owner change is listed.
 */
function PayoutChanges() {
  const chain = useChain();
  const { network } = useApp();
  const t = chain.treasury;
  const pauseAt = pausePending(chain);
  const change = stakingChange(chain);
  const unlisted = listedStaking(network, t.staking) === null;
  const replaced = !unlisted && stakingReplaced(chain, network.deployment?.contracts.TownStaking);
  const since = stakingPaidSince(network.stakingContracts, t.staking);
  const more = (
    <>
      {' '}
      See the <a href="#/stats">Stats page</a>.
    </>
  );
  return (
    <>
      {unlisted && (
        <Notice kind="warn" title={UNLISTED_STAKING}>
          <p class="unlisted-staking">
            The treasury now pays the staking contract <code class="break">{t.staking}</code>, which this site does not list yet. Its figures are shown
            below, but this site sends nothing to it: opening, adding and upgrading are off here. A vault in a staking contract this site lists can still be
            unstaked and claimed below.
          </p>
        </Notice>
      )}
      {t.paused && (
        <Notice kind="warn" title="The treasury’s payouts are paused by the owner">
          <p>
            No new ETH reaches the tiers until the owner unpauses; the stakers’ share waits in the treasury and is paid out afterwards. ETH already streaming
            here keeps streaming, and adding TOWN, unstaking and claiming keep working.{more}
          </p>
        </Notice>
      )}
      {pauseAt !== null && (
        <Notice kind="info" title="A pause of the payouts is announced">
          <p>
            From <span class="num">{fmtDateTime(pauseAt)}</span> the treasury’s payouts will be paused, unless the owner cancels it first. ETH already
            streaming here is not affected.{more}
          </p>
        </Notice>
      )}
      {change?.phase === 'waiting' && (
        <Notice kind="warn" title="A different staking contract is announced">
          <p>
            From <span class="num">{fmtDateTime(change.from)}</span> until <span class="num">{fmtDateTime(change.until)}</span> anyone can apply it, and the
            treasury then pays it instead of this one; ETH already streaming here is not affected.{more}
          </p>
        </Notice>
      )}
      {change?.phase === 'open' && t.candidate?.verified === false && (
        <Notice kind="info" title="An announced staking contract cannot be applied">
          <p>
            Its wait is over, but this site asked it and it does not look like a staking contract, so the treasury will refuse it: payouts keep coming
            here.{more}
          </p>
        </Notice>
      )}
      {change?.phase === 'open' && t.candidate?.verified !== false && (
        <Notice kind="warn" title="A different staking contract can be applied now">
          <p>
            Treat it as already in effect: anyone can apply it at any moment until <span class="num">{fmtDateTime(change.until)}</span>, and from then on new
            payouts go to it, not here. ETH already streaming here is not affected.{more}
          </p>
        </Notice>
      )}
      {change?.phase === 'expired' && (
        <Notice kind="info" title="An announced staking contract has expired">
          <p>
            It was not applied by <span class="num">{fmtDateTime(change.until)}</span>, so it can no longer be: the treasury keeps paying this contract. To
            replace it, the owner must announce again, with a new 2-day wait.{more}
          </p>
        </Notice>
      )}
      {replaced && (
        <Notice kind="info" title="The treasury pays a replacement staking contract">
          <p>
            The owner replaced TownStaking{since !== null ? <> on <span class="num">{fmtDate(since)}</span></> : null}: payouts now go to{' '}
            <code>{shortAddress(t.staking)}</code>, and this page offers vaults only in it. A vault in TownStaking earns no new rewards; it can still be
            unstaked and claimed.{more}
          </p>
        </Notice>
      )}
    </>
  );
}

/**
 * CR-50: the wallet's vaults in staking contracts the Treasury no longer pays (the network
 * module's hand-kept list). No purchase, addition or upgrade is offered there; only unstake and claim.
 */
function OldVaults() {
  const { wallet } = useApp();
  if (!wallet || wallet.oldVaults.length === 0) return null;
  return (
    <>
      {wallet.oldVaults.map((v) => (
        <OldVaultCard key={v.address} vault={v} />
      ))}
    </>
  );
}

export function OldVaultCard({ vault }: { vault: OldVault }) {
  const tx = useTx();
  const { network } = useApp();
  const [confirming, setConfirming] = useState(false);
  const has = vault.positionOf.tier !== 0;
  const amount = vault.positionOf.amount;
  return (
    <Card title="Your vault in a replaced staking contract" class="old-vault">
      <p class="old-vault-line">
        <span class="replaced-tag">
          {vault.replacedOn !== null ? `Replaced on ${fmtDate(vault.replacedOn)}` : 'Replaced'}: no new rewards; unstake and claim only
        </span>{' '}
        <code title={vault.address}>{shortAddress(vault.address)}</code>
      </p>
      <p class="small muted">
        The treasury no longer pays this contract, so it receives no new payouts; ETH it received before keeps streaming over its seven days. Your TOWN and
        earned WETH stay yours: unstake and claim them here. To earn from new payouts, stake in the current contract below.
      </p>
      <Figures cols={3}>
        <Fig label="Tier" value={has ? `Tier ${vault.positionOf.tier}` : 'No vault'} view="positionOf(wallet).tier, replaced contract" />
        <Fig label="TOWN staked" value={fmtTown(amount)} unit="TOWN" amount={amount} view="positionOf(wallet).amount, replaced contract" />
        <Fig label="Earned" value={fmtEth(vault.earned)} unit="WETH" amount={vault.earned} view="earned(wallet), replaced contract" accent />
      </Figures>
      <div class="btn-row">
        <button
          type="button"
          class="btn btn-primary"
          disabled={tx.busy || vault.earned === 0n}
          onClick={() => void tx.run('Claim WETH', () => claimWethTx(network, vault.address), () => `About ${fmtEth(vault.earned)} WETH went to your wallet.`)}
        >
          {`Claim ${fmtEth(vault.earned)} WETH`}
        </button>
        {!confirming && (
          <button type="button" class="btn btn-danger" disabled={tx.busy || !has} onClick={() => setConfirming(true)}>
            Unstake everything
          </button>
        )}
      </div>
      {confirming && (
        <div class="confirm-box" role="group" aria-label="Confirm unstaking from the replaced contract">
          <p>
            <strong>Unstake everything from the replaced contract?</strong> Your {fmtTown(amount)} TOWN <Usd amount={amount} unit="TOWN" paren /> comes back and
            that vault closes.
          </p>
          <div class="btn-row">
            <button
              type="button"
              class="btn btn-danger"
              disabled={tx.busy}
              onClick={() => {
                setConfirming(false);
                void tx.run('Unstake', () => unstakeTx(network, vault.address), () => `${fmtTown(amount)} TOWN came back to your wallet and the old vault is closed. Earned WETH stays claimable.`);
              }}
            >
              Yes, unstake everything
            </button>
            <button type="button" class="btn btn-secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <TxStatus tx={tx} />
    </Card>
  );
}

/** CR-50: shown beside every vault purchase (open, upgrade) while the treasury's payouts are paused. */
function PausedTag() {
  const chain = useChain();
  if (!chain.treasury.paused) return null;
  return (
    <p class="paused-beside" role="note">
      <span class="paused-tag">Payouts paused</span>
      <span class="small muted">
        The treasury pays nothing to stakers until the owner unpauses, so a vault bought now earns only what is left of the running streams until then.
      </span>
    </p>
  );
}

function PriceStatus() {
  const chain = useChain();
  const st = chain.staking;
  const ps = st.priceStatus;
  const age = chain.blockTimestamp - ps.updatedAt;
  return (
    <>
      {ps.source === PriceSource.Feed && (
        <p class="status-line">
          <span class="status-dot ok" aria-hidden="true" />
          <span>
            Vault prices use Chainlink ETH/USD: <span class="num">{fmtUsd8(ps.price)}</span>, updated {fmtDuration(age)} ago.
          </span>
        </p>
      )}
      {ps.source === PriceSource.Fallback && (
        <Notice kind="warn" title="Fallback price in use">
          <p>
            The Chainlink feed is unhealthy (no update for over 3 hours, a failed read, or a time in the future), so vault prices use the owner’s fallback
            price: <span class="num">{fmtUsd8(ps.price)}</span>, set {fmtDuration(age)} ago, valid until{' '}
            <span class="num">{fmtDateTime(fallbackExpiresAt(chain))}</span>. Vault prices in ETH may differ from their dollar targets. Adding TOWN, unstaking
            and claiming are not affected.
          </p>
        </Notice>
      )}
      {ps.source === PriceSource.None && (
        <Notice kind="warn" title="No price: opening and upgrading vaults are paused">
          <p>
            The Chainlink feed is unhealthy and there is no valid fallback price, so no vault can be opened or upgraded until the feed recovers or the owner
            sets one. Adding TOWN, unstaking and claiming keep working.
          </p>
        </Notice>
      )}
      {st.pendingFeed && (
        <Notice kind="info" title="Price feed change announced">
          <p>
            The owner has announced a new ETH/USD feed, <code>{shortAddress(st.pendingFeed)}</code>. It can take effect from{' '}
            <span class="num">{fmtDateTime(st.pendingFeedEffectiveAt)}</span>, seven days after the announcement.
          </p>
        </Notice>
      )}
    </>
  );
}

function EmptyTiers() {
  const chain = useChain();
  const waiting = TIERS.filter((t) => tierEmpty(chain, t) && unpaidStream(chain, t) > 0n);
  if (waiting.length === 0) return null;
  return (
    <Notice kind="info" title={waiting.length === 1 ? `Tier ${waiting[0]} is empty, with ETH waiting` : 'Empty tiers with ETH waiting'}>
      {waiting.map((t) => (
        <p key={t}>
          <span class="num">{fmtEth(unpaidStream(chain, t))}</span> WETH <Usd amount={unpaidStream(chain, t)} unit="WETH" paren /> is waiting in tier {t}. It
          goes to whoever joins the tier, over at most seven days,
          shared with anyone else who joins meanwhile.
        </p>
      ))}
    </Notice>
  );
}

function TierTable() {
  const chain = useChain();
  const { wallet, network } = useApp();
  const st = chain.staking;
  const replaced = stakingReplaced(chain, network.deployment?.contracts.TownStaking);
  const unlisted = listedStaking(network, st.address) === null;
  return (
    <Card title="Tiers" class="flush">
      {unlisted ? (
        <p class="card-pad small muted">
          Vaults in <code data-view="Treasury.staking" class="break">{st.address}</code>, the staking contract the treasury pays now. This site does not list it
          yet, so it offers no vault in it.
        </p>
      ) : (
        <p class="card-pad small muted">
          Vaults in{' '}
          <code data-view="Treasury.staking" title={st.address}>
            {replaced ? shortAddress(st.address) : 'TownStaking'}
          </code>
          , the staking contract the treasury pays now: the only one this site offers vaults in.
        </p>
      )}
      <div class="table-scroll">
        <table class="table tiers stack">
          <caption class="visually-hidden">The five vault tiers</caption>
          <thead>
            <tr>
              <th scope="col">Tier</th>
              <th scope="col" class="r">
                Multiplier
              </th>
              <th scope="col" class="r">
                Vault price
              </th>
              <th scope="col" class="r">
                Share of daily ETH
              </th>
              <th scope="col" class="r">
                Stakers
              </th>
              <th scope="col" class="r">
                TOWN staked
              </th>
              <th scope="col" class="r">
                ETH still to stream
              </th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((t) => {
              const empty = tierEmpty(chain, t);
              const unpaid = unpaidStream(chain, t);
              const end = streamEnd(chain, t);
              const price = st.vaultPriceWei[t];
              const mine = wallet?.positionOf.tier === t;
              return (
                <tr key={t} class={mine ? 'mine' : undefined}>
                  <th scope="row" class="tier-name">
                    Tier {t}
                    {mine && <span class="now-tag">Yours</span>}
                    {empty && <span class="empty-tag">Empty</span>}
                  </th>
                  <td class="r num" data-label="Multiplier" data-view={`TownStaking.tierWeight(${t})`}>
                    {tierMultiplier(chain, t)}
                  </td>
                  <td class="r num" data-label="Vault price" data-view={`TownStaking.tierUsd(${t}), vaultPriceWei(${t})`}>
                    <span class="cell">
                      <span>${st.tierUsd[t]}</span>
                      <span class="sub">{price === null ? 'paused' : `${fmtEth(price, 6)} ETH`}</span>
                    </span>
                  </td>
                  <td class="r num" data-label="Share of daily ETH">
                    {fmtBps(tierShareBps(chain, t))}
                  </td>
                  <td class="r num" data-label="Stakers" data-view={`TownStaking.tierVaults(${t})`}>
                    {fmtInt(st.tierVaults[t])}
                  </td>
                  <td class="r num" data-label="TOWN staked" data-view={`TownStaking.tierStaked(${t})`}>
                    <span>
                      {fmtTown(st.tierStaked[t])} <Usd amount={st.tierStaked[t]} unit="TOWN" paren />
                    </span>
                  </td>
                  <td class="r num" data-label="ETH still to stream" data-view={`derived from TownStaking.streamInfo(${t})`}>
                    <span class="cell">
                      <span>
                        {fmtEth(unpaid)} WETH <Usd amount={unpaid} unit="WETH" paren />
                      </span>
                      <span class="sub">{empty ? (unpaid > 0n ? 'waiting for whoever joins' : 'nothing waiting') : end ? `until ${fmtDate(end)}` : 'no stream running'}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GoodToKnow() {
  return (
    <aside class="side-notes" aria-label="Good to know">
      <p class="side-title">Good to know</p>
      <ul class="note-list">
        <li>The vault price is paid once, in ETH, and is not refunded.</li>
        <li>
          The vault price goes to the treasury, not to the owner. Like all ETH the treasury receives, 90% is paid out to stakers over the following days and
          10% goes to the owner’s reserve.
        </li>
        <li>Unstaking is a full exit: all your TOWN comes back and the vault closes. Earned WETH stays claimable.</li>
        <li>The site sends about 1% more ETH than the vault price; the contract refunds the difference at once.</li>
        <li>Each day’s ETH is split between tiers by fixed shares, then within a tier by TOWN staked.</li>
      </ul>
    </aside>
  );
}

function YourVault() {
  const { wallet, network } = useApp();
  const chain = useChain();
  // One transaction state for every vault action, kept here so its result stays in view when the
  // tabs change (opening a vault turns "Open a vault" into Claim, Add, Upgrade and Unstake). Opening
  // and adding run their approval and the stake from one press (CR-82): their run lives here for the
  // same reason. Only the latest of the two is shown.
  const single = useTx();
  const steps = useRun();
  const tx: Tx = { ...single, busy: single.busy || steps.busy, run: (...a) => (steps.reset(), single.run(...a)) };
  const run: Run = { ...steps, busy: steps.busy || single.busy, start: (...a) => (single.reset(), steps.start(...a)) };
  // CR-72: the treasury pays a staking contract the site does not list: its figures, no action.
  const unlisted = listedStaking(network, chain.staking.address) === null;
  if (!wallet) {
    return (
      <Card title="Your vault">
        <div class="split">
          <ConnectPrompt what="your vault, your earned WETH and the staking actions" />
          <GoodToKnow />
        </div>
      </Card>
    );
  }
  const pos = wallet.positionOf;
  const has = pos.tier !== 0;
  type T = 'open' | 'claim' | 'add' | 'upgrade' | 'unstake';
  const tabs: { id: T; label: string }[] = has
    ? [
        { id: 'claim', label: 'Claim' },
        { id: 'add', label: 'Add' },
        { id: 'upgrade', label: 'Upgrade' },
        { id: 'unstake', label: 'Unstake' },
      ]
    : [{ id: 'open', label: 'Open a vault' }, ...(wallet.earned > 0n ? [{ id: 'claim' as T, label: 'Claim' }] : [])];
  return (
    <Card title="Your vault">
      <div class="split">
      <div>
      <Figures cols={3}>
        <Fig label="Tier" value={has ? `Tier ${pos.tier}` : 'No vault'} view="TownStaking.positionOf(wallet).tier" />
        <Fig label="TOWN staked" value={fmtTown(pos.amount)} unit="TOWN" amount={pos.amount} view="TownStaking.positionOf(wallet).amount" />
        <Fig label="Earned" value={fmtEth(wallet.earned)} unit="WETH" amount={wallet.earned} view="TownStaking.earned(wallet)" accent />
      </Figures>
      {unlisted ? (
        <div class="action-form unlisted-off" role="note">
          <p class="small">
            <strong>{UNLISTED_STAKING}.</strong> Opening, adding and upgrading are off here, and nothing is sent to{' '}
            <code class="break">{chain.staking.address}</code> from this site.
          </p>
        </div>
      ) : (
      <Tabs
        label="Staking actions"
        tabs={tabs}
        render={(id) => {
          switch (id) {
            case 'open':
              return <OpenForm tx={tx} run={run} />;
            case 'claim':
              return <ClaimForm tx={tx} />;
            case 'add':
              return <AddForm tx={tx} run={run} />;
            case 'upgrade':
              return <UpgradeForm tx={tx} />;
            default:
              return <UnstakeForm tx={tx} />;
          }
        }}
      />
      )}
      <TxStatus tx={tx} />
      <RunStatus run={run} />
      </div>
      <GoodToKnow />
      </div>
    </Card>
  );
}

/** Opening or adding: the exact-amount approval when it is missing, then the stake (CR-82). */
function stakePlan(approve: boolean, action: string): { id: string; label: string }[] {
  return [...(approve ? [{ id: 'approve', label: 'Approve TOWN' }] : []), { id: 'stake', label: action }];
}

/** Before the press: how many transactions the action takes, and that the wallet asks for each. */
function StakePlan({ amount, action }: { amount: bigint; action: string }) {
  const { network } = useApp();
  return (
    <p class="run-plan small" data-transactions="2">
      <strong>This takes 2 transactions:</strong> approve exactly <span class="num">{fmtTown(amount)}</span> TOWN <Usd amount={amount} unit="TOWN" paren /> for
      the staking contract, then {action}.{' '}
      {network.local
        ? 'Each is sent from the test wallet as soon as the one before is confirmed.'
        : 'Your wallet asks you to confirm each one; the second is sent as soon as the first is confirmed.'}
    </p>
  );
}

/**
 * The run behind "Approve and open" and "Approve and add" (CR-82): reads the approval now; sends the
 * exact-amount approval when it does not cover the amount (staking approvals stay the exact amount);
 * then, once it is confirmed, `last` prepares and sends the stake.
 */
async function approveThen(
  r: Runner,
  ctx: { client: PublicClient; network: Network; staking: Address; from: Address; amount: bigint; action: string },
  last: () => Promise<void>,
): Promise<void> {
  const { client, network, staking, from, amount, action } = ctx;
  const read = () => readStakeApproval(client, network, staking, from);
  const s = await read();
  const need = s.allowance < amount;
  r.plan(stakePlan(need, action));
  if (s.balance < amount) throw new Stop(`This wallet holds ${fmtTown(s.balance)} TOWN, less than the ${fmtTown(amount)} TOWN typed, so nothing was sent.`, 'Balance', false);
  if (need) {
    await r.send('approve', () => approveTx(network, staking, amount));
    await readUntil(r, read, (x) => x.allowance >= amount, 'the stake');
  }
  await last();
}

function OpenForm({ tx, run }: { tx: Tx; run: Run }) {
  const chain = useChain();
  const { wallet, network, client, account } = useApp();
  const st = chain.staking;
  const [tier, setTier] = useState<Tier>(1);
  const [amount, setAmount] = useState('');
  const price = st.vaultPriceWei[tier];
  const amt = parseTown(amount);
  const tooMuch = !!wallet && amt !== null && amt > wallet.townBalance;
  const approved = !!wallet && amt !== null && amt > 0n && wallet.townAllowanceToStaking >= amt;
  useWatch(run, { amount, tier: String(tier), staking: st.address });
  const open = () => {
    if (price === null || amt === null || !account) return;
    const shown = price; // the figure the "You send" line is built from
    const t = tier;
    const a = amt;
    const staking = st.address;
    const action = `Open tier ${t} vault`;
    void run.start(`Open a tier ${t} vault`, stakePlan(!approved, action), async (r) => {
      await approveThen(r, { client, network, staking, from: account, amount: a, action }, async () => {
        // The vault price read again just before the stake is sent.
        let now: bigint;
        try {
          now = await readVaultPrice(client, staking, t);
        } catch (e) {
          throw new Stop(explainError(e).message);
        }
        r.check();
        if (now > shown)
          throw new Stop(
            `The tier ${t} vault price rose to ${fmtEth(now, 6)} ETH, above the ${fmtEth(shown, 6)} ETH shown, so the vault was not opened. Press the button again to open it at the new price: you would send about ${fmtEth(withMargin(now), 6)} ETH.`,
            'PriceRose',
            false,
          );
        await r.send('stake', () => openVaultTx(network, staking, t, a, shown));
      });
      return `Your tier ${t} vault is open with ${fmtTown(a)} TOWN staked. The extra ETH was refunded.`;
    });
  };
  return (
    <form class="action-form" onSubmit={(e) => e.preventDefault()}>
      <Chips label="Tier" options={TIERS.map((t) => ({ value: t, label: `Tier ${t} · $${st.tierUsd[t]}` }))} value={tier} onChange={setTier} />
      <div class="field">
        <label for="vault-town">TOWN to stake</label>
        <div class="input-wrap">
          <input
            id="vault-town"
            class="num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            aria-invalid={townError(amount) !== null}
            onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
          />
          <span class="suffix">TOWN</span>
        </div>
        <Uses value={amt} unit="TOWN" />
        {townError(amount) && <FieldError>{townError(amount)}</FieldError>}
        <span class="hint">
          Your TOWN: <span class="num">{fmtTown(wallet?.townBalance ?? 0n)}</span> <Usd amount={wallet?.townBalance} unit="TOWN" paren />
          {wallet?.townBalance === 0n && (
            <>
              {' '}
              · <a href="#/trade">Buy TOWN first</a>
            </>
          )}
          {wallet && wallet.townAllowanceToStaking > 0n && (
            <>
              {' '}
              · approved: <span class="num">{fmtTown(wallet.townAllowanceToStaking)}</span>
            </>
          )}
        </span>
        {tooMuch && <FieldError>That is more TOWN than this wallet holds.</FieldError>}
      </div>
      <Rows>
        <Row label={`Vault price, paid once ($${st.tierUsd[tier]})`} value={price === null ? 'paused' : `${fmtEth(price, 6)} ETH`} view={`TownStaking.vaultPriceWei(${tier})`} />
        <Row
          label="You send (about 1% more)"
          value={
            price === null ? (
              '—'
            ) : (
              <>
                {fmtEth(withMargin(price), 6)} ETH
                <Usd amount={withMargin(price)} unit="ETH" block />
              </>
            )
          }
        />
        <Row
          label="Refunded at once"
          value={
            price === null ? (
              '—'
            ) : (
              <>
                ≈ {fmtEth(withMargin(price) - price, 6)} ETH
                <Usd amount={withMargin(price) - price} unit="ETH" block />
              </>
            )
          }
        />
      </Rows>
      {amt !== null && amt > 0n && !approved && !tooMuch && !tx.busy && <StakePlan amount={amt} action="open the vault" />}
      <PausedTag />
      <div class="btn-row">
        <button type="button" class="btn btn-primary stake-go" disabled={tx.busy || price === null || amt === null || amt === 0n || tooMuch} onClick={open}>
          {approved || amt === null || amt === 0n ? `Open tier ${tier} vault` : `Approve and open tier ${tier} vault`}
        </button>
      </div>
    </form>
  );
}

function ClaimForm({ tx }: { tx: Tx }) {
  const chain = useChain();
  const { wallet, network } = useApp();
  const earned = wallet?.earned ?? 0n;
  return (
    <div class="action-form">
      <p class="small muted">Sends all your earned WETH to your wallet. It also triggers the day’s payout if nobody has yet.</p>
      <button
        type="button"
        class="btn btn-primary"
        disabled={tx.busy || !wallet || earned === 0n}
        onClick={() => void tx.run('Claim WETH', () => claimWethTx(network, chain.staking.address), () => `About ${fmtEth(earned)} WETH went to your wallet.`)}
      >
        {`Claim ${fmtEth(earned)} WETH`}
      </button>
    </div>
  );
}

function AddForm({ tx, run }: { tx: Tx; run: Run }) {
  const chain = useChain();
  const { wallet, network, client, account } = useApp();
  const [amount, setAmount] = useState('');
  const amt = parseTown(amount);
  const tooMuch = !!wallet && amt !== null && amt > wallet.townBalance;
  const approved = !!wallet && amt !== null && amt > 0n && wallet.townAllowanceToStaking >= amt;
  useWatch(run, { amount, staking: chain.staking.address });
  const add = () => {
    if (amt === null || !account) return;
    const a = amt;
    const staking = chain.staking.address;
    void run.start('Add TOWN', stakePlan(!approved, 'Add TOWN'), async (r) => {
      await approveThen(r, { client, network, staking, from: account, amount: a, action: 'Add TOWN' }, async () => {
        await r.send('stake', () => addStakeTx(network, staking, a));
      });
      return `${fmtTown(a)} TOWN was added to your vault.`;
    });
  };
  return (
    <form class="action-form" onSubmit={(e) => e.preventDefault()}>
      <div class="field">
        <label for="add-town">TOWN to add</label>
        <div class="input-wrap">
          <input
            id="add-town"
            class="num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            aria-invalid={townError(amount) !== null}
            onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
          />
          <span class="suffix">TOWN</span>
        </div>
        <Uses value={amt} unit="TOWN" />
        {townError(amount) && <FieldError>{townError(amount)}</FieldError>}
        <span class="hint">
          No extra vault price, only gas. Your TOWN: <span class="num">{fmtTown(wallet?.townBalance ?? 0n)}</span>{' '}
          <Usd amount={wallet?.townBalance} unit="TOWN" paren />
          {wallet && wallet.townAllowanceToStaking > 0n && (
            <>
              {' '}
              · approved: <span class="num">{fmtTown(wallet.townAllowanceToStaking)}</span>
            </>
          )}
        </span>
        {tooMuch && <FieldError>That is more TOWN than this wallet holds.</FieldError>}
      </div>
      {amt !== null && amt > 0n && !approved && !tooMuch && !tx.busy && <StakePlan amount={amt} action="add it to your vault" />}
      <div class="btn-row">
        <button type="button" class="btn btn-primary stake-go" disabled={tx.busy || amt === null || amt === 0n || tooMuch} onClick={add}>
          {approved || amt === null || amt === 0n ? 'Add TOWN' : 'Approve and add TOWN'}
        </button>
      </div>
    </form>
  );
}

function UpgradeForm({ tx }: { tx: Tx }) {
  const chain = useChain();
  const { wallet, network } = useApp();
  const st = chain.staking;
  const current = (wallet?.positionOf.tier || 1) as Tier;
  const higher = TIERS.filter((t) => t > current);
  const [target, setTarget] = useState<Tier | null>(higher[0] ?? null);
  const chosen = target !== null && target > current ? target : (higher[0] ?? null);
  if (higher.length === 0) {
    return (
      <div class="action-form">
        <p class="small muted">Your vault is in tier 5, the highest. There is no downgrade.</p>
        </div>
    );
  }
  const up = chosen !== null ? (wallet?.upgradePriceWei[chosen] ?? null) : null;
  return (
    <form class="action-form" onSubmit={(e) => e.preventDefault()}>
      <Chips label="Upgrade to tier" options={higher.map((t) => ({ value: t, label: `Tier ${t}` }))} value={chosen} onChange={setTarget} />
      {chosen !== null && (
        <Rows>
          <Row
            label={`Price difference, paid once ($${st.tierUsd[chosen] - st.tierUsd[current]})`}
            value={up === null ? 'paused' : `${fmtEth(up, 6)} ETH`}
            view={`TownStaking.upgradePriceWei(wallet, ${chosen})`}
          />
          <Row
            label="You send (about 1% more)"
            value={
              up === null ? (
                '—'
              ) : (
                <>
                  {fmtEth(withMargin(up), 6)} ETH
                  <Usd amount={withMargin(up)} unit="ETH" block />
                </>
              )
            }
          />
        </Rows>
      )}
      <p class="small muted">Your whole stake moves up. Earned WETH stays yours. There is no way back down.</p>
      <PausedTag />
      <button
        type="button"
        class="btn btn-primary"
        disabled={tx.busy || up === null || chosen === null}
        onClick={() =>
          up !== null &&
          chosen !== null &&
          void tx.run(`Upgrade to tier ${chosen}`, () => upgradeTx(network, chain.staking.address, chosen, up), () => `Your vault is now in tier ${chosen}. The extra ETH was refunded.`)
        }
      >
        {chosen !== null ? `Upgrade to tier ${chosen}` : 'Upgrade'}
      </button>
    </form>
  );
}

function UnstakeForm({ tx }: { tx: Tx }) {
  const chain = useChain();
  const { wallet, network } = useApp();
  const [confirming, setConfirming] = useState(false);
  const amount = wallet?.positionOf.amount ?? 0n;
  return (
    <div class="action-form">
      <p class="small muted">
        Full exit: all <span class="num">{fmtTown(amount)}</span> TOWN <Usd amount={amount} unit="TOWN" paren /> comes back and the vault closes. Earned WETH
        stays claimable. The vault price is not
        refunded; staking again means buying a new vault.
      </p>
      {confirming ? (
        <div class="confirm-box" role="group" aria-label="Confirm unstaking">
          <p>
            <strong>Unstake everything and close your vault?</strong> Your {fmtTown(amount)} TOWN <Usd amount={amount} unit="TOWN" paren /> comes back; the vault
            price is not refunded.
          </p>
          <div class="btn-row">
            <button
              type="button"
              class="btn btn-danger"
              disabled={tx.busy}
              onClick={() => {
                setConfirming(false);
                void tx.run('Unstake', () => unstakeTx(network, chain.staking.address), () => `${fmtTown(amount)} TOWN came back to your wallet and your vault is closed. Earned WETH stays claimable.`);
              }}
            >
              Yes, unstake everything
            </button>
            <button type="button" class="btn btn-secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" class="btn btn-danger" disabled={tx.busy || amount === 0n} onClick={() => setConfirming(true)}>
          Unstake everything
        </button>
      )}
    </div>
  );
}
