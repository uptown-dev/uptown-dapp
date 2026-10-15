// Component tests for F8f (CR-47 to CR-50), run in headless Edge by `npm test` (scripts/test.mjs)
// against the local chain. Each test renders the site's own components, with the site's own
// AppContext, into this page and checks the text and buttons a visitor would see.
//
// - CR-48, the window: no announcement the chain accepts exists (CR-49 refuses every address on the
//   local chain), so the pending block is rendered from a fixture: the live figures with the
//   announcement fields set by hand (waiting, open, expired, and both edges of the window).
// - CR-49, the verified mark: the site's own check pointed at WETH (refused) and at TownStaking
//   (accepted) on the live chain; and the Treasury's refusal of WETH in plain words.
// - CR-50, the old contract: TownStaking listed as if it had been replaced, read live for Test
//   wallet 1, rendered as the replaced-contract card; "Payouts paused" beside the purchase buttons.
// - CR-47, the rate: the Rewards "Today" card from a fixture with only sells behind it.
// - CR-56, CR-57 (F8g), the sell fee's currency: the Trade page's mode line and the Stats figures
//   from the live chain, then every other case (ETH mode, the floor, the reserve spent, day 0) from
//   fixtures; the sell form's fee row in ETH mode.
// - CR-61 (F8j), the Stats trading volume: the four figures against TownHook's views read on their own
//   at the same block, the block's place on the page, and day 0 (no yesterday) from a fixture.
// - F8g housekeeping, the upgradeable flag: the site's check pointed at a real EIP-1967 proxy on the
//   forked chain (Aave's v3 Pool) and at TownStaking; the mark from a fixture.
// - CR-64 (F9b), the owner page: the gate for the owner and for a wallet that is not one (live); the
//   checks on what is typed; the read-only check of an action and the typed confirmation of an
//   action that cannot be undone (checked, never sent); the Safe path and the read-only page from
//   fixtures (no Safe exists on the private chain, so the owner address is made to look like one);
//   the page before launch from a fixture; the Trade page without the Uniswap button.
// - CR-71 (F9g), the navigation bar: its items (no "Home"), and the whole site rendered to check that
//   the "UpTown" name links to the homepage, which item is marked current, and the browser titles.
// - CR-73 (F9j), a replaced staking contract's own card on the owner page: the site's list decides
//   which contracts get one, so the fixtures give the list a second staking contract and the real
//   TownStaking is the replaced one, read live; a contract with no code on this chain is a card
//   marked unavailable.
// - CR-75 (F9k), the owner's logo: the drawing the header and the footer show in each theme,
//   checked shape for shape against the owner's own two files in frontend/logo/; the theme switch;
//   the sizes; and the browser-tab icon's shapes against the same files.
// - CR-76 (F9l), the network tag in the header: the three networks' tags, each rendered from its
//   own network entry — the name, the mark on a test network, the tooltip and the text a screen
//   reader reads; and the whole site rendered to check that the strip above the header is gone and
//   that the tag sits in the header's tools beside the wallet button and does nothing when clicked.
// - CR-77 (F9m), the owner's new wording and the wrong-network light: the homepage's two "Why
//   $TOWN?" paragraphs and the three cards' sentences read back from the rendered page and compared
//   character for character with the owner's words as CR-77 writes them; the rebate card's figure
//   against BuyerRewards.rateBps(today); the Docs owner section without its earnings, with the
//   powers table's rows diffed against the content module; the wallet display rendered on the right
//   network and on a wrong one (the stylesheet decides the light's colour and shape); the site with
//   no read line; and the notice that the network service is behind, from a fixture.
// - CR-80 (F9n), the daily sell-fee message: the three cases of its compare sentence, each from a
//   fixture — yesterday's rebates above its burn (the owner's "inflation exceeded deflation"), the
//   two exactly equal ("inflation matched deflation", and a quiet day with both at zero), and the
//   burn above the rebates (the ETH day, unchanged); and the same clause on the Stats figure.
// - CR-82, CR-83 (F9o), one press for a sale's or a stake's approvals and the action, and the quick
//   amounts: the site's own forms run against a stand-in wallet and a stand-in chain (no transaction
//   reaches the local node); the order of every rehearsal, request and confirmation; the stops; the
//   unlimited sell approvals; the 25/50/75/100% buttons on both sides.
// - CR-92 part 1 (F9t), the Docs item for whoever routes buys for others: its place after "Buy on
//   this site", its text character for character (the 32-byte rule), its code words, and its example
//   `hookData` against the bytes the site's own buy form puts in its swap.
// - F12a (CR-86, CR-98): the three states — not deployed, deployed and not launched (from a fixture of
//   the live constants, the chain itself being launched while the tests run), launched — through the
//   site's own page switch; the switched-off actions and their sentences, no price, no dollar figure,
//   no zero, the note beside the explorer links between the phases only, and the position link.
// - CR-95 items 2 and 3 (F9v): the Trade page without its "Buy here" line; the dollar figures — the
//   arithmetic from a known sqrtPriceX96 and a known ETH price, the pool's price as the site reads
//   it (against StateView read on its own at the same block), the figures beside the amounts on
//   every page from fixtures with the feed's price, the fallback mark (the local chain itself runs
//   on the owner's fallback price), and no dollar figure anywhere when no usable price is reported.
//   Checks written before F9v read the pages with the estimates hidden (`plain`).
// Nothing here sends a transaction to any chain: only Check buttons (read-only calls) are clicked.
import { render, type ComponentChildren } from 'preact';
// The site's own stylesheet and the owner's own logo files, read as text (CR-75): the checks
// below compare what the page draws with what the owner delivered, and let the stylesheet pick.
import GLOBAL_CSS from '../src/styles/global.css?inline';
import LOGO_ON_LIGHT from '../logo/uptown-lamplight-on-light.svg?raw';
import LOGO_ON_DARK from '../logo/uptown-lamplight-on-dark.svg?raw';
import { AppContext, type AppState } from '../src/components/ui';
import { NETWORK } from '../src/lib/network';
import { makeClient, poolId, poolKey, quoteBuy, quoteSell, readAll, readVaults, replacedRecords, verifyCandidate } from '../src/lib/reads';
import { explainError } from '../src/lib/errors';
import { ERRORS_ABI, HOOK_ABI, PERMIT2_ABI, QUOTER_ABI, REWARDS_ABI, ROUTER_ABI, STAKING_ABI, STATEVIEW_ABI, TOKEN_ABI, TREASURY_ABI } from '../src/lib/abi';
// CR-95: the files that build and send transactions, read as text, to show no dollar figure reaches them.
import ACTIONS_SRC from '../src/lib/actions.ts?raw';
import WALLET_SRC from '../src/lib/wallet.ts?raw';
import QUICK_SRC from '../src/lib/quick.ts?raw';
import AMOUNT_SRC from '../src/lib/amount.ts?raw';
// F9u: every source file of the site, read as text, for the searches of item 6 (no RESERVE(), 78,125, "24-hour" or "counted from launch").
const SITE_SOURCES = import.meta.glob(['../src/**/*.ts', '../src/**/*.tsx', '../src/**/*.css'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
import { ContractFunctionRevertedError, decodeAbiParameters, decodeFunctionData, decodeFunctionResult, encodeErrorResult, encodeFunctionData, formatUnits, getAddress, pad, toHex, type PublicClient } from 'viem';
import { Owner, OwnerPage } from '../src/pages/Owner';
import { networkLabel, pageAccess, showsOwnerLink } from '../src/lib/owner';
import { UNLISTED_STAKING, listedStaking, positionUrl, replacedStaking } from '../src/lib/network';
import { MAX_UINT160, MAX_UINT256, UnlistedStakingError, addStakeTx, buyTx, approvePermit2Tx, approveTx, claimWethTx, openVaultTx, ownerTx, unstakeTx, upgradeTx, withMargin } from '../src/lib/actions';
import { BUY_GAS_ALLOWANCE, buyGasReserve } from '../src/lib/quick';
import {
  UnknownTargetError,
  activeProvider,
  chooseWallet,
  rememberedWallet,
  sendTx,
  targetProblem,
  walletChainId,
  walletFromAnnouncement,
  watchWallets,
  type WalletInfo,
} from '../src/lib/wallet';
import { COMMA_MESSAGE, amountError, parseAmount } from '../src/lib/amount';
import { ONE_TOWN, afterFeeBps, clockNow, dayRateBps, dayStartTime, minCheck, nextDayStart, rateRange, rpcBehind, sellFeeState, sellFees, stepClock, townPriceWei, usdOf, type ChainClock } from '../src/lib/derive';
import { dayName, dayNumber, fmtBps, fmtCountdown, fmtCountdownWords, fmtDateTime, fmtEth, fmtRate, fmtTown, fmtUsd, fmtUsd8, listDays, shortAddress } from '../src/lib/format';
import { PriceSource } from '../src/data/types';
import { CandidateMark, OwnerChanges, Stats, TradingVolume } from '../src/pages/Stats';
import { SELL_FEE_HEADLINE, Trade, reserveShareSentence } from '../src/pages/Trade';
import { OldVaultCard, Stake } from '../src/pages/Stake';
import { Rewards } from '../src/pages/Rewards';
import { Home } from '../src/pages/Home';
import { Docs } from '../src/pages/Docs';
import { OWNER_POWERS, ROUTING_NOTE, THINGS_TO_KNOW } from '../src/content/docs';
import { App, DayClock, FooterContracts, Freshness, PageView, NetworkTag, PlaceRow, StaleNotice, WalletButton, WalletChoices, WrongNetworkNote, navItems, networkNote, shortNetworkName } from '../src/app';
import { TELEGRAM_URL, X_URL, gmgnUrl, mainnetTownAddress } from '../src/lib/places';
import type { ChainId, Network } from '../src/lib/network';
import type { Address, CandidateCheck, ChainState, OwnerState, PrelaunchState, ReplacedStaking, StakingControls, WalletState } from '../src/data/types';

const log = document.getElementById('log')!;
const stage = document.getElementById('stage')!;
// `?gallery` keeps every rendering on the page, styled, for the review photographs (scripts/test.mjs gallery).
const GALLERY = location.search.includes('gallery');
if (GALLERY) {
  await import('../src/styles/global.css');
  stage.className = 'wrap page';
  log.hidden = true;
}
const results: { name: string; ok: boolean; detail: string }[] = [];
const say = (s: string) => {
  log.textContent += s + '\n';
};

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  say(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

const client = makeClient(NETWORK);
const k = NETWORK.deployment!.contracts;
const W1 = NETWORK.testWallets[0].address;
const OWNER = NETWORK.deployment!.owner!;
const WETH = NETWORK.uniswap!.weth;

let liveOwner: OwnerState | null = null;

function app(chain: ChainState | null, wallet: WalletState | null, extra: Partial<AppState> = {}): AppState {
  return {
    network: NETWORK,
    chain,
    wallet,
    owner: liveOwner,
    account: wallet?.address ?? null,
    accountLabel: wallet ? 'Test wallet 1' : null,
    data: { state: 'ready', error: null, readAt: Date.now() },
    client,
    refresh: async () => {},
    connect: () => {},
    disconnect: () => {},
    wrongNetwork: false,
    switchNetwork: () => {},
    toast: () => {},
    ...extra,
  };
}

/** Renders `node` with the given figures and returns its box once painted. */
async function mount(node: ComponentChildren, chain: ChainState | null, wallet: WalletState | null, label = '', extra: Partial<AppState> = {}): Promise<HTMLElement> {
  const box = document.createElement('div');
  if (GALLERY) {
    const h = document.createElement('p');
    h.className = 'poke-title';
    h.style.margin = '28px 0 8px';
    h.textContent = `Fixture: ${label}`;
    stage.append(h, box);
  } else stage.replaceChildren(box);
  render(<AppContext.Provider value={app(chain, wallet, extra)}>{node}</AppContext.Provider>, box);
  await new Promise((r) => setTimeout(r, 30));
  return box;
}

const text = (el: HTMLElement) => el.innerText.replace(/\s+/g, ' ').trim();
/**
 * Reads the page with the dollar estimates (CR-95, F9v) left out of view. The checks written before
 * F9v compare the amounts and sentences themselves; F9v's own checks (cr95 below) read the
 * estimates. Hiding them with a style rule keeps innerText exactly what it was before.
 */
function plain<T>(read: () => T): T {
  const s = document.createElement('style');
  s.textContent = '.usd { display: none !important; }';
  document.head.append(s);
  try {
    return read();
  } finally {
    s.remove();
  }
}
const button = (el: HTMLElement, label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent!.trim().startsWith(label)) ?? null;
/** The value shown for the figure read from `view` (its `data-view`), without its unit. */
const figText = (el: HTMLElement, view: string) => (el.querySelector(`[data-view="${view}"] .num`) as HTMLElement | null)?.innerText.trim() ?? null;

async function run() {
  const live = await readAll(client, NETWORK, W1);
  const base = live.chain!;
  liveOwner = live.owner;
  const wallet = live.wallet!;
  say(`live figures read at block ${base.blockNumber}, day ${base.rewards.currentCycle}; Treasury.staking() = ${base.treasury.staking}`);

  // ---- CR-48: the application window, from a fixture ---------------------------------------
  const NOW = 1_800_000_000; // a fixed "now" for the fixture (15 Jan 2027, 08:00 UTC)
  const CANDIDATE: Address = '0x1111111111111111111111111111111111111111';
  const verified: CandidateCheck = { address: CANDIDATE, treasury: k.Treasury, weth: WETH, delegated: false, verified: true, upgradeable: false };
  const refused: CandidateCheck = { address: CANDIDATE, treasury: null, weth: null, delegated: false, verified: false, upgradeable: false };
  const pending = (effectiveAt: number, candidate: CandidateCheck): ChainState => ({
    ...base,
    blockTimestamp: NOW,
    treasury: { ...base.treasury, pendingStaking: CANDIDATE, stakingEffectiveAt: effectiveAt, candidate, OWNER_DELAY: 172_800, APPLY_WINDOW: 604_800, pauseEffectiveAt: 0, paused: false },
  });
  const W = 604_800;

  {
    const at = NOW + 86_400;
    const el = await mount(<OwnerChanges />, pending(at, verified), wallet, 'announced, waiting (verified)');
    const t = text(el);
    check('CR-48 waiting: shows "can be applied from <date> … until <date>"', t.includes(`Can be applied from ${fmtDateTime(at)}`) && t.includes(`until ${fmtDateTime(at + W)}`), t.match(/Can be applied[^.]*\./)?.[0] ?? t);
    check('CR-48 waiting: Apply is off, with the reason', button(el, 'Apply')?.disabled === true && t.includes('Not yet: the 2-day wait has not passed.'));
    check('CR-49 verified candidate: shows "Verified"', t.includes('Verified') && !t.includes('Does not look like a staking contract'));
  }
  {
    const at = NOW - 3_600;
    const el = await mount(<OwnerChanges />, pending(at, verified), wallet, 'open (verified)');
    const t = text(el);
    check('CR-48 open: shows "can be applied now … until <date>"', t.includes(`Can be applied now, by anyone, until ${fmtDateTime(at + W)}`), t.match(/Can be applied[^.]*\./)?.[0] ?? t);
    check('CR-48 open and verified: Apply is on', button(el, 'Apply')?.disabled === false);
  }
  {
    const at = NOW - W; // now is exactly the last second of the window: still open (the contract's "up to and including")
    const el = await mount(<OwnerChanges />, pending(at, verified), wallet, 'last second of the window');
    check('CR-48 last second of the window (now = effectiveAt + 7 days): still open, Apply on', button(el, 'Apply')?.disabled === false && !text(el).includes('Expired'));
  }
  {
    const at = NOW - W - 1; // one second past the window
    const el = await mount(<OwnerChanges />, pending(at, verified), wallet, 'expired');
    const t = text(el);
    check('CR-48 one second past the window: "Expired: the owner must announce again"', t.includes('Expired: the owner must announce again') && t.includes(fmtDateTime(at + W)), t.match(/Expired[^.]*\./)?.[0] ?? t);
    check('CR-48 expired: no Apply button', button(el, 'Apply') === null);
    check('CR-48 expired: the item is marked', !!el.querySelector('.pending-item.expired .expired-tag'));
  }
  {
    const el = await mount(<OwnerChanges />, pending(NOW - 3_600, refused), wallet, 'open, not verified');
    const t = text(el);
    check('CR-49 open but not verified: Apply is off, with the reason', button(el, 'Apply')?.disabled === true && t.includes('the treasury would refuse it'));
  }

  // ---- CR-49: the site's check pointed at real contracts on the local chain -------------------
  const atWeth = await verifyCandidate(client, WETH, k.Treasury, base.treasury.weth);
  check('CR-49 WETH as the candidate: not verified', !atWeth.verified, JSON.stringify(atWeth));
  {
    const el = await mount(<CandidateMark check={atWeth} />, base, wallet, 'the mark for WETH (live check)');
    check('CR-49 WETH: the mark reads "Does not look like a staking contract"', text(el).includes('Does not look like a staking contract'), text(el));
  }
  {
    const el = await mount(<OwnerChanges />, { ...pending(NOW + 3_600, atWeth), treasury: { ...pending(NOW + 3_600, atWeth).treasury, pendingStaking: WETH } }, wallet, 'WETH announced (live check)');
    check('CR-49 WETH announced (fixture): the pending block carries the mark', text(el).includes('Does not look like a staking contract'), text(el).match(/New staking contract[^]*?refuse it at application\./)?.[0] ?? '');
  }
  const atStaking = await verifyCandidate(client, k.TownStaking, k.Treasury, base.treasury.weth);
  check('CR-49 TownStaking as the candidate: verified (it names this Treasury and WETH)', atStaking.verified, JSON.stringify(atStaking));
  {
    const el = await mount(<CandidateMark check={atStaking} />, base, wallet, 'the mark for TownStaking (live check)');
    check('CR-49 TownStaking: the mark reads "Verified"', text(el).startsWith('Verified'), text(el));
  }
  try {
    await client.simulateContract({ account: OWNER, address: k.Treasury, abi: TREASURY_ABI, functionName: 'announceStaking', args: [WETH] });
    check('CR-49 the Treasury refuses WETH: plain words', false, 'the call did not revert');
  } catch (e) {
    const x = explainError(e);
    check('CR-49 the Treasury refuses WETH: plain words', x.name === 'StakingWrongTreasury', `${x.name}: ${x.message}`);
  }

  // ---- CR-50: the old contract and the paused tag ------------------------------------------
  check(
    'CR-50 the network module lists TownStaking for the local chain, and it is the one paid now (no old vaults)',
    NETWORK.stakingContracts.length === 1 && NETWORK.stakingContracts[0].address === k.TownStaking && wallet.oldVaults.length === 0,
  );
  const replacedOn = Date.UTC(2027, 2, 1, 14, 5) / 1000;
  const [old] = await readVaults(client, [{ address: k.TownStaking, replacedOn }], W1);
  check('CR-50 Test wallet 1 has a vault in the listed contract (read live)', old.positionOf.tier !== 0 && old.positionOf.amount > 0n, `tier ${old.positionOf.tier}, ${old.positionOf.amount} TOWN units, earned ${old.earned}`);
  {
    const el = await mount(<OldVaultCard vault={old} />, base, wallet, 'Test wallet 1’s vault, TownStaking listed as replaced on 1 Mar 2027');
    const t = text(el);
    check('CR-50 replaced contract: "Replaced on 1 Mar 2027: no new rewards; unstake and claim only"', t.includes('Replaced on 1 Mar 2027: no new rewards; unstake and claim only'), t.slice(0, 160));
    check('CR-50 replaced contract: Claim and Unstake are offered and on', button(el, 'Claim')?.disabled === false && button(el, 'Unstake everything')?.disabled === false);
    check('CR-50 replaced contract: no purchase, addition or upgrade', !/Open a vault|Open tier|Add TOWN|Upgrade/.test(t));
  }
  {
    const el = await mount(<Stake />, base, { ...wallet, oldVaults: [old] }, 'Stake page with that vault');
    check('CR-50 Stake page: the replaced-contract card appears for a wallet with a vault there', text(el).includes('Your vault in a replaced staking contract'));
  }
  const noVault: WalletState = { ...wallet, positionOf: { tier: 0, amount: 0n }, earned: 0n, oldVaults: [] };
  {
    const el = await mount(<Stake />, { ...base, treasury: { ...base.treasury, paused: true, pauseEffectiveAt: base.blockTimestamp - 60 } }, noVault, 'Stake page, payouts paused, no vault');
    const form = el.querySelector('.action-form');
    const tag = form?.querySelector('.paused-beside');
    const buttons = form?.querySelector('.btn-row');
    check(
      'CR-50 paused: "Payouts paused" sits in the open-vault form, right above its buttons',
      !!tag && tag.textContent!.includes('Payouts paused') && tag.nextElementSibling === buttons,
      tag?.textContent ?? 'no tag',
    );
  }
  {
    const el = await mount(<Stake />, base, noVault, 'Stake page, not paused, no vault');
    check('CR-50 not paused: no "Payouts paused" tag', !el.querySelector('.paused-beside'));
  }

  // ---- CR-47: today's rate after only sells, from a fixture --------------------------------
  {
    const c = base.rewards.currentCycle;
    const days = [c - 1, c - 2, c - 3].filter((d) => d >= 0);
    const sold: Record<number, bigint> = {};
    const total: Record<number, bigint> = { ...base.hook.cycleTotal };
    for (const d of days) {
      sold[d] = 1_000_000n * 10n ** 18n;
      total[d] = 0n;
    }
    const chain: ChainState = {
      ...base,
      hook: { ...base.hook, sold, cycleTotal: total },
      rewards: { ...base.rewards, rateBps: { ...base.rewards.rateBps, [c]: 550 }, lean: { [c]: -(10n ** 18n) } },
    };
    const el = await mount(<Rewards />, chain, wallet, 'Rewards page, only sells behind today');
    const t = text(el);
    check(
      'CR-47 only sells behind today: 5.5%, 5.39% after the 2% fee (CR-60), lean −1.00, "More selling than buying"',
      t.includes('Today’s rate, before fee 5.5%') &&
        t.includes('Today’s rate, after the 2% fee 5.39%') &&
        t.includes('−1.00') &&
        t.includes('More selling than buying over the last three days'),
      t.match(/Today’s rate, before fee.*?Today’s limit/)?.[0] ?? '',
    );
    const all = (el.textContent ?? '').replace(/\s+/g, ' '); // the Rules list sits in a closed Details
    check(
      'CR-60 the claim fee is read from the chain: CLAIM_FEE_BPS 200, "Claimable now, after the 2% fee", "4.9% to 5.39% back"',
      base.rewards.CLAIM_FEE_BPS === 200 && all.includes('Claimable now, after the 2% fee') && all.includes('so a buyer gets 4.9% to 5.39% back'),
      `CLAIM_FEE_BPS ${base.rewards.CLAIM_FEE_BPS}; ${all.match(/Claimable now, after the \S+ fee/)?.[0] ?? 'no claimable label'}; ${all.match(/so a buyer gets[^.]*/)?.[0] ?? 'no rule line'}`,
    );
  }

  // ---- CR-56, CR-57: the sell fee's currency -----------------------------------------------
  {
    const c = base.hook.currentCycle;
    const y = c - 1;
    const b = base.hook.burned[y];
    const p = base.rewards.emissionEstimate[y];
    say(
      `live sell-fee mode: sellFeeInEth() = ${base.hook.sellFeeInEth}, burned(${y}) = ${b}, emissionEstimate(${y}) = ${p}, reserveExhausted() = ${base.rewards.reserveExhausted}`,
    );
    const el = await mount(<Trade sell />, base, wallet, `Trade page, Sell, live (${dayName(c)})`);
    const line = text(el.querySelector('.sell-mode') as HTMLElement);
    const mode = SELL_FEE_HEADLINE[sellFeeState(base.hook.sellFeeShares)]; // F9u: the state from sellFeeShares() (CR-93)
    check(
      'CR-57 Trade (live): the mode line names today’s mode and yesterday’s two figures from the chain',
      line.startsWith(`Today’s sell fee: ${mode}`) && line.includes(`burned ${fmtTown(b)} TOWN and paid ${fmtTown(p)} TOWN in rebates`),
      line,
    );
    const st = await mount(<Stats />, base, wallet, `Stats page, live (${dayName(c)})`);
    const t = text(st);
    check(
      'CR-57 Stats (live): "Sell fee today", "TOWN burned yesterday" = burned(c−1), "Rebates paid out yesterday" = emissionEstimate(c−1)',
      t.includes(`Sell fee today ${mode}`) &&
        figText(st, `TownHook.burned(${y})`) === fmtTown(b) &&
        figText(st, `BuyerRewards.emissionEstimate(${y})`) === fmtTown(p),
      t.match(/Sell fee today.*?Rebates emitted/)?.[0] ?? '',
    );
  }
  {
    // ETH mode: yesterday burned more than its pot.
    const c = base.hook.currentCycle;
    const y = c - 1;
    const pot = 600_000n * 10n ** 18n;
    const chain: ChainState = {
      ...base,
      // F9u: the state comes from sellFeeShares() (CR-93); ETH mode is (0, 0, 200).
      hook: { ...base.hook, sellFeeInEth: true, sellFeeShares: { burnedBps: 0, reserveBps: 0, ethBps: 200 }, burned: { ...base.hook.burned, [y]: 750_000n * 10n ** 18n } },
      rewards: { ...base.rewards, emissionEstimate: { [y]: pot }, reserveExhausted: false },
    };
    const el = await mount(<Trade sell />, chain, wallet, 'Trade page, Sell, ETH mode (fixture: burned 750,000 > pot 600,000)');
    const line = text(el.querySelector('.sell-mode') as HTMLElement);
    check(
      'CR-57 ETH mode (fixture): "2% in ETH, to the treasury", with the reason',
      line.startsWith('Today’s sell fee: 2% in ETH, to the treasury') &&
        line.includes('burned 750,000 TOWN and paid 600,000 TOWN in rebates: it burned more than it paid, so today the fee is in ETH.'),
      line,
    );
    const rows = text(el.querySelector('#trade-panel-sell .swap-rows') as HTMLElement);
    check('CR-56 ETH mode (fixture): the sell form charges the fee in ETH, to the treasury', rows.includes('Sell fee (2% of the ETH, to the treasury)') && !rows.includes('burned'), rows);
    const st = await mount(<Stats />, chain, wallet, 'Stats page, ETH mode (fixture)');
    check('CR-57 ETH mode (fixture): Stats "Sell fee today 2% in ETH, to the treasury"', text(st).includes('Sell fee today 2% in ETH, to the treasury'));
  }
  {
    // At the floor (F9u: CR-93 replaced CR-56's "always ETH" with the split state, (0, 100, 100), whatever sellFeeInEth() says).
    const chain: ChainState = {
      ...base,
      token: { ...base.token, totalSupply: base.hook.BURN_FLOOR },
      hook: { ...base.hook, sellFeeInEth: false, sellFeeShares: { burnedBps: 0, reserveBps: 100, ethBps: 100 } },
    };
    const el = await mount(<Trade sell />, chain, wallet, 'Trade page, Sell, at the burn floor (fixture)');
    const line = text(el.querySelector('.sell-mode') as HTMLElement);
    check(
      'CR-93 at the floor (fixture): split, "the burn floor is reached" with 100,000,000, 1% in TOWN to the reserve and 1% in ETH',
      line.startsWith('Today’s sell fee: 1% in TOWN to the rebate reserve, 1% in ETH to the treasury') &&
        line.includes('The burn floor is reached: the supply is at 100,000,000 TOWN, so nothing more is burned'),
      line,
    );
  }
  {
    // The reserve spent: TOWN whatever yesterday did.
    const c = base.hook.currentCycle;
    const chain: ChainState = {
      ...base,
      hook: { ...base.hook, sellFeeInEth: false, burned: { ...base.hook.burned, [c - 1]: 10n ** 30n } },
      rewards: { ...base.rewards, reserveExhausted: true },
    };
    const el = await mount(<Trade sell />, chain, wallet, 'Trade page, Sell, rebate reserve spent (fixture)');
    const line = text(el.querySelector('.sell-mode') as HTMLElement);
    check(
      'CR-57 reserve spent (fixture): TOWN, "the rebate reserve is spent"',
      line.startsWith('Today’s sell fee: 2% in TOWN, burned') && line.includes('The rebate reserve is spent'),
      line,
    );
  }
  {
    // Day 0: no day before it.
    const chain: ChainState = {
      ...base,
      hook: { ...base.hook, currentCycle: 0, sellFeeInEth: false, burned: { 0: 0n } },
      rewards: { ...base.rewards, currentCycle: 0, emissionEstimate: {} },
    };
    const st = await mount(<Stats />, chain, wallet, 'Stats page, day 1 (fixture)');
    const t = text(st);
    // F9u (CR-94): cycle 0, the launch day, is shown as Day 1.
    check('CR-57 the launch day (fixture): TOWN, "Day 1 has no day before it"; yesterday’s figures "—"', t.includes('Sell fee today 2% in TOWN, burned') && t.includes('Day 1 has no day before it') && t.includes('TOWN burned yesterday —'), t.match(/Sell fee today.*?Rebates emitted/)?.[0] ?? '');
  }

  // ---- CR-80: the owner’s words on a burning day, and the tie -------------------------------
  // The three cases of the compare sentence, each from a fixture: yesterday’s rebates above its burn
  // (the owner’s "inflation exceeded deflation"), the two exactly equal ("inflation matched
  // deflation", including a quiet day with both at zero), and the burn above the rebates (the ETH
  // day, which keeps "it burned more than it paid").
  {
    const y = base.hook.currentCycle - 1;
    const TOWN = 10n ** 18n;
    /** A TOWN-mode day: the fee is burned, the reserve is not spent, and yesterday’s two figures are given. */
    const townDay = (b: bigint, p: bigint): ChainState => ({
      ...base,
      hook: { ...base.hook, sellFeeInEth: false, burned: { ...base.hook.burned, [y]: b } },
      rewards: { ...base.rewards, emissionEstimate: { [y]: p }, reserveExhausted: false },
    });
    const sellMode = async (chain: ChainState, label: string) => {
      const el = await mount(<Trade sell />, chain, wallet, label);
      return text(el.querySelector('.sell-mode') as HTMLElement);
    };
    const above = await sellMode(townDay(0n, 667_925n * TOWN), 'Trade page, Sell, TOWN mode (fixture: burned 0, rebates 667,925)');
    check(
      'CR-80 rebates above the burn: "…in rebates: inflation exceeded deflation, so today the fee is burned." — the old clause gone, and no "it" left in front of the new one',
      above.includes('burned 0 TOWN and paid 667,925 TOWN in rebates: inflation exceeded deflation, so today the fee is burned.') &&
        !above.includes('did not burn more than it paid') &&
        !above.includes('it inflation'),
      above,
    );
    const tie = await sellMode(townDay(400_000n * TOWN, 400_000n * TOWN), 'Trade page, Sell, TOWN mode (fixture: a tie, 400,000 each)');
    const quiet = await sellMode(townDay(0n, 0n), 'Trade page, Sell, TOWN mode (fixture: a quiet day, both 0)');
    check(
      'CR-80 the two exactly equal: "inflation matched deflation", on a tie and on a quiet day with both at zero',
      tie.includes('burned 400,000 TOWN and paid 400,000 TOWN in rebates: inflation matched deflation, so today the fee is burned.') &&
        quiet.includes('burned 0 TOWN and paid 0 TOWN in rebates: inflation matched deflation, so today the fee is burned.') &&
        !tie.includes('exceeded') &&
        !quiet.includes('exceeded'),
      `${tie} || ${quiet}`,
    );
    const ethChain: ChainState = {
      ...base,
      hook: { ...base.hook, sellFeeInEth: true, sellFeeShares: { burnedBps: 0, reserveBps: 0, ethBps: 200 }, burned: { ...base.hook.burned, [y]: 750_000n * TOWN } },
      rewards: { ...base.rewards, emissionEstimate: { [y]: 600_000n * TOWN }, reserveExhausted: false },
    };
    const eth = await sellMode(ethChain, 'Trade page, Sell, ETH mode (fixture: burned 750,000 > pot 600,000)');
    check(
      'CR-80 the burn above the rebates: the ETH day is unchanged — "it burned more than it paid, so today the fee is in ETH.", with no inflation or deflation in it',
      eth.includes('burned 750,000 TOWN and paid 600,000 TOWN in rebates: it burned more than it paid, so today the fee is in ETH.') && !/inflation|deflation/.test(eth),
      eth,
    );
    // sellFeeWords is one function, so the Stats figure "Sell fee today" carries the same clause.
    const st = await mount(<Stats />, townDay(0n, 667_925n * TOWN), wallet, 'Stats page, TOWN mode (fixture: burned 0, rebates 667,925)');
    check(
      'CR-80 Stats: the same clause beside "Sell fee today" (one wording, one function)',
      text(st).includes('in rebates: inflation exceeded deflation, so today the fee is burned.'),
      text(st).match(/Sell fee today[\s\S]*?so today the fee is burned\./)?.[0] ?? '',
    );
  }

  // ---- CR-61: the Stats trading volume, live and on day 0 -----------------------------------
  {
    // Live: the four figures against the two views read again here, on their own, at the same block.
    const c = base.rewards.currentCycle;
    const at = (fn: 'cycleTotal' | 'sold', d: number) =>
      client.readContract({ address: k.TownHook, abi: HOOK_ABI, functionName: fn, args: [BigInt(d)], blockNumber: base.blockNumber }) as Promise<bigint>;
    const [bt, st, by, sy] = await Promise.all([at('cycleTotal', c), at('sold', c), c >= 1 ? at('cycleTotal', c - 1) : 0n, c >= 1 ? at('sold', c - 1) : 0n]);
    const el = await mount(<TradingVolume />, base, wallet, 'Stats trading volume (live)');
    const shown = {
      boughtYesterday: figText(el, `TownHook.cycleTotal(${c - 1})`),
      soldYesterday: figText(el, `TownHook.sold(${c - 1})`),
      boughtToday: figText(el, `TownHook.cycleTotal(${c})`),
      soldToday: figText(el, `TownHook.sold(${c})`),
    };
    check(
      'CR-61 Stats (live): Bought/Sold yesterday = cycleTotal(c−1)/sold(c−1), Bought/Sold today so far = cycleTotal(c)/sold(c), same block',
      c >= 1 &&
        shown.boughtYesterday === fmtTown(by) &&
        shown.soldYesterday === fmtTown(sy) &&
        shown.boughtToday === fmtTown(bt) &&
        shown.soldToday === fmtTown(st),
      `block ${base.blockNumber}, day ${c}: shown ${JSON.stringify(shown)}; views cycleTotal(${c - 1}) ${by}, sold(${c - 1}) ${sy}, cycleTotal(${c}) ${bt}, sold(${c}) ${st}`,
    );
    const t = plain(() => text(el)).replace(/(\d)TOWN/g, '$1 TOWN'); // unstyled, the value and its unit touch
    check(
      'CR-61 Stats (live): today is marked as still counting, and the line says what the figures are',
      t.includes(`Bought today so far ${fmtTown(bt)} TOWN ${dayName(c)}, still counting`) &&
        t.includes(`Sold today so far ${fmtTown(st)} TOWN ${dayName(c)}, still counting`) &&
        t.includes('Bought is the TOWN buyers received from the pool; sold is the TOWN sellers gave up, before the 2% sell fee.') &&
        !/ETH/.test(t.replace(/[Vv]erify[^]*$/, '')),
      t,
    );
    const page = await mount(<Stats />, base, wallet, 'Stats page with the trading volume (live)');
    const cards = [...page.querySelectorAll('.card-title')].map((h) => h.textContent);
    check('CR-61 Stats page: the block sits after the Treasury card, before the ETH and TOWN cards', cards.slice(0, 4).join(' | ') === 'Treasury | Trading volume, in TOWN | ETH in and out, since launch | TOWN', cards.join(' | '));
  }
  {
    // Day 0: no yesterday.
    const chain: ChainState = {
      ...base,
      hook: { ...base.hook, currentCycle: 0, cycleTotal: { 0: 5n * 10n ** 24n }, sold: { 0: 10n ** 24n } },
      rewards: { ...base.rewards, currentCycle: 0 },
    };
    const el = await mount(<TradingVolume />, chain, wallet, 'Stats trading volume on day 1 (fixture)');
    const t = plain(() => text(el)).replace(/(\d)TOWN/g, '$1 TOWN');
    check(
      'CR-61 the launch day, Day 1 since CR-94 (fixture): yesterday reads "None yet"; today 5,000,000 bought and 1,000,000 sold, still counting',
      t.includes('Bought yesterday None yet Day 1 has no day before it') &&
        t.includes('Sold yesterday None yet Day 1 has no day before it') &&
        t.includes('Bought today so far 5,000,000 TOWN Day 1, still counting') &&
        t.includes('Sold today so far 1,000,000 TOWN Day 1, still counting'),
      t,
    );
  }

  // ---- F9b (CR-64): the owner page and the Trade page without the Uniswap button -------------
  {
    const o = live.owner;
    const W2 = NETWORK.testWallets[1].address;
    const W3 = NETWORK.testWallets[2].address;
    const ownerWallet = { ...wallet, address: OWNER };
    const w2Wallet = { ...wallet, address: W2 };
    /** Sets an input the way typing does. */
    const typeIn = (el: HTMLElement, sel: string, v: string) => {
      const input = el.querySelector(sel) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inAction = (el: HTMLElement, id: string) => el.querySelector(`[data-action="${id}"]`) as HTMLElement;
    const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
    const p2 = (x: number) => String(x).padStart(2, '0');
    const localValue = (ts: number) => {
      const d = new Date(ts * 1000);
      return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
    };
    /** Presses the action's Check button and waits for the read-only call's answer. */
    const runCheck = async (el: HTMLElement, id: string) => {
      button(inAction(el, id), 'Check:')!.click();
      for (let i = 0; i < 100; i++) {
        await settle(100);
        const r = inAction(el, id).querySelector('.check-result') as HTMLElement | null;
        if (r) return r;
      }
      return null;
    };
    const shown = (el: HTMLElement, v: string) => (el.querySelector(`[data-view="${v}"]`) as HTMLElement | null)?.innerText.trim() ?? null;

    // The Trade page: no "Sell on Uniswap" button, no sentence about it, no link to the Uniswap app.
    {
      const el = await mount(<Trade />, base, wallet, 'Trade page without the Uniswap button (live)');
      const all = (el.textContent ?? '').replace(/\s+/g, ' ');
      check(
        'CR-64 Trade: no "Sell on Uniswap" button, no sentence about it, no link to app.uniswap.org',
        !all.includes('Sell on Uniswap') && !all.includes('second way to trade') && !all.includes('Uniswap app') && !el.querySelector('a[href*="uniswap.org"]'),
        all.match(/Other TOWN pools[^.]*\./)?.[0] ?? '',
      );
    }

    // Who sees the page and the link.
    check('CR-64 the owner test wallet is in the local wallet picker, labelled Owner', NETWORK.local && NETWORK.testWallets.some((w) => w.label === 'Owner' && w.address === OWNER));
    check('CR-64 owner gate: the Owner link shows for the owner wallet, not for Test wallet 2 or no wallet', showsOwnerLink(o, OWNER) && !showsOwnerLink(o, W2) && !showsOwnerLink(o, null));
    {
      const el = await mount(<Owner />, base, ownerWallet, 'Owner page as the owner (live)');
      const titles = [...el.querySelectorAll('.card-title')].map((h) => h.textContent).join(' | ');
      const ids = ['setSpendRate', 'withdrawOwnerEth', 'withdrawTown', 'announceStaking', 'announcePause', 'setFallbackPrice', 'announceFeed', 'collectFees', 'extendLock', 'withdrawPosition', 'transferOwnership-Treasury', 'transferOwnership-TownStaking', 'transferOwnership-LPVault'];
      check(
        'CR-64 owner gate (live): the owner sees the Treasury, TownStaking and LPVault cards with every action',
        titles === 'Treasury | TownStaking | LPVault' && ids.every((id) => !!inAction(el, id)) && text(el).includes('Sent from this wallet'),
        `${titles}; missing ${ids.filter((id) => !inAction(el, id)).join(', ') || 'none'}`,
      );
      const views = [
        'Treasury.spendBps', 'Treasury.MAX_SPEND_BPS', 'Treasury.budget', 'Treasury.ownerEthAvailable', 'Treasury.ownerTownAvailable', 'Treasury.paused', 'Treasury.pauseEffectiveAt',
        'Treasury.staking', 'Treasury.pendingStaking', 'Treasury.OWNER_DELAY, Treasury.APPLY_WINDOW', 'TownStaking.priceStatus', 'TownStaking.fallbackPrice',
        'TownStaking.fallbackPriceSetAt + FALLBACK_MAX_AGE', 'TownStaking.feed', 'TownStaking.pendingFeed', 'TownStaking.FEED_CHANGE_DELAY', 'LPVault.tokenId', 'LPVault.unlockTime',
        'LPVault.MIN_LOCK_DURATION', 'Treasury.owner', 'Treasury.pendingOwner', 'TownStaking.owner', 'TownStaking.pendingOwner', 'LPVault.owner', 'LPVault.pendingOwner',
      ];
      const missing = views.filter((v) => !el.querySelector(`[data-view="${v}"]`));
      check('CR-64 every setting in the CR is shown beside its action', missing.length === 0, missing.join(', '));
      check(
        'CR-64 settings equal the chain (live): spend rate, token ID, the three owners',
        shown(el, 'Treasury.spendBps') === `${base.treasury.spendBps / 100}%` &&
          shown(el, 'LPVault.tokenId') === `#${o.lpVault.tokenId}` &&
          shown(el, 'Treasury.owner') === o.treasury.owner &&
          shown(el, 'TownStaking.owner') === o.staking.owner &&
          shown(el, 'LPVault.owner') === o.lpVault.owner,
        `${shown(el, 'Treasury.spendBps')}, ${shown(el, 'LPVault.tokenId')}, ${shown(el, 'LPVault.owner')}`,
      );
      check('CR-64 withdrawing the position is off before the unlock date', button(inAction(el, 'withdrawPosition'), 'Check:')?.disabled === true && text(inAction(el, 'withdrawPosition')).includes('Off until the unlock date'));

      // Input checks in the page.
      typeIn(el, '#owner-rate', '30');
      await settle();
      check('CR-64 input check: a rate above 25% is refused in the page', text(inAction(el, 'setSpendRate')).includes('The rate must be between 1% and 25%.'));
      typeIn(el, '#owner-eth-to', '0x1234');
      typeIn(el, '#owner-eth-amount', '1');
      await settle();
      check('CR-64 input check: a malformed address is refused', text(inAction(el, 'withdrawOwnerEth')).includes('That is not an address'));
      typeIn(el, '#owner-eth-to', OWNER);
      typeIn(el, '#owner-eth-amount', '1000');
      await settle();
      check('CR-64 input check: more ETH than the owner reserve is refused', text(inAction(el, 'withdrawOwnerEth')).includes('That is more than is available'));
      typeIn(el, '#owner-price', '0');
      await settle();
      check('CR-64 input check: a fallback price of zero is refused', text(inAction(el, 'setFallbackPrice')).includes('Enter a price above zero.'));
      typeIn(el, '#owner-unlock', localValue(o.lpVault.unlockTime - 86_400));
      await settle();
      check('CR-64 input check: an unlock date earlier than the current one is refused', text(inAction(el, 'extendLock')).includes('must be later than the current one'));

      // The confirmation of an action that cannot be undone: offering ownership of LPVault (checked, never sent).
      typeIn(el, '#owner-offer-LPVault', W1);
      await settle();
      const res = await runCheck(el, 'transferOwnership-LPVault');
      const panel = inAction(el, 'transferOwnership-LPVault').querySelector('.confirm-panel') as HTMLElement | null;
      const confirm = () => button(inAction(el, 'transferOwnership-LPVault'), 'Confirm: Offer ownership');
      const offAtFirst = confirm()?.disabled === true;
      typeIn(el, '#confirm-transferOwnership-LPVault', 'offer');
      await settle();
      const offPartial = confirm()?.disabled === true;
      typeIn(el, '#confirm-transferOwnership-LPVault', 'offer ownership');
      await settle();
      const onTyped = confirm()?.disabled === false;
      check(
        'CR-64 cannot be undone: the check passes, the consequence is stated, and Confirm stays off until "offer ownership" is typed',
        res?.dataset.check === 'ok' && !!panel && text(panel).includes('every owner power of LPVault passes to it') && text(panel).includes('Type offer ownership to confirm') && offAtFirst && offPartial && onTyped,
        `${res?.innerText ?? 'no result'} | off at first ${offAtFirst}, off with "offer" ${offPartial}, on when typed ${onTyped}`,
      );
      // A later unlock date: the check passes and "extend the lock" must be typed.
      typeIn(el, '#owner-unlock', localValue(o.lpVault.unlockTime + 86_400));
      await settle();
      const resL = await runCheck(el, 'extendLock');
      check(
        'CR-64 cannot be undone: extending the lock checks, says it can never be shortened, and needs "extend the lock" typed',
        resL?.dataset.check === 'ok' &&
          button(inAction(el, 'extendLock'), 'Confirm: Extend the lock')?.disabled === true &&
          text(inAction(el, 'extendLock')).includes('never shortened') &&
          text(inAction(el, 'extendLock')).includes('Type extend the lock to confirm'),
        resL?.innerText ?? 'no result',
      );
      // The read-only check of a staking replacement shows the treasury's own reason.
      typeIn(el, '#owner-staking', WETH);
      await settle();
      const resW = await runCheck(el, 'announceStaking');
      check(
        'CR-64 announcing WETH: the read-only check shows the plain refusal, and no confirmation appears',
        resW?.dataset.check === 'refused' && resW.dataset.error === 'StakingWrongTreasury' && !inAction(el, 'announceStaking').querySelector('.confirm-panel'),
        resW?.innerText ?? 'no result',
      );
    }

    // A wallet that is not an owner: the page says it is for the owner and shows nothing else.
    {
      const el = await mount(<Owner />, base, w2Wallet, 'Owner page as Test wallet 2 (live)');
      const t = text(el);
      check('CR-64 non-owner (live): only the notice, no setting and no action', t.includes('This page is for the owner wallet.') && !el.querySelector('.owner-action, .setting, .card'), t);
    }

    // The Safe path, from a fixture: the owner address made to look like a Safe whose signers are Test wallets 1 and 2.
    {
      const safeO: OwnerState = { ...o, multisigs: { [OWNER.toLowerCase()]: { address: OWNER, signers: [W1, W2], threshold: 2 } } };
      check('CR-64 Safe (fixture): a signer gets the Owner link and the page; a wallet that is not a signer does not', showsOwnerLink(safeO, W1) && pageAccess(safeO, W1).kind === 'open' && pageAccess(safeO, W3).kind === 'closed');
      const el = await mount(<OwnerPage o={safeO} chain={base} access={pageAccess(safeO, W1)} />, base, wallet, 'Owner page, Safe signer (fixture)');
      check('CR-64 Safe (fixture): the notice says actions are prepared for the Safe', text(el).includes('Prepared for the Safe, not sent') && text(el).includes('2 of whom must approve'), text(el).slice(0, 300));
      typeIn(el, '#owner-rate', '12');
      await settle();
      const r = await runCheck(el, 'setSpendRate'); // checked as the Safe itself would call it
      const prep = button(inAction(el, 'setSpendRate'), 'Prepare in Safe');
      const noSend = !button(inAction(el, 'setSpendRate'), 'Confirm:');
      prep?.click();
      await settle();
      const panel = inAction(el, 'setSpendRate').querySelector('.safe-panel') as HTMLElement | null;
      const values = panel ? [...panel.querySelectorAll('.copy-value')].map((c) => c.textContent) : [];
      const data = encodeFunctionData({ abi: TREASURY_ABI, functionName: 'setSpendRate', args: [1200n] });
      const link = panel?.querySelector('a') as HTMLAnchorElement | null;
      check(
        'CR-64 Safe (fixture): "Prepare in Safe" instead of sending, with the target, value 0 and calldata to copy, and a link to app.safe.global',
        r?.dataset.check === 'ok' &&
          !!prep &&
          noSend &&
          values[0] === k.Treasury &&
          values[1] === '0' &&
          values[2] === data &&
          panel!.querySelectorAll('.copy-row button').length === 3 &&
          !!link?.href.startsWith('https://app.safe.global'),
        `${r?.innerText ?? ''} | ${values.join(' | ')} | ${link?.href ?? 'no link'}`,
      );
    }

    // An owner contract that does not answer getOwners(): read-only for anyone who connects, with the reason.
    {
      const roO: OwnerState = { ...o, multisigs: { [OWNER.toLowerCase()]: { address: OWNER, signers: null, threshold: null } } };
      const access = pageAccess(roO, W2);
      const el = await mount(<OwnerPage o={roO} chain={base} access={access} />, base, w2Wallet, 'Owner page, read-only (fixture)');
      const checks = [...el.querySelectorAll('.owner-action button')].filter((b) => b.textContent!.startsWith('Check:')) as HTMLButtonElement[];
      check(
        'CR-64 read-only (fixture): settings shown, every action off, and the reason given',
        access.kind === 'read-only' && !showsOwnerLink(roO, W2) && checks.length > 0 && checks.every((b) => b.disabled) && text(el).includes('did not answer when asked for its signers'),
        `${access.kind}, ${checks.length} actions`,
      );
    }

    // Before launch, from a fixture: the Launcher card and its launch, checked against the real (launched) chain.
    {
      const pre: OwnerState = { ...o, launcher: { ...o.launcher, launched: false } };
      const el = await mount(<OwnerPage o={pre} chain={null} access={pageAccess(pre, OWNER)} />, null, ownerWallet, 'Owner page before launch (fixture)');
      const r = await runCheck(el, 'launch');
      check(
        'CR-64 before launch (fixture): Launch is offered with "launch" to type; the check gives the launched chain’s plain refusal',
        !!inAction(el, 'launch') && text(el).includes('Ownership of LPVault') && r?.dataset.error === 'AlreadyLaunched' && r.innerText.includes('UpTown has already launched; the launch cannot be repeated.'),
        r?.innerText ?? 'no result',
      );
      const after = await mount(<Owner />, base, ownerWallet, 'Owner page after launch (live)');
      check('CR-64 after launch (live): no Launcher card', !inAction(after, 'launch') && !!inAction(after, 'setSpendRate'));
    }

    // The staking replacement errors, each in a plain sentence.
    {
      const names = ['StakingNotContract', 'SameStaking', 'StakingDelegated', 'StakingWrongTreasury', 'StakingWrongWeth', 'StakingChangeNotReady', 'StakingChangeExpired'] as const;
      const plain = names.map((n) => {
        const e = new ContractFunctionRevertedError({ abi: ERRORS_ABI, data: encodeErrorResult({ abi: ERRORS_ABI, errorName: n }), functionName: 'announceStaking' });
        return { n, x: explainError(e) };
      });
      check(
        'CR-64 each staking-replacement error has its own plain sentence',
        plain.every((p) => p.x.name === p.n && !p.x.message.includes(`(${p.n})`)) && new Set(plain.map((p) => p.x.message)).size === names.length,
        plain.map((p) => `${p.n}: ${p.x.message}`).join(' || '),
      );
      const refusal = async (arg: Address) => {
        try {
          await client.simulateContract({ account: OWNER, address: k.Treasury, abi: TREASURY_ABI, functionName: 'announceStaking', args: [arg] });
          return 'no revert';
        } catch (e) {
          return explainError(e).name;
        }
      };
      const noCode = await refusal('0x000000000000000000000000000000000000dEaD');
      const same = await refusal(base.treasury.staking);
      check('CR-64 live: an address without code and the current contract give StakingNotContract and SameStaking', noCode === 'StakingNotContract' && same === 'SameStaking', `${noCode}, ${same}`);
    }
  }

  // ---- F8g housekeeping: the upgradeable flag --------------------------------------------------
  {
    const AAVE_POOL: Address = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
    const proxy = await verifyCandidate(client, AAVE_POOL, k.Treasury, base.treasury.weth);
    check('F8g a real EIP-1967 proxy (Aave v3 Pool on the forked chain): flagged upgradeable', proxy.upgradeable && !proxy.verified, JSON.stringify(proxy));
    check('F8g TownStaking: not upgradeable (its EIP-1967 slot is empty)', !atStaking.upgradeable && atStaking.verified, JSON.stringify(atStaking));
    const el = await mount(<CandidateMark check={proxy} />, base, wallet, 'the mark for Aave’s v3 Pool (live check)');
    check('F8g the mark for a proxy carries "Upgradeable: its code can change"', text(el).includes('Upgradeable: its code can change'), text(el));
    const both = await mount(<CandidateMark check={{ ...verified, upgradeable: true }} />, base, wallet, 'verified and upgradeable (fixture)');
    const tb = text(both);
    check('F8g verified and upgradeable (fixture): both tags, and no "its code is fixed"', tb.startsWith('Verified') && tb.includes('Upgradeable: its code can change') && !tb.includes('its code is fixed'), tb);
    const plain = await mount(<CandidateMark check={verified} />, base, wallet, 'verified, not upgradeable (fixture)');
    check('F8g verified, not upgradeable (fixture): no upgradeable tag', !text(plain).includes('Upgradeable'), text(plain));
  }

  // ---- CR-71 (F9g): no "Home" item in the navigation bar; the name is the homepage's link ----------
  {
    const items = (ownerLink: boolean) => navItems(ownerLink).map((n) => `${n.label}=#/${n.page}`).join(', ');
    check(
      'CR-71 navigation items: Trade, Rewards, Stake, Stats, Docs (and Owner last, for the owner wallet only); no Home',
      items(false) === 'Trade=#/trade, Rewards=#/rewards, Stake=#/stake, Stats=#/stats, Docs=#/docs' &&
        items(true) === 'Trade=#/trade, Rewards=#/rewards, Stake=#/stake, Stats=#/stats, Docs=#/docs, Owner=#/owner',
      `${items(false)} | ${items(true)}`,
    );

    // The whole site, as main.tsx renders it, on the test page's own address (no hash: the homepage).
    const savedTitle = document.title;
    const box = document.createElement('div');
    stage.append(box);
    render(<App />, box);
    const settle = () => new Promise((r) => setTimeout(r, 60));
    await settle();
    const header = box.querySelector('header.site-header') as HTMLElement;
    const navLinks = () => [...header.querySelectorAll('nav#site-nav a')] as HTMLAnchorElement[];
    const current = () => navLinks().filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent!.trim());
    const mark = header.querySelector('a.wordmark') as HTMLAnchorElement | null;
    const labels = navLinks().map((a) => `${a.textContent!.trim()}=${a.getAttribute('href')}`);
    check(
      'CR-71 header: no "Home" link; the "UpTown" name links to #/ with an accessible name; nothing marked current on the homepage; title "UpTown (TOWN)"',
      labels.join(', ') === 'Trade=#/trade, Rewards=#/rewards, Stake=#/stake, Stats=#/stats, Docs=#/docs' &&
        !navLinks().some((a) => /home/i.test(a.textContent!) || a.getAttribute('href') === '#/') &&
        mark?.getAttribute('href') === '#/' &&
        mark.textContent!.trim() === 'UpTown' &&
        /home/i.test(mark.getAttribute('aria-label') ?? '') &&
        current().length === 0 &&
        document.title === 'UpTown (TOWN)',
      `${labels.join(', ')} | name: ${mark?.getAttribute('href')} "${mark?.getAttribute('aria-label')}" | current: ${current().join(',') || 'none'} | ${document.title}`,
    );

    // Another page: its item is marked current as before; the name then opens the homepage.
    location.hash = '#/trade';
    await settle();
    const onTrade = `${current().join(',')} | ${document.title}`;
    mark!.click();
    await settle();
    const back = `${location.hash} | ${current().join(',') || 'none'} | ${document.title} | ${box.querySelector('main h1')?.textContent?.trim() ?? 'no h1'}`;
    check(
      'CR-71 on Trade, "Trade" is marked current and the title is unchanged; clicking the name opens the homepage',
      onTrade === 'Trade | Trade TOWN · UpTown' && back.startsWith('#/ | none | UpTown (TOWN) | '),
      `${onTrade} || after the click: ${back}`,
    );

    render(null, box);
    box.remove();
    history.replaceState(null, '', location.pathname + location.search);
    document.title = savedTitle;
  }

  await cr72(base, wallet, live.owner);
  await cr73(base, wallet, live.owner);
  await cr75();
  await cr76();
  await cr77(base, wallet);
  await cr82(base, wallet);
  await cr84cr87cr88();
  await cr92(base, wallet);
  await cr95(base, wallet);
  await f9u(base, wallet);
  await f12a(base, wallet, live.owner, live);

  if (!GALLERY) stage.replaceChildren();
}

// ---- F9i (CR-72): the six website fixes from the security review --------------------------------
async function cr72(base: ChainState, wallet: WalletState, o: OwnerState) {
  const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  const typeIn = (el: HTMLElement, sel: string, v: string) => {
    const input = el.querySelector(sel) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const usesIn = (el: Element | null) => plain(() => (el?.querySelector('.uses') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? null);
  const inAction = (el: HTMLElement, id: string) => el.querySelector(`[data-action="${id}"]`) as HTMLElement;
  const runCheck = async (el: HTMLElement, id: string) => {
    button(inAction(el, id), 'Check:')!.click();
    for (let i = 0; i < 100; i++) {
      await settle(100);
      const r = inAction(el, id).querySelector('.check-result') as HTMLElement | null;
      if (r) return r;
    }
    return null;
  };
  const W2 = NETWORK.testWallets[1].address;

  // ---- 1. Staking transactions only to listed contracts -------------------------------------------
  // A stand-in for a staking contract the RPC names and the site does not list.
  const FAKE: Address = getAddress('0x5e1f0000000000000000000000000000000c0ffe');
  {
    check('CR-72 item 1: the local list holds TownStaking (the address file’s), and not the stand-in', listedStaking(NETWORK, k.TownStaking) === k.TownStaking && listedStaking(NETWORK, FAKE) === null);
    const tries: [string, () => unknown][] = [
      ['approve TOWN for staking', () => approveTx(NETWORK, FAKE, 1n)],
      ['open', () => openVaultTx(NETWORK, FAKE, 1, 1n, 1n)],
      ['add', () => addStakeTx(NETWORK, FAKE, 1n)],
      ['upgrade', () => upgradeTx(NETWORK, FAKE, 2, 1n)],
      ['unstake', () => unstakeTx(NETWORK, FAKE)],
      ['claim', () => claimWethTx(NETWORK, FAKE)],
      ['owner: set the fallback price', () => ownerTx(NETWORK, 'TownStaking', 'setFallbackPrice', [1n], FAKE)],
      ['owner: offer ownership', () => ownerTx(NETWORK, 'TownStaking', 'transferOwnership', [W2], FAKE)],
    ];
    const refused = tries.map(([name, f]) => {
      try {
        f();
        return `${name}: built`;
      } catch (e) {
        return e instanceof UnlistedStakingError && String((e as Error).message).startsWith(UNLISTED_STAKING) ? null : `${name}: ${String(e)}`;
      }
    });
    check('CR-72 item 1: every staking transaction builder refuses an unlisted address (approve, open, add, upgrade, unstake, claim, the owner powers)', refused.every((r) => r === null), refused.filter(Boolean).join('; '));
    // The same builders, given the RPC's spelling of a listed address, use the site's own copy.
    const lower = k.TownStaking.toLowerCase() as Address;
    check(
      'CR-72 item 1: a listed address read in another spelling is replaced by the site’s own copy',
      claimWethTx(NETWORK, lower).address === k.TownStaking && (approveTx(NETWORK, lower, 1n).args![0] as string) === k.TownStaking && ownerTx(NETWORK, 'TownStaking', 'claim', [], lower).address === k.TownStaking,
    );
    // The last check before sending, checking or preparing.
    const toFake = { ...claimWethTx(NETWORK, k.TownStaking), address: FAKE };
    const approveFake = { ...approveTx(NETWORK, k.TownStaking, 1n), args: [FAKE, 1n] };
    check(
      'CR-72 item 1: the send check refuses a call to an unlisted address, and a TOWN approval naming one; allows the site’s own',
      !!targetProblem(NETWORK, toFake) && !!targetProblem(NETWORK, approveFake)?.startsWith(UNLISTED_STAKING) && targetProblem(NETWORK, claimWethTx(NETWORK, k.TownStaking)) === null && targetProblem(NETWORK, approvePermit2Tx(NETWORK)) === null,
      `${targetProblem(NETWORK, toFake)} | ${targetProblem(NETWORK, approveFake)}`,
    );
    let sent = 'resolved';
    try {
      await sendTx(NETWORK, client, W1, toFake);
    } catch (e) {
      sent = e instanceof UnknownTargetError ? 'refused' : String(e);
    }
    check('CR-72 item 1: sendTx refuses a request to the unlisted address before anything reaches the wallet or the chain', sent === 'refused', sent);

    // The Stake page while the treasury pays the stand-in: figures shown, opening, adding and upgrading off.
    const [inListed] = await readVaults(client, [{ address: k.TownStaking, replacedOn: null }], W1);
    const chain: ChainState = { ...base, treasury: { ...base.treasury, staking: FAKE }, staking: { ...base.staking, address: FAKE } };
    const el = await mount(<Stake />, chain, { ...wallet, oldVaults: [inListed] }, 'Stake page, the treasury pays an unlisted contract (fixture)');
    const t = text(el);
    const vault = [...el.querySelectorAll('.card')].find((c) => c.querySelector('.card-title')?.textContent === 'Your vault') as HTMLElement;
    const old = el.querySelector('.old-vault') as HTMLElement;
    check(
      'CR-72 item 1: Stake shows "This site has not been updated for the new staking contract yet", the address in full, and the tier figures',
      t.includes(UNLISTED_STAKING) && t.includes(FAKE) && !!el.querySelector('table.tiers') && !!vault?.querySelector('[data-view="TownStaking.positionOf(wallet).amount"]'),
      t.slice(0, 300),
    );
    check(
      'CR-72 item 1: no open, add, upgrade, unstake or claim offered for the unlisted contract',
      !!vault && !/Open tier|Add TOWN|Upgrade to|Unstake everything|Claim /.test(text(vault)) && vault.querySelectorAll('button').length === 0,
      vault ? text(vault).slice(0, 200) : 'no vault card',
    );
    check(
      'CR-72 item 1: the vault in the listed TownStaking keeps Claim and Unstake, on',
      !!old && button(old, 'Claim')?.disabled === false && button(old, 'Unstake everything')?.disabled === false,
      old ? text(old).slice(0, 160) : 'no card for the listed contract',
    );
    check('CR-72 item 1: no "replaced, offers vaults only in it" notice for an unlisted contract', !t.includes('this page offers vaults only in it'));

    // The Owner page: the staking contract's powers off, with the reason; the treasury's on.
    const ownerFake: OwnerState = { ...o, staking: { ...o.staking, address: FAKE } };
    const ow = await mount(<OwnerPage o={ownerFake} chain={chain} access={pageAccess(ownerFake, OWNER)} />, chain, { ...wallet, address: OWNER }, 'Owner page, the treasury pays an unlisted contract (fixture)');
    const off = ['setFallbackPrice', 'announceFeed', 'transferOwnership-TownStaking'].map((id) => button(inAction(ow, id), 'Check:')?.disabled === true && text(inAction(ow, id)).includes(UNLISTED_STAKING));
    check(
      'CR-72 item 1: Owner page, every staking power off with "not been updated" (fallback price, feed, ownership); the treasury’s stay on',
      off.every(Boolean) && button(inAction(ow, 'setSpendRate'), 'Check:')?.disabled === false && text(ow).includes(FAKE),
      off.join(', '),
    );
    // The live state: nothing changes for the listed contract.
    const normal = await mount(<Stake />, base, wallet, 'Stake page, live: TownStaking is listed');
    check('CR-72 item 1 (live): with TownStaking listed, no notice, and the vault actions are offered', !text(normal).includes(UNLISTED_STAKING) && !!button(normal, 'Claim'));
  }

  // ---- 2. A point as the decimal mark -------------------------------------------------------------
  {
    const E = 10n ** 18n;
    const cases: [string, string][] = [
      ['1,000.5', `ok ${1000n * E + E / 2n}`],
      ['1000.5', `ok ${1000n * E + E / 2n}`],
      ['12,345,678', `ok ${12_345_678n * E}`],
      ['.5', `ok ${E / 2n}`],
      ['2,5', 'comma'],
      ['0,001', 'comma'],
      ['1,00', 'comma'],
      ['1,0000', 'comma'],
      [',5', 'comma'],
      ['1,000,00', 'comma'],
      ['2.5.1', 'invalid'],
      ['abc', 'invalid'],
      ['', 'empty'],
    ];
    const got = cases.map(([s, want]) => {
      const p = parseAmount(s, 18);
      const g = p.kind === 'ok' ? `ok ${p.value}` : p.kind;
      return g === want ? null : `"${s}" gave ${g}, wanted ${want}`;
    });
    check('CR-72 item 2: commas only between thousands ("1,000.5" ok; "2,5", "0,001", "1,00" refused)', got.every((g) => g === null), got.filter(Boolean).join('; '));
    check('CR-72 item 2: the refusal reads "Use a point for decimals, for example 2.5"', COMMA_MESSAGE === 'Use a point for decimals, for example 2.5' && amountError('2,5', 18, 'x') === COMMA_MESSAGE);

    // Trade: sell amount and both minimum fields.
    const sell = await mount(<Trade sell />, base, wallet, 'Trade, Sell, "2,5" typed (fixture)');
    typeIn(sell, '#sell-town', '2,5');
    await settle();
    const sellBox = sell.querySelector('#trade-panel-sell') as HTMLElement;
    const refusedSell = text(sellBox).includes(COMMA_MESSAGE) && (sell.querySelector('#sell-town') as HTMLInputElement).getAttribute('aria-invalid') === 'true' && usesIn(sellBox.querySelector('.swap-box')) === null;
    typeIn(sell, '#sell-town', '1,000.5');
    await settle();
    const usedSell = usesIn(sellBox.querySelector('.swap-box'));
    check('CR-72 item 2: Trade sell amount: "2,5" refused with the sentence; "1,000.5" shows "Uses 1,000.5 TOWN"', refusedSell && usedSell === 'Uses 1,000.5 TOWN', `${refusedSell} | ${usedSell}`);
    typeIn(sell, '#sell-min', '0,001');
    await settle();
    const refusedMin = text(sellBox).includes(COMMA_MESSAGE);
    typeIn(sell, '#sell-min', '0.001');
    await settle();
    check('CR-72 item 2: Trade sell minimum: "0,001" refused; "0.001" shows "Uses 0.001 ETH"', refusedMin && usesIn(sellBox.querySelector('.row-control')) === 'Uses 0.001 ETH', usesIn(sellBox.querySelector('.row-control')) ?? 'none');
    const buy = await mount(<Trade />, base, wallet, 'Trade, Buy, "2,5" typed (fixture)');
    const buyBox = buy.querySelector('#trade-panel-buy') as HTMLElement;
    typeIn(buy, '#buy-eth', '2,5');
    await settle();
    const refusedBuy = text(buyBox).includes(COMMA_MESSAGE);
    typeIn(buy, '#buy-min', '1,00');
    await settle();
    const refusedBuyMin = text(buyBox).includes(COMMA_MESSAGE) && usesIn(buyBox.querySelector('.row-control')) === null;
    typeIn(buy, '#buy-min', '150,000');
    await settle();
    check(
      'CR-72 item 2: Trade buy amount "2,5" and minimum "1,00" refused; minimum "150,000" shows "Uses 150,000 TOWN"',
      refusedBuy && refusedBuyMin && usesIn(buyBox.querySelector('.row-control')) === 'Uses 150,000 TOWN',
      `${refusedBuy} ${refusedBuyMin} ${usesIn(buyBox.querySelector('.row-control'))}`,
    );

    // Stake: open and add.
    const noVault: WalletState = { ...wallet, positionOf: { tier: 0, amount: 0n }, earned: 0n, oldVaults: [] };
    const st = await mount(<Stake />, base, noVault, 'Stake, open a vault, "2,5" typed (fixture)');
    typeIn(st, '#vault-town', '2,5');
    await settle();
    const stOpen = text(st).includes(COMMA_MESSAGE) && button(st, 'Open tier')?.disabled === true && button(st, 'Approve and open')?.disabled !== false;
    typeIn(st, '#vault-town', '1,000.5');
    await settle();
    const stOpenUses = usesIn(st.querySelector('.field'));
    const st2 = await mount(<Stake />, base, wallet, 'Stake, add TOWN (live vault)');
    (st2.querySelector('#tab-add') as HTMLButtonElement)?.click();
    await settle();
    typeIn(st2, '#add-town', '0,5');
    await settle();
    const stAdd = text(st2).includes(COMMA_MESSAGE) && button(st2, 'Add TOWN')?.disabled === true;
    typeIn(st2, '#add-town', '2.5');
    await settle();
    check(
      'CR-72 item 2: Stake open "2,5" and add "0,5" refused (buttons off); "1,000.5" and "2.5" show the amount used',
      stOpen && stOpenUses === 'Uses 1,000.5 TOWN' && stAdd && usesIn(st2.querySelector('#panel-add .field')) === 'Uses 2.5 TOWN',
      `${stOpen} ${stOpenUses} ${stAdd} ${usesIn(st2.querySelector('#panel-add .field'))}`,
    );

    // The Owner page: ETH, TOWN, the fallback price and the rate.
    const ow = await mount(<Owner />, base, { ...wallet, address: OWNER }, 'Owner page, amounts with commas (live)');
    typeIn(ow, '#owner-eth-to', OWNER);
    typeIn(ow, '#owner-eth-amount', '0,001');
    typeIn(ow, '#owner-town-to', OWNER);
    typeIn(ow, '#owner-town-amount', '1,00');
    typeIn(ow, '#owner-price', '2,5');
    typeIn(ow, '#owner-rate', '2,5');
    await settle();
    const all4 = ['withdrawOwnerEth', 'withdrawTown', 'setFallbackPrice', 'setSpendRate'].map((id) => text(inAction(ow, id)).includes(COMMA_MESSAGE));
    typeIn(ow, '#owner-eth-amount', '0.001');
    typeIn(ow, '#owner-price', '2,500.5');
    typeIn(ow, '#owner-rate', '12.5');
    await settle();
    const usedOwner = [usesIn(inAction(ow, 'withdrawOwnerEth')), usesIn(inAction(ow, 'setFallbackPrice')), usesIn(inAction(ow, 'setSpendRate'))];
    check(
      'CR-72 item 2: Owner ETH "0,001", TOWN "1,00", price "2,5" and rate "2,5" refused; "0.001", "2,500.5" and "12.5" show the amount used',
      all4.every(Boolean) && usedOwner.join(' | ') === 'Uses 0.001 ETH | Uses 2,500.5 USD | Uses 12.5 %',
      `${all4.join(',')} | ${usedOwner.join(' | ')}`,
    );
  }

  // ---- 3. The minimum received ----------------------------------------------------------------------
  {
    const est = 1_000_000n;
    const t = [minCheck(0n, est), minCheck(949_999n, est), minCheck(950_000n, est), minCheck(1_000_001n, est), minCheck(0n, null)];
    check(
      'CR-72 item 3: minCheck: 0 refused (with or without an estimate); 94.99% warned; 95% not; above the estimate warned',
      t[0].zero && t[1].farBelow && !t[1].zero && !t[2].farBelow && t[3].above && !t[3].farBelow && t[4].zero,
      JSON.stringify(t),
    );
    // The buy form, with the live estimate for 0.1 ETH from Test wallet 1.
    const live = await quoteBuy(client, NETWORK, 10n ** 17n, W1);
    const el = await mount(<Trade />, base, wallet, 'Trade, Buy, minimum 0 then 6% below the estimate (live estimate)');
    const box = el.querySelector('#trade-panel-buy') as HTMLElement;
    for (let i = 0; i < 100 && !/\d/.test((box.querySelector('.swap-output') as HTMLElement).innerText); i++) await settle(100);
    const buyBtn = () => button(box, 'Buy TOWN');
    const onAuto = buyBtn()?.disabled === false && !text(box).includes('More than 5% below');
    typeIn(el, '#buy-min', '0');
    await settle();
    const zero = buyBtn()?.disabled === true && text(box).includes('The minimum received cannot be 0');
    const at94 = (live * 94n) / 100n / 10n ** 18n;
    typeIn(el, '#buy-min', at94.toString());
    await settle();
    const warned = text(box).includes('More than 5% below the estimate: a bot can take the difference') && buyBtn()?.disabled === false;
    const at96 = (live * 96n) / 100n / 10n ** 18n;
    typeIn(el, '#buy-min', at96.toString());
    await settle();
    const quiet = !text(box).includes('More than 5% below') && buyBtn()?.disabled === false;
    typeIn(el, '#buy-min', ((live * 110n) / 100n / 10n ** 18n).toString());
    await settle();
    const above = text(box).includes('The minimum is above the estimate');
    check(
      'CR-72 item 3 (live estimate): the 1% default passes; 0 refused (Buy off); 94% warned "a bot can take the difference" (Buy on); 96% quiet; above warned',
      onAuto && zero && warned && quiet && above,
      `estimate ${fmtTown(live)} TOWN; default ${onAuto}, zero ${zero}, 94% ${warned}, 96% ${quiet}, above ${above}`,
    );
    // The sell form: 0 refused too.
    const s = await mount(<Trade sell />, base, wallet, 'Trade, Sell, minimum 0 (fixture)');
    typeIn(s, '#sell-town', '1000');
    typeIn(s, '#sell-min', '0');
    await settle();
    const sb = s.querySelector('#trade-panel-sell') as HTMLElement;
    check('CR-72 item 3: sell minimum 0: refused, the sell button off', text(sb).includes('The minimum received cannot be 0') && (sb.querySelector('.sell-go') as HTMLButtonElement | null)?.disabled === true);
  }

  // ---- 4. Full addresses on the Owner page; the network in the Safe panel ----------------------------
  {
    const el = await mount(<Owner />, base, { ...wallet, address: OWNER }, 'Owner page, a check naming an address (live)');
    const lower = W2.toLowerCase();
    typeIn(el, '#owner-offer-LPVault', lower);
    await settle();
    const r = await runCheck(el, 'transferOwnership-LPVault');
    const panel = inAction(el, 'transferOwnership-LPVault').querySelector('.confirm-panel') as HTMLElement | null;
    check(
      'CR-72 item 4: the check result and the confirmation name the address in full, checksummed (typed in lower case)',
      !!r && r.innerText.includes(W2) && !r.innerText.includes('…') && !!panel && text(panel).includes(W2),
      `${r?.innerText ?? 'no result'} || ${panel ? text(panel).slice(0, 120) : 'no panel'}`,
    );
    const owner = [...el.querySelectorAll('.check-result, .confirm-panel, .notice')].map((n) => (n as HTMLElement).innerText).join(' ');
    check('CR-72 item 4: no shortened address (0x…) anywhere in the Owner page’s checks, confirmations or notices', !/0x[0-9a-fA-F]{4}…/.test(owner));
    check(
      'CR-72 item 4: the network label: "Ethereum (chain 1)", "Sepolia (chain 11155111)", "Local test chain (chain 31337)"',
      networkLabel({ ...NETWORK, name: 'Ethereum', chainId: 1 }) === 'Ethereum (chain 1)' &&
        networkLabel({ ...NETWORK, name: 'Sepolia', chainId: 11155111 }) === 'Sepolia (chain 11155111)' &&
        networkLabel(NETWORK) === 'Local test chain (chain 31337)',
    );
    const safeO: OwnerState = { ...o, multisigs: { [OWNER.toLowerCase()]: { address: OWNER, signers: [W1, W2], threshold: 2 } } };
    const sf = await mount(<OwnerPage o={safeO} chain={base} access={pageAccess(safeO, W1)} />, base, wallet, 'Owner page, Safe signer, the prepared call names the network (fixture)');
    typeIn(sf, '#owner-rate', '12');
    await settle();
    await runCheck(sf, 'setSpendRate');
    button(inAction(sf, 'setSpendRate'), 'Prepare in Safe')?.click();
    await settle();
    const sp = inAction(sf, 'setSpendRate').querySelector('.safe-panel') as HTMLElement | null;
    check(
      'CR-72 item 4: the Safe panel names the network, "Local test chain (chain 31337)", and the Safe in full; the notice too',
      !!sp && sp.querySelector('.safe-network-value')?.textContent === 'Local test chain (chain 31337)' && text(sp).includes(OWNER) && text(sf).includes('is a Safe multisig on Local test chain (chain 31337)'),
      sp ? text(sp).slice(0, 260) : 'no panel',
    );
  }

  // ---- 5. The stale-data notice ------------------------------------------------------------------------
  {
    const now = Math.floor(Date.now() / 1000) * 1000; // a whole second, so "exactly 2 minutes" is exact
    const s = async (age: number, label: string) => text(await mount(<StaleNotice blockTimestamp={Math.floor(now / 1000) - age} nowMs={now} />, base, wallet, label));
    const behind = await s(300, 'stale notice: block 5 minutes old');
    const edge = await s(120, 'stale notice: block exactly 2 minutes old');
    const ahead = await s(-36 * 3600, 'stale notice: block 36 hours ahead of the clock (the local chain)');
    check(
      'CR-72 item 5: a block 5 min old shows "The network service is behind: figures and estimates may be out of date"; 2 min old and a block ahead show nothing',
      behind.startsWith('The network service is behind: figures and estimates may be out of date') && edge === '' && ahead === '',
      `${behind} | "${edge}" | "${ahead}"`,
    );
    check('CR-72 item 5: rpcBehind: 121 s behind is stale, 120 s is not, ahead is not', rpcBehind(1000, 1121_000) && !rpcBehind(1000, 1120_000) && !rpcBehind(5000, 1000_000));
    const liveNow = rpcBehind(base.blockTimestamp, Date.now());
    check('CR-72 item 5 (live): the local chain’s block is ahead of this computer’s clock, so no notice', !liveNow, `block ${base.blockTimestamp}, clock ${Math.floor(Date.now() / 1000)}`);
  }

  // ---- 6. Choosing among installed wallets (EIP-6963) -----------------------------------------------
  {
    const calls: string[] = [];
    const stub = (name: string) => ({
      request: async ({ method }: { method: string }) => {
        calls.push(`${name}:${method}`);
        if (method === 'eth_chainId') return '0x1';
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [W1];
        return null;
      },
    });
    // With no announcement: window.ethereum, as before.
    const fallback = stub('window.ethereum');
    (window as unknown as { ethereum?: unknown }).ethereum = fallback;
    const fb = activeProvider() === fallback;
    const ICON_A = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#e2761b"/></svg>');
    const ICON_B = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#3375bb"/></svg>');
    const a = stub('Stand-in A');
    const b = stub('Stand-in B');
    const seen: number[] = [];
    const stop = watchWallets((list) => seen.push(list.length));
    const announce = (uuid: string, name: string, icon: string, rdns: string, provider: unknown) =>
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid, name, icon, rdns }, provider }) }));
    announce('11111111-1111-4111-8111-111111111111', 'Stand-in Wallet A', ICON_A, 'test.standin.a', a);
    const one = activeProvider() === a;
    announce('22222222-2222-4222-8222-222222222222', 'Stand-in Wallet B', ICON_B, 'test.standin.b', b);
    announce('22222222-2222-4222-8222-222222222222', 'Stand-in Wallet B', ICON_B, 'test.standin.b', b); // announced again: one entry
    announce('33333333-3333-4333-8333-333333333333', 'Bad icon', 'https://example.com/icon.png', 'test.bad', stub('Bad'));
    stop();
    check(
      'CR-72 item 6: no wallet announced: window.ethereum; one: that wallet; several and none chosen: none (the visitor picks)',
      fb && one && activeProvider() === null && seen[seen.length - 1] === 3,
      `fallback ${fb}, one ${one}, now ${activeProvider() === null ? 'none' : 'a provider'}, list sizes ${seen.join(',')}`,
    );
    check(
      'CR-72 item 6: an announced icon that is not a data: image is dropped (never loaded); a data: icon is kept',
      walletFromAnnouncement({ info: { uuid: 'x', name: 'X', icon: 'https://example.com/i.png', rdns: 'x' }, provider: a })?.icon === null &&
        walletFromAnnouncement({ info: { uuid: 'x', name: 'X', icon: ICON_A, rdns: 'x' }, provider: a })?.icon === ICON_A &&
        walletFromAnnouncement({ info: { uuid: 'x', name: 'X', icon: ICON_A, rdns: 'x' } }) === null,
    );
    let list: WalletInfo[] = [];
    watchWallets((l) => (list = l))();
    let picked: WalletInfo | null = null;
    const el = await mount(<div class="wallet-menu" role="menu"><WalletChoices wallets={list.slice(0, 2)} onPick={(w) => (picked = w)} /></div>, base, wallet, 'the wallet picker with two stand-in wallets');
    const imgs = [...el.querySelectorAll('img')] as HTMLImageElement[];
    check(
      'CR-72 item 6: the picker lists both wallets by their announced names, each icon an <img> with its data: source',
      text(el).includes('Choose a wallet') && text(el).includes('Stand-in Wallet A') && text(el).includes('Stand-in Wallet B') && imgs.length === 2 && imgs[0].getAttribute('src') === ICON_A && imgs[1].getAttribute('src') === ICON_B,
      text(el),
    );
    button(el, 'Stand-in Wallet B')!.click();
    chooseWallet(picked);
    calls.length = 0;
    const nonLocal = { ...NETWORK, local: false };
    const id = await walletChainId(nonLocal, client);
    let stored: string | null = null;
    let kept: string | null = null;
    try {
      stored = sessionStorage.getItem('uptown-wallet-choice');
      kept = localStorage.getItem('uptown-wallet-choice');
    } catch {
      /* no storage */
    }
    check(
      'CR-72 item 6: after picking B, the chain check goes to B only (not A, not window.ethereum); the choice is kept for this visit only (session storage)',
      (picked as WalletInfo | null)?.name === 'Stand-in Wallet B' && activeProvider() === b && id === 1 && calls.join(',') === 'Stand-in B:eth_chainId' && stored === 'test.standin.b' && kept === null && rememberedWallet(list)?.provider === b,
      `${calls.join(',')} | session ${stored} | local ${kept}`,
    );
    chooseWallet(null);
    delete (window as unknown as { ethereum?: unknown }).ethereum;
  }
}

