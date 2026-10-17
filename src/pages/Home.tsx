import { useApp, useBeforeLaunch, useRules, Card, Fig, Figures, Notice, Verify } from '../components/ui';
import { CheckIcon, EthIcon, FlowGraphic, LockIcon, RebateIcon } from '../components/icons';
import { afterFeeBps, burnFloor, burned, dayRateBps, rateRange, reserveFeeStart } from '../lib/derive';
import { dayName, fmtBps, fmtEth, fmtTown, fmtRate } from '../lib/format';
import { contractUrl, readUrl, tokenUrl } from '../lib/network';
import { HomeContracts, launchLine } from './BeforeLaunch';

const FIXED_RULES = ['1,000,000,000 $SKYLINE, never more', 'No upgrades; trading never pauses', 'Liquidity locked for 10 years', 'Every sell pays 2%: burned, to the rebate reserve, or to the treasury in ETH'];

/**
 * The owner's own words (CR-77 items 2 to 5), character for character as he wrote them, including
 * his use of "$SKYLINE" and "SKYLINE" and his straight apostrophes. Each is one unbroken string, so
 * nothing here re-words, re-punctuates, re-wraps or splits them, and the text node the browser
 * shows is the sentence itself. Do not edit these without a change request. CR-102 changed only the
 * symbol in them ($TOWN to $SKYLINE, TOWN to SKYLINE, TownHook to SkylineHook), no other word.
 * CR-105 writes every SKYLINE as $SKYLINE (the owner's instruction); an existing $SKYLINE is kept.
 */
const WHY_FIRST = 'Most projects that distribute revenue have no systems that ensure sustained revenue generation. Attention fades after launch, trading slows, and the project fades with it.';
const WHY_SECOND =
  "UpTown's sophisticated flywheel is built on top of the pool. Every trade in the $SKYLINE pool passes through SkylineHook, a contract no one controls, and it turns trading into reasons to participate: buyers claim $SKYLINE rebates at the end of trading days, stakers receive a daily share of the ETH the treasury collects, and on every sale 2% is either charged in $SKYLINE and burned or charged in ETH and sent to the treasury. The rules are written into the contracts and cannot be changed.";
const REBATE_CARD = "of $SKYLINE bought every day, claimable in $SKYLINE, minus a 2% claim fee, claimable the next day. The rate moves between 5% and 5.5%, decided using data from the last three days' trading activity.";
const STAKER_CARD = 'charged in ETH, sent to the treasury; 90% of it streams to stakers as WETH';
const RULES_CARD = 'never more. Zero dev allocation. No upgrades; trading never pauses; liquidity locked for a minimum of ten years.';

