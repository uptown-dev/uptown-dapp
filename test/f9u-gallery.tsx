// F9u review gallery: renders, from fixtures on the live local-chain figures, the states the local
// chain cannot show (CR-93): the Trade page's sell message and fee rows in each of the four states of
// TownHook.sellFeeShares(), and the Rewards page with the reserve empty and nearly spent. Each block
// is a <section data-shot="…"> that scripts/f9u-shots.mjs photographs. Nothing here sends anything.
import { render, type ComponentChildren } from 'preact';
import '../src/styles/global.css';
import { AppContext, type AppState } from '../src/components/ui';
import { NETWORK } from '../src/lib/network';
import { makeClient, readAll } from '../src/lib/reads';
import { Trade } from '../src/pages/Trade';
import { Rewards } from '../src/pages/Rewards';
import type { ChainState, SellFeeShares, WalletState } from '../src/data/types';

const stage = document.getElementById('stage')!;
const client = makeClient(NETWORK);
const E18 = 10n ** 18n;

function app(chain: ChainState, wallet: WalletState): AppState {
  return {
    network: NETWORK,
    chain,
    wallet,
    owner: null,
    account: wallet.address,
    accountLabel: 'Test wallet 1',
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

function block(name: string, title: string, chain: ChainState, wallet: WalletState, node: ComponentChildren) {
  const s = document.createElement('section');
  s.dataset.shot = name;
  s.style.margin = '0 0 40px';
  const h = document.createElement('p');
  h.className = 'poke-title';
  h.style.margin = '0 0 8px';
  h.textContent = `Fixture: ${title}`;
  const box = document.createElement('div');
  s.append(h, box);
  stage.append(s);
  render(<AppContext.Provider value={app(chain, wallet)}>{node}</AppContext.Provider>, box);
  return box;
}

const typeIn = (el: HTMLElement, sel: string, v: string) => {
  const input = el.querySelector(sel) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

async function main() {
  const live = await readAll(client, NETWORK, NETWORK.testWallets[0].address);
  const base = live.chain!;
  const wallet = live.wallet!;
  const c = base.hook.currentCycle;
  const state = (shares: SellFeeShares, o: { cycle?: number; burned?: bigint; pot?: bigint; supply?: bigint } = {}): ChainState => {
    const cy = o.cycle ?? c;
    return {
      ...base,
      token: { ...base.token, totalSupply: o.supply ?? base.token.totalSupply },
      hook: { ...base.hook, currentCycle: cy, sellFeeShares: shares, sellFeeInEth: shares.ethBps === 200, burned: { [cy - 1]: o.burned ?? 0n, [cy]: 0n } },
      rewards: { ...base.rewards, currentCycle: cy, emissionEstimate: { [cy - 1]: o.pot ?? 667_925n * E18 }, reserveExhausted: false },
    };
  };
  const sells: [string, string, ChainState][] = [
    ['sell-burn', `(200, 0, 0): burned, ${'before Day 401'} (the live chain’s own state, yesterday’s figures set)`, state({ burnedBps: 200, reserveBps: 0, ethBps: 0 })],
    ['sell-half', '(100, 100, 0): half burned, half to the rebate reserve (Day 451)', state({ burnedBps: 100, reserveBps: 100, ethBps: 0 }, { cycle: 450 })],
    ['sell-eth', '(0, 0, 200): in ETH to the treasury (yesterday burned 750,000 > rebates 600,000)', state({ burnedBps: 0, reserveBps: 0, ethBps: 200 }, { burned: 750_000n * E18, pot: 600_000n * E18 })],
    ['sell-split', '(0, 100, 100): at the burn floor', state({ burnedBps: 0, reserveBps: 100, ethBps: 100 }, { supply: base.hook.BURN_FLOOR })],
  ];
  for (const [name, title, chain] of sells) {
    const box = block(name, title, chain, wallet, <Trade sell />);
    typeIn(box, '#sell-town', '1,000,000');
  }
  block('rewards-empty', 'the rebate reserve empty: available() = 0', { ...base, rewards: { ...base.rewards, available: 0n, reserveExhausted: true } }, wallet, <Rewards />);
  block('rewards-low', 'the rebate reserve nearly spent: available() = 1,000,000 TOWN', { ...base, rewards: { ...base.rewards, available: 1_000_000n * E18 } }, wallet, <Rewards />);
  // Let the quotes arrive, then open the schedule on the empty-reserve page.
  await new Promise((r) => setTimeout(r, 2500));
  (document.querySelector('[data-shot="rewards-empty"] details') as HTMLDetailsElement).open = true;
  (window as unknown as { __ready: boolean }).__ready = true;
}

main().catch((e) => {
  stage.textContent = String(e?.stack ?? e);
  (window as unknown as { __ready: boolean }).__ready = true;
});
