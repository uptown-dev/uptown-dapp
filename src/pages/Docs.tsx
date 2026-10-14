import type { ComponentChildren } from 'preact';
import { useApp, Details, Fig, Figures, Notice, PageHead, Verify } from '../components/ui';
import { OWNER_CANNOT, OWNER_POWERS, ROUTING_NOTE, THINGS_TO_KNOW } from '../content/docs';
import { buyerHookData } from '../lib/reads';
import { PriceSource } from '../data/types';
import { afterFeeBps, burnFloor, claimFeeBps, fallbackExpiresAt, pausePending, rateRange, reserveFeeStart, stakingChange, stakingReplaced } from '../lib/derive';
import { dayName, fmtBps, fmtDate, fmtDateTime, fmtTown, fmtUsd8, shortAddress, fmtRate } from '../lib/format';
import { addressUrl, contractUrl, positionUrl, readUrl, tokenUrl } from '../lib/network';

/** The table of contents, in order (CR-40). Each section is reachable as #/docs/<id>. */
const SECTIONS: { id: string; title: string }[] = [
  { id: 'hook', title: 'TownHook' },
  { id: 'rebates', title: 'Rebates for buyers' },
  { id: 'staking', title: 'Staking' },
  { id: 'treasury', title: 'The treasury' },
  { id: 'burn', title: 'The burn' },
  { id: 'liquidity', title: 'Locked liquidity' },
  { id: 'rules', title: 'Fixed rules' },
  { id: 'owner', title: 'The owner' },
  { id: 'know', title: 'Things to know' },
];

const titleOf = (id: string) => SECTIONS.find((s) => s.id === id)!.title;