// ---- F9j (CR-73): the owner page controls a replaced staking contract too ------------------------
// The site's own list decides which contracts these cards appear for, so the fixtures below give the
// network module's list a second staking contract: the real TownStaking, listed as replaced on
// 10 Oct 2026 and read live, and a second address the treasury pays now.
async function cr73(base: ChainState, wallet: WalletState, o: OwnerState) {
  const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  const typeIn = (el: HTMLElement, sel: string, v: string) => {
    const input = el.querySelector(sel) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const inAction = (el: HTMLElement, id: string) => el.querySelector(`[data-action="${id}"]`) as HTMLElement;
  const runCheck = async (el: HTMLElement, id: string) => {
    button(inAction(el, id), 'Check:')!.click();
    for (let i = 0; i < 100; i++) {
      await settle(100);
      const r = inAction(el, id).querySelector('.check-result') as HTMLElement | null;
      if (r) return r;
    }
    return null;
  };
  const shown = (el: HTMLElement, v: string) => (el.querySelector(`[data-view="${v}"]`) as HTMLElement | null)?.innerText.trim() ?? null;
  const addr = (prefix: string): Address => getAddress('0x' + prefix.padEnd(40, '0'));
  const ownerWallet = { ...wallet, address: OWNER };

  const REPLACED = k.TownStaking; // the real contract, listed as replaced: read live
  const NEXT = addr('2ec7'); // the staking contract the treasury pays now, also listed
  const GONE = addr('d00d'); // a listed replaced contract with no code on this chain
  const OTHER_FEED = addr('feed');
  const replacedOn = Date.UTC(2026, 9, 10, 12, 0) / 1000;
  const net2 = { ...NETWORK, stakingContracts: [{ address: REPLACED, replacedOn }, { address: NEXT, replacedOn: null }] };

  // ---- the list decides: only a contract with a replacement date, and never the one paid now ----
  check(
    'CR-73 the live list marks no staking contract as replaced, so the live owner page has no replaced card',
    replacedStaking(NETWORK).length === 0 && o.replaced.length === 0,
    `${NETWORK.stakingContracts.length} listed, ${replacedStaking(NETWORK).length} with a date, ${o.replaced.length} read`,
  );
  {
    const el = await mount(<Owner />, base, ownerWallet, 'Owner page, live: nothing replaced');
    check('CR-73 (live): no replaced-contract card on the page', el.querySelectorAll('.replaced-card').length === 0 && !text(el).includes('Replaced staking contract'));
  }
  {
    const both = { ...NETWORK, stakingContracts: [{ address: REPLACED, replacedOn }, { address: NEXT, replacedOn: replacedOn + 86_400 }] };
    check(
      'CR-73 the list: only the contracts with a replacement date, and never the one the treasury pays now',
      replacedStaking(net2).map((r) => r.address).join() === REPLACED &&
        replacedStaking(both).length === 2 &&
        replacedRecords(both, NEXT).map((r) => r.address).join() === REPLACED &&
        replacedRecords(net2, NEXT).map((r) => r.address).join() === REPLACED &&
        replacedRecords(net2, REPLACED).length === 0,
      `${replacedStaking(net2).map((r) => r.address).join()} | ${replacedRecords(both, NEXT).map((r) => r.address).join()}`,
    );
  }

  // ---- the card: read from the replaced contract, acting on it ---------------------------------
  // The replaced contract's settings are the live ones (they were read from TownStaking); the
  // contract paid now gets different values, so a figure from the wrong contract would show.
  const liveControls: StakingControls = {
    address: REPLACED,
    owner: o.staking.owner,
    pendingOwner: o.staking.pendingOwner,
    feed: o.staking.feed,
    priceStatus: base.staking.priceStatus,
    fallbackPrice: base.staking.fallbackPrice,
    fallbackPriceSetAt: base.staking.fallbackPriceSetAt,
    pendingFeed: base.staking.pendingFeed,
    pendingFeedEffectiveAt: base.staking.pendingFeedEffectiveAt,
    FALLBACK_MAX_AGE: base.staking.FALLBACK_MAX_AGE,
    FEED_CHANGE_DELAY: base.staking.FEED_CHANGE_DELAY,
  };
  const replaced: ReplacedStaking = { address: REPLACED, replacedOn, controls: liveControls, unavailable: null };
  const chain2: ChainState = {
    ...base,
    treasury: { ...base.treasury, staking: NEXT },
    staking: { ...base.staking, address: NEXT, fallbackPrice: 77_700_000_000n, fallbackPriceSetAt: base.blockTimestamp - 3_600, pendingFeed: null },
  };
  const o2: OwnerState = {
    ...o,
    staking: { address: NEXT, owner: o.staking.owner, pendingOwner: null, feed: OTHER_FEED },
    replaced: [replaced],
  };
  {
    const el = await mount(<OwnerPage o={o2} chain={chain2} access={pageAccess(o2, OWNER)} />, chain2, ownerWallet, 'Owner page: a current and a replaced staking contract (fixture)', {
      network: net2,
    });
    const cards = [...el.querySelectorAll('.replaced-card')] as HTMLElement[];
    const card = cards[0];
    const t = text(card ?? el);
    check(
      'CR-73 one card per replaced contract and for no other address: one card, its own id, the full address',
      cards.length === 1 && card.id === `owner-staking-replaced-${REPLACED}` && t.includes(REPLACED),
      `${cards.length} cards; id ${card?.id}`,
    );
    check(
      'CR-73 labelling: "Replaced on 10 Oct 2026: the treasury no longer pays it", and what still works there',
      t.includes('Replaced on 10 Oct 2026: the treasury no longer pays it') &&
        t.includes('Vaults left in this contract keep streaming the ETH it has already received, and its stakers can still unstake and claim there'),
      t.slice(0, 320),
    );
    check(
      'CR-73 read from the replaced contract, not the current one: its own feed, fallback price and owner',
      shown(el, `TownStaking(${REPLACED}).feed`) === o.staking.feed &&
        shown(el, 'TownStaking.feed') === OTHER_FEED &&
        shown(el, `TownStaking(${REPLACED}).fallbackPrice`) === (base.staking.fallbackPrice > 0n ? fmtUsd8(base.staking.fallbackPrice) : 'Not set') &&
        shown(el, 'TownStaking.fallbackPrice') === '$777.00' &&
        shown(el, `TownStaking(${REPLACED}).owner`) === o.staking.owner,
      `replaced feed ${shown(el, `TownStaking(${REPLACED}).feed`)}, current feed ${shown(el, 'TownStaking.feed')}; replaced fallback ${shown(el, `TownStaking(${REPLACED}).fallbackPrice`)}, current fallback ${shown(el, 'TownStaking.fallbackPrice')}`,
    );
    const ids = [`setFallbackPrice-${REPLACED}`, `announceFeed-${REPLACED}`, `transferOwnership-TownStaking-${REPLACED}`];
    check(
      'CR-73 the replaced card carries its own powers (fallback price, announce a feed, ownership), and the current card keeps its own',
      ids.every((id) => !!inAction(card, id)) && ['setFallbackPrice', 'announceFeed', 'transferOwnership-TownStaking'].every((id) => !!inAction(el, id) && !card.contains(inAction(el, id))),
      `missing in the replaced card: ${ids.filter((id) => !inAction(card, id)).join(', ') || 'none'}`,
    );
    check(
      'CR-73 the feed power of a replaced contract says what announcing an unreadable feed does there, and the current card does not',
      t.includes('Announcing a feed this contract cannot read stops it selling or upgrading vaults; unstaking and claiming keep working') &&
        !text(el.querySelector('#owner-staking-card') as HTMLElement).includes('Announcing a feed this contract cannot read'),
      card.querySelector('.feed-note')?.textContent ?? 'no note',
    );
    check(
      'CR-73 the replaced card offers nothing that does not apply: no vault purchase, no "Paid now", nothing of the treasury',
      !/Paid now|Open tier|Open a vault|Add TOWN|Upgrade to|Announced replacement|Withdraw ETH|Withdraw TOWN|Withdraw the position|Daily payout/.test(t) &&
        !card.querySelector('[data-view^="Treasury."], [data-view^="LPVault."]'),
      [...card.querySelectorAll('button')].map((b) => b.textContent!.trim()).join(' | '),
    );
    const allIds = [...el.querySelectorAll('[id]')].map((n) => n.id);
    check('CR-73 every element id on the page is still unique (the replaced card’s ids carry its address)', new Set(allIds).size === allIds.length, `${allIds.length} ids, ${new Set(allIds).size} unique`);

    // Every power's transaction goes to the replaced contract: the read-only check names it in full.
    typeIn(el, `#owner-price-${REPLACED}`, '2500');
    await settle();
    const r = await runCheck(el, `setFallbackPrice-${REPLACED}`);
    const panel = inAction(el, `setFallbackPrice-${REPLACED}`).querySelector('.confirm-panel') as HTMLElement | null;
    check(
      'CR-73 the replaced contract’s fallback price: the check passes against that contract and names it in full, never the one paid now',
      r?.dataset.check === 'ok' && r.innerText.includes(REPLACED) && !r.innerText.includes(NEXT) && !!panel && text(panel).includes(REPLACED) && !text(panel).includes(NEXT),
      `${r?.innerText ?? 'no result'} || ${panel ? text(panel).slice(0, 180) : 'no panel'}`,
    );
  }

  // Each power's request, built the way the page builds it: the replaced contract's own address.
  {
    const calls: [string, readonly unknown[]][] = [
      ['setFallbackPrice', [1n]],
      ['announceFeed', [OTHER_FEED]],
      ['applyFeed', []],
      ['transferOwnership', [OWNER]],
      ['acceptOwnership', []],
    ];
    const wrong = calls
      .map(([fn, args]) => {
        const toReplaced = ownerTx(net2, 'TownStaking', fn, args, REPLACED);
        const toCurrent = ownerTx(net2, 'TownStaking', fn, args, NEXT);
        return toReplaced.address === REPLACED && toCurrent.address === NEXT ? null : `${fn}: ${toReplaced.address} / ${toCurrent.address}`;
      })
      .filter(Boolean);
    check('CR-73 every power’s transaction names the contract it belongs to: the replaced one, or the one paid now', wrong.length === 0, wrong.join('; '));
    let refused = 'built';
    try {
      ownerTx(net2, 'TownStaking', 'setFallbackPrice', [1n], addr('bad1'));
    } catch (e) {
      refused = e instanceof UnlistedStakingError ? 'refused' : String(e);
    }
    check('CR-73 CR-72 still holds: a staking address the site does not list gets no transaction, replaced or not', refused === 'refused', refused);
  }

  // ---- two replaced contracts, one of them unreadable on this chain -----------------------------
  {
    const net3 = { ...NETWORK, stakingContracts: [{ address: REPLACED, replacedOn }, { address: GONE, replacedOn: replacedOn + 86_400 }, { address: NEXT, replacedOn: null }] };
    const reason = `There is no contract at this address on ${NETWORK.name}, so there is nothing to read or to change here.`;
    const o3: OwnerState = { ...o2, replaced: [replaced, { address: GONE, replacedOn: replacedOn + 86_400, controls: null, unavailable: reason }] };
    const el = await mount(<OwnerPage o={o3} chain={chain2} access={pageAccess(o3, OWNER)} />, chain2, ownerWallet, 'Owner page: two replaced contracts, one with no code (fixture)', {
      network: net3,
    });
    const cards = [...el.querySelectorAll('.replaced-card')] as HTMLElement[];
    const gone = cards[1];
    check(
      'CR-73 a card for every listed replaced contract, in the list’s order, each naming its own address',
      cards.length === 2 && text(cards[0]).includes(REPLACED) && text(gone).includes(GONE) && !text(gone).includes(REPLACED),
      `${cards.length} cards: ${cards.map((c) => c.id).join(', ')}`,
    );
    check(
      'CR-73 a listed contract that cannot be read: the card says so with the reason, and offers no action',
      text(gone).includes('This contract cannot be read') &&
        text(gone).includes(reason) &&
        text(gone).includes('Replaced on 11 Oct 2026: the treasury no longer pays it') &&
        gone.querySelectorAll('button').length === 0,
      text(gone).slice(0, 260),
    );
  }
}


// ---- F9k (CR-75): the owner's logo in the header and the footer, and the browser-tab icon --------
// The site's own stylesheet decides which of the two drawings is shown, so these checks load
// global.css into the test page for as long as they run and then take it away again.
async function cr75() {
  const style = document.createElement('style');
  style.textContent = GLOBAL_CSS;
  document.head.append(style);
  const savedTitle = document.title;
  const savedTheme = document.documentElement.getAttribute('data-theme');
  const savedChoice = localStorage.getItem('uptown-theme');

  /** An attribute as the drawing sees it: the shape's own, else the nearest group's, up to the svg. */
  const attrUp = (el: Element, name: string): string => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const v = n.getAttribute(name);
      if (v !== null) return v;
      if (n.tagName.toLowerCase() === 'svg') break;
    }
    return '-';
  };
  /** False when the shape, or a group above it, is switched off by the stylesheet. */
  const shown = (el: Element): boolean => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') return false;
      if (n.tagName.toLowerCase() === 'svg') break;
    }
    return true;
  };
  /** Every shape of a drawing, in its drawing order: what it is, where it is, and its colours. */
  const shapes = (svg: Element, onlyShown: boolean): string[] =>
    [...svg.querySelectorAll('path, rect')]
      .filter((el) => !onlyShown || shown(el))
      .map((el) => {
        const tag = el.tagName.toLowerCase();
        const where = tag === 'rect' ? ['x', 'y', 'width', 'height'].map((a) => el.getAttribute(a) ?? '0').join(' ') : (el.getAttribute('d') ?? '');
        return `${tag} ${where} | fill ${attrUp(el, 'fill')} | stroke ${attrUp(el, 'stroke')} ${attrUp(el, 'stroke-width')}`;
      });
  const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const ownerLight = parse(LOGO_ON_LIGHT);
  const ownerDark = parse(LOGO_ON_DARK);
  const wantLight = shapes(ownerLight, false);
  const wantDark = shapes(ownerDark, false);

  const box = document.createElement('div');
  stage.append(box);
  render(<App />, box);
  await new Promise((r) => setTimeout(r, 60));
  const header = box.querySelector('header.site-header') as HTMLElement;
  const footer = box.querySelector('footer.site-footer') as HTMLElement;
  const headMark = header.querySelector('a.wordmark') as HTMLAnchorElement;
  const footMark = footer.querySelector('a.wordmark.small') as HTMLAnchorElement;
  const headSvg = headMark?.querySelector('svg.skyline') as SVGElement;
  const footSvg = footMark?.querySelector('svg.skyline') as SVGElement;

  check(
    'CR-75 the skyline stands beside the word "UpTown" in the header and in the footer; both still link to #/ with their accessible name',
    !!headSvg &&
      !!footSvg &&
      headMark.getAttribute('href') === '#/' &&
      footMark.getAttribute('href') === '#/' &&
      headMark.textContent!.trim() === 'UpTown' &&
      footMark.textContent!.trim() === 'UpTown' &&
      /home/i.test(headMark.getAttribute('aria-label') ?? '') &&
      /home/i.test(footMark.getAttribute('aria-label') ?? '') &&
      headSvg.getAttribute('viewBox') === ownerLight.getAttribute('viewBox') &&
      footSvg.getAttribute('viewBox') === ownerDark.getAttribute('viewBox') &&
      headSvg.getAttribute('aria-hidden') === 'true',
    `header ${headMark?.getAttribute('href')} "${headMark?.getAttribute('aria-label')}" ${headMark?.textContent?.trim()}; footer ${footMark?.getAttribute('href')} "${footMark?.getAttribute('aria-label')}" ${footMark?.textContent?.trim()}; viewBox ${headSvg?.getAttribute('viewBox')}`,
  );

  // Nothing has been chosen yet, so the page is following the browser's own light/dark setting: the
  // drawing on it must already be that setting's one, with no data-theme attribute in sight.
  const themeNow = () => document.documentElement.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  check(
    'CR-75 with nothing chosen the page follows the browser’s own light/dark setting, and the drawing on it is already that setting’s one — no attribute, no script, so nothing to flash',
    document.documentElement.getAttribute('data-theme') === null && shapes(headSvg, true).join('\n') === (system === 'dark' ? wantDark : wantLight).join('\n'),
    `the browser's setting is ${system}; data-theme ${document.documentElement.getAttribute('data-theme')}; the drawing shown is the ${shapes(headSvg, true).join('\n') === wantDark.join('\n') ? 'on-dark' : shapes(headSvg, true).join('\n') === wantLight.join('\n') ? 'on-light' : 'neither'} one`,
  );

  // Everything below is done with the site's own switch, never by setting the theme by hand. The
  // browser's own setting decides where the page starts, so press until it is the light theme (one
  // press at most) and work from there.
  const press = async () => {
    (header.querySelector('button[aria-label^="Switch to"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));
  };
  const started = themeNow();
  if (started !== 'light') await press();

  // The light theme shows the owner's on-light file, shape for shape, in its own drawing order.
  const gotLightHead = shapes(headSvg, true);
  const gotLightFoot = shapes(footSvg, true);
  check(
    'CR-75 light theme: the drawing shown is the owner’s uptown-lamplight-on-light.svg, shape for shape, colour for colour, in its own order — in the header and in the footer',
    themeNow() === 'light' && gotLightHead.join('\n') === wantLight.join('\n') && gotLightFoot.join('\n') === wantLight.join('\n'),
    `theme ${themeNow()} (the browser started it in ${started}); ${gotLightHead.length} shapes shown, the owner’s file has ${wantLight.length}; first difference: ${wantLight.find((s, i) => s !== gotLightHead[i]) ?? 'none'} vs ${gotLightHead.find((s, i) => s !== wantLight[i]) ?? 'none'}`,
  );

  // The dark theme shows the on-dark file; and the switch does it at once, without a re-render.
  const markupBefore = headSvg.outerHTML;
  await press();
  const gotDarkHead = shapes(headSvg, true);
  const gotDarkFoot = shapes(footSvg, true);
  check(
    'CR-75 the theme switch changes the drawing at once: after one press of the switch the header and the footer show the owner’s uptown-lamplight-on-dark.svg, shape for shape',
    document.documentElement.getAttribute('data-theme') === 'dark' && gotDarkHead.join('\n') === wantDark.join('\n') && gotDarkFoot.join('\n') === wantDark.join('\n'),
    `theme ${document.documentElement.getAttribute('data-theme')}; ${gotDarkHead.length} shapes shown, the owner’s file has ${wantDark.length}; first difference: ${wantDark.find((s, i) => s !== gotDarkHead[i]) ?? 'none'} vs ${gotDarkHead.find((s, i) => s !== wantDark[i]) ?? 'none'}`,
  );
  check(
    'CR-75 no flash of the wrong drawing: the page’s own markup never changes with the theme — both drawings are in it from the first paint and the stylesheet alone picks one',
    headSvg.outerHTML === markupBefore && headSvg.isSameNode(headMark.querySelector('svg.skyline')) && wantLight.length === wantDark.length,
    `markup unchanged: ${headSvg.outerHTML === markupBefore}; same element: ${headSvg.isSameNode(headMark.querySelector('svg.skyline'))}`,
  );

  // Back to light with another press, to show the switch works both ways.
  await press();
  check(
    'CR-75 and back: another press of the switch brings the on-light drawing back',
    themeNow() === 'light' && shapes(headSvg, true).join('\n') === wantLight.join('\n'),
    `theme ${themeNow()}, ${shapes(headSvg, true).length} shapes shown`,
  );

  // The sizes: set by height, the width left to the drawing's own 492 : 367.
  const hb = headSvg.getBoundingClientRect();
  const fb = footSvg.getBoundingClientRect();
  const ratio = 492 / 367;
  check(
    'CR-75 the sizes: 26 px tall in the header and 22 px in the footer, each about 1.34 times as wide, and the whole drawing inside its box',
    Math.abs(hb.height - 26) < 0.6 &&
      Math.abs(fb.height - 22) < 0.6 &&
      Math.abs(hb.width - 26 * ratio) < 0.8 &&
      Math.abs(fb.width - 22 * ratio) < 0.8 &&
      headSvg.getBoundingClientRect().left >= headMark.getBoundingClientRect().left - 0.5,
    `header ${hb.width.toFixed(2)} x ${hb.height.toFixed(2)}, footer ${fb.width.toFixed(2)} x ${fb.height.toFixed(2)} (wanted about ${(26 * ratio).toFixed(2)} x 26 and ${(22 * ratio).toFixed(2)} x 22)`,
  );

  // What the skyline replaces is gone.
  const css = getComputedStyle(document.documentElement);
  check(
    'CR-75 what it replaces is gone: no old single-tower glyph anywhere on the page and no --logo-gold or --logo-base left in the stylesheet',
    box.querySelector('.glyph') === null && css.getPropertyValue('--logo-gold').trim() === '' && css.getPropertyValue('--logo-base').trim() === '' && !GLOBAL_CSS.includes('--logo-'),
    `.glyph elements: ${box.querySelectorAll('.glyph').length}; --logo-gold "${css.getPropertyValue('--logo-gold')}", --logo-base "${css.getPropertyValue('--logo-base')}"`,
  );

  // The browser-tab icon: one file, the same path and name, built from the owner's own shapes.
  const icon = parse(await (await fetch('/favicon.svg')).text());
  const iconShapes = shapes(icon.querySelector('g[transform]')!, false);
  const ownerShapes = new Set(shapes(ownerDark, false));
  const strays = iconShapes.filter((s) => !ownerShapes.has(s));
  check(
    'CR-75 the browser-tab icon is still the one file public/favicon.svg, and every tower and window in it is one of the owner’s own shapes in the owner’s own colours',
    icon.tagName.toLowerCase() === 'svg' &&
      icon.getAttribute('viewBox') === '0 0 32 32' &&
      (icon.querySelector('rect[rx="7"]') as Element | null)?.getAttribute('fill') === '#18181b' &&
      iconShapes.length === 30 &&
      strays.length === 0,
    `${iconShapes.length} shapes taken from the artwork (4 towers, 26 windows), ${strays.length} not in the owner’s file${strays.length ? ': ' + strays[0] : ''}`,
  );

  render(null, box);
  box.remove();
  style.remove();
  document.title = savedTitle;
  if (savedTheme === null) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', savedTheme);
  if (savedChoice === null) localStorage.removeItem('uptown-theme');
  else localStorage.setItem('uptown-theme', savedChoice);
  history.replaceState(null, '', location.pathname + location.search);
}

// ---- F9l (CR-76): the network tag in the header, in place of the strip above it ------------------
// The site's own stylesheet decides the tag's mark and which of the two names it shows, so these
// checks load global.css into the test page for as long as they run and then take it away again.
// The three networks: the site renders the one this build is for (the local test chain here), so
// Ethereum's and Sepolia's tags are rendered from their own network entries — the tag reads only the
// chain ID, the name and the local flag, and those three come from the network module as they do in
// a build for that chain.
async function cr76() {
  const style = document.createElement('style');
  style.textContent = GLOBAL_CSS;
  document.head.append(style);

  const asNetwork = (chainId: ChainId, name: string, local: boolean): Network => ({ ...NETWORK, chainId, name, local });
  const ETHEREUM = asNetwork(1, 'Ethereum', false);
  const SEPOLIA = asNetwork(11155111, 'Sepolia', false);
  const LOCAL = asNetwork(31337, 'Local test chain', true);
  // The three sentences, as the brief writes them.
  const SENTENCES: Record<number, string> = {
    1: 'The real Ethereum network (chain ID 1). Real contracts and real money.',
    11155111: "Ethereum's test network (chain ID 11155111). Test coins only; nothing here is real money.",
    31337: 'A private copy of Ethereum on this computer (chain ID 31337). Test wallets only; nothing here is real.',
  };

  // ---- the three networks, each tag rendered on its own ------------------------------------------
  const box = document.createElement('div');
  stage.append(box);
  const tagOf = (n: Network): HTMLElement => {
    render(<NetworkTag n={n} />, box);
    return box.querySelector('.net-tag') as HTMLElement;
  };
  const seen = [ETHEREUM, SEPOLIA, LOCAL].map((n) => {
    const el = tagOf(n);
    const shown = [...el.children].filter((c) => getComputedStyle(c).display !== 'none' && !c.classList.contains('visually-hidden'));
    const cs = getComputedStyle(el);
    return {
      chainId: n.chainId,
      name: n.name,
      visible: shown.map((c) => c.textContent).join('|'),
      shownSpans: shown.length,
      full: (el.querySelector('.net-name') as HTMLElement).textContent,
      shortSpan: (el.querySelector('.net-name-short') as HTMLElement).textContent,
      short: shortNetworkName(n),
      screenReader: (el.querySelector('.visually-hidden') as HTMLElement).textContent!.replace(/\s+/g, ' ').trim(),
      title: el.getAttribute('title'),
      marked: el.classList.contains('net-test'),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      colour: cs.color,
      background: cs.backgroundColor,
      border: cs.borderTopColor,
    };
  });
  const [eth, sep, loc] = seen;

  check(
    'CR-76 the tag names the network, from the network module: "Ethereum", "Sepolia", "Local test chain" — one name shown at a time',
    eth.full === 'Ethereum' &&
      sep.full === 'Sepolia' &&
      loc.full === 'Local test chain' &&
      seen.every((s) => s.full === s.name && s.shortSpan === s.short && s.shownSpans === 1 && (s.visible === s.name || s.visible === s.short)),
    seen.map((s) => `${s.chainId}: full "${s.full}", short "${s.shortSpan}", shown "${s.visible}" (${s.shownSpans} of the two)`).join('; '),
  );

  check(
    'CR-76 the strip’s sentence survives: each network’s sentence is the tag’s tooltip and its text for a screen reader, with the full name in both',
    seen.every((s) => s.screenReader === `${s.name}. ${SENTENCES[s.chainId]}` && s.title === `${s.name} — ${SENTENCES[s.chainId]}`),
    seen.map((s) => `${s.chainId}: title "${s.title}" | screen reader "${s.screenReader}"`).join('  ||  '),
  );

  check(
    'CR-76 the local chain’s sentence is word for word the one the strip carried, with the chain ID from the network module',
    networkNote(LOCAL) === SENTENCES[31337] && networkNote(LOCAL).includes(`chain ID ${LOCAL.chainId}`),
    networkNote(LOCAL),
  );

  check(
    'CR-76 test networks are marked and Ethereum is plain: Sepolia and the local chain carry the mark, in the site’s own accent colours; chain 1 has none',
    sep.marked && loc.marked && !eth.marked && sep.colour === loc.colour && sep.colour !== eth.colour && sep.background !== eth.background && sep.border !== eth.border,
    `chain 1: marked ${eth.marked}, colour ${eth.colour}, background ${eth.background}, border ${eth.border} || test networks: marked ${sep.marked}/${loc.marked}, colour ${sep.colour}, background ${sep.background}, border ${sep.border}`,
  );

  check(
    'CR-76 where the short name is shown it still names the network ("Local"), and the full name stays in the tooltip and for a screen reader',
    loc.short === 'Local' && eth.short === 'Ethereum' && sep.short === 'Sepolia' && seen.every((s) => s.screenReader.startsWith(`${s.name}.`) && s.title!.startsWith(`${s.name} —`)),
    seen.map((s) => `${s.chainId}: short "${s.short}", full "${s.name}"`).join('; '),
  );

  render(null, box);
  box.remove();

  // ---- the whole site: the strip is gone and the tag is in the header beside the wallet button ----
  const site = document.createElement('div');
  stage.append(site);
  render(<App />, site);
  await new Promise((r) => setTimeout(r, 60));
  const header = site.querySelector('header.site-header') as HTMLElement;
  const tools = header.querySelector('.header-tools') as HTMLElement;
  // The day chip appears once the figures have been read from the chain: wait for it, so the
  // order of the header's tools below is the one a visitor sees.
  for (let i = 0; i < 80 && !tools.querySelector('.day-chip'); i++) await new Promise((r) => setTimeout(r, 100));
  const tag = header.querySelector('.net-tag') as HTMLElement;
  const walletBtn = header.querySelector('.wallet-btn') as HTMLElement;

  check(
    'CR-76 the strip above the header is gone: no strip on the page and no rule left for it in the stylesheet',
    site.querySelector('.chain-bar') === null &&
      site.querySelector('.chain-tag') === null &&
      site.querySelector('.chain-note') === null &&
      !GLOBAL_CSS.includes('.chain-bar') &&
      !GLOBAL_CSS.includes('.chain-tag') &&
      !GLOBAL_CSS.includes('.chain-note'),
    `elements: ${site.querySelectorAll('.chain-bar, .chain-tag, .chain-note').length}; rules named in the stylesheet: ${['.chain-bar', '.chain-tag', '.chain-note'].filter((s) => GLOBAL_CSS.includes(s)).join(', ') || 'none'}`,
  );

  const tagBox = tag.getBoundingClientRect();
  const btnBox = walletBtn.getBoundingClientRect();
  check(
    'CR-76 one tag, in the header’s tools beside the wallet button: it is this build’s network, it sits immediately before the button and nowhere else on the page',
    site.querySelectorAll('.net-tag').length === 1 &&
      tools.contains(tag) &&
      tag.dataset.chain === String(NETWORK.chainId) &&
      tag.nextElementSibling === walletBtn &&
      tagBox.right <= btnBox.left + 0.5 &&
      btnBox.left - tagBox.right < 12,
    `tags on the page: ${site.querySelectorAll('.net-tag').length}; chain ${tag.dataset.chain}; the element after it: ${tag.nextElementSibling?.className}; ${(btnBox.left - tagBox.right).toFixed(2)} px between the tag and the button`,
  );

  check(
    'CR-76 nothing else in the header changed: the wordmark, the navigation, the day chip, the theme button, the wallet button and the menu button are all still there, in their order',
    !!header.querySelector('a.wordmark svg.skyline') &&
      !!header.querySelector('nav.site-nav') &&
      [...tools.children].map((c) => c.className.split(' ')[0]).join(',') === 'day-chip,icon-btn,wallet-wrap,icon-btn' &&
      !!header.querySelector('.icon-btn[aria-label^="Switch to"]') &&
      !!header.querySelector('.nav-toggle'),
    `the tools, in order: ${[...tools.children].map((c) => c.className).join(' | ')}`,
  );

  // It is not a button: a span, no link, no handler, and a click changes nothing on the page.
  const before = site.innerHTML;
  tag.click();
  await new Promise((r) => setTimeout(r, 60));
  check(
    'CR-76 the tag is not a button and does nothing when it is clicked',
    loc.tag === 'span' &&
      loc.role === 'note' &&
      tag.tagName.toLowerCase() === 'span' &&
      !tag.getAttribute('href') &&
      getComputedStyle(tag).cursor !== 'pointer' &&
      site.innerHTML === before &&
      site.querySelector('.wallet-menu') === null,
    `<${tag.tagName.toLowerCase()} role="${tag.getAttribute('role')}">, cursor ${getComputedStyle(tag).cursor}; the page after the click is unchanged: ${site.innerHTML === before}`,
  );

  render(null, site);
  site.remove();
  style.remove();
  history.replaceState(null, '', location.pathname + location.search);
}

// ---- F9m (CR-77): the owner's four texts, the two deleted lines, the tag on a phone, the red light
// The four texts are checked character for character against the owner's words as CR-77 writes them
// (the strings below are copied from the change request, not from the site's source), read back from
// the rendered page. The wrong-network light is rendered from the wallet display itself, in both
// states, with the site's own stylesheet loaded, so the colours and the shape are the real ones; the
// whole site is rendered as well, on the right network, to show that nothing red appears there.
// --------------------------------------------------------------------------------------------------
const CR77 = {
  why1: 'Most projects that distribute revenue have no systems that ensure sustained revenue generation. Attention fades after launch, trading slows, and the project fades with it.',
  why2: "UpTown's sophisticated flywheel is built on top of the pool. Every trade in the TOWN pool passes through TownHook, a contract no one controls, and it turns trading into reasons to participate: buyers claim TOWN rebates at the end of trading days, stakers receive a daily share of the ETH the treasury collects, and on every sale 2% is either charged in $TOWN and burned or charged in ETH and sent to the treasury. The rules are written into the contracts and cannot be changed.",
  rebates: "of TOWN bought every day, claimable in $TOWN, minus a 2% claim fee, claimable the next day. The rate moves between 5% and 5.5%, decided using data from the last three days' trading activity.",
  stakers: 'charged in ETH, sent to the treasury; 90% of it streams to stakers as WETH',
  rules: 'never more. Zero dev allocation. No upgrades; trading never pauses; liquidity locked for a minimum of ten years.',
};

async function cr77(base: ChainState, wallet: WalletState) {
  const style = document.createElement('style');
  style.textContent = GLOBAL_CSS;
  document.head.append(style);

  // ---- 1. The four texts, character for character, read back from the rendered page --------------
  const home = await mount(<Home />, base, wallet, 'CR-77: the homepage');
  const whys = [...home.querySelectorAll('.why p')].map((p) => p.textContent!);
  const cards = [...home.querySelectorAll('article.feature')].map((a) => {
    const ps = [...a.querySelectorAll('p')];
    return { heading: a.querySelector('h2')!.textContent!, figure: ps[0].textContent!, view: ps[0].getAttribute('data-view'), sentence: ps[1].textContent! };
  });
  const [rebate, stakers, rules] = cards;

  check(
    'CR-77 item 2: "Why $TOWN?" shows the owner’s two paragraphs, character for character, each one unbroken',
    whys.length === 2 && whys[0] === CR77.why1 && whys[1] === CR77.why2,
    `${whys.length} paragraphs; first matches: ${whys[0] === CR77.why1}; second matches: ${whys[1] === CR77.why2}\n      1: "${whys[0]}"\n      2: "${whys[1]}"`,
  );

  check(
    'CR-77 items 3, 4 and 5: the three cards’ sentences are the owner’s words, character for character',
    rebate.sentence === CR77.rebates && stakers.sentence === CR77.stakers && rules.sentence === CR77.rules,
    `"${rebate.heading}": ${rebate.sentence === CR77.rebates} | "${stakers.heading}": ${stakers.sentence === CR77.stakers} | "${rules.heading}": ${rules.sentence === CR77.rules}\n      "${rebate.sentence}"\n      "${stakers.sentence}"\n      "${rules.sentence}"`,
  );

  // ---- 2. The rebate card's figure is the rate BEFORE the claim fee ------------------------------
  const todayBps = dayRateBps(base, base.rewards.currentCycle);
  const beforeFee = `up to ${fmtRate(todayBps)} today`;
  const afterFee = `up to ${fmtRate(afterFeeBps(base, todayBps))} today`;
  const r = rateRange(base);
  const noChain = await mount(<Home />, null, null, 'CR-77: the homepage before the contracts are deployed');
  const noChainFigure = noChain.querySelector('article.feature .feature-number')!.textContent;

  check(
    'CR-77 item 3: the "Buy rebates" figure is BuyerRewards.rateBps(today), the rate before the claim fee (the sentence subtracts the fee itself), and says so in data-view',
    rebate.figure === beforeFee && rebate.figure !== afterFee && rebate.view === 'BuyerRewards.rateBps(today)',
    `shown "${rebate.figure}", before the fee "${beforeFee}", after the fee "${afterFee}", data-view "${rebate.view}"`,
  );
  check(
    'CR-77 item 3: with no contracts on the network the figure is the range before the fee, 5% to 5.5%',
    noChainFigure === `${fmtBps(r.low)} to ${fmtBps(r.high)}` && noChainFigure === '5% to 5.5%',
    `"${noChainFigure}"`,
  );

  // ---- 3. The homepage's owner line is gone ------------------------------------------------------
  check(
    'CR-77 item 6: the homepage’s line about the owner’s powers and income is gone',
    !text(home).includes('earns income from fees') && home.querySelector('.owner-line') === null && !GLOBAL_CSS.includes('.owner-line'),
    `the text "earns income from fees" on the page: ${text(home).includes('earns income from fees')}; .owner-line elements: ${home.querySelectorAll('.owner-line').length}; the rule in the stylesheet: ${GLOBAL_CSS.includes('.owner-line')}`,
  );

  // ---- 4. Docs: what the owner earns is gone, the powers table is untouched ----------------------
  const docs = await mount(<Docs />, base, wallet, 'CR-77: the Docs page');
  const section = docs.querySelector('#docs-owner') as HTMLElement;
  const rows = [...section.querySelectorAll('table.powers tbody tr')].map((tr) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent!));
  const want = OWNER_POWERS.map((p) => [p.power, p.contract, p.delay, p.worstCase]);
  const heads = [...section.querySelectorAll('table.powers thead th')].map((th) => th.textContent!);
  const t = text(section);

  check(
    'CR-77 item 7: the Docs owner section no longer says what the owner earns — no heading, no list, no owner-income figures',
    !t.includes('What the owner earns') &&
      section.querySelector('.income-list') === null &&
      !GLOBAL_CSS.includes('.income-list') &&
      !t.includes('ETH reserve, not yet withdrawn') &&
      !t.includes('TOWN claim fees, not yet withdrawn') &&
      !t.includes('ETH withdrawn so far') &&
      !t.includes('TOWN withdrawn so far') &&
      !t.includes('The pool fees the owner collects are not shown'),
    `"What the owner earns": ${t.includes('What the owner earns')}; .income-list: ${section.querySelectorAll('.income-list').length}; the four figures and the pool-fee note: ${['ETH reserve, not yet withdrawn', 'ETH withdrawn so far', 'TOWN claim fees, not yet withdrawn', 'TOWN withdrawn so far', 'The pool fees the owner collects are not shown'].filter((s) => t.includes(s)).join(', ') || 'none'}`,
  );
  check(
    'CR-77 item 7: the powers table is unchanged — every row of the spec’s list, with the worst-case column, and the owner’s address still shown',
    JSON.stringify(rows) === JSON.stringify(want) &&
      heads.join(' | ') === 'Power | Contract | Delay | Worst case if misused' &&
      t.includes('What the owner can do: the complete list') &&
      t.includes(shortAddress(OWNER)) &&
      t.includes('The owner cannot mint TOWN'),
    `${rows.length} rows, all identical to the content module: ${JSON.stringify(rows) === JSON.stringify(want)}; columns: ${heads.join(' | ')}; the owner’s address ${shortAddress(OWNER)} shown: ${t.includes(shortAddress(OWNER))}`,
  );

  // ---- 5. The red light in the wallet display ----------------------------------------------------
  const lightBox = document.createElement('div');
  stage.append(lightBox);
  const display = (wrongNetwork: boolean) => {
    render(
      <WalletButton
        network={NETWORK}
        account={W1}
        accountLabel="Test wallet 1"
        wrongNetwork={wrongNetwork}
        walletChain={wrongNetwork ? 1 : NETWORK.chainId}
        pickerOpen={false}
        hasMenu
        onClick={() => {}}
      />,
      lightBox,
    );
    const btn = lightBox.querySelector('.wallet-btn') as HTMLButtonElement;
    const dot = btn.querySelector('.dot') as HTMLElement;
    const cs = getComputedStyle(dot);
    return {
      cls: btn.className,
      title: btn.getAttribute('title'),
      ariaLabel: btn.getAttribute('aria-label'),
      // What is on the button for everyone to see (the text for a screen reader taken out).
      shown: [...btn.childNodes]
        .filter((n) => !(n instanceof HTMLElement && n.classList.contains('visually-hidden')))
        .map((n) => n.textContent)
        .join('')
        .replace(/\s+/g, ' ')
        .trim(),
      forScreenReader: [...btn.querySelectorAll('.visually-hidden')].map((s) => s.textContent).join(' '),
      wrong: dot.classList.contains('dot-wrong'),
      // A round green dot, or a triangle drawn with borders: no box of its own, square corners,
      // see-through sides and a coloured bottom border.
      shape:
        cs.width === '0px' && cs.height === '0px' && cs.borderRadius === '0px' && cs.borderLeftColor === 'rgba(0, 0, 0, 0)' && cs.borderBottomWidth === '7px'
          ? 'triangle'
          : cs.borderRadius === '50%' && cs.width === '7px'
            ? 'round dot'
            : `other (${cs.width} x ${cs.height}, radius ${cs.borderRadius}, borders ${cs.borderBottomWidth}/${cs.borderLeftColor})`,
      colour: cs.borderRadius === '50%' ? cs.backgroundColor : cs.borderBottomColor,
    };
  };
  const right = display(false);
  const wrong = display(true);
  render(null, lightBox);
  lightBox.remove();

  // The site's own --ok and --warn-text, in the light theme and in the dark one (headless Edge's own
  // setting is dark, so that is the theme the test page starts in): the light must be one of each.
  const OK_GREEN = ['rgb(22, 163, 74)', 'rgb(74, 222, 128)'];
  const WARN_RED = ['rgb(180, 35, 24)', 'rgb(253, 162, 155)'];
  check(
    'CR-77 item 1: on the wrong network the light beside the address is red; on the right network it is the green dot, and the address is shown in both',
    right.wrong === false &&
      right.shape === 'round dot' &&
      OK_GREEN.includes(right.colour) &&
      wrong.wrong === true &&
      wrong.shape === 'triangle' &&
      WARN_RED.includes(wrong.colour) &&
      right.shown === wrong.shown,
    `right network: ${right.shape}, ${right.colour} (the site’s --ok); wrong network: ${wrong.shape}, ${wrong.colour} (the site’s --warn-text); the address shown in both: "${right.shown}" / "${wrong.shown}"`,
  );
  check(
    'CR-77 item 1: the wrong network is not told by colour alone — a different shape, the site’s warning outline, the reason in the tooltip and the words "Wrong network" for a screen reader',
    wrong.shape !== right.shape &&
      wrong.cls.includes('btn-danger') &&
      right.cls.includes('btn-secondary') &&
      wrong.title === `Wrong network: your wallet is on another network (chain ID 1). This site is UpTown on ${NETWORK.name}. Select the wallet to put it right.` &&
      wrong.forScreenReader === 'Wrong network' &&
      wrong.ariaLabel!.includes('Wrong network: your wallet is on another network (chain ID 1).') &&
      wrong.ariaLabel!.includes('Select to switch network or disconnect.') &&
      right.title === null &&
      right.forScreenReader === '' &&
      !right.ariaLabel!.includes('Wrong network'),
    `wrong: class "${wrong.cls}", title "${wrong.title}", screen reader "${wrong.forScreenReader}", aria-label "${wrong.ariaLabel}" || right: class "${right.cls}", title ${right.title}, aria-label "${right.ariaLabel}"`,
  );

  // The display stays the way to put it right: the menu's note and its "Switch to …" action.
  const noteBox = document.createElement('div');
  stage.append(noteBox);
  let switched = 0;
  render(<WrongNetworkNote network={NETWORK} walletChain={1} onSwitch={() => switched++} />, noteBox);
  const noteText = (noteBox.querySelector('.wallet-wrong') as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
  const switchBtn = button(noteBox, 'Switch to');
  switchBtn!.click();
  await new Promise((rr) => setTimeout(rr, 30));
  check(
    'CR-77 item 1: the wallet display stays the way to put it right — the reason in plain words and a "Switch to <network>" action that works',
    noteText.startsWith('Wrong network Your wallet is on another network (chain ID 1), so this site cannot read your own figures and a transaction sent from it would fail.') &&
      noteText.includes(`UpTown here is on ${NETWORK.name}.`) &&
      switchBtn!.textContent!.trim() === `Switch to ${NETWORK.name}` &&
      switched === 1,
    `"${noteText}" | the action: "${switchBtn!.textContent!.trim()}", called ${switched} time(s)`,
  );
  render(null, noteBox);
  noteBox.remove();

  // ---- 6. The whole site: no read line, nothing red on the right network, the tag's rules --------
  const site = document.createElement('div');
  stage.append(site);
  render(<App />, site);
  await new Promise((rr) => setTimeout(rr, 60));
  // Wait until a read has landed (the box carries the block it was read at), so the checks below
  // are made on the page a visitor sees and not on the moment before the first read.
  for (let i = 0; i < 150 && !(site.querySelector('.read-line') as HTMLElement | null)?.dataset.block; i++) await new Promise((rr) => setTimeout(rr, 100));
  const siteText = text(site);
  const readLine = site.querySelector('.read-line') as HTMLElement;

  check(
    'CR-77 item 6: no page shows "Figures read from … read again every 15 seconds …" or a "Read now" link any more; the box that held it is empty and takes no space',
    !siteText.includes('Figures read from') &&
      !siteText.includes('read again every 15 seconds') &&
      !siteText.includes('Read now') &&
      button(site, 'Read now') === null &&
      readLine.childElementCount === 0 &&
      getComputedStyle(readLine).display === 'none' &&
      readLine.dataset.block !== '',
    `the texts on the page: ${['Figures read from', 'read again every 15 seconds', 'Read now'].filter((s) => siteText.includes(s)).join(', ') || 'none'}; the box: ${readLine.childElementCount} children, display ${getComputedStyle(readLine).display}, block ${readLine.dataset.block}`,
  );
  check(
    'CR-77 item 1: on the right network the whole site shows no red light and says nothing about a wrong network',
    site.querySelector('.dot-wrong') === null && site.querySelector('.wallet-wrong') === null && !siteText.includes('Wrong network'),
    `red lights on the page: ${site.querySelectorAll('.dot-wrong').length}; wrong-network notes: ${site.querySelectorAll('.wallet-wrong').length}`,
  );
  check(
    'CR-77 item 1: below 480 px the stylesheet shows no tag at all, and the header row keeps its 60 px height (F9l’s taller phone row is gone)',
    /@media \(max-width: 479px\) \{\s*\.net-tag \{\s*display: none;\s*\}\s*\}/.test(GLOBAL_CSS) &&
      !/@media \(max-width: 479px\)[^@]*\.header-row/.test(GLOBAL_CSS) &&
      !/@media \(max-width: 479px\)[^@]*height: 70px/.test(GLOBAL_CSS) &&
      /\.header-row \{[^}]*height: 60px;[^}]*\}/.test(GLOBAL_CSS),
    `the phone rule hides the tag: ${/@media \(max-width: 479px\) \{\s*\.net-tag \{\s*display: none;\s*\}\s*\}/.test(GLOBAL_CSS)}; it still changes the header row: ${/@media \(max-width: 479px\)[^@]*\.header-row/.test(GLOBAL_CSS)}`,
  );

  render(null, site);
  site.remove();

  // ---- 7. The notice that the network service is behind is still there, in its new place ---------
  const old = { ...base, blockTimestamp: Math.floor(Date.now() / 1000) - 600 };
  const fresh = { ...base, blockTimestamp: Math.floor(Date.now() / 1000) };
  const behind = await mount(<Freshness />, old, wallet, 'CR-77: the network service is behind');
  const notBehind = await mount(<Freshness />, fresh, wallet, 'CR-77: the network service is up to date');
  check(
    'CR-77 item 6: the notice that the network service is behind stays, in its own box at the top of the page content, and nothing is shown when the block is fresh',
    text(behind).startsWith('The network service is behind: figures and estimates may be out of date.') &&
      !!behind.querySelector('.stale-wrap > .stale-note') &&
      text(notBehind) === '' &&
      notBehind.querySelector('.stale-wrap') === null,
    `behind: "${text(behind)}" | fresh: "${text(notBehind)}"`,
  );

  style.remove();
  history.replaceState(null, '', location.pathname + location.search);
}

