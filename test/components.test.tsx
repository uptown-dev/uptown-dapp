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
// - F8g housekeeping, the upgradeable flag: the site's check pointed at a real EIP-1967 proxy on the
//   forked chain (Aave's v3 Pool) and at TownStaking; the mark from a fixture.
// Nothing here sends a transaction: buttons are checked, never clicked.
import { render, type ComponentChildren } from 'preact';
import { AppContext, type AppState } from '../src/components/ui';
import { NETWORK } from '../src/lib/network';
import { makeClient, readAll, readVaults, verifyCandidate } from '../src/lib/reads';
import { explainError } from '../src/lib/errors';
import { TREASURY_ABI } from '../src/lib/abi';
import { dayName, fmtDateTime, fmtTown } from '../src/lib/format';
import { CandidateMark, OwnerChanges, Stats } from '../src/pages/Stats';
import { Trade } from '../src/pages/Trade';
import { OldVaultCard, Stake } from '../src/pages/Stake';
import { Rewards } from '../src/pages/Rewards';
import type { Address, CandidateCheck, ChainState, WalletState } from '../src/data/types';

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

function app(chain: ChainState, wallet: WalletState | null): AppState {
  return {
    network: NETWORK,
    chain,
    wallet,
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
  };
}

/** Renders `node` with the given figures and returns its box once painted. */
async function mount(node: ComponentChildren, chain: ChainState, wallet: WalletState | null, label = ''): Promise<HTMLElement> {
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
  const base = live.chain;
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
