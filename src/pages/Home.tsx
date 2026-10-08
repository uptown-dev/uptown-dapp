import { useApp, Term, Panel, SampleBadge, BellNow, Notice } from '../components/ui';
import {
  Skyline,
  GateArt,
  MarketArt,
  FurnaceArt,
  GranaryArt,
  TownHallArt,
  TowerArt,
  FoundationArt,
  FlowMapWide,
  AgeThumb,
  Bellamy,
  type FloorView,
} from '../components/art';
import { AGES, FLOORS } from '../content/town';
import { TIERS } from '../data/types';
import { ageIndex, budgetState, burned, leftToBurn, tierEmpty, unpaidStream } from '../lib/derive';
import { bellName, fmtEth, fmtInt, fmtTown } from '../lib/format';

export function Home() {
  const { chain } = useApp();
  const c = chain.hook.currentCycle;
  const age = ageIndex(c);
  const ageInfo = AGES[age];

  return (
    <>
      <header class="page-hero home-hero">
        <div class="wrap">
          <div>
            <p class="kicker">A town on Ethereum · TOWN, the UpTown Token</p>
            <h1>UpTown.</h1>
            <p class="lead" style="font-size:1.32rem;color:var(--gold-soft);margin-bottom:0.6em">
              Built once. Sealed for a decade. Run by no one.
            </p>
            <p class="lead">
              A town on Ethereum with a <Term slug="charter">Charter</Term> no one can change. Arrive at the <Term slug="gate">Gate</Term>, sign the{' '}
              <Term slug="ledger">Ledger</Term>, collect from the <Term slug="granary">Granary</Term>, take a home in the <Term slug="tower">Tower</Term>.
            </p>
            <p class="small muted" style="max-width:60ch">
              In plain words: no one can change the rules of the seven contracts. The project owner (the <Term slug="mayor">Mayor</Term>) does keep a short,
              published list of powers and earns an income from fees. <a href="#/mayor">Read the Mayor's ring and purse</a>.
            </p>
            <div class="btn-row" style="margin-top:18px">
              <a class="btn btn-gold" href="#/gate">
                Arrive at the Gate
              </a>
              <a class="btn btn-ghost" href="#/notice">
                Read the risks first
              </a>
            </div>
            <BellNow />
          </div>
          <div class="hero-art" style="max-width:640px">
            <Skyline age={age} title={`The UpTown skyline in the Age of ${ageInfo.name}`} />
          </div>
        </div>
      </header>

      <BellReport />

      <section class="section" aria-labelledby="story-title">
        <div class="wrap">
          <div class="grid grid-2" style="align-items:start">
            <div>
              <p class="kicker">The founding story</p>
              <h2 id="story-title">The Lowlands, and the town that refused keys</h2>
              <div class="story">
                <p>
                  Before UpTown there were the Lowlands: towns thrown up overnight on the flats of the chain. Each had a founder with a ring of keys. One key
                  could print more coin. One could raise the tolls. One could lock the gates. One could drain the well. Sooner or later, in the dark, a founder
                  used them all and walked out with the town in a sack. The Lowlands learned a hard saying: <em>whoever holds the keys holds the town.</em>
                </p>
                <p>
                  One builder refused to make keys. Nobody remembers <Term slug="architect">the Architect's</Term> face, only the plan: a town with a written
                  Charter instead of a key ring. One billion <Term slug="bricks">bricks</Term> fired once, and the kiln broken. Half laid as the town's only
                  foundation, <Term slug="market-street">Market Street</Term>; the other half stored in a Granary for those who came to build. A Gate with no
                  master, keeping a Ledger of every arrival and taking a small toll from everyone who passed. The foundation sealed in bedrock for ten years.
                  And no one holding a key that could change any of it.
                </p>
              </div>
            </div>
            <div>
              <div class="story">
                <h3 style="font-size:1.15rem">
                  <Term slug="night-of-one-transaction">The Night of One Transaction</Term>
                </h3>
                <p>
                  The Architect did not build UpTown brick by brick, where a thief could watch and wait. The whole town rose in a single breath: the Gate
                  opened, the foundation was laid and sealed, the Granary was filled, every clock was set to the same second, and the leftover dust was swept
                  into the fire. By sunrise the Architect was gone, empty-handed, holding no keys. That moment is <strong>Bell Zero</strong>, and the town
                  counts every day from it.
                </p>
                <h3 style="font-size:1.15rem">Up from here</h3>
                <p>
                  UpTown was founded at street level, on bare ground, with no ETH beneath it. Every arrival adds a floor to the skyline; every departure feeds
                  the <Term slug="furnace">Furnace</Term>; and the Charter keeps the whole thing honest for as long as the chain runs.
                </p>
              </div>
              <Notice kind="lore" title="The story, and what it is not">
                <p class="small">
                  "Founded at street level" describes how the trading pool opened: with TOWN only and no ETH. It says nothing about where the price goes. A
                  buyer who paid more than the starting price can lose money, and the dollar value of TOWN moves with ETH.
                </p>
              </Notice>
            </div>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="charter-title">
        <div class="wrap grid grid-2" style="align-items:center">
          <div class="charter-tablet">
            <h2 id="charter-title">The Charter</h2>
            <ul class="rules">
              <li>No mint.</li>
              <li>No upgrades.</li>
              <li>No pause.</li>
              <li>No fee setters.</li>
            </ul>
            <p class="engraved">The keys that ruined the Lowlands were never cut.</p>
          </div>
          <div>
            <h3>What the Charter fixes, in plain words</h3>
            <ul class="story" style="padding-left:1.2em;font-size:1rem">
              <li>There will only ever be 1,000,000,000 TOWN. No function can make more.</li>
              <li>No contract can be upgraded, replaced or paused. Trading cannot be stopped.</li>
              <li>The fees are fixed in the code: 2% of the ETH on every buy, 2% of the TOWN on every sell (burned), and a 5% fee on every rebate claim.</li>
              <li>The pool's liquidity is locked for at least ten years. The lock can be lengthened, never shortened.</li>
              <li>The rebate reserve of 500,000,000 TOWN can only leave through buyers' claims.</li>
            </ul>
            <p class="muted">
              What the Charter does not remove: the owner's short ring of powers (a spend rate, a fallback price, a feed change, its own income, the lock) and
              the owner's income from fees. Both are listed in full on <a href="#/mayor">the Mayor's page</a>.
            </p>
          </div>
        </div>
      </section>

      <Places />

      <section class="section" aria-labelledby="map-title">
        <div class="wrap">
          <div class="section-head">
            <h2 id="map-title">How the town's money moves</h2>
            <p class="muted small">Every trade passes the Gate, which feeds the Town Hall and the Furnace.</p>
          </div>
          <div class="panel flow-figure flow-wide">
            <FlowMapWide />
          </div>
          <ol class="flow-list story">
            <li>A Builder buys TOWN on Market Street through the Gate. 2% of the ETH paid goes to the Town Hall, and the buy is written in the Ledger.</li>
            <li>A Departure sells TOWN through the Gate. 2% of the TOWN sold is burned in the Furnace, until the Cornerstone Million is reached.</li>
            <li>The Town Hall keeps 10% of every ETH arriving for the owner. Once a Bell, a share of the rest goes down the Aqueduct to the Tower as WETH.</li>
            <li>Residents pay rent once, in ETH, to the Town Hall when they open or climb a vault.</li>
            <li>The Granary pays Builders their rebates two Bells later, from the Ledger, and sends one twentieth of each claim to the Town Hall for the owner.</li>
            <li>The pool's liquidity sits in the Sealed Foundation for at least ten years; the owner collects its trading fees.</li>
          </ol>
        </div>
      </section>

      <Ages />
    </>
  );
}

