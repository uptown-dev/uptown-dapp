import { useState } from 'preact/hooks';
import { parseEther, parseUnits } from 'viem';
import { useApp, ActionButton, ConnectPrompt, Details, FieldError, Notice, PageHead, SampleBadge, Chips } from '../components/ui';
import { ArrowDownIcon, ExternalIcon } from '../components/icons';
import { afterClaimFee, antiSnipeActive, antiSnipeSecondsLeft, buyFee, minReceived, quoteTownOut, rebateRateBps } from '../lib/derive';
import { dayName, fmtBps, fmtClock, fmtEth, fmtTown, fmtUnits } from '../lib/format';

/** Universal Router 2.1.2 on Ethereum mainnet (R1b A1; CL-41). Phase two sends the site's buys through it. */
export const UNIVERSAL_ROUTER = '0x23617e59A5925b2A4Bf75d73ff6711cD0b29De85';

/** The Uniswap app, for selling (and a second way to buy). Phase two adds TOWN's address. */
const UNISWAP_URL = 'https://app.uniswap.org/swap?chain=mainnet&inputCurrency=NATIVE';

const SLIPPAGE = [
  { value: 50, label: '0.5%' },
  { value: 100, label: '1%' },
  { value: 200, label: '2%' },
];

function parseAmount(s: string): bigint | null {
  const t = s.replace(/,/g, '').trim();
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  try {
    return parseUnits(t, 18);
  } catch {
    return null;
  }
}

function parseEthInput(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  try {
    return parseEther(t);
  } catch {
    return null;
  }
}

export function Buy() {
  const { chain } = useApp();
  return (
    <div class="wrap page narrow">
      <PageHead title="Buy TOWN" lead="Swap ETH for TOWN. Every buy here is counted for your wallet, so its rebate is yours." />
      {antiSnipeActive(chain) && <AntiSnipe />}
      <BuyCard />
      <div class="after-card">
        <a class="btn btn-secondary btn-block" href={UNISWAP_URL} target="_blank" rel="noopener noreferrer">
          Sell on Uniswap
          <ExternalIcon size={16} />
        </a>
        <p class="small muted">Other TOWN pools, outside the official one, pay no fees and earn no rebates.</p>
      </div>
      <Details>
        <ul class="plain-list">
          <li>
            <strong>How the buy is sent.</strong> One exact-input swap through Uniswap’s Universal Router (version 2.1.2,{' '}
            <code>{UNIVERSAL_ROUTER.slice(0, 10)}…</code>) that names your wallet in the swap, with your minimum received as the limit. Your wallet shows the
            transaction for you to approve.
          </li>
          <li>
            <strong>Fees on a buy.</strong> The buy fee ({fmtBps(chain.hook.BUY_FEE_BPS)} of the ETH, to the treasury; 10% of it is kept for the owner) and the
            pool’s 0.5% trading fee, which goes to the locked liquidity and is collected by the owner. The estimate already includes both. Gas is paid
            separately.
          </li>
          <li>
            <strong>Fees on a sell.</strong> {fmtBps(chain.hook.currentSellFeeBps)} of the TOWN sold is burned, plus the 0.5% pool fee. Selling is done on
            Uniswap; this site has no sell form.
          </li>
          <li>
            <strong>The first 15 minutes.</strong> The buy fee starts at {fmtBps(chain.hook.ANTI_SNIPE_START_BPS)} at launch and falls in a straight line to{' '}
            {fmtBps(chain.hook.BUY_FEE_BPS)} over 15 minutes, to discourage bots. Rebates count only the TOWN you actually receive.
          </li>
          <li>
            <strong>Who gets the rebate.</strong> A buy made here names your wallet, so it is always credited to you. A buy through another app is credited to
            the wallet that app names, or else to whoever sent the transaction: an aggregator, a smart-account service or a relayer may be credited instead of
            you.
          </li>
          <li>
            <strong>The right pool.</strong> Only the TOWN pool that runs through UpTown’s hook counts. TOWN’s address will be published here at launch.
          </li>
        </ul>
      </Details>
    </div>
  );
}

function AntiSnipe() {
  const { chain } = useApp();
  const left = antiSnipeSecondsLeft(chain);
  const dur = chain.hook.ANTI_SNIPE_DURATION;
  const done = Math.round(((dur - left) / dur) * 100);
  return (
    <Notice kind="warn" title={`Launch fee: the buy fee is ${fmtBps(chain.hook.currentBuyFeeBps)} right now`}>
      <p>
        For the first 15 minutes after launch the buy fee falls from {fmtBps(chain.hook.ANTI_SNIPE_START_BPS)} to {fmtBps(chain.hook.BUY_FEE_BPS)}. It reaches{' '}
        {fmtBps(chain.hook.BUY_FEE_BPS)} in <strong class="num">{fmtClock(left)}</strong>. Unless you mean to pay it, wait.
      </p>
      <div
        class="meter"
        role="progressbar"
        aria-label="Time passed in the 15-minute launch fee window"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done}
      >
        <span style={`width:${done}%`} />
      </div>
    </Notice>
  );
}

