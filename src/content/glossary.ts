// The lore glossary: every lore term next to what it really is (the lore's own table, with the
// Lead's accuracy notes applied), plus the townsfolk and the days the town marks.

export interface GlossaryEntry {
  slug: string;
  term: string;
  plain: string;
  contract: string;
  group: 'Places and rules' | 'Time' | 'The Tower' | 'People' | 'Days the town marks';
}

export const GLOSSARY: GlossaryEntry[] = [
  // Places and rules
  { slug: 'charter', term: 'The Charter', plain: 'The fixed rules: no upgrades, no fee setters, no pause, no mint. Nothing in the seven contracts can be changed after launch.', contract: 'All', group: 'Places and rules' },
  { slug: 'bricks', term: 'Bricks', plain: 'TOWN tokens. 1,000,000,000 were minted once, and no more can ever be made.', contract: 'UpTownToken', group: 'Places and rules' },
  { slug: 'architect', term: 'The Architect', plain: 'The one-time launch contract. It opened the pool, placed the liquidity, filled the rebate reserve and started the clocks, then kept nothing and holds no powers.', contract: 'Launcher', group: 'Places and rules' },
  { slug: 'night-of-one-transaction', term: 'The Night of One Transaction', plain: 'Launcher.launch(): the single transaction in which the whole town was set up. It cannot be repeated.', contract: 'Launcher', group: 'Places and rules' },
  { slug: 'gate', term: 'The Gate, the Gatekeeper', plain: 'The Uniswap v4 hook every trade on the TOWN pool passes through. It charges the fees, keeps the buy tally and refuses any new liquidity. It has no owner and cannot be changed.', contract: 'TownHook', group: 'Places and rules' },
  { slug: 'toll', term: 'The toll', plain: 'The 2% buy fee, paid in ETH and sent to the Treasury.', contract: 'TownHook', group: 'Places and rules' },
  { slug: 'dawn-toll', term: 'The Dawn Toll', plain: 'The anti-snipe buy fee: 90% at launch, falling in a straight line to 2% over the first 900 seconds (15 minutes).', contract: 'TownHook', group: 'Places and rules' },
  { slug: 'ledger', term: 'The Ledger', plain: 'The buy tally: how much TOWN each wallet bought in each cycle. Rebates are paid from it.', contract: 'TownHook', group: 'Places and rules' },
  { slug: 'naming-yourself', term: 'Naming yourself at the Gate', plain: 'A buy that carries the buyer\'s own address in hookData. Buys made on this website do this, so the rebate is credited to your wallet.', contract: 'TownHook', group: 'Places and rules' },
  { slug: 'market-street', term: 'Market Street', plain: 'The ETH/TOWN pool on Uniswap v4, the only pool the Gate guards. It opened with 500,000,000 TOWN and no ETH.', contract: 'Pool', group: 'Places and rules' },
  { slug: 'shadow-markets', term: 'Shadow Markets', plain: 'Other TOWN pools that do not use the hook. Trades there pay no Gate fees and earn no rebates.', contract: 'None', group: 'Places and rules' },
  { slug: 'furnace', term: 'The Furnace', plain: 'The 2% sell fee, taken in TOWN and burned (destroyed) on the spot.', contract: 'TownHook', group: 'Places and rules' },
  { slug: 'cornerstone', term: 'The Cornerstone Million', plain: 'The burn floor: the sell fee stops burning once total supply is down to 1,000,000 TOWN. After that, sells pay no Gate fee.', contract: 'TownHook', group: 'Places and rules' },
  { slug: 'offering', term: 'An offering', plain: 'A holder burning their own TOWN by choice with burn(). The Cornerstone rule does not limit it.', contract: 'UpTownToken', group: 'Places and rules' },
  { slug: 'granary', term: 'The Granary, the Steward', plain: 'The rebate reserve: 500,000,000 TOWN, paid out only through buyers\' claims. It has no owner.', contract: 'BuyerRewards', group: 'Places and rules' },
  { slug: 'rebate', term: 'Rebate, harvest', plain: 'A claim of up to 5% of the TOWN you bought in a cycle (4.75% after the 5% claim fee), limited by that cycle\'s ration, from the start of the cycle two after it. A ceiling, not a promise.', contract: 'BuyerRewards', group: 'Places and rules' },
  { slug: 'ration', term: 'Daily ration', plain: 'The most TOWN the Granary can pay for one cycle (the emission cap). It halves every 100 cycles.', contract: 'BuyerRewards', group: 'Places and rules' },
  { slug: 'claim-fee', term: 'Claim fee, one twentieth', plain: '5% of every rebate claim, sent in TOWN to the Treasury for the owner.', contract: 'BuyerRewards', group: 'Places and rules' },
  { slug: 'town-hall', term: 'The Town Hall', plain: 'The Treasury contract. It receives the ETH buy fees and vault payments.', contract: 'Treasury', group: 'Places and rules' },
  { slug: 'fountain', term: 'The Fountain, the valve', plain: 'The Treasury\'s ETH that can go to stakers (the balance less the owner reserve), and the spend rate that sets each Bell\'s share of it: 10% at launch, settable by the owner from 1% to 25%.', contract: 'Treasury', group: 'Places and rules' },
  { slug: 'aqueduct', term: 'The Aqueduct, a delivery', plain: 'The once-a-Bell WETH payment from the Treasury to the staking contract. It happens on the first pull of the bell rope in a Bell (by anyone, or by any Tower action), and only if the budget is at least 0.001 ETH.', contract: 'Treasury', group: 'Places and rules' },
  { slug: 'mayors-purse', term: 'The Mayor\'s Purse', plain: 'The owner\'s share kept in the Treasury: 10% of all ETH arriving, plus the TOWN claim fees.', contract: 'Treasury', group: 'Places and rules' },
  { slug: 'bellringer', term: 'Bellringer, pulling the rope', plain: 'Anyone calling poke() on the Treasury, which starts the Bell\'s delivery. It pays the caller nothing.', contract: 'Treasury', group: 'Places and rules' },
  { slug: 'weathervane', term: 'The Weathervane, the chalkboard', plain: 'The Chainlink ETH/USD price feed used to price vaults, and the owner\'s fallback price, used only while the feed has not updated for over 3 hours and for at most 7 days after it was set.', contract: 'TownStaking', group: 'Places and rules' },
  { slug: 'sealed-foundation', term: 'The Sealed Foundation', plain: 'The pool\'s liquidity position, locked in LPVault for at least 3,650 days. The lock can be lengthened, never shortened.', contract: 'LPVault', group: 'Places and rules' },
  { slug: 'sweeping', term: 'Sweeping the dust', plain: 'The owner collecting the pool\'s 0.5% trading fees from the locked position. This is the owner\'s income.', contract: 'LPVault', group: 'Places and rules' },
  { slug: 'mayor', term: 'The Mayor, the short ring', plain: 'The project owner and its short, published list of powers. Who signs for the owner is still to be decided.', contract: 'LPVault, Treasury, TownStaking', group: 'Places and rules' },

  // Time
  { slug: 'bell', term: 'Bell, Bell Zero', plain: 'A cycle: 24 hours counted from the launch moment, not a calendar day. Bell Zero is launch day; Bell 42 is the day that began 42 days after launch.', contract: 'All', group: 'Time' },
  { slug: 'ages', term: 'The Ages, the Long Lights', plain: 'The 100-cycle epochs of the rebate schedule (Ages I to VI), and the tail from cycle 600 onward.', contract: 'BuyerRewards', group: 'Time' },

  // The Tower
  { slug: 'tower', term: 'The Tower, Residents', plain: 'The staking contract and the people who stake in it.', contract: 'TownStaking', group: 'The Tower' },
  { slug: 'floors', term: 'Floors (Stoop to Crown)', plain: 'The five vault tiers: the Stoop (1), the Walk-Up (2), the Loft (3), the Penthouse (4), the Crown (5).', contract: 'TownStaking', group: 'The Tower' },
  { slug: 'rent', term: 'Rent', plain: 'The vault price in dollars, paid in ETH to the Treasury. It is paid once, when the vault is opened (and the difference once more when you climb). There is no recurring charge, and it is not returned when you move out.', contract: 'TownStaking', group: 'The Tower' },
  { slug: 'water', term: 'Water', plain: 'WETH paid to stakers, streamed over 7 days from each delivery.', contract: 'TownStaking', group: 'The Tower' },
  { slug: 'climbing', term: 'Climbing', plain: 'upgradeVault: moving your whole stake to a higher tier by paying the dollar difference. There is no way down.', contract: 'TownStaking', group: 'The Tower' },
  { slug: 'moving-out', term: 'Moving out', plain: 'unstake: a full exit. All your TOWN comes back and the vault closes; WETH you earned stays claimable.', contract: 'TownStaking', group: 'The Tower' },
  { slug: 'pile', term: 'The pile at the door', plain: 'An empty tier\'s unpaid stream. The first staker to join starts receiving it over at most 7 days, shared with anyone who joins the same tier meanwhile.', contract: 'TownStaking', group: 'The Tower' },

  // People
  { slug: 'uptowners', term: 'UpTowners', plain: 'Everyone who holds TOWN.', contract: 'None', group: 'People' },
  { slug: 'builders', term: 'Builders', plain: 'People who buy TOWN through the Gate. Each buy is written in the Ledger.', contract: 'TownHook', group: 'People' },
  { slug: 'departures', term: 'Departures', plain: 'People who sell TOWN. Each sell leaves 2% for the Furnace while the burn floor allows.', contract: 'TownHook', group: 'People' },
  { slug: 'raiders', term: 'Raiders', plain: 'Bots and snipers that rush a new token at launch. The Dawn Toll is aimed at them.', contract: 'TownHook', group: 'People' },
  { slug: 'bellamy', term: 'Bellamy', plain: 'The town\'s pigeon and crier. He reports the day\'s figures and never predicts. He holds no keys and is not a real person.', contract: 'None', group: 'People' },

  // Days the town marks
  { slug: 'first-harvest', term: 'Bell 2, First Harvest', plain: 'The first day rebates can be claimed: rebates for Bell Zero open at the start of Bell 2.', contract: 'BuyerRewards', group: 'Days the town marks' },
  { slug: 'cornerstone-day', term: 'Cornerstone Day', plain: 'The day total supply reaches 1,000,000 TOWN and sell fees stop burning. Nobody can know when, or whether, it comes.', contract: 'TownHook', group: 'Days the town marks' },
  { slug: 'first-crown', term: 'First Crown', plain: 'The first staker to join an empty tier, who starts receiving its pile at the door (over at most 7 days, shared with anyone joining that tier meanwhile).', contract: 'TownStaking', group: 'Days the town marks' },
  { slug: 'seal-day', term: 'Seal Day, Bell 3,650', plain: 'The earliest day the liquidity lock can end, unless the owner lengthens it first.', contract: 'LPVault', group: 'Days the town marks' },
];

export function glossaryEntry(slug: string): GlossaryEntry | undefined {
  return GLOSSARY.find((g) => g.slug === slug);
}
