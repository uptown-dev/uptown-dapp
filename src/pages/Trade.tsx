import { useEffect, useState } from 'preact/hooks';
import { parseEther, parseUnits } from 'viem';
import { useApp, useChain, useTx, ConnectPrompt, Details, FieldError, Notice, PageHead, Chips, TxStatus } from '../components/ui';
import { ArrowDownIcon, ExternalIcon } from '../components/icons';
import { afterClaimFee, antiSnipeActive, antiSnipeSecondsLeft, buyFee, minReceived, rebateRateBps } from '../lib/derive';
import { dayName, fmtBps, fmtClock, fmtDateTime, fmtEth, fmtTown, fmtUnits, shortAddress } from '../lib/format';
import { uniswapSellUrl } from '../lib/network';
import { quoteBuy, quoteSell } from '../lib/reads';
import { BUY_DEADLINE_SECONDS, ROUTER_ALLOWANCE_SECONDS, allowRouterTx, approvePermit2Tx, buyTx, sellTx } from '../lib/actions';
import { explainError } from '../lib/errors';

const SLIPPAGE = [
  { value: 50, label: '0.5%' },
  { value: 100, label: '1%' },
  { value: 200, label: '2%' },
];

/** The pool's trading fee: 0.5% (`fee = 5000` pips, spec "Fixed parameters"). */
const POOL_FEE_PIPS = 5000n;

type Mode = 'buy' | 'sell';

/** A TOWN amount typed by the visitor (commas allowed), or null when it is not a number. */
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

/** The latest of the chain's time and the clock, for deadlines and the Permit2 expiry. */
function nowSeconds(blockTimestamp: number): number {
  return Math.max(blockTimestamp, Math.floor(Date.now() / 1000));
}

