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
// Nothing here sends a transaction: only Check buttons (read-only calls) are clicked.
import { render, type ComponentChildren } from 'preact';
import { AppContext, type AppState } from '../src/components/ui';
import { NETWORK } from '../src/lib/network';
import { makeClient, readAll, readVaults, verifyCandidate } from '../src/lib/reads';
import { explainError } from '../src/lib/errors';
import { ERRORS_ABI, HOOK_ABI, TREASURY_ABI } from '../src/lib/abi';
import { ContractFunctionRevertedError, encodeErrorResult, encodeFunctionData } from 'viem';
import { Owner, OwnerPage } from '../src/pages/Owner';
import { pageAccess, showsOwnerLink } from '../src/lib/owner';
import { dayName, fmtDateTime, fmtTown } from '../src/lib/format';
import { CandidateMark, OwnerChanges, Stats, TradingVolume } from '../src/pages/Stats';
import { Trade } from '../src/pages/Trade';
import { OldVaultCard, Stake } from '../src/pages/Stake';
import { Rewards } from '../src/pages/Rewards';
import type { Address, CandidateCheck, ChainState, OwnerState, WalletState } from '../src/data/types';

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
async function mount(node: ComponentChildren, chain: ChainState | null, wallet: WalletState | null, label = ''): Promise<HTMLElement> {
  const box = document.createElement('div');
  if (GALLERY) {
    const h = document.createElement('p');
    h.className = 'poke-title';
    h.style.margin = '28px 0 8px';
    h.textContent = `Fixture: ${label}`;
    stage.append(h, box);
  } else stage.replaceChildren(box);
  render(<AppContext.Provider value={app(chain, wallet)}>{node}</AppContext.Provider>, box);
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

  if (!GALLERY) stage.replaceChildren();
}

run()
  .catch((e) => check('the tests ran to the end', false, String(e?.stack ?? e)))
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    say(`\n${results.length - failed} passed, ${failed} failed`);
    (window as unknown as { __results: unknown }).__results = { passed: results.length - failed, failed, results };
  });
