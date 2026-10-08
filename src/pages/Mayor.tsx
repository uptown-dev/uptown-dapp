import { useApp, Term, Panel, PageHero, Notice, Stat, SampleBadge } from '../components/ui';
import { OWNER_CANNOT, OWNER_POWERS } from '../content/town';
import { PriceSource } from '../data/types';
import { fallbackExpiresAt } from '../lib/derive';
import { fmtBps, fmtDate, fmtDateTime, fmtEth, fmtTown, fmtUsd8, shortAddress } from '../lib/format';

function KeyRing() {
  const keys = Array.from({ length: 8 }, (_, i) => i);
  return (
    <svg viewBox="0 0 300 230" role="img" aria-label="The Mayor's short ring of eight keys, hanging on the Town Hall door">
      <rect x="40" y="10" width="220" height="190" rx="6" fill="#3a2a1a" stroke="#7d5a32" />
      <rect x="54" y="24" width="192" height="162" rx="4" fill="none" stroke="#5c4226" />
      <circle cx="150" cy="58" r="30" fill="none" stroke="#e9b44c" stroke-width="5" />
      <circle cx="150" cy="24" r="5" fill="#c9c4b8" />
      {keys.map((i) => {
        const a = (-70 + i * 20) * (Math.PI / 180);
        const x = 150 + Math.sin(a) * 30;
        const y = 58 + Math.cos(a) * 30;
        const rot = -(-70 + i * 20);
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
            <rect x="-2.5" y="0" width="5" height="62" fill={i === 6 ? '#c9c4b8' : '#e9b44c'} />
            <circle cx="0" cy="0" r="6" fill="none" stroke={i === 6 ? '#c9c4b8' : '#e9b44c'} stroke-width="3" />
            <path d="M2.5 48h8v5h-8zM2.5 56h6v4h-6z" fill={i === 6 ? '#c9c4b8' : '#e9b44c'} />
          </g>
        );
      })}
      <rect x="0" y="200" width="300" height="4" fill="#b5462f" />
    </svg>
  );
}

