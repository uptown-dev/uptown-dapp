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
// Nothing here sends a transaction: only Check buttons (read-only calls) are clicked.
import { render, type ComponentChildren } from 'preact';
import { AppContext, type AppState } from '../src/components/ui';
import { NETWORK } from '../src/lib/network';
import { makeClient, quoteBuy, readAll, readVaults, replacedRecords, verifyCandidate } from '../src/lib/reads';
import { explainError } from '../src/lib/errors';
import { ERRORS_ABI, HOOK_ABI, TREASURY_ABI } from '../src/lib/abi';
import { ContractFunctionRevertedError, encodeErrorResult, encodeFunctionData, getAddress } from 'viem';
import { Owner, OwnerPage } from '../src/pages/Owner';
import { networkLabel, pageAccess, showsOwnerLink } from '../src/lib/owner';
import { UNLISTED_STAKING, listedStaking, replacedStaking } from '../src/lib/network';
import { UnlistedStakingError, addStakeTx, approvePermit2Tx, approveTx, claimWethTx, openVaultTx, ownerTx, unstakeTx, upgradeTx } from '../src/lib/actions';
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
import { minCheck, rpcBehind } from '../src/lib/derive';
import { dayName, fmtDateTime, fmtTown, fmtUsd8 } from '../src/lib/format';
import { CandidateMark, OwnerChanges, Stats, TradingVolume } from '../src/pages/Stats';
import { Trade } from '../src/pages/Trade';
import { OldVaultCard, Stake } from '../src/pages/Stake';
import { Rewards } from '../src/pages/Rewards';
import { App, StaleNotice, WalletChoices, navItems } from '../src/app';
import type { Address, CandidateCheck, ChainState, OwnerState, ReplacedStaking, StakingControls, WalletState } from '../src/data/types';

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
    const mode = base.hook.sellFeeInEth ? '2% in ETH, to the treasury' : '2% in TOWN, burned';
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
      hook: { ...base.hook, sellFeeInEth: true, burned: { ...base.hook.burned, [y]: 750_000n * 10n ** 18n } },
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
    // At the floor: always ETH.
    const chain: ChainState = { ...base, token: { ...base.token, totalSupply: base.hook.BURN_FLOOR }, hook: { ...base.hook, sellFeeInEth: true } };
    const el = await mount(<Trade sell />, chain, wallet, 'Trade page, Sell, at the burn floor (fixture)');
    const line = text(el.querySelector('.sell-mode') as HTMLElement);
    check(
      'CR-56 at the floor (fixture): ETH, "the burn floor is reached" with 100,000,000',
      line.startsWith('Today’s sell fee: 2% in ETH, to the treasury') && line.includes('The burn floor is reached: the supply is at 100,000,000 TOWN'),
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
    const st = await mount(<Stats />, chain, wallet, 'Stats page, day 0 (fixture)');
    const t = text(st);
    check('CR-57 day 0 (fixture): TOWN, "Day 0 has no day before it"; yesterday’s figures "—"', t.includes('Sell fee today 2% in TOWN, burned') && t.includes('Day 0 has no day before it') && t.includes('TOWN burned yesterday —'), t.match(/Sell fee today.*?Rebates emitted/)?.[0] ?? '');
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
    const t = text(el).replace(/(\d)TOWN/g, '$1 TOWN'); // unstyled, the value and its unit touch
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
    const el = await mount(<TradingVolume />, chain, wallet, 'Stats trading volume on day 0 (fixture)');
    const t = text(el).replace(/(\d)TOWN/g, '$1 TOWN');
    check(
      'CR-61 day 0 (fixture): yesterday reads "None yet"; today 5,000,000 bought and 1,000,000 sold, still counting',
      t.includes('Bought yesterday None yet Day 0 has no day before it') &&
        t.includes('Sold yesterday None yet Day 0 has no day before it') &&
        t.includes('Bought today so far 5,000,000 TOWN Day 0, still counting') &&
        t.includes('Sold today so far 1,000,000 TOWN Day 0, still counting'),
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
  const usesIn = (el: Element | null) => (el?.querySelector('.uses') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? null;
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
      !!targetProblem(NETWORK, toFake) && !!targetProblem(NETWORK, approveFake)?.startsWith(UNLISTED_STAKING) && targetProblem(NETWORK, claimWethTx(NETWORK, k.TownStaking)) === null && targetProblem(NETWORK, approvePermit2Tx(NETWORK, 1n)) === null,
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
    const stOpen = text(st).includes(COMMA_MESSAGE) && button(st, '2. Open tier')?.disabled === true && button(st, '1. Approve TOWN')?.disabled === true;
    typeIn(st, '#vault-town', '1,000.5');
    await settle();
    const stOpenUses = usesIn(st.querySelector('.field'));
    const st2 = await mount(<Stake />, base, wallet, 'Stake, add TOWN (live vault)');
    (st2.querySelector('#tab-add') as HTMLButtonElement)?.click();
    await settle();
    typeIn(st2, '#add-town', '0,5');
    await settle();
    const stAdd = text(st2).includes(COMMA_MESSAGE) && button(st2, '2. Add TOWN')?.disabled === true;
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
    check('CR-72 item 3: sell minimum 0: refused, "3. Sell" off', text(sb).includes('The minimum received cannot be 0') && button(sb, '3. Sell')?.disabled === true);
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

run()
  .catch((e) => check('the tests ran to the end', false, String(e?.stack ?? e)))
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    say(`\n${results.length - failed} passed, ${failed} failed`);
    (window as unknown as { __results: unknown }).__results = { passed: results.length - failed, failed, results };
  });
