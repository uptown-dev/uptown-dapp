import { useApp, useChain, useTx, Card, ConnectPrompt, Details, Fig, Figures, Notice, PageHead, TxStatus } from '../components/ui';
import { claimRebatesTx } from '../lib/actions';
import type { ChainState } from '../data/types';
import {
  afterClaimFee,
  afterFeeBps,
  claimOpensOn,
  cycleRebateGross,
  cycleStatus,
  dayRateBps,
  effectiveRateBps,
  epochIndex,
  leanToday,
  limitReached,
  nextTenCaps,
  rateRange,
  readyCycles,
  reserveNearlySpent,
  reserveUnscheduled,
  walletCycles,
} from '../lib/derive';
import { dayName, fmtBps, fmtInt, fmtTown, listDays, fmtRate } from '../lib/format';

export function Rewards() {
  const chain = useChain();
  const r = rateRange(chain);
  return (
    <div class="wrap page">
      <PageHead
        title="Rewards"
        lead={`Every buy earns a TOWN rebate: ${fmtBps(r.low)} to ${fmtBps(r.high)} of the TOWN you bought, set each day by the last three days’ trading, less a ${fmtBps(chain.rewards.CLAIM_FEE_BPS)} claim fee, claimable the next day within each day’s limit.`}
      />
      {reserveNearlySpent(chain) && <ReserveLow />}
      <YourRebate />
      <Today />
      <Details>
        <Rules />
        <Schedule />
      </Details>
    </div>
  );
}

function ReserveLow() {
  const chain = useChain();
  return (
    <Notice kind="warn" title="The rebate reserve is nearly spent">
      <p>
        <span class="num">{fmtTown(reserveUnscheduled(chain))}</span> TOWN remain, less than the next ten days’ limits (
        <span class="num">{fmtTown(nextTenCaps(chain))}</span> TOWN). Near the end, days are paid in the order they are first claimed or finalised, so a day
        claimed late can get less or nothing. This site always claims your oldest days first.
      </p>
    </Notice>
  );
}

