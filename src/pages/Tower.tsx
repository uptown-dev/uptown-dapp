import { useState } from 'preact/hooks';
import { parseUnits } from 'viem';
import { useApp, Term, Panel, PageHero, Notice, Stat, ActionButton, ConnectPrompt, SampleBadge } from '../components/ui';
import { TowerArt, PileIcon, type FloorView } from '../components/art';
import { FLOORS } from '../content/town';
import { PriceSource, TIERS, type Tier } from '../data/types';
import { fallbackExpiresAt, streamEnd, tierEmpty, tierMultiplier, tierShareBps, unpaidStream, withMargin } from '../lib/derive';
import { fmtBps, fmtDate, fmtDateTime, fmtDuration, fmtEth, fmtInt, fmtTown, fmtUsd8, shortAddress } from '../lib/format';

/** Tower transactions carry this gas limit so the Bell's delivery can run alongside (spec "Frontend"). */
export const TOWER_GAS_LIMIT = 700_000;

function vane(source: PriceSource): 'ok' | 'frozen' | 'stopped' {
  return source === PriceSource.Feed ? 'ok' : source === PriceSource.Fallback ? 'frozen' : 'stopped';
}

export function Tower() {
  const { chain, wallet } = useApp();
  const st = chain.staking;
  const floors: FloorView[] = TIERS.map((t) => ({
    lit: Math.min(6, st.tierVaults[t]),
    empty: tierEmpty(chain, t),
    pile: tierEmpty(chain, t) && unpaidStream(chain, t) > 0n,
    mine: wallet?.positionOf.tier === t,
    name: FLOORS[t].name,
  }));
  return (
    <>
      <PageHero
        kicker="The Tower · staking vaults"
        title="The Tower"
        lead={<>Five floors. Every delivery is split by height, then shared by what you store.</>}
        art={<TowerArt floors={floors} vane={vane(st.priceStatus.source)} title="The Tower with its five floors; lit windows show occupied floors" />}
      >
        <p class="muted">
          Become a <Term slug="tower">Resident</Term>: pay <Term slug="rent">rent</Term> once to open a vault on one of five{' '}
          <Term slug="floors">floors</Term>, store TOWN inside, and receive <Term slug="water">water</Term> (WETH) from each{' '}
          <Term slug="aqueduct">delivery</Term>, streamed over seven days. The rent is a one-time payment, not a recurring charge, and it is not given back when
          you move out.
        </p>
      </PageHero>

      <div class="wrap">
        <PriceNotices />
      </div>

      <section class="section" style="padding-top:0" aria-labelledby="floors-title">
        <div class="wrap">
          <div class="section-head">
            <h2 id="floors-title">The floors</h2>
            <p class="muted small">Top floor first. Each floor's share of every delivery is fixed, however many Residents live there.</p>
          </div>
          <div class="tier-cards">
            {[...TIERS].reverse().map((t) => (
              <FloorCard tier={t} key={t} />
            ))}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="wrap grid grid-2" style="align-items:start">
          {wallet ? <YourHome /> : (
            <Panel title="Your home in the Tower" sample={false}>
              <ConnectPrompt what="your vault, your earned WETH and the Tower's buttons" />
            </Panel>
          )}
          <TowerRules />
        </div>
      </section>
    </>
  );
}

