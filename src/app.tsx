import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getAddress } from 'viem';
import { AppContext, Notice, PageHead, useApp, type AppState, type DataStatus } from './components/ui';
import { CloseIcon, ExternalIcon, MenuIcon, DarkModeIcon, LightModeIcon, TowerGlyph } from './components/icons';
import { CONTRACT_NAMES, type Address, type ChainState, type WalletState } from './data/types';
import { NETWORK, contractUrl } from './lib/network';
import { makeClient, readAll } from './lib/reads';
import { injectedProvider, switchWalletChain } from './lib/wallet';
import { explainError } from './lib/errors';
import { dayName, fmtInt, shortAddress } from './lib/format';
import { chooseTheme, currentTheme, storedTheme, type Theme } from './lib/theme';
import { Home } from './pages/Home';
import { Buy } from './pages/Buy';
import { Rewards } from './pages/Rewards';
import { Stake } from './pages/Stake';
import { Stats } from './pages/Stats';
import { Docs } from './pages/Docs';

const NAV: { page: string; label: string; title: string }[] = [
  { page: '', label: 'Home', title: 'UpTown (TOWN)' },
  { page: 'buy', label: 'Buy', title: 'Buy TOWN · UpTown' },
  { page: 'rewards', label: 'Rewards', title: 'Buyer rebates · UpTown' },
  { page: 'stake', label: 'Stake', title: 'Stake TOWN · UpTown' },
  { page: 'stats', label: 'Stats', title: 'Treasury and stats · UpTown' },
  { page: 'docs', label: 'Docs', title: 'Docs · UpTown' },
];

/** Pages made of live figures: shown once the figures have been read. */
const LIVE_PAGES = new Set(['buy', 'rewards', 'stake', 'stats']);

/** How often the figures are read again while the page is open (and after every transaction). */
const REFRESH_MS = 15_000;

/** The local test wallet last picked (a convenience on this computer only). */
const LOCAL_WALLET_KEY = 'uptown-local-wallet';

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
  const [hash, setHash] = useState<string>(() => window.location.hash);
  const { page, section } = parseHash(hash);
  const [navOpen, setNavOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [account, setAccount] = useState<Address | null>(() => storedLocalWallet());
  const [walletChain, setWalletChain] = useState<number | null>(null);
  const [chain, setChain] = useState<ChainState | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
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
        setData({ state: 'ready', error: null, readAt: Date.now() });
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

  // ---- the injected wallet (public networks) -------------------------------------------------
  useEffect(() => {
    if (network.local) return;
    const p = injectedProvider();
    if (!p) return;
    const onAccounts = (a: unknown) => {
      const list = a as string[];
      setAccount(list && list.length ? getAddress(list[0]) : null);
    };
    const onChain = (id: unknown) => setWalletChain(Number(id));
    // Restore a connection the visitor already granted, without asking again.
    p.request({ method: 'eth_accounts' }).then(onAccounts, () => {});
    p.request({ method: 'eth_chainId' }).then(onChain, () => {});
    p.on?.('accountsChanged', onAccounts);
    p.on?.('chainChanged', onChain);
    return () => {
      p.removeListener?.('accountsChanged', onAccounts);
      p.removeListener?.('chainChanged', onChain);
    };
  }, [network]);

  const connect = useCallback(() => {
    if (network.local) {
      setPickerOpen(true);
      return;
    }
    const p = injectedProvider();
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
  }, [network, toast]);

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

  // ---- page and theme --------------------------------------------------------------------------
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
    account,
    accountLabel,
    data,
    client,
    refresh,
    connect,
    disconnect: () => (network.local ? pickLocal(null) : setAccount(null)),
    wrongNetwork,
    switchNetwork: () => {
      switchWalletChain(network).catch((e) => toast(explainError(e).message));
    },
    toast,
  };

  const view = (() => {
    if (LIVE_PAGES.has(page) && !chain) return <ChainPending title={NAV.find((n) => n.page === page)!.label} data={data} onRetry={refresh} />;
    switch (page) {
      case 'buy':
        return <Buy />;
      case 'rewards':
        return <Rewards />;
      case 'stake':
        return <Stake />;
      case 'stats':
        return <Stats />;
      case 'docs':
        return <Docs />;
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

      {network.local && (
        <div class="chain-bar" role="note">
          <div class="wrap">
            <span class="chain-tag">Local test chain</span>
            <span class="chain-note">A private copy of Ethereum on this computer (chain ID {network.chainId}). Test wallets only; nothing here is real.</span>
          </div>
        </div>
      )}

      <header class="site-header">
        <div class="wrap header-row">
          <a class="wordmark" href="#/" aria-label="UpTown, home">
            <TowerGlyph />
            <span>UpTown</span>
          </a>
          <nav class={`site-nav${navOpen ? ' open' : ''}`} id="site-nav" aria-label="Main">
            <ul>
              {NAV.map((n) => (
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
              {wrongNetwork ? (
                <button type="button" class="btn btn-small btn-primary wallet-btn" onClick={state.switchNetwork}>
                  Switch to {network.name}
                </button>
              ) : (
                <button
                  type="button"
                  class={`btn btn-small ${account ? 'btn-secondary' : 'btn-primary'} wallet-btn`}
                  aria-expanded={pickerOpen}
                  aria-haspopup={account || network.local ? 'menu' : undefined}
                  onClick={() => (account || network.local ? setPickerOpen((o) => !o) : connect())}
                  aria-label={account ? `Wallet ${account}${accountLabel ? ` (${accountLabel})` : ''} connected. Select to change or disconnect.` : network.local ? 'Pick a local test wallet' : 'Connect wallet'}
                >
                  {account ? (
                    <>
                      <span class="dot" aria-hidden="true" />
                      {shortAddress(account)}
                    </>
                  ) : network.local ? (
                    'Pick a test wallet'
                  ) : (
                    'Connect wallet'
                  )}
                </button>
              )}
              {pickerOpen && (
                <div class="wallet-menu" role="menu" aria-label={network.local ? 'Local test wallets' : 'Wallet'}>
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
        {view}
        <ReadLine />
      </main>

      <footer class="site-footer">
        <div class="wrap footer-grid">
          <div class="footer-brand">
            <a class="wordmark small" href="#/" aria-label="UpTown, home">
              <TowerGlyph />
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
      <PageHead title={title} lead={data.state === 'not-deployed' ? `UpTown on ${n.name}.` : 'Reading the figures from the contracts.'} />
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

/** When the figures were last read, and from which block; a refresh button; the last error. */
function ReadLine() {
  const { chain, data, network, refresh } = useApp();
  if (!network.deployment) return null;
  const at = data.readAt ? new Date(data.readAt) : null;
  const time = at ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}:${String(at.getSeconds()).padStart(2, '0')}` : null;
  return (
    <div class="wrap read-line" data-block={chain ? chain.blockNumber.toString() : ''}>
      <p class="small faint">
        {chain && time ? (
          <>
            Figures read from {network.name} at block <span class="num">{fmtInt(Number(chain.blockNumber))}</span>, {time} your time; read again every 15 seconds
            and after each transaction.{' '}
          </>
        ) : (
          'Reading the figures… '
        )}
        <button type="button" class="link-btn" onClick={() => void refresh()}>
          Read now
        </button>
      </p>
      {data.error && chain && <p class="small read-error">The last read failed: {data.error} The figures above are from the read before.</p>}
    </div>
  );
}

