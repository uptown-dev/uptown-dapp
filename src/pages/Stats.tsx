import { useApp, Term, Panel, PageHero, Stat, SampleBadge } from '../components/ui';
import { FurnaceArt, FoundationArt } from '../components/art';
import { FLOORS } from '../content/town';
import { TIERS } from '../data/types';
import { burned, daysUntil, leftToBurn, reserveUnscheduled, tollsAndOtherArrivals } from '../lib/derive';
import { bellName, fmtDate, fmtEth, fmtInt, fmtTown } from '../lib/format';

export function Stats() {
  const { chain } = useApp();
  return (
    <>
      <PageHero
        kicker="The Records · stats"
        title="The Records"
        lead={<>Up here, everything's on the record. Every figure on this page is read straight from the contracts: a running total or a balance.</>}
        art={<FurnaceArt cold={chain.hook.currentSellFeeBps === 0} title="The Furnace" />}
      />
      <section class="section" style="padding-top:0">
        <div class="wrap grid grid-2" style="align-items:start">
          <Bricks />
          <Granary />
        </div>
      </section>
      <section class="section">
        <div class="wrap">
          <TowerBook />
        </div>
      </section>
      <section class="section">
        <div class="wrap grid grid-2" style="align-items:start">
          <Hall />
          <Foundation />
        </div>
      </section>
    </>
  );
}

function Bricks() {
  const { chain } = useApp();
  const b = burned(chain);
  const span = chain.token.INITIAL_SUPPLY - chain.hook.BURN_FLOOR;
  const pct = span > 0n ? Number((b * 10_000n) / span) / 100 : 0;
  return (
    <Panel title="Bricks and the Furnace">
      <dl class="stats">
        <Stat label="TOWN in existence" value={fmtTown(chain.token.totalSupply)} unit="TOWN" view="UpTownToken.totalSupply" />
        <Stat label="TOWN burned in total" value={fmtTown(b)} unit="TOWN" view="INITIAL_SUPPLY - totalSupply" note="Sell fees and any voluntary burns together." />
        <Stat
          label={
            <>
              Left to burn before the <Term slug="cornerstone">Cornerstone Million</Term>
            </>
          }
          value={fmtTown(leftToBurn(chain))}
          unit="TOWN"
          view="totalSupply - TownHook.BURN_FLOOR"
          gold
        />
      </dl>
      <div style="margin-top:16px" aria-hidden="true">
        <div style="height:12px;background:rgba(201,196,184,0.12);border-radius:6px;overflow:hidden">
          <div style={`height:100%;width:${Math.max(pct, b > 0n ? 0.5 : 0)}%;background:linear-gradient(90deg,#b5462f,#ff8a3d)`} />
        </div>
      </div>
      <p class="small muted" style="margin:8px 0 0">
        {pct.toFixed(2)}% of the way from a billion to the Cornerstone. Every sell burns 2% of the TOWN sold until supply reaches 1,000,000 TOWN; after
        that, sells pay no Gate fee. Nobody can know when, or whether, that day comes.
      </p>
    </Panel>
  );
}

function Granary() {
  const { chain } = useApp();
  const r = chain.rewards;
  return (
    <Panel title="The Granary">
      <dl class="stats">
        <Stat label="TOWN set aside for Bells (emitted)" value={fmtTown(r.totalEmitted)} unit="TOWN" view="BuyerRewards.totalEmitted" />
        <Stat label="Not yet set aside (remaining)" value={fmtTown(reserveUnscheduled(chain))} unit="TOWN" view="RESERVE - totalEmitted" gold />
        <Stat label="Rebates paid to buyers" value={fmtTown(r.totalPaidToBuyers)} unit="TOWN" view="BuyerRewards.totalPaidToBuyers" />
        <Stat label="Claim fees collected for the owner" value={fmtTown(r.totalFeesToTreasury)} unit="TOWN" view="BuyerRewards.totalFeesToTreasury" />
        <Stat label="Claimed in total, before the fee" value={fmtTown(r.totalClaimedGross)} unit="TOWN" view="BuyerRewards.totalClaimedGross" />
      </dl>
      <p class="small muted" style="margin:14px 0 0">
        Set-aside rebates that nobody claims stay in the Granary, so "set aside" and "claimed" drift apart over time.
      </p>
    </Panel>
  );
}

function TowerBook() {
  const { chain } = useApp();
  const st = chain.staking;
  const vaults = TIERS.reduce((a, t) => a + st.tierVaults[t], 0);
  return (
    <Panel title="The Tower's books">
      <dl class="stats" style="margin-bottom:16px">
        <Stat label="TOWN stored in the Tower" value={fmtTown(st.totalStaked)} unit="TOWN" view="TownStaking.totalStaked" />
        <Stat label="Open vaults" value={fmtInt(vaults)} view="sum of TownStaking.tierVaults(tier)" />
        <Stat label="WETH received from the Town Hall" value={fmtEth(st.totalRewardsNotified)} unit="WETH" view="TownStaking.totalRewardsNotified" />
        <Stat label="WETH collected by Residents" value={fmtEth(st.totalRewardsPaid)} unit="WETH" view="TownStaking.totalRewardsPaid" gold />
      </dl>
      <div class="table-wrap">
        <table class="data stack">
          <caption class="visually-hidden">Each floor's figures</caption>
          <thead>
            <tr>
              <th scope="col">Floor</th>
              <th scope="col" class="num">
                Vaults
              </th>
              <th scope="col" class="num">
                TOWN stored
              </th>
              <th scope="col" class="num">
                WETH received
              </th>
              <th scope="col" class="num">
                WETH collected
              </th>
            </tr>
          </thead>
          <tbody>
            {[...TIERS].reverse().map((t) => (
              <tr key={t}>
                <td data-label="Floor">
                  {t}. {FLOORS[t].name}
                </td>
                <td data-label="Vaults" class="num" data-view={`TownStaking.tierVaults(${t})`}>
                  {fmtInt(st.tierVaults[t])}
                </td>
                <td data-label="TOWN stored" class="num" data-view={`TownStaking.tierStaked(${t})`}>
                  {fmtTown(st.tierStaked[t])}
                </td>
                <td data-label="WETH received" class="num" data-view={`TownStaking.tierNotified(${t})`}>
                  {fmtEth(st.tierNotified[t])}
                </td>
                <td data-label="WETH collected" class="num" data-view={`TownStaking.tierPaid(${t})`}>
                  {fmtEth(st.tierPaid[t])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Hall() {
  const { chain } = useApp();
  const t = chain.treasury;
  return (
    <Panel title="The Town Hall">
      <dl class="stats">
        <Stat label="ETH received in total" value={fmtEth(t.totalEthReceived)} unit="ETH" view="Treasury.totalEthReceived" />
        <Stat label="of which Gate tolls and gifts" value={fmtEth(tollsAndOtherArrivals(chain))} unit="ETH" view="totalEthReceived - totalVaultFees" />
        <Stat label="of which rent from the Tower" value={fmtEth(chain.staking.totalVaultFees)} unit="ETH" view="TownStaking.totalVaultFees" />
        <Stat label="WETH delivered to the Tower" value={fmtEth(t.totalDistributed)} unit="WETH" view="Treasury.totalDistributed" gold />
        <Stat label="ETH withdrawn by the owner" value={fmtEth(t.totalOwnerEthWithdrawn)} unit="ETH" view="Treasury.totalOwnerEthWithdrawn" />
        <Stat label="TOWN withdrawn by the owner" value={fmtTown(t.totalTownWithdrawn)} unit="TOWN" view="Treasury.totalTownWithdrawn" />
      </dl>
    </Panel>
  );
}

function Foundation() {
  const { chain } = useApp();
  const unlock = chain.lpVault.unlockTime;
  const sealBell = Math.floor((unlock - chain.hook.launchTime) / 86_400);
  return (
    <Panel title="The Sealed Foundation">
      <div style="max-width:220px;margin-bottom:10px">
        <FoundationArt />
      </div>
      <dl class="stats">
        <Stat label="The liquidity lock ends no earlier than" value={fmtDate(unlock)} view="LPVault.unlockTime" gold note={`${bellName(sealBell)}, ${fmtInt(daysUntil(chain, unlock))} days from now`} />
      </dl>
      <p class="small muted" style="margin:14px 0 0">
        The pool's liquidity position is locked in LPVault until then. The owner can lengthen the lock, never shorten it, and can collect the pool's trading
        fees meanwhile. <SampleBadge />
      </p>
    </Panel>
  );
}
