// Fixed lore content: the Ages, the floors, the places and the Mayor's ring. Nothing here is a
// live figure; live figures come from the data module.
import type { Tier } from '../data/types';

export interface Age {
  numeral: string;
  name: string;
  /** First cycle of the Age; its ration is read as BuyerRewards.cap(first). */
  first: number;
  last: number | null;
  ceremony: string;
}

export const AGES: Age[] = [
  { numeral: 'I', name: 'Groundbreaking', first: 0, last: 99, ceremony: 'Founding Day, Bell Zero' },
  { numeral: 'II', name: 'Framing', first: 100, last: 199, ceremony: 'Raising of the Frame, Bell 100' },
  { numeral: 'III', name: 'Masonry', first: 200, last: 299, ceremony: 'Laying of the Walls, Bell 200' },
  { numeral: 'IV', name: 'Glazing', first: 300, last: 399, ceremony: 'Hanging of the Windows, Bell 300' },
  { numeral: 'V', name: 'Finishing', first: 400, last: 499, ceremony: 'Painting of the Halls, Bell 400' },
  { numeral: 'VI', name: 'Topping Out', first: 500, last: 599, ceremony: 'Topping Out, Bell 500' },
  { numeral: '', name: 'The Long Lights', first: 600, last: null, ceremony: 'Lighting of the Long Lights, Bell 600; lasts until the Granary is empty' },
];

export interface Floor {
  tier: Tier;
  name: string;
  residents: string;
}

export const FLOORS: Record<Tier, Floor> = {
  1: { tier: 1, name: 'The Stoop', residents: 'Stoopers' },
  2: { tier: 2, name: 'The Walk-Up', residents: 'Walk-Ups' },
  3: { tier: 3, name: 'The Loft', residents: 'Lofters' },
  4: { tier: 4, name: 'The Penthouse', residents: 'Penthousers' },
  5: { tier: 5, name: 'The Crown', residents: 'the Crown' },
};

export interface OwnerPower {
  key: string;
  lore: string;
  power: string;
  contract: string;
  delay: string;
  worstCase: string;
}

/** The spec's "Owner powers" table, complete, with the lore's name for each key. */
export const OWNER_POWERS: OwnerPower[] = [
  { key: '1', lore: 'Sweep the trading dust', power: 'Collect the pool\'s trading fees (the 0.5% LP fee)', contract: 'LPVault', delay: 'None', worstCase: 'None. This is the owner\'s income.' },
  { key: '2', lore: 'Lengthen the seal', power: 'Extend the liquidity lock', contract: 'LPVault', delay: 'None', worstCase: 'The liquidity stays locked longer.' },
  { key: '3', lore: 'Lift the Foundation, after the seal opens', power: 'Withdraw the liquidity position', contract: 'LPVault', delay: 'Only after the unlock time (at least 10 years)', worstCase: 'The liquidity is removed after 10 years.' },
  { key: '4', lore: 'Turn the Fountain\'s valve', power: 'Change the daily spend rate, between 1% and 25%', contract: 'Treasury', delay: 'From the next Bell', worstCase: 'Deliveries slow to 1% or speed up to 25% of the balance per Bell. The ETH still goes only to stakers.' },
  { key: '5a', lore: 'Draw from the Mayor\'s Purse (ETH)', power: 'Withdraw the ETH owner reserve', contract: 'Treasury', delay: 'None', worstCase: 'Nothing beyond the 10% reserve. This is the owner\'s income.' },
  { key: '5b', lore: 'Draw from the Mayor\'s Purse (TOWN)', power: 'Withdraw the TOWN claim fees', contract: 'Treasury', delay: 'None', worstCase: 'None. This is the owner\'s income.' },
  { key: '—', lore: 'Ring in the Night of One Transaction', power: 'Launch, once', contract: 'Launcher', delay: 'None', worstCase: 'The launch happens at a time the owner did not intend. It cannot be repeated.' },
  { key: '6', lore: 'Chalk a price on the board', power: 'Set a fallback ETH/USD price for vault purchases', contract: 'TownStaking', delay: 'None; used only while the Chainlink feed has not updated for over 3 hours, and for at most 7 days from each setting', worstCase: 'Vault prices depart from their dollar targets during a feed outage. A near-free vault would let its buyer collect an empty tier\'s pile cheaply (a zero price is refused). Existing stakes and earned WETH are untouched.' },
  { key: '7', lore: 'Post notice to replace the Weathervane', power: 'Replace the ETH/USD price feed', contract: 'TownStaking', delay: '7 days', worstCase: 'A wrong feed misprices vaults after the delay, with the same effect as a wrong fallback price. Existing stakes and earned WETH are untouched.' },
  { key: '8', lore: 'Hand the ring to a successor', power: 'Transfer ownership (two steps: offer, then the new owner accepts)', contract: 'LPVault, Treasury, TownStaking', delay: 'None', worstCase: 'Every other power in this list passes to the new owner.' },
];

/** What the ring has no key for (spec "Owner powers", last paragraph). */
export const OWNER_CANNOT: string[] = [
  'mint TOWN',
  'change any fee',
  'pause trading',
  'upgrade or replace any contract',
  'touch the 500,000,000 TOWN rebate reserve',
  'take Treasury ETH beyond the 10% owner reserve',
  'move anyone\'s staked TOWN',
  'change the vault tiers or their dollar prices',
];
