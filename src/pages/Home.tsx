import { useApp, Card, Fig, Figures, Notice, Verify } from '../components/ui';
import { CheckIcon, EthIcon, FlowGraphic, LockIcon, RebateIcon } from '../components/icons';
import { burned } from '../lib/derive';
import { dayName, fmtEth, fmtTown } from '../lib/format';
import { contractUrl, tokenUrl } from '../lib/network';

const FIXED_RULES = ['1,000,000,000 TOWN, never more', 'No upgrades, no pause', 'Liquidity locked for 10 years', 'Every sell burns 2% of the TOWN sold'];

export function Home() {
  const { chain, network } = useApp();
  const c = chain?.hook.currentCycle ?? null;
  const town = network.deployment?.contracts.UpTownToken;
  return (
    <>
      <section class="hero">
        <div class="wrap hero-inner">
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
            Every trade in the TOWN pool on Uniswap v4 passes through TownHook, a contract nobody can change or switch off: on each buy it sends 2% of the
            ETH to the treasury and records the TOWN you bought, and on each sell it burns 2% of the TOWN sold, until only 1,000,000 TOWN are left.{' '}
            <strong>Buyers</strong> claim up to 5% of their TOWN back from a 500,000,000 TOWN reserve two days later (4.75% after the 5% claim fee, within
            each day’s limit). <strong>Stakers</strong> receive part of the treasury’s ETH each day as WETH, spread over seven days.
          </p>
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
          <Verify
            links={[
              { label: 'the hook’s code', what: 'TownHook’s code', href: contractUrl(network, 'TownHook', 'code') },
              { label: 'the supply', what: 'TOWN’s total supply', href: tokenUrl(network, town) },
              { label: 'the lock', what: 'LPVault’s unlock time', href: contractUrl(network, 'LPVault', 'read') },
            ]}
          />
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
            <Verify links={[{ what: 'BuyerRewards’ reserve and running totals', href: contractUrl(network, 'BuyerRewards', 'read') }]} />
          </article>
          <article class="feature">
            <span class="feature-icon">
              <EthIcon size={20} />
            </span>
            <h2>ETH for stakers</h2>
            <p class="feature-number num">2% of every buy</p>
            <p>goes to the treasury in ETH; part of it is paid to stakers every day as WETH.</p>
            <Verify links={[{ what: 'TownHook’s code (the 2% fee)', href: contractUrl(network, 'TownHook', 'code') }]} />
          </article>
          <article class="feature">
            <span class="feature-icon">
              <LockIcon size={20} />
            </span>
            <h2>Fixed rules</h2>
            <p class="feature-number num">1,000,000,000 TOWN</p>
            <p>never more. No upgrades, no pause, liquidity locked for ten years.</p>
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
            <div>
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
                    <h3>On a buy, the hook pays the treasury and records you</h3>
                    <p>
                      2% of the ETH goes to the treasury, and the TOWN you bought is written into the day’s tally that rebates are paid from. In the first 15
                      minutes after launch the buy fee starts at 90% and falls to 2%.
                    </p>
                  </div>
                </li>
                <li>
                  <span class="step-no">3</span>
                  <div>
                    <h3>On a sell, the hook burns TOWN</h3>
                    <p>2% of the TOWN sold is burned, until only 1,000,000 TOWN remain.</p>
                  </div>
                </li>
                <li>
                  <span class="step-no">4</span>
                  <div>
                    <h3>Buyers and stakers are rewarded</h3>
                    <p>
                      Two days after a buy you can claim up to 5% of your TOWN back from the reserve (4.75% after the claim fee). Each day the treasury pays
                      part of its ETH to stakers as WETH, streamed over seven days.
                    </p>
                  </div>
                </li>
              </ol>
              <Verify links={[{ what: 'TownHook’s code', href: contractUrl(network, 'TownHook', 'code') }]} />
            </div>
            <figure class="flow-card">
              <FlowGraphic />
            </figure>
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
                { label: 'TownStaking', what: 'TownStaking’s total staked', href: contractUrl(network, 'TownStaking', 'read') },
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
