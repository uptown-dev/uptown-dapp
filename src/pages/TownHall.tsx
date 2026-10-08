import { useApp, Term, Panel, PageHero, Notice, Stat, ActionButton, SampleBadge } from '../components/ui';
import { TownHallArt, BellIcon } from '../components/art';
import { budgetState, fountain, tollsAndOtherArrivals } from '../lib/derive';
import { bellName, fmtBps, fmtDateTime, fmtDuration, fmtEth, fmtTown } from '../lib/format';

export function TownHall() {
  const { chain } = useApp();
  const b = budgetState(chain);
  return (
    <>
      <PageHero
        kicker="Town Hall · the Treasury"
        title="The Town Hall"
        lead={
          <>
            Every toll and every rent lands here. One tenth goes into the <Term slug="mayors-purse">Mayor's Purse</Term>; the rest fills the{' '}
            <Term slug="fountain">Fountain</Term>.
          </>
        }
        art={<TownHallArt flowing={b.kind === 'delivered'} />}
      >
        <p class="muted">
          Once a Bell, the Fountain sends a measured share down the <Term slug="aqueduct">Aqueduct</Term> to the Tower as WETH: the stakers' delivery. It goes
          when someone rings the bell, and only if it is at least 0.001 ETH.
        </p>
      </PageHero>

      <section class="section" style="padding-top:0">
        <div class="wrap grid grid-2" style="align-items:start">
          <BellRope />
          <Balances />
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <FundFlows />
        </div>
      </section>

      <section class="section">
        <div class="wrap grid grid-2" style="align-items:start">
          <TownPurse />
          <HallRules />
        </div>
      </section>
    </>
  );
}

