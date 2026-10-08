import { useState } from 'preact/hooks';
import { parseUnits } from 'viem';
import { useApp, useChain, useTx, Card, Chips, ConnectPrompt, Details, Fig, FieldError, Figures, Notice, PageHead, Row, Rows, Tabs, TxStatus, type Tx } from '../components/ui';
import { PriceSource, TIERS, type Tier } from '../data/types';
import { fallbackExpiresAt, pausePending, stakingChangeReady, stakingReplaced, streamEnd, tierEmpty, tierMultiplier, tierShareBps, unpaidStream } from '../lib/derive';
import { fmtBps, fmtDate, fmtDateTime, fmtDuration, fmtEth, fmtInt, fmtTown, fmtUsd8, shortAddress } from '../lib/format';
import { STAKING_GAS_LIMIT, addStakeTx, approveTx, claimWethTx, openVaultTx, unstakeTx, upgradeTx, withMargin } from '../lib/actions';

function parseTown(s: string): bigint | null {
  const t = s.replace(/,/g, '').trim();
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  try {
    return parseUnits(t, 18);
  } catch {
    return null;
  }
}

export function Stake() {
  return (
    <div class="wrap page">
      <PageHead
        title="Stake"
        lead="Buy a vault in one of five tiers, put TOWN in it and earn a share of the ETH the treasury pays out every day, as WETH."
      />
      <PayoutChanges />
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
 * CR-46: the treasury's payouts paused, a pause announced, or a different staking contract
 * announced (or already in use), each with a link to the Stats page, where every pending owner
 * change is listed.
 */
function PayoutChanges() {
  const chain = useChain();
  const { network } = useApp();
  const t = chain.treasury;
  const pauseAt = pausePending(chain);
  const replaced = stakingReplaced(chain, network.deployment?.contracts.TownStaking);
  const more = (
    <>
      {' '}
      See the <a href="#/stats">Stats page</a>.
    </>
  );
  return (
    <>
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
      {t.pendingStaking !== null && (
        <Notice kind="warn" title="A different staking contract is announced">
          {stakingChangeReady(chain) ? (
            <p>
              Its 2-day wait ended on <span class="num">{fmtDateTime(t.stakingEffectiveAt)}</span>: once anyone applies it, the treasury will pay a different
              staking contract; ETH already streaming here is not affected.{more}
            </p>
          ) : (
            <p>
              From <span class="num">{fmtDateTime(t.stakingEffectiveAt)}</span> the treasury will pay a different staking contract; ETH already streaming here
              is not affected.{more}
            </p>
          )}
        </Notice>
      )}
      {replaced && (
        <Notice kind="warn" title="The treasury pays a different staking contract">
          <p>
            The owner replaced this staking contract: new payouts go to <code>{shortAddress(t.staking)}</code>. ETH already streaming here keeps streaming,
            and your TOWN can be unstaked at any time.{more}
          </p>
        </Notice>
      )}
    </>
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
          <span class="num">{fmtEth(unpaidStream(chain, t))}</span> WETH is waiting in tier {t}. It goes to whoever joins the tier, over at most seven days,
          shared with anyone else who joins meanwhile.
        </p>
      ))}
    </Notice>
  );
}

function TierTable() {
  const chain = useChain();
  const { wallet } = useApp();
  const st = chain.staking;
  return (
    <Card title="Tiers" class="flush">
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
                    {fmtTown(st.tierStaked[t])}
                  </td>
                  <td class="r num" data-label="ETH still to stream" data-view={`derived from TownStaking.streamInfo(${t})`}>
                    <span class="cell">
                      <span>{fmtEth(unpaid)} WETH</span>
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
        <li>Unstaking is a full exit: all your TOWN comes back and the vault closes. Earned WETH stays claimable.</li>
        <li>The site sends about 1% more ETH than the vault price; the contract refunds the difference at once.</li>
        <li>Each day’s ETH is split between tiers by fixed shares, then within a tier by TOWN staked.</li>
      </ul>
    </aside>
  );
}