export function Mayor() {
  return (
    <>
      <PageHero
        kicker="The Mayor · the project owner"
        title="The Mayor and the short ring"
        lead={<>Our Mayor's ring is short, and it hangs on the Town Hall door for anyone to read.</>}
        art={<KeyRing />}
      >
        <p class="muted">
          The Mayor is UpTown's answer to the Lowlands: the project owner, holding a deliberately short ring of keys, every one of them listed below. The
          Mayor also earns an income, stated plainly on this page. Honesty about the <Term slug="mayors-purse">Purse</Term> is part of what separates UpTown
          from the Lowlands.
        </p>
      </PageHero>

      <section class="section" style="padding-top:0">
        <div class="wrap grid grid-2" style="align-items:start">
          <Income />
          <Who />
        </div>
      </section>

      <section class="section" aria-labelledby="ring-title">
        <div class="wrap">
          <div class="section-head">
            <h2 id="ring-title">The ring: every power the owner holds</h2>
            <p class="muted small">This is the complete list. Any other privileged function would be a defect.</p>
          </div>
          <div class="panel table-wrap">
            <table class="data stack">
              <caption class="visually-hidden">The owner's powers, the contract that holds each, the delay and the worst case if misused</caption>
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">What it does</th>
                  <th scope="col">Contract</th>
                  <th scope="col">Delay</th>
                  <th scope="col">Worst case if misused</th>
                </tr>
              </thead>
              <tbody>
                {OWNER_POWERS.map((p) => (
                  <tr key={p.power}>
                    <td data-label="Key">
                      <span style="font-family:var(--font-sign);font-weight:700;color:var(--gold-soft)">{p.lore}</span>
                    </td>
                    <td data-label="What it does">{p.power}</td>
                    <td data-label="Contract">
                      <code>{p.contract}</code>
                    </td>
                    <td data-label="Delay">{p.delay}</td>
                    <td data-label="Worst case">{p.worstCase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="wrap grid grid-2" style="align-items:start">
          <Panel title="Keys the ring does not have" sample={false}>
            <p>The owner cannot:</p>
            <ul style="padding-left:1.1em">
              {OWNER_CANNOT.map((x) => (
                <li key={x}>{x}.</li>
              ))}
            </ul>
            <p class="small muted" style="margin:0">
              The token (UpTownToken), the Gate (TownHook) and the Granary (BuyerRewards) have no owner at all. The Tower's owner holds only the two price
              powers.
            </p>
          </Panel>
          <Settings />
        </div>
      </section>
    </>
  );
}

function Income() {
  const { chain } = useApp();
  const t = chain.treasury;
  return (
    <Panel title="The Mayor's income, in plain words">
      <ol style="padding-left:1.2em">
        <li>
          <strong>The pool fee.</strong> Every trade on the TOWN pool, buy or sell, pays Uniswap's 0.5% trading fee to the locked liquidity position. The
          owner collects it (<Term slug="sweeping">sweeping the dust</Term>). This is the owner's main income.
        </li>
        <li>
          <strong>10% of all ETH reaching the Town Hall:</strong> the buy fees, the Dawn Toll, the vault rent and any gifts.
        </li>
        <li>
          <strong>The 5% claim fee</strong> on every rebate claim, paid in TOWN.
        </li>
      </ol>
      <dl class="stats" style="margin-top:14px">
        <Stat label="ETH in the Purse now" value={fmtEth(t.ownerEthAvailable)} unit="ETH" view="Treasury.ownerEthAvailable" />
        <Stat label="ETH withdrawn so far" value={fmtEth(t.totalOwnerEthWithdrawn)} unit="ETH" view="Treasury.totalOwnerEthWithdrawn" />
        <Stat label="TOWN in the Purse now" value={fmtTown(t.ownerTownAvailable)} unit="TOWN" view="Treasury.ownerTownAvailable" />
        <Stat label="TOWN withdrawn so far" value={fmtTown(t.totalTownWithdrawn)} unit="TOWN" view="Treasury.totalTownWithdrawn" />
      </dl>
      <p class="small faint" style="margin:12px 0 0">
        The pool fees the owner collects are not shown here: the contracts keep no running total of them.
      </p>
      <Notice kind="warn" title="Because these fees come back to the owner">
        <p class="small">
          A plain buy-and-sell loses money for an ordinary wallet once fees and rebates are counted. For the owner it is different: the pool fee, 10% of the
          buy fee and the claim fee all return to the owner, so an owner wallet that buys and sells TOWN back to itself can end up with more than it started,
          drawn from the rebate reserve. Nothing on chain prevents this. The owner has accepted this risk in writing and publishes the commitment below.
        </p>
      </Notice>
      <Notice kind="placeholder" title="The owner's commitment not to trade for rebates">
        <p class="small">
          <strong>[Placeholder: the owner's published commitment, in the owner's own words, goes here before launch.]</strong>
        </p>
      </Notice>
    </Panel>
  );
}

function Who() {
  return (
    <Panel title="Who the Mayor is" sample={false}>
      <p>
        The Mayor is the project owner: one address that holds the powers below on LPVault, the Treasury and TownStaking, and makes the single launch call.
        The Mayor is an office, not a character from real life.
      </p>
      <Notice kind="placeholder" title="The owner's address">
        <p class="small">
          <strong>[Placeholder: the owner's address and who signs for it are still to be decided. They will be published here, with links to the contracts,
          before launch.]</strong>
        </p>
      </Notice>
      <p class="small muted">
        The owner can hand the ring to a successor in two steps: an offer, then the successor's acceptance. The ring cannot be thrown away (renouncing
        ownership is disabled), so the powers below always have a holder.
      </p>
    </Panel>
  );
}

function Settings() {
  const { chain } = useApp();
  const st = chain.staking;
  const fallbackLive = st.priceStatus.source === PriceSource.Fallback;
  return (
    <Panel title="The ring's current settings">
      <dl class="stats">
        <Stat label="The valve (daily spend rate)" value={fmtBps(chain.treasury.spendBps)} view="Treasury.spendBps" note="Settable from 1% to 25%; applies from the next Bell." />
        <Stat
          label="Fallback ETH/USD price"
          value={st.fallbackPrice === 0n ? 'none set' : fmtUsd8(st.fallbackPrice)}
          view="TownStaking.fallbackPrice"
          note={
            st.fallbackPrice === 0n
              ? undefined
              : fallbackLive
                ? `In use now, set ${fmtDateTime(st.fallbackPriceSetAt)}; stops counting ${fmtDateTime(fallbackExpiresAt(chain))}.`
                : `Set ${fmtDateTime(st.fallbackPriceSetAt)}; not in use (the feed is healthy, or the 7 days have passed).`
          }
        />
        <Stat
          label="Announced price feed change"
          value={st.pendingFeed ? shortAddress(st.pendingFeed) : 'none'}
          view="TownStaking.pendingFeed"
          note={st.pendingFeed ? `Can take effect from ${fmtDateTime(st.pendingFeedEffectiveAt)}.` : undefined}
        />
        <Stat label="Liquidity lock ends no earlier than" value={fmtDate(chain.lpVault.unlockTime)} view="LPVault.unlockTime" note="Can be lengthened, never shortened." />
      </dl>
      <p class="small faint" style="margin:12px 0 0">
        <SampleBadge />
      </p>
    </Panel>
  );
}
