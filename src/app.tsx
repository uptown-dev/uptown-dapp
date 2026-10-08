import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULT_SCENARIO_ID, SAMPLE_FIGURES, SCENARIOS, getScenario } from './data/placeholder';
import { AppContext, type AppState } from './components/ui';
import { BellIcon, TowerGlyph, BellamyBadge, Skyline } from './components/art';
import { bellName, shortAddress } from './lib/format';
import { ageIndex } from './lib/derive';
import { Home } from './pages/Home';
import { Gate } from './pages/Gate';
import { Granary } from './pages/Granary';
import { Tower } from './pages/Tower';
import { TownHall } from './pages/TownHall';
import { Stats } from './pages/Stats';
import { Mayor } from './pages/Mayor';
import { NoticePage } from './pages/Notice';
import { Glossary } from './pages/Glossary';

interface Route {
  page: string;
  param: string | null;
}

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { page: parts[0] ?? '', param: parts[1] ?? null };
}

const NAV: { page: string; label: string; plain: string }[] = [
  { page: '', label: 'The Town', plain: 'Home' },
  { page: 'gate', label: 'The Gate', plain: 'Buy TOWN' },
  { page: 'granary', label: 'The Granary', plain: 'Rebates' },
  { page: 'tower', label: 'The Tower', plain: 'Stake' },
  { page: 'town-hall', label: 'Town Hall', plain: 'Treasury' },
  { page: 'records', label: 'The Records', plain: 'Stats' },
  { page: 'mayor', label: 'The Mayor', plain: 'The owner' },
  { page: 'glossary', label: 'Glossary', plain: 'Lore to plain words' },
];

const PAGE_TITLES: Record<string, string> = {
  '': 'UpTown',
  gate: 'The Gate: buy TOWN · UpTown',
  granary: 'The Granary: rebates · UpTown',
  tower: 'The Tower: staking vaults · UpTown',
  'town-hall': 'Town Hall: the Treasury · UpTown',
  records: 'The Records: stats · UpTown',
  mayor: 'The Mayor: the owner\'s powers and income · UpTown',
  notice: 'Notice and risks · UpTown',
  glossary: 'Glossary · UpTown',
};

const STORAGE_KEY = 'uptown-preview-scenario';

function readStoredScenario(): string {
  // ?scenario=<id> in the address opens a scenario directly (handy for screenshots).
  const fromUrl = new URLSearchParams(window.location.search).get('scenario');
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SCENARIO_ID;
  } catch {
    return DEFAULT_SCENARIO_ID;
  }
}

interface Toast {
  id: number;
  message: string;
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [scenarioId, setScenarioId] = useState<string>(() => getScenario(readStoredScenario()).id);
  const scenario = getScenario(scenarioId);
  const [connected, setConnected] = useState<boolean>(scenario.walletConnected);
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.title = PAGE_TITLES[route.page] ?? 'UpTown';
    setNavOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      if (!route.param) return;
    }
    if (route.page === 'glossary' && route.param) {
      const el = document.getElementById(`g-${route.param}`);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        el.focus({ preventScroll: true });
        return;
      }
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [route.page, route.param]);

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
          window.localStorage.setItem(STORAGE_KEY, next.id);
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

  const page = (() => {
    switch (route.page) {
      case '':
        return <Home />;
      case 'gate':
        return <Gate />;
      case 'granary':
        return <Granary />;
      case 'tower':
        return <Tower />;
      case 'town-hall':
        return <TownHall />;
      case 'records':
        return <Stats />;
      case 'mayor':
        return <Mayor />;
      case 'notice':
        return <NoticePage />;
      case 'glossary':
        return <Glossary highlight={route.param} />;
      default:
        return <Home />;
    }
  })();

  const c = scenario.chain.hook.currentCycle;

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
        <div class="sample-bar" role="region" aria-label="Design preview controls">
          <div class="wrap">
            <strong>DESIGN PREVIEW · SAMPLE FIGURES</strong>
            <label>
              <span>Scenario</span>
              <select value={scenario.id} onChange={(e) => state.setScenario((e.target as HTMLSelectElement).value)}>
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <span class="scenario-note">{scenario.description} No figure on this preview is read from the contracts.</span>
          </div>
        </div>
      )}

      <div class="site-header">
        <div class="wrap">
          <a class="wordmark" href="#/" aria-label="UpTown, home">
            <TowerGlyph />
            <span>UpTown</span>
          </a>
          <nav class={`site-nav${navOpen ? ' open' : ''}`} id="site-nav" aria-label="Main">
            <ul>
              {NAV.map((n) => (
                <li key={n.page}>
                  <a href={`#/${n.page}`} aria-current={route.page === n.page ? 'page' : undefined}>
                    <span>{n.label}</span>
                    <small>{n.plain}</small>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div class="header-tools">
            <span class="bell-chip" title={`Bell ${c}: the 24-hour day that began ${c} days after launch`}>
              <BellIcon />
              {bellName(c)}
            </span>
            <button
              type="button"
              class={`btn btn-small ${connected ? 'btn-ghost' : 'btn-gold'} wallet-btn`}
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
          </div>
          <button
            type="button"
            class="nav-toggle"
            aria-expanded={navOpen}
            aria-controls="site-nav"
            aria-label={navOpen ? 'Close the menu' : 'Open the menu'}
            onClick={() => setNavOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              {navOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <main ref={mainRef} tabIndex={-1} id="main">
        {page}
      </main>

      <footer class="site-footer">
        <div class="footer-skyline" aria-hidden="true">
          <Skyline age={ageIndex(c)} compact showBellamy={false} />
        </div>
        <div class="wrap">
          <div>
            <div style="display:flex;gap:12px;align-items:center">
              <div style="width:90px;flex:none">
                <BellamyBadge />
              </div>
              <p class="small muted" style="margin:0">
                <em>"Up here, everything's on the record."</em> Bellamy reports the town's figures. He never predicts, and nothing on this site promises a price or a reward.
              </p>
            </div>
          </div>
          <div>
            <h2>Read before you act</h2>
            <ul>
              <li>
                <a class="legal-link" href="#/notice">Notice and risks</a>
              </li>
              <li>
                <a href="#/mayor">The owner's powers and income</a>
              </li>
              <li>
                <a href="#/glossary">Glossary: lore to plain words</a>
              </li>
            </ul>
          </div>
          <div>
            <h2>The town</h2>
            <ul>
              {NAV.slice(1, 6).map((n) => (
                <li key={n.page}>
                  <a href={`#/${n.page}`}>
                    {n.label} <span class="faint">({n.plain})</span>
                  </a>
                </li>
              ))}
              <li class="faint small">
                UpTown Token (TOWN) on Ethereum. Fonts under the SIL Open Font Licence:{' '}
                <a href="./licenses/OFL-Cinzel.txt">Cinzel</a>, <a href="./licenses/OFL-SourceSerif4.txt">Source Serif 4</a>,{' '}
                <a href="./licenses/OFL-PublicSans.txt">Public Sans</a>.
              </li>
            </ul>
          </div>
        </div>
      </footer>

      <div class="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div class="toast" key={t.id} role="status">
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