export function Docs() {
  const { network, chain } = useApp();
  const town = network.deployment?.contracts.UpTownToken;
  const r = rateRange(chain);
  // From this day a TOWN sell fee is half burned and half sent to the rebate reserve (CR-93): day 401.
  const fromDay = dayName(reserveFeeStart(chain));
  const floor = fmtTown(burnFloor(chain));
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
          <Section id="hook">
            <ul class="doc-list">
              <li>
                Every trade in the TOWN pool on Uniswap v4 passes through TownHook, the pool’s hook contract. It has no owner: nobody can change it or switch it off.{' '}
                <Verify inline links={[{ what: 'TownHook’s code', href: contractUrl(network, 'TownHook', 'code') }]} />
              </li>
              <li>
                <strong>On a buy</strong> it takes 2% of the ETH for the treasury and records how much TOWN the buyer received that day. Rebates are paid from
                this record.
              </li>
              <li>
                <strong>On a sell</strong> it takes 2%: burned in TOWN, partly sent to the rebate reserve in TOWN, or sent to the treasury in ETH, as{' '}
                <a href="#/docs/burn">The burn</a> explains.
              </li>
              <li>
                <strong>In the first 15 minutes after launch</strong> the buy fee starts at 90% and falls in a straight line to 2%, to discourage bots.
              </li>
              <li>It accepts the launch liquidity once and refuses any later addition. It keeps no funds.</li>
            </ul>
          </Section>

          <Section id="rebates">
            <ul class="doc-list">
              <li data-item="reserve">
                BuyerRewards holds the rebate reserve: 500,000,000 TOWN at launch, half the supply. It counts what it holds, so TOWN that reaches it later
                adds to it: from {fromDay} half of every sell fee paid in TOWN, at the burn floor 1% of every sell, and any TOWN anyone sends it. TOWN leaves
                it only through claims.{' '}
                <Verify
                  inline
                  links={[
                    { label: 'TOWN balance', what: 'BuyerRewards’ TOWN balance', href: contractUrl(network, 'BuyerRewards') },
                    { label: 'running totals', what: 'BuyerRewards’ running totals', href: contractUrl(network, 'BuyerRewards', 'read') },
                  ]}
                />
              </li>
              <li data-item="days">
                Days are calendar days in UTC: each runs from midnight to midnight UTC. Day 1, the launch day, began at launch, so it was shorter than 24
                hours. The header shows today’s day and the time left until the next one begins.
              </li>
              <li>For each day you buy, you can claim the day’s rate of the TOWN you bought, from the next day. Rebates never expire.</li>
              <li>
                Each day’s rate is set when the day begins, from the last three days’ trading in the pool, and does not change during the day. It is{' '}
                {fmtBps(r.low)} when buying and selling balance, rising in a straight line to {fmtBps(r.buyTop)} after days of only buying and to{' '}
                {fmtBps(r.high)} after days of only selling. The <a href="#/rewards">Rewards page</a> shows today’s rate and the three-day lean behind it.
              </li>
              <li>
                {fmtBps(claimFeeBps(chain))} of every claim goes to the treasury for the owner, so {fmtRate(afterFeeBps(chain, r.low))} to {fmtRate(afterFeeBps(chain, r.high))}{' '}
                reaches you.
              </li>
              <li data-item="limit">
                Each day has a limit: 2,500,000 TOWN a day for the first 100 days, halving every 100 days down to 39,062.5 for days 601 to 700, then
                25,000 TOWN a day from day 701 for as long as the reserve has TOWN. On a busy day everyone’s rate falls in proportion.
              </li>
              <li data-item="empty">
                A day’s rebates are settled when the day is first claimed. When the reserve runs low, days are paid in the order they are settled. If it is
                empty, rebates pause until TOWN arrives, and a day settled while it is empty gets nothing, even if TOWN arrives later.
              </li>
            </ul>
          </Section>

          <Section id="staking">
            <ul class="doc-list">
              <li>
                Open a vault in one of five tiers ($5, $10, $20, $30 or $50, paid once in ETH to the treasury) and stake TOWN in it.{' '}
                <Verify
                  inline
                  links={[{ what: 'the staking contract’s tiers and totals', href: chain ? readUrl(network, chain.staking.address) : contractUrl(network, 'TownStaking', 'read') }]}
                />
              </li>
              <li>Each daily payout is split between the tiers by fixed shares (1x to 2x), then within a tier by TOWN staked.</li>
              <li>The WETH streams to stakers over seven days; claim it any time. There is no lock: unstaking gives back all your TOWN.</li>
              <li>Vault prices follow Chainlink’s ETH/USD price.</li>
            </ul>
          </Section>

          <Section id="treasury">
            <ul class="doc-list">
              <li>
                The treasury receives TownHook’s 2% buy fee, its 2% sell fee on the days it is charged in ETH and 1% of every sell at the burn floor, and the
                vault prices in ETH, and the claim fees in TOWN.{' '}
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
                Once a day it sends a share of the stakers’ ETH (10% at launch; the owner can set 1% to 25%) to the staking contract as WETH: TownStaking,
                unless the owner replaces it after a 2-day public wait. A share under 0.001 ETH waits for a later day.
              </li>
              <li>ETH leaves only two ways: to the current staking contract and the owner’s 10% reserve.</li>
            </ul>
          </Section>

          <Section id="burn">
            <ul class="doc-list">
              <li>
                1,000,000,000 TOWN were minted once; no one can mint more.{' '}
                <Verify inline links={[{ what: 'TOWN’s total supply', href: tokenUrl(network, town) }]} />
              </li>
              <li data-item="sell-fee">
                Every sell pays a 2% fee, in TOWN, and it is burned. From {fromDay} half of it is burned and the other half goes to the rebate reserve, so
                sells help pay later rebates.
              </li>
              <li data-item="eth-day">
                On a day after one that burned more TOWN than it paid out in rebates, the whole 2% goes to the treasury in ETH instead, and nothing is burned
                or sent to the reserve. While the rebate reserve is empty, the fee is in TOWN.
              </li>
              <li data-item="floor">
                The burn stops at the floor of {floor} TOWN of supply. The sell that reaches the floor pays its whole 2% in TOWN: what fits above the
                floor is burned and the rest goes to the rebate reserve. From then on every sell pays 1% in TOWN to the rebate reserve and 1% in ETH to the
                treasury.
              </li>
              <li>
                Above the floor the mode is fixed for the whole day. The <a href="#/trade/sell">Trade page</a> and the <a href="#/stats">Stats page</a> show
                how today’s 2% divides and yesterday’s two figures behind it.{' '}
                <Verify inline links={[{ what: 'TownHook’s sell-fee mode and burn per day', href: contractUrl(network, 'TownHook', 'read') }]} />
              </li>
            </ul>
          </Section>

          <Section id="liquidity">
            <ul class="doc-list">
              <li>At launch the other 500,000,000 TOWN form the pool’s single liquidity position.</li>
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
              <li>
                The position is an NFT on Uniswap’s v4 PositionManager, owned by LPVault.{' '}
                <Verify inline links={[{ what: 'the liquidity position NFT', href: positionUrl(network) }]} />
              </li>
              <li>The owner can extend the lock, never shorten it, and can collect the 0.5% pool fee, but cannot remove liquidity before the unlock time.</li>
            </ul>
          </Section>

          <Section id="rules">
            <ul class="doc-list">
              <li>
                No contract can be upgraded, and trading never pauses. The one moving part: the owner can pause the treasury’s daily payout or point it at a
                new staking contract, each after a 2-day public wait.
              </li>
              <li>The fees are fixed: 2% on buys, 2% on sells, the 0.5% pool fee and the {fmtBps(claimFeeBps(chain))} claim fee.</li>
              <li>The supply (1,000,000,000 TOWN), the vault tiers and their dollar prices are fixed.</li>
              <li>
                UpTownToken, TownHook and BuyerRewards have no owner at all.{' '}
                <Verify
                  inline
                  links={[
                    { label: 'UpTownToken', what: 'UpTownToken’s code', href: contractUrl(network, 'UpTownToken', 'code') },
                    { label: 'TownHook', what: 'TownHook’s code', href: contractUrl(network, 'TownHook', 'code') },
                    { label: 'BuyerRewards', what: 'BuyerRewards’ code', href: contractUrl(network, 'BuyerRewards', 'code') },
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
        One address holds the owner’s powers on LPVault, the Treasury and TownStaking, and makes the single launch call. Ownership can be handed over in two
        steps but not given up.{' '}
        <Verify
          inline
          links={[
            { label: 'LPVault', what: 'LPVault’s owner', href: contractUrl(network, 'LPVault', 'read') },
            { label: 'Treasury', what: 'the Treasury’s owner', href: contractUrl(network, 'Treasury', 'read') },
            { label: 'TownStaking', what: 'TownStaking’s owner', href: contractUrl(network, 'TownStaking', 'read') },
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
        {chain ? <Settings /> : <p class="small muted">Shown once the contracts are deployed on this network.</p>}
      </Details>
    </Section>
  );
}

function Settings() {
  const { chain: read, network } = useApp();
  const chain = read!;
  const st = chain.staking;
  const t = chain.treasury;
  const pauseAt = pausePending(chain);
  const change = stakingChange(chain);
  const fallbackLive = st.priceStatus.source === PriceSource.Fallback;
  return (
    <>
      <Figures cols={2}>
        <Fig label="Daily payout rate" value={fmtBps(chain.treasury.spendBps)} view="Treasury.spendBps" note="Settable from 1% to 25%; a change applies from the next day." />
        <Fig
          label="Fallback ETH/USD price"
          value={st.fallbackPrice === 0n ? 'None set' : fmtUsd8(st.fallbackPrice)}
          view="TownStaking.fallbackPrice"
          note={
            st.fallbackPrice === 0n
              ? undefined
              : fallbackLive
                ? `In use; valid until ${fmtDateTime(fallbackExpiresAt(chain))}.`
                : `Set ${fmtDateTime(st.fallbackPriceSetAt)}; not in use.`
          }
        />
        <Fig
          label="Announced feed change"
          value={st.pendingFeed ? shortAddress(st.pendingFeed) : 'None'}
          view="TownStaking.pendingFeed"
          note={st.pendingFeed ? `From ${fmtDateTime(st.pendingFeedEffectiveAt)}.` : undefined}
        />
        <Fig label="Liquidity locked until" value={fmtDate(chain.lpVault.unlockTime)} view="LPVault.unlockTime" note="Can be extended, never shortened." />
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
              : stakingReplaced(chain, network.deployment?.contracts.TownStaking)
                ? 'A replacement for TownStaking; no change announced.'
                : 'TownStaking; no change announced.'
          }
        />
      </Figures>
      <Verify
        links={[
          { label: 'payout rate and target', what: 'the Treasury’s payout rate, pause and staking contract', href: contractUrl(network, 'Treasury', 'read') },
          { label: 'prices and feed', what: 'the staking contract’s fallback price and feed', href: readUrl(network, st.address) },
          { label: 'unlock time', what: 'LPVault’s unlock time', href: contractUrl(network, 'LPVault', 'read') },
        ]}
      />
    </>
  );
}
