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
    worstCase:
      'Payouts slow to 1% or speed up to 25% of the balance per day; the ETH still goes only to the current staking contract and the owner’s 10% reserve.',
  },
  { power: 'Withdraw the ETH owner reserve', contract: 'Treasury', delay: 'None', worstCase: 'Nothing beyond the 10% reserve; this is owner income.' },
  { power: 'Withdraw the TOWN claim fees', contract: 'Treasury', delay: 'None', worstCase: 'None; this is owner income.' },
  {
    power: 'Replace the staking contract the Treasury pays',
    contract: 'Treasury',
    delay:
      '2 days, announced on chain; cancellable; must then be applied within 7 days; the new contract must name this Treasury and WETH and have fixed code',
    worstCase:
      'Future payouts go to a contract the owner chose; what it does with them is up to its code, so a bad choice can send the stakers’ future ETH anywhere. ETH already paid out and every stake are untouched; stakers get 2 days’ notice.',
  },
  {
    power: 'Pause the daily payout',
    contract: 'Treasury',
    delay: '2 days, announced on chain; cancellable; unpausing is immediate',
    worstCase:
      'Payouts stop until the owner unpauses; the ETH waits in the Treasury and is paid out afterwards. Nothing goes to the owner beyond the 10% reserve.',
  },
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
  'upgrade any contract',
  'touch the 500,000,000 TOWN rebate reserve',
  'take treasury ETH beyond the 10% owner reserve',
  'move anyone’s staked TOWN',
  'change the vault tiers or their dollar prices',
];

/** Things to know: practical points only, one line each (CR-40). */
export const THINGS_TO_KNOW: { title: string; body: string }[] = [
  {
    title: 'Payouts depend on trading',
    body: 'Rebates depend on buying, and stakers’ ETH comes from buy fees, vault purchases and, on some days, sell fees paid in ETH, so both can be small or none.',
  },
  {
    title: 'Rebates are a ceiling',
    body: 'The day’s rate, 4.9% to 5.39% of what you buy after the claim fee, is the most you get; less on busy days, and less or nothing near the end of the reserve.',
  },
  { title: 'Gas costs real money', body: 'Every buy, claim and vault action costs Ethereum gas, which can be more than a small reward.' },
  { title: 'The vault price is paid once', body: 'It goes to the treasury and is not refunded when you unstake; unstaking gives back your TOWN.' },
  { title: 'The contracts cannot be changed', body: 'No upgrades, and trading never pauses, so a flaw could never be fixed.' },
  {
    title: 'Payouts can be paused or re-pointed',
    body: 'The owner can pause the stakers’ payouts or send them to a new staking contract, with 2 days’ notice, shown on the Stats page.',
  },
  {
    title: 'Vault prices use Chainlink',
    body: 'If the ETH/USD feed is unhealthy, the owner’s fallback price is used for up to 7 days; with neither, opening and upgrading vaults pause.',
  },
  {
    title: 'Buy vaults only on this site',
    body: 'If the owner replaces the staking contract, the old one still sells vaults to anyone who reaches it, but they earn nothing new. This site offers vaults only in the contract the treasury pays.',
  },
  { title: 'Buy on this site', body: 'A buy here names your wallet, so the rebate is credited to you; through other apps it may be credited to someone else.' },
];

/**
 * For whoever routes buys for other people (CR-92 part 1), shown right after "Buy on this site". The
 * rule is the spec's "TownHook → Buy tally" attribution order and CL-28, word for word in substance:
 * `hookData` of exactly 32 bytes holding a non-zero word whose upper 96 bits are zero names the buyer,
 * whatever its code; else the router's `msgSender()` answer when it has no code or is an EIP-7702
 * delegation; else `tx.origin`. BuyerRewards pays a claim to its caller ("claim(cycles[])"), so the
 * address named claims for itself. Words between backticks are shown as code. The example's
 * `hookData` is not written here: the page encodes `exampleBuyer` with the site's own
 * `buyerHookData`, the function its buy form uses.
 */
export const ROUTING_NOTE = {
  title: 'For wallets, aggregators and bots',
  body:
    'If you route TOWN buys for other people, pass the buyer’s address as the swap’s `hookData`, exactly 32 bytes: the address left-padded with zeros, as `abi.encode(buyer)` gives it. ' +
    'TownHook then credits the buy, and its rebate, to that address, whatever its code; that address claims the rebate itself. ' +
    'Any other `hookData` (another length, a zero address, anything in the first 12 bytes) is ignored. ' +
    'Without a valid one, the hook credits the router’s `msgSender()` when that is an ordinary wallet (no code, or an EIP-7702 delegation), else the transaction’s sender (`tx.origin`), so for a solver, a bundler or a contract wallet the rebate goes to the wrong place.',
  exampleBuyer: '0x1234567890AbcdEF1234567890aBcdef12345678' as `0x${string}`,
};