export function Home() {
  const { chain, network, prelaunch } = useApp();
  // Deployed, not launched (CR-86): the contracts are live, the pool is not open yet.
  const before = useBeforeLaunch() && !!prelaunch;
  const rules = useRules();
  const c = chain?.hook.currentCycle ?? null;
  // Today's rebate rate before the claim fee, BuyerRewards.rateBps(today) (CR-47); before the
  // contracts are deployed here, the range before the fee. CR-77 item 3: the card's sentence now
  // subtracts the claim fee itself, so the figure above it is the rate before the fee.
  const r = rateRange(rules);
  const today = chain ? fmtRate(dayRateBps(chain, chain.rewards.currentCycle)) : null;
  const town = network.deployment?.contracts.UpTownToken;
  return (
    <>
      <section class="hero">
        <div class="wrap hero-inner">
          <div class="hero-text">
            <p class="eyebrow">
              UpTown Token ($SKYLINE) on Ethereum
              {c !== null && (
                <>
                  {' '}
                  · <span class="nowrap">{dayName(c)}</span>
                </>
              )}
            </p>
            {before && (
              <p class="launch-line" role="status" data-state="not-launched">
                {launchLine(network)}
              </p>
            )}
            <h1>$SKYLINE, the first token that rewards buyers and stakers.</h1>
            <p class="hero-summary">
              Every trade in the $SKYLINE pool on Uniswap v4 passes through SkylineHook, a contract managed by no one: it sends 2% of every buy, charged in ETH, to
              the treasury, records the $SKYLINE bought, and dynamically takes 2% of every $SKYLINE sold into the pool: burned when it collects $SKYLINE, or to the
              treasury when it collects ETH. Every day, buyers claim up to 5.5% of $SKYLINE bought from a 500,000,000 $SKYLINE reserve. 90% of the treasury’s ETH
              funds staker rewards, which stream to stakers every day as WETH.
            </p>
            {before ? (
              // Nothing can be bought or staked before the launch, so the buttons lead to what can be read now.
              <div class="btn-row hero-cta">
                <a class="btn btn-primary btn-large" href="#/docs">
                  How it works
                </a>
                <a class="btn btn-secondary btn-large" href="#/stats">
                  See the contracts
                </a>
              </div>
            ) : (
              <div class="btn-row hero-cta">
                <a class="btn btn-primary btn-large" href="#/trade">
                  Buy $SKYLINE
                </a>
                <a class="btn btn-secondary btn-large" href="#/stake">
                  Stake $SKYLINE
                </a>
              </div>
            )}
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
                { label: 'SkylineHook code', what: 'SkylineHook’s code', href: contractUrl(network, 'SkylineHook', 'code') },
                { label: 'the supply', what: '$SKYLINE’s total supply', href: tokenUrl(network, town) },
                { label: 'the lock', what: 'LPVault’s unlock time', href: contractUrl(network, 'LPVault', 'read') },
              ]}
            />
          </div>
          <figure class="flow-card hero-flow">
            <FlowGraphic />
          </figure>
        </div>
      </section>

      {/* Why $SKYLINE? The problem, and UpTown's answer (CR-69: the heading and two plain paragraphs, in the hero description's text size; CR-70: full width; CR-77 item 2: the owner's own two paragraphs, word for word) */}
      <section class="section" aria-labelledby="why-title">
        <div class="wrap">
          <h2 id="why-title" class="section-title">
            Why $SKYLINE?
          </h2>
          <div class="why">
            <p>{WHY_FIRST}</p>
            <p>{WHY_SECOND}</p>
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
            <p class="feature-number num" data-view="BuyerRewards.rateBps(today)">
              {today !== null ? `up to ${today} today` : `${fmtBps(r.low)} to ${fmtBps(r.high)}`}
            </p>
            <p>{REBATE_CARD}</p>
            <Verify links={[{ what: 'BuyerRewards’ reserve and running totals', href: contractUrl(network, 'BuyerRewards', 'read') }]} />
          </article>
          <article class="feature">
            <span class="feature-icon">
              <EthIcon size={20} />
            </span>
            <h2>ETH for stakers</h2>
            <p class="feature-number num">2% of every buy</p>
            <p>{STAKER_CARD}</p>
            <Verify links={[{ what: 'SkylineHook’s code (the 2% fee)', href: contractUrl(network, 'SkylineHook', 'code') }]} />
          </article>
          <article class="feature">
            <span class="feature-icon">
              <LockIcon size={20} />
            </span>
            <h2>Fixed rules</h2>
            <p class="feature-number num">1,000,000,000 $SKYLINE</p>
            <p>{RULES_CARD}</p>
            <Verify links={[{ what: '$SKYLINE’s total supply', href: tokenUrl(network, town) }]} />
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
                  <h3>Every trade goes through SkylineHook</h3>
                  <p>Buy or sell $SKYLINE in its Uniswap v4 pool and the trade passes through SkylineHook, which nobody can change or switch off.</p>
                </div>
              </li>
              <li>
                <span class="step-no">2</span>
                <div>
                  <h3>On a buy, SkylineHook pays the treasury and records you</h3>
                  <p>
                    2% of the ETH goes to the treasury, and the $SKYLINE you bought is written into the day’s tally that rebates are paid from. The buy fee is
                    2% from the first second of trading.
                  </p>
                </div>
              </li>
              <li>
                <span class="step-no">3</span>
                <div>
                  <h3>On a sell, SkylineHook takes 2%</h3>
                  <p>
                    The 2% is taken in $SKYLINE and burned; from {dayName(reserveFeeStart(rules))} half is burned and half refills the rebate reserve. On a day
                    after one that burned more $SKYLINE than it paid out in rebates, it goes to the treasury in ETH instead. Once only{' '}
                    {fmtTown(burnFloor(rules))} $SKYLINE remain, every sell pays 1% in $SKYLINE to the rebate reserve and 1% in ETH to the treasury.
                  </p>
                </div>
              </li>
              <li>
                <span class="step-no">4</span>
                <div>
                  <h3>Buyers and stakers are rewarded</h3>
                  <p>
                    From the day after a buy you can claim {fmtBps(r.low)} to {fmtBps(r.high)} of your $SKYLINE back from the reserve, set each day by the last
                    three days’ trading ({fmtRate(afterFeeBps(rules, r.low))} to {fmtRate(afterFeeBps(rules, r.high))} after the claim fee). Each day the treasury pays
                    part of its ETH to stakers as WETH, streamed over seven days.
                  </p>
                </div>
              </li>
            </ol>
            <Verify links={[{ what: 'SkylineHook’s code', href: contractUrl(network, 'SkylineHook', 'code') }]} />
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="live-title">
        <div class="wrap">
          {/* Before the launch (CR-86) the running totals do not exist yet: the contracts and the supply instead, never zeros. */}
          {before ? (
            <HomeContracts p={prelaunch!} />
          ) : (
          <Card title={<span id="live-title">So far</span>}>
            {chain ? (
              <Figures cols={4}>
                <Fig label="ETH sent to stakers" value={fmtEth(chain.treasury.totalDistributed)} unit="WETH" amount={chain.treasury.totalDistributed} view="Treasury.totalDistributed" />
                <Fig label="$SKYLINE rebated to buyers" value={fmtTown(chain.rewards.totalPaidToBuyers)} unit="$SKYLINE" amount={chain.rewards.totalPaidToBuyers} view="BuyerRewards.totalPaidToBuyers" />
                <Fig label="$SKYLINE burned" value={fmtTown(burned(chain))} unit="$SKYLINE" amount={burned(chain)} view="1,000,000,000 - UpTownToken.totalSupply" />
                <Fig label="$SKYLINE staked" value={fmtTown(chain.staking.totalStaked)} unit="$SKYLINE" amount={chain.staking.totalStaked} view="SkylineStaking.totalStaked" />
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
                { label: '$SKYLINE supply', what: '$SKYLINE’s total supply', href: tokenUrl(network, town) },
                { label: 'staking', what: 'the staking contract’s total staked', href: chain ? readUrl(network, chain.staking.address) : contractUrl(network, 'SkylineStaking', 'read') },
              ]}
            />
          </Card>
          )}
          {/* CR-77 item 6: the line about the owner's powers and income is deleted. */}
        </div>
      </section>
    </>
  );
}