// ---- F9o (CR-82, CR-83): one press for the approvals and the action; the quick amounts --------
// A stand-in wallet and a stand-in chain. The site's own forms run against them: every transaction
// goes through wallet.ts's sendTx (its target check, its chain check and its read-only rehearsal,
// all unchanged) to a stand-in EIP-1193 wallet, chosen the way a visitor chooses one (EIP-6963), on a
// copy of the network entry marked as a public network, so nothing ever reaches the local node. The
// stand-in records every rehearsal ("check"), every request ("send"), every refusal and every
// confirmation ("mined"), in the order they happen, and confirms each transaction after a short
// wait, changing its own figures the way the chain would (an approval raises the allowance).
async function cr82(base: ChainState, wallet: WalletState) {
  const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  const typeIn = (el: HTMLElement, sel: string, v: string) => {
    const input = el.querySelector(sel) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const E = 10n ** 18n;
  const TOWN = k.UpTownToken;
  const P2 = NETWORK.uniswap!.permit2;
  const ROUTER = NETWORK.uniswap!.universalRouter;
  const QUOTER = NETWORK.uniswap!.v4Quoter;
  const STAKING = base.staking.address;
  const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
  const PUBLIC: Network = { ...NETWORK, local: false };
  const NOW = Math.floor(Date.now() / 1000) + 5_000;
  const DAYS30 = 30 * 24 * 60 * 60;
  const SHOWN_PRICE = 1_234_567_000_000_000n; // the tier 1 vault price the fixture shows (0.001234567 ETH)
  const chain: ChainState = { ...base, blockTimestamp: NOW, staking: { ...base.staking, vaultPriceWei: { ...base.staking.vaultPriceWei, 1: SHOWN_PRICE } } };

  const EXACT_IN = [
    {
      type: 'tuple',
      components: [
        {
          name: 'poolKey',
          type: 'tuple',
          components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ],
        },
        { name: 'zeroForOne', type: 'bool' },
        { name: 'amountIn', type: 'uint128' },
        { name: 'amountOutMinimum', type: 'uint128' },
        { name: 'minHopPriceX36', type: 'uint256' },
        { name: 'hookData', type: 'bytes' },
      ],
    },
  ] as const;

  interface Fake {
    balance: bigint;
    toPermit2: bigint;
    router: { amount: bigint; expiration: number };
    staking: bigint;
    price: bigint;
    quote: bigint;
    eth: bigint;
    maxFee: bigint;
    log: string[];
    reject: Set<string>;
    revert: Set<string>;
    sent: Record<string, readonly unknown[]>;
    value: Record<string, bigint>;
    /** Called as each request reaches the wallet, before it answers. */
    onSend?: (name: string) => void;
    /** Called as each transaction is confirmed. */
    onMined?: (name: string) => void;
    /** What the status box said when each request reached the wallet. */
    seen: Record<string, string>;
  }
  let f: Fake;
  const fresh = (over: Partial<Fake> = {}): Fake => ({
    balance: 2_000_000n * E,
    toPermit2: 0n,
    router: { amount: 0n, expiration: 0 },
    staking: 0n,
    price: SHOWN_PRICE,
    quote: 5n * 10n ** 16n,
    eth: 3n * E,
    maxFee: 7n * 10n ** 9n,
    log: [],
    reject: new Set(),
    revert: new Set(),
    sent: {},
    value: {},
    seen: {},
    ...over,
  });

  /** Which step a call is: a sale's approvals, the sale, a staking approval, a staking action. */
  const nameOf = (to: string, data: `0x${string}`): { name: string; args: readonly unknown[] } => {
    if (same(to, TOWN)) {
      const d = decodeFunctionData({ abi: TOKEN_ABI, data });
      return { name: same(d.args![0], P2) ? 'approve' : 'stake-approve', args: d.args! };
    }
    if (same(to, P2)) return { name: 'allow', args: decodeFunctionData({ abi: PERMIT2_ABI, data }).args! };
    if (same(to, ROUTER)) {
      const d = decodeFunctionData({ abi: ROUTER_ABI, data });
      const [, inputs, deadline] = d.args as readonly [string, readonly `0x${string}`[], bigint];
      const [, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], inputs[0]);
      const [p] = decodeAbiParameters(EXACT_IN, (params as readonly `0x${string}`[])[0]);
      return { name: p.zeroForOne ? 'buy' : 'sell', args: [p.amountIn, p.amountOutMinimum, deadline] };
    }
    if (same(to, STAKING)) {
      const d = decodeFunctionData({ abi: STAKING_ABI, data });
      return { name: d.functionName, args: d.args ?? [] };
    }
    return { name: `unknown ${to}`, args: [] };
  };

  const pending = new Map<string, string>();
  let nonce = 0;
  let statusBox: HTMLElement | null = null;
  const provider = {
    async request({ method, params }: { method: string; params?: unknown[] }) {
      if (method === 'eth_chainId') return '0x7a69';
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [W1];
      if (method === 'eth_sendTransaction') {
        const t = params![0] as { to: string; data: `0x${string}`; value?: string };
        const { name, args } = nameOf(t.to, t.data);
        f.log.push(`send ${name}`);
        f.sent[name] = args;
        if (t.value) f.value[name] = BigInt(t.value);
        f.seen[name] = statusBox?.querySelector('.run-status') ? text(statusBox.querySelector('.run-status') as HTMLElement) : '';
        f.onSend?.(name);
        if (f.reject.has(name)) {
          f.log.push(`rejected ${name}`);
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        }
        const hash = `0x${(++nonce).toString(16).padStart(64, '0')}`;
        pending.set(hash, name);
        return hash;
      }
      throw new Error(`the stand-in wallet does not do ${method}`);
    },
  };
  const standIn: WalletInfo = { uuid: 'f9o-stand-in', name: 'Stand-in wallet', icon: null, rdns: 'test.f9o.standin', provider };

  const fake = {
    ...client,
    async getBlock() {
      return { number: 1_000n + BigInt(nonce), timestamp: BigInt(NOW) };
    },
    async readContract(a: { address: string; functionName: string; args?: readonly unknown[] }) {
      if (same(a.address, TOWN) && a.functionName === 'balanceOf') return f.balance;
      if (same(a.address, TOWN) && a.functionName === 'allowance') return same(a.args![1], P2) ? f.toPermit2 : f.staking;
      if (same(a.address, P2) && a.functionName === 'allowance') return [f.router.amount, f.router.expiration, 0];
      if (same(a.address, STAKING) && a.functionName === 'vaultPriceWei') return f.price;
      throw new Error(`the stand-in chain does not read ${a.functionName}`);
    },
    async simulateContract(a: { address: string; abi: unknown; functionName: string; args?: readonly unknown[] }) {
      if (same(a.address, QUOTER)) return { result: [f.quote, 0n], request: a };
      const data = encodeFunctionData({ abi: a.abi, functionName: a.functionName, args: a.args } as unknown as Parameters<typeof encodeFunctionData>[0]);
      f.log.push(`check ${nameOf(a.address, data).name}`);
      return { result: undefined, request: a };
    },
    async waitForTransactionReceipt({ hash }: { hash: string }) {
      await settle(80);
      const name = pending.get(hash)!;
      const failed = f.revert.has(name);
      const args = f.sent[name];
      if (!failed) {
        if (name === 'approve') f.toPermit2 = args[1] as bigint;
        if (name === 'allow') f.router = { amount: args[2] as bigint, expiration: Number(args[3]) };
        if (name === 'stake-approve') f.staking = args[1] as bigint;
        if (name === 'sell') f.balance -= args[0] as bigint;
      }
      f.log.push(`mined ${name}${failed ? ' (failed)' : ''}`);
      f.onMined?.(name);
      return { status: failed ? 'reverted' : 'success', transactionHash: hash, gasUsed: 50_000n, blockNumber: 1_000n + BigInt(nonce) };
    },
    async getBalance() {
      return f.eth;
    },
    async estimateFeesPerGas() {
      return { maxFeePerGas: f.maxFee, maxPriorityFeePerGas: 10n ** 9n };
    },
  } as unknown as PublicClient;
  const extra = { network: PUBLIC, client: fake };
  const walletOf = (x: Fake, over: Partial<WalletState> = {}): WalletState => ({
    ...wallet,
    address: W1,
    townBalance: x.balance,
    ethBalance: x.eth,
    townAllowanceToPermit2: x.toPermit2,
    routerAllowance: x.router,
    townAllowanceToStaking: x.staking,
    ...over,
  });
  const finished = async (el: HTMLElement) => {
    for (let i = 0; i < 300; i++) {
      const st = el.querySelector('.run-status') as HTMLElement | null;
      if (st && (st.dataset.run === 'done' || st.dataset.run === 'stopped')) return st;
      await settle(50);
    }
    return null;
  };
  /** The sell form with `amount` typed and its estimate shown; returns the panel. */
  const sellForm = async (x: Fake, amount: string, label: string, over: Partial<WalletState> = {}) => {
    f = x;
    const el = await mount(<Trade sell />, chain, walletOf(x, over), label, extra);
    statusBox = el;
    typeIn(el, '#sell-town', amount);
    const box = el.querySelector('#trade-panel-sell') as HTMLElement;
    for (let i = 0; i < 60 && !/\d/.test((box.querySelector('.swap-output') as HTMLElement).innerText.replace(/^0$/, '')); i++) await settle(50);
    await settle(80);
    return box;
  };
  const press = (box: HTMLElement, sel = '.sell-go') => (box.querySelector(sel) as HTMLButtonElement).click();
  const sends = (x: Fake) => x.log.filter((l) => l.startsWith('send ')).map((l) => l.slice(5));
  const ONE_K = 1_000n * E;
  const autoMin = (q: bigint) => ((q * 9_900n) / 10_000n / 10n ** 12n) * 10n ** 12n;

  chooseWallet(standIn);
  try {
    // ---- 1. A first sell: approve, allow, sell, each only after the one before is confirmed ----
    {
      const x = fresh();
      const box = await sellForm(x, '1000', 'CR-82: a first sell, stand-in wallet with no approvals');
      const before = text(box);
      const label = (box.querySelector('.sell-go') as HTMLButtonElement).textContent!.trim();
      press(box);
      const st = await finished(box);
      check(
        'CR-82 first sell: before the press the button reads "Approve and sell" and the form says the sale takes 3 transactions and that the wallet asks to confirm each one',
        label === 'Approve and sell' && before.includes('This sale takes 3 transactions: approve TOWN, then allow the router, then sell TOWN.') && before.includes('Your wallet asks you to confirm each one'),
        `${label} | ${before.match(/This sale takes[^.]*\.[^.]*\./)?.[0] ?? 'no plan line'}`,
      );
      const want = ['check approve', 'send approve', 'mined approve', 'check allow', 'send allow', 'mined allow', 'check sell', 'send sell', 'mined sell'];
      check(
        'CR-82 first sell: one press runs approve, allow, sell in that order, each rehearsed by wallet.ts and sent only after the one before is confirmed',
        x.log.join(' > ') === want.join(' > ') && st?.dataset.run === 'done',
        x.log.join(' > '),
      );
      check(
        'CR-82 first sell: while the router permission waits for the wallet, the status shows step 2 of 3, step 1 confirmed and step 3 next',
        x.seen.allow.startsWith('Sell TOWN: step 2 of 3') && x.seen.allow.includes('Approve TOWN: confirmed') && x.seen.allow.includes('Allow the router: confirm it in your wallet') && x.seen.allow.includes('Sell TOWN: next'),
        x.seen.allow,
      );
      check(
        'CR-83: the first approval asks Permit2 for type(uint256).max, the second asks for type(uint160).max for the router, expiring 30 days on',
        same(x.sent.approve[0], P2) && x.sent.approve[1] === MAX_UINT256 && MAX_UINT256 === 2n ** 256n - 1n &&
          same(x.sent.allow[0], TOWN) && same(x.sent.allow[1], ROUTER) && x.sent.allow[2] === MAX_UINT160 && MAX_UINT160 === 2n ** 160n - 1n && Number(x.sent.allow[3]) === NOW + DAYS30,
        `approve(${x.sent.approve.join(', ')}) | allow(${x.sent.allow.join(', ')}), expiry ${Number(x.sent.allow[3]) - NOW} s after now`,
      );
      check(
        'CR-82 first sell: the sale sends the amount typed and the minimum the visitor saw (the automatic one), with a fresh 20-minute deadline',
        x.sent.sell[0] === ONE_K && x.sent.sell[1] === autoMin(x.quote) && Number(x.sent.sell[2]) === NOW + 20 * 60,
        `amount ${x.sent.sell[0]}, minimum ${x.sent.sell[1]} (shown ${autoMin(x.quote)}), deadline now + ${Number(x.sent.sell[2]) - NOW} s`,
      );
      check('CR-82 first sell: the finished status lists the three transactions, each confirmed, and says what was sold', (st?.dataset.hashes ?? '').split(',').length === 3 && text(st!).includes('Done. You sold 1,000 TOWN'), text(st!));
    }

    // ---- 2. Only the router permission missing (expired): two transactions ----
    {
      const x = fresh({ toPermit2: MAX_UINT256, router: { amount: MAX_UINT160, expiration: NOW - 60 } });
      const box = await sellForm(x, '1000', 'CR-82: the router permission expired');
      const before = text(box);
      const label = (box.querySelector('.sell-go') as HTMLButtonElement).textContent!.trim();
      press(box);
      const st = await finished(box);
      check(
        'CR-82 router permission expired: "Renew and sell", "This sale takes 2 transactions", then allow and sell only, in order',
        label === 'Renew and sell' && before.includes('This sale takes 2 transactions: allow the router, then sell TOWN.') && x.log.join(' > ') === 'check allow > send allow > mined allow > check sell > send sell > mined sell' && st?.dataset.run === 'done',
        `${label} | ${x.log.join(' > ')}`,
      );
    }

    // ---- 3. A rejection at each step stops the run ----
    for (const [step, done] of [
      ['approve', ''],
      ['allow', 'Approve TOWN'],
      ['sell', 'Approve TOWN, Allow the router'],
    ] as const) {
      const x = fresh({ reject: new Set([step]) });
      const box = await sellForm(x, '1000', `CR-82: rejected at ${step}`);
      press(box);
      const st = await finished(box);
      const after = sends(x);
      const t = st ? text(st) : '';
      check(
        `CR-82 rejected in the wallet at "${step}": the run stops, nothing more is sent, and the status says which steps finished and that pressing again carries on`,
        after[after.length - 1] === step &&
          x.log[x.log.length - 1] === `rejected ${step}` &&
          st?.dataset.run === 'stopped' &&
          st.dataset.error === 'UserRejected' &&
          t.includes('You cancelled the request in your wallet') &&
          (done ? t.includes(`Done before it stopped: ${done}.`) : !t.includes('Done before it stopped')) &&
          t.includes('Pressing the button again carries on from what is still missing'),
        `${x.log.join(' > ')} | ${t}`,
      );
    }

    // ---- 4. A transaction that fails stops the run ----
    {
      const x = fresh({ revert: new Set(['allow']) });
      const box = await sellForm(x, '1000', 'CR-82: the router permission fails on chain');
      press(box);
      const st = await finished(box);
      check(
        'CR-82 a transaction included but failed (the router permission): the run stops and the sale is never sent',
        x.log.join(' > ') === 'check approve > send approve > mined approve > check allow > send allow > mined allow (failed)' && st?.dataset.run === 'stopped' && text(st).includes('included but failed'),
        `${x.log.join(' > ')} | ${st ? text(st) : ''}`,
      );
    }

    // ---- 5. The amount changed mid-run ----
    {
      const x = fresh();
      const box = await sellForm(x, '1000', 'CR-82: the amount changed while the approval was waiting');
      x.onSend = (name) => {
        if (name === 'approve') typeIn(box, '#sell-town', '2000');
      };
      press(box);
      const st = await finished(box);
      check(
        'CR-82 the amount changed while the first approval was on its way: once it is confirmed nothing more is sent, and the status says the amount changed',
        sends(x).join(',') === 'approve' && x.log.includes('mined approve') && st?.dataset.run === 'stopped' && text(st).includes('The amount changed.') && text(st).includes('Done before it stopped: Approve TOWN.'),
        `${x.log.join(' > ')} | ${st ? text(st) : ''}`,
      );
    }

    // ---- 6. A fresh estimate below the minimum stops before the sale ----
    {
      const x = fresh();
      const box = await sellForm(x, '1000', 'CR-82: the price moved while the approvals confirmed');
      const shownMin = autoMin(x.quote);
      x.onMined = (name) => {
        if (name === 'allow') x.quote = x.quote / 2n;
      };
      press(box);
      const st = await finished(box);
      const t = st ? text(st) : '';
      check(
        'CR-82 the fresh estimate taken after the approvals is below the minimum the visitor saw: the sale is not sent; the status gives the new estimate and says to press again',
        sends(x).join(',') === 'approve,allow' &&
          st?.dataset.run === 'stopped' &&
          st.dataset.error === 'PriceMoved' &&
          t.includes(`The price moved while the approvals confirmed: the estimate is now ${fmtEth(x.quote, 6)} ETH, below the minimum of ${fmtEth(shownMin, 6)} ETH you saw, so the sale was not sent.`) &&
          t.includes('press the button again'),
        `${x.log.join(' > ')} | ${t}`,
      );
    }

    // ---- 7. CR-83: older, smaller approvals below the amount are asked for again ----
    {
      const x = fresh({ toPermit2: 500n * E, router: { amount: 500n * E, expiration: NOW + 10 * 86_400 } });
      const box = await sellForm(x, '1000', 'CR-83: older approvals of 500 TOWN, selling 1,000');
      const label = (box.querySelector('.sell-go') as HTMLButtonElement).textContent!.trim();
      press(box);
      const st = await finished(box);
      check(
        'CR-83 a wallet whose older approvals (500 TOWN each) are below the amount (1,000 TOWN) is asked for both again, without a limit this time, then sells',
        label === 'Approve and sell' && sends(x).join(',') === 'approve,allow,sell' && x.sent.approve[1] === MAX_UINT256 && x.sent.allow[2] === MAX_UINT160 && st?.dataset.run === 'done',
        `${label} | ${x.log.join(' > ')}`,
      );
    }

    // ---- 8. CR-83: unlimited approvals, the router's permission unexpired, more TOWN bought: one transaction ----
    {
      const x = fresh({ balance: 9_000_000n * E, toPermit2: MAX_UINT256, router: { amount: MAX_UINT160 - 1_000n * E, expiration: NOW + 20 * 86_400 } });
      const box = await sellForm(x, '5,000,000', 'CR-83: unlimited approvals, more TOWN bought since');
      const before = text(box);
      const label = (box.querySelector('.sell-go') as HTMLButtonElement).textContent!.trim();
      press(box);
      const st = await finished(box);
      check(
        'CR-83 a wallet with the unlimited approvals and an unexpired router permission, holding more TOWN after a buy, sells with one transaction: "Sell TOWN", no plan line, no approval',
        label === 'Sell TOWN' && !before.includes('This sale takes') && x.log.join(' > ') === 'check sell > send sell > mined sell' && x.sent.sell[0] === 5_000_000n * E && st?.dataset.run === 'done',
        `${label} | ${x.log.join(' > ')}`,
      );
    }

    // ---- 9. Approve, then open a vault; the price-rose stop; approve, then add ----
    const noVault = { positionOf: { tier: 0 as const, amount: 0n }, earned: 0n, oldVaults: [] };
    {
      const x = fresh();
      f = x;
      const el = await mount(<Stake />, chain, walletOf(x, noVault), 'CR-82: approve, then open a tier 1 vault', extra);
      statusBox = el;
      typeIn(el, '#vault-town', '1000');
      await settle();
      const before = plain(() => text(el.querySelector('.action-form') as HTMLElement));
      const label = (el.querySelector('.stake-go') as HTMLButtonElement).textContent!.trim();
      press(el, '.stake-go');
      const st = await finished(el);
      check(
        'CR-82 open a vault: "Approve and open tier 1 vault", "This takes 2 transactions"; the exact-amount approval, then, once confirmed, the vault with the ETH shown',
        label === 'Approve and open tier 1 vault' &&
          before.includes('This takes 2 transactions: approve exactly 1,000 TOWN for the staking contract, then open the vault.') &&
          x.log.join(' > ') === 'check stake-approve > send stake-approve > mined stake-approve > check openVault > send openVault > mined openVault' &&
          same(x.sent['stake-approve'][0], STAKING) &&
          x.sent['stake-approve'][1] === ONE_K &&
          x.value.openVault === withMargin(SHOWN_PRICE) &&
          st?.dataset.run === 'done',
        `${label} | ${x.log.join(' > ')} | approve ${x.sent['stake-approve']?.[1]} | value ${x.value.openVault}`,
      );
    }
    {
      const x = fresh();
      f = x;
      x.onMined = (name) => {
        if (name === 'stake-approve') x.price = SHOWN_PRICE + 10_000_000_000_000n;
      };
      const el = await mount(<Stake />, chain, walletOf(x, noVault), 'CR-82: the vault price rose while the approval confirmed', extra);
      statusBox = el;
      typeIn(el, '#vault-town', '1000');
      await settle();
      press(el, '.stake-go');
      const st = await finished(el);
      const t = st ? text(st) : '';
      check(
        'CR-82 the vault price read again just before the stake is above the price shown: the vault is not opened; the status gives the new price',
        sends(x).join(',') === 'stake-approve' && st?.dataset.run === 'stopped' && st.dataset.error === 'PriceRose' && t.includes(`rose to ${fmtEth(x.price, 6)} ETH, above the ${fmtEth(SHOWN_PRICE, 6)} ETH shown`),
        `${x.log.join(' > ')} | ${t}`,
      );
    }
    {
      const x = fresh();
      f = x;
      const el = await mount(<Stake />, chain, walletOf(x, { positionOf: { tier: 1, amount: 5_000n * E } }), 'CR-82: approve, then add TOWN', extra);
      statusBox = el;
      (el.querySelector('#tab-add') as HTMLButtonElement).click();
      await settle();
      typeIn(el, '#add-town', '1000');
      await settle();
      const label = (el.querySelector('.stake-go') as HTMLButtonElement).textContent!.trim();
      press(el, '.stake-go');
      const st = await finished(el);
      check(
        'CR-82 add TOWN: "Approve and add TOWN"; the exact-amount approval, then, once confirmed, addStake',
        label === 'Approve and add TOWN' &&
          x.log.join(' > ') === 'check stake-approve > send stake-approve > mined stake-approve > check addStake > send addStake > mined addStake' &&
          x.sent['stake-approve'][1] === ONE_K &&
          x.sent.addStake[0] === ONE_K &&
          st?.dataset.run === 'done',
        `${label} | ${x.log.join(' > ')}`,
      );
    }

    // ---- 10. The quick amounts ----
    {
      // An odd balance, in units: 12,345,678.901234567891234567 TOWN.
      const odd = 12_345_678_901_234_567_891_234_567n;
      const x = fresh({ balance: odd });
      f = x;
      const el = await mount(<Trade sell />, chain, walletOf(x), 'CR-82: sell 25/50/75/100% of an odd balance', extra);
      const box = el.querySelector('#trade-panel-sell') as HTMLElement;
      const got: string[] = [];
      let ok = true;
      for (const p of [25, 50, 75, 100] as const) {
        button(box, `${p}%`)!.click();
        await settle(80);
        const field = (box.querySelector('#sell-town') as HTMLInputElement).value;
        const uses = (box.querySelector('.swap-box .uses') as HTMLElement | null)?.dataset.uses;
        const want = p === 100 ? odd : (odd * BigInt(p)) / 100n;
        ok &&= field === formatUnits(want, 18) && uses === want.toString();
        got.push(`${p}%: "${field}" uses ${uses}`);
      }
      check(
        'CR-82 sell quick amounts: 25/50/75/100% of an odd balance, in whole units; the field and the amount used agree; 100% is the balance exactly',
        ok && (box.querySelector('#sell-town') as HTMLInputElement).value === '12345678.901234567891234567',
        got.join(' | '),
      );
    }
    {
      const x = fresh({ eth: 1_500_000_000_000_000_003n, maxFee: 7n * 10n ** 9n });
      f = x;
      const keep = 200_000n * 7n * 10n ** 9n * 3n;
      const el = await mount(<Trade />, chain, walletOf(x), 'CR-82: buy quick amounts with the gas kept back', extra);
      const box = el.querySelector('#trade-panel-buy') as HTMLElement;
      await settle(150);
      const note = plain(() => text(box.querySelector('.quick-note') as HTMLElement));
      const got: string[] = [];
      let ok = true;
      for (const p of [25, 50, 75, 100] as const) {
        button(box, `${p}%`)!.click();
        await settle(80);
        const uses = (box.querySelector('.swap-box .uses') as HTMLElement | null)?.dataset.uses;
        const want = p === 100 ? x.eth - keep : ((x.eth - keep) * BigInt(p)) / 100n;
        ok &&= uses === want.toString();
        got.push(`${p}%: ${uses}`);
      }
      check(
        'CR-82 buy quick amounts: the share of the ETH after keeping back 200,000 gas × the maximum fee per gas (7 gwei) × 3 = 0.0042 ETH, and the line says so',
        ok && buyGasReserve(7n * 10n ** 9n) === keep && BUY_GAS_ALLOWANCE === 200_000n && note === 'Keeps back 0.0042 ETH for the buy’s gas (200,000 gas at 7 gwei, times 3).',
        `${note} | ${got.join(' | ')}`,
      );
    }
    {
      const keep = 200_000n * 7n * 10n ** 9n * 3n;
      const x = fresh({ eth: keep, maxFee: 7n * 10n ** 9n });
      f = x;
      const el = await mount(<Trade />, chain, walletOf(x), 'CR-82: buy quick amounts off, the balance only covers the gas kept back', extra);
      const box = el.querySelector('#trade-panel-buy') as HTMLElement;
      await settle(150);
      const buttons = [25, 50, 75, 100].map((p) => button(box, `${p}%`));
      const note = plain(() => text(box.querySelector('.quick-note') as HTMLElement));
      check(
        'CR-82 buy quick amounts: with a balance that does not exceed the gas kept back, the four buttons are off, with the reason',
        buttons.every((b) => b?.disabled === true) && note === 'Off: this wallet’s 0.0042 ETH does not cover the 0.0042 ETH kept back for the buy’s gas.',
        note,
      );
    }
    {
      f = fresh();
      const none = await mount(<Trade />, chain, null, 'CR-82: no wallet: no quick amounts', extra);
      const noneSell = await mount(<Trade sell />, chain, null, 'CR-82: no wallet, sell: no quick amounts', extra);
      const wrong = await mount(<Trade />, chain, walletOf(f), 'CR-82: wrong network: no quick amounts', { ...extra, wrongNetwork: true });
      check(
        'CR-82 quick amounts are absent without a wallet (both sides) and with a wallet on the wrong network',
        none.querySelectorAll('.quick-btn').length === 0 && noneSell.querySelectorAll('.quick-btn').length === 0 && wrong.querySelectorAll('.quick-btn').length === 0,
      );
    }
  } finally {
    chooseWallet(null);
    statusBox = null;
  }
}

