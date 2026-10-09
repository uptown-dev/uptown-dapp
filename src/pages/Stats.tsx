import { useApp, useChain, useTx, Card, Fig, Figures, Notice, PageHead, TxStatus, Verify } from '../components/ui';
import { applyStakingTx, pokeTx } from '../lib/actions';
import { TIERS, type CandidateCheck } from '../data/types';
import {
  budgetState,
  burned,
  daysUntil,
  forStakers,
  hookFeesReceived,
  leftToBurn,
  pausePending,
  reserveUnscheduled,
  stakingChange,
  stakingPaidSince,
  stakingReplaced,
} from '../lib/derive';
import { dayName, fmtBps, fmtDate, fmtDateTime, fmtDelay, fmtDuration, fmtEth, fmtInt, fmtTown, fmtUntil, shortAddress } from '../lib/format';
import { codeUrl, contractUrl, positionUrl, readUrl, tokenUrl } from '../lib/network';

export function Stats() {
  return (
    <div class="wrap page">
      <PageHead title="Stats" lead="The treasury and the running totals, read straight from the contracts." />
      <Treasury />
      <div class="grid-2">
        <EthFlows />
        <TownTotals />
      </div>
      <Staking />
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
        <Fig label="ETH balance" value={fmtEth(t.balance)} unit="ETH" view="eth_getBalance(Treasury)" />
        <Fig label="Owner reserve" value={fmtEth(t.ownerEthAvailable)} unit="ETH" view="Treasury.ownerEthAvailable" note="10% of all ETH in" />
        <Fig label="For stakers" value={fmtEth(forStakers(chain))} unit="ETH" view="balance - ownerEthAvailable" note="balance less the owner reserve" />
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
            The budget of <span class="num">{fmtEth(b.amount)}</span> ETH is under 0.001 ETH, so nothing was paid today. It stays in the treasury and counts
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
  const townStaking = network.deployment?.contracts.TownStaking;
  const replaced = stakingReplaced(chain, townStaking);
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
          <span>{replaced ? 'A replacement contract' : 'TownStaking'}</span>{' '}
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
            The owner replaced TownStaking{since !== null ? ` on ${fmtDate(since)}` : ''}. Every payout from now on goes to this contract, and the Stake page
            offers vaults only in it; what TownStaking already received keeps streaming there.
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
                  {townStaking && t.pendingStaking.toLowerCase() === townStaking.toLowerCase() ? ' (TownStaking again)' : ''}{' '}
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
  if (check.verified)
    return (
      <p class="candidate-mark" data-view="candidate.treasury(), candidate.weth()">
        <span class="verified-tag">Verified</span>{' '}
        <span class="small muted">This site asked it: it names this treasury and WETH, and its code is fixed.</span>
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
      <span class="unverified-tag">Does not look like a staking contract</span>{' '}
      <span class="small muted">This site asked it: {why}. The treasury will refuse it at application.</span>
    </p>
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
        <Fig label="ETH received by the treasury" value={fmtEth(t.totalEthReceived)} unit="ETH" view="Treasury.totalEthReceived" />
        <Fig label="from buy fees" value={fmtEth(hookFeesReceived(chain))} unit="ETH" view="totalEthReceived - TownStaking.totalVaultFees" />
        <Fig label="from vault purchases" value={fmtEth(chain.staking.totalVaultFees)} unit="ETH" view="TownStaking.totalVaultFees" />
        <Fig label="Paid to stakers" value={fmtEth(t.totalDistributed)} unit="WETH" view="Treasury.totalDistributed" accent />
        <Fig label="Withdrawn by the owner" value={fmtEth(t.totalOwnerEthWithdrawn)} unit="ETH" view="Treasury.totalOwnerEthWithdrawn" />
      </Figures>
      <p class="small faint card-foot">
        {unbooked > 0n && (
          <>
            Another <span class="num">{fmtEth(unbooked)}</span> ETH has arrived and is counted at the next treasury action.{' '}
          </>
        )}
        ETH leaves the treasury only two ways: to the current staking contract and the owner’s 10% reserve. “From buy fees” also counts any other ETH sent
        in.
      </p>
      <Verify
        links={[
          { label: 'Treasury', what: 'the Treasury’s running totals', href: contractUrl(network, 'Treasury', 'read') },
          { label: 'staking', what: 'the staking contract’s vault purchases', href: readUrl(network, chain.staking.address) },
        ]}
      />
    </Card>
  );
}

function TownTotals() {
  const chain = useChain();
  const { network } = useApp();
  const r = chain.rewards;
  return (
    <Card title="TOWN">
      <Figures cols={2}>
        <Fig label="Total supply" value={fmtTown(chain.token.totalSupply)} unit="TOWN" view="UpTownToken.totalSupply" />
        <Fig label="Burned" value={fmtTown(burned(chain))} unit="TOWN" view="1,000,000,000 - totalSupply" />
        <Fig label="Left to burn before the floor" value={fmtTown(leftToBurn(chain))} unit="TOWN" view="totalSupply - TownHook.BURN_FLOOR" />
        <Fig label="Rebates emitted" value={fmtTown(r.totalEmitted)} unit="TOWN" view="BuyerRewards.totalEmitted" />
        <Fig label="Rebate reserve remaining" value={fmtTown(reserveUnscheduled(chain))} unit="TOWN" view="RESERVE - totalEmitted" />
        <Fig label="Rebates paid to buyers" value={fmtTown(r.totalPaidToBuyers)} unit="TOWN" view="BuyerRewards.totalPaidToBuyers" accent />
        <Fig label="Claim fees to the treasury" value={fmtTown(r.totalFeesToTreasury)} unit="TOWN" view="BuyerRewards.totalFeesToTreasury" />
      </Figures>
      <p class="small faint card-foot">
        Burned counts sell fees and any voluntary burns. The burn stops at <span class="num">{fmtTown(chain.hook.BURN_FLOOR)}</span> TOWN of supply.
      </p>
      <Verify
        links={[
          { label: 'total supply', what: 'TOWN’s total supply', href: tokenUrl(network, network.deployment?.contracts.UpTownToken) },
          { label: 'reserve balance', what: 'BuyerRewards’ TOWN balance', href: contractUrl(network, 'BuyerRewards') },
          { label: 'rebate totals', what: 'BuyerRewards’ running totals', href: contractUrl(network, 'BuyerRewards', 'read') },
        ]}
      />
    </Card>
  );
}

function Staking() {
  const chain = useChain();
  const { network } = useApp();
  const st = chain.staking;
  const vaults = TIERS.reduce((a, t) => a + st.tierVaults[t], 0);
  const unlock = chain.lpVault.unlockTime;
  return (
    <Card title="Staking and liquidity">
      <p class="small muted card-lead">
        Staking figures come from the contract the treasury pays now,{' '}
        <code data-view="Treasury.staking" title={st.address}>
          {stakingReplaced(chain, network.deployment?.contracts.TownStaking) ? shortAddress(st.address) : 'TownStaking'}
        </code>
        .
      </p>
      <Figures cols={4}>
        <Fig label="TOWN staked" value={fmtTown(st.totalStaked)} unit="TOWN" view="TownStaking.totalStaked" />
        <Fig label="Vaults" value={fmtInt(vaults)} view="sum of TownStaking.tierVaults" />
        <Fig label="WETH received by staking" value={fmtEth(st.totalRewardsNotified)} unit="WETH" view="TownStaking.totalRewardsNotified" />
        <Fig label="WETH claimed by stakers" value={fmtEth(st.totalRewardsPaid)} unit="WETH" view="TownStaking.totalRewardsPaid" />
      </Figures>
      <table class="table compact per-tier">
        <caption class="visually-hidden">Each tier’s figures</caption>
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col" class="r">
              Vaults
            </th>
            <th scope="col" class="r">
              WETH received
            </th>
            <th scope="col" class="r">
              WETH claimed
            </th>
          </tr>
        </thead>
        <tbody>
          {TIERS.map((t) => (
            <tr key={t}>
              <td>Tier {t}</td>
              <td class="r num" data-view={`TownStaking.tierVaults(${t})`}>
                {fmtInt(st.tierVaults[t])}
              </td>
              <td class="r num" data-view={`TownStaking.tierNotified(${t})`}>
                {fmtEth(st.tierNotified[t])}
              </td>
              <td class="r num" data-view={`TownStaking.tierPaid(${t})`}>
                {fmtEth(st.tierPaid[t])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="lock-line">
        <span class="muted">Liquidity locked until</span>
        <strong class="num" data-view="LPVault.unlockTime">
          {fmtDate(unlock)}
        </strong>
        <span class="muted small">({fmtInt(daysUntil(chain, unlock))} days from now; can be extended, never shortened)</span>
      </div>
      <Verify
        links={[
          { label: 'staking totals', what: 'the staking contract’s totals per tier', href: readUrl(network, st.address) },
          { label: 'unlock time', what: 'LPVault’s unlock time', href: contractUrl(network, 'LPVault', 'read') },
          { label: 'position NFT', what: 'the liquidity position NFT', href: positionUrl(network) },
        ]}
      />
    </Card>
  );
}
