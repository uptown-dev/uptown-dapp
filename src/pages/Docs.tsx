import type { ComponentChildren } from 'preact';
import { useApp, useRules, Details, Fig, Figures, Notice, PageHead, Verify } from '../components/ui';
import { OWNER_CANNOT, OWNER_POWERS, ROUTING_NOTE, THINGS_TO_KNOW } from '../content/docs';
import { buyerHookData } from '../lib/reads';
import { afterFeeBps, burnFloor, claimFeeBps, pausePending, rateRange, reserveFeeStart, secondPositionState, stakingChange, stakingReplaced } from '../lib/derive';
import { dayName, fmtBps, fmtDate, fmtDateTime, fmtTown, shortAddress, fmtRate } from '../lib/format';
import { addressUrl, contractUrl, positionUrl, readUrl, secondPositionUrl, tokenUrl } from '../lib/network';
import { RetiredNotice } from '../components/retired';

/** The table of contents, in order (CR-40). Each section is reachable as #/docs/<id>. */
const SECTIONS: { id: string; title: string }[] = [
  { id: 'hook', title: 'SkylineHook' },
  { id: 'rebates', title: 'Rebates for buyers' },
  { id: 'staking', title: 'Staking' },
  { id: 'treasury', title: 'The treasury' },
  { id: 'burn', title: 'The burn' },
  { id: 'launch', title: 'The launch' },
  { id: 'liquidity', title: 'Locked liquidity' },
  { id: 'rules', title: 'Fixed rules' },
  { id: 'owner', title: 'The owner' },
  { id: 'know', title: 'Things to know' },
];

const titleOf = (id: string) => SECTIONS.find((s) => s.id === id)!.title;

