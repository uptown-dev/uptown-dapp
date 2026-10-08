import { useApp, useChain, useTx, Card, ConnectPrompt, Details, Fig, Figures, Notice, PageHead, TxStatus } from '../components/ui';
import { claimRebatesTx } from '../lib/actions';
import {
  afterClaimFee,
  claimOpensOn,
  cycleRebateGross,
  cycleStatus,
  epochIndex,
  nextTenCaps,
  readyCycles,
  rebateRateBps,
  reserveNearlySpent,
  reserveUnscheduled,
  walletCycles,
} from '../lib/derive';
import { dayName, fmtBps, fmtInt, fmtTown, listDays } from '../lib/format';

export function Rewards() {
  const chain = useChain();
  return (
    <div class="wrap page">
      <PageHead
        title="Rewards"
        lead="Every buy earns a TOWN rebate: up to 5% of the TOWN you bought, less a 5% claim fee, claimable the next day within each day’s limit."
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
          A buy made today on the <a href="#/trade">Trade page</a> can be claimed from {dayName(claimOpensOn(chain, current))}.
        </p>
      </Card>
    );
  }
  const fee = (wallet.claimable * 500n) / 9500n;
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
            ? `Nothing is ready yet. Your next day opens on ${dayName(claimOpensOn(chain, days.find((d) => !wallet.claimed[d]) ?? current))}.`
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
                <td class="r num">
                  {info?.finalized ? '' : '≈ '}
                  {fmtTown(net)}
                </td>
                <td class="r nowrap">
                  {status === 'claimed' && <span class="muted">Claimed</span>}
                  {status === 'ready' && <span class="status-ready">Ready</span>}
                  {status === 'waiting' && <span class="muted">From day {fmtInt(claimOpensOn(chain, d))}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p class="small faint table-note">≈ marks an estimate: a day’s pot is fixed when the day is first claimed or finalised.</p>
      </div>
      </div>
    </Card>
  );
}

function Today() {
  const chain = useChain();
  const c = chain.rewards.currentCycle;
  const rate = rebateRateBps(chain, c);
  return (
    <Card title={`Today, ${dayName(c)}`}>
      <Figures cols={4}>
        <Fig label="Today’s limit" value={fmtTown(chain.rewards.cap[c] ?? 0n)} unit="TOWN" view="BuyerRewards.cap(currentCycle)" />
        <Fig label="Bought by everyone today" value={fmtTown(chain.hook.cycleTotal[c] ?? 0n)} unit="TOWN" view="TownHook.cycleTotal(currentCycle)" />
        <Fig label="Current rate, before fee" value={fmtBps(rate)} view="derived: min(5%, cap / cycleTotal)" />
        <Fig label="Current rate, after fee" value={fmtBps(rate * 0.95)} view="derived: rate × 0.95" accent />
      </Figures>
      <p class="small muted card-foot">
        The rate is 5% until 5% of the day’s buying passes the day’s limit; then the limit is shared and the rate falls. Today’s rebates open on{' '}
        {dayName(claimOpensOn(chain, c))}.
      </p>
    </Card>
  );
}

function Rules() {
  return (
    <ul class="plain-list">
      <li>Every TOWN you receive on a buy earns one point for that day. Selling takes no points away.</li>
      <li>A day’s pot is 5% of all TOWN bought that day, never more than the day’s limit, shared by points.</li>
      <li>A day can be claimed from the start of the next day. Rebates never expire.</li>
      <li>5% of every claim goes to the treasury for the owner, in TOWN, so 4.75% is the most a buyer gets back.</li>
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
