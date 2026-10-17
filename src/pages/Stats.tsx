import { useApp, useChain, useTx, Card, Fig, Figures, Notice, PageHead, TxStatus, Usd, Verify } from '../components/ui';
import { applyStakingTx, pokeTx } from '../lib/actions';
import type { CandidateCheck } from '../data/types';
import {
  budgetState,
  burned,
  daysUntil,
  forStakers,
  leftToBurn,
  nextDayStart,
  pausePending,
  poolEmpty,
  secondPositionState,
  sellFeeMode,
  stakingChange,
  stakingPaidSince,
  stakingReplaced,
  streamEnd,
  streamPerDay,
} from '../lib/derive';
import { dayName, fmtBps, fmtDate, fmtDateTime, fmtDelay, fmtDuration, fmtEth, fmtInt, fmtTown, fmtUntil, shortAddress } from '../lib/format';
import { codeUrl, contractUrl, positionUrl, readUrl, secondPositionUrl, tokenUrl } from '../lib/network';
import { sellFeeWords } from './Trade';

export function Stats() {
  return (
    <div class="wrap page">
      <PageHead title="Stats" lead="The treasury and the running totals, read straight from the contracts." />
      <Treasury />
      <TradingVolume />
      {/* CR-102: the ETH card lost two rows with TownStaking, so Staking stands under it, beside the taller SKYLINE card. */}
      <div class="grid-2">
        <div class="grid-col">
          <EthFlows />
          <Staking />
        </div>
        <TokenTotals />
      </div>
      <Liquidity />
    </div>
  );
}

