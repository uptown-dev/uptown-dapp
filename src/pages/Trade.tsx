import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useApp, useChain, useTx, ConnectPrompt, Details, FieldError, PageHead, Chips, TxStatus, Usd, Uses } from '../components/ui';
import { RunStatus, Stop, readUntil, useRun, useWatch } from '../components/steps';
import { amountError, amountOrNull } from '../lib/amount';
import { ArrowDownIcon } from '../components/icons';
import {
  afterClaimFee,
  claimOpensOn,
  buyFee,
  ethUsdPrice,
  dayRateBps,
  effectiveRateBps,
  limitReached,
  minCheck,
  minReceived,
  ONE_SKYLINE,
  sellFeeMode,
  sellFees,
  skylinePriceWei,
  usdOf,
  type SellFeeState,
} from '../lib/derive';
import type { ChainState } from '../data/types';
import { dayName, fmtBps, fmtDateTime, fmtDuration, fmtEth, fmtInt, fmtTown, fmtUnits, fmtUsd, fmtUsd8, shortAddress, fmtRate } from '../lib/format';
import { quoteBuy, quoteSell, readSellApprovals, readTownBalance, type SellApprovals } from '../lib/reads';
import { BUY_DEADLINE_SECONDS, ROUTER_ALLOWANCE_SECONDS, allowRouterTx, approvePermit2Tx, buyTx, sellTx } from '../lib/actions';
import { BUY_GAS_ALLOWANCE, BUY_GAS_MARGIN, QUICK_SHARES, buyGasReserve, buyShare, quickText, shareOf, type QuickShare } from '../lib/quick';
import { explainError } from '../lib/errors';

const SLIPPAGE = [
  { value: 50, label: '0.5%' },
  { value: 100, label: '1%' },
  { value: 200, label: '2%' },
];

type Mode = 'buy' | 'sell';

/**
 * A SKYLINE or ETH amount typed by the visitor, or null when it cannot be used (CR-72: a point for
 * decimals; a comma only between thousands, "1,000.5"; "2,5" is refused, never read as 25).
 */
const parseAmount = (s: string): bigint | null => amountOrNull(s, 18);
const parseEthInput = parseAmount;

/** One whole SKYLINE, and a millionth of an ETH: the precision the minimum-received fields are filled in at. */
const WHOLE_SKYLINE = 10n ** 18n;
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

/**
 * The 25%, 50%, 75% and 100% buttons under an amount field (CR-82 item 4). Shown only with a wallet
 * connected on the right network; pressing one replaces the field's text, which stays editable.
 */
