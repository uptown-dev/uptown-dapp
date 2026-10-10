import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getAddress } from 'viem';
import { AppContext, Notice, PageHead, useApp, type AppState, type DataStatus } from './components/ui';
import { CloseIcon, ExternalIcon, MenuIcon, DarkModeIcon, LightModeIcon, SkylineMark } from './components/icons';
import { CONTRACT_NAMES, type Address, type ChainState, type OwnerState, type WalletState } from './data/types';
import { NETWORK, contractUrl, type Network } from './lib/network';
import { makeClient, readAll } from './lib/reads';
import { activeProvider, chooseWallet, chosenWallet, rememberedWallet, switchWalletChain, watchWallets, type Eip1193, type WalletInfo } from './lib/wallet';
import { explainError } from './lib/errors';
import { dayName, fmtDuration, shortAddress } from './lib/format';
import { rpcBehind } from './lib/derive';
import { chooseTheme, currentTheme, storedTheme, type Theme } from './lib/theme';
import { Home } from './pages/Home';
import { Trade } from './pages/Trade';
import { Rewards } from './pages/Rewards';
import { Stake } from './pages/Stake';
import { Stats } from './pages/Stats';
import { Docs } from './pages/Docs';
import { Owner } from './pages/Owner';
import { showsOwnerLink } from './lib/owner';

/** Every page: its address (`#/<page>`), its label and its browser title. */
const NAV: { page: string; label: string; title: string }[] = [
  // The homepage keeps its entry for its address and title but has no item in the navigation bar:
  // the "UpTown" name at the top left is its link (CR-71).
  { page: '', label: 'Home', title: 'UpTown (TOWN)' },
  { page: 'trade', label: 'Trade', title: 'Trade TOWN · UpTown' },
  { page: 'rewards', label: 'Rewards', title: 'Buyer rebates · UpTown' },
  { page: 'stake', label: 'Stake', title: 'Stake TOWN · UpTown' },
  { page: 'stats', label: 'Stats', title: 'Treasury and stats · UpTown' },
  { page: 'docs', label: 'Docs', title: 'Docs · UpTown' },
  // Shown in the navigation only to the owner wallet (CR-64); anyone else who opens it sees a notice.
  { page: 'owner', label: 'Owner', title: 'Owner · UpTown' },
];

/** The navigation bar's items, in order: every page but the homepage (CR-71); Owner only for the owner wallet (CR-64). */
export function navItems(ownerLink: boolean) {
  return NAV.filter((n) => n.page !== '' && (n.page !== 'owner' || ownerLink));
}

// ---------------------------------------------------------------------------------------------
// THE NETWORK TAG (CR-76). It sits in the header's tools, beside the wallet button, and names the
// network the build is for. It replaces the strip that stood above the header on the local chain;
// the strip's sentence is not lost: it is the tag's tooltip and it is in the tag for a screen
// reader (the visually hidden span below, since a `title` alone reaches no screen reader). The tag
// is not a button and does nothing when clicked.
//
// CR-77 item 1: the tag is shown only where it fits beside the wallet button. Below 480 px the
// stylesheet hides it altogether (there is no room beside the wordmark, the theme button, the
// wallet button and the menu button), and the header row is back to its 60 px height. On a phone
// the thing a visitor must not miss is a wallet on another network, and that is the red light in
// the wallet display (`WalletButton` below), on every screen size.
// ---------------------------------------------------------------------------------------------

/** The one sentence the tag carries: the strip's words on the local chain, the same style elsewhere. */
export function networkNote(n: Network): string {
  if (n.local) return `A private copy of Ethereum on this computer (chain ID ${n.chainId}). Test wallets only; nothing here is real.`;
  if (n.chainId === 1) return `The real Ethereum network (chain ID ${n.chainId}). Real contracts and real money.`;
  return `Ethereum's test network (chain ID ${n.chainId}). Test coins only; nothing here is real money.`;
}