function Treasury() {
  const chain = useChain();
  const { network } = useApp();
  const tx = useTx();
  const t = chain.treasury;
  const b = budgetState(chain);
  const c = t.currentCycle;
  const wait = t.nextDistributionTime - chain.blockTimestamp;
  // While paused (CR-46) a budget is shown only if this day had already rolled and paid before the pause.
  const paidBeforePause = b.kind === 'paused' && t.lastDistributedCycle === c;
  return (
    <Card title="Treasury">
      <Figures cols={3}>
        <Fig label="ETH balance" value={fmtEth(t.balance)} unit="ETH" amount={t.balance} view="eth_getBalance(Treasury)" />
        <Fig label="Owner reserve" value={fmtEth(t.ownerEthAvailable)} unit="ETH" amount={t.ownerEthAvailable} view="Treasury.ownerEthAvailable" note="10% of all ETH in" />
        <Fig
          label="For stakers"
          value={fmtEth(forStakers(chain))}
          unit="ETH"
          amount={forStakers(chain)}
          view="balance - ownerEthAvailable"
          note="balance less the owner reserve"
        />
        <Fig
          label="Daily payout rate"
          value={fmtBps(t.spendBps)}
          view="Treasury.spendBps"
          note={`of the stakers’ ETH each day; settable 1% to ${fmtBps(t.MAX_SPEND_BPS)}`}
        />
        <Fig
          label={`${dayName(c)} budget`}
          value={b.kind === 'paused' ? (paidBeforePause ? fmtEth(t.budget) : 'None') : b.kind === 'waiting' ? `≈ ${fmtEth(b.estimate)}` : fmtEth(b.amount)}
          unit={b.kind === 'paused' && !paidBeforePause ? undefined : 'ETH'}
          amount={b.kind === 'paused' ? (paidBeforePause ? t.budget : null) : b.kind === 'waiting' ? b.estimate : b.amount}
          view={b.kind === 'waiting' ? 'derived: (balance - ownerEthAvailable) × spendBps' : 'Treasury.budget'}
          accent
          note={
            b.kind === 'paused'
              ? paidBeforePause
                ? 'Paid to stakers before the pause.'
                : 'Paused: the stakers’ share waits in the treasury.'
              : b.kind === 'paid'
                ? 'Paid to stakers.'
                : b.kind === 'below-minimum'
                  ? 'Under 0.001 ETH: waits for a later day.'
                  : 'Not yet triggered.'
          }
        />
        <Fig
          label="Next payout"
          value={b.kind === 'paused' ? 'Paused' : b.kind === 'waiting' ? 'Now' : `in ${fmtDuration(wait)}`}
          view="Treasury.nextDistributionTime"
          note={
            b.kind === 'paused'
              ? 'No payout until the owner unpauses.'
              : b.kind === 'waiting'
                ? 'Anyone can trigger it.'
                : `${fmtDateTime(t.nextDistributionTime)}, the start of ${dayName(c + 1)}`
          }
        />
      </Figures>
      {b.kind === 'paused' && (
        <Notice kind="warn" title="Payouts are paused by the owner">
          <p>
            Since <span class="num">{fmtDateTime(t.pauseEffectiveAt)}</span> the treasury pays nothing to stakers. ETH keeps arriving, the owner’s 10% keeps
            counting, and the stakers’ share waits in the treasury. The owner can unpause at any moment, with no wait; the next trigger then pays out at the
            daily rate as usual. Trading, staking and claiming keep working.
          </p>
        </Notice>
      )}
      {b.kind === 'below-minimum' && (
        <Notice kind="info" title="Today’s budget is under the minimum">
          <p>
            The budget of <span class="num">{fmtEth(b.amount)}</span> ETH <Usd amount={b.amount} unit="ETH" paren /> is under 0.001 ETH, so nothing was paid
            today. It stays in the treasury and counts
            toward a later day.
          </p>
        </Notice>
      )}
      <div class="poke">
        <div>
          <p class="poke-title">Trigger today’s payout</p>
          <p class="small muted">
            Free to press: it pays no reward and costs only gas. Any staking action does the same, so most days are triggered without this button.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-secondary"
          disabled={tx.busy || b.kind !== 'waiting'}
          title={b.kind === 'paused' ? 'Payouts are paused by the owner' : undefined}
          onClick={() =>
            void tx.run('Trigger payout', () => pokeTx(network), () =>
              `${dayName(c)} is triggered. The figures above show its budget and whether it was paid to stakers (only at 0.001 ETH or more).`,
            )
          }
        >
          {tx.busy ? 'Triggering…' : b.kind === 'paused' ? 'Payouts are paused by the owner' : b.kind === 'waiting' ? 'Trigger payout' : 'Already triggered today'}
        </button>
      </div>
      {b.kind === 'paused' && <p class="small muted poke-why">Triggering does nothing while the payouts are paused, so the button is off.</p>}
      {b.kind !== 'waiting' && b.kind !== 'paused' && (
        <p class="small muted poke-why">
          {dayName(c)} was already triggered{b.kind === 'paid' ? ' and paid' : ''}. The next payout can be triggered from{' '}
          <span class="num">{fmtDateTime(t.nextDistributionTime)}</span>.
        </p>
      )}
      <TxStatus tx={tx} />
      <OwnerChanges />
      <Verify
        links={[
          { label: 'balance', what: 'the Treasury’s ETH balance', href: contractUrl(network, 'Treasury') },
          { label: 'reserve, rate and budget', what: 'the Treasury’s owner reserve, payout rate and budget', href: contractUrl(network, 'Treasury', 'read') },
        ]}
      />
    </Card>
  );
}

/**
 * CR-46, CR-48, CR-49: the staking contract the treasury pays, and every owner change announced and
 * not yet in effect (a staking replacement, a pause), each with the date it can take effect. A
 * replacement can be applied by anyone from the end of its 2-day wait until its 7-day window
 * closes, and the site marks it verified once it has checked the contract's own answers.
 */
