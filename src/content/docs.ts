// Fixed text for the Docs page: the owner's powers (spec "Owner powers", complete, in compact
// form), what the owner cannot do, and the practical things to know (CR-40). Nothing here is a
// live figure. CR-102: SKYLINE, the two positions, the launch buy, the 2% buy fee from the first second, free staking in
// SkylineStaking (no owner, so no price powers), and the retired first deployment.

export interface OwnerPower {
  power: string;
  contract: string;
  delay: string;
  worstCase: string;
}

/** The spec's "Owner powers" table, complete, in short words (CR-102). */
export const OWNER_POWERS: OwnerPower[] = [
  {
    power: 'Collect the pool’s trading fees (the 0.5% pool fee), from both positions',
    contract: 'LPVault',
    delay: 'None',
    worstCase: 'None; this is owner income.',
  },
  { power: 'Extend the launch position’s lock', contract: 'LPVault', delay: 'None', worstCase: 'Liquidity stays locked longer.' },
  { power: 'Withdraw the launch position', contract: 'LPVault', delay: 'Only after the unlock time (10 years)', worstCase: 'Liquidity removed after 10 years.' },
  {
    power: 'Withdraw the second position',
    contract: 'LPVault',
    delay: 'Only after 14 days from the launch',
    worstCase:
      'The owner removes the full-range position (0.03 ETH and its $SKYLINE at the launch) and takes its share of the pool; the launch position stays locked.',
  },
  {
    power: 'Change the daily payout rate, 1% to 25%',
    contract: 'Treasury',
    delay: 'From the next day',
    worstCase:
      'Payouts slow to 1% or speed up to 25% of the balance per day; the ETH still goes only to the current staking contract and the owner’s 10% reserve.',
  },
  { power: 'Withdraw the ETH owner reserve', contract: 'Treasury', delay: 'None', worstCase: 'Nothing beyond the 10% reserve; this is owner income.' },
  { power: 'Withdraw the $SKYLINE claim fees', contract: 'Treasury', delay: 'None', worstCase: 'None; this is owner income.' },
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
    power: 'Transfer ownership (offer, then the new owner accepts)',
    contract: 'LPVault, Treasury',
    delay: 'None',
    worstCase: 'Every other power in this list passes to the new owner.',
  },
];

/** What the owner cannot do (spec "Owner powers", last paragraph). */
export const OWNER_CANNOT: string[] = [
  'mint $SKYLINE',
  'change any fee',
  'pause trading',
  'upgrade any contract',
  'touch the 500,000,000 $SKYLINE rebate reserve',
  'take treasury ETH beyond the 10% owner reserve',
  'withdraw the launch position before its 10 years',
  'move anyone’s staked $SKYLINE',
];

/** Things to know: practical points only, one line each (CR-40). */
export const THINGS_TO_KNOW: { title: string; body: string }[] = [
  {
    title: 'Payouts depend on trading',
    body: 'Rebates depend on buying, and stakers’ ETH comes from buy fees and, on some days, sell fees paid in ETH, so both can be small or none.',
  },
  {
    title: 'Rebates are a ceiling',
    body: 'The day’s rate, 4.9% to 5.39% of what you buy after the claim fee, is the most you get; less on busy days, and less or nothing while the reserve is low or empty.',
  },
  { title: 'Gas costs real money', body: 'Every buy, claim and staking action costs Ethereum gas, which can be more than a small reward.' },
  { title: 'The contracts cannot be changed', body: 'No upgrades, and trading never pauses, so a flaw could never be fixed.' },
  {
    title: 'Payouts can be paused or re-pointed',
    body: 'The owner can pause the stakers’ payouts or send them to a new staking contract, with 2 days’ notice, shown on the Stats page.',
  },
  {
    title: 'Staking here is temporary',
    body: 'An NFT staking contract for the “Uptowners” collection replaces this one later, after the 2-day notice. A stake left here earns nothing new from then, and can still be unstaked and claimed.',
  },
  {
    title: 'A launch buy and owner liquidity',
    body: 'The launch transaction bought 0.1 ETH of $SKYLINE for the owner wallet at the opening price, and put 0.03 ETH with part of those $SKYLINE into a full-range position the owner can withdraw after 14 days; the rest went to the owner wallet. All of it is visible on chain.',
  },
  {
    title: 'No higher fee at the launch',
    body: 'The buy fee is 2% from the first second, so bots can buy in the launch block at the opening price, right after the owner’s launch buy.',
  },
  { title: 'Buy on this site', body: 'A buy here names your wallet, so the rebate is credited to you; through other apps it may be credited to someone else.' },
];

/**
 * For whoever routes buys for other people (CR-92 part 1), shown right after "Buy on this site". The
 * rule is the spec's "SkylineHook → Buy tally" attribution order and CL-28, word for word in substance:
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
    'If you route $SKYLINE buys for other people, pass the buyer’s address as the swap’s `hookData`, exactly 32 bytes: the address left-padded with zeros, as `abi.encode(buyer)` gives it. ' +
    'SkylineHook then credits the buy, and its rebate, to that address, whatever its code; that address claims the rebate itself. ' +
    'Any other `hookData` (another length, a zero address, anything in the first 12 bytes) is ignored. ' +
    'Without a valid one, the hook credits the router’s `msgSender()` when that is an ordinary wallet (no code, or an EIP-7702 delegation), else the transaction’s sender (`tx.origin`), so for a solver, a bundler or a contract wallet the rebate goes to the wrong place.',
  exampleBuyer: '0x1234567890AbcdEF1234567890aBcdef12345678' as `0x${string}`,
};

// ---------------------------------------------------------------------------------------------
// THE RETIRED FIRST DEPLOYMENT (CR-102, spec "Frontend -> The first deployment"): one short notice
// on the site (the footer, on every page) and in Docs. TOWN's address is written here once, in full,
// so a look-alike cannot pass for it; it is never a contract this site reads or sends to.
// ---------------------------------------------------------------------------------------------

/** The retired first deployment's token, TOWN (spec "Known risks -> The retired first deployment"). */
export const RETIRED_TOWN_ADDRESS = '0x994d362B403a5AbE6D815749f63c23B8e807fCF5' as const;

/** The notice, in two parts around the address: "TOWN (<address>) was UpTown's first deployment, ...". */
export const RETIRED_NOTICE = {
  before: 'TOWN (',
  after: ') was UpTown’s first deployment, launched on 15 October 2026 and retired. The project’s token is $SKYLINE.',
} as const;

/** The notice as one line of text (for tests and screen readers). */
export const RETIRED_NOTICE_TEXT = `${RETIRED_NOTICE.before}${RETIRED_TOWN_ADDRESS}${RETIRED_NOTICE.after}`;