function BuyCard() {
  const { chain, wallet } = useApp();
  const [amount, setAmount] = useState('0.1');
  const [slippage, setSlippage] = useState(100);
  const [minText, setMinText] = useState<string | null>(null);

  const amountIn = parseEthInput(amount);
  const feeBps = chain.hook.currentBuyFeeBps;
  const fee = amountIn !== null ? buyFee(amountIn, feeBps) : null;
  const estimate = amountIn !== null ? quoteTownOut(chain, amountIn) : null;
  const autoMin = estimate !== null ? minReceived(estimate, slippage) : null;
  const minValue = minText !== null ? parseAmount(minText) : autoMin;
  const c = chain.hook.currentCycle;
  const rate = rebateRateBps(chain, c);
  const rebate = estimate !== null ? afterClaimFee(chain, (estimate * BigInt(Math.round(rate * 100))) / 1_000_000n) : null;
  const overBalance = !!wallet && amountIn !== null && amountIn > wallet.ethBalance;
  const minTooHigh = minValue !== null && estimate !== null && minValue > estimate;

  return (
    <section class="card swap-card" aria-label="Buy TOWN with ETH">
      <div class="card-head">
        <h2 class="card-title">Swap</h2>
        <div class="card-head-end">
          <SampleBadge />
        </div>
      </div>

      <div class="swap-box">
        <div class="swap-box-top">
          <label for="buy-eth">You pay</label>
          {wallet && (
            <span class="muted small">
              Balance <span class="num">{fmtEth(wallet.ethBalance)}</span> ETH
            </span>
          )}
        </div>
        <div class="swap-box-main">
          <input
            id="buy-eth"
            class="swap-input num"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onInput={(e) => {
              setAmount((e.target as HTMLInputElement).value);
              setMinText(null);
            }}
            aria-invalid={amountIn === null}
          />
          <span class="token-pill">ETH</span>
        </div>
      </div>

      <div class="swap-arrow" aria-hidden="true">
        <ArrowDownIcon size={16} />
      </div>

      <div class="swap-box">
        <div class="swap-box-top">
          <span>You receive (estimate)</span>
        </div>
        <div class="swap-box-main">
          <output class="swap-output num" data-view="V4Quoter.quoteExactInputSingle" for="buy-eth">
            {estimate !== null ? fmtTown(estimate) : '0'}
          </output>
          <span class="token-pill gold">TOWN</span>
        </div>
      </div>

      {amountIn === null && <FieldError>Enter an amount of ETH, for example 0.1.</FieldError>}
      {overBalance && <FieldError>That is more ETH than this wallet holds.</FieldError>}

      <dl class="rows swap-rows">
        <div class="row">
          <dt>Buy fee ({fmtBps(feeBps)}, to the treasury)</dt>
          <dd class="num" data-view="TownHook.currentBuyFeeBps">
            {fee !== null ? `${fmtEth(fee)} ETH` : '—'}
          </dd>
        </div>
        <div class="row">
          <dt>
            <label for="buy-min">Minimum received</label>
          </dt>
          <dd class="num">{minValue !== null ? `${fmtTown(minValue)} TOWN` : '—'}</dd>
        </div>
        <div class="row row-control">
          <dt class="visually-hidden">Minimum received setting</dt>
          <dd>
            <Chips
              label="Set the minimum below the estimate by"
              options={SLIPPAGE}
              value={minText === null ? slippage : null}
              onChange={(v) => {
                setSlippage(v);
                setMinText(null);
              }}
            />
            <input
              id="buy-min"
              class="small-input num"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Minimum TOWN received, editable"
              value={minText ?? (autoMin !== null ? fmtUnits(autoMin, 18, 0) : '')}
              onInput={(e) => setMinText((e.target as HTMLInputElement).value)}
            />
          </dd>
        </div>
        <div class="row strong">
          <dt>Rebate this buy can earn</dt>
          <dd class="num accent-text">{rebate !== null ? `up to ${fmtTown(rebate)} TOWN` : '—'}</dd>
        </div>
      </dl>
      {minTooHigh && <FieldError>The minimum is above the estimate, so the buy would almost certainly be cancelled.</FieldError>}
      <p class="small muted swap-note">
        Rebate after the 5% claim fee, at {dayName(c)}’s rate so far, claimable from {dayName(c + 2)} within the day’s limit. If you would receive less than
        the minimum, the buy is cancelled and you keep your ETH.
      </p>

      {wallet ? (
        <ActionButton
          label="Buy TOWN"
          block
          disabled={amountIn === null || amountIn === 0n || overBalance || minValue === null}
          explain="ask your wallet to send this buy, naming your wallet so the rebate is credited to you."
        />
      ) : (
        <ConnectPrompt what="your balance and buy" block />
      )}
      <p class="credit-line">Buy here so the rebate is credited to your wallet.</p>
    </section>
  );
}
