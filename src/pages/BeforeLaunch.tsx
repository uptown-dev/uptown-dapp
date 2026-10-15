// DEPLOYED, NOT LAUNCHED (CR-86, task F12a). Between mainnet's two phases the seven contracts exist
// on Ethereum but there is no pool, no liquidity and no clock. The site knows it from the contracts
// themselves (`Launcher.launched()` is false), never from its address file, and in that window shows:
//   - the seven real addresses with their explorer links, the supply and the fixed rules;
//   - one clear line that the contracts are live and the pool opens soon (Home);
//   - buying, selling, staking and claiming switched off, each with one plain sentence;
//   - nothing that only exists after the launch: no price, no dollar figure that needs the pool,
//     no day number or countdown, no rebate or treasury figure. Absent, never zero.
// Every figure here comes from a view that means the same before the launch as after it (reads.ts,
// `PrelaunchState`): constants, settings, the supply and the Launcher's balance.
//
// Beside every explorer link the site says, in a few words, that the source is published shortly
// before the pool opens (CR-98 as amended): until then the explorer may show the code unverified.
import type { ComponentChildren } from 'preact';
import { Card, Fig, Figures, Notice, PageHead, SourceNote, Verify, useApp, useBeforeLaunch } from '../components/ui';
import { CONTRACT_NAMES, TIERS, type FixedRules, type PrelaunchState } from '../data/types';
import { rateRange, tierMultiplier, tierShareBps } from '../lib/derive';
import { dayName, fmtBps, fmtDuration, fmtEth, fmtInt, fmtTown } from '../lib/format';
import { addressUrl, contractUrl, readUrl, tokenUrl } from '../lib/network';
import { Rules, Schedule } from './Rewards';
import { StakeDetails } from './Stake';

/** The network named in a sentence: "Ethereum", "Sepolia", "the local test chain". */
export function inSentence(n: { name: string; local: boolean }): string {
  return n.local ? `the ${n.name.toLowerCase()}` : n.name;
}

/** The one line on the home page between the phases (CR-86 item 2). */
export function launchLine(n: { name: string; local: boolean }): string {
  return `UpTown’s contracts are live on ${inSentence(n)}. The pool opens soon: trading, rebates and staking start at the launch.`;
}

/** Each switched-off action's sentence (CR-86 item 2: "one plain sentence saying the pool is not open yet"). */
export const OFF = {
  buy: 'Buying starts when the pool opens at the launch.',
  sell: 'Selling starts when the pool opens at the launch.',
  stake: 'Vaults open at the launch, when TOWN can first be bought.',
  claim: 'Rebates are earned by buys in the pool, so there is nothing to claim before the launch.',
} as const;

/** A switched-off action: its button, disabled, and the sentence that says why. */
export function OffAction({ label, why, id }: { label: string; why: string; id: string }) {
  return (
    <div class="off-action" data-off={id}>
      <button type="button" class="btn btn-primary" disabled aria-describedby={`off-${id}`}>
        {label}
      </button>
      <p class="small muted" id={`off-${id}`}>
        {why}
      </p>
    </div>
  );
}

/** A length of time in years when it is a whole number of 365-day years ("10 years"), else in days. */
export function fmtYears(seconds: number): string {
  const days = seconds / 86_400;
  if (days % 365 === 0) return `${fmtInt(days / 365)} year${days === 365 ? '' : 's'}`;
  return `${fmtInt(Math.round(days))} days`;
}

/**
 * The seven contracts in full, each linked to the explorer (CR-86: "the contract addresses ... with
 * their links to Etherscan"). Full addresses, never shortened, so a lookalike cannot pass for one.
 */