/** The name the tag shows where the full one does not fit (the full name stays in the tooltip and for a screen reader). */
export function shortNetworkName(n: Network): string {
  return n.local ? 'Local' : n.name;
}

/** The tag itself: the network's name, marked on a test network, with its sentence for hover and for screen readers. */
export function NetworkTag({ n }: { n: Network }) {
  const note = networkNote(n);
  // Only chain 1 is the real network; Sepolia and the local chain are test networks and are marked.
  const test = n.chainId !== 1;
  return (
    <span class={`net-tag${test ? ' net-test' : ''}`} role="note" title={`${n.name} — ${note}`} data-chain={n.chainId}>
      <span class="net-name" aria-hidden="true">
        {n.name}
      </span>
      <span class="net-name-short" aria-hidden="true">
        {shortNetworkName(n)}
      </span>
      <span class="visually-hidden">
        {n.name}. {note}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// THE WALLET DISPLAY, AND THE WRONG NETWORK (CR-77 item 1). The light beside the address is green
// while the wallet is on the site's own network and red when the wallet is on another one, on
// every screen size. Colour alone would not do — some visitors cannot tell red from green — so a
// wrong network is also a different shape (a warning triangle in place of the round dot), the
// button takes the site's warning outline, its tooltip says in plain words what is wrong, and the
// words "Wrong network" are inside the button for a screen reader. The display stays the way to
// put it right: selecting it opens the wallet menu, which repeats the reason in plain words and
// carries the "Switch to <network>" action.
// ---------------------------------------------------------------------------------------------

/** The light beside the address in the wallet display: a green dot, or a red triangle on the wrong network. */
export function WalletLight({ wrong }: { wrong: boolean }) {
  return <span class={wrong ? 'dot dot-wrong' : 'dot'} aria-hidden="true" />;
}

/** What is wrong, in plain words: the wallet's own chain, and the network this site is built for. */
export function wrongNetworkWords(n: Network, walletChain: number | null): string {
  return `Wrong network: your wallet is on another network${walletChain !== null ? ` (chain ID ${walletChain})` : ''}. This site is UpTown on ${n.name}.`;
}

/** The wallet display itself: the light, the short address, and what a screen reader is told. */
export function WalletButton({
  network,
  account,
  accountLabel,
  wrongNetwork,
  walletChain,
  pickerOpen,
  hasMenu,
  onClick,
}: {
  network: Network;
  account: Address | null;
  accountLabel: string | null;
  wrongNetwork: boolean;
  walletChain: number | null;
  pickerOpen: boolean;
  hasMenu: boolean;
  onClick: () => void;
}) {
  const words = wrongNetworkWords(network, walletChain);
  const who = `Wallet ${account}${accountLabel ? ` (${accountLabel})` : ''}`;
  return (
    <button
      type="button"
      class={`btn btn-small ${account ? (wrongNetwork ? 'btn-danger' : 'btn-secondary') : 'btn-primary'} wallet-btn`}
      aria-expanded={pickerOpen}
      aria-haspopup={hasMenu ? 'menu' : undefined}
      onClick={onClick}
      title={wrongNetwork ? `${words} Select the wallet to put it right.` : undefined}
      aria-label={
        account
          ? wrongNetwork
            ? `${who} connected. ${words} Select to switch network or disconnect.`
            : `${who} connected. Select to change or disconnect.`
          : network.local
            ? 'Pick a local test wallet'
            : 'Connect wallet'
      }
    >
      {account ? (
        <>
          <WalletLight wrong={wrongNetwork} />
          {shortAddress(account)}
          {wrongNetwork && <span class="visually-hidden">Wrong network</span>}
        </>
      ) : network.local ? (
        'Pick a test wallet'
      ) : (
        'Connect wallet'
      )}
    </button>
  );
}

/** In the wallet menu: why the red light is showing, and the action that puts it right. */
export function WrongNetworkNote({ network, walletChain, onSwitch }: { network: Network; walletChain: number | null; onSwitch: () => void }) {
  return (
    <div class="wallet-wrong">
      <p class="wallet-menu-title">Wrong network</p>
      <p class="wallet-menu-note">
        Your wallet is on another network{walletChain !== null ? ` (chain ID ${walletChain})` : ''}, so this site cannot read your own figures and a
        transaction sent from it would fail. UpTown here is on {network.name}.
      </p>
      <button type="button" role="menuitem" class="btn btn-small btn-primary wallet-switch" onClick={onSwitch}>
        Switch to {network.name}
      </button>
    </div>
  );
}

/** Pages made of live figures: shown once the figures have been read. */
const LIVE_PAGES = new Set(['trade', 'rewards', 'stake', 'stats']);

/** How often the figures are read again while the page is open (and after every transaction). */
const REFRESH_MS = 15_000;

/** The local test wallet last picked (a convenience on this computer only). */
const LOCAL_WALLET_KEY = 'uptown-local-wallet';

/** Addresses from before CR-43 (`#/buy`, `#/buy/...`) open the Trade page. */
function canonicalHash(hash: string): string {
  return hash.replace(/^#\/?buy(?=\/|$)/, '#/trade');
}

/** `#/docs/owner` is the page docs scrolled to its section owner (element id docs-owner). */
function parseHash(hash: string): { page: string; section: string } {
  const [first = '', second = ''] = hash.replace(/^#\/?/, '').split('/');
  const page = NAV.some((n) => n.page === first) ? first : '';
  return { page, section: page ? second : '' };
}

function storedLocalWallet(): Address | null {
  if (!NETWORK.local) return null;
  try {
    const a = window.localStorage.getItem(LOCAL_WALLET_KEY);
    const w = NETWORK.testWallets.find((x) => x.address.toLowerCase() === (a ?? '').toLowerCase());
    return w ? w.address : null;
  } catch {
    return null;
  }
}

interface Toast {
  id: number;
  message: string;
}

export function App() {
  const network = NETWORK;
  const client = useMemo(() => makeClient(network), [network]);
  const [hash, setHash] = useState<string>(() => canonicalHash(window.location.hash));
  const { page, section } = parseHash(hash);
  const [navOpen, setNavOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [account, setAccount] = useState<Address | null>(() => storedLocalWallet());
  const [walletChain, setWalletChain] = useState<number | null>(null);
  const [chain, setChain] = useState<ChainState | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [owner, setOwner] = useState<OwnerState | null>(null);
  const [data, setData] = useState<DataStatus>({ state: network.deployment ? 'loading' : 'not-deployed', error: null, readAt: null });
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const accountRef = useRef(account);
  accountRef.current = account;
  const reading = useRef<Promise<void> | null>(null);

  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 9000);
  }, []);

  // ---- reading the figures -------------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (!network.deployment) return;
    if (reading.current) await reading.current; // one read at a time; then read again, fresh
    const who = accountRef.current;
    const p = (async () => {
      try {
        const r = await readAll(client, network, who);
        if (accountRef.current !== who) return; // the wallet changed meanwhile: a new read follows
        setChain(r.chain);
        setWallet(r.wallet);
        setOwner(r.owner);
        setData({ state: r.chain ? 'ready' : 'not-launched', error: null, readAt: Date.now() });
      } catch (e) {
        setData((d) => ({ ...d, state: d.readAt ? 'ready' : 'error', error: explainError(e).message }));
      }
    })();
    reading.current = p;
    await p;
    reading.current = null;
  }, [client, network]);

  useEffect(() => {
    void refresh();
  }, [refresh, account]);

  useEffect(() => {
    if (!network.deployment) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  // ---- the browser wallets (public networks; EIP-6963, CR-72) ---------------------------------
  // The installed wallets announce themselves; the visitor picks one when there are several. The
  // chosen wallet (or the only one, or `window.ethereum` when none announces itself) is the one
  // every chain check, account read and send uses (`activeProvider` in wallet.ts).
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [picked, setPicked] = useState<WalletInfo | null>(() => chosenWallet());
  useEffect(() => {
    if (network.local) return;
    return watchWallets((list) => {
      setWallets(list);
      if (!chosenWallet()) {
        const again = rememberedWallet(list); // the wallet picked earlier in this visit, after a reload
        if (again) {
          chooseWallet(again);
          setPicked(again);
        }
      }
    });
  }, [network]);

  // The provider in use, and the one whose granted connection was already restored (once each, so a
  // Disconnect is not undone by the same wallet's restore).
  const restored = useRef<Eip1193 | null>(null);
  const provider = network.local ? null : activeProvider();
  useEffect(() => {
    if (network.local) return;
    const p = provider;
    if (!p) {
      setAccount(null);
      setWalletChain(null);
      return;
    }
    const onAccounts = (a: unknown) => {
      const list = a as string[];
      setAccount(list && list.length ? getAddress(list[0]) : null);
    };
    const onChain = (id: unknown) => setWalletChain(Number(id));
    if (restored.current !== p) {
      restored.current = p;
      // Restore a connection the visitor already granted, without asking again.
      p.request({ method: 'eth_accounts' }).then(onAccounts, () => {});
    }
    p.request({ method: 'eth_chainId' }).then(onChain, () => {});
    p.on?.('accountsChanged', onAccounts);
    p.on?.('chainChanged', onChain);
    return () => {
      p.removeListener?.('accountsChanged', onAccounts);
      p.removeListener?.('chainChanged', onChain);
    };
  }, [network, provider]);

  /** Asks `w` (or, without one, the wallet in use) for the visitor's account. */
  const connectWith = useCallback(
    (w: WalletInfo | null) => {
      if (w) {
        chooseWallet(w);
        setPicked(w);
        restored.current = w.provider;
      }
      setPickerOpen(false);
      const p = w ? w.provider : activeProvider();
      if (!p) {
        toast('No wallet found in this browser. Install a browser wallet such as MetaMask, then reload this page.');
        return;
      }
      p.request({ method: 'eth_requestAccounts' }).then(
        (a) => {
          const list = a as string[];
          if (list.length) setAccount(getAddress(list[0]));
          p.request({ method: 'eth_chainId' }).then((id) => setWalletChain(Number(id)), () => {});
        },
        (e) => toast(explainError(e).message),
      );
    },
    [toast],
  );

  const connect = useCallback(() => {
    // The local chain, or several wallets and none chosen yet: open the picker.
    if (network.local || (wallets.length > 1 && !chosenWallet())) {
      setPickerOpen(true);
      return;
    }
    connectWith(null);
  }, [network, wallets.length, connectWith]);

  const disconnectWallet = () => {
    setAccount(null);
    if (wallets.length > 1) {
      // Forget the choice too, so the next Connect offers every wallet again.
      chooseWallet(null);
      setPicked(null);
    }
  };

  const pickLocal = (a: Address | null) => {
    setAccount(a);
    setPickerOpen(false);
    try {
      if (a) window.localStorage.setItem(LOCAL_WALLET_KEY, a);
      else window.localStorage.removeItem(LOCAL_WALLET_KEY);
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
  };

  const wrongNetwork = !network.local && account !== null && walletChain !== null && walletChain !== network.chainId;
  const accountLabel = network.local ? (network.testWallets.find((w) => w.address === account)?.label ?? null) : null;
  const ownerLink = showsOwnerLink(owner, account);

  // ---- page and theme --------------------------------------------------------------------------
  useEffect(() => {
    const onHash = () => setHash(canonicalHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // An old #/buy address: show #/trade in the address bar too, without a new history entry.
  useEffect(() => {
    if (window.location.hash !== hash && canonicalHash(window.location.hash) === hash) {
      try {
        window.history.replaceState(null, '', hash);
      } catch {
        /* the address bar keeps the old address; the page shown is the same */
      }
    }
  }, [hash]);

  // Follow the system setting while the visitor has not chosen a theme.
  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => {
      if (!storedTheme() && !document.documentElement.hasAttribute('data-theme')) setTheme(mq!.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onChange);
    return () => mq!.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.title = NAV.find((n) => n.page === page)?.title ?? 'UpTown (TOWN)';
    setNavOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [page]);

  // A section link (#/docs/owner): bring that section into view and move focus to it.
  useEffect(() => {
    if (!section) return;
    const el = document.getElementById(`${page}-${section}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  }, [hash, chain === null]);

  const state: AppState = {
    network,
    chain,
    wallet: account && wallet && wallet.address === account ? wallet : null,
    owner,
    account,
    accountLabel,
    data,
    client,
    refresh,
    connect,
    disconnect: () => (network.local ? pickLocal(null) : disconnectWallet()),
    wrongNetwork,
    switchNetwork: () => {
      switchWalletChain(network).catch((e) => toast(explainError(e).message));
    },
    toast,
  };

  const view = (() => {
    if (LIVE_PAGES.has(page) && !chain) return <ChainPending title={NAV.find((n) => n.page === page)!.label} data={data} onRetry={refresh} />;
    switch (page) {
      case 'trade':
        return <Trade sell={section === 'sell'} />;
      case 'rewards':
        return <Rewards />;
      case 'stake':
        return <Stake />;
      case 'stats':
        return <Stats />;
      case 'docs':
        return <Docs />;
      case 'owner':
        return <Owner />;
      default:
        return <Home />;
    }
  })();

  const c = chain?.hook.currentCycle ?? null;
  const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <AppContext.Provider value={state}>
      <a
        class="skip-link"
        href="#/"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to the page content
      </a>

      <header class="site-header">
        <div class="wrap header-row">
          {/* The homepage's link on every screen size (CR-71); it also closes the narrow-screen menu. */}
          <a class="wordmark" href="#/" aria-label="UpTown, home" onClick={() => setNavOpen(false)}>
            <SkylineMark />
            <span>UpTown</span>
          </a>
          <nav class={`site-nav${navOpen ? ' open' : ''}`} id="site-nav" aria-label="Main">
            <ul>
              {navItems(ownerLink).map((n) => (
                <li key={n.page}>
                  <a href={`#/${n.page}`} aria-current={page === n.page ? 'page' : undefined}>
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div class="header-tools">
            {c !== null && (
              <span class="day-chip" title={`${dayName(c)}: the 24-hour day that began ${c} days after launch`}>
                {dayName(c)}
              </span>
            )}
            <button
              type="button"
              class="icon-btn"
              onClick={() => {
                chooseTheme(nextTheme);
                setTheme(nextTheme);
              }}
              aria-label={`Switch to ${nextTheme} mode`}
              title={`Switch to ${nextTheme} mode`}
            >
              {theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </button>
            <div class="wallet-wrap">
              {/* The network tag, beside the wallet button (CR-76). */}
              <NetworkTag n={network} />
              <WalletButton
                network={network}
                account={account}
                accountLabel={accountLabel}
                wrongNetwork={wrongNetwork}
                walletChain={walletChain}
                pickerOpen={pickerOpen}
                hasMenu={!!account || network.local || wallets.length > 1}
                onClick={() => (account || network.local || pickerOpen ? setPickerOpen((o) => !o) : connect())}
              />
              {pickerOpen && (
                <div class="wallet-menu" role="menu" aria-label={network.local ? 'Local test wallets' : account ? 'Wallet' : 'Choose a wallet'}>
                  {/* The wrong network, first in the menu: the reason, and the action that puts it right (CR-77 item 1). */}
                  {wrongNetwork && <WrongNetworkNote network={network} walletChain={walletChain} onSwitch={() => (state.switchNetwork(), setPickerOpen(false))} />}
                  {!network.local && !account && (
                    <WalletChoices wallets={wallets} onPick={connectWith} />
                  )}
                  {!network.local && account && picked && (
                    <p class="wallet-menu-note wallet-using">
                      Using{' '}
                      {picked.icon && <img class="wallet-icon" src={picked.icon} alt="" width={16} height={16} />}
                      <strong>{picked.name}</strong> for this visit.
                    </p>
                  )}
                  {network.local && (
                    <>
                      <p class="wallet-menu-title">Local test wallets</p>
                      <p class="wallet-menu-note">No key exists for any of them: the local node sends from the address you pick.</p>
                      {network.testWallets.map((w) => (
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={w.address === account}
                          class="wallet-option"
                          key={w.address}
                          onClick={() => pickLocal(w.address)}
                          data-address={w.address}
                        >
                          <span>{w.label}</span>
                          <code>{shortAddress(w.address)}</code>
                        </button>
                      ))}
                    </>
                  )}
                  {account && (
                    <button type="button" role="menuitem" class="wallet-option wallet-off" onClick={() => (state.disconnect(), setPickerOpen(false))}>
                      Disconnect
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              class="icon-btn nav-toggle"
              aria-expanded={navOpen}
              aria-controls="site-nav"
              aria-label={navOpen ? 'Close the menu' : 'Open the menu'}
              onClick={() => setNavOpen((o) => !o)}
            >
              {navOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </header>

      <main ref={mainRef} tabIndex={-1} id="main" onClick={() => pickerOpen && setPickerOpen(false)}>
        {/* The notice that the network service is behind, directly under the header, above the figures it warns about (CR-77 item 6). */}
        <Freshness />
        {view}
        <ReadLine />
      </main>

      <footer class="site-footer">
        <div class="wrap footer-grid">
          <div class="footer-brand">
            <a class="wordmark small" href="#/" aria-label="UpTown, home">
              <SkylineMark />
              <span>UpTown</span>
            </a>
            <p>UpTown Token (TOWN), an experiment on Ethereum.</p>
            <nav aria-label="Footer">
              <ul>
                {NAV.slice(1, 5).map((n) => (
                  <li key={n.page}>
                    <a href={`#/${n.page}`}>{n.label}</a>
                  </li>
                ))}
                <li>
                  <a href="#/docs" class="footer-strong">
                    Docs
                  </a>
                </li>
              </ul>
            </nav>
          </div>
          <div class="footer-contracts">
            <p class="footer-head">Contracts{network.explorerName ? ` on ${network.explorerName}` : ''}</p>
            {network.deployment ? (
              <ul>
                {CONTRACT_NAMES.map((name) => {
                  const href = contractUrl(network, name);
                  const addr = network.deployment!.contracts[name];
                  return (
                    <li key={name}>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${name}, ${addr}, on ${network.explorerName} (opens in a new tab)`}>
                          <span class="footer-cname">{name}</span>
                          <span class="footer-addr num">{shortAddress(addr)}</span>
                          <ExternalIcon size={12} />
                        </a>
                      ) : (
                        <span class="footer-off" title={addr}>
                          <span class="footer-cname">{name}</span>
                          <span class="footer-addr num">{shortAddress(addr)}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p class="footer-note">Not deployed on {network.name} yet: the addresses are published here once they are.</p>
            )}
            {network.deployment && !network.explorer && <p class="footer-note">No block explorer on the {network.name.toLowerCase()}, so these are not links.</p>}
          </div>
          <p class="footer-fonts">
            Fonts under the SIL Open Font Licence: <a href="./licenses/OFL-Inter.txt">Inter</a>, <a href="./licenses/OFL-Cinzel.txt">Cinzel</a> (wordmark).
          </p>
        </div>
      </footer>

      <div class="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div class="toast" key={t.id} role="status">
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

/** A live page before its figures are read: reading, not deployed, or the network did not answer. */
function ChainPending({ title, data, onRetry }: { title: string; data: DataStatus; onRetry: () => Promise<void> }) {
  const n = NETWORK;
  return (
    <div class="wrap page narrow">
      <PageHead
        title={title}
        lead={data.state === 'not-deployed' || data.state === 'not-launched' ? `UpTown on ${n.name}.` : 'Reading the figures from the contracts.'}
      />
      {data.state === 'not-launched' && (
        <Notice kind="info" title="Not launched yet">
          <p>UpTown’s contracts are deployed on this network but not launched yet. This page’s figures appear here once they are.</p>
        </Notice>
      )}
      {data.state === 'not-deployed' && (
        <Notice kind="info" title={`Not deployed on ${n.name} yet`}>
          <p>UpTown’s contracts are not deployed on this network yet. Their addresses, and this page’s figures, appear here once they are.</p>
        </Notice>
      )}
      {data.state === 'loading' && <p class="muted">Reading the contracts on {n.name}…</p>}
      {data.state === 'error' && (
        <Notice kind="warn" title="Could not read the contracts">
          <p>{data.error}</p>
          <p>
            <button type="button" class="btn btn-small btn-secondary" onClick={() => void onRetry()}>
              Try again
            </button>
          </p>
        </Notice>
      )}
    </div>
  );
}

/**
 * The installed wallets that announced themselves (EIP-6963, CR-72), each with its own name and
 * icon, for the visitor to pick one. The icon is the wallet's `data:` image, used only as an
 * `<img>` source.
 */
export function WalletChoices({ wallets, onPick }: { wallets: WalletInfo[]; onPick: (w: WalletInfo) => void }) {
  if (wallets.length < 2) return null;
  return (
    <>
      <p class="wallet-menu-title">Choose a wallet</p>
      <p class="wallet-menu-note">These wallets are installed in this browser. The site uses the one you pick for this visit.</p>
      {wallets.map((w) => (
        <button type="button" role="menuitem" class="wallet-option wallet-choice" key={w.uuid} onClick={() => onPick(w)} data-rdns={w.rdns}>
          <span class="wallet-choice-name">
            {w.icon ? <img class="wallet-icon" src={w.icon} alt="" width={24} height={24} /> : <span class="wallet-icon blank" aria-hidden="true" />}
            <span>{w.name}</span>
          </span>
        </button>
      ))}
    </>
  );
}

/**
 * The notice when the network service lags (CR-72): its latest block more than 2 minutes older than
 * this computer's clock. Nothing when the block is ahead of the clock (the local chain's clock can
 * be moved forward by tests). Trading stays available.
 */
export function StaleNotice({ blockTimestamp, nowMs }: { blockTimestamp: number | null; nowMs: number }) {
  if (blockTimestamp === null || !rpcBehind(blockTimestamp, nowMs)) return null;
  return (
    <p class="small stale-note" role="status">
      The network service is behind: figures and estimates may be out of date. Its latest block is {fmtDuration(nowMs / 1000 - blockTimestamp)} old.
    </p>
  );
}

/**
 * The notice that the network service is behind, at the top of the page content: it warns about
 * the figures below it, so it stands above them (CR-77 item 6 kept the notice and deleted the line
 * that used to carry it at the foot of the page). Nothing at all while the latest block is fresh.
 */
export function Freshness() {
  const { chain, owner, network } = useApp();
  if (!network.deployment) return null;
  const blockTimestamp = chain?.blockTimestamp ?? owner?.blockTimestamp ?? null;
  if (blockTimestamp === null || !rpcBehind(blockTimestamp, Date.now())) return null;
  return (
    <div class="wrap stale-wrap">
      <StaleNotice blockTimestamp={blockTimestamp} nowMs={Date.now()} />
    </div>
  );
}

/**
 * The last read's failure, under the figures it speaks of. CR-77 item 6 deleted the line that said
 * when the figures were read and offered "Read now"; the figures are still read again every 15
 * seconds and after every transaction, as they were. The box keeps its name and its `data-block`,
 * which the review drivers in `scripts/` use to tell that a read has landed, and it is empty — and
 * then takes no space at all (`.read-line:empty`) — on a page with nothing to report.
 */
function ReadLine() {
  const { chain, data, network } = useApp();
  if (!network.deployment) return null;
  return (
    <div class="wrap read-line" data-block={chain ? chain.blockNumber.toString() : ''}>
      {data.error && chain && <p class="small read-error">The last read failed: {data.error} The figures above are from the read before.</p>}
    </div>
  );
}