export function OwnerChanges() {
  const chain = useChain();
  const { network } = useApp();
  const tx = useTx();
  const t = chain.treasury;
  const now = chain.blockTimestamp;
  const skylineStaking = network.deployment?.contracts.SkylineStaking;
  const replaced = stakingReplaced(chain, skylineStaking);
  const since = stakingPaidSince(network.stakingContracts, t.staking);
  const pauseAt = pausePending(chain);
  const change = stakingChange(chain);
  const verified = t.candidate?.verified ?? false;
  const canApply = change?.phase === 'open' && verified;
  const delay = fmtDuration(t.OWNER_DELAY);
  const none = t.pendingStaking === null && pauseAt === null;
  return (
    <div class="owner-changes">
      <div class="staking-target">
        <p class="poke-title">Staking contract the treasury pays</p>
        <p class="staking-target-line">
          <span>{replaced ? 'A replacement contract' : 'SkylineStaking'}</span>{' '}
          <code data-view="Treasury.staking" title={t.staking}>
            {shortAddress(t.staking)}
          </code>{' '}
          <Verify
            inline
            links={[
              { label: 'contract', what: 'the staking contract the treasury pays', href: codeUrl(network, t.staking) },
              { label: 'setting', what: 'the Treasury’s staking setting', href: contractUrl(network, 'Treasury', 'read') },
            ]}
          />
        </p>
        {replaced && (
          <p class="small muted">
            The owner replaced SkylineStaking{since !== null ? ` on ${fmtDate(since)}` : ''}. Every payout from now on goes to this contract, and the Stake page
            stakes only in it; what SkylineStaking already received keeps streaming there.
          </p>
        )}
      </div>
      <div class="pending-changes">
        <p class="poke-title">Pending owner changes</p>
        <p class="small muted">
          The owner can point the payouts at a new staking contract, or pause them, each only after a public wait of {delay}. A new staking contract must
          then be applied within {fmtDuration(t.APPLY_WINDOW)}. Every announced change is listed here.
        </p>
        {none ? (
          <p class="pending-none" data-view="Treasury.pendingStaking, Treasury.pauseEffectiveAt">
            None
          </p>
        ) : (
          <ul class="pending-list">
            {t.pendingStaking !== null && change && (
              <li class={`pending-item${change.phase === 'expired' ? ' expired' : ''}`} data-view="Treasury.pendingStaking, stakingEffectiveAt, APPLY_WINDOW">
                <p class="pending-title">
                  New staking contract <code title={t.pendingStaking}>{shortAddress(t.pendingStaking)}</code>
                  {skylineStaking && t.pendingStaking.toLowerCase() === skylineStaking.toLowerCase() ? ' (SkylineStaking again)' : ''}{' '}
                  <Verify inline links={[{ what: 'the announced staking contract’s code', href: codeUrl(network, t.pendingStaking) }]} />
                </p>
                {t.candidate && <CandidateMark check={t.candidate} />}
                {change.phase === 'expired' ? (
                  <p class="small">
                    <span class="expired-tag">Expired: the owner must announce again</span>{' '}
                    <span class="muted">
                      It was not applied by {fmtDateTime(change.until)}, the end of its {fmtDelay(t.APPLY_WINDOW)} window, so it can no longer be: the
                      treasury keeps paying the current contract.
                    </span>
                  </p>
                ) : change.phase === 'open' && verified ? (
                  <p class="small muted">
                    Can be applied now, by anyone, until {fmtDateTime(change.until)} (in {fmtUntil(change.until - now)}). Treat it as already in effect: from
                    then on every payout goes to it; ETH already paid keeps streaming where it is, and no stake moves.
                  </p>
                ) : change.phase === 'open' ? (
                  <p class="small muted">
                    Its wait is over and its window runs until {fmtDateTime(change.until)} (in {fmtUntil(change.until - now)}), but the treasury will refuse it
                    when anyone tries to apply it, so the payouts stay where they are.
                  </p>
                ) : (
                  <p class="small muted">
                    Can be applied from {fmtDateTime(change.from)} (in {fmtUntil(change.from - now)}) until {fmtDateTime(change.until)}, by anyone. From then on
                    every payout goes to it; ETH already paid keeps streaming where it is, and no stake moves.
                  </p>
                )}
                {change.phase !== 'expired' && (
                  <div class="pending-action">
                    <button
                      type="button"
                      class="btn btn-secondary btn-small"
                      disabled={tx.busy || !canApply}
                      onClick={() =>
                        void tx.run('Apply', () => applyStakingTx(network), () => 'The new staking contract is in use: every payout from now on goes to it.')
                      }
                    >
                      {tx.busy ? 'Applying…' : 'Apply'}
                    </button>
                    {change.phase === 'waiting' && <span class="small muted">Not yet: the {fmtDelay(t.OWNER_DELAY)} wait has not passed.</span>}
                    {change.phase === 'open' && !verified && (
                      <span class="small muted">Off: the treasury would refuse it, because it does not look like a staking contract.</span>
                    )}
                  </div>
                )}
              </li>
            )}
            {pauseAt !== null && (
              <li class="pending-item" data-view="Treasury.pauseEffectiveAt">
                <p class="pending-title">Pause of the payouts</p>
                <p class="small muted">
                  Takes effect on {fmtDateTime(pauseAt)} (in {fmtUntil(pauseAt - now)}) unless the owner cancels it. While paused, the stakers’ share waits in
                  the treasury.
                </p>
              </li>
            )}
          </ul>
        )}
        {/* Outside the list, so the result stays visible when the applied change leaves it. */}
        <div class="pending-status">
          <TxStatus tx={tx} />
        </div>
      </div>
    </div>
  );
}