function YourRebate() {
  const chain = useChain();
  const { wallet, network } = useApp();
  const tx = useTx();
  if (!wallet) {
    return (
      <Card title="Your rebate">
        <ConnectPrompt what="your buys, day by day, and what you can claim" />
      </Card>
    );
  }
  const current = chain.rewards.currentCycle;
  const days = walletCycles(wallet);
  const ready = readyCycles(chain, wallet);
  if (days.length === 0) {
    return (
      <Card title="Your rebate">
        <p class="muted">This wallet has no buys yet, so there is nothing to claim.</p>
        <TxStatus tx={tx} />
        <p class="small muted">
          A buy made today on the <a href="#/trade">Trade page</a> can be claimed from {dayName(claimOpensOn(current))}.
        </p>
      </Card>
    );
  }
  const feeBps = BigInt(chain.rewards.CLAIM_FEE_BPS);
  const fee = (wallet.claimable * feeBps) / (10_000n - feeBps);
  return (
    <Card title="Your rebate">
      <div class="split">
      <div>
      <Figures cols={2}>
        <Fig
          label="Claimable now, after the 5% fee"
          value={fmtTown(wallet.claimable)}
          unit="TOWN"
          view="BuyerRewards.claimable(wallet, readyCycles)"
          accent
          large
          note={ready.length ? `About ${fmtTown(fee)} TOWN goes to the treasury as the claim fee.` : undefined}
        />
      </Figures>
      {ready.length > 0 ? (
        <div class="claim-row">
          <button
            type="button"
            class="btn btn-primary btn-block"
            disabled={tx.busy}
            onClick={() => {
              const days = [...ready];
              const net = wallet.claimable;
              void tx.run(
                `Claim ${days.length === 1 ? 'day' : 'days'} ${listDays(days)}`,
                () => claimRebatesTx(network, days),
                () => `${fmtTown(net)} TOWN for ${days.length === 1 ? 'day' : 'days'} ${listDays(days)} went to your wallet, after the 5% claim fee.`,
              );
            }}
          >
            {tx.busy ? 'Claiming…' : `Claim ${ready.length === 1 ? 'day' : 'days'} ${listDays(ready)}`}
          </button>
          <p class="small muted">Oldest ready days are always claimed first. Claiming several days at once costs less gas per day.</p>
        </div>
      ) : (
        <p class="small muted">
          {days.some((d) => !wallet.claimed[d])
            ? `Nothing is ready yet. Your next day opens on ${dayName(claimOpensOn(days.find((d) => !wallet.claimed[d]) ?? current))}.`
            : 'Nothing to claim: every day you bought has been claimed.'}
        </p>
      )}
      <TxStatus tx={tx} />
      </div>
      <div>
      <div class="table-scroll">
      <table class="table compact">
        <caption class="visually-hidden">Your buys, day by day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col" class="r">
              You bought
            </th>
            <th scope="col" class="r">
              Rate
            </th>
            <th scope="col" class="r">
              Rebate after fee
            </th>
            <th scope="col" class="r">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => {
            const status = cycleStatus(chain, wallet, d);
            const info = chain.rewards.cycleInfo[d];
            const net = afterClaimFee(chain, cycleRebateGross(chain, wallet, d));
            return (
              <tr key={d}>
                <td class="nowrap">{fmtInt(d)}</td>
                <td class="r num" data-view="TownHook.bought(c, wallet)">
                  {fmtTown(wallet.bought[d])}
                </td>
                <td class="r num" data-view={`BuyerRewards.rateBps(${d})`}>
                  {fmtBps(dayRateBps(chain, d))}
                </td>
                <td class="r num">
                  {info?.finalized ? '' : '≈ '}
                  {fmtTown(net)}
                </td>
                <td class="r nowrap">
                  {status === 'claimed' && <span class="muted">Claimed</span>}
                  {status === 'ready' && <span class="status-ready">Ready</span>}
                  {status === 'waiting' && <span class="muted">From day {fmtInt(claimOpensOn(d))}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p class="small faint table-note">
        Rate: the day’s rebate rate, before the claim fee, that its pot is paid at. ≈ marks an estimate: a day’s pot is fixed when the day is first claimed
        or finalised.
      </p>
      </div>
      </div>
    </Card>
  );
}

function Today() {
  const chain = useChain();
  const c = chain.rewards.currentCycle;
  const rate = dayRateBps(chain, c);
  const paying = effectiveRateBps(chain, c);
  const capped = limitReached(chain, c);
  const fee = chain.rewards.CLAIM_FEE_BPS;
  return (
    <Card title={`Today, ${dayName(c)}`}>
      <Figures cols={3}>
        <Fig
          label="Today’s rate, before fee"
          value={fmtBps(rate)}
          view={`BuyerRewards.rateBps(${c})`}
          note={capped ? `The day’s limit is reached: paying ${fmtRate(paying)} so far.` : 'Set when the day began; it does not change today.'}
        />
        <Fig
          label={`Today’s rate, after the ${fmtBps(fee)} fee`}
          value={fmtRate(afterFeeBps(chain, rate))}
          view={`rateBps(${c}) × (1 - CLAIM_FEE_BPS / 10000)`}
          accent
          note={capped ? `${fmtRate(afterFeeBps(chain, paying))} so far, with the limit shared.` : 'What reaches the buyer.'}
        />
        <YesterdaysLean />
        <Fig label="Today’s limit" value={fmtTown(chain.rewards.cap[c] ?? 0n)} unit="TOWN" view="BuyerRewards.cap(currentCycle)" />
        <Fig label="Bought by everyone today" value={fmtTown(chain.hook.cycleTotal[c] ?? 0n)} unit="TOWN" view="TownHook.cycleTotal(currentCycle)" />
        <Fig label="Today’s rebates open on" value={dayName(claimOpensOn(c))} view="currentCycle + 1 (CR-44)" note="From the start of the next day." />
      </Figures>
      <p class="small muted card-foot">
        <RateRule chain={chain} /> If a day’s buying times its rate passes the day’s limit, the limit is shared and the rate falls.
      </p>
    </Card>
  );
}

/** The three-point rule, in one sentence, from BuyerRewards' constants (CR-47). */
export function RateRule({ chain }: { chain: ChainState | null }) {
  const r = rateRange(chain);
  return (
    <>
      Each day’s rate is set when the day begins, from the last three days’ trading: {fmtBps(r.low)} when buying and selling balance, up to{' '}
      {fmtBps(r.buyTop)} after days of only buying, and up to {fmtBps(r.high)} after days of only selling.
    </>
  );
}

/** BuyerRewards.lean(today), with the bought and sold totals of the days it is measured over (CR-47). */
function YesterdaysLean() {
  const chain = useChain();
  const c = chain.rewards.currentCycle;
  const l = leanToday(chain);
  const first = l.days[0];
  const last = l.days[l.days.length - 1];
  const span = l.days.length === 0 ? '' : l.days.length === 1 ? `day ${fmtInt(first)}` : `days ${fmtInt(first)} to ${fmtInt(last)}`;
  const word = l.days.length === 1 ? 'the last day' : `the last ${l.days.length === 2 ? 'two' : 'three'} days`;
  const value = l.lean === 0 ? '0' : `${l.lean > 0 ? '+' : '−'}${Math.abs(l.lean).toFixed(2)}`;
  let note: string;
  if (l.days.length === 0) note = `${dayName(c)} has no earlier days, so its rate is the base rate.`;
  else if (l.bought === 0n && l.sold === 0n) note = `No trading over ${word} (${span}), so the rate is the base rate.`;
  else
    note = `${l.lean > 0 ? 'More buying than selling' : l.lean < 0 ? 'More selling than buying' : 'Buying and selling balanced'} over ${word} (${span}): ${fmtTown(l.bought)} TOWN bought, ${fmtTown(l.sold)} sold.`;
  return <Fig label="Yesterday’s lean" value={value} view={`BuyerRewards.lean(${c}); TownHook.cycleTotal, sold`} note={note} />;
}

function Rules() {
  const chain = useChain();
  const r = rateRange(chain);
  return (
    <ul class="plain-list">
      <li>Every TOWN you receive on a buy earns one point for that day. Selling takes no points away.</li>
      <li>
        A day’s pot is the day’s rate ({fmtBps(r.low)} to {fmtBps(r.high)}) of all TOWN bought that day, never more than the day’s limit, shared by
        points.
      </li>
      <li>
        <RateRule chain={chain} /> The lean is (bought − sold) ÷ (bought + sold) over those days, from −1 to +1; the rate moves in a straight line between
        the three points.
      </li>
      <li>A day can be claimed from the start of the next day. Rebates never expire.</li>
      <li>
        {fmtBps(chain.rewards.CLAIM_FEE_BPS)} of every claim goes to the treasury for the owner, in TOWN, so a buyer gets {fmtRate(afterFeeBps(chain, r.low))}{' '}
        to {fmtRate(afterFeeBps(chain, r.high))} back.
      </li>
      <li>A limit is not a promise: a quiet day pays less, and what it does not use stays in the reserve.</li>
      <li>Near the end of the reserve, days are paid in the order they are first claimed or finalised.</li>
      <li>Only buys in the official TOWN pool count. Claiming costs gas; small rebates may cost more than they are worth.</li>
    </ul>
  );
}

const EPOCHS = [0, 100, 200, 300, 400, 500, 600];

function Schedule() {
  const chain = useChain();
  const now = epochIndex(chain.rewards.currentCycle);
  const reserve = chain.rewards.RESERVE;
  let cumulative = 0n;
  return (
    <>
      <h3 class="details-title">Daily limit: halves every 100 days</h3>
      <p class="small muted">Half the 500,000,000 TOWN reserve is scheduled for the first 100 days.</p>
      <div class="table-scroll">
      <table class="table compact">
        <caption class="visually-hidden">Daily rebate limit by 100-day period</caption>
        <thead>
          <tr>
            <th scope="col">Days</th>
            <th scope="col" class="r">
              Limit per day
            </th>
            <th scope="col" class="r">
              Reserve used by the end
            </th>
          </tr>
        </thead>
        <tbody>
          {EPOCHS.map((first, i) => {
            const cap = chain.rewards.cap[first] ?? 0n;
            const last = i < EPOCHS.length - 1 ? first + 99 : null;
            cumulative += last !== null ? cap * 100n : reserve - cumulative;
            const share = Math.round(Number((cumulative * 1_000_000n) / reserve) / 100) / 100;
            return (
              <tr key={first} class={i === now ? 'current' : undefined}>
                <td class="nowrap">
                  {fmtInt(first)}
                  {last !== null ? `–${fmtInt(last)}` : ' on'}
                  {i === now && <span class="now-tag">Now</span>}
                </td>
                <td class="r num" data-view={`BuyerRewards.cap(${first})`}>
                  {fmtTown(cap)}
                </td>
                <td class="r num">{last !== null ? `${share}%` : 'until spent'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
