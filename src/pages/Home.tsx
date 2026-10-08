import { useApp, Card, Fig, Figures } from '../components/ui';
import { CheckIcon, EthIcon, FlowGraphic, LockIcon, RebateIcon } from '../components/icons';
import { burned } from '../lib/derive';
import { dayName, fmtEth, fmtTown } from '../lib/format';

const FIXED_RULES = ['1,000,000,000 TOWN, never more', 'No upgrades, no pause', 'Liquidity locked for 10 years', 'Every sell burns 2% of the TOWN sold'];

export function Home() {
  const { chain } = useApp();
  const c = chain.hook.currentCycle;
  return (
    <>
      <section class="hero">
        <div class="wrap hero-inner">
          <p class="eyebrow">
            UpTown Token (TOWN) on Ethereum · <span class="nowrap">{dayName(c)}</span>
          </p>
          <h1>TOWN rewards the people who buy it and the people who hold it.</h1>
          <div class="hero-points">
            <p>
              <strong>Buyers get TOWN back:</strong> up to 5% of the TOWN they buy (4.75% after the 5% claim fee), claimable two days later, within each day’s
              limit.
            </p>
            <p>
              <strong>Stakers earn ETH from every buy:</strong> 2% of the ETH in every buy goes to the treasury, and part of it is paid to stakers as WETH every
              day, spread over seven days.
            </p>
            <p>
              <strong>Built to attract buyers:</strong> every buy earns its buyer a rebate and funds the stakers’ ETH.
            </p>
          </div>
          <div class="btn-row hero-cta">
            <a class="btn btn-primary btn-large" href="#/buy">
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
        </div>
      </section>

      <section class="section">
        <div class="wrap feature-grid">
          <article class="feature">
            <span class="feature-icon">
              <RebateIcon size={20} />
            </span>
            <h2>Buy rebates</h2>
            <p class="feature-number num">up to 4.75%</p>
            <p>of the TOWN you buy comes back as a TOWN rebate, claimable two days later.</p>
          </article>
          <article class="feature">
            <span class="feature-icon">
              <EthIcon size={20} />
            </span>
            <h2>ETH for stakers</h2>
            <p class="feature-number num">2% of every buy</p>
            <p>goes to the treasury in ETH; part of it is paid to stakers every day as WETH.</p>
          </article>
          <article class="feature">
            <span class="feature-icon">
              <LockIcon size={20} />
            </span>
            <h2>Fixed rules</h2>
            <p class="feature-number num">1,000,000,000 TOWN</p>
            <p>never more. No upgrades, no pause, liquidity locked for ten years.</p>
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
                  <h3>Buy TOWN with ETH</h3>
                  <p>2% of the ETH goes to the treasury. Your buy is counted for your wallet.</p>
                </div>
              </li>
              <li>
                <span class="step-no">2</span>
                <div>
                  <h3>Claim your rebate after two days</h3>
                  <p>Up to 5% of the TOWN you bought, less a 5% claim fee, within the day’s limit.</p>
                </div>
              </li>
              <li>
                <span class="step-no">3</span>
                <div>
                  <h3>Stakers get ETH every day</h3>
                  <p>Each day the treasury pays part of its ETH to stakers as WETH, streamed over seven days.</p>
                </div>
              </li>
              <li>
                <span class="step-no">4</span>
                <div>
                  <h3>Every sell burns TOWN</h3>
                  <p>2% of the TOWN sold is burned, until only 1,000,000 TOWN remain.</p>
                </div>
              </li>
            </ol>
            <figure class="flow-card">
              <FlowGraphic />
            </figure>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="live-title">
        <div class="wrap">
          <Card title={<span id="live-title">So far</span>}>
            <Figures cols={4}>
              <Fig label="ETH sent to stakers" value={fmtEth(chain.treasury.totalDistributed)} unit="WETH" view="Treasury.totalDistributed" />
              <Fig label="TOWN rebated to buyers" value={fmtTown(chain.rewards.totalPaidToBuyers)} unit="TOWN" view="BuyerRewards.totalPaidToBuyers" />
              <Fig label="TOWN burned" value={fmtTown(burned(chain))} unit="TOWN" view="1,000,000,000 - UpTownToken.totalSupply" />
              <Fig label="TOWN staked" value={fmtTown(chain.staking.totalStaked)} unit="TOWN" view="TownStaking.totalStaked" />
            </Figures>
          </Card>
          <p class="owner-line">
            The owner holds a short list of powers and earns income from fees. <a href="#/owner">Read Owner and risks</a> before you take part.
          </p>
        </div>
      </section>
    </>
  );
}