// ---- F9q (CR-84), F9r (CR-87) and F9s (CR-88): the project's places in the footer ---------------
// The row is rendered on its own, with the site's own chain-1 address file (no TOWN address today,
// so GMGN says "at launch") and with a stand-in address passed in its place (GMGN is then an
// ordinary link). The stylesheet is loaded for as long as these checks run, because it is the
// stylesheet that hides the words until the pointer or the keyboard reaches them, that paints each
// mark its platform's colour, and that decides where the block sits. Nothing in src/addresses/** is
// touched.
//
// CR-87 added: the X and OpenSea drawings are the platforms' own marks, each a single path exactly
// as that task brief gave it; the Telegram drawing is unchanged, path for path; no mark is dimmed
// any more; and the font licence sentence is gone from every page.
//
// CR-88 adds:
//   1. the block is written once and sits in the brand block, under the page links, and the
//      stylesheet alone moves it into a third column of its own at 1000 px and above;
//   2. the heading reads "Official Links" and "Find UpTown" is gone from every page;
//   3. GMGN is shown from today, with exactly OpenSea's treatment and its own word ("at launch"),
//      and becomes a link the moment the chain-1 address file names TOWN;
//   4. GMGN's mark is GMGN's own pixel drawing, used as it is: every element and every attribute as
//      the task brief gives them, its clip-path id made unique, its own colours kept;
//   6. every mark carries its platform's brand colour — X black on light and white on dark through
//      the stylesheet's own light/dark cascade, Telegram #26A5E4, OpenSea #2081E2 over a white disc
//      so its boat reads white in either theme, GMGN its own colours;
//   7. the four are sized by the drawing that shows rather than by their boxes: X 18, Telegram 22,
//      GMGN 16 (the only size at or below the box that puts its 2-unit blocks on whole screen
//      pixels) and OpenSea 28, whose disc is larger than X's box because its boat is only part of
//      it.

