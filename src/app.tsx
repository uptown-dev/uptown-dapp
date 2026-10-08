import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULT_SCENARIO_ID, SAMPLE_FIGURES, SCENARIOS, getScenario } from './data/placeholder';
import { AppContext, type AppState } from './components/ui';
import { CloseIcon, MenuIcon, DarkModeIcon, LightModeIcon, TowerGlyph } from './components/icons';
import { dayName, shortAddress } from './lib/format';
import { chooseTheme, currentTheme, storedTheme, type Theme } from './lib/theme';
import { Home } from './pages/Home';
import { Buy } from './pages/Buy';
import { Rewards } from './pages/Rewards';
import { Stake } from './pages/Stake';
import { Stats } from './pages/Stats';
import { Owner } from './pages/Owner';

const NAV: { page: string; label: string; title: string }[] = [
  { page: '', label: 'Home', title: 'UpTown (TOWN)' },
  { page: 'buy', label: 'Buy', title: 'Buy TOWN · UpTown' },
  { page: 'rewards', label: 'Rewards', title: 'Buyer rebates · UpTown' },
  { page: 'stake', label: 'Stake', title: 'Stake TOWN · UpTown' },
  { page: 'stats', label: 'Stats', title: 'Treasury and stats · UpTown' },
  { page: 'owner', label: 'Owner and risks', title: 'Owner and risks · UpTown' },
];

function parseHash(hash: string): string {
  const page = hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  return NAV.some((n) => n.page === page) ? page : '';
}

const SCENARIO_KEY = 'uptown-preview-scenario';

function readStoredScenario(): string {
  // ?scenario=<id> in the address opens a scenario directly (handy for screenshots).
  const fromUrl = new URLSearchParams(window.location.search).get('scenario');
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem(SCENARIO_KEY) ?? DEFAULT_SCENARIO_ID;
  } catch {
    return DEFAULT_SCENARIO_ID;
  }
}

interface Toast {
  id: number;
  message: string;
}

export function App() {
  const [page, setPage] = useState<string>(() => parseHash(window.location.hash));
  const [scenarioId, setScenarioId] = useState<string>(() => getScenario(readStoredScenario()).id);
  const scenario = getScenario(scenarioId);
  const [connected, setConnected] = useState<boolean>(scenario.walletConnected);
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const onHash = () => setPage(parseHash(window.location.hash));
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

  const state: AppState = useMemo(
    () => ({
      scenario,
      chain: scenario.chain,
      wallet: connected ? scenario.wallet : null,
      toggleWallet: () => setConnected((c) => !c),
      setScenario: (id: string) => {
        const next = getScenario(id);
        setScenarioId(next.id);
        setConnected(next.walletConnected);
        try {
          window.localStorage.setItem(SCENARIO_KEY, next.id);
        } catch {
          /* storage unavailable: the choice lasts for this visit only */
        }
      },
      toast: (message: string) => {
        const id = Date.now() + Math.random();
        setToasts((t) => [...t.slice(-2), { id, message }]);
        window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
      },
    }),
    [scenario, connected],
  );

  const view = (() => {
    switch (page) {
      case 'buy':
        return <Buy />;
      case 'rewards':
        return <Rewards />;
      case 'stake':
        return <Stake />;
      case 'stats':
        return <Stats />;
      case 'owner':
        return <Owner />;
      default:
        return <Home />;
    }
  })();

  const c = scenario.chain.hook.currentCycle;
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

      {SAMPLE_FIGURES && (
        <div class="preview-bar" role="region" aria-label="Design preview controls">
          <div class="wrap">
            <span class="preview-tag">Design preview</span>
            <span class="preview-note">Sample figures, not read from the contracts.</span>
            <label class="preview-select">
              <span class="visually-hidden">Preview scenario</span>
              <select value={scenario.id} onChange={(e) => state.setScenario((e.target as HTMLSelectElement).value)} title={scenario.description}>
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
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
            <span class="day-chip" title={`${dayName(c)}: the 24-hour day that began ${c} days after launch`}>
              {dayName(c)}
            </span>
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
            <button
              type="button"
              class={`btn btn-small ${connected ? 'btn-secondary' : 'btn-primary'} wallet-btn`}
              onClick={state.toggleWallet}
              aria-label={connected ? `Wallet ${scenario.wallet.address} connected (sample). Select to disconnect.` : 'Connect wallet (sample)'}
            >
              {connected ? (
                <>
                  <span class="dot" aria-hidden="true" />
                  {shortAddress(scenario.wallet.address)}
                </>
              ) : (
                'Connect wallet'
              )}
            </button>
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

      <main ref={mainRef} tabIndex={-1} id="main">
        {view}
      </main>

      <footer class="site-footer">
        <div class="wrap footer-grid">
          <div class="footer-brand">
            <a class="wordmark small" href="#/" aria-label="UpTown, home">
              <TowerGlyph />
              <span>UpTown</span>
            </a>
            <p>UpTown Token (TOWN) on Ethereum. Nothing on this site is advice or a promise about price.</p>
          </div>
          <nav aria-label="Footer">
            <ul>
              {NAV.slice(1, 5).map((n) => (
                <li key={n.page}>
                  <a href={`#/${n.page}`}>{n.label}</a>
                </li>
              ))}
              <li>
                <a href="#/owner" class="footer-strong">
                  Owner and risks
                </a>
              </li>
            </ul>
          </nav>
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
