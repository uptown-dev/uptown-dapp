// Fixed text for the Docs page: the owner's powers (spec "Owner powers", complete, in compact
// form), what the owner cannot do, and the practical things to know (CR-40). Nothing here is a
// live figure.

export interface OwnerPower {
  power: string;
  contract: string;
  delay: string;
  worstCase: string;
}

/** The spec's "Owner powers" table, complete, in short words. */
export const OWNER_POWERS: OwnerPower[] = [
  { power: 'Collect the pool’s trading fees (the 0.5% pool fee)', contract: 'LPVault', delay: 'None', worstCase: 'None; this is owner income.' },
  { power: 'Extend the liquidity lock', contract: 'LPVault', delay: 'None', worstCase: 'Liquidity stays locked longer.' },
  { power: 'Withdraw the liquidity position', contract: 'LPVault', delay: 'Only after the unlock time (10 years)', worstCase: 'Liquidity removed after 10 years.' },
  {
    power: 'Change the daily payout rate, 1% to 25%',
    contract: 'Treasury',
    delay: 'From the next day',
    worstCase: 'Payouts slow to 1% or speed up to 25% of the balance per day; the ETH still goes only to stakers.',
  },
  { power: 'Withdraw the ETH owner reserve', contract: 'Treasury', delay: 'None', worstCase: 'Nothing beyond the 10% reserve; this is owner income.' },
  { power: 'Withdraw the TOWN claim fees', contract: 'Treasury', delay: 'None', worstCase: 'None; this is owner income.' },
  { power: 'Launch, once', contract: 'Launcher', delay: 'None', worstCase: 'The launch happens at a time the owner did not intend; it cannot be repeated.' },
  {
    power: 'Set a fallback ETH/USD price for vault purchases',
    contract: 'TownStaking',
    delay: 'None; used only while the Chainlink feed is unhealthy, up to 7 days from each setting',
    worstCase:
      'Vault prices miss their dollar targets during the outage; a near-free vault could collect an empty tier’s waiting ETH cheaply (a zero price is refused). Stakes and earned WETH are untouched.',
  },
  {
    power: 'Replace the ETH/USD price feed',
    contract: 'TownStaking',
    delay: '7 days',
    worstCase: 'A wrong feed misprices vaults after the delay, as a wrong fallback price would. Stakes and earned WETH are untouched.',
  },
  {
    power: 'Transfer ownership (offer, then the new owner accepts)',
    contract: 'LPVault, Treasury, TownStaking',
    delay: 'None',
    worstCase: 'Every other power in this list passes to the new owner.',
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

/** Things to know: practical points only, one line each (CR-40). */
export const THINGS_TO_KNOW: { title: string; body: string }[] = [
  { title: 'Payouts depend on trading', body: 'Rebates and stakers’ ETH come only from buys and sells, so they can be small or none.' },
  { title: 'Rebates are a ceiling', body: 'At most 4.75% of what you buy; less on busy days, and less or nothing near the end of the reserve.' },
  { title: 'Gas costs real money', body: 'Every buy, claim and vault action costs Ethereum gas, which can be more than a small reward.' },
  { title: 'The vault price is paid once', body: 'It goes to the treasury and is not refunded when you unstake; unstaking gives back your TOWN.' },
  { title: 'The contracts cannot be changed', body: 'No upgrades and no pause, so a flaw could never be fixed.' },
  {
    title: 'Vault prices use Chainlink',
    body: 'If the ETH/USD feed is unhealthy, the owner’s fallback price is used for up to 7 days; with neither, opening and upgrading vaults pause.',
  },
  { title: 'Buy on this site', body: 'A buy here names your wallet, so the rebate is credited to you; through other apps it may be credited to someone else.' },
];