/** The X mark's path, exactly as CR-87's task brief gives it (Simple Icons). */
const X_PATH =
  'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z';
/** The OpenSea mark's path, exactly as CR-87's task brief gives it (Simple Icons). */
const OPENSEA_PATH =
  'M12 0C5.374 0 0 5.374 0 12s5.374 12 12 12 12-5.374 12-12S18.629 0 12 0ZM5.92 12.403l.051-.081 3.123-4.884a.107.107 0 0 1 .187.014c.52 1.169.972 2.623.76 3.528-.088.372-.335.876-.614 1.342a2.405 2.405 0 0 1-.117.199.106.106 0 0 1-.09.045H6.013a.106.106 0 0 1-.091-.163zm13.914 1.68a.109.109 0 0 1-.065.101c-.243.103-1.07.485-1.414.962-.878 1.222-1.548 2.97-3.048 2.97H9.053a4.019 4.019 0 0 1-4.013-4.028v-.072c0-.058.048-.106.108-.106h3.485c.07 0 .12.063.115.132-.026.226.017.459.125.67.206.42.636.682 1.099.682h1.726v-1.347H9.99a.11.11 0 0 1-.089-.173l.063-.09c.16-.231.391-.586.621-.992.156-.274.308-.566.43-.86.024-.052.043-.107.065-.16.033-.094.067-.182.091-.269a4.57 4.57 0 0 0 .065-.223c.057-.25.081-.514.081-.787 0-.108-.004-.221-.014-.327-.005-.117-.02-.235-.034-.352a3.415 3.415 0 0 0-.048-.312 6.494 6.494 0 0 0-.098-.468l-.014-.06c-.03-.108-.056-.21-.09-.317a11.824 11.824 0 0 0-.328-.972 5.212 5.212 0 0 0-.142-.355c-.072-.178-.146-.339-.213-.49a3.564 3.564 0 0 1-.094-.197 4.658 4.658 0 0 0-.103-.213c-.024-.053-.053-.104-.072-.152l-.211-.388c-.029-.053.019-.118.077-.101l1.32.357h.01l.173.05.192.054.07.019v-.783c0-.379.302-.686.679-.686a.66.66 0 0 1 .477.202.69.69 0 0 1 .2.484V6.65l.141.039c.01.005.022.01.031.017.034.024.084.062.147.11.05.038.103.086.165.137a10.351 10.351 0 0 1 .574.504c.214.199.454.432.684.691.065.074.127.146.192.226.062.079.132.156.19.232.079.104.16.212.235.324.033.053.074.108.105.161.096.142.178.288.257.435.034.067.067.141.096.213.089.197.159.396.202.598a.65.65 0 0 1 .029.132v.01c.014.057.019.12.024.184a2.057 2.057 0 0 1-.106.874c-.031.084-.06.17-.098.254-.075.17-.161.343-.264.502-.034.06-.075.122-.113.182-.043.063-.089.123-.127.18a3.89 3.89 0 0 1-.173.221c-.053.072-.106.144-.166.209-.081.098-.16.19-.245.278-.048.058-.1.118-.156.17-.052.06-.108.113-.156.161-.084.084-.15.147-.208.202l-.137.122a.102.102 0 0 1-.072.03h-1.051v1.346h1.322c.295 0 .576-.104.804-.298.077-.067.415-.36.816-.802a.094.094 0 0 1 .05-.03l3.65-1.057a.108.108 0 0 1 .138.103z';
/** The Telegram paper plane, byte for byte as it stands on main: CR-87 and CR-88 leave this drawing alone. */
const TELEGRAM_PATH = 'M22 2.6 2 10.8l6.6 2.6L9.8 21l3.5-5.4 5.3 5.2z';

/** One element of a drawing: its tag and every attribute it carries but `class`. */
type Shape = { tag: string; attrs: Record<string, string> };
const shapesOf = (el: Element | null): Shape[] =>
  el
    ? [...el.children].map((c) => ({
        tag: c.tagName.toLowerCase(),
        attrs: Object.fromEntries([...c.attributes].filter((a) => a.name !== 'class').map((a) => [a.name, a.value])),
      }))
    : [];

// GMGN's drawing, exactly as CR-88's task brief gives it: every element inside the clipped group,
// with every attribute, and the clip path's own rect. Written out here so that a redrawn, re-spaced
// or part-recoloured mark is caught; scripts/f9s-shots.mjs reads the same block out of the brief
// itself and compares it with the built page, so neither copy can drift unnoticed.
const GMGN_SHAPES: Shape[] = [
  { tag: 'path', attrs: {d:'M8 30V32H30V30H28V26H26V24H28V22H30V20H32V12H30V4H28V2H22V4H20V8H18V4H16V2H10V4H8V12H4V10H0V20H2V22H8V24H12V26H10V30H8Z',fill:'#9ED455'} },
  { tag: 'path', attrs: {'fill-rule':'evenodd','clip-rule':'evenodd',d:'M16 2H14V4H16V6V8V10H18H20H22V8V6V4L20 4V6V8H18V6V4H16V2ZM6 20H8V22H6H4H2L2 20H4H6ZM4 12H2L2 14L2 16V18L2 20H0V18V16V14V12V10H2H4V12ZM4 12V14H6H8V12H10V10V8V6V4L8 4V6V8V10V12H6H4ZM12 26V24H10H8V22H10H12H14V24V26H12ZM10 30V28V26H12V28V30H10ZM10 30V32H8V30H10ZM30 30H28V28V26H26V24H28V22H30V20H32V18V16V14V12H30V10V8V6V4H28V2H26V4H28V6V8V10V12H30V14V16V18V20H28V22H26H24V24V26H26V28V30H28V32H30V30Z',fill:'#457F2C'} },
  { tag: 'rect', attrs: {x:'10',y:'6',width:'4',height:'6',fill:'white'} },
  { tag: 'rect', attrs: {x:'10',y:'8',width:'2',height:'4',fill:'black'} },
  { tag: 'rect', attrs: {x:'12',y:'18',width:'2',height:'6',transform:'rotate(90 12 18)',fill:'black'} },
  { tag: 'path', attrs: {'fill-rule':'evenodd','clip-rule':'evenodd',d:'M14 4V6L10 6V4H14ZM4 14L4 12H2V14H4ZM4 14H10V16H4V14ZM26 6V4H22V6L26 6Z',fill:'#D5F86B'} },
  { tag: 'rect', attrs: {x:'22',y:'30',width:'2',height:'10',transform:'rotate(90 22 30)',fill:'#D09C4F'} },
  { tag: 'rect', attrs: {x:'22',y:'28',width:'2',height:'8',transform:'rotate(90 22 28)',fill:'#D09C4F'} },
  { tag: 'rect', attrs: {x:'20',y:'26',width:'2',height:'6',transform:'rotate(90 20 26)',fill:'#D09C4F'} },
  { tag: 'rect', attrs: {x:'20',y:'24',width:'2',height:'4',transform:'rotate(90 20 24)',fill:'#D09C4F'} },
  { tag: 'path', attrs: {'fill-rule':'evenodd','clip-rule':'evenodd',d:'M28 12V6H26V12H28ZM10 14V12H8V14H10ZM6 18V20H2V18H6ZM30 20V18V14H28V18H26V20H22V22V24H20V26H22H24V30H26V32H28V30H26V26H24V22H28V20H30ZM14 20V22H8V20H14ZM14 26V22H16V26H14ZM12 30V26H14V30H12ZM12 30H10V32H12V30ZM22 10V12H20V10H22Z',fill:'#57A756'} },
  { tag: 'rect', attrs: {x:'22',y:'6',width:'4',height:'6',fill:'white'} },
  { tag: 'rect', attrs: {x:'22',y:'8',width:'2',height:'4',fill:'black'} },
];
const GMGN_CLIP_RECT: Shape = { tag: 'rect', attrs: {width:'32',height:'32',fill:'white'} };

/** The colours the marks are painted, as the browser reports them. */
const RGB = { black: 'rgb(0, 0, 0)', white: 'rgb(255, 255, 255)', telegram: 'rgb(38, 165, 228)', opensea: 'rgb(32, 129, 226)' };