/** The Trade page (CR-43): the site's own buy and sell forms, and the Uniswap link as a second way to trade. */
export function Trade({ sell: openSell }: { sell?: boolean }) {
  const chain = useChain();
  const { network } = useApp();
  const [mode, setMode] = useState<Mode>(openSell ? 'sell' : 'buy');
  useEffect(() => setMode(openSell ? 'sell' : 'buy'), [openSell]);
  const sellUrl = uniswapSellUrl(network);
  const town = network.deployment?.contracts.UpTownToken;
  return (
    <div class="wrap page narrow">
      <PageHead title="Trade TOWN" lead="Buy or sell TOWN for ETH. Every buy here is counted for your wallet, so its rebate is yours." />
      {mode === 'buy' && antiSnipeActive(chain) && <AntiSnipe />}
      <section class="card swap-card" aria-label="Trade TOWN">
        <div class="tab-list trade-switch" role="tablist" aria-label="Buy or sell">
          {(['buy', 'sell'] as const).map((m) => (
            <button
              type="button"
              role="tab"
              key={m}
              id={`trade-tab-${m}`}
              aria-selected={mode === m}
              aria-controls={`trade-panel-${m}`}
              class="tab"
              onClick={() => setMode(m)}
            >
              {m === 'buy' ? 'Buy' : 'Sell'}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="trade-panel-buy" aria-labelledby="trade-tab-buy" hidden={mode !== 'buy'}>
          <BuyForm active={mode === 'buy'} />
        </div>
        <div role="tabpanel" id="trade-panel-sell" aria-labelledby="trade-tab-sell" hidden={mode !== 'sell'}>
          <SellForm active={mode === 'sell'} />
        </div>
      </section>
      <div class="after-card">
        {sellUrl ? (
          <a class="btn btn-secondary btn-block" href={sellUrl} target="_blank" rel="noopener noreferrer">
            Sell on Uniswap
            <ExternalIcon size={16} />
          </a>
        ) : (
          <span class="btn btn-secondary btn-block is-off" aria-disabled="true">
            Sell on Uniswap
          </span>
        )}
        <p class="small muted">
          {sellUrl
            ? 'A second way to trade: the same pool, in the Uniswap app.'
            : `The Uniswap app does not run on the ${network.name.toLowerCase()}, so this link is off here.`}
        </p>
        <p class="small muted">Other TOWN pools, outside the official one, pay no fees and earn no rebates.</p>
      </div>
      <Details>
        <ul class="plain-list">
          <li>
            <strong>How a trade is sent.</strong> One exact-input swap through Uniswap’s Universal Router (version 2.1.2,{' '}
            <code>{network.uniswap ? `${network.uniswap.universalRouter.slice(0, 10)}…` : '—'}</code>), with your minimum received as the limit. A buy names
            your wallet in the swap. Your wallet shows each transaction for you to approve.
          </li>
          <li>
            <strong>Approvals before a first sell.</strong> The router takes your TOWN through Uniswap’s Permit2 contract (
            <code>{network.uniswap ? shortAddress(network.uniswap.permit2) : '—'}</code>), so a first sell needs two approvals, each its own
            transaction: TOWN to Permit2, then Permit2 to the router for 30 days. Together they cost about 94,000 gas on Ethereum. Both cover all the TOWN
            the wallet holds, so later sells need no new approval until the 30 days pass or you hold more TOWN.
          </li>
          <li>
            <strong>Fees on a buy.</strong> The buy fee ({fmtBps(chain.hook.BUY_FEE_BPS)} of the ETH, to the treasury; 10% of it is kept for the owner) and the
            pool’s 0.5% trading fee, which goes to the locked liquidity and is collected by the owner. The estimate already includes both. Gas is paid
            separately.
          </li>
          <li>
            <strong>Fees on a sell.</strong> 2% of the TOWN sold is burned (nothing once the supply has fallen to 1,000,000
            TOWN), plus the 0.5% pool fee. The estimate already includes both. Selling changes nothing about rebates.
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
            <strong>The right pool.</strong> Only the TOWN pool that runs through TownHook counts. TOWN’s address: <code class="break">{town ?? '—'}</code>.
          </li>
        </ul>
      </Details>
    </div>
  );
}

function AntiSnipe() {
  const chain = useChain();
  const left = antiSnipeSecondsLeft(chain);
  const dur = chain.hook.ANTI_SNIPE_DURATION;
  const done = Math.round(((dur - left) / dur) * 100);
  return (
    <Notice kind="warn" title={`Higher buy fee in the first 15 minutes: ${fmtBps(chain.hook.currentBuyFeeBps)} right now`}>
      <p>
        For the first 15 minutes after launch the buy fee falls from {fmtBps(chain.hook.ANTI_SNIPE_START_BPS)} to {fmtBps(chain.hook.BUY_FEE_BPS)}. It reaches{' '}
        {fmtBps(chain.hook.BUY_FEE_BPS)} in <strong class="num">{fmtClock(left)}</strong>. Unless you mean to pay it, wait.
      </p>
      <div
        class="meter"
        role="progressbar"
        aria-label="Time passed in the first 15 minutes after launch"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done}
      >
        <span style={`width:${done}%`} />
      </div>
    </Notice>
  );
}

interface Quote {
  amountIn: bigint;
  block: bigint;
  out: bigint | null;
  error: string | null;
}

/** Asks Uniswap's V4Quoter for the amount typed (CL-41), again whenever the figures are read again; only while the form is shown. */
function useQuote(active: boolean, amountIn: bigint | null, ask: (amountIn: bigint) => Promise<bigint>, explain: (e: unknown) => string, deps: unknown[]): Quote | null {
  const chain = useChain();
  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    if (!active || amountIn === null || amountIn === 0n) {
      setQuote(null);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      ask(amountIn).then(
        (out) => live && setQuote({ amountIn, block: chain.blockNumber, out, error: null }),
        (e) => live && setQuote({ amountIn, block: chain.blockNumber, out: null, error: explain(e) }),
      );
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [active, amountIn?.toString(), chain.blockNumber, ...deps]);
  return quote && amountIn !== null && quote.amountIn === amountIn ? quote : null;
}

function BuyForm({ active }: { active: boolean }) {
  const chain = useChain();
  const { wallet, account, network, client } = useApp();
  const tx = useTx();
  const [amount, setAmount] = useState('0.1');
  const [slippage, setSlippage] = useState(100);
  const [minText, setMinText] = useState<string | null>(null);

  const amountIn = parseEthInput(amount);
  const fresh = useQuote(active, amountIn, (a) => quoteBuy(client, network, a, account), (e) => explainError(e, 'buy').message, [account]);

  const feeBps = chain.hook.currentBuyFeeBps;
  const fee = amountIn !== null ? buyFee(amountIn, feeBps) : null;
  const estimate = fresh?.out ?? null;
  const autoMin = estimate !== null ? minReceived(estimate, slippage) : null;
  const minValue = minText !== null ? parseAmount(minText) : autoMin;
  const c = chain.hook.currentCycle;
  const rate = rebateRateBps(chain, c);
  const rebate = estimate !== null ? afterClaimFee(chain, (estimate * BigInt(Math.round(rate * 100))) / 1_000_000n) : null;
  const overBalance = !!wallet && amountIn !== null && amountIn > wallet.ethBalance;
  const minTooHigh = minValue !== null && estimate !== null && minValue > estimate;

  const buy = () => {
    if (!account || amountIn === null || minValue === null) return;
    const deadline = BigInt(nowSeconds(chain.blockTimestamp) + BUY_DEADLINE_SECONDS);
    void tx.run(
      'Buy TOWN',
      () => buyTx(network, account, amountIn, minValue, deadline),
      () => `Your buy went through and is counted for your wallet on ${dayName(c)}. Its rebate can be claimed from ${dayName(c + 2)}.`,
      'buy',
    );
  };

  return (
    <div class="trade-form" aria-label="Buy TOWN with ETH">
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
          {wallet && (
            <span class="muted small">
              Balance <span class="num">{fmtTown(wallet.townBalance)}</span> TOWN
            </span>
          )}
        </div>
        <div class="swap-box-main">
          <output class="swap-output num" data-view="V4Quoter.quoteExactInputSingle" for="buy-eth">
            {estimate !== null ? fmtTown(estimate) : amountIn !== null && amountIn > 0n && !fresh ? '…' : '0'}
          </output>
          <span class="token-pill gold">TOWN</span>
        </div>
      </div>

      {amountIn === null && <FieldError>Enter an amount of ETH, for example 0.1.</FieldError>}
      {overBalance && <FieldError>That is more ETH than this wallet holds.</FieldError>}
      {fresh?.error && <FieldError>No estimate: {fresh.error}</FieldError>}

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

      {account ? (
        <button
          type="button"
          class="btn btn-primary btn-block"
          disabled={tx.busy || amountIn === null || amountIn === 0n || overBalance || minValue === null}
          onClick={buy}
        >
          {tx.busy ? 'Buying…' : 'Buy TOWN'}
        </button>
      ) : (
        <ConnectPrompt what="your balance and buy" block />
      )}
      <TxStatus tx={tx} />
      <p class="credit-line">Buy here so the rebate is credited to your wallet.</p>
    </div>
  );
}

function SellForm({ active }: { active: boolean }) {
  const chain = useChain();
  const { wallet, account, network, client } = useApp();
  const tx = useTx();
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(100);
  const [minText, setMinText] = useState<string | null>(null);

  const amountIn = parseAmount(amount);
  const fresh = useQuote(active, amountIn, (a) => quoteSell(client, network, a), (e) => explainError(e, 'sell').message, []);

  // The sell fee: 2% of the TOWN sold, burned, never taking the supply below the burn floor; none
  // once the supply has reached it (spec "TownHook -> Fees", "Burn floor").
  const sellBps = chain.hook.currentSellFeeBps;
  const aboveFloor = chain.token.totalSupply > chain.hook.BURN_FLOOR ? chain.token.totalSupply - chain.hook.BURN_FLOOR : 0n;
  const fee2 = amountIn !== null ? (amountIn * BigInt(sellBps)) / 10_000n : null;
  const sellFee = fee2 !== null ? (fee2 < aboveFloor ? fee2 : aboveFloor) : null;
  const poolFee = amountIn !== null && sellFee !== null ? ((amountIn - sellFee) * POOL_FEE_PIPS) / 1_000_000n : null;
  const estimate = fresh?.out ?? null;
  const autoMin = estimate !== null ? minReceived(estimate, slippage) : null;
  const minValue = minText !== null ? parseEthInput(minText) : autoMin;
  const overBalance = !!wallet && amountIn !== null && amountIn > wallet.townBalance;
  const minTooHigh = minValue !== null && estimate !== null && minValue > estimate;
  const ok = amountIn !== null && amountIn > 0n && !overBalance;

  // The two approvals (Permit2, on-chain transactions, no signed message). Each covers the larger
  // of the amount typed and the wallet's whole TOWN balance, so later sells need no new approval.
  const now = nowSeconds(chain.blockTimestamp);
  const approveAmount = wallet && amountIn !== null ? (amountIn > wallet.townBalance ? amountIn : wallet.townBalance) : null;
  const step1Done = !!wallet && ok && wallet.townAllowanceToPermit2 >= amountIn!;
  const ra = wallet?.routerAllowance;
  const routerExpired = !!ra && ra.amount > 0n && ra.expiration < chain.blockTimestamp;
  const step2Done = !!ra && ok && ra.amount >= amountIn! && ra.expiration >= chain.blockTimestamp;

  const approve = () => {
    if (approveAmount === null) return;
    void tx.run(
      'Approve TOWN',
      () => approvePermit2Tx(network, approveAmount),
      () => `Permit2 may now move up to ${fmtTown(approveAmount)} of your TOWN. Now do step 2.`,
      'sell',
    );
  };
  const allow = () => {
    if (approveAmount === null) return;
    const expiration = now + ROUTER_ALLOWANCE_SECONDS;
    void tx.run(
      'Allow the router',
      () => allowRouterTx(network, approveAmount, BigInt(expiration)),
      () => `The router may now move up to ${fmtTown(approveAmount)} of your TOWN through Permit2, until ${fmtDateTime(expiration)}. Now sell.`,
      'sell',
    );
  };
  const sell = () => {
    if (!account || amountIn === null || minValue === null) return;
    const deadline = BigInt(now + BUY_DEADLINE_SECONDS);
    const sold = amountIn;
    const burned = sellFee ?? 0n;
    const about = estimate;
    void tx.run(
      'Sell TOWN',
      () => sellTx(network, sold, minValue, deadline),
      () =>
        `You sold ${fmtTown(sold)} TOWN${about !== null ? ` for about ${fmtEth(about, 6)} ETH` : ''}; ${fmtTown(burned)} TOWN of it was burned. Your rebates are unchanged.`,
      'sell',
    );
  };

  return (
    <div class="trade-form" aria-label="Sell TOWN for ETH">
      <div class="swap-box">
        <div class="swap-box-top">
          <label for="sell-town">You sell</label>
          {wallet && (
            <span class="muted small">
              Balance <span class="num">{fmtTown(wallet.townBalance)}</span> TOWN
            </span>
          )}
        </div>
        <div class="swap-box-main">
          <input
            id="sell-town"
            class="swap-input num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onInput={(e) => {
              setAmount((e.target as HTMLInputElement).value);
              setMinText(null);
            }}
            aria-invalid={amount !== '' && amountIn === null}
          />
          <span class="token-pill gold">TOWN</span>
        </div>
      </div>

      <div class="swap-arrow" aria-hidden="true">
        <ArrowDownIcon size={16} />
      </div>

      <div class="swap-box">
        <div class="swap-box-top">
          <span>You receive (estimate)</span>
          {wallet && (
            <span class="muted small">
              Balance <span class="num">{fmtEth(wallet.ethBalance)}</span> ETH
            </span>
          )}
        </div>
        <div class="swap-box-main">
          <output class="swap-output num" data-view="V4Quoter.quoteExactInputSingle" for="sell-town">
            {estimate !== null ? fmtEth(estimate, 6) : amountIn !== null && amountIn > 0n && !fresh ? '…' : '0'}
          </output>
          <span class="token-pill">ETH</span>
        </div>
      </div>

      {amount !== '' && amountIn === null && <FieldError>Enter an amount of TOWN, for example 1,000,000.</FieldError>}
      {overBalance && <FieldError>That is more TOWN than this wallet holds.</FieldError>}
      {fresh?.error && <FieldError>No estimate: {fresh.error}</FieldError>}

      <dl class="rows swap-rows">
        <div class="row">
          <dt>Sell fee (2%, burned)</dt>
          <dd class="num" data-view="TownHook.currentSellFeeBps">
            {sellBps === 0 || aboveFloor === 0n ? 'none: the supply is at 1,000,000 TOWN' : sellFee !== null ? `${fmtTown(sellFee)} TOWN` : '—'}
          </dd>
        </div>
        <div class="row">
          <dt>Pool fee (0.5%, to the locked liquidity)</dt>
          <dd class="num">{poolFee !== null ? `${fmtTown(poolFee)} TOWN` : '—'}</dd>
        </div>
        <div class="row">
          <dt>
            <label for="sell-min">Minimum received</label>
          </dt>
          <dd class="num">{minValue !== null ? `${fmtEth(minValue, 6)} ETH` : '—'}</dd>
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
              id="sell-min"
              class="small-input num"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Minimum ETH received, editable"
              value={minText ?? (autoMin !== null ? fmtUnits(autoMin, 18, 6) : '')}
              onInput={(e) => setMinText((e.target as HTMLInputElement).value)}
            />
          </dd>
        </div>
      </dl>
      {minText !== null && minValue === null && <FieldError>Enter the minimum in ETH, for example 0.05.</FieldError>}
      {minTooHigh && <FieldError>The minimum is above the estimate, so the sale would almost certainly be cancelled.</FieldError>}
      <p class="small muted swap-note">
        The estimate already takes off both fees. If you would receive less than the minimum, the sale is cancelled and you keep your TOWN.
      </p>
      <p class="small swap-note sell-rebates">Selling does not change your rebates: they count only the TOWN you buy.</p>

      {account ? (
        <>
          {routerExpired && (
            <p class="small muted swap-note">
              The router’s permission to move your TOWN expired on {fmtDateTime(ra!.expiration)}. Step 2 renews it.
            </p>
          )}
          <div class="btn-row sell-steps">
            <button type="button" class="btn btn-secondary" disabled={tx.busy || !ok || step1Done} onClick={approve}>
              {step1Done ? '1. TOWN approved' : '1. Approve TOWN'}
            </button>
            <button type="button" class="btn btn-secondary" disabled={tx.busy || !ok || !step1Done || step2Done} onClick={allow}>
              {step2Done ? '2. Router allowed' : '2. Allow the router'}
            </button>
            <button type="button" class="btn btn-primary" disabled={tx.busy || !ok || !step1Done || !step2Done || minValue === null} onClick={sell}>
              3. Sell
            </button>
          </div>
          {ok && (!step1Done || !step2Done) && (
            <p class="small muted swap-note">
              Steps 1 and 2 are needed once: they cover all <span class="num">{fmtTown(approveAmount ?? 0n)}</span> TOWN this wallet holds, for 30 days.
            </p>
          )}
        </>
      ) : (
        <ConnectPrompt what="your balance and sell" block />
      )}
      <TxStatus tx={tx} />
    </div>
  );
}