function BellReport() {
  const { chain } = useApp();
  const c = chain.hook.currentCycle;
  const b = budgetState(chain);
  const vaults = TIERS.reduce((a, t) => a + chain.staking.tierVaults[t], 0);
  return (
    <section class="section" aria-labelledby="report-title" style="padding-top:8px">
      <div class="wrap">
        <div class="panel" style="display:grid;gap:16px;grid-template-columns:minmax(0,1fr)">
          <div class="panel-head">
            <h2 id="report-title" style="margin:0;font-size:1.3rem">
              Coo. {bellName(c)}.
            </h2>
            <SampleBadge />
          </div>
          <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
            <svg viewBox="-50 -48 90 64" width="96" height="68" aria-hidden="true" style="flex:none">
              <rect x="-50" y="12" width="90" height="3" fill="#b5462f" />
              <Bellamy x={0} y={10} scale={1} />
            </svg>
            <ul class="story" style="margin:0;padding-left:1.1em;flex:1 1 300px;font-size:1rem">
              <li>
                {b.kind === 'delivered' && (
                  <>
                    {bellName(c)} has rung. The <Term slug="aqueduct">Aqueduct</Term> carried <span class="num">{fmtEth(b.amount)}</span> WETH to the Tower.
                  </>
                )}
                {b.kind === 'below-minimum' && (
                  <>
                    {bellName(c)} has rung, but its budget of <span class="num">{fmtEth(b.amount)}</span> ETH is under the 0.001 ETH minimum. It waits in the
                    Fountain for the next Bell.
                  </>
                )}
                {b.kind === 'waiting' && (
                  <>
                    Nobody has pulled the <Term slug="bellringer">bell rope</Term> yet this Bell. The first pull sends the day's delivery to the Tower.{' '}
                    <a href="#/town-hall">Ring it at the Town Hall</a>.
                  </>
                )}
              </li>
              <li>
                The Furnace has taken <span class="num">{fmtTown(burned(chain))}</span> TOWN; <span class="num">{fmtTown(leftToBurn(chain))}</span> bricks
                remain above the <Term slug="cornerstone">Cornerstone</Term>.
              </li>
              <li>
                {c >= 2 ? (
                  <>
                    The Granary is open for {bellName(c - 2)} and every Bell before it.
                  </>
                ) : (
                  <>
                    The Granary first opens at Bell 2, the <Term slug="first-harvest">First Harvest</Term>, for rebates from Bell Zero.
                  </>
                )}
              </li>
              <li>
                <span class="num">{fmtInt(vaults)}</span> Residents live in the Tower.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Places() {
  const { chain, wallet } = useApp();
  const floors: FloorView[] = TIERS.map((t) => ({
    lit: Math.min(6, chain.staking.tierVaults[t]),
    empty: tierEmpty(chain, t),
    pile: tierEmpty(chain, t) && unpaidStream(chain, t) > 0n,
    mine: wallet?.positionOf.tier === t,
    name: FLOORS[t].name,
  }));
  const places = [
    {
      name: 'The Gate',
      art: <GateArt />,
      lore: 'Every trade on Market Street passes through the Gate. It takes a toll from arrivals, leaves departures\' bricks for the Furnace, and writes the Ledger. It keeps no money, answers to no one and cannot be bribed, rebuilt or closed.',
      really: 'TownHook, the Uniswap v4 hook on the TOWN pool: the 2% buy fee in ETH, the 2% sell fee burned, the buy tally. No owner.',
      href: '#/gate',
    },
    {
      name: 'Market Street',
      art: <MarketArt />,
      lore: 'The town\'s only foundation: 500,000,000 TOWN laid at street level with no ETH beneath it. Beyond the walls anyone can open a Shadow Market that skips the Gate, but trades there are never written in the Ledger.',
      really: 'The ETH/TOWN pool on Uniswap v4. No other liquidity can ever be added to it. Other pools can exist; they pay no Gate fees and earn no rebates.',
      href: '#/gate',
    },
    {
      name: 'The Furnace',
      art: <FurnaceArt />,
      lore: 'The Furnace burns the bricks departures leave at the Gate until only the Cornerstone Million is left. Then it goes cold for good.',
      really: 'The 2% sell fee, burned. It stops once total supply is down to 1,000,000 TOWN. Anyone may also burn their own TOWN by choice.',
      href: '#/records',
    },
    {
      name: 'The Granary',
      art: <GranaryArt />,
      lore: 'The other 500,000,000 TOWN, kept to pay back the people who built the town: up to 5% of what each carried in, limited by the day\'s ration, two Bells later.',
      really: 'BuyerRewards, the rebate reserve. Claims are the only way out; 5% of each claim goes to the owner. No owner, and rebates never expire.',
      href: '#/granary',
    },
    {
      name: 'Town Hall and the Fountain',
      art: <TownHallArt />,
      lore: 'Every toll and every rent lands here. One tenth goes into the Mayor\'s Purse; the rest fills the Fountain, which sends a measured share down the Aqueduct to the Tower when the bell is rung.',
      really: 'The Treasury: 10% of all ETH arriving is the owner\'s; once a day, 10% of the rest (the owner may set 1% to 25%) goes to stakers as WETH.',
      href: '#/town-hall',
    },
    {
      name: 'The Tower',
      art: <TowerArt floors={floors} vane="ok" title="The Tower" />,
      lore: 'Five floors from the Stoop to the Crown. Residents pay rent once and store TOWN inside. Every delivery is split by floor height, then shared by what each Resident stores.',
      really: 'TownStaking: five vault tiers, priced $5 to $50 in ETH; each day\'s WETH is split 100:125:150:175:200 between them and streamed over 7 days.',
      href: '#/tower',
    },
    {
      name: 'The Sealed Foundation',
      art: <FoundationArt />,
      lore: 'Beneath Market Street lies the deed to the town\'s only foundation, sealed in bedrock for ten years. The Mayor may only sweep up the dust of trading, never lift a stone.',
      really: 'LPVault holds the pool\'s liquidity position for at least 3,650 days. The owner can collect the pool\'s trading fees and extend the lock, nothing more.',
      href: '#/records',
    },
  ];
  return (
    <section class="section" aria-labelledby="places-title">
      <div class="wrap">
        <div class="section-head">
          <h2 id="places-title">The seven places</h2>
          <p class="muted small">Each landmark behaves exactly as its contract does.</p>
        </div>
        <div class="grid grid-3">
          {places.map((p) => (
            <article class="panel place-card" key={p.name}>
              <div class="place-art">{p.art}</div>
              <h3>
                <a href={p.href} style="color:inherit;text-decoration:none">
                  {p.name}
                </a>
              </h3>
              <p class="story" style="font-size:0.98rem;margin:0">
                {p.lore}
              </p>
              <p class="really">
                <strong>What it really is: </strong>
                {p.really}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Ages() {
  const { chain } = useApp();
  const c = chain.hook.currentCycle;
  const current = ageIndex(c);
  return (
    <section class="section" aria-labelledby="ages-title">
      <div class="wrap grid grid-2" style="align-items:start">
        <div>
          <p class="kicker">Time in UpTown</p>
          <h2 id="ages-title">The Ages of Construction</h2>
          <p class="story">
            The Granary's daily <Term slug="ration">ration</Term> halves every 100 Bells as the Tower nears completion. A ration is a ceiling, not a promise:
            each Bell, the Granary pays out the smaller of its ration and 5% of everything Builders carried in that Bell. What a Bell does not use stays in the
            Granary and lengthens the Long Lights.
          </p>
          <p class="muted">
            {bellName(c)} falls in the Age of <strong style="color:var(--gold-soft)">{AGES[current].name}</strong>. <SampleBadge />
          </p>
          <h3 style="margin-top:20px">Other days the town marks</h3>
          <ul class="story" style="font-size:1rem;padding-left:1.1em">
            <li>
              <strong>Bell 2, <Term slug="first-harvest">First Harvest</Term>.</strong> The Granary opens for the first time, for rebates from Bell Zero.
            </li>
            <li>
              <strong>Bell 365, Founding Anniversary.</strong>
            </li>
            <li>
              <strong>
                <Term slug="cornerstone-day">Cornerstone Day</Term>.
              </strong>{' '}
              The day total supply reaches the Cornerstone Million and the Furnace goes cold. No one can know when, or whether, it comes.
            </li>
            <li>
              <strong>
                <Term slug="first-crown">First Crown</Term>.
              </strong>{' '}
              The first Resident to move into an empty floor starts receiving its pile at the door.
            </li>
            <li>
              <strong>
                <Term slug="seal-day">Seal Day</Term>, Bell 3,650.
              </strong>{' '}
              The earliest the Sealed Foundation can open, unless the owner lengthens the seal first.
            </li>
          </ul>
        </div>
        <Panel title="The Ages" headingLevel={3}>
          <ol class="ages">
            {AGES.map((a, i) => {
              const cls = i === current ? 'age current' : i < current ? 'age past' : 'age';
              const ration = chain.rewards.cap[a.first];
              return (
                <li class={cls} key={a.name} aria-current={i === current ? 'step' : undefined}>
                  <div class="age-art">
                    <AgeThumb age={i} label={`Skyline in ${a.name}`} />
                  </div>
                  <div>
                    <h3>
                      {a.numeral ? `${a.numeral}. ` : ''}
                      {a.name}
                      {i === current && <span class="now-pill">Now</span>}
                    </h3>
                    <div class="meta">
                      Bells {fmtInt(a.first)}
                      {a.last !== null ? ` to ${fmtInt(a.last)}` : ' onward'} · ration <span class="num">{ration !== undefined ? fmtTown(ration) : '—'}</span> TOWN a
                      Bell
                    </div>
                    <div class="meta faint">{a.ceremony}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>
    </section>
  );
}