/**
 * CR-49: the site's own check of an announced staking contract. "Verified" when it names this
 * treasury as `treasury()` and WETH as `weth()` and is not a delegated wallet; otherwise it does
 * not look like a staking contract, and the treasury will refuse it when it is applied.
 */
export function CandidateMark({ check }: { check: CandidateCheck }) {
  const { network } = useApp();
  const upgradeable = check.upgradeable ? (
    <>
      {' '}
      <span class="upgradeable-tag" data-view="eth_getStorageAt(candidate, EIP-1967 implementation slot)">
        Upgradeable: its code can change
      </span>
    </>
  ) : null;
  if (check.verified)
    return (
      <p class="candidate-mark" data-view="candidate.treasury(), candidate.weth()">
        <span class="verified-tag">Verified</span>
        {upgradeable}{' '}
        <span class="small muted">
          {check.upgradeable
            ? 'This site asked it: it names this treasury and WETH. It is a proxy: whoever controls it can swap the code behind this address at any time.'
            : 'This site asked it: it names this treasury and WETH, and its code is fixed.'}
        </span>
      </p>
    );
  const treasury = network.deployment?.contracts.Treasury;
  const why = check.delegated
    ? 'its address is a wallet whose code can be changed'
    : check.treasury === null
      ? 'it gives no answer when asked for its treasury'
      : treasury && check.treasury.toLowerCase() !== treasury.toLowerCase()
        ? `it names another treasury (${shortAddress(check.treasury)})`
        : check.weth === null
          ? 'it gives no answer when asked for its reward token'
          : `it names another reward token than WETH (${shortAddress(check.weth)})`;
  return (
    <p class="candidate-mark" data-view="candidate.treasury(), candidate.weth()">
      <span class="unverified-tag">Does not look like a staking contract</span>
      {upgradeable}{' '}
      <span class="small muted">This site asked it: {why}. The treasury will refuse it at application.</span>
    </p>
  );
}

/**
 * CR-61: the SKYLINE bought and sold yesterday and today so far, each shown on its own, from SkylineHook's
 * daily totals (`cycleTotal(c)`: SKYLINE received by buyers; `sold(c)`: SKYLINE given up by sellers, before
 * the 2% sell fee). Read with the other figures in the one Multicall3 batch; nothing comes from events,
 * and no volume in ETH is shown, since no contract keeps one.
 */