function QuickAmounts({ label, off, onPick, children }: { label: string; off: boolean; onPick: (pct: QuickShare) => void; children?: ComponentChildren }) {
  return (
    <div class="quick">
      <div class="quick-row" role="group" aria-label={label}>
        {QUICK_SHARES.map((p) => (
          <button type="button" class="chip quick-btn" key={p} disabled={off} onClick={() => onPick(p)}>
            {p}%
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/** The network's current maximum fee per gas, read again with every new block while `on`; null until read. */
function useMaxFee(on: boolean): bigint | null {
  const chain = useChain();
  const { client } = useApp();
  const [fee, setFee] = useState<bigint | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    client.estimateFeesPerGas().then(
      (f) => live && setFee(f.maxFeePerGas ?? null),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [on, chain.blockNumber]);
  return fee;
}

/** A fee per gas in gwei, for the line on the gas kept back. */
const fmtGwei = (wei: bigint) => fmtUnits(wei, 9, wei < 10n ** 9n ? 4 : 2);


/** A sale's transactions, in order: the approvals still missing, then the sale (CR-82). */
function sellPlan(approve: boolean, allow: boolean): { id: string; label: string }[] {
  return [
    ...(approve ? [{ id: 'approve', label: 'Approve SKYLINE' }] : []),
    ...(allow ? [{ id: 'allow', label: 'Allow the router' }] : []),
    { id: 'sell', label: 'Sell SKYLINE' },
  ];
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
      <PageHead title="Trade SKYLINE" lead="Buy or sell SKYLINE for ETH. Every buy here is counted for your wallet, so its rebate is yours." />
      <section class="card swap-card" aria-label="Trade SKYLINE">
        <SkylinePrice />
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
        <p class="small muted">Other SKYLINE pools, outside the official one, pay no fees and earn no rebates.</p>
      </div>
      <Details>
        <ul class="plain-list">
          <li>
            <strong>How a trade is sent.</strong> One exact-input swap through Uniswap’s Universal Router (version 2.1.2,{' '}
            <code>{network.uniswap ? `${network.uniswap.universalRouter.slice(0, 10)}…` : '—'}</code>), with your minimum received as the limit. A buy names
            your wallet in the swap. Your wallet shows each transaction for you to approve.
          </li>
          <li>
            <strong>Approvals before a first sell.</strong> The router takes your SKYLINE through Uniswap’s Permit2 contract (
            <code>{network.uniswap ? shortAddress(network.uniswap.permit2) : '—'}</code>), so a first sell needs two approvals, each its own
            transaction, sent one after the other by the sell button: SKYLINE to Permit2, once and without a limit, then Permit2 to the router, without a limit
            for 30 days. Together they cost about 94,000 gas on Ethereum. Later sells need no new approval; every 30 days the router’s permission is renewed
            with one transaction. The router can move your SKYLINE only in a trade you send yourself.
          </li>
          <li>
            <strong>Fees on a buy.</strong> The buy fee ({fmtBps(chain.hook.currentBuyFeeBps)} of the ETH, to the treasury; 10% of it is kept for the owner)
            and the pool’s 0.5% trading fee, which goes to the locked liquidity and is collected by the owner. The estimate already includes both. Gas is
            paid separately. The buy fee is the same from the first second of trading; there is no higher fee at the launch.
          </li>
          <li>
            <strong>Fees on a sell.</strong> 2% of every sell, in one of two currencies fixed for the whole day: burned in SKYLINE (2% of the SKYLINE sold), or
            sent to the treasury in ETH (2% of the ETH the sale brings in; 10% of it is kept for the owner). The fee is in ETH on a day after one that burned
            more SKYLINE than it paid out in rebates, and on every day once the supply is down to {fmtTown(chain.hook.BURN_FLOOR)} SKYLINE; once the rebate
            reserve is spent it is burned until then. Plus the pool’s 0.5% trading fee. The estimate already includes both. A sell takes away none of your
            rebate points; the day’s sells, counted with no names, go into the three-day lean that sets the next days’ rebate rate.
          </li>
          <li>
            <strong>Who gets the rebate.</strong> A buy made here names your wallet, so it is always credited to you. A buy through another app is credited to
            the wallet that app names, or else to whoever sent the transaction: an aggregator, a smart-account service or a relayer may be credited instead of
            you.
          </li>
          <li>
            <strong>The right pool.</strong> Only the SKYLINE pool that runs through SkylineHook counts. SKYLINE’s address: <code class="break">{town ?? '—'}</code>.
          </li>
        </ul>
      </Details>
    </div>
  );
}

/**
 * CR-95, CR-102: SKYLINE's price, at the top of the swap card. The pool's current price
 * (StateView.getSlot0, SKYLINE per ETH) as gwei per SKYLINE, and in dollars at Chainlink's ETH/USD
 * price, read straight from the feed; when the feed's answer is missing, not positive or more than 3
 * hours old the dollar price is left out and the line says why. An estimate for reading only.
 */
export function SkylinePrice() {
  const chain = useChain();
  const wei = skylinePriceWei(chain);
  if (wei === null) return null;
  const p = ethUsdPrice(chain);
  const one = usdOf(chain, ONE_SKYLINE, 'SKYLINE');
  return (
    <p class="price-line" data-view="StateView.getSlot0(poolId).sqrtPriceX96; Chainlink ETH/USD.latestRoundData" data-eth-usd={p.ok ? 'ok' : p.reason}>
      <span>SKYLINE price</span>
      {one !== null && (
        <span class="price-value num" data-usd={one.usd.toString()}>
          ≈ {fmtUsd(one.usd, true)}
        </span>
      )}
      <span class="num" data-wei={wei.toString()}>
        {fmtGwei(wei)} gwei per SKYLINE in the pool
      </span>
      <span class="price-source">{priceSourceWords(chain)}</span>
    </p>
  );
}

/**
 * Where the dollar figures' ETH price stands, in words (CR-102): Chainlink's price; or why no dollar
 * figure is shown: no answer, an answer that is not positive, or an answer more than 3 hours old.
 */
export function priceSourceWords(chain: ChainState): string {
  const p = ethUsdPrice(chain);
  if (p.ok) return `at ETH ${fmtUsd8(p.price)}, Chainlink’s price`;
  if (p.reason === 'stale')
    return `Chainlink’s ETH price was last updated ${fmtDuration(chain.blockTimestamp - (p.updatedAt ?? 0))} ago, more than 3 hours, so no dollar figures are shown.`;
  if (p.reason === 'not-positive') return 'Chainlink’s ETH price feed reports no usable price, so no dollar figures are shown.';
  return 'No ETH price is reported, so no dollar figures are shown.';
}

/** The headline for each of the four states of SkylineHook.sellFeeShares() (CR-93). */
export const SELL_FEE_HEADLINE: Record<SellFeeState, string> = {
  burn: '2% in SKYLINE, burned',
  'burn-reserve': '2% in SKYLINE: half burned, half to the rebate reserve',
  eth: '2% in ETH, to the treasury',
  split: '1% in SKYLINE to the rebate reserve, 1% in ETH to the treasury',
};

/**
 * The sentence for the day-401 state (CR-93, F9u): why half of a SKYLINE fee goes to the reserve. Put
 * to the owner in the F9u handoff; it ships as written unless he changes it.
 */
export function reserveShareSentence(chain: ChainState): string {
  return `From ${dayName(chain.hook.RESERVE_FEE_START)} half of the fee is burned and the other half refills the rebate reserve, which pays the buyers’ rebates.`;
}

/**
 * Today's sell fee in words (CR-56, CR-57, CR-80, CR-93): the headline (how the next sell's 2%
 * divides, from SkylineHook.sellFeeShares()) and the reason, from SkylineHook.burned(c-1),
 * BuyerRewards.emissionEstimate(c-1), reserveExhausted() and BURN_FLOOR. The owner's CR-80 sentences
 * stay word for word in the states they were written for (2% burned, 2% in ETH); the day-401 state
 * and the floor's split state have their own (F9u, for the owner's approval).
 */
export function sellFeeWords(chain: ChainState): { mode: string; reason: string } {
  const m = sellFeeMode(chain);
  const mode = SELL_FEE_HEADLINE[m.state];
  const floor = fmtTown(chain.hook.BURN_FLOOR);
  // From day 401 a SKYLINE-mode fee is half burned and half sent to the reserve: the reason why SKYLINE
  // keeps its figures and ends "in SKYLINE", and the day-401 sentence follows it.
  const half = m.state === 'burn-reserve';
  let reason: string;
  if (m.reason === 'floor')
    reason = `The burn floor is reached: the supply is at ${floor} SKYLINE, so nothing more is burned and every sell pays 1% in SKYLINE to the rebate reserve and 1% in ETH to the treasury.`;
  else if (m.reason === 'reserve')
    reason = half
      ? `The rebate reserve is spent, so the fee is in SKYLINE until the supply reaches ${floor} SKYLINE.`
      : `The rebate reserve is spent, so the fee is burned until the supply reaches ${floor} SKYLINE.`;
  else if (m.reason === 'first-day') reason = `${dayName(0)} has no day before it, so the fee is burned.`;
  else {
    const b = m.burnedYesterday ?? 0n;
    const p = m.rebatesYesterday ?? 0n;
    const figures = `Yesterday (${dayName(m.yesterday!)}) burned ${fmtTown(b)} SKYLINE and paid ${fmtTown(p)} SKYLINE in rebates`;
    const more = b > p;
    // CR-80: the owner's words for a burning day ("inflation exceeded deflation"), and "matched" on
    // an exact tie, where nothing exceeded anything. The ETH day keeps "it burned more than it paid".
    const town = b === p ? 'inflation matched deflation' : 'inflation exceeded deflation';
    reason =
      more === m.inEth
        ? more
          ? `${figures}: it burned more than it paid, so today the fee is in ETH.`
          : `${figures}: ${town}, so today the fee is ${half ? 'in SKYLINE' : 'burned'}.`
        : `${figures}; SkylineHook fixed today’s fee at the day’s first sell.`;
  }
  if (half) reason += ` ${reserveShareSentence(chain)}`;
  return { mode, reason };
}

/**
 * The sell form's fee rows (CR-93): one row per part of the 2% in today's state, each saying where it
 * goes. SKYLINE mode before day 401: "Sell fee (2%, burned)". From day 401: the 2% in SKYLINE with its two
 * halves. ETH mode: "Sell fee (2% of the ETH, to the treasury)". Split mode: the SKYLINE part and the
 * ETH part. A sell that reaches the burn floor shows how much of its 2% is burned and how much goes
 * to the reserve.
 */
function SellFeeRows({ state, fees }: { state: SellFeeState; fees: ReturnType<typeof sellFees> | null }) {
  const view = 'SkylineHook.sellFeeShares, currentSellFeeBps';
  const town = (v: bigint | undefined) => (v !== undefined ? `${fmtTown(v)} SKYLINE` : '—');
  const eth = (v: bigint | null | undefined) => (v !== null && v !== undefined ? `≈ ${fmtEth(v, 6)} ETH` : '—');
  const parts = !!fees && fees.townFee > 0n && (fees.reachesFloor || state === 'burn-reserve');
  if (state === 'eth')
    return (
      <div class="row" data-fee="eth">
        <dt>Sell fee (2% of the ETH, to the treasury)</dt>
        <dd class="num" data-view={view}>
          {eth(fees?.ethFee)}
          <Usd amount={fees?.ethFee ?? null} unit="ETH" block />
        </dd>
      </div>
    );
  if (state === 'split')
    return (
      <>
        <div class="row" data-fee="town">
          <dt>Sell fee in SKYLINE (1%, to the rebate reserve)</dt>
          <dd class="num" data-view={view}>
            {town(fees?.townFee)}
            <Usd amount={fees?.townFee ?? null} unit="SKYLINE" block />
          </dd>
        </div>
        <div class="row" data-fee="eth">
          <dt>Sell fee in ETH (1% of the ETH, to the treasury)</dt>
          <dd class="num" data-view={view}>
            {eth(fees?.ethFee)}
            <Usd amount={fees?.ethFee ?? null} unit="ETH" block />
          </dd>
        </div>
      </>
    );
  return (
    <div class="row" data-fee="town">
      <dt>{state === 'burn' && !fees?.reachesFloor ? 'Sell fee (2%, burned)' : state === 'burn' ? 'Sell fee (2%, in SKYLINE)' : 'Sell fee (2%: half burned, half to the rebate reserve)'}</dt>
      <dd class="num" data-view={view}>
        {town(fees?.townFee)}
        <Usd amount={fees?.townFee ?? null} unit="SKYLINE" block />
        {parts && fees && (
          <span class="fee-parts small muted">
            {fmtTown(fees.burned)} burned, {fmtTown(fees.toReserve)} to the reserve
            {fees.reachesFloor ? ': this sale reaches the burn floor' : ''}
          </span>
        )}
      </dd>
    </div>
  );
}

/** What a sale's fee did, for the message after it (CR-93). */
function soldFeeWords(f: ReturnType<typeof sellFees>, state: SellFeeState): string {
  const toTreasury = f.ethFee !== null ? `about ${fmtEth(f.ethFee, 6)} ETH` : null;
  if (state === 'eth') return `${toTreasury ?? '2% of the ETH'} of the sale, the sell fee, went to the treasury`;
  if (state === 'split')
    return `${fmtTown(f.toReserve)} SKYLINE of it went to the rebate reserve and ${toTreasury ?? '1% of the ETH'} of the sale to the treasury`;
  if (f.toReserve > 0n) return `${fmtTown(f.burned)} SKYLINE of it was burned and ${fmtTown(f.toReserve)} SKYLINE went to the rebate reserve`;
  return `${fmtTown(f.burned)} SKYLINE of it was burned`;
}

/** The sell form's line on today's sell fee, with its reason (CR-56, CR-57, CR-93). */
function SellFeeToday() {
  const chain = useChain();
  const c = chain.hook.currentCycle;
  const w = sellFeeWords(chain);
  const state = sellFeeMode(chain).state;
  return (
    <div
      class={`sell-mode${state === 'eth' ? ' in-eth' : ''}`}
      data-state={state}
      data-view={`SkylineHook.sellFeeShares; SkylineHook.burned(${c - 1}); BuyerRewards.emissionEstimate(${c - 1})`}
    >
      <p class="sell-mode-title">
        Today’s sell fee: <span class="sell-mode-value">{w.mode}</span>
      </p>
      <p class="small muted">{w.reason}</p>
    </div>
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
  const { wallet, account, network, client, wrongNetwork } = useApp();
  const tx = useTx();
  const [amount, setAmount] = useState('0.1');
  const [slippage, setSlippage] = useState(100);
  const [minText, setMinText] = useState<string | null>(null);

  const amountIn = parseEthInput(amount);
  const fresh = useQuote(active, amountIn, (a) => quoteBuy(client, network, a, account), (e) => explainError(e, 'buy').message, [account]);

  const feeBps = chain.hook.currentBuyFeeBps;
  const fee = amountIn !== null ? buyFee(amountIn, feeBps) : null;
  const estimate = fresh?.out ?? null;
  // Cut to whole SKYLINE, as the field shows it, so the field and the amount used are the same.
  const autoMin = estimate !== null ? floorTo(minReceived(estimate, slippage), WHOLE_SKYLINE) : null;
  const minValue = minText !== null ? parseAmount(minText) : autoMin;
  const c = chain.hook.currentCycle;
  // Today's rate, BuyerRewards.rateBps(today) (CR-47), or less once the day's limit is shared.
  const rate = effectiveRateBps(chain, c);
  const rebate = estimate !== null ? afterClaimFee(chain, (estimate * BigInt(Math.round(rate * 100))) / 1_000_000n) : null;
  const overBalance = !!wallet && amountIn !== null && amountIn > wallet.ethBalance;
  const mins = minCheck(minValue, estimate);

  // CR-82 item 4: the quick amounts keep back the buy's gas (BUY_GAS_ALLOWANCE times the current
  // maximum fee per gas, times BUY_GAS_MARGIN), so a 100% buy still has its gas.
  const quickOn = !!wallet && !!account && !wrongNetwork;
  const maxFee = useMaxFee(active && quickOn);
  const keep = maxFee !== null ? buyGasReserve(maxFee) : null;
  const tooLittle = !!wallet && keep !== null && wallet.ethBalance <= keep;
  const pick = async (pct: QuickShare) => {
    if (!wallet || !account) return;
    let balance = wallet.ethBalance;
    let fee = maxFee;
    try {
      // The balance and the fee at the moment of the press.
      [balance, fee] = await Promise.all([client.getBalance({ address: account }), client.estimateFeesPerGas().then((f) => f.maxFeePerGas ?? null)]);
    } catch {
      /* the figures last read */
    }
    if (fee === null) return;
    const v = buyShare(balance, fee, pct);
    if (v === null) return;
    setAmount(quickText(v));
    setMinText(null);
  };

  const buy = () => {
    if (!account || amountIn === null || minValue === null || mins.zero) return;
    const deadline = BigInt(nowSeconds(chain.blockTimestamp) + BUY_DEADLINE_SECONDS);
    void tx.run(
      'Buy SKYLINE',
      () => buyTx(network, account, amountIn, minValue, deadline),
      () => `Your buy went through and is counted for your wallet on ${dayName(c)}. Its rebate can be claimed from ${dayName(claimOpensOn(c))}.`,
      'buy',
    );
  };

  return (
    <div class="trade-form" aria-label="Buy SKYLINE with ETH">
      <div class="swap-box">
        <div class="swap-box-top">
          <label for="buy-eth">You pay</label>
          {wallet && (
            <span class="muted small">
              Balance <span class="num">{fmtEth(wallet.ethBalance)}</span> ETH <Usd amount={wallet.ethBalance} unit="ETH" paren />
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
        {quickOn && (
          <QuickAmounts label="Fill in a share of your ETH, after the gas kept back" off={keep === null || tooLittle} onPick={(p) => void pick(p)}>
            <p
              class="quick-note small muted"
              data-keep={keep?.toString() ?? ''}
              data-max-fee={maxFee?.toString() ?? ''}
              title={maxFee !== null ? `${fmtInt(Number(BUY_GAS_ALLOWANCE))} gas at ${fmtGwei(maxFee)} gwei, times ${BUY_GAS_MARGIN}` : undefined}
            >
              {keep === null
                ? 'Reading the network’s gas price…'
                : tooLittle
                  ? <>Off: this wallet’s {fmtEth(wallet!.ethBalance, 6)} ETH does not cover the {fmtEth(keep, 6)} ETH <Usd amount={keep} unit="ETH" paren /> kept back for the buy’s gas.</>
                  : <>Keeps back {fmtEth(keep, 6)} ETH <Usd amount={keep} unit="ETH" paren /> for the buy’s gas ({fmtInt(Number(BUY_GAS_ALLOWANCE))} gas at {fmtGwei(maxFee!)} gwei, times {BUY_GAS_MARGIN}).</>}
            </p>
          </QuickAmounts>
        )}
      </div>

      <div class="swap-arrow" aria-hidden="true">
        <ArrowDownIcon size={16} />
      </div>

      <div class="swap-box">
        <div class="swap-box-top">
          <span>You receive (estimate)</span>
          {wallet && (
            <span class="muted small">
              Balance <span class="num">{fmtTown(wallet.townBalance)}</span> SKYLINE <Usd amount={wallet.townBalance} unit="SKYLINE" paren />
            </span>
          )}
        </div>
        <div class="swap-box-main">
          <output class="swap-output num" data-view="V4Quoter.quoteExactInputSingle" for="buy-eth">
            {estimate !== null ? fmtTown(estimate) : amountIn !== null && amountIn > 0n && !fresh ? '…' : '0'}
          </output>
          <span class="token-pill gold">SKYLINE</span>
        </div>
        <span class="swap-output-usd">
          <Usd amount={estimate} unit="SKYLINE" />
        </span>
      </div>

      {amountIn === null && <FieldError>{amountError(amount, 18, 'Enter an amount of ETH, for example 0.1.') ?? 'Enter an amount of ETH, for example 0.1.'}</FieldError>}
      {overBalance && <FieldError>That is more ETH than this wallet holds.</FieldError>}
      {fresh?.error && <FieldError>No estimate: {fresh.error}</FieldError>}

      <dl class="rows swap-rows">
        <div class="row">
          <dt>Buy fee ({fmtBps(feeBps)}, to the treasury)</dt>
          <dd class="num" data-view="SkylineHook.currentBuyFeeBps">
            {fee !== null ? `${fmtEth(fee)} ETH` : '—'}
            <Usd amount={fee} unit="ETH" block />
          </dd>
        </div>
        <div class="row">
          <dt>
            <label for="buy-min">Minimum received</label>
          </dt>
          <dd class="num">
            {minValue !== null ? `${fmtTown(minValue)} SKYLINE` : '—'}
            <Usd amount={minValue} unit="SKYLINE" block />
          </dd>
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
              aria-label="Minimum SKYLINE received, editable"
              aria-invalid={minText !== null && minValue === null}
              value={minText ?? (autoMin !== null ? fmtUnits(autoMin, 18, 0) : '')}
              onInput={(e) => setMinText((e.target as HTMLInputElement).value)}
            />
            <Uses value={minValue} unit="SKYLINE" />
          </dd>
        </div>
        <div class="row strong">
          <dt>Rebate this buy can earn</dt>
          <dd class="num accent-text">
            {rebate !== null ? `up to ${fmtTown(rebate)} SKYLINE` : '—'}
            <Usd amount={rebate} unit="SKYLINE" block />
          </dd>
        </div>
      </dl>
      <MinMessages min={minValue} estimate={estimate} text={minText} unit="SKYLINE" example="150,000" trade="buy" />
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
          {tx.busy ? 'Buying…' : 'Buy SKYLINE'}
        </button>
      ) : (
        <ConnectPrompt what="your balance and buy" block />
      )}
      <TxStatus tx={tx} />
    </div>
  );
}

function SellForm({ active }: { active: boolean }) {
  const chain = useChain();
  const { wallet, account, network, client, wrongNetwork } = useApp();
  const run = useRun();
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(100);
  const [minText, setMinText] = useState<string | null>(null);

  const amountIn = parseAmount(amount);
  const fresh = useQuote(active, amountIn, (a) => quoteSell(client, network, a), (e) => explainError(e, 'sell').message, []);

  // The sell fee, in today's state (CR-56, CR-57, CR-93; spec "SkylineHook -> Fees"), from
  // SkylineHook.sellFeeShares(). SKYLINE mode: 2% of the SKYLINE sold, taken before the swap, burned (from day
  // 401 half burned and half to the rebate reserve); the pool then swaps the other 98%. ETH mode: the
  // pool swaps all the SKYLINE and 2% of the ETH it pays out goes to the treasury. Split mode, at the
  // floor: 1% of the SKYLINE to the reserve before the swap, and 1% of the ETH to the treasury. The
  // quoter runs the swap through SkylineHook, so its estimate (and the minimum received taken from it,
  // which goes to the router) already has every fee off, in every state; the rows below only show
  // where the fees go.
  const feeState = sellFeeMode(chain).state;
  const estimate = fresh?.out ?? null;
  const fees = amountIn !== null ? sellFees(chain, amountIn, estimate) : null;
  const poolFee = fees?.poolFee ?? null;
  // Cut to six decimals, as the field shows it, so the field and the amount used are the same.
  const autoMin = estimate !== null ? floorTo(minReceived(estimate, slippage), MICRO_ETH) : null;
  const minValue = minText !== null ? parseEthInput(minText) : autoMin;
  const overBalance = !!wallet && amountIn !== null && amountIn > wallet.townBalance;
  const mins = minCheck(minValue, estimate);
  const ok = amountIn !== null && amountIn > 0n && !overBalance;

  // The two approvals (Permit2, on-chain transactions, no signed message), without a limit as the
  // Uniswap app gives them (CR-83): SKYLINE to Permit2 once ever, then Permit2 to the router for 30 days.
  // A step counts as done when the allowance on chain covers the amount (and, for the router, has not
  // expired), so a wallet holding older, smaller approvals is asked once more.
  const quickOn = !!wallet && !!account && !wrongNetwork;
  const needApprove = !!wallet && ok && wallet.townAllowanceToPermit2 < amountIn!;
  const ra = wallet?.routerAllowance;
  const routerExpired = !!ra && ra.amount > 0n && ra.expiration < chain.blockTimestamp;
  const needAllow = !!wallet && ok && !(!!ra && ra.amount >= amountIn! && ra.expiration >= chain.blockTimestamp);
  const plan = sellPlan(needApprove, needAllow);
  const label = needApprove ? 'Approve and sell' : needAllow ? (routerExpired ? 'Renew and sell' : 'Allow the router and sell') : 'Sell SKYLINE';

  // CR-82: the run stops, sending nothing more, if any of these change while it goes on.
  useWatch(run, { amount, minimum: minText ?? `automatic, ${slippage}`, page: active ? 'shown' : 'hidden' });

  const pick = async (pct: QuickShare) => {
    if (!wallet || !account) return;
    let balance = wallet.townBalance;
    try {
      balance = await readTownBalance(client, network, account); // the balance at the moment of the press
    } catch {
      /* the figure last read */
    }
    setAmount(quickText(shareOf(balance, pct)));
    setMinText(null);
  };

  const sell = () => {
    if (!account || amountIn === null || minValue === null || mins.zero) return;
    const from = account;
    const sold = amountIn;
    // The minimum the visitor saw (their own or the automatic one) is kept for the sale.
    const min = minValue;
    const shownEstimate = estimate;
    void run.start(
      'Sell SKYLINE',
      plan,
      async (r) => {
        const read = () => readSellApprovals(client, network, from);
        const missing = (s: SellApprovals) => ({
          approve: s.toPermit2 < sold,
          allow: s.router.amount < sold || s.router.expiration < s.blockTimestamp,
        });
        // What is still missing, read now: approvals already on chain are not asked for again.
        let s = await read();
        const m = missing(s);
        r.plan(sellPlan(m.approve, m.allow));
        if (m.approve) {
          await r.send('approve', () => approvePermit2Tx(network));
          s = await readUntil(r, read, (x) => !missing(x).approve, 'the sale');
        }
        if (m.allow) {
          await r.send('allow', () => allowRouterTx(network, BigInt(nowSeconds(s.blockTimestamp) + ROUTER_ALLOWANCE_SECONDS)));
          s = await readUntil(r, read, (x) => !missing(x).allow, 'the sale');
        }
        // The sale is prepared now, not when the button was pressed: the balance and both approvals
        // read again, a fresh estimate after any approval, and a fresh deadline.
        r.check();
        const f = await read();
        if (f.balance < sold) throw new Stop(`This wallet now holds ${fmtTown(f.balance)} SKYLINE, less than the ${fmtTown(sold)} SKYLINE to sell, so the sale was not sent.`, 'Balance');
        const fm = missing(f);
        if (fm.approve || fm.allow) throw new Stop('The approvals on chain do not cover this sale yet, so it was not sent.', 'Approvals');
        let about = shownEstimate;
        if (r.confirmed() > 0) {
          const now = await quoteSell(client, network, sold);
          r.check();
          if (now < min)
            throw new Stop(
              `The price moved while the approvals confirmed: the estimate is now ${fmtEth(now, 6)} ETH, below the minimum of ${fmtEth(min, 6)} ETH you saw, so the sale was not sent. Your approvals are in place: press the button again to sell at the new estimate, or change the minimum.`,
              'PriceMoved',
              false,
            );
          about = now;
        }
        const deadline = BigInt(nowSeconds(f.blockTimestamp) + BUY_DEADLINE_SECONDS);
        await r.send('sell', () => sellTx(network, sold, min, deadline));
        return `You sold ${fmtTown(sold)} SKYLINE${about !== null ? ` for about ${fmtEth(about, 6)} ETH` : ''}; ${soldFeeWords(sellFees(chain, sold, about), feeState)}. Your rebates are unchanged.`;
      },
      'sell',
    );
  };

  return (
    <div class="trade-form" aria-label="Sell SKYLINE for ETH">
      <SellFeeToday />
      <div class="swap-box">
        <div class="swap-box-top">
          <label for="sell-town">You sell</label>
          {wallet && (
            <span class="muted small">
              Balance <span class="num">{fmtTown(wallet.townBalance)}</span> SKYLINE <Usd amount={wallet.townBalance} unit="SKYLINE" paren />
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
          <span class="token-pill gold">SKYLINE</span>
        </div>
        <Uses value={amountIn} unit="SKYLINE" />
        {quickOn && wallet && (
          <QuickAmounts label="Fill in a share of your SKYLINE" off={wallet.townBalance === 0n} onPick={(p) => void pick(p)}>
            {wallet.townBalance === 0n && <p class="quick-note small muted">Off: this wallet holds no SKYLINE.</p>}
          </QuickAmounts>
        )}
      </div>

      <div class="swap-arrow" aria-hidden="true">
        <ArrowDownIcon size={16} />
      </div>

      <div class="swap-box">
        <div class="swap-box-top">
          <span>You receive (estimate)</span>
          {wallet && (
            <span class="muted small">
              Balance <span class="num">{fmtEth(wallet.ethBalance)}</span> ETH <Usd amount={wallet.ethBalance} unit="ETH" paren />
            </span>
          )}
        </div>
        <div class="swap-box-main">
          <output class="swap-output num" data-view="V4Quoter.quoteExactInputSingle" for="sell-town">
            {estimate !== null ? fmtEth(estimate, 6) : amountIn !== null && amountIn > 0n && !fresh ? '…' : '0'}
          </output>
          <span class="token-pill">ETH</span>
        </div>
        <span class="swap-output-usd">
          <Usd amount={estimate} unit="ETH" />
        </span>
      </div>

      {amount.trim() !== '' && amountIn === null && <FieldError>{amountError(amount, 18, 'Enter an amount of SKYLINE, for example 1,000,000.')}</FieldError>}
      {overBalance && <FieldError>That is more SKYLINE than this wallet holds.</FieldError>}
      {fresh?.error && <FieldError>No estimate: {fresh.error}</FieldError>}

      <dl class="rows swap-rows">
        <SellFeeRows state={feeState} fees={fees} />
        <div class="row">
          <dt>Pool fee (0.5%, to the locked liquidity)</dt>
          <dd class="num">
            {poolFee !== null ? `${fmtTown(poolFee)} SKYLINE` : '—'}
            <Usd amount={poolFee} unit="SKYLINE" block />
          </dd>
        </div>
        <div class="row">
          <dt>
            <label for="sell-min">Minimum received</label>
          </dt>
          <dd class="num">
            {minValue !== null ? `${fmtEth(minValue, 6)} ETH` : '—'}
            <Usd amount={minValue} unit="ETH" block />
          </dd>
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
        The estimate already takes off every fee. If you would receive less than the minimum, the sale is cancelled and you keep your SKYLINE.
      </p>
      <p class="small swap-note sell-rebates">Selling does not change your rebates: they count only the SKYLINE you buy.</p>

      {account ? (
        <>
          {plan.length > 1 && !run.busy && (
            <div class="run-plan small" data-transactions={plan.length}>
              <p>
                <strong>This sale takes {plan.length} transactions:</strong> {plan.map((p) => p.label.charAt(0).toLowerCase() + p.label.slice(1)).join(', then ')}.{' '}
                {network.local
                  ? 'Each is sent from the test wallet as soon as the one before is confirmed.'
                  : 'Your wallet asks you to confirm each one; each is sent as soon as the one before is confirmed.'}
              </p>
              <p class="muted">
                {needApprove
                  ? 'SKYLINE is approved for Permit2 once, without a limit; the router’s permission, also without a limit, is renewed every 30 days. The router can move your SKYLINE only in a trade you send yourself.'
                  : routerExpired
                    ? `The router’s permission to move your SKYLINE expired on ${fmtDateTime(ra!.expiration)}. Renewing it lasts 30 days, without a limit; the router can move your SKYLINE only in a trade you send yourself.`
                    : 'The router’s permission lasts 30 days, without a limit, and is then renewed. The router can move your SKYLINE only in a trade you send yourself.'}
              </p>
            </div>
          )}
          <button type="button" class="btn btn-primary btn-block sell-go" disabled={run.busy || !ok || minValue === null || mins.zero} onClick={sell}>
            {run.busy ? 'Selling…' : label}
          </button>
        </>
      ) : (
        <ConnectPrompt what="your balance and sell" block />
      )}
      <RunStatus run={run} />
    </div>
  );
}