export function ContractList() {
  const { network } = useApp();
  const before = useBeforeLaunch();
  const d = network.deployment;
  if (!d) return null;
  return (
    <>
      <ul class="contract-list">
        {CONTRACT_NAMES.map((name) => {
          const a = d.contracts[name];
          const href = addressUrl(network, a);
          return (
            <li key={name} data-contract={name}>
              <span class="contract-name">{name}</span>
              {href ? (
                <a class="contract-addr" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name}, ${a}, on ${network.explorerName} (opens in a new tab)`}>
                  <code class="break">{a}</code>
                </a>
              ) : (
                <code class="break contract-addr">{a}</code>
              )}
            </li>
          );
        })}
      </ul>
      {network.explorer ? (
        before && (
          <p class="small faint">
            Each address opens on {network.explorerName}. <SourceNote />
          </p>
        )
      ) : (
        <p class="small faint">No block explorer on the {network.name.toLowerCase()}, so these are not links.</p>
      )}
    </>
  );
}

/** The supply and where it sits: every TOWN is in the Launcher until the launch (UpTownToken.totalSupply, balanceOf(Launcher)). */
function SupplyFigures({ p }: { p: PrelaunchState }) {
  const all = p.launcherBalance === p.token.totalSupply;
  return (
    <Figures cols={2}>
      <Fig label="Total supply" value={fmtTown(p.token.totalSupply)} unit="TOWN" view="UpTownToken.totalSupply" note="minted once, never more" />
      <Fig
        label="Held by the Launcher"
        value={fmtTown(p.launcherBalance)}
        unit="TOWN"
        view="UpTownToken.balanceOf(Launcher)"
        note={all ? 'every TOWN, until the launch' : 'of the supply, until the launch'}
      />
    </Figures>
  );
}

/** The Home page's card between the phases, in place of the running totals ("So far"), which start at the launch. */
export function HomeContracts({ p }: { p: PrelaunchState }) {
  const { network } = useApp();
  return (
    <Card title={<span id="live-title">The contracts</span>}>
      <p class="small muted card-lead">
        Deployed on {inSentence(network)} and waiting for the launch. At the launch, 500,000,000 TOWN go into the pool, locked for{' '}
        {fmtYears(p.lpVault.lockDuration)}, and 500,000,000 TOWN into the rebate reserve.
      </p>
      <SupplyFigures p={p} />
      <ContractList />
      <Verify
        links={[
          { label: 'TOWN supply', what: 'TOWN’s total supply', href: tokenUrl(network, network.deployment?.contracts.UpTownToken) },
          { label: 'Launcher', what: 'the Launcher, which holds every TOWN until the launch', href: contractUrl(network, 'Launcher') },
        ]}
      />
    </Card>
  );
}

/** The notice every page shows between the phases: the pool is not open yet, and what that means here. */
function NotOpen({ children }: { children: ComponentChildren }) {
  return (
    <Notice kind="info" title="The pool is not open yet">
      <p>{children}</p>
    </Notice>
  );
}

/**
 * Before the launch, every TOWN is in the Launcher, so a TOWN pool or a token offered as TOWN
 * elsewhere is not UpTown's (CR-86 "Why this is worth the work"). Said only while the chain shows it.
 */
function NotOursYet({ p }: { p: PrelaunchState }) {
  const { network } = useApp();
  const town = network.deployment?.contracts.UpTownToken;
  if (p.launcherBalance !== p.token.totalSupply) return null;
  return (
    <Notice kind="warn" title="No TOWN is traded anywhere yet">
      <p>
        Every TOWN is held by the Launcher until the launch, and the official pool is opened by the launch itself, through TownHook. A TOWN pool, or a
        token offered as TOWN, before then is not UpTown’s. TOWN’s address: <code class="break">{town}</code>.
      </p>
    </Notice>
  );
}

/** Trade between the phases: no price, no quote, both actions off. */
export function TradeBeforeLaunch({ p }: { p: PrelaunchState }) {
  const { network } = useApp();
  return (
    <div class="wrap page narrow" data-state="not-launched">
      <PageHead title="Trade TOWN" lead="Buy or sell TOWN for ETH, from the launch." />
      <NotOpen>Buying and selling start at the launch, when the official TOWN pool opens. Until then there is nothing to trade here.</NotOpen>
      <section class="card swap-card" aria-label="Trade TOWN">
        <OffAction id="buy" label="Buy TOWN" why={OFF.buy} />
        <OffAction id="sell" label="Sell TOWN" why={OFF.sell} />
      </section>
      <NotOursYet p={p} />
      <FeeRules rules={p} />
      <Verify links={[{ what: 'TownHook’s code (the fees)', href: contractUrl(network, 'TownHook', 'code') }]} />
    </div>
  );
}

/** The trading fees, fixed in TownHook, from its constants. */
function FeeRules({ rules }: { rules: FixedRules }) {
  return (
    <Card title="Fees, fixed in TownHook">
      <ul class="plain-list">
        <li>
          <strong>Buy.</strong> {fmtBps(rules.hook.BUY_FEE_BPS)} of the ETH, to the treasury. In the first {fmtInt(rules.hook.ANTI_SNIPE_DURATION / 60)} minutes
          after the launch it starts at {fmtBps(rules.hook.ANTI_SNIPE_START_BPS)} and falls in a straight line to {fmtBps(rules.hook.BUY_FEE_BPS)}.
        </li>
        <li>
          <strong>Sell.</strong> 2% of every sell: burned in TOWN, or sent to the treasury in ETH, decided each day by the contract; from{' '}
          {dayName(rules.hook.RESERVE_FEE_START)} half of a TOWN fee goes to the rebate reserve, and once only {fmtTown(rules.hook.BURN_FLOOR)} TOWN remain
          every sell pays 1% in TOWN to the reserve and 1% in ETH.
        </li>
        <li>
          <strong>Pool.</strong> The pool’s 0.5% trading fee goes to the locked liquidity.
        </li>
      </ul>
    </Card>
  );
}

/** Rewards between the phases: the rules and the schedule, claiming off; no day, no rate of the day, no reserve. */
export function RewardsBeforeLaunch({ p }: { p: PrelaunchState }) {
  const { network } = useApp();
  const r = rateRange(p);
  return (
    <div class="wrap page" data-state="not-launched">
      <PageHead
        title="Rewards"
        lead={`Every buy earns a TOWN rebate: ${fmtBps(r.low)} to ${fmtBps(r.high)} of the TOWN you bought, set each day by the last three days’ trading, less a ${fmtBps(p.rewards.CLAIM_FEE_BPS)} claim fee, claimable the next day within each day’s limit.`}
      />
      <NotOpen>Rebates start with the launch: the launch day is the first day buys are counted, and it can be claimed from the next midnight UTC.</NotOpen>
      <Card title="Claim">
        <OffAction id="claim" label="Claim rebates" why={OFF.claim} />
      </Card>
      <Card title="How rebates work">
        <Rules rules={p} before />
      </Card>
      <Card>
        <Schedule rules={p} current={null} />
      </Card>
      <Verify links={[{ what: 'BuyerRewards’ rates and limits', href: contractUrl(network, 'BuyerRewards', 'read') }]} />
    </div>
  );
}

/** Stake between the phases: the five tiers (multiplier, dollar price, share), opening off; no ETH price, no totals. */
export function StakeBeforeLaunch({ p }: { p: PrelaunchState }) {
  const { network } = useApp();
  return (
    <div class="wrap page" data-state="not-launched">
      <PageHead
        title="Stake"
        lead="Buy a vault in one of five tiers, put TOWN in it and earn a share of the ETH the treasury pays out every day, as WETH."
      />
      <NotOpen>Staking starts at the launch. Until then every TOWN is held by the Launcher, so there is nothing to stake.</NotOpen>
      <Card title="Tiers" class="flush">
        <p class="card-pad small muted">The five vault tiers in TownStaking, fixed in the contract. Vault prices are set in dollars and paid in ETH.</p>
        <div class="table-scroll">
          <table class="table tiers stack">
            <caption class="visually-hidden">The five vault tiers</caption>
            <thead>
              <tr>
                <th scope="col">Tier</th>
                <th scope="col" class="r">
                  Multiplier
                </th>
                <th scope="col" class="r">
                  Vault price
                </th>
                <th scope="col" class="r">
                  Share of daily ETH
                </th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t}>
                  <th scope="row" class="tier-name">
                    Tier {t}
                  </th>
                  <td class="r num" data-label="Multiplier" data-view={`TownStaking.tierWeight(${t})`}>
                    {tierMultiplier(p, t)}
                  </td>
                  <td class="r num" data-label="Vault price" data-view={`TownStaking.tierUsd(${t})`}>
                    ${p.staking.tierUsd[t]}
                  </td>
                  <td class="r num" data-label="Share of daily ETH">
                    {fmtBps(tierShareBps(p, t))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="card-pad">
          <OffAction id="stake" label="Open a vault" why={OFF.stake} />
        </div>
      </Card>
      <StakeDetails />
      <Verify links={[{ what: 'the staking contract’s tiers', href: readUrl(network, p.staking.address) }]} />
    </div>
  );
}

/** Stats between the phases: the contracts, the supply and the settings; the running totals start at the launch. */
export function StatsBeforeLaunch({ p }: { p: PrelaunchState }) {
  const { network } = useApp();
  return (
    <div class="wrap page" data-state="not-launched">
      <PageHead title="Stats" lead="The contracts, the supply and the fixed settings, read straight from the contracts. The running totals start at the launch." />
      <NotOpen>The treasury, the trading volume, the burn, the rebates and staking are counted from the launch, so their figures appear here then.</NotOpen>
      <Card title="Contracts">
        <ContractList />
      </Card>
      <div class="grid-2">
        <Card title="TOWN">
          <SupplyFigures p={p} />
          <p class="small faint card-foot">
            The burn stops at <span class="num">{fmtTown(p.hook.BURN_FLOOR)}</span> TOWN of supply. At the launch, 500,000,000 TOWN go into the pool and
            500,000,000 TOWN into the rebate reserve.
          </p>
          <Verify links={[{ label: 'total supply', what: 'TOWN’s total supply', href: tokenUrl(network, network.deployment?.contracts.UpTownToken) }]} />
        </Card>
        <Card title="Settings">
          <Figures cols={2}>
            <Fig label="Daily payout rate" value={fmtBps(p.treasury.spendBps)} view="Treasury.spendBps" note={`of the treasury’s ETH each day; settable from 1% to ${fmtBps(p.treasury.MAX_SPEND_BPS)}`} />
            <Fig label="Owner’s share" value={fmtBps(p.treasury.OWNER_ETH_BPS)} view="Treasury.OWNER_ETH_BPS" note="of all ETH the treasury receives" />
            <Fig label="Smallest payout" value={fmtEth(p.treasury.MIN_DISTRIBUTION)} unit="ETH" view="Treasury.MIN_DISTRIBUTION" note="a smaller day’s budget waits" />
            <Fig label="Notice before an owner change" value={p.treasury.OWNER_DELAY % 86_400 === 0 ? `${fmtInt(p.treasury.OWNER_DELAY / 86_400)} days` : fmtDuration(p.treasury.OWNER_DELAY)} view="Treasury.OWNER_DELAY" note="replacing the staking contract or pausing payouts" />
            <Fig label="Liquidity lock" value={fmtYears(p.lpVault.lockDuration)} view="LPVault.lockDuration" note="counted from the launch; can be extended, never shortened" />
          </Figures>
          <Verify
            links={[
              { label: 'Treasury', what: 'the Treasury’s settings', href: contractUrl(network, 'Treasury', 'read') },
              { label: 'LPVault', what: 'LPVault’s lock length', href: contractUrl(network, 'LPVault', 'read') },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