export function TradingVolume() {
  const chain = useChain();
  const { network } = useApp();
  const h = chain.hook;
  const c = chain.rewards.currentCycle;
  const y = c >= 1 ? c - 1 : null;
  // The next midnight UTC (CR-94): days are calendar days in UTC.
  const endsAt = nextDayStart(h.launchTime, c);
  const past = (what: 'cycleTotal' | 'sold', label: string) => (
    <Fig
      label={label}
      value={y !== null ? fmtTown(h[what][y] ?? 0n) : 'None yet'}
      unit={y !== null ? 'SKYLINE' : undefined}
      amount={y !== null ? (h[what][y] ?? 0n) : null}
      view={y !== null ? `SkylineHook.${what}(${y})` : `SkylineHook.${what}(c - 1)`}
      note={y !== null ? dayName(y) : `${dayName(0)} has no day before it`}
    />
  );
  const today = (what: 'cycleTotal' | 'sold', label: string) => (
    <Fig label={label} value={fmtTown(h[what][c] ?? 0n)} unit="SKYLINE" amount={h[what][c] ?? 0n} view={`SkylineHook.${what}(${c})`} note={`${dayName(c)}, still counting`} />
  );
  return (
    <Card title="Trading volume, in SKYLINE" class="volume">
      <Figures cols={4}>
        {past('cycleTotal', 'Bought yesterday')}
        {past('sold', 'Sold yesterday')}
        {today('cycleTotal', 'Bought today so far')}
        {today('sold', 'Sold today so far')}
      </Figures>
      <p class="small faint card-foot">
        Bought is the SKYLINE buyers received from the pool; sold is the SKYLINE sellers gave up, before the 2% sell fee. Today’s figures keep counting until{' '}
        {dayName(c)} ends on <span class="num">{fmtDateTime(endsAt)}</span>.
      </p>
      <Verify links={[{ label: 'daily totals', what: 'SkylineHook’s SKYLINE bought and sold per day', href: contractUrl(network, 'SkylineHook', 'read') }]} />
    </Card>
  );
}

function EthFlows() {
  const chain = useChain();
  const { network } = useApp();
  const t = chain.treasury;
  const booked = t.totalEthReceived - t.totalDistributed - t.totalOwnerEthWithdrawn;
  const unbooked = t.balance > booked ? t.balance - booked : 0n;
  return (
    <Card title="ETH in and out, since launch">
      <Figures cols={2}>
        <Fig
          label="ETH received by the treasury"
          value={fmtEth(t.totalEthReceived)}
          unit="ETH"
          amount={t.totalEthReceived}
          view="Treasury.totalEthReceived"
          note="SkylineHook’s buy fees, and sell fees paid in ETH"
        />
        <Fig label="Paid to stakers" value={fmtEth(t.totalDistributed)} unit="WETH" amount={t.totalDistributed} view="Treasury.totalDistributed" accent />
        <Fig label="Withdrawn by the owner" value={fmtEth(t.totalOwnerEthWithdrawn)} unit="ETH" amount={t.totalOwnerEthWithdrawn} view="Treasury.totalOwnerEthWithdrawn" />
      </Figures>
      <p class="small faint card-foot">
        {unbooked > 0n && (
          <>
            Another <span class="num">{fmtEth(unbooked)}</span> ETH <Usd amount={unbooked} unit="ETH" paren /> has arrived and is counted at the next treasury
            action.{' '}
          </>
        )}
        ETH leaves the treasury only two ways: to the current staking contract and the owner’s 10% reserve. “ETH received” also counts any other ETH sent
        in.
      </p>
      <Verify links={[{ label: 'Treasury', what: 'the Treasury’s running totals', href: contractUrl(network, 'Treasury', 'read') }]} />
    </Card>
  );
}