function YourVault() {
  const { wallet } = useApp();
  // One transaction state for every vault action, kept here so its result stays in view when the
  // tabs change (opening a vault turns "Open a vault" into Claim, Add, Upgrade and Unstake).
  const tx = useTx();
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
        <Fig label="TOWN staked" value={fmtTown(pos.amount)} unit="TOWN" view="TownStaking.positionOf(wallet).amount" />
        <Fig label="Earned" value={fmtEth(wallet.earned)} unit="WETH" view="TownStaking.earned(wallet)" accent />
      </Figures>
      <Tabs
        label="Staking actions"
        tabs={tabs}
        render={(id) => {
          switch (id) {
            case 'open':
              return <OpenForm tx={tx} />;
            case 'claim':
              return <ClaimForm tx={tx} />;
            case 'add':
              return <AddForm tx={tx} />;
            case 'upgrade':
              return <UpgradeForm tx={tx} />;
            default:
              return <UnstakeForm tx={tx} />;
          }
        }}
      />
      <TxStatus tx={tx} />
      </div>
      <GoodToKnow />
      </div>
    </Card>
  );
}

/** Step 1 of opening or adding: approve exactly the TOWN typed; shows when the allowance already covers it. */
function ApproveButton({ tx, amount }: { tx: Tx; amount: bigint | null }) {
  const { wallet, network } = useApp();
  const enough = !!wallet && amount !== null && amount > 0n && wallet.townAllowanceToStaking >= amount;
  return (
    <button
      type="button"
      class="btn btn-secondary"
      disabled={tx.busy || enough || amount === null || amount === 0n}
      onClick={() =>
        amount !== null &&
        void tx.run('Approve TOWN', () => approveTx(network, amount), () => `The staking contract may now move ${fmtTown(amount)} of your TOWN. Now do step 2.`)
      }
    >
      {enough ? '1. TOWN approved' : '1. Approve TOWN'}
    </button>
  );
}

function OpenForm({ tx }: { tx: Tx }) {
  const chain = useChain();
  const { wallet, network } = useApp();
  const st = chain.staking;
  const [tier, setTier] = useState<Tier>(1);
  const [amount, setAmount] = useState('');
  const price = st.vaultPriceWei[tier];
  const amt = parseTown(amount);
  const tooMuch = !!wallet && amt !== null && amt > wallet.townBalance;
  const approved = !!wallet && amt !== null && amt > 0n && wallet.townAllowanceToStaking >= amt;
  return (
    <form class="action-form" onSubmit={(e) => e.preventDefault()}>
      <Chips label="Tier" options={TIERS.map((t) => ({ value: t, label: `Tier ${t} · $${st.tierUsd[t]}` }))} value={tier} onChange={setTier} />
      <div class="field">
        <label for="vault-town">TOWN to stake</label>
        <div class="input-wrap">
          <input id="vault-town" class="num" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} />
          <span class="suffix">TOWN</span>
        </div>
        <span class="hint">
          Your TOWN: <span class="num">{fmtTown(wallet?.townBalance ?? 0n)}</span>
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
        <Row label="You send (about 1% more)" value={price === null ? '—' : `${fmtEth(withMargin(price), 6)} ETH`} />
        <Row label="Refunded at once" value={price === null ? '—' : `≈ ${fmtEth(withMargin(price) - price, 6)} ETH`} />
      </Rows>
      <div class="btn-row">
        <ApproveButton tx={tx} amount={amt} />
        <button
          type="button"
          class="btn btn-primary"
          disabled={tx.busy || price === null || amt === null || amt === 0n || tooMuch || !approved}
          onClick={() =>
            price !== null &&
            amt !== null &&
            void tx.run(`Open a tier ${tier} vault`, () => openVaultTx(network, tier, amt, price), () => `Your tier ${tier} vault is open with ${fmtTown(amt)} TOWN staked. The extra ETH was refunded.`)
          }
        >
          {`2. Open tier ${tier} vault`}
        </button>
      </div>
    </form>
  );
}

