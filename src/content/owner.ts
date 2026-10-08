// Fixed text: the owner's powers (spec "Owner powers", complete), what the owner cannot do, and
// the risks in short plain words (spec "Known risks"). Nothing here is a live figure.

export interface OwnerPower {
  power: string;
  contract: string;
  delay: string;
  worstCase: string;
}

/** The spec's "Owner powers" table, complete. */
export const OWNER_POWERS: OwnerPower[] = [
  { power: 'Collect the pool’s trading fees (the 0.5% pool fee)', contract: 'LPVault', delay: 'None', worstCase: 'None; this is owner income.' },
  { power: 'Extend the liquidity lock', contract: 'LPVault', delay: 'None', worstCase: 'Liquidity stays locked longer.' },
  { power: 'Withdraw the liquidity position', contract: 'LPVault', delay: 'Only after the unlock time (10 years)', worstCase: 'Liquidity removed after 10 years.' },
  {
    power: 'Change the daily payout rate, 1% to 25%',
    contract: 'Treasury',
    delay: 'From the next day',
    worstCase: 'Payouts slow to 1% or speed up to 25% of the balance per day. The ETH still goes only to stakers.',
  },
  { power: 'Withdraw the ETH owner reserve', contract: 'Treasury', delay: 'None', worstCase: 'Nothing beyond the 10% reserve; this is owner income.' },
  { power: 'Withdraw the TOWN claim fees', contract: 'Treasury', delay: 'None', worstCase: 'None; this is owner income.' },
  { power: 'Launch, once', contract: 'Launcher', delay: 'None', worstCase: 'The launch happens at a time the owner did not intend. It cannot be repeated.' },
  {
    power: 'Set a fallback ETH/USD price for vault purchases',
    contract: 'TownStaking',
    delay: 'None; used only while the Chainlink feed is unhealthy, for at most 7 days from each setting',
    worstCase:
      'Vault prices depart from their dollar targets during a feed outage; a near-free vault would let its buyer collect an empty tier’s waiting ETH cheaply (a zero price is refused). Existing stakes and earned WETH are untouched.',
  },
  {
    power: 'Replace the ETH/USD price feed',
    contract: 'TownStaking',
    delay: '7 days',
    worstCase: 'A wrong feed misprices vaults after the delay, as a wrong fallback price would. Existing stakes and earned WETH are untouched.',
  },
  {
    power: 'Transfer ownership (offer, then the new owner accepts)',
    contract: 'LPVault, Treasury, TownStaking',
    delay: 'None',
    worstCase: 'Every other power in this table passes to the new owner.',
  },
];

/** What the owner cannot do (spec "Owner powers", last paragraph). */
export const OWNER_CANNOT: string[] = [
  'mint TOWN',
  'change any fee',
  'pause trading',
  'upgrade or replace any contract',
  'touch the 500,000,000 TOWN rebate reserve',
  'take treasury ETH beyond the 10% owner reserve',
  'move anyone’s staked TOWN',
  'change the vault tiers or their dollar prices',
];

/** The risks, one short line each (spec "Known risks"). */
export const RISKS: { title: string; body: string }[] = [
  { title: 'No promise about price', body: 'Nothing here says what TOWN will be worth. Its price can fall and you can lose money.' },
  { title: 'Staker payouts can fall to nothing', body: 'Stakers’ ETH comes only from trading. A quiet day pays little; a budget under 0.001 ETH pays nothing that day.' },
  {
    title: 'Rebates have limits',
    body: 'At most 4.75% of what you buy, less on busy days. The daily limit halves every 100 days, and near the end of the reserve a day claimed late can get less or nothing.',
  },
  { title: 'Gas costs real money', body: 'Every action costs Ethereum gas, often several dollars. Small buys, claims and vaults may not cover it.' },
  { title: 'The vault price is not refunded', body: 'It is paid once, to the treasury (10% to the owner). Unstaking gives back your TOWN, not the price.' },
  { title: 'Tiers share fixed slices', body: 'A lone staker takes a tier’s whole share of each payout until others join.' },
  { title: 'The code cannot be changed', body: 'No upgrades, no pause, liquidity locked for ten years: a flaw could never be fixed. An audit is planned; no review removes all risk.' },
  { title: 'Vault prices depend on Chainlink', body: 'If the ETH/USD feed is unhealthy, the owner’s fallback price is used or opening and upgrading pause. Nothing else depends on it.' },
  { title: 'Buys elsewhere may not count for you', body: 'Through other apps a buy may be credited to whoever sent the transaction. Other TOWN pools earn no rebates.' },
  { title: 'The owner earns from fees', body: 'The pool fee, 10% of the ETH reaching the treasury and the claim fee go to the owner, who could trade with itself and end up ahead (see above).' },
  { title: 'A thin start', body: 'The whole supply starts valued at about 10 ETH, so large trades change the price sharply. The first 15 minutes carry a very high buy fee.' },
  { title: 'The legal position is open', body: 'How TOWN is treated under the law awaits a lawyer’s opinion. Nothing here is advice; check the rules where you live.' },
];