function TokenTotals() {
  const chain = useChain();
  const { network } = useApp();
  const r = chain.rewards;
  const m = sellFeeMode(chain);
  const words = sellFeeWords(chain);
  const y = m.yesterday;
  return (
    <Card title="SKYLINE">
      <Figures cols={2}>
        <Fig label="Total supply" value={fmtTown(chain.token.totalSupply)} unit="SKYLINE" amount={chain.token.totalSupply} view="UpTownToken.totalSupply" />
        <Fig label="Burned" value={fmtTown(burned(chain))} unit="SKYLINE" amount={burned(chain)} view="1,000,000,000 - totalSupply" />
        <Fig label="Left to burn before the floor" value={fmtTown(leftToBurn(chain))} unit="SKYLINE" amount={leftToBurn(chain)} view="totalSupply - SkylineHook.BURN_FLOOR" />
        <Fig label="Sell fee today" value={words.mode} view="SkylineHook.sellFeeShares" note={words.reason} accent />
        <Fig
          label="SKYLINE burned yesterday"
          value={m.burnedYesterday !== null ? fmtTown(m.burnedYesterday) : '—'}
          unit={m.burnedYesterday !== null ? 'SKYLINE' : undefined}
          amount={m.burnedYesterday}
          view={y !== null ? `SkylineHook.burned(${y})` : 'SkylineHook.burned(c - 1)'}
          note={y !== null ? `by sell fees on ${dayName(y)}` : `${dayName(0)} has no day before it`}
        />
        <Fig
          label="Rebates paid out yesterday"
          value={m.rebatesYesterday !== null ? fmtTown(m.rebatesYesterday) : '—'}
          unit={m.rebatesYesterday !== null ? 'SKYLINE' : undefined}
          amount={m.rebatesYesterday}
          view={y !== null ? `BuyerRewards.emissionEstimate(${y})` : 'BuyerRewards.emissionEstimate(c - 1)'}
          note={y !== null ? `${dayName(y)}’s rebate pot; the fee is in ETH today only if the burn was larger` : undefined}
        />
        <Fig label="Rebates emitted" value={fmtTown(r.totalEmitted)} unit="SKYLINE" amount={r.totalEmitted} view="BuyerRewards.totalEmitted" />
        <Fig
          label="Rebate reserve available"
          value={fmtTown(r.available)}
          unit="SKYLINE"
          amount={r.available}
          view="BuyerRewards.available"
          note="what the reserve holds, less rebates settled and not yet claimed"
        />
        <Fig label="Rebates paid to buyers" value={fmtTown(r.totalPaidToBuyers)} unit="SKYLINE" amount={r.totalPaidToBuyers} view="BuyerRewards.totalPaidToBuyers" accent />
        <Fig label="Claim fees to the treasury" value={fmtTown(r.totalFeesToTreasury)} unit="SKYLINE" amount={r.totalFeesToTreasury} view="BuyerRewards.totalFeesToTreasury" />
      </Figures>
      <p class="small faint card-foot">
        Burned counts sell fees and any voluntary burns. The burn stops at <span class="num">{fmtTown(chain.hook.BURN_FLOOR)}</span> SKYLINE of supply;
        from there every sell pays 1% in SKYLINE to the rebate reserve and 1% in ETH to the treasury.
      </p>
      <Verify
        links={[
          { label: 'total supply', what: 'SKYLINE’s total supply', href: tokenUrl(network, network.deployment?.contracts.UpTownToken) },
          { label: 'sell fee', what: 'SkylineHook’s sell-fee mode and burn per day', href: contractUrl(network, 'SkylineHook', 'read') },
          { label: 'reserve balance', what: 'BuyerRewards’ SKYLINE balance', href: contractUrl(network, 'BuyerRewards') },
          { label: 'rebate totals', what: 'BuyerRewards’ running totals', href: contractUrl(network, 'BuyerRewards', 'read') },
        ]}
      />
    </Card>
  );
}

/**
 * SkylineStaking's figures (CR-102 amended): the SKYLINE staked, the stream, and the WETH the
 * staking contract has received from the treasury and paid to stakers (its running totals, CR-30).
 */
