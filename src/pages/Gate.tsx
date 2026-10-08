import { useMemo, useState } from 'preact/hooks';
import { parseEther, parseUnits } from 'viem';
import { useApp, Term, Panel, PageHero, Notice, Stat, ActionButton, ConnectPrompt, SampleBadge } from '../components/ui';
import { GateArt } from '../components/art';
import { afterClaimFee, buyFee, dawnTollActive, dawnTollSecondsLeft, minReceived, quoteTownOut, rebateRateBps } from '../lib/derive';
import { bellName, fmtBps, fmtClock, fmtEth, fmtTown, fmtUnits } from '../lib/format';

/** Universal Router 2.1.2 on Ethereum mainnet (R1b A1). Phase two sends the site's buys through it. */
export const UNIVERSAL_ROUTER = '0x23617e59A5925b2A4Bf75d73ff6711cD0b29De85';

/** The Uniswap app, for the second way to buy and the way to sell. Phase two adds TOWN's address. */
const UNISWAP_URL = 'https://app.uniswap.org/swap?chain=mainnet&inputCurrency=NATIVE';

function parseEthInput(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  try {
    return parseEther(t);
  } catch {
    return null;
  }
}

function parseTownInput(s: string): bigint | null {
  const t = s.replace(/,/g, '').trim();
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  try {
    return parseUnits(t, 18);
  } catch {
    return null;
  }
}

export function Gate() {
  const { chain } = useApp();
  const dawn = dawnTollActive(chain);
  return (
    <>
      <PageHero
        kicker="The Gate · buy TOWN"
        title="The Gate"
        lead={
          <>
            Every arrival is written down. <Term slug="naming-yourself">Name yourself at the Gate</Term> and the <Term slug="ledger">Ledger</Term> will never
            forget you.
          </>
        }
        art={<GateArt toll={dawn} />}
      >
        <p class="muted">
          Buy TOWN with ETH here. Your buy is credited to your own wallet in the Ledger, which is what the <Term slug="granary">Granary</Term> pays rebates
          from. <strong style="color:var(--gold-soft)">Buy here to be sure the rebate is yours.</strong>
        </p>
      </PageHero>

      <div class="wrap">{dawn && <DawnToll />}</div>

      <section class="section" style="padding-top:0">
        <div class="wrap grid grid-2" style="align-items:start">
          <BuyForm />
          <div class="grid" style="gap:16px">
            <Tolls />
            <SecondWay />
          </div>
        </div>
      </section>

      <section class="section">
        <div class="wrap grid grid-2">
          <Notice kind="lore" title="Shadow Markets">
            <p>
              <em>"Trades outside the Gate are never written in the Ledger."</em>
            </p>
            <p class="small">
              Anyone can open another TOWN pool that does not pass through the Gate. Trades there pay no Gate fees, but they are not recorded in the Ledger and
              earn no rebates from the Granary. Only the one pool guarded by the Gate counts for UpTown.
            </p>
          </Notice>
          <Notice kind="info" title="Who the Gatekeeper credits">
            <p class="small">
              <em>"Who goes there?"</em> A buy made on this site names your wallet to the Gatekeeper, so it is always credited to you. A buy made elsewhere is
              credited to the wallet the trading app names, and if that app is only a go-between (an aggregator, a smart-account service, a relayer), to
              whoever sent the transaction, which may not be you. Some apps could even name themselves. <Term slug="shadow-markets">Shadow Markets</Term>{' '}
              record nothing at all.
            </p>
          </Notice>
        </div>
      </section>
    </>
  );
}

