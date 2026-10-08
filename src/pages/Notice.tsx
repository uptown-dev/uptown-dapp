import { Term, Notice, PageHero, Panel } from '../components/ui';
import { CharterArt } from '../components/art';

const RISKS: { title: string; body: string }[] = [
  {
    title: 'No price promise',
    body: 'Nothing on this site says what TOWN will be worth. Its price can fall as well as rise. The way the pool opened, at street level with no ETH beneath it, says nothing about what you will be able to sell for: a buyer who paid more than the starting price can lose money, and the dollar value of TOWN moves with the price of ETH.',
  },
  {
    title: 'Deliveries to stakers can fall to nothing',
    body: 'The WETH that reaches the Tower comes only from what the Town Hall receives, which depends on trading. A quiet stretch means small deliveries or none; a Bell whose budget is under 0.001 ETH sends nothing that Bell. No figure on this site is a forecast of what a vault will receive.',
  },
  {
    title: 'Rebates are a ceiling',
    body: 'A rebate is at most 5% of the TOWN you bought in a Bell, less the 5% claim fee (4.75% at most), and less whenever 5% of everyone\'s buying is more than that Bell\'s ration. Rations halve every 100 Bells. In the last days of the reserve, Bells are paid in the order they are first claimed, so a Bell claimed late can receive less or nothing.',
  },
  {
    title: 'Gas costs real money',
    body: 'Every buy, sell, claim and Tower action costs gas, paid in ETH, often several dollars on Ethereum and more when the network is busy. Small buys, small claims and small vaults can cost more in gas than they bring back.',
  },
  {
    title: 'Rent is not returned',
    body: 'A vault\'s rent is paid once, in ETH, to the Town Hall, where 10% goes to the owner. Moving out returns your TOWN, not the rent. Staking again means paying rent for a new vault.',
  },
  {
    title: 'Floors share by fixed slices',
    body: 'Each floor receives a fixed share of every delivery, however many Residents it has. A lone Resident on a floor takes that floor\'s whole share until others join, and the first to join an empty floor starts receiving its pile at the door. What you receive changes as others move in and out.',
  },
  {
    title: 'The code cannot be changed',
    body: 'No contract can be upgraded or paused, and the liquidity is locked for at least ten years. That protects the rules, and it also means a flaw could never be fixed. For that reason the plan is an independent audit before launch, but no review removes all risk.',
  },
  {
    title: 'Vault prices depend on Chainlink',
    body: 'Vault rents are priced through Chainlink\'s ETH/USD feed. If it stops updating, rents use the owner\'s fallback price for up to 7 days at a time, or opening and climbing vaults pause. Trading, rebates, adding TOWN, moving out and collecting never depend on the feed.',
  },
  {
    title: 'Buys elsewhere may be credited to someone else',
    body: 'A buy made on this site is always credited to your wallet. A buy made through another app, an aggregator, a smart-account service or a relayer may be credited to that service or to whoever sent the transaction. Trades in other TOWN pools (Shadow Markets) earn no rebates at all.',
  },
  {
    title: 'The owner earns from fees',
    body: 'The owner receives the pool\'s 0.5% trading fee, 10% of all ETH reaching the Town Hall, and the 5% claim fee. Because those fees come back to the owner, the owner could trade with itself and come out ahead at the rebate reserve\'s expense; nothing on chain prevents it. The owner publishes a commitment not to do so.',
  },
  {
    title: 'A thin start',
    body: 'At the starting price the whole supply is valued at about 10 ETH, so early buys move the price a long way. During the first fifteen minutes the Dawn Toll makes buying very expensive on purpose.',
  },
  {
    title: 'The legal position is open',
    body: 'Whether paying WETH to stakers from trading fees, and the owner\'s income from fees, affect how TOWN is treated under the law is a question for the owner\'s lawyer, and it is not yet answered. Nothing on this site is advice of any kind. Check the rules where you live before you take part.',
  },
];

export function NoticePage() {
  return (
    <>
      <PageHero
        kicker="Notice and risks"
        title="Read before you act"
        lead={<>UpTown's story is a costume for what the contracts do. This page says, in plain words, what they do not do.</>}
        art={<CharterArt />}
      />
      <section class="section" style="padding-top:0">
        <div class="wrap">
          <Notice kind="placeholder" title="Legal notice">
            <p>
              <strong>[Placeholder: the legal wording required by the owner's lawyer goes here. This box is not legal text and will be replaced before
              launch.]</strong>
            </p>
          </Notice>
        </div>
      </section>
      <section class="section" aria-labelledby="risks-title">
        <div class="wrap">
          <div class="section-head">
            <h2 id="risks-title">The risks, in plain words</h2>
          </div>
          <div class="grid grid-2">
            {RISKS.map((r) => (
              <Panel title={r.title} sample={false} key={r.title}>
                <p style="margin:0">{r.body}</p>
              </Panel>
            ))}
          </div>
          <p class="muted" style="margin-top:20px">
            Lore words on this site, such as <Term slug="granary">the Granary</Term> or <Term slug="water">water</Term>, are explained in the{' '}
            <a href="#/glossary">glossary</a>. The owner's complete powers and income are on <a href="#/mayor">the Mayor's page</a>.
          </p>
        </div>
      </section>
    </>
  );
}