function PriceNotices() {
  const { chain } = useApp();
  const st = chain.staking;
  const ps = st.priceStatus;
  const age = chain.blockTimestamp - ps.updatedAt;
  return (
    <>
      {ps.source === PriceSource.Feed && (
        <p class="small muted" style="margin:0 0 12px">
          The <Term slug="weathervane">Weathervane</Term> (Chainlink's ETH/USD feed) reads <span class="num">{fmtUsd8(ps.price)}</span> per ETH, updated{' '}
          {fmtDuration(age)} ago. Rents are set in dollars and paid in ETH at this price. <SampleBadge />
        </p>
      )}
      {ps.source === PriceSource.Fallback && (
        <Notice kind="warn" title="The Weathervane is frozen: rents use the owner's fallback price">
          <p>
            Chainlink's ETH/USD feed has not updated for over 3 hours, so rents are priced with the fallback price the owner chalked on the board:{' '}
            <span class="num">{fmtUsd8(ps.price)}</span> per ETH, set {fmtDuration(age)} ago. It stops counting at{' '}
            <span class="num">{fmtDateTime(fallbackExpiresAt(chain))}</span>, seven days after it was set, and the feed takes over again the moment it is
            healthy. <SampleBadge />
          </p>
          <p class="small">
            While the fallback is in use, the ETH price of a vault can differ from its dollar target. Adding TOWN, moving out and collecting WETH do not use
            the price and are not affected.
          </p>
        </Notice>
      )}
      {ps.source === PriceSource.None && (
        <Notice kind="danger" title="No price: opening and climbing vaults are paused">
          <p>
            Chainlink's ETH/USD feed has not updated for over 3 hours and there is no valid fallback price, so no vault can be opened or upgraded until the
            feed recovers or the owner sets a fallback price. <SampleBadge />
          </p>
          <p class="small">Adding TOWN, moving out and collecting WETH never use the price and keep working.</p>
        </Notice>
      )}
      {st.pendingFeed && (
        <Notice kind="info" title="Notice posted in the square: a new Weathervane">
          <p class="small">
            The owner has announced a replacement price feed, <code>{shortAddress(st.pendingFeed)}</code>. It can take effect from{' '}
            <span class="num">{fmtDateTime(st.pendingFeedEffectiveAt)}</span>, seven days after the announcement, and the owner can cancel it before then.{' '}
            <SampleBadge />
          </p>
        </Notice>
      )}
    </>
  );
}

function FloorCard({ tier }: { tier: Tier }) {
  const { chain, wallet } = useApp();
  const st = chain.staking;
  const f = FLOORS[tier];
  const empty = tierEmpty(chain, tier);
  const unpaid = unpaidStream(chain, tier);
  const end = streamEnd(chain, tier);
  const mine = wallet?.positionOf.tier === tier;
  const price = st.vaultPriceWei[tier];
  return (
    <article class={`tier-card${mine ? ' mine' : ''}${empty ? ' empty' : ''}`} aria-label={`${f.name}, floor ${tier}`}>
      <header>
        <div>
          <span class="floor-no">Floor {tier}</span>
          <h3>{f.name}</h3>
        </div>
        <div class="btn-row">
          {mine && <span class="now-pill" style="margin:0">Your home</span>}
          <SampleBadge />
        </div>
      </header>
      <dl class="stats">
        <Stat label="Multiplier" value={tierMultiplier(chain, tier)} view={`TownStaking.tierWeight(${tier})`} />
        <Stat label="Share of every delivery" value={fmtBps(tierShareBps(chain, tier))} view={`tierWeight(${tier}) / TOTAL_WEIGHT`} gold />
        <Stat label="Rent, paid once" value={`$${st.tierUsd[tier]}`} view={`TownStaking.tierUsd(${tier})`} />
        <Stat label="Rent in ETH now" value={price === null ? 'paused' : fmtEth(price, 6)} unit={price === null ? undefined : 'ETH'} view={`TownStaking.vaultPriceWei(${tier})`} />
        <Stat label="TOWN stored" value={fmtTown(st.tierStaked[tier])} view={`TownStaking.tierStaked(${tier})`} />
        <Stat label="Residents" value={fmtInt(st.tierVaults[tier])} view={`TownStaking.tierVaults(${tier})`} />
        <Stat
          label={empty ? 'Pile at the door' : 'Water still to flow'}
          value={fmtEth(unpaid)}
          unit="WETH"
          view={`derived from TownStaking.streamInfo(${tier})`}
          note={empty ? 'paused while the floor is empty' : end ? `flowing until ${fmtDate(end)}, longer if new deliveries arrive` : 'no stream running'}
        />
      </dl>
      {empty && unpaid > 0n && (
        <div class="pile">
          <PileIcon />
          <span>
            {f.name} is empty. Its share of every delivery is <Term slug="pile">piling up at the door</Term>:{' '}
            <strong class="num">{fmtEth(unpaid)} WETH</strong>. The first Resident to move in starts receiving it over at most seven days, shared with anyone
            who joins this floor meanwhile.
          </span>
        </div>
      )}
      {empty && unpaid === 0n && <p class="small muted" style="margin:0">No Residents yet, and nothing waiting at the door.</p>}
    </article>
  );
}

function parseTown(s: string): bigint | null {
  const t = s.replace(/,/g, '').trim();
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  try {
    return parseUnits(t, 18);
  } catch {
    return null;
  }
}

function YourHome() {
  const { wallet } = useApp();
  if (!wallet) return null;
  const pos = wallet.positionOf;
  return (
    <Panel title="Your home in the Tower">
      {pos.tier === 0 ? <OpenVault /> : <ExistingHome />}
      {pos.tier === 0 && wallet.earned > 0n && (
        <div style="margin-top:16px">
          <dl class="stats">
            <Stat label="WETH earned in an earlier vault, still yours to collect" value={fmtEth(wallet.earned)} unit="WETH" view="TownStaking.earned(wallet)" gold />
          </dl>
          <ActionButton label="Collect WETH" explain="collect your earned WETH." variant="ghost" />
        </div>
      )}
      <p class="small faint" style="margin:14px 0 0">
        Tower transactions are sent with a gas limit of {fmtInt(TOWER_GAS_LIMIT)}, so the Bell's delivery can run alongside your action. The first Tower
        action of a Bell costs more gas for that reason.
      </p>
    </Panel>
  );
}

function OpenVault() {
  const { chain, wallet } = useApp();
  const st = chain.staking;
  const [tier, setTier] = useState<Tier>(1);
  const [amount, setAmount] = useState('');
  if (!wallet) return null;
  const price = st.vaultPriceWei[tier];
  const amt = parseTown(amount);
  const tooMuch = amt !== null && amt > wallet.townBalance;
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <p>You have no vault. Choose a floor, then the TOWN to store in it.</p>
      <fieldset style="border:0;padding:0;margin:0 0 14px">
        <legend class="label" style="font-weight:650;margin-bottom:6px">
          Floor
        </legend>
        <div class="chips">
          {TIERS.map((t) => (
            <button type="button" class="chip" aria-pressed={tier === t} key={t} onClick={() => setTier(t)}>
              {t}. {FLOORS[t].name} · ${st.tierUsd[t]}
            </button>
          ))}
        </div>
      </fieldset>
      <div class="field">
        <label for="vault-town">TOWN to store</label>
        <div class="input-row">
          <input id="vault-town" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} />
          <span class="suffix">TOWN</span>
        </div>
        <span class="hint">
          Your TOWN: <span class="num">{fmtTown(wallet.townBalance)}</span> <SampleBadge />
        </span>
        {tooMuch && <span class="hint" style="color:#ffc4b4">That is more TOWN than this wallet holds.</span>}
        {wallet.townBalance === 0n && (
          <span class="hint">
            This wallet holds no TOWN yet. <a href="#/gate">Buy some at the Gate</a> first.
          </span>
        )}
      </div>
      <dl class="kv" style="margin-bottom:12px">
        <dt>Rent for {FLOORS[tier].name} (${st.tierUsd[tier]}, paid once)</dt>
        <dd data-view={`TownStaking.vaultPriceWei(${tier})`}>{price === null ? 'paused: no price' : `${fmtEth(price, 6)} ETH`}</dd>
        <dt>Your wallet sends (about 1% more)</dt>
        <dd>{price === null ? '—' : `${fmtEth(withMargin(price), 6)} ETH`}</dd>
        <dt class="total">Refunded to you at once</dt>
        <dd class="total">{price === null ? '—' : `the difference, about ${fmtEth(withMargin(price) - price, 6)} ETH`}</dd>
      </dl>
      <p class="small muted">
        The site sends about 1% more ETH than the quoted rent, in case the ETH price moves before your transaction lands. The Tower takes exactly the rent and
        refunds the rest in the same transaction. The rent goes to the Town Hall, where 10% is set aside for the owner.
      </p>
      <div class="btn-row">
        <ActionButton label="1. Allow the Tower to take your TOWN" variant="ghost" explain="ask your wallet to let the Tower move the TOWN you chose." />
        <ActionButton
          label={`2. Open a vault on ${FLOORS[tier].name}`}
          disabled={price === null || amt === null || amt === 0n || tooMuch}
          explain={`open a vault on ${FLOORS[tier].name}, pay the rent once and store your TOWN.`}
        />
      </div>
    </form>
  );
}