function DawnToll() {
  const { chain } = useApp();
  const left = dawnTollSecondsLeft(chain);
  const fee = chain.hook.currentBuyFeeBps;
  const dur = chain.hook.ANTI_SNIPE_DURATION;
  const elapsed = dur - left;
  const start = chain.hook.ANTI_SNIPE_START_BPS;
  const end = chain.hook.BUY_FEE_BPS;
  // A small chart of the falling toll: x is time (0 to 900 s), y is the fee.
  const W = 320;
  const H = 120;
  const px = (s: number) => 34 + (s / dur) * (W - 50);
  const py = (bps: number) => 14 + (1 - bps / start) * (H - 40);
  return (
    <div class="notice danger" role="alert" style="margin-top:8px">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8 22 20.5H2z" fill="none" stroke="#e07258" stroke-width="1.8" stroke-linejoin="round" />
        <rect x="11" y="9" width="2" height="6.5" rx="1" fill="#e07258" />
        <circle cx="12" cy="17.6" r="1.2" fill="#e07258" />
      </svg>
      <div class="grid grid-2" style="gap:12px;align-items:center">
        <div>
          <h3>
            The <Term slug="dawn-toll">Dawn Toll</Term> is on: the buy fee is <span class="num">{fmtBps(fee)}</span> right now. <SampleBadge />
          </h3>
          <p>
            For the first fifteen minutes after launch the Gate charges a steep toll that melts as the sun rises: {fmtBps(start)} at the first second, falling
            in a straight line to the ordinary {fmtBps(end)}. Buying now costs far more than buying in <span class="num">{fmtClock(left)}</span> minutes. All of
            it goes to the Town Hall, and you earn rebate points only on the TOWN you actually receive.
          </p>
          <p class="small">Unless you mean to pay it, wait until the toll has fallen to {fmtBps(end)}.</p>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chart: the buy fee falls from ${fmtBps(start)} to ${fmtBps(end)} over 15 minutes; it is ${fmtBps(fee)} now.`}>
          <line x1={px(0)} y1={py(end)} x2={px(dur)} y2={py(end)} stroke="rgba(201,196,184,0.3)" stroke-dasharray="3 4" />
          <line x1={px(0)} y1={py(start)} x2={px(dur)} y2={py(end)} stroke="#e9b44c" stroke-width="2.5" />
          <circle cx={px(elapsed)} cy={py(fee)} r="6" fill="#e07258" stroke="#fff" stroke-width="2" />
          <text x={px(0)} y={H - 8} fill="#b9b7d3" font-size="11" text-anchor="middle">0:00</text>
          <text x={px(dur / 2)} y={H - 8} fill="#b9b7d3" font-size="11" text-anchor="middle">7:30</text>
          <text x={px(dur)} y={H - 8} fill="#b9b7d3" font-size="11" text-anchor="middle">15:00</text>
          <text x="4" y={py(start) + 4} fill="#f4d690" font-size="11">{fmtBps(start)}</text>
          <text x="4" y={py(end) + 4} fill="#f4d690" font-size="11">{fmtBps(end)}</text>
          <text x={px(elapsed) + 10} y={py(fee) - 8} fill="#ffc4b4" font-size="11" font-weight="700">now {fmtBps(fee)}</text>
        </svg>
      </div>
    </div>
  );
}

const SLIPPAGE_CHOICES = [50, 100, 200];

function BuyForm() {
  const { chain, wallet } = useApp();
  const [amount, setAmount] = useState('0.1');
  const [slippage, setSlippage] = useState(100);
  const [minText, setMinText] = useState<string | null>(null);

  const amountIn = parseEthInput(amount);
  const fee = chain.hook.currentBuyFeeBps;
  const toll = amountIn !== null ? buyFee(amountIn, fee) : null;
  const estimate = amountIn !== null ? quoteTownOut(chain, amountIn) : null;
  const autoMin = estimate !== null ? minReceived(estimate, slippage) : null;
  const minValue = minText !== null ? parseTownInput(minText) : autoMin;
  const c = chain.hook.currentCycle;
  const rate = rebateRateBps(chain, c);
  const rebateCeiling = useMemo(
    () => (estimate !== null ? afterClaimFee(chain, (estimate * BigInt(Math.round(rate * 100))) / 1_000_000n) : null),
    [estimate, rate, chain],
  );
  const overBalance = wallet && amountIn !== null && amountIn > wallet.ethBalance;
  const minTooHigh = minValue !== null && estimate !== null && minValue > estimate;
  const minVeryLow = minValue !== null && estimate !== null && estimate > 0n && minValue * 100n < estimate * 90n;

  return (
    <Panel title="Arrive at the Gate" headingLevel={2}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        aria-describedby="buy-explainer"
      >
        <div class="field">
          <label for="buy-eth">You pay</label>
          <div class="input-row">
            <input
              id="buy-eth"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onInput={(e) => {
                setAmount((e.target as HTMLInputElement).value);
                setMinText(null);
              }}
              aria-invalid={amountIn === null}
            />
            <span class="suffix">ETH</span>
          </div>
          <div class="chips" role="group" aria-label="Quick amounts">
            {['0.05', '0.1', '0.25', '0.5'].map((v) => (
              <button
                type="button"
                class="chip"
                aria-pressed={amount === v}
                key={v}
                onClick={() => {
                  setAmount(v);
                  setMinText(null);
                }}
              >
                {v} ETH
              </button>
            ))}
          </div>
          {wallet && (
            <span class="hint">
              Your ETH balance: <span class="num">{fmtEth(wallet.ethBalance)}</span> ETH <SampleBadge />
            </span>
          )}
          {amountIn === null && <span class="hint" style="color:#ffc4b4">Enter an amount of ETH, for example 0.1.</span>}
          {overBalance && <span class="hint" style="color:#ffc4b4">That is more ETH than this wallet holds.</span>}
        </div>

        <dl class="stats" style="margin-bottom:14px">
          <Stat label="Estimated TOWN you receive" value={estimate !== null ? fmtTown(estimate) : '—'} unit="TOWN" view="V4Quoter.quoteExactInputSingle" big gold />
        </dl>

        <dl class="kv" style="margin-bottom:16px">
          <dt>
            Gate <Term slug="toll">toll</Term> now ({fmtBps(fee)} of the ETH, to the Town Hall)
          </dt>
          <dd class="num" data-view="TownHook.currentBuyFeeBps">{toll !== null ? `${fmtEth(toll)} ETH` : '—'}</dd>
          <dt>Pool fee (0.5%, to the locked position; the owner collects it)</dt>
          <dd>included in the estimate</dd>
          <dt>Network gas</dt>
          <dd>paid separately</dd>
        </dl>

        <div class="field">
          <label for="buy-min">Minimum TOWN received</label>
          <div class="input-row">
            <input
              id="buy-min"
              inputMode="decimal"
              autoComplete="off"
              value={minText ?? (autoMin !== null ? fmtUnits(autoMin, 18, 0) : '')}
              onInput={(e) => setMinText((e.target as HTMLInputElement).value)}
              aria-describedby="buy-min-hint"
            />
            <span class="suffix">TOWN</span>
          </div>
          <div class="chips" role="group" aria-label="Set the minimum below the estimate by">
            <span class="hint" style="align-self:center">Set it below the estimate by:</span>
            {SLIPPAGE_CHOICES.map((s) => (
              <button
                type="button"
                class="chip"
                key={s}
                aria-pressed={minText === null && slippage === s}
                onClick={() => {
                  setSlippage(s);
                  setMinText(null);
                }}
              >
                {fmtBps(s)}
              </button>
            ))}
          </div>
          <span class="hint" id="buy-min-hint">
            If the price moves before your buy goes through and you would receive less than this, the buy is cancelled and you keep your ETH (you still pay
            the gas). You can type your own figure.
          </span>
          {minTooHigh && <span class="hint" style="color:#ffc4b4">This is above the estimate, so the buy would almost certainly be cancelled.</span>}
          {minVeryLow && <span class="hint" style="color:#ffc4b4">This accepts a much worse price than the estimate.</span>}
        </div>

        <Notice kind="lore" title="Sign the Ledger with your own name">
          <p class="small">
            This buy names your wallet to the Gatekeeper, so it is written in the Ledger as yours. If {bellName(c)}'s ration allows, you can claim back up to{' '}
            <span class="num">{rebateCeiling !== null ? fmtTown(rebateCeiling) : '—'}</span> TOWN (at today's rate so far, after the 5% claim fee) from{' '}
            {bellName(c + 2)} on, at the <a href="#/granary">Granary</a>. A rebate is a ceiling, not a promise. <SampleBadge />
          </p>
        </Notice>

        <p id="buy-explainer" class="small muted">
          The finished site sends this as one exact-input swap through Uniswap's Universal Router (version 2.1.2, <code>{UNIVERSAL_ROUTER.slice(0, 10)}…</code>),
          with your address in the swap's hook data and your minimum received as the limit. Your wallet shows the transaction for you to approve.
        </p>

        {wallet ? (
          <ActionButton
            label="Buy TOWN"
            disabled={amountIn === null || amountIn === 0n || !!overBalance || minValue === null}
            explain="ask your wallet to send this buy through the Gate, naming your wallet in the Ledger."
          />
        ) : (
          <ConnectPrompt what="your balance and buy" />
        )}
      </form>
    </Panel>
  );
}

function Tolls() {
  const { chain } = useApp();
  const sell = chain.hook.currentSellFeeBps;
  return (
    <Panel title="Tolls at the Gate">
      <dl class="stats">
        <Stat label="Buy fee now, in ETH, to the Town Hall" value={fmtBps(chain.hook.currentBuyFeeBps)} view="TownHook.currentBuyFeeBps" gold />
        <Stat
          label="Sell fee now, in TOWN, burned"
          value={fmtBps(sell)}
          view="TownHook.currentSellFeeBps"
          note={sell === 0 ? 'The Cornerstone Million has been reached: sells pay no Gate fee.' : undefined}
        />
      </dl>
      <p class="small muted" style="margin:14px 0 0">
        Every buy also pays the pool's 0.5% trading fee, which goes to the locked liquidity position and is collected by the owner. Of the buy fee, 10% is set
        aside for the owner at the <a href="#/town-hall">Town Hall</a>; the rest feeds the stakers' deliveries.
      </p>
    </Panel>
  );
}

function SecondWay() {
  return (
    <Panel title="The other road: Uniswap" sample={false}>
      <p>
        You can also buy on Uniswap's own app, and Uniswap is the way to sell. The site has no sell form.
      </p>
      <ul class="small" style="padding-left:1.1em">
        <li>Selling pays the Gate's 2% in TOWN, burned in the <Term slug="furnace">Furnace</Term>, plus the pool fee.</li>
        <li>
          A buy on Uniswap's app is usually credited to the wallet that sent it. Buys through other apps may be credited to someone else; buying here avoids
          that.
        </li>
        <li>Make sure you are trading in the TOWN pool that uses the Gate. TOWN's address is published here at launch.</li>
      </ul>
      <a class="btn btn-ghost" href={UNISWAP_URL} target="_blank" rel="noopener noreferrer">
        Open Uniswap (new tab)
      </a>
    </Panel>
  );
}
