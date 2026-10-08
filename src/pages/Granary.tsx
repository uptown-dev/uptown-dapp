import { useApp, Term, Panel, PageHero, Notice, Stat, ActionButton, ConnectPrompt, SampleBadge } from '../components/ui';
import { GranaryArt } from '../components/art';
import { AGES } from '../content/town';
import {
  afterClaimFee,
  ageIndex,
  cycleRebateGross,
  cycleStatus,
  nextTenCaps,
  readyCycles,
  rebateRateBps,
  reserveNearlySpent,
  reserveUnscheduled,
  walletCycles,
} from '../lib/derive';
import { bellName, fmtBps, fmtInt, fmtTown } from '../lib/format';

function listBells(cycles: number[]): string {
  const names = cycles.map((c) => fmtInt(c));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function Granary() {
  const { chain } = useApp();
  const low = reserveNearlySpent(chain);
  return (
    <>
      <PageHero
        kicker="The Granary · rebates for buyers"
        title="The Granary"
        lead={<>The town pays back its builders: up to 5% of what you carried in, two Bells later.</>}
        art={<GranaryArt open={chain.hook.currentCycle >= 2} />}
      >
        <p class="muted">
          Every buy through the Gate is written in the <Term slug="ledger">Ledger</Term>. For each Bell, you can claim a <Term slug="rebate">rebate</Term> of up
          to 5% of the TOWN you bought, limited by that Bell's <Term slug="ration">ration</Term>. The doors open at the start of the Bell two after it.{' '}
          <Term slug="claim-fee">One twentieth</Term> of every claim (5%) goes to the Town Hall for the owner, so 4.75% is the most that ever reaches you.
        </p>
      </PageHero>

      {low && (
        <div class="wrap">
          <Notice kind="warn" title="The Granary is nearly empty">
            <p>
              Fewer than ten Bells of rations remain in the reserve: <span class="num">{fmtTown(reserveUnscheduled(chain))}</span> TOWN not yet set aside for
              any Bell, against <span class="num">{fmtTown(nextTenCaps(chain))}</span> TOWN for the next ten Bells' rations. <SampleBadge />
            </p>
            <p class="small">
              Near the end, Bells are paid in the order they are first claimed. A Bell claimed late can receive less, or nothing, while a later Bell claimed
              earlier was paid in full. Nothing is ever overpaid. This site always claims your older Bells first.
            </p>
          </Notice>
        </div>
      )}

      <section class="section" style="padding-top:0">
        <div class="wrap grid grid-2" style="align-items:start">
          <ThisBell />
          <Totals />
        </div>
      </section>

      <section class="section" style="padding-top:0">
        <div class="wrap">
          <YourLedger />
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <Rules />
        </div>
      </section>

      <Schedule />
    </>
  );
}

function ThisBell() {
  const { chain } = useApp();
  const c = chain.rewards.currentCycle;
  const age = AGES[ageIndex(c)];
  const rate = rebateRateBps(chain, c);
  return (
    <Panel title={`${bellName(c)}, so far`}>
      <dl class="stats">
        <Stat label="Today's ration (the most the Granary pays for this Bell)" value={fmtTown(chain.rewards.cap[c] ?? 0n)} unit="TOWN" view="BuyerRewards.cap(currentCycle)" />
        <Stat label="TOWN carried in by everyone this Bell" value={fmtTown(chain.hook.cycleTotal[c] ?? 0n)} unit="TOWN" view="TownHook.cycleTotal(currentCycle)" />
        <Stat
          label="Rebate rate this Bell is heading for"
          value={fmtBps(rate)}
          view="derived: min(5%, cap / cycleTotal)"
          gold
          note={`${fmtBps(rate * 0.95)} after the claim fee. It can still fall as more TOWN is bought before the Bell ends.`}
        />
        <Stat label="Age" value={age.name} view="derived: currentCycle / 100" />
      </dl>
      <p class="small muted" style="margin:14px 0 0">
        When 5% of everything bought in a Bell is more than its ration, the ration is shared out instead, so everyone's rate falls below 5%. The rebate for{' '}
        {bellName(c)} opens at {bellName(c + 2)}.
      </p>
    </Panel>
  );
}

function YourLedger() {
  const { chain, wallet } = useApp();
  if (!wallet) {
    return (
      <Panel title="Your Ledger" sample={false}>
        <ConnectPrompt what="your buys, Bell by Bell, and what you can collect" />
      </Panel>
    );
  }
  const current = chain.rewards.currentCycle;
  const cycles = walletCycles(wallet);
  const ready = readyCycles(chain, wallet);
  if (cycles.length === 0) {
    return (
      <Panel title="Your Ledger">
        <p>Your wallet has no buys in the Ledger yet, so there is nothing to collect.</p>
        <p class="small muted">
          Buys made through <a href="#/gate">the Gate on this site</a> are written in your name. A buy you make today can be collected from {bellName(current + 2)}.
        </p>
      </Panel>
    );
  }
  const fee = (wallet.claimable * 500n) / 9500n;
  return (
    <Panel title="Your Ledger">
      <dl class="stats" style="margin-bottom:12px">
        <Stat
          label="Ready to collect, after the 5% claim fee"
          value={fmtTown(wallet.claimable)}
          unit="TOWN"
          view="BuyerRewards.claimable(wallet, readyCycles)"
          big
          gold
          note={ready.length ? `About ${fmtTown(fee)} TOWN more goes to the Town Hall for the owner as the claim fee.` : undefined}
        />
      </dl>
      {ready.length > 0 ? (
        <div style="margin-bottom:16px">
          <ActionButton
            label={`Collect from ${ready.length === 1 ? 'Bell' : 'Bells'} ${listBells(ready)}`}
            explain={`claim your rebates for Bells ${listBells(ready)}, oldest first, in one transaction.`}
          />
          <p class="small muted" style="margin:8px 0 0">
            The claim always includes your oldest ready Bells first. Each claim costs gas; collecting several Bells at once costs less per Bell.
          </p>
        </div>
      ) : (
        <p class="muted">Nothing is ready to collect yet. Your next Bell opens at {bellName((cycles.find((c) => !wallet.claimed[c]) ?? current) + 2)}.</p>
      )}
      <div class="table-wrap">
        <table class="data stack">
          <caption class="visually-hidden">Your buys in the Ledger, Bell by Bell</caption>
          <thead>
            <tr>
              <th scope="col">Bell</th>
              <th scope="col" class="num">
                You bought
              </th>
              <th scope="col" class="num">
                Everyone bought
              </th>
              <th scope="col" class="num">
                Your rebate, after fee
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {[...cycles].reverse().map((c) => {
              const status = cycleStatus(wallet, c, current);
              const info = chain.rewards.cycleInfo[c];
              const net = afterClaimFee(chain, cycleRebateGross(chain, wallet, c));
              return (
                <tr key={c} class={c === current ? 'current' : undefined}>
                  <td data-label="Bell" class="nowrap">{bellName(c)}</td>
                  <td data-label="You bought" class="num" data-view="TownHook.bought(c, wallet)">
                    {fmtTown(wallet.bought[c])}
                  </td>
                  <td data-label="Everyone bought" class="num" data-view="BuyerRewards.cycleInfo(c).total">
                    {fmtTown(info?.total ?? 0n)}
                    {c === current ? ' so far' : ''}
                  </td>
                  <td data-label="Your rebate" class="num">
                    {info?.finalized ? '' : 'about '}
                    {fmtTown(net)}
                  </td>
                  <td data-label="Status">
                    {status === 'claimed' && <span class="muted">Collected</span>}
                    {status === 'ready' && <strong style="color:var(--gold-soft)">Ready</strong>}
                    {status === 'waiting' && (
                      <span>
                        Opens at {bellName(c + 2)}
                        <span class="faint"> ({c + 2 - current === 1 ? 'next Bell' : `in ${c + 2 - current} Bells`})</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="small faint" style="margin:10px 0 0">
        "About" figures are estimates until the Bell's pot is fixed at its first claim; the others come from the fixed pot. <SampleBadge />
      </p>
    </Panel>
  );
}

function Totals() {
  const { chain } = useApp();
  const r = chain.rewards;
  return (
    <Panel title="The Granary's books">
      <dl class="stats">
        <Stat label="Set aside for Bells so far" value={fmtTown(r.totalEmitted)} unit="TOWN" view="BuyerRewards.totalEmitted" />
        <Stat label="Not yet set aside for any Bell" value={fmtTown(reserveUnscheduled(chain))} unit="TOWN" view="RESERVE - BuyerRewards.totalEmitted" />
        <Stat label="Rebates paid to buyers" value={fmtTown(r.totalPaidToBuyers)} unit="TOWN" view="BuyerRewards.totalPaidToBuyers" />
        <Stat label="Claim fees sent to the owner" value={fmtTown(r.totalFeesToTreasury)} unit="TOWN" view="BuyerRewards.totalFeesToTreasury" />
      </dl>
      <p class="small muted" style="margin:14px 0 0">
        A Bell's pot is set aside when its first claim arrives (or when anyone finalises it). Rebates nobody claims stay in the Granary, but they still count
        against the reserve.
      </p>
    </Panel>
  );
}

function Rules() {
  return (
    <Panel title="The Granary's rules" sample={false}>
      <ul style="padding-left:1.1em;margin:0">
        <li>One point for every TOWN you receive on a buy through the Gate. Selling takes no points away.</li>
        <li>A Bell's pot is 5% of all TOWN bought that Bell, never more than its ration. You get your share of the pot in proportion to your points.</li>
        <li>You can claim a Bell from the start of the Bell two after it. Rebates never expire.</li>
        <li>5% of every claim goes to the Town Hall for the owner, in TOWN.</li>
        <li>
          A ration is a limit, not a promise: a quiet Bell pays out less, and what it does not use stays in the Granary and lengthens the{' '}
          <Term slug="ages">Long Lights</Term>.
        </li>
        <li>
          Only buys through the Gate count. <Term slug="shadow-markets">Shadow Markets</Term> earn nothing.
        </li>
        <li>Claiming costs gas. Small rebates can cost more in gas than they are worth, especially when the network is busy.</li>
      </ul>
    </Panel>
  );
}

function Schedule() {
  const { chain } = useApp();
  const current = ageIndex(chain.rewards.currentCycle);
  const reserve = chain.rewards.RESERVE;
  let cumulative = 0n;
  return (
    <section class="section" aria-labelledby="schedule-title">
      <div class="wrap">
        <div class="section-head">
          <h2 id="schedule-title">The ration schedule</h2>
          <p class="muted small">
            Half the reserve is scheduled for the first 100 Bells. <SampleBadge />
          </p>
        </div>
        <div class="panel table-wrap">
          <table class="data stack">
            <caption class="visually-hidden">Daily ration by Age</caption>
            <thead>
              <tr>
                <th scope="col">Age</th>
                <th scope="col">Bells</th>
                <th scope="col" class="num">
                  Ration per Bell
                </th>
                <th scope="col" class="num">
                  Age total, if every ration is used
                </th>
                <th scope="col" class="num">
                  Share of the reserve by the Age's end
                </th>
              </tr>
            </thead>
            <tbody>
              {AGES.map((a, i) => {
                const cap = chain.rewards.cap[a.first] ?? 0n;
                const ageTotal = a.last !== null ? cap * 100n : null;
                cumulative += ageTotal ?? reserve - cumulative;
                const share = Math.round(Number((cumulative * 1_000_000n) / reserve) / 100) / 100;
                return (
                  <tr key={a.name} class={i === current ? 'current' : undefined}>
                    <td data-label="Age">
                      {a.numeral ? `${a.numeral}. ` : ''}
                      {a.name}
                      {i === current && <span class="now-pill">Now</span>}
                    </td>
                    <td data-label="Bells">
                      {fmtInt(a.first)}
                      {a.last !== null ? ` to ${fmtInt(a.last)}` : ' onward'}
                    </td>
                    <td data-label="Ration per Bell" class="num" data-view={`BuyerRewards.cap(${a.first})`}>
                      {fmtTown(cap)}
                    </td>
                    <td data-label="Age total" class="num">
                      {ageTotal !== null ? fmtTown(ageTotal) : 'until the Granary is empty'}
                    </td>
                    <td data-label="Share of reserve" class="num">
                      {`${share}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