function ExistingHome() {
  const { chain, wallet } = useApp();
  const st = chain.staking;
  const [addAmount, setAddAmount] = useState('');
  const pos = wallet!.positionOf;
  const current = pos.tier as Tier;
  const higher = TIERS.filter((t) => t > current);
  const [target, setTarget] = useState<Tier | null>(higher[0] ?? null);
  const upPrice = target !== null ? wallet!.upgradePriceWei[target] ?? null : null;
  const addAmt = parseTown(addAmount);
  return (
    <div>
      <dl class="stats" style="margin-bottom:16px">
        <Stat label="Your floor" value={`${current}. ${FLOORS[current].name}`} view="TownStaking.positionOf(wallet).tier" />
        <Stat label="TOWN stored" value={fmtTown(pos.amount)} unit="TOWN" view="TownStaking.positionOf(wallet).amount" />
        <Stat label="WETH earned, ready to collect" value={fmtEth(wallet!.earned)} unit="WETH" view="TownStaking.earned(wallet)" gold big />
      </dl>
      <div class="btn-row" style="margin-bottom:20px">
        <ActionButton label="Collect WETH" disabled={wallet!.earned === 0n} explain="send your earned WETH to your wallet." />
      </div>

      <h4>Store more TOWN</h4>
      <div class="field">
        <label for="add-town" class="visually-hidden">
          TOWN to add
        </label>
        <div class="input-row">
          <input id="add-town" inputMode="decimal" autoComplete="off" placeholder="0" value={addAmount} onInput={(e) => setAddAmount((e.target as HTMLInputElement).value)} />
          <span class="suffix">TOWN</span>
        </div>
        <span class="hint">
          No extra rent: adding TOWN to an open vault costs only gas. Your TOWN: <span class="num">{fmtTown(wallet!.townBalance)}</span>
        </span>
      </div>
      <div class="btn-row" style="margin-bottom:20px">
        <ActionButton label="1. Allow" variant="ghost" small explain="ask your wallet to let the Tower move the TOWN you chose." />
        <ActionButton label="2. Add TOWN" small disabled={addAmt === null || addAmt === 0n} explain="add the TOWN you chose to your vault, on the same floor." />
      </div>

      <h4>
        <Term slug="climbing">Climb</Term> to a higher floor
      </h4>
      {higher.length === 0 ? (
        <p class="muted small">You live on the Crown, the top floor. There is no higher floor and no way down.</p>
      ) : (
        <>
          <div class="chips" style="margin-bottom:10px">
            {higher.map((t) => (
              <button type="button" class="chip" key={t} aria-pressed={target === t} onClick={() => setTarget(t)}>
                {t}. {FLOORS[t].name}
              </button>
            ))}
          </div>
          {target !== null && (
            <dl class="kv" style="margin-bottom:10px">
              <dt>
                Rent difference (${st.tierUsd[target] - st.tierUsd[current]}, paid once)
              </dt>
              <dd data-view={`TownStaking.upgradePriceWei(wallet, ${target})`}>{upPrice === null ? 'paused: no price' : `${fmtEth(upPrice, 6)} ETH`}</dd>
              <dt>Your wallet sends (about 1% more; the rest is refunded)</dt>
              <dd>{upPrice === null ? '—' : `${fmtEth(withMargin(upPrice), 6)} ETH`}</dd>
            </dl>
          )}
          <p class="small muted">Your whole stake moves to the new floor. Earned WETH stays yours. There is no way back down.</p>
          <ActionButton
            label={target !== null ? `Climb to ${FLOORS[target].name}` : 'Climb'}
            small
            disabled={upPrice === null}
            explain="move your whole stake to the higher floor and pay the rent difference once."
          />
        </>
      )}

      <h4 style="margin-top:22px">
        <Term slug="moving-out">Move out</Term>
      </h4>
      <p class="small muted">
        Moving out is always a full exit: all <span class="num">{fmtTown(pos.amount)}</span> TOWN comes back to you and the vault closes. Your earned WETH
        stays waiting for you to collect. The rent is not refunded; living in the Tower again means paying rent for a new vault.
      </p>
      <ActionButton label="Move out (full exit)" variant="brick" small explain="return all your TOWN and close your vault; earned WETH stays collectable." />
    </div>
  );
}

