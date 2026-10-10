import { useEffect, useState } from 'preact/hooks';
import { useApp, useChain, useTx, ConnectPrompt, Details, FieldError, Notice, PageHead, Chips, TxStatus, Uses } from '../components/ui';
import { amountError, amountOrNull } from '../lib/amount';
import { ArrowDownIcon } from '../components/icons';
import {
  afterClaimFee,
  antiSnipeActive,
  claimOpensOn,
  antiSnipeSecondsLeft,
  buyFee,
  dayRateBps,
  effectiveRateBps,
  ethSellFee,
  leftToBurn,
  limitReached,
  minCheck,
  minReceived,
  sellFeeMode,
  townSellFee,
} from '../lib/derive';
import type { ChainState } from '../data/types';
import { dayName, fmtBps, fmtClock, fmtDateTime, fmtEth, fmtTown, fmtUnits, shortAddress, fmtRate } from '../lib/format';
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

/**
 * A TOWN or ETH amount typed by the visitor, or null when it cannot be used (CR-72: a point for
 * decimals; a comma only between thousands, "1,000.5"; "2,5" is refused, never read as 25).
 */
const parseAmount = (s: string): bigint | null => amountOrNull(s, 18);
const parseEthInput = parseAmount;

/** One whole TOWN, and a millionth of an ETH: the precision the minimum-received fields are filled in at. */
const WHOLE_TOWN = 10n ** 18n;
const MICRO_ETH = 10n ** 12n;
const floorTo = (v: bigint, step: bigint) => (v / step) * step;

/** The minimum-received messages under a trade's rows (CR-72): 0 refused; more than 5% below the estimate, or above it, warned. */
function MinMessages({ min, estimate, text, unit, example, trade }: { min: bigint | null; estimate: bigint | null; text: string | null; unit: string; example: string; trade: 'buy' | 'sale' }) {
  const m = minCheck(min, estimate);
  const typedError = text !== null ? amountError(text, 18, `Enter the minimum in ${unit}, for example ${example}.`) : null;
  return (
    <>
      {typedError && <FieldError>{typedError}</FieldError>}
      {text !== null && text.trim() === '' && <FieldError>Enter the minimum in {unit}, for example {example}.</FieldError>}
      {m.zero && <FieldError>The minimum received cannot be 0: with no minimum, the {trade} is unprotected. Enter a minimum above 0.</FieldError>}
      {m.farBelow && <FieldError>More than 5% below the estimate: a bot can take the difference</FieldError>}
      {m.above && <FieldError>The minimum is above the estimate, so the {trade} would almost certainly be cancelled.</FieldError>}
    </>
  );
}

/** The latest of the chain's time and the clock, for deadlines and the Permit2 expiry. */
function nowSeconds(blockTimestamp: number): number {
  return Math.max(blockTimestamp, Math.floor(Date.now() / 1000));
}

