import { useApp, Card, Details, Fig, Figures, Notice, PageHead } from '../components/ui';
import { OWNER_CANNOT, OWNER_POWERS, RISKS } from '../content/owner';
import { PriceSource } from '../data/types';
import { fallbackExpiresAt } from '../lib/derive';
import { fmtBps, fmtDate, fmtDateTime, fmtEth, fmtTown, fmtUsd8, shortAddress } from '../lib/format';

export function Owner() {
  return (
    <div class="wrap page">
      <PageHead title="Owner and risks" lead="What the owner can do, what the owner earns, and what can go wrong. Read this before you take part." />
      <Income />

      <Card title="The owner’s powers: the complete list" sample={false} class="flush">
        <div class="card-pad split">
          <p class="small muted">
            One address holds these powers on LPVault, the Treasury and TownStaking, and makes the single launch call. UpTownToken, TownHook and BuyerRewards
            have no owner at all. Ownership can be handed over in two steps (an offer, then acceptance) but cannot be given up.
          </p>
          <Notice kind="placeholder" title="Owner’s address">
            <p class="small">[Placeholder: the owner’s address and who signs for it are still to be decided. They will be published here before launch.]</p>
          </Notice>
        </div>
        <ul class="powers-list">
          {OWNER_POWERS.map((p) => (
            <li key={p.power}>
              <p class="power-name">{p.power}</p>
              <p class="power-meta">
                {p.contract} · Delay: {p.delay}
              </p>
              <p class="power-worst">
                <span class="muted">Worst case:</span> {p.worstCase}
              </p>
            </li>
          ))}
        </ul>
        <div class="table-scroll powers-table">
          <table class="table powers">
            <caption class="visually-hidden">The owner’s powers, the contract that holds each, the delay and the worst case if misused</caption>
            <thead>
              <tr>
                <th scope="col">Power</th>
                <th scope="col">Contract</th>
                <th scope="col">Delay</th>
                <th scope="col">Worst case if misused</th>
              </tr>
            </thead>
            <tbody>
              {OWNER_POWERS.map((p) => (
                <tr key={p.power}>
                  <th scope="row">{p.power}</th>
                  <td data-label="Contract">{p.contract}</td>
                  <td data-label="Delay">{p.delay}</td>
                  <td data-label="Worst case">{p.worstCase}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="small muted card-pad">
          The owner cannot {OWNER_CANNOT.slice(0, -1).join(', ')} or {OWNER_CANNOT[OWNER_CANNOT.length - 1]}.
        </p>
      </Card>

      <Card title="Risks" sample={false}>
        <Notice kind="placeholder" title="Legal notice">
          <p class="small">[Placeholder: the wording required by the owner’s lawyer goes here before launch. This box is not legal text.]</p>
        </Notice>
        <ul class="risk-list">
          {RISKS.map((r) => (
            <li key={r.title}>
              <strong>{r.title}.</strong> {r.body}
            </li>
          ))}
        </ul>
      </Card>

      <Details summary="Current owner settings">
        <Settings />
      </Details>
    </div>
  );
}

function Income() {
  const { chain } = useApp();
  const t = chain.treasury;
  return (
    <Card title="What the owner earns">
      <div class="split">
      <div>
      <ol class="income-list">
        <li>
          <strong>The pool fee:</strong> the 0.5% trading fee on every buy and sell in the TOWN pool, collected from the locked liquidity.
        </li>
        <li>
          <strong>10% of all ETH reaching the treasury:</strong> buy fees, the launch fee and vault purchases.
        </li>
        <li>
          <strong>The 5% claim fee</strong> on every rebate claim, in TOWN.
        </li>
      </ol>
      <Figures cols={2}>
        <Fig label="ETH reserve, not yet withdrawn" value={fmtEth(t.ownerEthAvailable)} unit="ETH" view="Treasury.ownerEthAvailable" />
        <Fig label="ETH withdrawn so far" value={fmtEth(t.totalOwnerEthWithdrawn)} unit="ETH" view="Treasury.totalOwnerEthWithdrawn" />
        <Fig label="TOWN claim fees, not yet withdrawn" value={fmtTown(t.ownerTownAvailable)} unit="TOWN" view="Treasury.ownerTownAvailable" />
        <Fig label="TOWN withdrawn so far" value={fmtTown(t.totalTownWithdrawn)} unit="TOWN" view="Treasury.totalTownWithdrawn" />
      </Figures>
      <p class="small faint card-foot">The pool fees the owner collects are not shown: the contracts keep no running total of them.</p>
      </div>
      <div class="stack-gap">
      <Notice kind="warn" title="The owner could trade with itself">
        <p class="small">
          Because these fees come back to the owner, an owner wallet that buys and sells TOWN to itself can end up ahead, drawn from the rebate reserve.
          Nothing on chain prevents this. The owner has accepted this risk in writing and publishes the commitment below.
        </p>
      </Notice>
      <Notice kind="placeholder" title="Owner’s commitment not to trade for rebates">
        <p class="small">[Placeholder: the owner’s published commitment, in the owner’s own words, goes here before launch.]</p>
      </Notice>
      </div>
      </div>
    </Card>
  );
}

function Settings() {
  const { chain } = useApp();
  const st = chain.staking;
  const fallbackLive = st.priceStatus.source === PriceSource.Fallback;
  return (
    <Figures cols={2}>
      <Fig label="Daily payout rate" value={fmtBps(chain.treasury.spendBps)} view="Treasury.spendBps" note="Settable from 1% to 25%; a change applies from the next day." />
      <Fig
        label="Fallback ETH/USD price"
        value={st.fallbackPrice === 0n ? 'None set' : fmtUsd8(st.fallbackPrice)}
        view="TownStaking.fallbackPrice"
        note={
          st.fallbackPrice === 0n
            ? undefined
            : fallbackLive
              ? `In use; valid until ${fmtDateTime(fallbackExpiresAt(chain))}.`
              : `Set ${fmtDateTime(st.fallbackPriceSetAt)}; not in use.`
        }
      />
      <Fig
        label="Announced feed change"
        value={st.pendingFeed ? shortAddress(st.pendingFeed) : 'None'}
        view="TownStaking.pendingFeed"
        note={st.pendingFeed ? `From ${fmtDateTime(st.pendingFeedEffectiveAt)}.` : undefined}
      />
      <Fig label="Liquidity locked until" value={fmtDate(chain.lpVault.unlockTime)} view="LPVault.unlockTime" note="Can be extended, never shortened." />
    </Figures>
  );
}