function TowerRules() {
  return (
    <Panel title="Tower customs" sample={false}>
      <ul style="padding-left:1.1em;margin:0">
        <li>
          <strong>Split by height.</strong> Every delivery is cut into five fixed slices, 13.33% for the Stoop up to 26.67% for the Crown, however many live on
          each floor.
        </li>
        <li>
          <strong>Shared by what you store.</strong> Within a floor, each Resident's part of the slice follows the TOWN they store.
        </li>
        <li>
          <strong>A seven-day stream.</strong> Each delivery flows into each floor over seven days. You receive water only while you live in the Tower.
        </li>
        <li>
          <strong>One home per wallet.</strong> A vault cannot be sold or handed to another wallet.
        </li>
        <li>
          <strong>Rent is paid once.</strong> No recurring charge. It goes to the Town Hall (10% to the owner) and is not returned when you move out.
        </li>
        <li>
          <strong>A lone Resident takes the whole slice.</strong> A floor with one Resident pays that Resident the floor's whole share; a crowded floor shares
          it thinly. The boards above show every floor's totals so you can see where others live.
        </li>
        <li>
          <strong>Deliveries can fall to nothing.</strong> Water comes only from what the Town Hall receives, which depends on trading. A quiet stretch means
          little or no water.
        </li>
        <li>
          <strong>Small vaults may not pay for their gas.</strong> On Ethereum each action costs dollars in gas; the $5 Stoop is the cheapest way in, not a
          cheap way to earn.
        </li>
      </ul>
    </Panel>
  );
}