function ClaimForm({ tx }: { tx: Tx }) {
  const { wallet, network } = useApp();
  const earned = wallet?.earned ?? 0n;
  return (
    <div class="action-form">
      <p class="small muted">Sends all your earned WETH to your wallet. It also triggers the day’s payout if nobody has yet.</p>
      <button
        type="button"
        class="btn btn-primary"
        disabled={tx.busy || !wallet || earned === 0n}
        onClick={() => void tx.run('Claim WETH', () => claimWethTx(network), () => `About ${fmtEth(earned)} WETH went to your wallet.`)}
      >
        {`Claim ${fmtEth(earned)} WETH`}
      </button>
    </div>
  );
}

function AddForm({ tx }: { tx: Tx }) {
  const { wallet, network } = useApp();
  const [amount, setAmount] = useState('');
  const amt = parseTown(amount);
  const tooMuch = !!wallet && amt !== null && amt > wallet.townBalance;
  const approved = !!wallet && amt !== null && amt > 0n && wallet.townAllowanceToStaking >= amt;
  return (
    <form class="action-form" onSubmit={(e) => e.preventDefault()}>
      <div class="field">
        <label for="add-town">TOWN to add</label>
        <div class="input-wrap">
          <input id="add-town" class="num" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} />
          <span class="suffix">TOWN</span>
        </div>
        <span class="hint">
          No extra vault price, only gas. Your TOWN: <span class="num">{fmtTown(wallet?.townBalance ?? 0n)}</span>
          {wallet && wallet.townAllowanceToStaking > 0n && (
            <>
              {' '}
              · approved: <span class="num">{fmtTown(wallet.townAllowanceToStaking)}</span>
            </>
          )}
        </span>
        {tooMuch && <FieldError>That is more TOWN than this wallet holds.</FieldError>}
      </div>
      <div class="btn-row">
        <ApproveButton tx={tx} amount={amt} />
        <button
          type="button"
          class="btn btn-primary"
          disabled={tx.busy || amt === null || amt === 0n || tooMuch || !approved}
          onClick={() => amt !== null && void tx.run('Add TOWN', () => addStakeTx(network, amt), () => `${fmtTown(amt)} TOWN was added to your vault.`)}
        >
          2. Add TOWN
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
          <Row label="You send (about 1% more)" value={up === null ? '—' : `${fmtEth(withMargin(up), 6)} ETH`} />
        </Rows>
      )}
      <p class="small muted">Your whole stake moves up. Earned WETH stays yours. There is no way back down.</p>
      <button
        type="button"
        class="btn btn-primary"
        disabled={tx.busy || up === null || chosen === null}
        onClick={() =>
          up !== null &&
          chosen !== null &&
          void tx.run(`Upgrade to tier ${chosen}`, () => upgradeTx(network, chosen, up), () => `Your vault is now in tier ${chosen}. The extra ETH was refunded.`)
        }
      >
        {chosen !== null ? `Upgrade to tier ${chosen}` : 'Upgrade'}
      </button>
    </form>
  );
}

function UnstakeForm({ tx }: { tx: Tx }) {
  const { wallet, network } = useApp();
  const [confirming, setConfirming] = useState(false);
  const amount = wallet?.positionOf.amount ?? 0n;
  return (
    <div class="action-form">
      <p class="small muted">
        Full exit: all <span class="num">{fmtTown(amount)}</span> TOWN comes back and the vault closes. Earned WETH stays claimable. The vault price is not
        refunded; staking again means buying a new vault.
      </p>
      {confirming ? (
        <div class="confirm-box" role="group" aria-label="Confirm unstaking">
          <p>
            <strong>Unstake everything and close your vault?</strong> Your {fmtTown(amount)} TOWN comes back; the vault price is not refunded.
          </p>
          <div class="btn-row">
            <button
              type="button"
              class="btn btn-danger"
              disabled={tx.busy}
              onClick={() => {
                setConfirming(false);
                void tx.run('Unstake', () => unstakeTx(network), () => `${fmtTown(amount)} TOWN came back to your wallet and your vault is closed. Earned WETH stays claimable.`);
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