async function cr84cr87cr88() {
  const style = document.createElement('style');
  style.textContent = GLOBAL_CSS;
  document.head.append(style);
  const box = document.createElement('div');
  stage.append(box);

  /** The row with a TOWN address on Ethereum; without an argument, with the site's own address file. */
  const row = (...town: (Address | null)[]): HTMLElement => {
    render(town.length ? <PlaceRow town={town[0]} /> : <PlaceRow />, box);
    return box.querySelector('.footer-places') as HTMLElement;
  };
  const mark = (el: HTMLElement, place: string) => el.querySelector(`[data-place="${place}"]`) as HTMLElement;
  /** Everything a visitor and a screen reader get from one mark. */
  const seen = (el: HTMLElement, place: string) => {
    const m = mark(el, place);
    const svg = m?.querySelector('svg');
    const word = m?.querySelector('.place-word') as HTMLElement | null;
    return {
      tag: m?.tagName.toLowerCase() ?? null,
      href: m?.getAttribute('href') ?? null,
      target: m?.getAttribute('target') ?? null,
      rel: m?.getAttribute('rel') ?? null,
      aria: m?.getAttribute('aria-label') ?? null,
      title: m?.getAttribute('title') ?? null,
      tabindex: m?.getAttribute('tabindex') ?? null,
      word: word?.textContent ?? null,
      wordOpacity: word ? getComputedStyle(word).opacity : null,
      says: (m?.querySelector('.visually-hidden') as HTMLElement | null)?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      shapes: svg ? svg.querySelectorAll('path, rect, circle').length : 0,
      fromElsewhere: svg ? [...svg.querySelectorAll('*')].some((n) => /^(image|use)$/i.test(n.tagName)) : null,
      glyphOpacity: svg ? getComputedStyle(svg).opacity : null,
      paths: svg ? [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d')) : [],
      drawnAt: svg ? `${svg.getAttribute('width')}x${svg.getAttribute('height')}` : null,
      rootFill: svg?.getAttribute('fill') ?? null,
      // Every drawn shape's painted fill, in drawing order, as the browser resolves it. Shapes
      // inside `defs` are left out: GMGN's clip path holds a rect that is never painted.
      fills: svg ? [...svg.querySelectorAll('path, rect, circle')].filter((s) => !s.closest('defs')).map((s) => getComputedStyle(s).fill) : [],
      colour: m ? getComputedStyle(m).color : null,
      border: m ? getComputedStyle(m).borderTopStyle : null,
    };
  };

  const own = row();
  const order = [...own.querySelectorAll('li > *')].map((e) => (e as HTMLElement).dataset.place).join(',');
  check(
    'CR-88 item 3: with the site’s own Ethereum address file (no TOWN address today) the row holds all four marks, in order: X, Telegram, GMGN, OpenSea',
    order === 'X,Telegram,GMGN,OpenSea',
    order,
  );
  check('CR-88 item 2: the heading reads "Official Links"', (own.querySelector('.footer-head') as HTMLElement).textContent === 'Official Links', `"${(own.querySelector('.footer-head') as HTMLElement).textContent}"`);

  const x = seen(own, 'X');
  const tg = seen(own, 'Telegram');
  check(
    'CR-84 X and Telegram are links to the project’s own addresses, each opening in a new tab with the platform’s name and "(opens in a new tab)"',
    x.tag === 'a' &&
      x.href === 'https://x.com/UpTownHook' &&
      x.href === X_URL &&
      x.target === '_blank' &&
      x.rel === 'noopener noreferrer' &&
      x.aria === 'UpTown on X (opens in a new tab)' &&
      tg.tag === 'a' &&
      tg.href === 'https://t.me/uptownhook' &&
      tg.href === TELEGRAM_URL &&
      tg.target === '_blank' &&
      tg.rel === 'noopener noreferrer' &&
      tg.aria === 'UpTown on Telegram (opens in a new tab)',
    `X ${JSON.stringify({ ...x, fills: undefined, paths: undefined })} | Telegram ${JSON.stringify({ ...tg, fills: undefined, paths: undefined })}`,
  );

  const sea = seen(own, 'OpenSea');
  check(
    'CR-84, CR-87 OpenSea is unchanged: not a link, leads nowhere, and says "soon" — for the eye and for a screen reader',
    sea.tag === 'span' && sea.href === null && sea.word === 'soon' && sea.says === 'OpenSea: soon' && sea.title === 'OpenSea: soon' && sea.tabindex === '0',
    JSON.stringify({ ...sea, fills: undefined, paths: undefined }),
  );

  // CR-88 item 3: GMGN is shown from today, with exactly OpenSea's treatment and its own word. This
  // replaces F9q's hiding rule, so the row never has three marks again.
  const gm = seen(own, 'GMGN');
  check(
    'CR-88 item 3: with no TOWN address on Ethereum the GMGN mark is still shown — at full strength, not a link, with no href, saying "at launch" for the eye and for a screen reader',
    gm.tag === 'span' &&
      gm.href === null &&
      gm.word === 'at launch' &&
      gm.says === 'GMGN: at launch' &&
      gm.title === 'GMGN: at launch' &&
      gm.tabindex === '0' &&
      Number(gm.glyphOpacity) === 1 &&
      own.querySelectorAll('[href*="gmgn"]').length === 0 &&
      mainnetTownAddress() === null,
    `${JSON.stringify({ ...gm, fills: undefined, paths: undefined })}; mainnetTownAddress() ${mainnetTownAddress()}`,
  );
  // The build under test is the local chain's, which does have a deployment: GMGN still has no
  // address, because it follows the chain-1 file and not the chain this build is for.
  check(
    'CR-84 the GMGN mark follows the Ethereum address file whatever network the build is for (this build: chain 31337, contracts deployed, GMGN still without a link)',
    NETWORK.chainId === 31337 && NETWORK.deployment !== null && seen(own, 'GMGN').href === null,
    `build chain ${NETWORK.chainId}, deployed ${NETWORK.deployment !== null}`,
  );

  // The same row with a TOWN address in the file's place: the mark becomes the link, built from it.
  const TOWN: Address = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
  const filled = row(TOWN);
  const filledOrder = [...filled.querySelectorAll('li > *')].map((e) => (e as HTMLElement).dataset.place).join(',');
  const gmLive = seen(filled, 'GMGN');
  check(
    'CR-84, CR-88 with a TOWN address on Ethereum, GMGN is third, an ordinary link to gmgn.ai/eth/token/<address>, opening in a new tab, named, with no word shown',
    filledOrder === 'X,Telegram,GMGN,OpenSea' &&
      gmLive.tag === 'a' &&
      gmLive.href === `https://gmgn.ai/eth/token/${TOWN}` &&
      gmLive.href === gmgnUrl(TOWN) &&
      gmLive.target === '_blank' &&
      gmLive.rel === 'noopener noreferrer' &&
      gmLive.aria === 'TOWN on GMGN (opens in a new tab)' &&
      gmLive.word === null &&
      gmLive.says === null &&
      Number(gmLive.glyphOpacity) === 1 &&
      gmgnUrl(null) === null,
    `${filledOrder} | ${JSON.stringify({ ...gmLive, fills: undefined, paths: undefined })}`,
  );
  check(
    'CR-84 the other marks are unchanged when the address file is filled: X and Telegram still link, OpenSea still leads nowhere and says "soon"',
    seen(filled, 'X').href === X_URL && seen(filled, 'Telegram').href === TELEGRAM_URL && seen(filled, 'OpenSea').tag === 'span' && seen(filled, 'OpenSea').word === 'soon',
    `OpenSea ${JSON.stringify({ ...seen(filled, 'OpenSea'), fills: undefined, paths: undefined })}`,
  );

  // Every mark is drawn in the page: shapes, nothing fetched from another host, no <img> anywhere.
  const names = ['X', 'Telegram', 'GMGN', 'OpenSea'];
  const drawn = names.map((p) => seen(filled, p));
  check(
    'CR-84 every mark is drawn in the page as an inline SVG (no picture from another host, no <img>, no icon font)',
    drawn.every((d) => d.shapes > 0 && d.fromElsewhere === false) && filled.querySelectorAll('img').length === 0 && own.querySelectorAll('img').length === 0,
    drawn.map((d, i) => `${names[i]}: ${d.shapes} shapes`).join(', '),
  );

  // CR-87: the X and OpenSea drawings are the platforms' own marks, each one path, exactly as that
  // task brief gives it; the Telegram paper plane is untouched, byte for byte as it is on main.
  check(
    'CR-87, CR-88 the X and OpenSea marks are still the platforms’ own drawings, each a single path exactly as the brief gives it, and the Telegram drawing is still unchanged',
    x.paths.length === 1 &&
      x.paths[0] === X_PATH &&
      sea.paths.length === 1 &&
      sea.paths[0] === OPENSEA_PATH &&
      tg.paths.length === 1 &&
      tg.paths[0] === TELEGRAM_PATH,
    `X: 1 path, the brief’s: ${x.paths[0] === X_PATH} (${x.paths[0]?.length} characters) | OpenSea: 1 path, the brief’s: ${sea.paths[0] === OPENSEA_PATH} (${sea.paths[0]?.length} characters) | Telegram: unchanged: ${tg.paths[0] === TELEGRAM_PATH} ("${tg.paths[0]}")`,
  );

  // CR-88 item 4: GMGN's drawing is GMGN's own file, used as it is — element for element, attribute
  // for attribute — with only its clip-path id changed, and that id unique on the page.
  {
    const svg = mark(own, 'GMGN').querySelector('svg') as SVGSVGElement;
    const g = svg.querySelector('g[clip-path]');
    const clip = svg.querySelector('clipPath') as SVGClipPathElement;
    const got = shapesOf(g);
    const gotRect = shapesOf(clip)[0] ?? null;
    const same = JSON.stringify(got) === JSON.stringify(GMGN_SHAPES);
    const sameRect = JSON.stringify(gotRect) === JSON.stringify(GMGN_CLIP_RECT);
    check(
      'CR-88 item 4: GMGN’s mark is GMGN’s own drawing, used as it is — every element and every attribute exactly as the brief gives them, including the clip path’s rect',
      same && sameRect && got.length === 13,
      `${got.length} shapes (${got.map((s) => s.tag).join(', ')}); the brief’s, exactly: ${same}; clip rect the brief’s: ${sameRect}${same ? '' : ` — got ${JSON.stringify(got)}`}`,
    );
    const allIds = [...document.querySelectorAll('[id]')].map((e) => e.id);
    check(
      'CR-88 item 4: the drawing’s clip-path id is the site’s own, is unique on the page, and the file’s own id is nowhere in it',
      clip.id === 'uptown-gmgn-clip' &&
        g?.getAttribute('clip-path') === 'url(#uptown-gmgn-clip)' &&
        allIds.filter((i) => i === clip.id).length === 1 &&
        !document.documentElement.innerHTML.includes('clip0_468_9437'),
      `id "${clip.id}", used as ${g?.getAttribute('clip-path')}; ${allIds.filter((i) => i === clip.id).length} element(s) on the page carry it; the file’s own id anywhere on the page: ${document.documentElement.innerHTML.includes('clip0_468_9437')}`,
    );
  }

  // CR-87, CR-88: nothing in the row is dimmed. Every drawing is at full opacity, every mark has a
  // solid border, and F9q's dimming is gone from the stylesheet: no `.place-off` rule anywhere.
  const cssRules = [...document.styleSheets].flatMap((s) => {
    try {
      return [...s.cssRules];
    } catch {
      return [];
    }
  });
  const oldDimming = cssRules.filter(
    (r) => r instanceof CSSStyleRule && /\.place-off/.test(r.selectorText) && (r.style.opacity === '0.45' || r.style.borderStyle === 'dashed' || r.style.opacity === '0.7'),
  ).length;
  check(
    'CR-87 no mark is dimmed: every drawing at full strength, a solid border on each, and F9q’s dimming gone from the stylesheet',
    [x, tg, gm, sea].every((k) => Number(k.glyphOpacity) === 1 && k.border === 'solid') && oldDimming === 0 && !GLOBAL_CSS.includes('place-off'),
    `opacity X ${x.glyphOpacity}, Telegram ${tg.glyphOpacity}, GMGN ${gm.glyphOpacity}, OpenSea ${sea.glyphOpacity}; borders ${[x, tg, gm, sea].map((k) => k.border).join(', ')}; dimming rules left in the stylesheet: ${oldDimming}, the text "place-off" anywhere in it: ${GLOBAL_CSS.includes('place-off')}`,
  );

  // CR-88 item 6: each mark in its platform's brand colour, X's two decided by the stylesheet's own
  // light/dark cascade and nothing else. The theme is forced here the way the site's own switch
  // forces it, `data-theme` on the root, and the painted fills are read back in both.
  {
    const root = document.documentElement;
    const savedTheme = root.getAttribute('data-theme');
    const fillsIn = (theme: string) => {
      root.setAttribute('data-theme', theme);
      const el = row();
      return { X: seen(el, 'X').fills, Telegram: seen(el, 'Telegram').fills, OpenSea: seen(el, 'OpenSea').fills, GMGN: seen(el, 'GMGN').fills };
    };
    const light = fillsIn('light');
    const dark = fillsIn('dark');
    if (savedTheme === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', savedTheme);
    // GMGN's own colours, from its file, in drawing order.
    const gmgnOwn = GMGN_SHAPES.map((s) => {
      const f = s.attrs.fill;
      if (f === 'white') return RGB.white;
      if (f === 'black') return RGB.black;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16));
      return `rgb(${r}, ${g}, ${b})`;
    });
    check(
      'CR-88 item 6: X is black on light and white on dark, through the stylesheet’s own light/dark cascade — no script decides it',
      light.X.join() === RGB.black && dark.X.join() === RGB.white && /--mark-x:\s*#000000/.test(GLOBAL_CSS) && (GLOBAL_CSS.match(/--mark-x:\s*#ffffff/g) ?? []).length === 2,
      `light ${light.X.join()}, dark ${dark.X.join()}; the token is set once on :root and once in each of the two dark blocks: ${(GLOBAL_CSS.match(/--mark-x:/g) ?? []).length} places`,
    );
    check(
      'CR-88 item 6: Telegram is #26A5E4 and OpenSea #2081E2 over a white disc, the same in either theme, so the boat reads white on both',
      light.Telegram.join() === RGB.telegram &&
        dark.Telegram.join() === RGB.telegram &&
        light.OpenSea.join() === `${RGB.white},${RGB.opensea}` &&
        dark.OpenSea.join() === `${RGB.white},${RGB.opensea}`,
      `Telegram light ${light.Telegram.join()} / dark ${dark.Telegram.join()}; OpenSea light ${light.OpenSea.join()} / dark ${dark.OpenSea.join()}`,
    );
    check(
      'CR-88 items 4 and 6: GMGN keeps its own colours in both themes — thirteen shapes, each painted the colour its own file gives it, nothing forced to currentColor and no rule in the stylesheet painting it',
      light.GMGN.join() === gmgnOwn.join() &&
        dark.GMGN.join() === gmgnOwn.join() &&
        gm.rootFill === 'none' &&
        !(mark(own, 'GMGN').querySelector('svg') as SVGSVGElement).outerHTML.includes('currentColor') &&
        !/\.mark-gmgn\s*\{[^}]*fill/.test(GLOBAL_CSS),
      `${light.GMGN.length} shapes; its own colours in light: ${light.GMGN.join() === gmgnOwn.join()}, in dark: ${dark.GMGN.join() === gmgnOwn.join()}; root fill "${gm.rootFill}"; the stylesheet paints .mark-gmgn: ${/\.mark-gmgn\s*\{[^}]*fill/.test(GLOBAL_CSS)}`,
    );
  }

  // CR-88 item 7: the sizes. The boxes are all 32 px; what differs is the drawing inside each, and
  // these four numbers are what make the visible drawings read as one set.
  const sized = [seen(own, 'X'), seen(own, 'Telegram'), seen(own, 'GMGN'), seen(own, 'OpenSea')];
  check(
    'CR-88 item 7: the four are sized by what shows, not by their boxes — X 18, Telegram 22, GMGN 16, OpenSea 28, the disc larger than X’s box because its boat is only part of it',
    sized[0].drawnAt === '18x18' && sized[1].drawnAt === '22x22' && sized[2].drawnAt === '16x16' && sized[3].drawnAt === '28x28',
    `X ${sized[0].drawnAt}, Telegram ${sized[1].drawnAt}, GMGN ${sized[2].drawnAt}, OpenSea ${sized[3].drawnAt}`,
  );
  check(
    'CR-88 item 7: GMGN’s size puts its 2-unit blocks on whole screen pixels — its drawing is a 32-unit grid, so 16 px is one screen pixel a block',
    (() => {
      const svg = mark(own, 'GMGN').querySelector('svg') as SVGSVGElement;
      const side = Number(svg.getAttribute('width'));
      return svg.getAttribute('viewBox') === '0 0 32 32' && Number.isInteger((side / 32) * 2) && side <= 30;
    })(),
    `viewBox "${(mark(own, 'GMGN').querySelector('svg') as SVGSVGElement).getAttribute('viewBox')}", drawn at ${sized[2].drawnAt} in a 32 px box with a 1 px border (30 px inside), so each 2-unit block is ${(16 / 32) * 2} screen pixel(s)`,
  );

  // Both marks that lead nowhere: a keyboard reaches each, and its word is hidden until then.
  {
    const el = row();
    const found: string[] = [];
    for (const [place, word] of [
      ['OpenSea', 'soon'],
      ['GMGN', 'at launch'],
    ]) {
      const m = mark(el, place);
      const wordEl = m.querySelector('.place-word') as HTMLElement;
      const before = getComputedStyle(wordEl).opacity;
      try {
        window.focus();
      } catch {
        /* the test page cannot take the window's focus: handled below */
      }
      m.focus();
      const focused = document.activeElement === m;
      // A browser paints `:focus` only while the page itself holds the window's focus, which a
      // headless test page does not always have. So the rule that shows the word is checked in the
      // stylesheet as well, and the review driver photographs it with a real Tab in a focused page.
      const docFocus = document.hasFocus();
      const onFocus = getComputedStyle(wordEl).opacity;
      m.blur();
      const after = getComputedStyle(wordEl).opacity;
      if (!(before === '0' && focused && m.tabIndex === 0 && wordEl.textContent === word && (docFocus ? onFocus === '1' : true) && after === '0')) {
        found.push(`${place}: before ${before}, reached ${focused}, word "${wordEl.textContent}", on focus ${onFocus}, after ${after}`);
      }
    }
    const rule = cssRules.some((r) => r instanceof CSSStyleRule && /\.place-soon:focus \.place-word/.test(r.selectorText) && r.style.opacity === '1');
    check(
      'CR-84, CR-87, CR-88 a keyboard reaches both marks that lead nowhere, each word is hidden until then, and the stylesheet shows it on focus',
      found.length === 0 && rule,
      `the page holds the window’s focus: ${document.hasFocus()}; the rule ".place-soon:focus .place-word { opacity: 1 }" is in the stylesheet: ${rule}; anything wrong: ${found.join('; ') || 'nothing'}`,
    );
  }

  // The row as the whole site renders it: once, in the footer, with the same four marks, in the
  // brand block after the page links — and in its own third column where the stylesheet has room.
  {
    const whole = document.createElement('div');
    stage.append(whole);
    render(<App />, whole);
    await new Promise((r) => setTimeout(r, 60));
    const rows = whole.querySelectorAll('.footer-places');
    const inFooter = !!whole.querySelector('footer.site-footer .footer-places');
    const places = [...whole.querySelectorAll('footer.site-footer .place')].map((e) => (e as HTMLElement).dataset.place).join(',');
    const head = (whole.querySelector('.footer-places .footer-head') as HTMLElement | null)?.textContent ?? null;
    // CR-88 item 1: one block, written once, in the brand block after the page links. Where it is
    // painted is the stylesheet's business (the media query below, and the review driver's
    // photographs at four widths); what matters here is that there is exactly one of it.
    const inBrand = !!whole.querySelector('footer.site-footer .footer-brand .footer-places');
    const inContracts = !!whole.querySelector('footer.site-footer .footer-contracts .footer-places');
    const afterLinks = !!whole.querySelector('footer.site-footer .footer-brand > nav + .footer-places, footer.site-footer .footer-brand > .footer-brand-main + .footer-places');
    const brand = (whole.querySelector('footer.site-footer .footer-brand p') as HTMLElement).textContent;
    const contracts = whole.querySelectorAll('footer.site-footer .footer-contracts > ul > li').length;
    const links = [...whole.querySelectorAll('footer.site-footer nav a')].map((a) => a.textContent).join(',');
    check(
      'CR-88 items 1, 2, 3: the whole site shows the row once, in the footer, in the brand block after the page links, headed "Official Links", with all four marks, and the rest of the footer unchanged',
      rows.length === 1 &&
        inFooter &&
        inBrand &&
        !inContracts &&
        afterLinks &&
        places === 'X,Telegram,GMGN,OpenSea' &&
        head === 'Official Links' &&
        brand === 'UpTown Token (TOWN), an experiment on Ethereum.' &&
        contracts === 7 &&
        links === 'Trade,Rewards,Stake,Stats,Docs',
      `${rows.length} row(s), in the footer: ${inFooter}, in the brand block: ${inBrand} (right after its text: ${afterLinks}), in the contracts block: ${inContracts}, marks ${places}, head "${head}", page links ${links}, ${contracts} contracts`,
    );
    // The stylesheet, not the markup, makes the third column: at 1000 px and above the brand block
    // stops being a box of its own and each part takes a column by name.
    const column = cssRules.filter((r): r is CSSMediaRule => r instanceof CSSMediaRule && /min-width:\s*1000px/.test(r.conditionText)).flatMap((r) => [...r.cssRules]);
    const ruleFor = (sel: string, prop: string) =>
      column.find((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === sel)?.style.getPropertyValue(prop) ?? null;
    check(
      'CR-88 item 1: the third column is made by the stylesheet alone — at 1000 px and up the brand block is display:contents and the places take the third column, to the right of the contracts’ second',
      ruleFor('.footer-brand', 'display') === 'contents' &&
        ruleFor('.footer-brand-main', 'grid-column') === '1' &&
        ruleFor('.footer-contracts', 'grid-column') === '2' &&
        ruleFor('.footer-places', 'grid-column') === '3' &&
        /^minmax\(0(?:px)?,\s*1fr\)\s+minmax\(0(?:px)?,\s*1\.4fr\)\s+auto$/.test(ruleFor('.footer-grid', 'grid-template-columns') ?? ''),
      `brand display ${ruleFor('.footer-brand', 'display')}; columns brand ${ruleFor('.footer-brand-main', 'grid-column')}, contracts ${ruleFor('.footer-contracts', 'grid-column')}, places ${ruleFor('.footer-places', 'grid-column')}; track list "${ruleFor('.footer-grid', 'grid-template-columns')}"`,
    );
    render(null, whole);
    whole.remove();
  }

  // CR-87: the font licence sentence is gone — from every page, not just the homepage. CR-88: so is
  // "Find UpTown". The licence files themselves stay in the published site (checked in the built
  // site by scripts/f9s-shots.mjs and by the hosting test's own file list, not here: this page is
  // not the built site).
  {
    const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
    const savedTitle = document.title;
    const pages = ['', 'trade', 'trade/sell', 'rewards', 'stake', 'stats', 'docs'];
    const found: string[] = [];
    const whole = document.createElement('div');
    stage.append(whole);
    for (const p of pages) {
      location.hash = `#/${p}`;
      render(<App />, whole);
      await settle();
      const el = !!whole.querySelector('.footer-fonts');
      const words = /SIL Open Font Licence/i.test(whole.innerHTML);
      const link = !!whole.querySelector('a[href*="OFL-"]');
      const old = /Find UpTown/i.test(whole.innerHTML);
      const head = (whole.querySelector('.footer-places .footer-head') as HTMLElement | null)?.textContent ?? null;
      if (el || words || link || old || head !== 'Official Links') found.push(`${p || 'home'} (licence element ${el}, words ${words}, link ${link}, "Find UpTown" ${old}, heading "${head}")`);
    }
    render(null, whole);
    whole.remove();
    history.replaceState(null, '', location.pathname + location.search);
    document.title = savedTitle;
    check(
      'CR-87, CR-88 item 2: every page carries the heading "Official Links", and neither "Find UpTown" nor the font licence sentence is anywhere on any of them',
      found.length === 0,
      `${pages.length} pages checked (home, trade, trade/sell, rewards, stake, stats, docs); pages that still carry something: ${found.join('; ') || 'none'}`,
    );
  }

  // The gallery keeps both states, each named and findable by the review driver.
  if (GALLERY) {
    const keep = (id: string, title: string, town?: Address | null) => {
      const h = document.createElement('p');
      h.className = 'poke-title';
      h.style.margin = '28px 0 8px';
      h.textContent = `Fixture: ${title}`;
      const d = document.createElement('div');
      d.id = id;
      stage.append(h, d);
      render(town === undefined ? <PlaceRow /> : <PlaceRow town={town} />, d);
    };
    keep('cr84-today', 'CR-88: the footer row today, with no TOWN address on Ethereum (GMGN says "at launch")');
    keep('cr84-filled', 'CR-88: the footer row with a TOWN address on Ethereum (GMGN is a link)', TOWN);
  }

  render(null, box);
  box.remove();
  style.remove();
}

// ---- F9t (CR-92 part 1): how a router names the buyer, on the Docs page -------------------------
// The item's text is written out here in full, by hand from the spec's "TownHook → Buy tally" and
// CL-28, and compared character for character with what the page shows; the example's 32 bytes are
// written out too, and compared with the `hookData` inside the transaction the site's own buy form
// builds for the same buyer.
async function cr92(base: ChainState, wallet: WalletState) {
  const style = document.createElement('style');
  style.textContent = GLOBAL_CSS;
  document.head.append(style);

  const docs = await mount(<Docs />, base, wallet, 'CR-92: the Docs page, "Things to know"');
  const know = docs.querySelector('#docs-know') as HTMLElement;
  const items = [...know.querySelectorAll(':scope ul.doc-list > li')] as HTMLElement[];
  const item = know.querySelector('li[data-item="routing"]') as HTMLElement | null;
  const at = item ? items.indexOf(item) : -1;
  const before = at > 0 ? items[at - 1].textContent : null;

  const BUYER = '0x1234567890AbcdEF1234567890aBcdef12345678';
  const WORD = '0x000000000000000000000000' + '1234567890abcdef1234567890abcdef12345678';
  const WANT =
    'For wallets, aggregators and bots. ' +
    'If you route TOWN buys for other people, pass the buyer’s address as the swap’s hookData, exactly 32 bytes: the address left-padded with zeros, as abi.encode(buyer) gives it. ' +
    'TownHook then credits the buy, and its rebate, to that address, whatever its code; that address claims the rebate itself. ' +
    'Any other hookData (another length, a zero address, anything in the first 12 bytes) is ignored. ' +
    'Without a valid one, the hook credits the router’s msgSender() when that is an ordinary wallet (no code, or an EIP-7702 delegation), else the transaction’s sender (tx.origin), so for a solver, a bundler or a contract wallet the rebate goes to the wrong place. ' +
    `For example, the buyer ${BUYER} is hookData ${WORD}.`;
  const got = item?.textContent ?? '';

  check(
    'CR-92 part 1: the Docs page’s "Things to know" carries the item for whoever routes buys for others, right after "Buy on this site", as the last item',
    !!item && at === items.length - 1 && !!before?.startsWith('Buy on this site.') && item.querySelector('strong')?.textContent === 'For wallets, aggregators and bots.',
    `the item found: ${!!item}; its place ${at + 1} of ${items.length}; the item before it: "${before?.slice(0, 40)}…"`,
  );
  check(
    'CR-92 part 1: the item’s text, character for character, states the spec’s rule — exactly 32 bytes, the address left-padded with zeros, credited whatever its code, any other hookData ignored, then msgSender() for a wallet with no code or an EIP-7702 delegation, then tx.origin',
    got === WANT,
    got === WANT ? `${got.length} characters, identical` : `got: ${got}`,
  );
  const codes = item ? [...item.querySelectorAll('code')].map((c) => c.textContent) : [];
  check(
    'CR-92 part 1: every code word is in code style, the two long hex strings may break anywhere so they fit a phone',
    JSON.stringify(codes) === JSON.stringify(['hookData', 'abi.encode(buyer)', 'hookData', 'msgSender()', 'tx.origin', BUYER, 'hookData', WORD]) &&
      [...(item?.querySelectorAll('code.break') ?? [])].map((c) => c.textContent).join(' ') === `${BUYER} ${WORD}`,
    codes.join(' | '),
  );

  // The example is 32 bytes holding the buyer in its low 20 and zeros in its upper 12, and is exactly
  // the hookData the site's own buy form puts in its swap for that buyer.
  const tx = buyTx(NETWORK, BUYER, 1n, 1n, 0n);
  const [, params] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], (tx.args as readonly [unknown, readonly `0x${string}`[]])[1][0]);
  const [swap] = decodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }] },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'minHopPriceX36', type: 'uint256' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    params[0],
  );
  const sent = (swap as { hookData: string }).hookData;
  check(
    'CR-92 part 1: the example’s hookData is 32 bytes, the upper 12 zero and the low 20 the buyer, and is byte for byte what the site’s buy form sends for that buyer',
    WORD.length === 2 + 64 && /^0x0{24}[0-9a-f]{40}$/.test(WORD) && getAddress('0x' + WORD.slice(26)) === BUYER && sent === WORD && codes[7] === sent,
    `the page: ${codes[7]}; the buy form's swap: ${sent}; ${(WORD.length - 2) / 2} bytes`,
  );

  // Nothing else in the section changed: the nine earlier items are the content module's, in order.
  const rest = items.filter((li) => li !== item).map((li) => li.textContent);
  check(
    'CR-92 part 1: the rest of "Things to know" is unchanged — the nine items of the content module, in order, then this one',
    JSON.stringify(rest) === JSON.stringify(THINGS_TO_KNOW.map((r) => `${r.title}. ${r.body}`)) && rest.length === 9 && ROUTING_NOTE.exampleBuyer === BUYER,
    `${rest.length} other items, identical: ${JSON.stringify(rest) === JSON.stringify(THINGS_TO_KNOW.map((r) => `${r.title}. ${r.body}`))}`,
  );

  if (!GALLERY) {
    render(null, docs);
    docs.remove();
  }
  style.remove();
}