function Staking() {
  const chain = useChain();
  const { network } = useApp();
  const st = chain.staking;
  const end = streamEnd(chain);
  const perDay = streamPerDay(chain);
  return (
    <Card title="Staking">
      <p class="small muted card-lead">
        Staking figures come from the contract the treasury pays now,{' '}
        <code data-view="Treasury.staking" title={st.address}>
          {stakingReplaced(chain, network.deployment?.contracts.SkylineStaking) ? shortAddress(st.address) : 'SkylineStaking'}
        </code>
        : free staking, one pool, rewards in proportion to the SKYLINE staked.
      </p>
      <Figures cols={2}>
        <Fig label="SKYLINE staked" value={fmtTown(st.totalStaked)} unit="SKYLINE" amount={st.totalStaked} view="SkylineStaking.totalStaked" />
        <Fig
          label="Streaming now"
          value={perDay > 0n ? fmtEth(perDay, 6) : poolEmpty(chain) ? 'Paused' : 'None'}
          unit={perDay > 0n ? 'WETH' : undefined}
          amount={perDay > 0n ? perDay : null}
          view="SkylineStaking.streamInfo()"
          note={end !== null ? `a day, until ${fmtDate(end)}` : poolEmpty(chain) ? 'nothing is staked' : 'no stream running'}
        />
        <Fig label="WETH received by staking" value={fmtEth(st.totalRewardsNotified)} unit="WETH" amount={st.totalRewardsNotified} view="SkylineStaking.totalRewardsNotified" />
        <Fig label="WETH claimed by stakers" value={fmtEth(st.totalRewardsPaid)} unit="WETH" amount={st.totalRewardsPaid} view="SkylineStaking.totalRewardsPaid" accent />
      </Figures>
      <Verify links={[{ label: 'staking totals', what: 'the staking contract’s totals', href: readUrl(network, st.address) }]} />
    </Card>
  );
}

/**
 * The liquidity (CR-102): the launch position, locked 10 years; the owner's second position, locked
 * 14 days and then withdrawable by the owner; and the launch buy, 0.1 ETH bought for the owner in
 * the launch transaction. The launch buy's figures are the Launcher's constants, never an event.
 */
function Liquidity() {
  const chain = useChain();
  const { network, owner } = useApp();
  const v = chain.lpVault;
  const unlock = v.unlockTime;
  const second = secondPositionState(v, chain.blockTimestamp);
  return (
    <Card title="Liquidity and the launch">
      <Figures cols={3}>
        <Fig
          label="Launch position locked until"
          value={fmtDate(unlock)}
          view="LPVault.unlockTime"
          note={`${fmtInt(daysUntil(chain, unlock))} days from now; can be extended, never shortened`}
        />
        <Fig
          label="Second position"
          value={second === 'withdrawn' ? 'Withdrawn' : second === 'withdrawable' ? 'Unlocked' : `Locked until ${fmtDate(v.secondUnlockTime)}`}
          view="LPVault.secondUnlockTime, LPVault.secondWithdrawn"
          note={
            second === 'withdrawn'
              ? 'the owner has taken it out of LPVault'
              : second === 'withdrawable'
                ? `its 14 days ended on ${fmtDate(v.secondUnlockTime)}; the owner may withdraw it`
                : `${fmtInt(daysUntil(chain, v.secondUnlockTime))} days from now; then the owner may withdraw it`
          }
        />
        <Fig
          label="Launch buy"
          value={fmtEth(chain.launch.LAUNCH_BUY_ETH, 2)}
          unit="ETH"
          amount={chain.launch.LAUNCH_BUY_ETH}
          view="Launcher.LAUNCH_BUY_ETH"
          note="bought in the launch transaction, credited to the owner"
        />
      </Figures>
      <p class="small faint card-foot">
        The launch position holds the 500,000,000 SKYLINE the pool opened with. The second position is the owner’s: full range, funded at the launch with{' '}
        {fmtEth(chain.launch.SECOND_POSITION_ETH, 2)} ETH and part of the SKYLINE the launch buy received; the rest of that SKYLINE went to the owner wallet.
        While the second position is in the pool, the price can dip below the opening price by at most what its ETH absorbs.
      </p>
      <Verify
        links={[
          { label: 'unlock times', what: 'LPVault’s unlock times and the second position’s state', href: contractUrl(network, 'LPVault', 'read') },
          { label: 'launch position NFT', what: 'the launch position NFT', href: positionUrl(network, owner?.lpVault.tokenId) },
          { label: 'second position NFT', what: 'the second position NFT', href: secondPositionUrl(network, v.secondTokenId) },
          { label: 'launch buy', what: 'the Launcher’s launch-buy figures', href: contractUrl(network, 'Launcher', 'read') },
        ]}
      />
    </Card>
  );
}