export function Docs() {
  const { network, chain, owner } = useApp();
  const positions = chain?.lpVault ?? null;
  // The fixed rules from the contracts, before the launch too (CR-86); the spec's figures only where nothing is deployed.
  const rules = useRules();
  const town = network.deployment?.contracts.UpTownToken;
  const r = rateRange(rules);
  // From this day a SKYLINE sell fee is half burned and half sent to the rebate reserve (CR-93): day 401.
  const fromDay = dayName(reserveFeeStart(rules));
  const floor = fmtTown(burnFloor(rules));
  return (
    <div class="wrap page docs">
      <PageHead title="Docs" lead="How UpTown works, part by part, and what the owner can do. UpTown is an experiment on Ethereum." />
      <div class="docs-layout">
        <nav class="toc" aria-label="Contents">
          <p class="toc-title">Contents</p>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#/docs/${s.id}`}
                  onClick={() => {
                    // The same link twice does not change the address, so scroll here as well.
                    if (window.location.hash === `#/docs/${s.id}`) document.getElementById(`docs-${s.id}`)?.scrollIntoView({ block: 'start' });
                  }}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div class="docs-body">
          <RetiredNotice where="docs" />
          <Section id="hook">
            <ul class="doc-list">
              <li>
                Every trade in the SKYLINE pool on Uniswap v4 passes through SkylineHook, the pool’s hook contract. It has no owner: nobody can change it or switch it off.{' '}
                <Verify inline links={[{ what: 'SkylineHook’s code', href: contractUrl(network, 'SkylineHook', 'code') }]} />
              </li>
              <li>
                <strong>On a buy</strong> it takes 2% of the ETH for the treasury and records how much SKYLINE the buyer received that day. Rebates are paid from
                this record.
              </li>
              <li>
                <strong>On a sell</strong> it takes 2%: burned in SKYLINE, partly sent to the rebate reserve in SKYLINE, or sent to the treasury in ETH, as{' '}
                <a href="#/docs/burn">The burn</a> explains.
              </li>
              <li data-item="no-launch-fee">
                <strong>From the first second</strong> the buy fee is 2%: there is no higher fee at the launch.
              </li>
              <li>
                It accepts exactly two liquidity additions, both in the launch transaction: the launch position and the owner’s second position. It refuses
                every later addition, and it keeps no funds.
              </li>
            </ul>
          </Section>

          <Section id="rebates">
            <ul class="doc-list">
              <li data-item="reserve">
                BuyerRewards holds the rebate reserve: 500,000,000 SKYLINE at launch, half the supply. It counts what it holds, so SKYLINE that reaches it later
                adds to it: from {fromDay} half of every sell fee paid in SKYLINE, at the burn floor 1% of every sell, and any SKYLINE anyone sends it. SKYLINE leaves
                it only through claims.{' '}
                <Verify
                  inline
                  links={[
                    { label: 'SKYLINE balance', what: 'BuyerRewards’ SKYLINE balance', href: contractUrl(network, 'BuyerRewards') },
                    { label: 'running totals', what: 'BuyerRewards’ running totals', href: contractUrl(network, 'BuyerRewards', 'read') },
                  ]}
                />
              </li>
              <li data-item="days">
                Days are calendar days in UTC: each runs from midnight to midnight UTC. Day 1, the launch day, began at launch, so it was shorter than 24
                hours. The header shows today’s day and the time left until the next one begins.
              </li>
              <li>For each day you buy, you can claim the day’s rate of the SKYLINE you bought, from the next day. Rebates never expire.</li>
              <li>
                Each day’s rate is set when the day begins, from the last three days’ trading in the pool, and does not change during the day. It is{' '}
                {fmtBps(r.low)} when buying and selling balance, rising in a straight line to {fmtBps(r.buyTop)} after days of only buying and to{' '}
                {fmtBps(r.high)} after days of only selling. The <a href="#/rewards">Rewards page</a> shows today’s rate and the three-day lean behind it.
              </li>
              <li>
                {fmtBps(claimFeeBps(rules))} of every claim goes to the treasury for the owner, so {fmtRate(afterFeeBps(rules, r.low))} to {fmtRate(afterFeeBps(rules, r.high))}{' '}
                reaches you.
              </li>
              <li data-item="limit">
                Each day has a limit: 2,500,000 SKYLINE a day for the first 100 days, halving every 100 days down to 39,062.5 for days 601 to 700, then
                25,000 SKYLINE a day from day 701 for as long as the reserve has SKYLINE. On a busy day everyone’s rate falls in proportion.
              </li>
              <li data-item="empty">
                A day’s rebates are settled when the day is first claimed. When the reserve runs low, days are paid in the order they are settled. If it is
                empty, rebates pause until SKYLINE arrives, and a day settled while it is empty gets nothing, even if SKYLINE arrives later.
              </li>
            </ul>
          </Section>

          <Section id="staking">
            <ul class="doc-list">
              <li data-item="free">
                Stake SKYLINE in SkylineStaking, for free: there is nothing to buy first and no fee, only the network’s gas.{' '}
                <Verify
                  inline
                  links={[{ what: 'the staking contract’s totals', href: chain ? readUrl(network, chain.staking.address) : contractUrl(network, 'SkylineStaking', 'read') }]}
                />
              </li>
              <li data-item="share">Each daily payout is shared by everyone staked, in proportion to the SKYLINE each address has staked: one pool.</li>
              <li>The WETH streams to stakers over seven days; claim it any time. Unstake any amount at any time: there is no lock and no minimum.</li>
              <li data-item="nft">
                SkylineStaking is temporary. An NFT staking contract for holders of the owner’s “Uptowners” collection replaces it later, through the
                treasury’s 2-day public switch; a stake left in SkylineStaking then earns nothing new and can still be unstaked and claimed.
              </li>
            </ul>
          </Section>

          <Section id="treasury">
            <ul class="doc-list">
              <li>
                The treasury receives SkylineHook’s 2% buy fee, its 2% sell fee on the days it is charged in ETH and 1% of every sell at the burn floor, and
                the claim fees in SKYLINE.{' '}
                <Verify
                  inline
                  links={[
                    { label: 'balance', what: 'the Treasury’s ETH balance', href: contractUrl(network, 'Treasury') },
                    { label: 'reserve and rate', what: 'the Treasury’s owner reserve and payout rate', href: contractUrl(network, 'Treasury', 'read') },
                  ]}
                />
              </li>
              <li>10% of all ETH arriving is kept for the owner. The rest is for stakers.</li>
              <li>
                Once a day it sends a share of the stakers’ ETH (10% at launch; the owner can set 1% to 25%) to the staking contract as WETH: SkylineStaking,
                until the owner replaces it after a 2-day public wait. A share under 0.001 ETH waits for a later day.
              </li>
              <li>ETH leaves only two ways: to the current staking contract and the owner’s 10% reserve.</li>
            </ul>
          </Section>

          <Section id="burn">
            <ul class="doc-list">
              <li>
                1,000,000,000 SKYLINE were minted once; no one can mint more.{' '}
                <Verify inline links={[{ what: 'SKYLINE’s total supply', href: tokenUrl(network, town) }]} />
              </li>
              <li data-item="sell-fee">
                Every sell pays a 2% fee, in SKYLINE, and it is burned. From {fromDay} half of it is burned and the other half goes to the rebate reserve, so
                sells help pay later rebates.
              </li>
              <li data-item="eth-day">
                On a day after one that burned more SKYLINE than it paid out in rebates, the whole 2% goes to the treasury in ETH instead, and nothing is burned
                or sent to the reserve. While the rebate reserve is empty, the fee is in SKYLINE.
              </li>
              <li data-item="floor">
                The burn stops at the floor of {floor} SKYLINE of supply. The sell that reaches the floor pays its whole 2% in SKYLINE: what fits above the
                floor is burned and the rest goes to the rebate reserve. From then on every sell pays 1% in SKYLINE to the rebate reserve and 1% in ETH to the
                treasury.
              </li>
              <li>
                Above the floor the mode is fixed for the whole day. The <a href="#/trade/sell">Trade page</a> and the <a href="#/stats">Stats page</a> show
                how today’s 2% divides and yesterday’s two figures behind it.{' '}
                <Verify inline links={[{ what: 'SkylineHook’s sell-fee mode and burn per day', href: contractUrl(network, 'SkylineHook', 'read') }]} />
              </li>
            </ul>
          </Section>

          <Section id="launch">
            <ul class="doc-list">
              {/* Told in the past once UpTown has launched, in the future before (CR-86). */}
              <li data-item="launch-buy">
                <strong>The launch buy.</strong> In the launch transaction, right after the launch position {chain ? 'was placed' : 'is placed'}, the Launcher{' '}
                {chain ? 'bought' : 'buys'} SKYLINE with 0.1 ETH at the opening price for the owner wallet. It {chain ? 'paid' : 'pays'} the ordinary 2% buy fee
                and is counted for the owner like any buy, so it earns a rebate within the launch day’s limit.{' '}
                <Verify inline links={[{ what: 'the Launcher’s launch-buy figures', href: contractUrl(network, 'Launcher', 'read') }]} />
              </li>
              <li data-item="second-position">
                <strong>The owner’s second position.</strong> Right after the buy, the Launcher {chain ? 'added' : 'adds'} a second, full-range position with
                0.03 ETH and as much of the bought SKYLINE as it {chain ? 'needed' : 'needs'}, locked in LPVault for 14 days; the rest of the bought SKYLINE{' '}
                {chain ? 'went' : 'goes'} to the owner wallet. After the 14 days the owner may withdraw that position. While it is in the pool, the price can dip
                below the opening price by at most what its 0.03 ETH absorbs.
              </li>
              <li data-item="no-launch-fee">
                <strong>No higher fee at the launch.</strong> The buy fee is 2% from the first second, so anyone, bots included, can buy in the launch block at
                the opening price, right after the owner’s launch buy.
              </li>
            </ul>
          </Section>

          <Section id="liquidity">
            <ul class="doc-list">
              <li>At launch the other 500,000,000 SKYLINE form the pool’s launch position.</li>
              <li>
                LPVault holds that position, locked for at least 10 years
                {chain && (
                  <>
                    : until <strong class="num">{fmtDate(chain.lpVault.unlockTime)}</strong>
                  </>
                )}
                .{' '}
                <Verify inline links={[{ what: 'LPVault’s unlock time', href: contractUrl(network, 'LPVault', 'read') }]} />
              </li>
              <li data-item="second-lock">
                LPVault also holds the owner’s second position, locked for 14 days from the launch
                {positions && (
                  <>
                    {secondPositionState(positions, chain!.blockTimestamp) === 'withdrawn' ? (
                      <>: the owner has withdrawn it</>
                    ) : (
                      <>
                        : until <strong class="num">{fmtDate(positions.secondUnlockTime)}</strong>
                      </>
                    )}
                  </>
                )}
                . Then the owner may withdraw it.
              </li>
              <li>
                Each position is an NFT on Uniswap’s v4 PositionManager, owned by LPVault.{' '}
                <Verify
                  inline
                  links={[
                    { label: 'launch position', what: 'the launch position NFT', href: positionUrl(network, owner?.lpVault.tokenId) },
                    { label: 'second position', what: 'the second position NFT', href: secondPositionUrl(network, owner?.lpVault.secondTokenId) },
                  ]}
                />
              </li>
              <li>
                The owner can extend the launch position’s lock, never shorten it, and can collect the 0.5% pool fee from both positions, but cannot remove the
                launch position’s liquidity before its unlock time.
              </li>
            </ul>
          </Section>

          <Section id="rules">
            <ul class="doc-list">
              <li>
                No contract can be upgraded, and trading never pauses. The one moving part: the owner can pause the treasury’s daily payout or point it at a
                new staking contract, each after a 2-day public wait.
              </li>
              <li>The fees are fixed: 2% on buys, 2% on sells, the 0.5% pool fee and the {fmtBps(claimFeeBps(rules))} claim fee.</li>
              <li>The supply, 1,000,000,000 SKYLINE, is fixed.</li>
              <li>
                UpTownToken, SkylineHook, BuyerRewards and SkylineStaking have no owner at all.{' '}
                <Verify
                  inline
                  links={[
                    { label: 'UpTownToken', what: 'UpTownToken’s code', href: contractUrl(network, 'UpTownToken', 'code') },
                    { label: 'SkylineHook', what: 'SkylineHook’s code', href: contractUrl(network, 'SkylineHook', 'code') },
                    { label: 'BuyerRewards', what: 'BuyerRewards’ code', href: contractUrl(network, 'BuyerRewards', 'code') },
                    { label: 'SkylineStaking', what: 'SkylineStaking’s code', href: contractUrl(network, 'SkylineStaking', 'code') },
                  ]}
                />
              </li>
            </ul>
          </Section>

          <Owner />

          <Section id="know">
            <ul class="doc-list">
              {THINGS_TO_KNOW.map((r) => (
                <li key={r.title}>
                  <strong>{r.title}.</strong> {r.body}
                </li>
              ))}
              {/* CR-92 part 1: how a router names the buyer, beside "Buy on this site". */}
              <li data-item="routing">
                <strong>{ROUTING_NOTE.title}.</strong> {codeWords(ROUTING_NOTE.body)} For example, the buyer{' '}
                <code class="break">{ROUTING_NOTE.exampleBuyer}</code> is <code>hookData</code>{' '}
                <code class="break">{buyerHookData(ROUTING_NOTE.exampleBuyer)}</code>.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Text with its code words between backticks, each shown in code style. */
function codeWords(s: string) {
  return s.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

/** One documentation section: a card with its heading, reachable as #/docs/<id>. */
function Section({ id, children }: { id: string; children: ComponentChildren }) {
  return (
    <section class="card doc-section" id={`docs-${id}`} tabIndex={-1} aria-labelledby={`docs-${id}-title`}>
      <div class="card-head">
        <h2 class="card-title" id={`docs-${id}-title`}>
          {titleOf(id)}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Owner() {
  const { chain, network } = useApp();
  const owner = network.deployment?.owner ?? null;
  return (
    <Section id="owner">
      <p class="doc-text">
        One address holds the owner’s powers on LPVault and the Treasury, and makes the single launch call. Ownership can be handed over in two steps but
        not given up.{' '}
        <Verify
          inline
          links={[
            { label: 'LPVault', what: 'LPVault’s owner', href: contractUrl(network, 'LPVault', 'read') },
            { label: 'Treasury', what: 'the Treasury’s owner', href: contractUrl(network, 'Treasury', 'read') },
            { label: 'Launcher', what: 'the Launcher’s owner', href: contractUrl(network, 'Launcher', 'read') },
          ]}
        />
      </p>
      {owner ? (
        <p class="doc-text">
          The owner’s address: <code>{shortAddress(owner)}</code> <Verify inline links={[{ what: 'the owner’s address', href: addressUrl(network, owner) }]} />
        </p>
      ) : (
        <Notice kind="placeholder" title="The owner’s address">
          <p class="small">Published here with the contracts’ addresses.</p>
        </Notice>
      )}

      {/* CR-77 item 7: "What the owner earns", its list, the four owner-income figures and the note
          about the pool fees the contracts keep no total of are all removed. The powers below, their
          worst cases and the owner's address stay. */}

      <h3 class="doc-sub">What the owner can do: the complete list</h3>
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
        <table class="table powers compact">
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
                <td>{p.contract}</td>
                <td>{p.delay}</td>
                <td>{p.worstCase}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="doc-text muted small">
        The owner cannot {OWNER_CANNOT.slice(0, -1).join(', ')} or {OWNER_CANNOT[OWNER_CANNOT.length - 1]}. The owner can pause the stakers’ payouts and
        re-point them to a new staking contract, each only after a 2-day public delay; the <a href="#/stats">Stats page</a> shows every pending change.
      </p>

      <Details summary="Current owner settings">
        {chain ? (
          <Settings />
        ) : (
          <p class="small muted">{network.deployment ? 'Shown once UpTown has launched.' : 'Shown once the contracts are deployed on this network.'}</p>
        )}
      </Details>
    </Section>
  );
}

function Settings() {
  const { chain: read, network } = useApp();
  const chain = read!;
  const t = chain.treasury;
  const v = chain.lpVault;
  const pauseAt = pausePending(chain);
  const change = stakingChange(chain);
  const second = secondPositionState(v, chain.blockTimestamp);
  return (
    <>
      <Figures cols={2}>
        <Fig label="Daily payout rate" value={fmtBps(chain.treasury.spendBps)} view="Treasury.spendBps" note="Settable from 1% to 25%; a change applies from the next day." />
        <Fig label="Launch position locked until" value={fmtDate(v.unlockTime)} view="LPVault.unlockTime" note="Can be extended, never shortened." />
        <Fig
          label="Second position"
          value={second === 'withdrawn' ? 'Withdrawn' : second === 'withdrawable' ? 'Unlocked' : `Locked until ${fmtDate(v.secondUnlockTime)}`}
          view="LPVault.secondUnlockTime, LPVault.secondWithdrawn"
          note={second === 'withdrawn' ? 'The owner has taken it out of LPVault.' : 'The owner may withdraw it once its 14 days have passed.'}
        />
        <Fig
          label="Treasury payouts"
          value={t.paused ? 'Paused' : 'Running'}
          view="Treasury.paused, Treasury.pauseEffectiveAt"
          note={t.paused ? `Paused since ${fmtDateTime(t.pauseEffectiveAt)}.` : pauseAt !== null ? `A pause is announced from ${fmtDateTime(pauseAt)}.` : 'No pause announced.'}
        />
        <Fig
          label="Staking contract paid"
          value={shortAddress(t.staking)}
          view="Treasury.staking, Treasury.pendingStaking"
          note={
            t.pendingStaking && change
              ? change.phase === 'expired'
                ? `${shortAddress(t.pendingStaking)} announced; expired on ${fmtDateTime(change.until)}: the owner must announce again.`
                : `${shortAddress(t.pendingStaking)} announced; can be applied from ${fmtDateTime(change.from)} until ${fmtDateTime(change.until)}${
                    t.candidate
                      ? `${t.candidate.verified ? ' (verified' : ' (does not look like a staking contract'}${t.candidate.upgradeable ? '; upgradeable: its code can change)' : ')'}`
                      : ''
                  }.`
              : stakingReplaced(chain, network.deployment?.contracts.SkylineStaking)
                ? 'A replacement for SkylineStaking; no change announced.'
                : 'SkylineStaking; no change announced.'
          }
        />
      </Figures>
      <Verify
        links={[
          { label: 'payout rate and target', what: 'the Treasury’s payout rate, pause and staking contract', href: contractUrl(network, 'Treasury', 'read') },
          { label: 'unlock times', what: 'LPVault’s unlock times', href: contractUrl(network, 'LPVault', 'read') },
        ]}
      />
    </>
  );
}