// ---- F9v (CR-95 items 2 and 3): no "buy here" line on Trade; dollar figures beside every amount --
async function cr95(base: ChainState, wallet: WalletState) {
  const style = document.createElement('style');
  style.textContent = GLOBAL_CSS;
  document.head.append(style);
  const E18 = 10n ** 18n;
  const ownerWallet = { ...wallet, address: OWNER };

  // ---- item 2: the line is gone; the rest of the page is as it was ----
  {
    const el = await mount(<Trade />, base, wallet, 'CR-95 item 2: the Trade page (live)');
    const all = el.textContent ?? '';
    check(
      'CR-95 item 2: the Trade page has no "Buy here so the rebate is credited to your wallet." line: no .credit-line element and none of its words, on the buy side or the sell side',
      !el.querySelector('.credit-line') && !all.includes('Buy here so the rebate') && !/credited to your wallet/i.test(all) && !GLOBAL_CSS.includes('.credit-line'),
      `credit-line elements: ${el.querySelectorAll('.credit-line').length}; the words anywhere: ${all.includes('Buy here so the rebate')}; the stylesheet rule left: ${GLOBAL_CSS.includes('.credit-line')}`,
    );
    const docs = await mount(<Docs />, base, wallet, 'CR-95 item 2: the Docs page keeps "Buy on this site"');
    const items = [...docs.querySelectorAll('#docs-know ul.doc-list > li')].map((li) => li.textContent ?? '');
    check(
      'CR-95 item 2: the Docs page’s "Buy on this site" item and the note for wallets, aggregators and bots stay',
      items.some((t) => t.startsWith('Buy on this site.')) && items.some((t) => t.startsWith('For wallets, aggregators and bots.')),
      `${items.length} items`,
    );
  }

  // ---- the arithmetic, from a known pool price and a known ETH price ----
  const Q96 = 1n << 96n;
  const SQRT = Q96 * 10_000n; // (sqrtPriceX96 / 2^96)^2 = 10^8 TOWN per ETH: one TOWN is 10^-8 ETH, 10 gwei
  const ETH_USD = 270_000_000_000n; // $2,700.00 with Chainlink's 8 decimals
  const at = (source: PriceSource, price = ETH_USD, sqrt: bigint | null = SQRT): ChainState => ({
    ...base,
    staking: { ...base.staking, priceStatus: { ...base.staking.priceStatus, price, source } },
    pool: { sqrtPriceX96: sqrt },
  });
  const feed = at(PriceSource.Feed);
  {
    const one = usdOf(feed, ONE_TOWN, 'TOWN');
    const million = usdOf(feed, 1_000_000n * E18, 'TOWN');
    const eth = usdOf(feed, E18, 'ETH');
    const weth = usdOf(feed, E18 / 2n, 'WETH');
    const big = usdOf(feed, 1_234_500n * 10n ** 15n, 'ETH'); // 1,234.5 ETH
    check(
      'CR-95 arithmetic: sqrtPriceX96 = 2^96 × 10^4 (10^8 TOWN per ETH, 10 gwei per TOWN) and ETH at $2,700.00 give, exactly in integers, 1 TOWN = $0.000027, 1,000,000 TOWN = $27.00, 1 ETH = $2,700.00, 0.5 WETH = $1,350.00, 1,234.5 ETH = $3,333,150.00',
      one?.usd === 27_000_000_000_000n &&
        million?.usd === 27n * E18 &&
        eth?.usd === 2_700n * E18 &&
        weth?.usd === 1_350n * E18 &&
        big?.usd === 3_333_150n * E18 &&
        townPriceWei(feed) === 10_000_000_000n &&
        one.fallback === false,
      `1 TOWN ${one?.usd}, 1,000,000 TOWN ${million?.usd}, 1 ETH ${eth?.usd}, 0.5 WETH ${weth?.usd}, 1,234.5 ETH ${big?.usd} (dollars × 10^18); ${townPriceWei(feed)} wei per TOWN`,
    );
    check(
      'CR-95 format: one helper; two decimals with thousands separators, "< $0.01" below a cent, "$0.00" for nothing; TOWN’s unit price with three significant digits below a dollar',
      fmtUsd(million!.usd) === '$27.00' &&
        fmtUsd(big!.usd) === '$3,333,150.00' &&
        fmtUsd(10n ** 15n) === '< $0.01' &&
        fmtUsd(0n) === '$0.00' &&
        fmtUsd(one!.usd, true) === '$0.000027' &&
        fmtUsd(27_123_456_789_000n, true) === '$0.0000271' &&
        fmtUsd(12_349n * 10n ** 12n, true) === '$0.0123' &&
        fmtUsd(E18 / 2n, true) === '$0.50' &&
        fmtUsd(1_509n * 10n ** 15n, true) === '$1.50',
      [fmtUsd(million!.usd), fmtUsd(big!.usd), fmtUsd(10n ** 15n), fmtUsd(0n), fmtUsd(one!.usd, true), fmtUsd(27_123_456_789_000n, true), fmtUsd(12_349n * 10n ** 12n, true), fmtUsd(E18 / 2n, true), fmtUsd(1_509n * 10n ** 15n, true)].join(' | '),
    );
    // The spec's launch price (spec "Pool and launch position": tick 184,200, sqrtPriceX96 about
    // 7.916474 × 10^32, 10.016 gwei per TOWN): the same arithmetic gives 10.016 gwei and, at $2,700,
    // about $0.000027 per TOWN.
    const start = at(PriceSource.Feed, ETH_USD, 791_647_400_000_000_000_000_000_000_000_000n);
    const w = townPriceWei(start)!;
    const u = usdOf(start, ONE_TOWN, 'TOWN')!;
    check(
      'CR-95 arithmetic at the spec’s launch price (sqrtPriceX96 ≈ 7.916474 × 10^32): 10.016 gwei per TOWN, about $0.000027 per TOWN at ETH $2,700',
      w >= 10_015_000_000n && w <= 10_017_000_000n && fmtUsd(u.usd, true) === '$0.000027',
      `${w} wei per TOWN; ${fmtUsd(u.usd, true)}`,
    );
  }

  // ---- what the site reads: the pool's price through StateView, at the figures' block ----
  {
    const sv = NETWORK.uniswap!.stateView!;
    const [sqrt] = (await client.readContract({ address: sv, abi: STATEVIEW_ABI, functionName: 'getSlot0', args: [poolId(NETWORK)], blockNumber: base.blockNumber })) as readonly [bigint, number, number, number];
    const ps = base.staking.priceStatus;
    const one = usdOf(base, ONE_TOWN, 'TOWN');
    // An independent, floating-point reading of the same two numbers, to a millionth.
    const r = Number(sqrt) / 2 ** 96;
    const float = Number(ps.price) / 1e8 / (r * r);
    const exact = one ? Number(one.usd) / 1e18 : NaN;
    check(
      'CR-95 the pool’s price is read through StateView.getSlot0(poolId) with the other figures, at the same block; the live dollar price of one TOWN agrees with a floating-point reading of the same numbers',
      sqrt > 0n && base.pool.sqrtPriceX96 === sqrt && !!one && Math.abs(exact - float) / float < 1e-6,
      `StateView ${sv}, poolId ${poolId(NETWORK)}, block ${base.blockNumber}: sqrtPriceX96 ${sqrt}; ETH ${fmtUsd8(ps.price)} (source ${PriceSource[ps.source]}); 1 TOWN ${one ? fmtUsd(one.usd, true) : 'none'} (${exact} against ${float})`,
    );
  }

  // ---- beside every amount, on every page, with the feed's price ----
  const pages: [string, () => ComponentChildren, WalletState][] = [
    ['Home', () => <Home />, wallet],
    ['Trade', () => <Trade />, wallet],
    ['Trade, sell', () => <Trade sell />, wallet],
    ['Rewards', () => <Rewards />, wallet],
    ['Stake', () => <Stake />, wallet],
    ['Stats', () => <Stats />, wallet],
    ['Owner', () => <Owner />, ownerWallet],
  ];
  const usdOn = (el: HTMLElement) => [...el.querySelectorAll('.usd')] as HTMLElement[];
  {
    const counts: string[] = [];
    let every = true;
    for (const [name, node, w] of pages) {
      const el = await mount(node(), feed, w, `CR-95: ${name}, Chainlink’s price $2,700.00 (fixture)`);
      const n = usdOn(el).length;
      counts.push(`${name} ${n}`);
      every &&= n > 0 && !el.querySelector('.usd.fallback');
    }
    check('CR-95 every page shows dollar figures (Home, Trade buy and sell, Rewards, Stake, Stats, Owner), none marked as the fallback while the feed’s price is in use', every, counts.join(', '));

    const stats = await mount(<Stats />, feed, wallet, 'CR-95: Stats (fixture, feed)');
    const fig = (view: string) => stats.querySelector(`[data-view="${view}"]`) as HTMLElement | null;
    const bal = fig('eth_getBalance(Treasury)');
    const sup = fig('UpTownToken.totalSupply');
    const wantBal = `≈ ${fmtUsd(usdOf(feed, base.treasury.balance, 'ETH')!.usd)}`;
    const wantSup = `≈ ${fmtUsd(usdOf(feed, base.token.totalSupply, 'TOWN')!.usd)}`;
    const got = (el: HTMLElement | null) => (el?.querySelector('.usd') as HTMLElement | null)?.innerText.trim() ?? null;
    check(
      'CR-95 a figure keeps its amount and its unit, with the dollar estimate under it, muted: the Treasury’s ETH balance and the total supply',
      bal?.querySelector('.num')?.textContent === fmtEth(base.treasury.balance) &&
        bal?.querySelector('.unit')?.textContent === 'ETH' &&
        got(bal) === wantBal &&
        sup?.querySelector('.num')?.textContent === fmtTown(base.token.totalSupply) &&
        sup?.querySelector('.unit')?.textContent === 'TOWN' &&
        got(sup) === wantSup &&
        getComputedStyle(bal!.querySelector('.usd')!).color === getComputedStyle(bal!.querySelector('.unit')!).color &&
        parseFloat(getComputedStyle(bal!.querySelector('.usd')!).fontSize) < parseFloat(getComputedStyle(bal!.querySelector('.num')!).fontSize),
      `balance "${bal?.querySelector('.num')?.textContent} ${bal?.querySelector('.unit')?.textContent}" ${got(bal)} (want ${wantBal}); supply "${sup?.querySelector('.num')?.textContent} ${sup?.querySelector('.unit')?.textContent}" ${got(sup)} (want ${wantSup})`,
    );

    const trade = await mount(<Trade />, feed, wallet, 'CR-95: Trade with the feed’s price (fixture)');
    const line = trade.querySelector('.price-line') as HTMLElement | null;
    const lt = line ? text(line) : '';
    const balUsd = trade.querySelector('#trade-panel-buy .swap-box-top .usd') as HTMLElement | null;
    check(
      'CR-95 Trade shows TOWN’s price in dollars, from the pool’s price and the feed’s ETH price: "TOWN price ≈ $0.000027 10 gwei per TOWN in the pool at ETH $2,700.00, Chainlink’s price"; the wallet’s balance carries its estimate',
      lt === 'TOWN price ≈ $0.000027 10 gwei per TOWN in the pool at ETH $2,700.00, Chainlink’s price' &&
        balUsd?.innerText.trim() === `(≈ ${fmtUsd(usdOf(feed, wallet.ethBalance, 'ETH')!.usd)})`,
      `${lt} | balance: ${balUsd?.innerText.trim()}`,
    );
  }

  // ---- the owner's fallback price: every figure marked ----
  {
    const fb = at(PriceSource.Fallback);
    const el = await mount(<Stats />, fb, wallet, 'CR-95: Stats on the owner’s fallback price (fixture)');
    const list = usdOn(el);
    const marked = list.filter((u) => u.classList.contains('fallback') && !!u.querySelector('svg') && /fallback ETH price of \$2,700\.00/.test(u.title));
    const trade = await mount(<Trade />, fb, wallet, 'CR-95: Trade on the owner’s fallback price (fixture)');
    const lt = text(trade.querySelector('.price-line') as HTMLElement);
    const warn = getComputedStyle(trade.querySelector('.price-line .usd.fallback svg') as Element).color;
    const noticeWarn = getComputedStyle(document.documentElement).getPropertyValue('--warn-text').trim();
    check(
      'CR-95 fallback: while priceStatus() names the owner’s fallback price, every dollar figure carries the fallback notice’s warning mark and says so in its tooltip; Trade’s price line names the fallback',
      list.length > 0 && marked.length === list.length && lt.endsWith('at ETH $2,700.00, the owner’s fallback price') && !!warn && !!noticeWarn,
      `${marked.length} of ${list.length} marked; "${lt}"; mark colour ${warn} (the notice’s --warn-text ${noticeWarn})`,
    );
    check(
      'CR-95 the local chain itself runs on the owner’s fallback price (local-chain.sh sets it; the fork’s Chainlink answer is old), so the site’s own photographs show the mark',
      base.staking.priceStatus.source === PriceSource.Fallback,
      `TownStaking.priceStatus(): ${fmtUsd8(base.staking.priceStatus.price)}, source ${PriceSource[base.staking.priceStatus.source]}`,
    );
  }

  // ---- no usable price: no dollar figure anywhere ----
  {
    const found: string[] = [];
    let none = true;
    for (const [label, chain] of [
      ['source None, price 0', at(PriceSource.None, 0n)],
      ['source None, a stale price still reported', at(PriceSource.None, ETH_USD)],
    ] as const) {
      for (const [name, node, w] of pages) {
        const el = await mount(node(), chain, w, `CR-95: ${name}, no usable price, ${label} (fixture)`);
        const n = usdOn(el).length + el.querySelectorAll('[data-usd]').length;
        const approx = (el.textContent ?? '').match(/≈ \$[\d,.]+/g) ?? [];
        none &&= n === 0 && approx.length === 0;
        if (n || approx.length) found.push(`${label}, ${name}: ${n} figures, ${approx.join(' ')}`);
      }
    }
    const trade = await mount(<Trade />, at(PriceSource.None, 0n), wallet, 'CR-95: Trade with no usable price (fixture)');
    const lt = text(trade.querySelector('.price-line') as HTMLElement);
    check(
      'CR-95 hidden: when priceStatus() reports no usable price, no dollar figure appears on any page (Home, Trade buy and sell, Rewards, Stake, Stats, Owner), not even a stale one; Trade says why',
      none && lt === 'TOWN price 10 gwei per TOWN in the pool No ETH price is reported, so no dollar figures are shown.',
      found.join(' | ') || `none anywhere; Trade: "${lt}"`,
    );

    const noPool = at(PriceSource.Feed, ETH_USD, null);
    const el = await mount(<Stats />, noPool, wallet, 'CR-95: Stats with the pool’s price unread (fixture)');
    const ethFig = el.querySelector('[data-view="eth_getBalance(Treasury)"] .usd');
    const townFig = el.querySelector('[data-view="UpTownToken.totalSupply"] .usd');
    const tr = await mount(<Trade />, noPool, wallet, 'CR-95: Trade with the pool’s price unread (fixture)');
    check(
      'CR-95 hidden: without the pool’s price the TOWN figures have no dollar estimate (and Trade no TOWN price line) while the ETH figures keep theirs',
      !!ethFig && !townFig && !tr.querySelector('.price-line'),
      `ETH figure: ${!!ethFig}; TOWN figure: ${!!townFig}; price line: ${!!tr.querySelector('.price-line')}`,
    );
  }

  // ---- estimates only: nothing that builds or sends a transaction reads a dollar figure ----
  {
    const files = { 'actions.ts': ACTIONS_SRC, 'wallet.ts': WALLET_SRC, 'quick.ts': QUICK_SRC, 'amount.ts': AMOUNT_SRC };
    const hits = Object.entries(files).filter(([, src]) => /usdOf|fmtUsd\b|\bUsd\b|priceStatus|sqrtPriceX96/.test(src)).map(([f]) => f);
    check(
      'CR-95 estimates only: the files that build, check and send transactions (actions, wallet, quick amounts, typed amounts) use no dollar figure, ETH price or pool price',
      hits.length === 0,
      hits.length ? `found in ${hits.join(', ')}` : 'none of the four mentions usdOf, fmtUsd, Usd, priceStatus or sqrtPriceX96',
    );
  }

  if (!GALLERY) stage.replaceChildren();
  style.remove();
}

