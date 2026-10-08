import { useState } from 'preact/hooks';
import { parseUnits } from 'viem';
import { useApp, ActionButton, Card, Chips, ConnectPrompt, Details, Fig, FieldError, Figures, Notice, PageHead, Row, Rows, Tabs } from '../components/ui';
import { PriceSource, TIERS, type Tier } from '../data/types';
import { fallbackExpiresAt, streamEnd, tierEmpty, tierMultiplier, tierShareBps, unpaidStream, withMargin } from '../lib/derive';
import { fmtBps, fmtDate, fmtDateTime, fmtDuration, fmtEth, fmtInt, fmtTown, fmtUsd8, shortAddress } from '../lib/format';

/** Staking transactions carry this gas limit so the day's payout can run alongside (spec "Frontend"). */
export const STAKING_GAS_LIMIT = 700_000;

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
            <strong>Gas.</strong> Staking transactions are sent with a gas limit of {fmtInt(STAKING_GAS_LIMIT)}, so the day’s payout can run with your action;
            the first staking action of a day costs more gas for that reason. Small vaults may not cover their gas.
          </li>
        </ul>
      </Details>
    </div>
  );
}

function PriceStatus() {
  const { chain } = useApp();
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
  const { chain } = useApp();
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
  const { chain, wallet } = useApp();
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
  if (!wallet) {
    return (
      <Card title="Your vault" sample={false}>
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
              return <OpenForm />;
            case 'claim':
              return <ClaimForm />;
            case 'add':
              return <AddForm />;
            case 'upgrade':
              return <UpgradeForm />;
            default:
              return <UnstakeForm />;
          }
        }}
      />
      </div>
      <GoodToKnow />
      </div>
    </Card>
  );
}

function OpenForm() {
  const { chain, wallet } = useApp();
  const st = chain.staking;
  const [tier, setTier] = useState<Tier>(1);
  const [amount, setAmount] = useState('');
  const price = st.vaultPriceWei[tier];
  const amt = parseTown(amount);
  const tooMuch = !!wallet && amt !== null && amt > wallet.townBalance;
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
              · <a href="#/buy">Buy TOWN first</a>
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
        <ActionButton label="1. Approve TOWN" variant="secondary" explain="ask your wallet to let the staking contract move the TOWN you chose." />
        <ActionButton
          label={`2. Open tier ${tier} vault`}
          disabled={price === null || amt === null || amt === 0n || tooMuch}
          explain={`open a tier ${tier} vault, pay its price once and stake your TOWN (gas limit ${fmtInt(STAKING_GAS_LIMIT)}).`}
        />
      </div>
    </form>
  );
}

function ClaimForm() {
  const { wallet } = useApp();
  return (
    <div class="action-form">
      <p class="small muted">Sends all your earned WETH to your wallet. It also triggers the day’s payout if nobody has yet.</p>
      <ActionButton label={`Claim ${fmtEth(wallet?.earned ?? 0n)} WETH`} disabled={!wallet || wallet.earned === 0n} explain="send your earned WETH to your wallet." />
    </div>
  );
}

function AddForm() {
  const { wallet } = useApp();
  const [amount, setAmount] = useState('');
  const amt = parseTown(amount);
  const tooMuch = !!wallet && amt !== null && amt > wallet.townBalance;
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
        </span>
        {tooMuch && <FieldError>That is more TOWN than this wallet holds.</FieldError>}
      </div>
      <div class="btn-row">
        <ActionButton label="1. Approve TOWN" variant="secondary" explain="ask your wallet to let the staking contract move the TOWN you chose." />
        <ActionButton label="2. Add TOWN" disabled={amt === null || amt === 0n || tooMuch} explain="add the TOWN you chose to your vault, in the same tier." />
      </div>
    </form>
  );
}

function UpgradeForm() {
  const { chain, wallet } = useApp();
  const st = chain.staking;
  const current = (wallet?.positionOf.tier ?? 1) as Tier;
  const higher = TIERS.filter((t) => t > current);
  const [target, setTarget] = useState<Tier | null>(higher[0] ?? null);
  if (higher.length === 0) {
    return (
      <div class="action-form">
        <p class="small muted">Your vault is in tier 5, the highest. There is no downgrade.</p>
      </div>
    );
  }
  const up = target !== null ? (wallet?.upgradePriceWei[target] ?? null) : null;
  return (
    <form class="action-form" onSubmit={(e) => e.preventDefault()}>
      <Chips label="Upgrade to tier" options={higher.map((t) => ({ value: t, label: `Tier ${t}` }))} value={target} onChange={setTarget} />
      {target !== null && (
        <Rows>
          <Row
            label={`Price difference, paid once ($${st.tierUsd[target] - st.tierUsd[current]})`}
            value={up === null ? 'paused' : `${fmtEth(up, 6)} ETH`}
            view={`TownStaking.upgradePriceWei(wallet, ${target})`}
          />
          <Row label="You send (about 1% more)" value={up === null ? '—' : `${fmtEth(withMargin(up), 6)} ETH`} />
        </Rows>
      )}
      <p class="small muted">Your whole stake moves up. Earned WETH stays yours. There is no way back down.</p>
      <ActionButton
        label={target !== null ? `Upgrade to tier ${target}` : 'Upgrade'}
        disabled={up === null}
        explain="move your whole stake to the higher tier and pay the price difference once."
      />
    </form>
  );
}

function UnstakeForm() {
  const { wallet } = useApp();
  return (
    <div class="action-form">
      <p class="small muted">
        Full exit: all <span class="num">{fmtTown(wallet?.positionOf.amount ?? 0n)}</span> TOWN comes back and the vault closes. Earned WETH stays claimable.
        The vault price is not refunded; staking again means buying a new vault.
      </p>
      <ActionButton label="Unstake everything" variant="danger" explain="give back all your TOWN and close your vault; earned WETH stays claimable." />
    </div>
  );
}
