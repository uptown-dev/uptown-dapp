import { useApp, Card, Fig, Figures, Notice, Verify } from '../components/ui';
import { CheckIcon, EthIcon, FlowGraphic, LockIcon, RebateIcon } from '../components/icons';
import { afterFeeBps, burnFloor, burned, dayRateBps, rateRange } from '../lib/derive';
import { dayName, fmtBps, fmtEth, fmtTown, fmtRate } from '../lib/format';
import { contractUrl, readUrl, tokenUrl } from '../lib/network';

const FIXED_RULES = ['1,000,000,000 TOWN, never more', 'No upgrades; trading never pauses', 'Liquidity locked for 10 years', 'Every sell pays 2%: burned, or to the treasury in ETH'];

export function Home() {
  const { chain, network } = useApp();
  const c = chain?.hook.currentCycle ?? null;
  // Today's rebate rate after the claim fee, BuyerRewards.rateBps(today) (CR-47); before the
  // contracts are deployed here, the range after the fee.
  const r = rateRange(chain);
  const today = chain ? fmtRate(afterFeeBps(chain, dayRateBps(chain, chain.rewards.currentCycle))) : null;
  const town = network.deployment?.contracts.UpTownToken;
  return (
    <>
      <section class="hero">
        <div class="wrap hero-inner">
          <div class="hero-text">
            <p class="eyebrow">
              UpTown Token (TOWN) on Ethereum
              {c !== null && (
                <>
                  {' '}
                  · <span class="nowrap">{dayName(c)}</span>
                </>
              )}
            </p>
            <h1>TOWN, the first token that rewards buyers and stakers.</h1>
            <p class="hero-summary">
              Every trade in the $TOWN pool on Uniswap v4 passes through TownHook, a contract managed by no one: it sends 2% of every buy, charged in ETH, to
              the treasury, records the TOWN bought, and dynamically takes 2% of every TOWN sold into the pool: burned when it collects $TOWN, or to the
              treasury when it collects ETH. Every day, buyers claim up to 5.5% of $TOWN bought from a 500,000,000 TOWN reserve. 90% of the treasury’s ETH
              funds staker rewards, which stream to stakers every day as WETH.
            </p>
            <div class="btn-row hero-cta">
              <a class="btn btn-primary btn-large" href="#/trade">
                Buy TOWN
              </a>
              <a class="btn btn-secondary btn-large" href="#/stake">
                Stake TOWN
              </a>
            </div>
            <ul class="rule-list" aria-label="The rules are fixed">
              <li class="rule-list-head">The rules are fixed:</li>
              {FIXED_RULES.map((r) => (
                <li key={r}>
                  <CheckIcon size={15} />
                  {r}
                </li>
              ))}
            </ul>
            <Verify
              links={[
                { label: 'TownHook code', what: 'TownHook’s code', href: contractUrl(network, 'TownHook', 'code') },
                { label: 'the supply', what: 'TOWN’s total supply', href: tokenUrl(network, town) },
                { label: 'the lock', what: 'LPVault’s unlock time', href: contractUrl(network, 'LPVault', 'read') },
              ]}
            />
          </div>
          <figure class="flow-card hero-flow">
            <FlowGraphic />
          </figure>
        </div>
      </section>

      {/* Why $TOWN? The problem, and UpTown's answer (CR-69: the heading and two plain paragraphs, in the hero description's text size; CR-70: full width) */}
      <section class="section" aria-labelledby="why-title">
        <div class="wrap">
          <h2 id="why-title" class="section-title">
            Why $TOWN?
          </h2>
          <div class="why">
            <p>
              Most projects that earn revenue have no system that keeps it coming. Attention fades after launch, trading slows, and the project fades with
              it.
            </p>
            <p>
              UpTown built a sophisticated flywheel into the pool itself. Every trade in the TOWN pool passes through TownHook, a contract no one controls, and it
              turns trading into reasons to take part: buyers claim a TOWN rebate the next day, stakers receive a daily share of the ETH the treasury
              collects, and on every sale 2% is burned or sent to the treasury in ETH. The rules are written into the contracts and cannot be changed.
            </p>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="wrap feature-grid">
          <article class="feature">
            <span class="feature-icon">
              <RebateIcon size={20} />
            </span>
            <h2>Buy rebates</h2>
            <p class="feature-number num" data-view="BuyerRewards.rateBps(today) × (1 - CLAIM_FEE_BPS / 10000)">
              {today !== null ? `up to ${today} today` : `${fmtRate(afterFeeBps(null, r.low))} to ${fmtRate(afterFeeBps(null, r.high))}`}
            </p>
            <p>
              of the TOWN you buy comes back as a TOWN rebate, after the claim fee, claimable the next day. The rate moves between {fmtBps(r.low)} and{' '}
              {fmtBps(r.high)} with the last three days’ trading.
            </p>
            <Verify links={[{ what: 'BuyerRewards’ reserve and running totals', href: contractUrl(network, 'BuyerRewards', 'read') }]} />
          </article>
          <article class="feature">
            <span class="feature-icon">
              <EthIcon size={20} />
            </span>
            <h2>ETH for stakers</h2>
            <p class="feature-number num">2% of every buy</p>
            <p>goes to the treasury in ETH; 90% of it streams to stakers as WETH.</p>
            <Verify links={[{ what: 'TownHook’s code (the 2% fee)', href: contractUrl(network, 'TownHook', 'code') }]} />
          </article>
          <article class="feature">
            <span class="feature-icon">
              <LockIcon size={20} />
            </span>
            <h2>Fixed rules</h2>
            <p class="feature-number num">1,000,000,000 TOWN</p>
            <p>never more. No upgrades; trading never pauses; liquidity locked for ten years.</p>
            <Verify links={[{ what: 'TOWN’s total supply', href: tokenUrl(network, town) }]} />
          </article>
        </div>
      </section>

      <section class="section" aria-labelledby="how-title">
        <div class="wrap">
          <h2 id="how-title" class="section-title">
            How it works
          </h2>
          <div class="how">
            <ol class="steps">
              <li>
                <span class="step-no">1</span>
                <div>
                  <h3>Every trade goes through TownHook</h3>
                  <p>Buy or sell TOWN in its Uniswap v4 pool and the trade passes through TownHook, which nobody can change or switch off.</p>
                </div>
              </li>
              <li>
                <span class="step-no">2</span>
                <div>
                  <h3>On a buy, TownHook pays the treasury and records you</h3>
                  <p>
                    2% of the ETH goes to the treasury, and the TOWN you bought is written into the day’s tally that rebates are paid from. In the first 15
                    minutes after launch the buy fee starts at 90% and falls to 2%.
                  </p>
                </div>
              </li>
              <li>
                <span class="step-no">3</span>
                <div>
                  <h3>On a sell, TownHook takes 2%</h3>
                  <p>
                    The 2% is burned in TOWN, until only {fmtTown(burnFloor(chain))} TOWN remain. On a day after one that burned more TOWN than it paid out in
                    rebates, and always at that floor, it goes to the treasury in ETH instead.
                  </p>
                </div>
              </li>
              <li>
                <span class="step-no">4</span>
                <div>
                  <h3>Buyers and stakers are rewarded</h3>
                  <p>
                    From the day after a buy you can claim {fmtBps(r.low)} to {fmtBps(r.high)} of your TOWN back from the reserve, set each day by the last
                    three days’ trading ({fmtRate(afterFeeBps(chain, r.low))} to {fmtRate(afterFeeBps(chain, r.high))} after the claim fee). Each day the treasury pays
                    part of its ETH to stakers as WETH, streamed over seven days.
                  </p>
                </div>
              </li>
            </ol>
            <Verify links={[{ what: 'TownHook’s code', href: contractUrl(network, 'TownHook', 'code') }]} />
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="live-title">
        <div class="wrap">
          <Card title={<span id="live-title">So far</span>}>
            {chain ? (
              <Figures cols={4}>
                <Fig label="ETH sent to stakers" value={fmtEth(chain.treasury.totalDistributed)} unit="WETH" view="Treasury.totalDistributed" />
                <Fig label="TOWN rebated to buyers" value={fmtTown(chain.rewards.totalPaidToBuyers)} unit="TOWN" view="BuyerRewards.totalPaidToBuyers" />
                <Fig label="TOWN burned" value={fmtTown(burned(chain))} unit="TOWN" view="1,000,000,000 - UpTownToken.totalSupply" />
                <Fig label="TOWN staked" value={fmtTown(chain.staking.totalStaked)} unit="TOWN" view="TownStaking.totalStaked" />
              </Figures>
            ) : network.deployment ? (
              <p class="muted">Reading the figures from the contracts…</p>
            ) : (
              <Notice kind="info" title={`Not deployed on ${network.name} yet`}>
                <p>These figures appear here once UpTown’s contracts are deployed on this network.</p>
              </Notice>
            )}
            <Verify
              links={[
                { label: 'Treasury', what: 'the Treasury’s total paid to stakers', href: contractUrl(network, 'Treasury', 'read') },
                { label: 'BuyerRewards', what: 'BuyerRewards’ total paid to buyers', href: contractUrl(network, 'BuyerRewards', 'read') },
                { label: 'TOWN supply', what: 'TOWN’s total supply', href: tokenUrl(network, town) },
                { label: 'staking', what: 'the staking contract’s total staked', href: chain ? readUrl(network, chain.staking.address) : contractUrl(network, 'TownStaking', 'read') },
              ]}
            />
          </Card>
          <p class="owner-line">
            The owner holds a short list of powers and earns income from fees: see <a href="#/docs/owner">The owner</a> in the Docs, which explain every
            part.
          </p>
        </div>
      </section>
    </>
  );
}