function BellRope() {
  const { chain } = useApp();
  const t = chain.treasury;
  const b = budgetState(chain);
  const c = t.currentCycle;
  const wait = t.nextDistributionTime - chain.blockTimestamp;
  return (
    <Panel title="The bell rope">
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="width:54px;flex:none" aria-hidden="true">
          <BellIcon />
        </div>
        <div style="flex:1;min-width:0">
          {b.kind === 'delivered' && (
            <p>
              {bellName(c)} has been rung. Its delivery of <strong class="num">{fmtEth(b.amount)} WETH</strong> has gone down the Aqueduct to the Tower.
            </p>
          )}
          {b.kind === 'below-minimum' && (
            <Notice kind="warn" title="This Bell's budget is under the minimum">
              <p>
                {bellName(c)} has been rung, but its budget of <strong class="num">{fmtEth(b.amount)} ETH</strong> is under the 0.001 ETH minimum, so
                nothing was sent. It stays in the Fountain and counts toward the next Bell's measure. <SampleBadge />
              </p>
            </Notice>
          )}
          {b.kind === 'waiting' && (
            <p>
              Nobody has rung {bellName(c)} yet. A pull of the rope now sets this Bell's budget at about{' '}
              <strong class="num">{fmtEth(b.estimate)} ETH</strong> ({fmtBps(t.spendBps)} of the Fountain) and sends it to the Tower, if it reaches 0.001 ETH.
            </p>
          )}
          <dl class="stats" style="margin:12px 0">
            <Stat
              label={b.kind === 'waiting' ? 'Next delivery can go' : 'Next delivery can go from'}
              value={b.kind === 'waiting' ? 'now' : fmtDateTime(t.nextDistributionTime)}
              view="Treasury.nextDistributionTime"
              note={b.kind === 'waiting' ? undefined : `in ${fmtDuration(wait)}, at the start of ${bellName(c + 1)}`}
            />
          </dl>
          <ActionButton
            label={b.kind === 'waiting' ? 'Pull the bell rope' : `Already rung this Bell`}
            disabled={b.kind !== 'waiting'}
            explain="call poke() on the Town Hall, which sets this Bell's budget and sends the delivery if it is due. It pays you nothing; you pay the gas."
          />
          <p class="small muted" style="margin:10px 0 0">
            Anyone can be the <Term slug="bellringer">Bellringer</Term>. It pays nothing: it is a civic honour, and you pay the gas. Any Tower action (opening
            a vault, adding TOWN, climbing, moving out, collecting) also pulls the rope, so most Bells are rung without anyone visiting this page.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Balances() {
  const { chain } = useApp();
  const t = chain.treasury;
  return (
    <Panel title="In the Town Hall now">
      <dl class="stats">
        <Stat label="ETH balance" value={fmtEth(t.balance)} unit="ETH" view="eth_getBalance(Treasury)" big />
        <Stat label="Mayor's Purse (owner reserve)" value={fmtEth(t.ownerEthAvailable)} unit="ETH" view="Treasury.ownerEthAvailable" />
        <Stat label="The Fountain (balance less the Purse)" value={fmtEth(fountain(chain))} unit="ETH" view="balance - ownerEthAvailable" gold />
        <Stat label="The valve: share of the Fountain sent each Bell" value={fmtBps(t.spendBps)} view="Treasury.spendBps" note="The owner can set 1% to 25%; a change applies from the next Bell." />
        <Stat
          label={`Budget of the latest rung Bell`}
          value={fmtEth(t.budget)}
          unit="ETH"
          view="Treasury.budget"
          note={t.lastDistributedCycle === null ? 'No delivery has been sent yet.' : `Last delivery sent in ${bellName(t.lastDistributedCycle)}.`}
        />
      </dl>
    </Panel>
  );
}

function Bar({ label, value, max, color, view }: { label: string; value: bigint; max: bigint; color: string; view: string }) {
  const pct = max > 0n ? Number((value * 1000n) / max) / 10 : 0;
  return (
    <div style="display:grid;gap:4px">
      <div style="display:flex;justify-content:space-between;gap:12px;font-size:0.92rem;flex-wrap:wrap">
        <span class="muted">{label}</span>
        <strong class="num" data-view={view}>
          {fmtEth(value)} ETH
        </strong>
      </div>
      <div style="height:12px;background:rgba(201,196,184,0.12);border-radius:6px;overflow:hidden">
        <div style={`height:100%;width:${Math.max(pct, value > 0n ? 1 : 0)}%;background:${color};border-radius:6px`} />
      </div>
    </div>
  );
}

function FundFlows() {
  const { chain } = useApp();
  const t = chain.treasury;
  const tolls = tollsAndOtherArrivals(chain);
  const rent = chain.staking.totalVaultFees;
  const booked = t.totalEthReceived - t.totalDistributed - t.totalOwnerEthWithdrawn;
  const unbooked = t.balance > booked ? t.balance - booked : 0n;
  const max = t.totalEthReceived + unbooked;
  return (
    <Panel title="Where the ETH has come from and gone, since launch">
      <div class="grid grid-2">
        <div style="display:grid;gap:14px;align-content:start">
          <h4 style="margin:0">Arrived</h4>
          <Bar label="Gate tolls (including the Dawn Toll) and any gifts" value={tolls} max={max} color="#e9b44c" view="totalEthReceived - TownStaking.totalVaultFees" />
          <Bar label="Rent from the Tower" value={rent} max={max} color="#f4d690" view="TownStaking.totalVaultFees" />
          <Bar label="Total entered in the books" value={t.totalEthReceived} max={max} color="#c9c4b8" view="Treasury.totalEthReceived" />
          {unbooked > 0n && (
            <p class="small muted" style="margin:0">
              Another <span class="num">{fmtEth(unbooked)}</span> ETH has arrived since the Town Hall last updated its books; it is entered at the next pull of
              the rope or other Town Hall action. The Purse already counts its 10%.
            </p>
          )}
        </div>
        <div style="display:grid;gap:14px;align-content:start">
          <h4 style="margin:0">Left</h4>
          <Bar label="WETH delivered to the Tower" value={t.totalDistributed} max={max} color="#8fb3e8" view="Treasury.totalDistributed" />
          <Bar label="Withdrawn by the owner from the Purse" value={t.totalOwnerEthWithdrawn} max={max} color="#e07258" view="Treasury.totalOwnerEthWithdrawn" />
          <Bar label="Still in the Town Hall" value={t.balance} max={max} color="#6d76c4" view="eth_getBalance(Treasury)" />
        </div>
      </div>
      <p class="small faint" style="margin:14px 0 0">
        ETH can leave the Town Hall by exactly two doors: the deliveries to the Tower and the owner's withdrawals from the Purse. <SampleBadge />
      </p>
    </Panel>
  );
}

function TownPurse() {
  const { chain } = useApp();
  const t = chain.treasury;
  return (
    <Panel title="The Purse's TOWN: claim fees">
      <dl class="stats">
        <Stat label="Claim fees received from the Granary" value={fmtTown(chain.rewards.totalFeesToTreasury)} unit="TOWN" view="BuyerRewards.totalFeesToTreasury" />
        <Stat label="Withdrawn by the owner" value={fmtTown(t.totalTownWithdrawn)} unit="TOWN" view="Treasury.totalTownWithdrawn" />
        <Stat label="In the Purse now" value={fmtTown(t.ownerTownAvailable)} unit="TOWN" view="Treasury.ownerTownAvailable" gold />
      </dl>
      <p class="small muted" style="margin:14px 0 0">
        All TOWN in the Town Hall belongs to the owner: it is the 5% fee on every rebate claim. See <a href="#/mayor">the Mayor's page</a> for all of the
        owner's income.
      </p>
    </Panel>
  );
}

function HallRules() {
  return (
    <Panel title="The Town Hall's rules" sample={false}>
      <ul style="padding-left:1.1em;margin:0">
        <li>10% of every ETH arriving (tolls, the Dawn Toll, rent, gifts) is set aside for the owner. The rest fills the Fountain.</li>
        <li>Once a Bell, the first pull of the rope sets the Bell's budget: the valve's share of the Fountain. A Bell's budget never changes once set.</li>
        <li>The budget goes to the Tower as WETH in the same pull, if it is at least 0.001 ETH. A smaller budget stays and counts toward the next Bell.</li>
        <li>Each Bell delivers at most once. A second pull in the same Bell does nothing.</li>
        <li>The owner can turn the valve between 1% and 25%. 25% is carved in stone. A change applies from the next Bell.</li>
        <li>Deliveries depend on what arrives here, which depends on trading. They can fall to nothing.</li>
      </ul>
    </Panel>
  );
}
