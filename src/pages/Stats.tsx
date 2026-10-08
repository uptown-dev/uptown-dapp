import { useApp, ActionButton, Card, Fig, Figures, Notice, PageHead, Verify } from '../components/ui';
import { TIERS } from '../data/types';
import { budgetState, burned, daysUntil, forStakers, hookFeesReceived, leftToBurn, reserveUnscheduled } from '../lib/derive';
import { dayName, fmtBps, fmtDate, fmtDateTime, fmtDuration, fmtEth, fmtInt, fmtTown } from '../lib/format';
import { contractUrl, positionUrl, tokenUrl } from '../lib/network';

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
  const { chain, network } = useApp();
  const t = chain.treasury;
  const b = budgetState(chain);
  const c = t.currentCycle;
  const wait = t.nextDistributionTime - chain.blockTimestamp;
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
          value={b.kind === 'waiting' ? `≈ ${fmtEth(b.estimate)}` : fmtEth(b.amount)}
          unit="ETH"
          view={b.kind === 'waiting' ? 'derived: (balance - ownerEthAvailable) × spendBps' : 'Treasury.budget'}
          accent
          note={b.kind === 'paid' ? 'Paid to stakers.' : b.kind === 'below-minimum' ? 'Under 0.001 ETH: waits for a later day.' : 'Not yet triggered.'}
        />
        <Fig
          label="Next payout"
          value={b.kind === 'waiting' ? 'Now' : `in ${fmtDuration(wait)}`}
          view="Treasury.nextDistributionTime"
          note={b.kind === 'waiting' ? 'Anyone can trigger it.' : `${fmtDateTime(t.nextDistributionTime)}, the start of ${dayName(c + 1)}`}
        />
      </Figures>
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
        <ActionButton
          label={b.kind === 'waiting' ? 'Trigger payout' : 'Already triggered today'}
          variant="secondary"
          disabled={b.kind !== 'waiting'}
          explain="call poke() on the treasury, which sets the day’s budget and pays it to stakers if it is due and at least 0.001 ETH."
        />
      </div>
      <Verify
        links={[
          { label: 'balance', what: 'the Treasury’s ETH balance', href: contractUrl(network, 'Treasury') },
          { label: 'reserve, rate and budget', what: 'the Treasury’s owner reserve, payout rate and budget', href: contractUrl(network, 'Treasury', 'read') },
        ]}
      />
    </Card>
  );
}

function EthFlows() {
  const { chain, network } = useApp();
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
        ETH leaves the treasury only two ways: payouts to stakers and the owner’s 10% reserve. “From buy fees” also counts any other ETH sent in.
      </p>
      <Verify
        links={[
          { label: 'Treasury', what: 'the Treasury’s running totals', href: contractUrl(network, 'Treasury', 'read') },
          { label: 'TownStaking', what: 'TownStaking’s vault purchases', href: contractUrl(network, 'TownStaking', 'read') },
        ]}
      />
    </Card>
  );
}

function TownTotals() {
  const { chain, network } = useApp();
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
      <p class="small faint card-foot">Burned counts sell fees and any voluntary burns. The burn stops at 1,000,000 TOWN of supply.</p>
      <Verify
        links={[
          { label: 'total supply', what: 'TOWN’s total supply', href: tokenUrl(network, network.deployment.contracts.UpTownToken) },
          { label: 'reserve balance', what: 'BuyerRewards’ TOWN balance', href: contractUrl(network, 'BuyerRewards') },
          { label: 'rebate totals', what: 'BuyerRewards’ running totals', href: contractUrl(network, 'BuyerRewards', 'read') },
        ]}
      />
    </Card>
  );
}

function Staking() {
  const { chain, network } = useApp();
  const st = chain.staking;
  const vaults = TIERS.reduce((a, t) => a + st.tierVaults[t], 0);
  const unlock = chain.lpVault.unlockTime;
  return (
    <Card title="Staking and liquidity">
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
          { label: 'staking totals', what: 'TownStaking’s totals per tier', href: contractUrl(network, 'TownStaking', 'read') },
          { label: 'unlock time', what: 'LPVault’s unlock time', href: contractUrl(network, 'LPVault', 'read') },
          { label: 'position NFT', what: 'the liquidity position NFT', href: positionUrl(network) },
        ]}
      />
    </Card>
  );
}