/** The Trade page (CR-43): the site's own buy and sell forms; no link to trade elsewhere (CR-64). */
export function Trade({ sell: openSell }: { sell?: boolean }) {
  const chain = useChain();
  const { network } = useApp();
  const [mode, setMode] = useState<Mode>(openSell ? 'sell' : 'buy');
  useEffect(() => setMode(openSell ? 'sell' : 'buy'), [openSell]);
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
            <strong>Fees on a sell.</strong> 2% of every sell, in one of two currencies fixed for the whole day: burned in TOWN (2% of the TOWN sold), or
            sent to the treasury in ETH (2% of the ETH the sale brings in; 10% of it is kept for the owner). The fee is in ETH on a day after one that burned
            more TOWN than it paid out in rebates, and on every day once the supply is down to {fmtTown(chain.hook.BURN_FLOOR)} TOWN; once the rebate
            reserve is spent it is burned until then. Plus the pool’s 0.5% trading fee. The estimate already includes both. A sell takes away none of your
            rebate points; the day’s sells, counted with no names, go into the three-day lean that sets the next days’ rebate rate.
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

/**
 * Today's sell-fee currency in words (CR-56, CR-57, CR-80): the headline ("2% in TOWN, burned" or
 * "2% in ETH, to the treasury") and the one-line reason, from TownHook.sellFeeInEth(),
 * TownHook.burned(c-1) and BuyerRewards.emissionEstimate(c-1) (and reserveExhausted(), totalSupply,
 * BURN_FLOOR).
 */
export function sellFeeWords(chain: ChainState): { mode: string; reason: string } {
  const m = sellFeeMode(chain);
  const mode = m.inEth ? '2% in ETH, to the treasury' : '2% in TOWN, burned';
  const floor = fmtTown(chain.hook.BURN_FLOOR);
  let reason: string;
  if (m.reason === 'floor') reason = `The burn floor is reached: the supply is at ${floor} TOWN, so every sell pays its fee in ETH.`;
  else if (m.reason === 'reserve') reason = `The rebate reserve is spent, so the fee is burned until the supply reaches ${floor} TOWN.`;
  else if (m.reason === 'first-day') reason = `${dayName(0)} has no day before it, so the fee is burned.`;
  else {
    const b = m.burnedYesterday ?? 0n;
    const p = m.rebatesYesterday ?? 0n;
    const figures = `Yesterday (${dayName(m.yesterday!)}) burned ${fmtTown(b)} TOWN and paid ${fmtTown(p)} TOWN in rebates`;
    const more = b > p;
    // CR-80: the owner's words for a burning day ("inflation exceeded deflation"), and "matched" on
    // an exact tie, where nothing exceeded anything. The ETH day keeps "it burned more than it paid".
    const town = b === p ? 'inflation matched deflation' : 'inflation exceeded deflation';
    reason =
      more === m.inEth
        ? more
          ? `${figures}: it burned more than it paid, so today the fee is in ETH.`
          : `${figures}: ${town}, so today the fee is burned.`
        : `${figures}; TownHook fixed today’s fee at the day’s first sell.`;
  }
  return { mode, reason };
}

/** The sell form's line on today's sell-fee currency, with its reason (CR-56, CR-57). */
function SellFeeToday() {
  const chain = useChain();
  const c = chain.hook.currentCycle;
  const w = sellFeeWords(chain);
  return (
    <div
      class={`sell-mode${chain.hook.sellFeeInEth ? ' in-eth' : ''}`}
      data-view={`TownHook.sellFeeInEth; TownHook.burned(${c - 1}); BuyerRewards.emissionEstimate(${c - 1})`}
    >
      <p class="sell-mode-title">
        Today’s sell fee: <span class="sell-mode-value">{w.mode}</span>
      </p>
      <p class="small muted">{w.reason}</p>
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
  // Cut to whole TOWN, as the field shows it, so the field and the amount used are the same.
  const autoMin = estimate !== null ? floorTo(minReceived(estimate, slippage), WHOLE_TOWN) : null;
  const minValue = minText !== null ? parseAmount(minText) : autoMin;
  const c = chain.hook.currentCycle;
  // Today's rate, BuyerRewards.rateBps(today) (CR-47), or less once the day's limit is shared.
  const rate = effectiveRateBps(chain, c);
  const rebate = estimate !== null ? afterClaimFee(chain, (estimate * BigInt(Math.round(rate * 100))) / 1_000_000n) : null;
  const overBalance = !!wallet && amountIn !== null && amountIn > wallet.ethBalance;
  const mins = minCheck(minValue, estimate);

  const buy = () => {
    if (!account || amountIn === null || minValue === null || mins.zero) return;
    const deadline = BigInt(nowSeconds(chain.blockTimestamp) + BUY_DEADLINE_SECONDS);
    void tx.run(
      'Buy TOWN',
      () => buyTx(network, account, amountIn, minValue, deadline),
      () => `Your buy went through and is counted for your wallet on ${dayName(c)}. Its rebate can be claimed from ${dayName(claimOpensOn(c))}.`,
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
        <Uses value={amountIn} unit="ETH" />
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

      {amountIn === null && <FieldError>{amountError(amount, 18, 'Enter an amount of ETH, for example 0.1.') ?? 'Enter an amount of ETH, for example 0.1.'}</FieldError>}
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
              aria-invalid={minText !== null && minValue === null}
              value={minText ?? (autoMin !== null ? fmtUnits(autoMin, 18, 0) : '')}
              onInput={(e) => setMinText((e.target as HTMLInputElement).value)}
            />
            <Uses value={minValue} unit="TOWN" />
          </dd>
        </div>
        <div class="row strong">
          <dt>Rebate this buy can earn</dt>
          <dd class="num accent-text">{rebate !== null ? `up to ${fmtTown(rebate)} TOWN` : '—'}</dd>
        </div>
      </dl>
      <MinMessages min={minValue} estimate={estimate} text={minText} unit="TOWN" example="150,000" trade="buy" />
      <p class="small muted swap-note">
        Rebate after the {fmtBps(chain.rewards.CLAIM_FEE_BPS)} claim fee, at {dayName(c)}’s rate of{' '}
        <span class="num" data-view={`BuyerRewards.rateBps(${c})`}>
          {fmtBps(dayRateBps(chain, c))}
        </span>
        {limitReached(chain, c) ? <> ({fmtRate(rate)} so far: the day’s limit is reached)</> : null}, claimable from {dayName(claimOpensOn(c))} within the
        day’s limit. If you would receive less than
        the minimum, the buy is cancelled and you keep your ETH.
      </p>

      {account ? (
        <button
          type="button"
          class="btn btn-primary btn-block"
          disabled={tx.busy || amountIn === null || amountIn === 0n || overBalance || minValue === null || mins.zero}
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

  // The sell fee, in today's currency (CR-56, CR-57; spec "TownHook -> Fees"). TOWN mode: 2% of the
  // TOWN sold, burned before the swap, never taking the supply below the burn floor; the pool then
  // swaps the other 98%. ETH mode: the pool swaps all the TOWN and 2% of the ETH it pays out goes to the
  // treasury, so the seller receives 2% less ETH. The quoter runs the swap through TownHook, so its
  // estimate (and the minimum received taken from it, which goes to the router) already has the fee
  // off in the right currency; the rows below only show it.
  const inEth = chain.hook.sellFeeInEth;
  const estimate = fresh?.out ?? null;
  const townFee = !inEth && amountIn !== null ? townSellFee(chain, amountIn) : null;
  const ethFee = inEth && estimate !== null ? ethSellFee(chain, estimate) : null;
  const poolFee = amountIn !== null && (inEth || townFee !== null) ? ((amountIn - (townFee ?? 0n)) * POOL_FEE_PIPS) / 1_000_000n : null;
  // Cut to six decimals, as the field shows it, so the field and the amount used are the same.
  const autoMin = estimate !== null ? floorTo(minReceived(estimate, slippage), MICRO_ETH) : null;
  const minValue = minText !== null ? parseEthInput(minText) : autoMin;
  const overBalance = !!wallet && amountIn !== null && amountIn > wallet.townBalance;
  const mins = minCheck(minValue, estimate);
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
    if (!account || amountIn === null || minValue === null || mins.zero) return;
    const deadline = BigInt(now + BUY_DEADLINE_SECONDS);
    const sold = amountIn;
    const burned = townFee ?? 0n;
    const toTreasury = ethFee;
    const paidInEth = inEth;
    const about = estimate;
    void tx.run(
      'Sell TOWN',
      () => sellTx(network, sold, minValue, deadline),
      () =>
        `You sold ${fmtTown(sold)} TOWN${about !== null ? ` for about ${fmtEth(about, 6)} ETH` : ''}; ${
          paidInEth
            ? `${toTreasury !== null ? `about ${fmtEth(toTreasury, 6)} ETH` : '2% of the ETH'} of the sale, the sell fee, went to the treasury`
            : `${fmtTown(burned)} TOWN of it was burned`
        }. Your rebates are unchanged.`,
      'sell',
    );
  };

  return (
    <div class="trade-form" aria-label="Sell TOWN for ETH">
      <SellFeeToday />
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
        <Uses value={amountIn} unit="TOWN" />
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

      {amount.trim() !== '' && amountIn === null && <FieldError>{amountError(amount, 18, 'Enter an amount of TOWN, for example 1,000,000.')}</FieldError>}
      {overBalance && <FieldError>That is more TOWN than this wallet holds.</FieldError>}
      {fresh?.error && <FieldError>No estimate: {fresh.error}</FieldError>}

      <dl class="rows swap-rows">
        <div class="row">
          <dt>{inEth ? 'Sell fee (2% of the ETH, to the treasury)' : 'Sell fee (2%, burned)'}</dt>
          <dd class="num" data-view="TownHook.sellFeeInEth, currentSellFeeBps">
            {inEth
              ? ethFee !== null
                ? `≈ ${fmtEth(ethFee, 6)} ETH`
                : '—'
              : leftToBurn(chain) === 0n
                ? `none: the supply is at ${fmtTown(chain.hook.BURN_FLOOR)} TOWN`
                : townFee !== null
                  ? `${fmtTown(townFee)} TOWN`
                  : '—'}
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
              aria-invalid={minText !== null && minValue === null}
              value={minText ?? (autoMin !== null ? fmtUnits(autoMin, 18, 6) : '')}
              onInput={(e) => setMinText((e.target as HTMLInputElement).value)}
            />
            <Uses value={minValue} unit="ETH" />
          </dd>
        </div>
      </dl>
      <MinMessages min={minValue} estimate={estimate} text={minText} unit="ETH" example="0.05" trade="sale" />
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
            <button type="button" class="btn btn-primary" disabled={tx.busy || !ok || !step1Done || !step2Done || minValue === null || mins.zero} onClick={sell}>
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