// ---- F9u (CR-93, CR-94, CR-95 item 1): the four sell-fee states, the reserve, calendar days and the countdown ----
async function f9u(base: ChainState, wallet: WalletState) {
  const style = document.createElement('style');
  style.textContent = GLOBAL_CSS;
  document.head.append(style);
  const E18 = 10n ** 18n;
  const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  const c = base.hook.currentCycle;
  /** Text without its spaces: with the stylesheet on, a figure's label, value and note are separate blocks. */
  const squash = (x: string) => x.replace(/\s+/g, '');
  const y = c - 1;

  // ---- 1. The countdown's target: the next midnight UTC, from launchTime and currentCycle ----
  {
    const L = 1_800_000_000; // 15 Jan 2027, 08:00 UTC
    const cases = [
      { cycle: 0, want: 1_800_057_600, words: '16 Jan 2027, 00:00 UTC' }, // the launch day lasts 16 hours
      { cycle: 3, want: 1_800_316_800, words: '19 Jan 2027, 00:00 UTC' },
    ];
    const got = cases.map((k) => ({ ...k, at: nextDayStart(L, k.cycle) }));
    check(
      'CR-94 target arithmetic: launchTime 1,800,000,000 (15 Jan 2027, 08:00 UTC) gives (launchTime / 86400 + currentCycle + 1) × 86400: the launch day ends at 16 Jan 00:00 UTC (16 hours), Day 4 at 19 Jan 00:00 UTC',
      got.every((k) => k.at === k.want && fmtDateTime(k.at) === k.words) && dayStartTime(L, 0) === L && dayStartTime(L, 3) === 1_800_230_400,
      got.map((k) => `cycle ${k.cycle}: ${k.at} (${fmtDateTime(k.at)})`).join('; ') + `; day starts ${dayStartTime(L, 0)}, ${dayStartTime(L, 3)}`,
    );
    // Live: the hook's own launchTime and currentCycle, against the Treasury's view (the next midnight once the day has rolled) and the block's own midnight.
    const t = base.treasury;
    const target = nextDayStart(base.hook.launchTime, c);
    const midnight = (Math.floor(base.blockTimestamp / 86_400) + 1) * 86_400;
    const rolled = t.nextDistributionTime > base.blockTimestamp;
    check(
      'CR-94 target (live): the next midnight from TownHook.launchTime() and currentCycle() equals the block’s next midnight and, the day having rolled, Treasury.nextDistributionTime()',
      target === midnight && (!rolled || t.nextDistributionTime === target) && fmtDateTime(target).endsWith('00:00 UTC'),
      `launchTime ${base.hook.launchTime}, currentCycle ${c} (${dayName(c)}): ${target} = ${fmtDateTime(target)}; block ${base.blockTimestamp}; nextDistributionTime ${t.nextDistributionTime}${rolled ? '' : ' (not rolled yet)'}`,
    );
    check(
      'CR-95 countdown format: "23h 08m 12s", fixed width, units so it reads as time left; screen-reader words to the minute',
      fmtCountdown(83_292) === '23h 08m 12s' &&
        fmtCountdown(59) === '0h 00m 59s' &&
        fmtCountdown(86_400) === '24h 00m 00s' &&
        fmtCountdown(-5) === '0h 00m 00s' &&
        fmtCountdownWords(83_292) === '23 hours 8 minutes' &&
        fmtCountdownWords(3_600) === '1 hour' &&
        fmtCountdownWords(59) === 'less than a minute',
      [83_292, 59, 86_400, -5].map(fmtCountdown).join(' | ') + ' || ' + [83_292, 3_600, 59].map(fmtCountdownWords).join(' | '),
    );
    check(
      'CR-94 the site calls cycle c "Day c + 1": cycle 0 is Day 1, cycle 400 is Day 401; lists and tables use the same numbers',
      dayName(0) === 'Day 1' && dayName(400) === 'Day 401' && dayName(1_233) === 'Day 1,234' && dayNumber(c) === c + 1 && listDays([0, 1, 3]) === '1, 2 and 4',
      `${dayName(0)}, ${dayName(400)}, ${dayName(1_233)}; ${listDays([0, 1, 3])}`,
    );
  }

  // ---- 2. The clock: the latest block's time, stepped forward; never back by a block's lag ----
  {
    const a = stepClock(null, 1_000, 0);
    const b = stepClock(a, 1_005, 12_000); // the new block is 7 s older than the clock's own time: keep the clock
    const c2 = stepClock(b, 1_015, 13_000); // the new block is ahead: take it
    const d = stepClock(c2, 5_000, 14_000); // more than a minute apart: take the block (a woken tab, a moved local clock)
    check(
      'CR-95 the page’s clock: starts at the block’s time, steps each second, keeps the later of its own time and a new block’s, resyncs when they are a minute apart',
      clockNow(a, 2_500) === 1_002 && clockNow(b, 12_000) === 1_012 && clockNow(c2, 13_000) === 1_015 && clockNow(d, 14_000) === 5_000 && clockNow(d, 13_000) === 5_000,
      `${clockNow(a, 2_500)}, ${clockNow(b, 12_000)}, ${clockNow(c2, 13_000)}, ${clockNow(d, 14_000)}`,
    );
  }

  // ---- 3. The header, live: the day and the countdown beside it, ticking ----
  {
    const site = document.createElement('div');
    stage.append(site);
    render(<App />, site);
    const header = () => site.querySelector('header.site-header') as HTMLElement;
    for (let i = 0; i < 100 && !header()?.querySelector('.day-chip'); i++) await settle(100);
    const chip = header().querySelector('.header-tools .day-chip') as HTMLElement;
    const line = header().querySelector('.brand .day-line') as HTMLElement;
    const shown = (el: HTMLElement) => (el.querySelector('[aria-hidden="true"]') as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();
    const t1 = shown(chip);
    const left1 = Number(chip.dataset.target) - 0;
    await settle(2_100);
    const t2 = shown(chip);
    const secs = (s: string) => {
      const m = s.match(/(\d+)h (\d\d)m (\d\d)s$/);
      return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
    };
    const target = nextDayStart(base.hook.launchTime, c);
    const sr = (chip.querySelector('.visually-hidden') as HTMLElement).textContent!;
    check(
      'CR-95 the header (live): "Day N · Hh MMm SSs" beside the day number, N = currentCycle + 1, counting down to the next midnight UTC from TownHook’s launchTime and currentCycle',
      new RegExp(`^${dayName(c)} · \\d+h \\d\\dm \\d\\ds$`).test(t1) && Number(chip.dataset.target) === target && Number(chip.dataset.cycle) === c && left1 === target,
      `"${t1}"; target ${chip.dataset.target} (${fmtDateTime(target)})`,
    );
    const drop = secs(t1) - secs(t2);
    check('CR-95 the countdown ticks each second in the page (two seconds later it reads about two seconds less)', drop >= 1 && drop <= 3, `"${t1}" then "${t2}": ${drop} s less`);
    check(
      'CR-95 screen readers: the ticking figure is hidden from them; they read the day and the time left in words, and nothing is announced as it ticks',
      chip.querySelector('[aria-hidden="true"]') !== null &&
        sr.startsWith(`${dayName(c)}. ${dayName(c + 1)} begins at midnight UTC, in `) &&
        !site.querySelector('header [aria-live]') &&
        (chip.title ?? '').includes(`${dayName(c)} ends at midnight UTC (${fmtDateTime(target)}), when ${dayName(c + 1)} begins.`),
      `"${sr}" || title "${chip.title}"`,
    );
    check(
      'CR-95 one form at every width: the chip in the header’s tools and the line under the wordmark show the same day and countdown',
      !!line && shown(line).replace(/\d\dm \d\ds$/, '') === shown(chip).replace(/\d\dm \d\ds$/, '') && line.dataset.target === chip.dataset.target,
      `chip "${shown(chip)}", line "${line ? shown(line) : 'none'}"`,
    );

    // The narrow-screen form: the header as rendered, in frames 1280, 390 and 360 px wide with the site's stylesheet.
    const html = header().outerHTML;
    const frameAt = async (width: number, theme: 'light' | 'dark') => {
      const f = document.createElement('iframe');
      f.style.cssText = `width:${width}px;height:120px;border:0;position:absolute;left:-5000px;top:0`;
      document.body.append(f);
      f.srcdoc = `<!doctype html><html data-theme="${theme}"><head><style>${GLOBAL_CSS}</style></head><body style="margin:0">${html}</body></html>`;
      await new Promise((r) => f.addEventListener('load', r, { once: true }));
      await settle(50);
      const doc = f.contentDocument!;
      const vis = (sel: string) => {
        const el = doc.querySelector(sel) as HTMLElement | null;
        return !!el && f.contentWindow!.getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
      };
      const row = doc.querySelector('.header-row') as HTMLElement;
      const dl = doc.querySelector('.day-line') as HTMLElement;
      const mark = doc.querySelector('a.wordmark') as HTMLElement;
      const out = {
        width,
        theme,
        chip: vis('.day-chip'),
        line: vis('.day-line'),
        tag: vis('.net-tag'),
        sideways: doc.documentElement.scrollWidth > width,
        rowHeight: Math.round(row.getBoundingClientRect().height),
        lineInsideRow: dl ? dl.getBoundingClientRect().bottom <= row.getBoundingClientRect().bottom + 0.5 : false,
        lineWithinMark: dl ? dl.getBoundingClientRect().width <= mark.getBoundingClientRect().width + 0.5 : false,
        colour: dl ? f.contentWindow!.getComputedStyle(dl).color : '',
      };
      f.remove();
      return out;
    };
    const wide = await frameAt(1280, 'light');
    const narrow = await frameAt(390, 'light');
    const narrowDark = await frameAt(390, 'dark');
    const tiny = await frameAt(360, 'light');
    check(
      'CR-95 narrow screens (CR-77): at 390 and 360 px, where the network tag is hidden, the day and countdown sit under the wordmark, inside the 60 px row, no wider than the wordmark, with no sideways scroll; at 1280 px they are in the tools',
      wide.chip && !wide.line && narrow.line && !narrow.chip && !narrow.tag && tiny.line && !tiny.sideways && !narrow.sideways && narrow.rowHeight === 60 && narrow.lineInsideRow && narrow.lineWithinMark && narrowDark.line && narrowDark.colour !== narrow.colour,
      JSON.stringify([wide, narrow, narrowDark, tiny]),
    );
    render(null, site);
    site.remove();
  }

  // ---- 4. At the boundary: the countdown rests at 0 until a read brings the next day ----
  {
    const target = nextDayStart(base.hook.launchTime, c);
    const now = Date.now();
    const read = async (cycle: number, clock: ChainClock, label: string) => {
      const el = await mount(<DayClock place="tools" launchTime={base.hook.launchTime} cycle={cycle} clock={clock} />, base, wallet, label);
      return (el.querySelector('[aria-hidden="true"]') as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();
    };
    const before = await read(c, { ts: target - 2, atMs: now }, 'DayClock two seconds before midnight');
    const at = await read(c, { ts: target - 2, atMs: now - 2_500 }, 'DayClock at midnight, before the next read');
    const later = await read(c, { ts: target - 2, atMs: now - 30_000 }, 'DayClock 28 s after midnight, before the next read');
    const next = await read(c + 1, { ts: target, atMs: now }, 'DayClock after the read that brings the next day');
    const next2 = await read(c + 1, { ts: target + 1, atMs: now }, 'DayClock one second into the next day');
    check(
      'CR-95 the display at a boundary: "0h 00m 02s" before midnight; at midnight "0h 00m 00s", same day, until the next read; then the next day counts down from its own midnight (24h 00m 00s, 23h 59m 59s)',
      before === `${dayName(c)} · 0h 00m 02s` &&
        at === `${dayName(c)} · 0h 00m 00s` &&
        later === `${dayName(c)} · 0h 00m 00s` &&
        next === `${dayName(c + 1)} · 24h 00m 00s` &&
        next2 === `${dayName(c + 1)} · 23h 59m 59s`,
      [before, at, later, next, next2].join(' | '),
    );
  }

  // ---- 5. Trade: the sell-fee message in each of the four states of sellFeeShares() ----
  const S = {
    burn: { burnedBps: 200, reserveBps: 0, ethBps: 0 },
    half: { burnedBps: 100, reserveBps: 100, ethBps: 0 },
    eth: { burnedBps: 0, reserveBps: 0, ethBps: 200 },
    split: { burnedBps: 0, reserveBps: 100, ethBps: 100 },
  };
  const D = 450; // a day after 401: cycle 450 is Day 451
  /** The live figures with the sell fee's state set by hand, and yesterday's two figures. */
  const state = (shares: typeof S.burn, o: { cycle?: number; burned?: bigint; pot?: bigint; exhausted?: boolean; supply?: bigint } = {}): ChainState => {
    const cy = o.cycle ?? c;
    return {
      ...base,
      token: { ...base.token, totalSupply: o.supply ?? base.token.totalSupply },
      hook: { ...base.hook, currentCycle: cy, sellFeeShares: shares, sellFeeInEth: shares.ethBps === 200, burned: { [cy - 1]: o.burned ?? 0n, [cy]: 0n } },
      rewards: { ...base.rewards, currentCycle: cy, emissionEstimate: { [cy - 1]: o.pot ?? 667_925n * E18 }, reserveExhausted: o.exhausted ?? false },
    };
  };
  const sellLine = async (chain: ChainState, label: string) => {
    const el = await mount(<Trade sell />, chain, wallet, label);
    const box = el.querySelector('.sell-mode') as HTMLElement;
    return { line: text(box), state: box.dataset.state, view: box.dataset.view };
  };
  const S1 = 'From Day 401 half of the fee is burned and the other half refills the rebate reserve, which pays the buyers’ rebates.';
  const S2 = 'The burn floor is reached: the supply is at 100,000,000 TOWN, so nothing more is burned and every sell pays 1% in TOWN to the rebate reserve and 1% in ETH to the treasury.';
  {
    const a = await sellLine(state(S.burn), 'Trade, Sell: (200, 0, 0), burned (fixture)');
    const b = await sellLine(state(S.half, { cycle: D }), 'Trade, Sell: (100, 100, 0), from Day 401 (fixture: Day 451)');
    const e = await sellLine(state(S.eth, { burned: 750_000n * E18, pot: 600_000n * E18 }), 'Trade, Sell: (0, 0, 200), in ETH (fixture)');
    const f = await sellLine(state(S.split, { supply: base.hook.BURN_FLOOR }), 'Trade, Sell: (0, 100, 100), at the burn floor (fixture)');
    check(
      'CR-93 Trade, (200, 0, 0): "2% in TOWN, burned" and the owner’s CR-80 sentence, word for word, with no day-401 sentence',
      a.state === 'burn' &&
        a.line === `Today’s sell fee: 2% in TOWN, burned Yesterday (${dayName(y)}) burned 0 TOWN and paid 667,925 TOWN in rebates: inflation exceeded deflation, so today the fee is burned.`,
      a.line,
    );
    check(
      'CR-93 Trade, (100, 100, 0) from Day 401: "2% in TOWN: half burned, half to the rebate reserve", the CR-80 figures, "so today the fee is in TOWN", and the new day-401 sentence',
      b.state === 'burn-reserve' &&
        b.line ===
          `Today’s sell fee: 2% in TOWN: half burned, half to the rebate reserve Yesterday (Day 450) burned 0 TOWN and paid 667,925 TOWN in rebates: inflation exceeded deflation, so today the fee is in TOWN. ${S1}` &&
        reserveShareSentence(state(S.half, { cycle: D })) === S1,
      b.line,
    );
    check(
      'CR-93 Trade, (0, 0, 200): "2% in ETH, to the treasury" and the CR-80 ETH sentence, word for word',
      e.state === 'eth' &&
        e.line === `Today’s sell fee: 2% in ETH, to the treasury Yesterday (${dayName(y)}) burned 750,000 TOWN and paid 600,000 TOWN in rebates: it burned more than it paid, so today the fee is in ETH.`,
      e.line,
    );
    check(
      'CR-93 Trade, (0, 100, 100) at the floor: "1% in TOWN to the rebate reserve, 1% in ETH to the treasury" and the new floor sentence; the message reads sellFeeShares()',
      f.state === 'split' && f.line === `Today’s sell fee: 1% in TOWN to the rebate reserve, 1% in ETH to the treasury ${S2}` && (f.view ?? '').startsWith('TownHook.sellFeeShares;'),
      `${f.line} || data-view ${f.view}`,
    );
    // The split state comes from sellFeeShares(), not from sellFeeInEth(), which is no longer true at the floor (CR-93).
    const g = await sellLine({ ...state(S.split, { supply: base.hook.BURN_FLOOR }), hook: { ...state(S.split, { supply: base.hook.BURN_FLOOR }).hook, sellFeeInEth: false } }, 'split, sellFeeInEth false');
    const h = await sellLine({ ...state(S.burn), hook: { ...state(S.burn).hook, sellFeeInEth: true } }, '(200, 0, 0) with sellFeeInEth true');
    check('CR-93 the state is read from sellFeeShares() alone: split with sellFeeInEth() false; "burned" whatever sellFeeInEth() says', g.state === 'split' && h.state === 'burn', `${g.state}, ${h.state}`);
    const r1 = await sellLine(state(S.burn, { burned: 10n ** 30n, exhausted: true }), 'reserve spent, before Day 401');
    const r2 = await sellLine(state(S.half, { cycle: D, burned: 10n ** 30n, exhausted: true }), 'reserve spent, from Day 401');
    check(
      'CR-93 the reserve-spent case: before Day 401 the CR-80 sentence word for word; from Day 401 "the fee is in TOWN" and the day-401 sentence',
      r1.line.endsWith('The rebate reserve is spent, so the fee is burned until the supply reaches 100,000,000 TOWN.') &&
        r2.line.endsWith(`The rebate reserve is spent, so the fee is in TOWN until the supply reaches 100,000,000 TOWN. ${S1}`),
      `${r1.line} || ${r2.line}`,
    );
    const first = await sellLine({ ...state(S.burn, { cycle: 0 }), hook: { ...state(S.burn, { cycle: 0 }).hook, burned: { 0: 0n } }, rewards: { ...state(S.burn, { cycle: 0 }).rewards, emissionEstimate: {} } }, 'the launch day');
    check('CR-93 the first-day case, word for word: "Day 1 has no day before it, so the fee is burned."', first.line === 'Today’s sell fee: 2% in TOWN, burned Day 1 has no day before it, so the fee is burned.', first.line);
    const st = await mount(<Stats />, state(S.split, { supply: base.hook.BURN_FLOOR }), wallet, 'Stats, at the floor (fixture)');
    const st2 = await mount(<Stats />, state(S.half, { cycle: D }), wallet, 'Stats, from Day 401 (fixture)');
    check(
      'CR-93 Stats "Sell fee today": the same headline and sentence (one function), from TownHook.sellFeeShares',
      squash(text(st)).includes(squash(`Sell fee today 1% in TOWN to the rebate reserve, 1% in ETH to the treasury ${S2}`)) &&
        squash(text(st2)).includes(squash(`Sell fee today 2% in TOWN: half burned, half to the rebate reserve`)) &&
        text(st2).includes(S1) &&
        !!st.querySelector('[data-view="TownHook.sellFeeShares"]'),
      text(st).match(/Sell fee today.*?treasury\./)?.[0] ?? '',
    );
  }

  // ---- 6. The sell form's fee rows and the estimate, in each state ----
  {
    const amount = 1_000_000n * E18;
    const q = await quoteSell(client, NETWORK, amount);
    const typeIn = (el: HTMLElement, sel: string, v: string) => {
      const input = el.querySelector(sel) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const rowsFor = async (chain: ChainState, label: string) => {
      const el = await mount(<Trade sell />, chain, wallet, label);
      typeIn(el, '#sell-town', '1000000');
      for (let i = 0; i < 60; i++) {
        await settle(100);
        const out = (el.querySelector('#trade-panel-sell .swap-output') as HTMLElement).textContent!.trim();
        if (out !== '…' && out !== '0') break;
      }
      return { rows: plain(() => text(el.querySelector('#trade-panel-sell .swap-rows') as HTMLElement)), out: (el.querySelector('#trade-panel-sell .swap-output') as HTMLElement).textContent!.trim() };
    };
    const a = await rowsFor(state(S.burn), 'sell 1,000,000 TOWN, (200, 0, 0)');
    const b = await rowsFor(state(S.half, { cycle: D }), 'sell 1,000,000 TOWN, (100, 100, 0)');
    const e = await rowsFor(state(S.eth), 'sell 1,000,000 TOWN, (0, 0, 200)');
    const f = await rowsFor(state(S.split, { supply: base.hook.BURN_FLOOR }), 'sell 1,000,000 TOWN, (0, 100, 100)');
    const ethFee2 = fmtEth((q * 200n) / 9_800n, 6);
    const ethFee1 = fmtEth((q * 100n) / 9_900n, 6);
    check(
      'CR-93 the fee rows follow the state (1,000,000 TOWN sold): 20,000 TOWN burned; 20,000 TOWN, 10,000 burned and 10,000 to the reserve; ≈ 2% of the ETH; 10,000 TOWN to the reserve and ≈ 1% of the ETH. Pool fee on what the pool swaps: 4,900, 4,900, 5,000, 4,950 TOWN',
      a.rows.includes('Sell fee (2%, burned) 20,000 TOWN Pool fee (0.5%, to the locked liquidity) 4,900 TOWN') &&
        b.rows.includes('Sell fee (2%: half burned, half to the rebate reserve) 20,000 TOWN 10,000 burned, 10,000 to the reserve Pool fee (0.5%, to the locked liquidity) 4,900 TOWN') &&
        e.rows.includes(`Sell fee (2% of the ETH, to the treasury) ≈ ${ethFee2} ETH Pool fee (0.5%, to the locked liquidity) 5,000 TOWN`) &&
        f.rows.includes(`Sell fee in TOWN (1%, to the rebate reserve) 10,000 TOWN Sell fee in ETH (1% of the ETH, to the treasury) ≈ ${ethFee1} ETH Pool fee (0.5%, to the locked liquidity) 4,950 TOWN`) &&
        !/burned/.test(e.rows + f.rows),
      [a.rows, b.rows, e.rows, f.rows].map((r) => r.replace(/ Minimum received.*$/, '')).join(' || '),
    );
    // The arithmetic on its own, including the sell that reaches the floor (its whole 2% in TOWN: room burned, the rest to the reserve) and an odd fee.
    const nearFloor = (shares: typeof S.burn) => state(shares, { supply: base.hook.BURN_FLOOR + 5_000n * E18, cycle: shares === S.half ? D : c });
    const x1 = sellFees(nearFloor(S.burn), amount, null);
    const x2 = sellFees(nearFloor(S.half), amount, null);
    const odd = sellFees(state(S.half, { cycle: D }), 150n, null); // fee 3 units: 1 burned, 2 to the reserve (the last unit goes to the reserve)
    const sp = sellFees(state(S.split, { supply: base.hook.BURN_FLOOR }), amount, 990_000n);
    const et = sellFees(state(S.eth), amount, 980_000n);
    check(
      'CR-93 sellFees(): the sell that reaches the floor pays its whole 2% in TOWN (5,000 burned, 15,000 to the reserve, before and from Day 401); an odd fee sends its last unit to the reserve; split 1% + 1% (received 990,000 → 10,000 of ETH); ETH 2% (received 980,000 → 20,000)',
      x1.townFee === 20_000n * E18 && x1.burned === 5_000n * E18 && x1.toReserve === 15_000n * E18 && x1.reachesFloor && x1.ethFee === 0n &&
        x2.townFee === 20_000n * E18 && x2.burned === 5_000n * E18 && x2.toReserve === 15_000n * E18 && x2.reachesFloor &&
        odd.townFee === 3n && odd.burned === 1n && odd.toReserve === 2n &&
        sp.townFee === 10_000n * E18 && sp.burned === 0n && sp.toReserve === 10_000n * E18 && sp.ethFee === 10_000n && sp.poolFee === 4_950n * E18 &&
        et.townFee === 0n && et.ethFee === 20_000n && et.poolFee === 5_000n * E18,
      JSON.stringify({ x1, x2, odd, sp, et }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
    );
    const cross = await rowsFor(nearFloor(S.burn), 'sell 1,000,000 TOWN with 5,000 TOWN left above the floor');
    check(
      'CR-93 the sell that reaches the floor is shown: "Sell fee (2%, in TOWN) 20,000 TOWN 5,000 burned, 15,000 to the reserve: this sale reaches the burn floor"',
      cross.rows.includes('Sell fee (2%, in TOWN) 20,000 TOWN 5,000 burned, 15,000 to the reserve: this sale reaches the burn floor'),
      cross.rows.replace(/ Minimum received.*$/, ''),
    );

    // The estimate itself comes from Uniswap's quoter, which runs the swap through TownHook, so it has
    // every fee off in every state. Shown on the real contracts with read-only eth_call overrides (no
    // transaction): the supply set at the floor (UpTownToken's total-supply slot, checked first), and
    // the block's time moved 400 days on.
    const TOWN_ADDR = k.UpTownToken;
    const slot2 = await client.getStorageAt({ address: TOWN_ADDR, slot: pad(toHex(2)) });
    const supplyAtSlot = BigInt(slot2 ?? '0x0') === base.token.totalSupply;
    const atFloor = [{ address: TOWN_ADDR, stateDiff: [{ slot: pad(toHex(2)), value: pad(toHex(base.hook.BURN_FLOOR)) }] }];
    const block = await client.getBlock();
    const later = { time: block.timestamp + 400n * 86_400n };
    const quoteWith = async (amt: bigint, floor: boolean, after: boolean) => {
      const data = encodeFunctionData({ abi: QUOTER_ABI, functionName: 'quoteExactInputSingle', args: [{ poolKey: poolKey(NETWORK), zeroForOne: false, exactAmount: amt, hookData: '0x' }] });
      const r = await client.call({ to: NETWORK.uniswap!.v4Quoter, data, stateOverride: floor ? atFloor : undefined, blockOverrides: after ? later : undefined });
      return (decodeFunctionResult({ abi: QUOTER_ABI, functionName: 'quoteExactInputSingle', data: r.data! }) as readonly [bigint, bigint])[0];
    };
    const sharesWith = async (floor: boolean, after: boolean) => {
      const r = await client.call({ to: k.TownHook, data: encodeFunctionData({ abi: HOOK_ABI, functionName: 'sellFeeShares' }), stateOverride: floor ? atFloor : undefined, blockOverrides: after ? later : undefined });
      return (decodeFunctionResult({ abi: HOOK_ABI, functionName: 'sellFeeShares', data: r.data! }) as readonly bigint[]).join(',');
    };
    // 990,000 TOWN before Day 401 and 980,000 at the floor both leave the pool 970,200 TOWN to swap, so the pool pays out the same ETH.
    const burnQ = await quoteWith(990_000n * E18, false, false);
    const splitQ = await quoteWith(980_000n * E18, true, false);
    const laterQ = await quoteWith(990_000n * E18, false, true);
    const sh = [await sharesWith(false, false), await sharesWith(false, true), await sharesWith(true, false)];
    check(
      'CR-93 the estimate is right in every state (read-only overrides on the real contracts): at the floor sellFeeShares() is (0, 100, 100) and the quoter takes 1% of the ETH off; 400 days on it is (100, 100, 0) and the estimate is the same as before Day 401',
      supplyAtSlot && sh[0] === '200,0,0' && sh[1] === '100,100,0' && sh[2] === '0,100,100' && splitQ === burnQ - (burnQ * 100n) / 10_000n && laterQ === burnQ,
      `slot 2 holds totalSupply: ${supplyAtSlot}; shares now ${sh[0]}, +400 days ${sh[1]}, at the floor ${sh[2]}; 990,000 TOWN now ${burnQ} wei; 980,000 TOWN at the floor ${splitQ} wei (want ${burnQ - (burnQ * 100n) / 10_000n}); 990,000 TOWN +400 days ${laterQ} wei`,
    );
  }

  // ---- 7. Rewards: the reserve available, the empty notice, the schedule ----
  {
    const r = base.rewards;
    const liveAvail = (await client.readContract({ address: k.BuyerRewards, abi: REWARDS_ABI, functionName: 'available', blockNumber: base.blockNumber })) as bigint;
    const live = await mount(<Rewards />, base, wallet, 'Rewards (live)');
    const lt = text(live);
    check(
      'CR-93 Rewards (live): BuyerRewards.available() is read with the other figures; with ' + fmtTown(liveAvail) + ' TOWN available neither reserve notice shows',
      r.available === liveAvail && !lt.includes('The rebate reserve is nearly spent') && !lt.includes('The rebate reserve is empty'),
      `available ${r.available} (read again: ${liveAvail}); reserveExhausted ${r.reserveExhausted}`,
    );
    const low = await mount(<Rewards />, { ...base, rewards: { ...r, available: 1_000_000n * E18 } }, wallet, 'Rewards, 1,000,000 TOWN available (fixture)');
    const lowT = plain(() => text(low));
    check(
      'CR-93 low reserve (fixture): "nearly spent" with the TOWN available() reports',
      lowT.includes('The rebate reserve is nearly spent 1,000,000 TOWN remain, less than the next ten days’ limits') && !!low.querySelector('.notice [data-view="BuyerRewards.available"]'),
      lowT.match(/The rebate reserve is nearly spent.*?first\./)?.[0] ?? lowT.slice(0, 200),
    );
    const empty = await mount(<Rewards />, { ...base, rewards: { ...r, available: 0n, reserveExhausted: true } }, wallet, 'Rewards, the reserve empty (fixture)');
    const et = text(empty);
    check(
      'CR-93 empty reserve (fixture): its own notice — rebates pause until TOWN arrives; a day settled while it is empty gets nothing; no "nearly spent"',
      et.includes('The rebate reserve is empty') &&
        et.includes('so rebates pause until TOWN arrives') &&
        et.includes('A day settled while the reserve is empty gets nothing, even if TOWN arrives later') &&
        !et.includes('nearly spent'),
      et.match(/The rebate reserve is empty.*?full\./)?.[0] ?? et.slice(0, 300),
    );
    const det = live.querySelector('details') as HTMLDetailsElement;
    det.open = true;
    await settle();
    const rows = [...live.querySelectorAll('.details-body table tbody tr')].map((tr) => [...tr.children].map((td) => (td as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
    const want = [
      ['1–100', '2,500,000', '50%'],
      ['101–200', '1,250,000', '75%'],
      ['201–300', '625,000', '87.5%'],
      ['301–400', '312,500', '93.75%'],
      ['401–500', '156,250', '96.88%'],
      ['501–600', '78,125', '98.44%'],
      ['601–700', '39,062.5', '99.22%'],
      ['701 on', '25,000', 'the rest, then what arrives'],
    ];
    const body = plain(() => text(live.querySelector('.details-body') as HTMLElement));
    check(
      'CR-93 the schedule: eight rows on calendar day numbers, the limits read from BuyerRewards.cap() (39,062.5 for days 601–700, 25,000 from day 701), the shares of the 500,000,000 launch funding',
      JSON.stringify(rows.map((x) => [x[0].replace(/\s*Now$/, ''), x[1], x[2]])) === JSON.stringify(want) && rows[epochIndexOf(c)][0].endsWith('Now'),
      JSON.stringify(rows),
    );
    check(
      'CR-93 the schedule’s heading and notes: "halves every 100 days, then 25,000 TOWN a day", the launch funding, and that the reserve can be topped up',
      body.includes('Daily limit: halves every 100 days, then 25,000 TOWN a day') &&
        body.includes('Half the 500,000,000 TOWN the reserve was funded with at launch is scheduled for the first 100 days.') &&
        body.includes('Launch funding used by the end') &&
        body.includes('The reserve can be topped up: from Day 401 half of every sell fee paid in TOWN goes to it, at the burn floor 1% of every sell does, and anyone can send it TOWN.'),
      body.slice(body.indexOf('Daily limit'), body.indexOf('Daily limit') + 420),
    );
    check(
      'CR-94 Rewards on calendar days: "Today, Day N", rebates open on Day N + 1 "from midnight UTC"; the rule names calendar days and the shorter launch day',
      lt.includes(`Today, ${dayName(c)}`) &&
        lt.includes(`Today’s rebates open on ${dayName(c + 1)} From midnight UTC, when the next day begins.`) &&
        (live.textContent ?? '').includes('Days are calendar days in UTC, from midnight to midnight; Day 1, the launch day, began at launch and was shorter.'),
      lt.match(/Today’s rebates open on.*?begins\./)?.[0] ?? '',
    );
  }

  // ---- 8. Stats: the reserve available, the next payout at a midnight, the day's end ----
  {
    const st = await mount(<Stats />, base, wallet, 'Stats (live)');
    const t = plain(() => text(st)).replace(/(\d)TOWN/g, '$1 TOWN');
    const avail = figText(st, 'BuyerRewards.available');
    check(
      'CR-93 Stats: "Rebate reserve available" is BuyerRewards.available(); "Rebates emitted" stays; the floor note names the split',
      avail === fmtTown(base.rewards.available) &&
        t.includes('Rebate reserve available') &&
        !t.includes('Rebate reserve remaining') &&
        figText(st, 'BuyerRewards.totalEmitted') === fmtTown(base.rewards.totalEmitted) &&
        t.includes('from there every sell pays 1% in TOWN to the rebate reserve and 1% in ETH to the treasury.'),
      `available ${avail}`,
    );
    const target = nextDayStart(base.hook.launchTime, c);
    check(
      'CR-94 Stats: "Next payout" shows a midnight UTC (Treasury.nextDistributionTime) and today’s figures keep counting until the same midnight',
      (base.treasury.nextDistributionTime <= base.blockTimestamp || t.includes(`${fmtDateTime(base.treasury.nextDistributionTime)}, the start of ${dayName(c + 1)}`)) &&
        t.includes(`Today’s figures keep counting until ${dayName(c)} ends on ${fmtDateTime(target)}.`) &&
        t.includes('Trigger today’s payout'),
      t.match(/Next payout.*?Day \d+/)?.[0] ?? '',
    );
  }

  // ---- 9. Docs: the rebates and the burn ----
  {
    const el = await mount(<Docs />, base, wallet, 'Docs (live)');
    const item = (id: string) => text(el.querySelector(`[data-item="${id}"]`) as HTMLElement);
    check(
      'CR-93, CR-94 Docs, rebates: the reserve and its top-ups, calendar days with a shorter launch day, the 39,062.5 and 25,000 limits, the empty reserve',
      item('reserve').includes('500,000,000 TOWN at launch') &&
        item('reserve').includes('from Day 401 half of every sell fee paid in TOWN, at the burn floor 1% of every sell, and any TOWN anyone sends it') &&
        item('days').startsWith('Days are calendar days in UTC: each runs from midnight to midnight UTC. Day 1, the launch day, began at launch, so it was shorter than 24 hours.') &&
        item('limit').includes('halving every 100 days down to 39,062.5 for days 601 to 700, then 25,000 TOWN a day from day 701') &&
        item('empty').includes('a day settled while it is empty gets nothing'),
      ['reserve', 'days', 'limit', 'empty'].map(item).join(' || '),
    );
    check(
      'CR-93 Docs, the sell fee: burned; from Day 401 half to the reserve; the ETH day; the floor (the sell that reaches it, then 1% + 1%)',
      item('sell-fee') === 'Every sell pays a 2% fee, in TOWN, and it is burned. From Day 401 half of it is burned and the other half goes to the rebate reserve, so sells help pay later rebates.' &&
        item('eth-day').startsWith('On a day after one that burned more TOWN than it paid out in rebates, the whole 2% goes to the treasury in ETH instead') &&
        item('floor').includes('The sell that reaches the floor pays its whole 2% in TOWN: what fits above the floor is burned and the rest goes to the rebate reserve. From then on every sell pays 1% in TOWN to the rebate reserve and 1% in ETH to the treasury.'),
      ['sell-fee', 'eth-day', 'floor'].map(item).join(' || '),
    );
  }

  // ---- 10. Item 6: no file reads RESERVE() or says 78,125, "24-hour" or "counted from launch" ----
  {
    const hits: string[] = [];
    for (const [f, src] of Object.entries(SITE_SOURCES)) {
      for (const [name, re] of [
        ['RESERVE()', /\bRESERVE\(\)|\bRESERVE'\)|rewards\.RESERVE\b/],
        ['78,125', /78,125|78125/],
        ['24-hour', /24-hour/i],
        ['counted from launch', /counted from launch/i],
      ] as [string, RegExp][])
        if (re.test(src)) hits.push(`${f}: ${name}`);
    }
    check(
      'CR-93, CR-94 the site’s source: no file reads RESERVE() or says 78,125, "24-hour" or "counted from launch"; the ABI has sellFeeShares, RESERVE_FEE_START and available',
      hits.length === 0 &&
        HOOK_ABI.some((x) => x.type === 'function' && x.name === 'sellFeeShares') &&
        HOOK_ABI.some((x) => x.type === 'function' && x.name === 'RESERVE_FEE_START') &&
        REWARDS_ABI.some((x) => x.type === 'function' && x.name === 'available') &&
        !REWARDS_ABI.some((x) => x.type === 'function' && (x.name as string) === 'RESERVE'),
      hits.length ? hits.join('; ') : `${Object.keys(SITE_SOURCES).length} files searched; none`,
    );
  }

  if (!GALLERY) stage.replaceChildren();
  style.remove();
}

/** The schedule row a cycle is in (0 to 7). */
const epochIndexOf = (cycle: number) => Math.min(7, Math.floor(cycle / 100));


// ---- F12a (CR-86, CR-98): the three states, not deployed / deployed not launched / launched --------
// The live chain is launched while these tests run (`npm test` reads it), so the "deployed, not
// launched" state is rendered from a fixture made of the live chain's own constants, exactly the
// fields reads.ts reads before the launch (`PrelaunchState`), with the owner's views saying "not
// launched". The real read before the launch is photographed and checked against the Deployer's
// not-launched local chain by scripts/f12a-shots.mjs. Each state is rendered through `PageView`, the
// same switch the site uses for every page, so the state decides the page exactly as on the site.
// A network fixture with Etherscan stands for mainnet, so the explorer links and the note beside
// them can be seen (the local chain has no explorer).
async function f12a(base: ChainState, wallet: WalletState, o: OwnerState, live: { prelaunch: unknown }) {
  check('F12a launched: the live read has every figure and no "before the launch" figures (prelaunch null)', live.prelaunch === null && base.hook.launchTime > 0);

  const prelaunch: PrelaunchState = {
    blockTimestamp: base.blockTimestamp,
    blockNumber: base.blockNumber,
    launcherBalance: base.token.INITIAL_SUPPLY,
    token: { totalSupply: base.token.INITIAL_SUPPLY, INITIAL_SUPPLY: base.token.INITIAL_SUPPLY },
    hook: {
      BUY_FEE_BPS: base.hook.BUY_FEE_BPS,
      ANTI_SNIPE_START_BPS: base.hook.ANTI_SNIPE_START_BPS,
      ANTI_SNIPE_DURATION: base.hook.ANTI_SNIPE_DURATION,
      BURN_FLOOR: base.hook.BURN_FLOOR,
      RESERVE_FEE_START: base.hook.RESERVE_FEE_START,
    },
    rewards: {
      CLAIM_FEE_BPS: base.rewards.CLAIM_FEE_BPS,
      RATE_BASE_BPS: base.rewards.RATE_BASE_BPS,
      RATE_BUY_SPAN_BPS: base.rewards.RATE_BUY_SPAN_BPS,
      RATE_SELL_SPAN_BPS: base.rewards.RATE_SELL_SPAN_BPS,
      LEAN_CYCLES: base.rewards.LEAN_CYCLES,
      cap: Object.fromEntries([0, 100, 200, 300, 400, 500, 600, 700].map((c) => [c, base.rewards.cap[c]])),
    },
    treasury: {
      spendBps: base.treasury.spendBps,
      MAX_SPEND_BPS: base.treasury.MAX_SPEND_BPS,
      OWNER_ETH_BPS: base.treasury.OWNER_ETH_BPS,
      MIN_DISTRIBUTION: base.treasury.MIN_DISTRIBUTION,
      OWNER_DELAY: base.treasury.OWNER_DELAY,
      APPLY_WINDOW: base.treasury.APPLY_WINDOW,
      staking: base.treasury.staking,
    },
    staking: { address: base.staking.address, tierUsd: base.staking.tierUsd, tierWeight: base.staking.tierWeight, TOTAL_WEIGHT: base.staking.TOTAL_WEIGHT, STREAM_LENGTH: base.staking.STREAM_LENGTH },
    lpVault: { lockDuration: base.lpVault.lockDuration },
  };
  const preOwner: OwnerState = { ...o, launcher: { ...o.launcher, launched: false }, lpVault: { ...o.lpVault, tokenId: 0n, unlockTime: 0 } };
  // Ethereum, as a network fixture: the local deployment's addresses with mainnet's explorer.
  const ETH_NET: Network = { ...NETWORK, chainId: 1 as ChainId, name: 'Ethereum', explorer: 'https://etherscan.io', explorerName: 'Etherscan', local: false, testWallets: [] };
  const NONE_NET: Network = { ...NETWORK, deployment: null, stakingContracts: [] };
  const notLaunched = (network: Network): Partial<AppState> => ({ network, prelaunch, owner: preOwner, data: { state: 'not-launched', error: null, readAt: Date.now() } });
  const PAGES = ['', 'trade', 'rewards', 'stake', 'stats', 'docs', 'owner'];
  const pageName = (p: string) => p || 'home';
  const ownerAccount = { ...wallet, address: OWNER };
  const zeros = (t: string) => t.match(/(?:^|[^\d.,])0(?:\.0+)? (?:TOWN|ETH|WETH)\b/g) ?? [];

  // 1. Not deployed: every live page says so; Home and the footer too; nothing of the launch states.
  {
    const seen: string[] = [];
    let ok = true;
    for (const p of PAGES) {
      const el = await mount(<PageView page={p} />, null, null, `F12a not deployed: ${pageName(p)}`, { network: NONE_NET, owner: null, data: { state: 'not-deployed', error: null, readAt: null } });
      const t = text(el);
      const says = /Not deployed on Local test chain yet|not deployed on this network yet/i.test(t);
      seen.push(`${pageName(p)}: ${says ? 'says not deployed' : t.slice(0, 80)}`);
      ok &&= says && !el.querySelector('[data-state="not-launched"], .launch-line, .source-note, .usd');
    }
    const foot = await mount(<FooterContracts />, null, null, 'F12a not deployed: footer', { network: NONE_NET, data: { state: 'not-deployed', error: null, readAt: null } });
    ok &&= text(foot).includes('Not deployed on Local test chain yet') && !foot.querySelector('.source-note');
    check('F12a not deployed: every page (Home, Trade, Rewards, Stake, Stats, Docs, Owner) and the footer say the contracts are not deployed; no launch line, no source note, no dollar figure', ok, seen.join(' | '));
  }

  // 2. Deployed, not launched, on "Ethereum": each page's form before the launch.
  {
    const results: string[] = [];
    let anyUsd = false;
    let anyZero: string[] = [];
    let anyPrice = false;
    let anyDay = false;
    let sourceEverywhere = true;
    for (const p of PAGES) {
      const el = await mount(<PageView page={p} />, null, p === 'owner' ? ownerAccount : null, `F12a deployed, not launched (Ethereum): ${pageName(p)}`, {
        ...notLaunched(ETH_NET),
        account: p === 'owner' ? OWNER : null,
      });
      const t = text(el);
      anyUsd ||= !!el.querySelector('.usd') || /≈ \$/.test(t);
      anyZero = anyZero.concat(zeros(t).map((z) => `${pageName(p)}:${z.trim()}`));
      anyPrice ||= !!el.querySelector('.price-line') || /TOWN price/.test(t);
      anyDay ||= /Day \d[\d,]* ·|\bDay \d[\d,]* \d+h/.test(t) || !!el.querySelector('.day-chip, .day-line');
      // Every explorer link block carries the note beside it, between the phases.
      const verifies = [...el.querySelectorAll('.verify:not(.off)')];
      const noted = verifies.filter((v) => v.querySelector('.source-note')?.textContent === '(source published shortly before the pool opens)').length;
      if (verifies.length && noted !== verifies.length) sourceEverywhere = false;
      results.push(`${pageName(p)}: ${verifies.length} link blocks, ${noted} with the note`);
      if (p === '') {
        const line = el.querySelector('.launch-line')?.textContent ?? '';
        const list = [...el.querySelectorAll('.contract-list li')];
        const linked = list.every((li) => {
          const a = li.querySelector('a') as HTMLAnchorElement | null;
          const name = li.getAttribute('data-contract') as keyof typeof k;
          return a && a.href === `https://etherscan.io/address/${k[name]}` && li.textContent!.includes(k[name]);
        });
        check(
          'F12a not launched, Home: one line says the contracts are live on Ethereum and the pool opens soon; the seven addresses in full with their Etherscan links; the supply; no "So far" figures; the buttons lead to Docs and Stats, not to buying',
          line === 'UpTown’s contracts are live on Ethereum. The pool opens soon: trading, rebates and staking start at the launch.' &&
            el.querySelectorAll('.launch-line').length === 1 &&
            list.length === 7 &&
            linked &&
            figText(el, 'UpTownToken.totalSupply') === '1,000,000,000' &&
            figText(el, 'UpTownToken.balanceOf(Launcher)') === '1,000,000,000' &&
            !t.includes('So far') &&
            !t.includes('TOWN rebated to buyers') &&
            !!el.querySelector('.hero-cta a[href="#/docs"]') &&
            !el.querySelector('.hero-cta a[href="#/trade"]'),
          `${line} | ${list.length} contracts, linked ${linked}`,
        );
      }
      const off = [...el.querySelectorAll('.off-action')].map((x) => ({ id: (x as HTMLElement).dataset.off, disabled: !!x.querySelector('button')?.disabled, why: x.querySelector('p')?.textContent ?? '' }));
      if (p === 'trade')
        check(
          'F12a not launched, Trade: buying and selling are off, each with its sentence; no price, no quote form; the warning that no TOWN is traded anywhere yet, with TOWN’s address; the fees from TownHook’s constants',
          off.map((x) => x.id).join() === 'buy,sell' &&
            off.every((x) => x.disabled) &&
            off[0].why === 'Buying starts when the pool opens at the launch.' &&
            off[1].why === 'Selling starts when the pool opens at the launch.' &&
            !el.querySelector('input') &&
            t.includes('No TOWN is traded anywhere yet') &&
            t.includes(k.UpTownToken) &&
            t.includes(`Buy. ${fmtBps(base.hook.BUY_FEE_BPS)} of the ETH`) &&
            t.includes('starts at 90%'),
          off.map((x) => `${x.id}: ${x.why}`).join(' | '),
        );
      if (p === 'rewards')
        check(
          'F12a not launched, Rewards: claiming is off with its sentence; the rules and the schedule from the contracts (launch day spoken of ahead, no row marked "Now"); no day, no rate of the day, no reserve figure',
          off.length === 1 &&
            off[0].id === 'claim' &&
            off[0].disabled &&
            off[0].why === 'Rebates are earned by buys in the pool, so there is nothing to claim before the launch.' &&
            t.includes('the launch day, begins at the launch and is shorter') &&
            t.includes('2,500,000') &&
            !el.querySelector('.now-tag') &&
            !t.includes('Today’s limit') &&
            !t.includes('Rebate reserve') &&
            !t.includes('Claimable'),
          off.map((x) => `${x.id}: ${x.why}`).join(' | '),
        );
      if (p === 'stake') {
        const rows = [...el.querySelectorAll('table.tiers tbody tr')].map((r) => (r as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
        check(
          'F12a not launched, Stake: opening a vault is off with its sentence; the five tiers with multiplier, dollar price and share from TownStaking; no ETH price, no staked or streamed figures',
          off.length === 1 &&
            off[0].id === 'stake' &&
            off[0].disabled &&
            off[0].why === 'Vaults open at the launch, when TOWN can first be bought.' &&
            rows.length === 5 &&
            rows[0].includes('$5') &&
            rows[4].includes('2x') &&
            !t.includes('ETH still to stream') &&
            !t.includes('TOWN staked') &&
            !/\d ETH\b/.test(rows.join(' ')),
          rows.join(' | '),
        );
      }
      if (p === 'stats')
        check(
          'F12a not launched, Stats: the seven contracts, the supply held by the Launcher and the settings; none of the running totals (treasury balance, volume, burn, rebates, staking), absent rather than zero',
          el.querySelectorAll('.contract-list li').length === 7 &&
            figText(el, 'UpTownToken.balanceOf(Launcher)') === '1,000,000,000' &&
            figText(el, 'Treasury.spendBps') === fmtBps(base.treasury.spendBps) &&
            figText(el, 'LPVault.lockDuration') === '10 years' &&
            !t.includes('ETH balance') &&
            !t.includes('Burned') &&
            !t.includes('Rebates emitted') &&
            !t.includes('Trading volume') &&
            !t.includes('Liquidity locked until'),
          t.slice(0, 200),
        );
      if (p === 'docs')
        check(
          'F12a not launched, Docs: the rules from the contracts; the owner settings "shown once UpTown has launched"; no lock date; the position NFT link off "(from the launch)"',
          t.includes('Shown once UpTown has launched.') && !t.includes('locked for at least 10 years: until') && t.includes('(from the launch)'),
          (t.match(/Shown once[^.]*\./) ?? [''])[0],
        );
      if (p === 'owner') {
        const items = [...el.querySelectorAll('[data-off-power]')].map((x) => x.textContent ?? '');
        check(
          'F12a not launched, Owner: Launch is offered; ownership can be handed over; the five launch-dependent powers are off, each with one sentence',
          t.includes('Check: Launch') && t.includes('Launched Not yet'),
          t.slice(0, 120),
        );
        check('F12a not launched, Owner: the "From the launch" list', items.length === 5 && items.every((x) => /\.\s\S/.test(x)) && t.includes('Ownership of LPVault'), items.join(' | '));
      }
    }
    check('F12a not launched: no dollar figure on any page (Home, Trade, Rewards, Stake, Stats, Docs, Owner)', !anyUsd);
    check('F12a not launched: no price and no day number or countdown on any page', !anyPrice && !anyDay);
    check('F12a not launched: no figure shown as 0 TOWN, 0 ETH or 0 WETH on any page (absent, not zero)', anyZero.length === 0, anyZero.join(', '));
    check('F12a not launched: beside every "Don’t trust, verify" link, "(source published shortly before the pool opens)" (CR-98 as amended)', sourceEverywhere, results.join(' | '));
    const foot = await mount(<FooterContracts />, null, null, 'F12a not launched (Ethereum): footer', notLaunched(ETH_NET));
    const links = [...foot.querySelectorAll('a')].map((a) => (a as HTMLAnchorElement).href);
    check(
      'F12a not launched, footer: the seven contracts linked to Etherscan, and "Not launched yet: source published shortly before the pool opens."',
      links.length === 7 && links.every((h) => h.startsWith('https://etherscan.io/address/')) && text(foot).includes('Not launched yet: source published shortly before the pool opens.'),
      text(foot).slice(-80),
    );
    // The same state on the local chain (no explorer): no note about the explorer's source, the links are off as before.
    const local = await mount(<PageView page="" />, null, null, 'F12a not launched (local chain): Home', notLaunched(NETWORK));
    check(
      'F12a not launched on the local chain: the launch line names the local test chain; no source note where there is no explorer',
      text(local).includes('UpTown’s contracts are live on the local test chain. The pool opens soon') && !local.querySelector('.source-note'),
      local.querySelector('.launch-line')?.textContent ?? '',
    );
  }

  // 3. Launched (the live chain): every page as before, with none of the "before the launch" forms or notes.
  {
    const seen: string[] = [];
    let ok = true;
    for (const p of PAGES) {
      const el = await mount(<PageView page={p} />, base, p === 'owner' ? ownerAccount : wallet, `F12a launched (Ethereum fixture network): ${pageName(p)}`, {
        network: ETH_NET,
        account: p === 'owner' ? OWNER : wallet.address,
      });
      const bad = !!el.querySelector('[data-state="not-launched"], .launch-line, .off-action, .source-note, [data-off-power]');
      seen.push(`${pageName(p)}: ${bad ? 'HAS a before-the-launch element' : 'normal'}`);
      ok &&= !bad;
    }
    const home = await mount(<PageView page="" />, base, wallet, 'F12a launched: Home', { network: ETH_NET });
    const trade = await mount(<PageView page="trade" />, base, wallet, 'F12a launched: Trade', { network: ETH_NET });
    const foot = await mount(<FooterContracts />, base, wallet, 'F12a launched: footer', { network: ETH_NET });
    ok &&= text(home).includes('So far') && !!home.querySelector('.hero-cta a[href="#/trade"]') && !!trade.querySelector('.price-line') && !!trade.querySelector('#trade-panel-buy') && !foot.querySelector('.source-note');
    check('F12a launched: every page is the launched page (Home "So far" and "Buy TOWN", Trade’s price line and forms); no launch line, no switched-off action, no source note, in the footer neither', ok, seen.join(' | '));
  }

  // 4. The position's explorer link, when the address file was written before the launch (mainnet phase 1).
  {
    const d = NETWORK.deployment!;
    const n: Network = { ...ETH_NET, deployment: { ...d, lpTokenId: null } };
    const fromChain = positionUrl(n, 445440n);
    check(
      'F12a the position NFT link: from the address file when it has the token ID, else from LPVault.tokenId() on chain, none while that is 0',
      fromChain === `https://etherscan.io/nft/${NETWORK.uniswap!.positionManager}/445440` && positionUrl(n, 0n) === null && positionUrl(n) === null && positionUrl({ ...n, deployment: { ...d, lpTokenId: 7n } }, 445440n)!.endsWith('/7'),
      String(fromChain),
    );
  }
}

run()
  .catch((e) => check('the tests ran to the end', false, String(e?.stack ?? e)))
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    say(`\n${results.length - failed} passed, ${failed} failed`);
    (window as unknown as { __results: unknown }).__results = { passed: results.length - failed, failed, results };
  });
