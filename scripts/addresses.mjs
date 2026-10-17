#!/usr/bin/env node
// Copies a chain's deployed addresses into the site.
//
// Chain 31337, the default (before `npm run dev` and `npm run build`): source
// `script/deployments/31337.json`, written by `bash script/local-chain.sh start` (task D8; the
// Deployer's file, read only, never edited here). Target: `src/addresses/31337.json` (git-ignored:
// the local chain is rebuilt from scratch on every start). Only the fields the site uses are
// copied, each checked to be an address. When the source file does not exist (no local chain was
// started on this computer), the target says "not deployed", so a fresh clone still builds.
//
// Chain 11155111, Sepolia (CR-63, task F9a): source `script/deployments/11155111.json`, written by
// the Deployer's scripts after the owner's broadcast on Sepolia (the last step of
// `bash script/sepolia-rehearsal.sh` runs this). Target: `src/addresses/11155111.json`, committed
// in git (a "not deployed" placeholder until the owner's run). The seven contracts and the owner
// come from the source. The Uniswap and helper contracts are the site's Sepolia set in
// `src/lib/chains.ts` (each from Uniswap's deployment documentation and proven on Sepolia with
// `cast code`, F9a); any of them the source also names must be the same address, or nothing is
// written. Fields only the local chain has (test wallets, fork block) stay empty. When the source
// file does not exist, the target is left untouched and the script exits 1.
//
// Chain 1, Ethereum mainnet (CR-86, CR-98, task F12a): source `script/deployments/1.json`, written
// by the Deployer's mainnet command (`bash script/mainnet-deploy.sh`), which runs this script itself
// after each of its two phases (its steps 9b and 14b). Target: `src/addresses/1.json`, committed in
// git. The same safeguards as Sepolia's: the file must say chain 1 and be the record of a real
// deployment (`"dryRun": false`); a Sepolia file or a local-chain file is refused, whatever it
// claims; the seven contracts and the owner must be addresses; the Uniswap and helper contracts are
// the site's own mainnet set in `src/lib/chains.ts`, and every one of them the file names (and the
// Chainlink ETH/USD feed) must be the same address, or nothing is written. After phase 1 the file has
// no launch time, pool ID, position or pool key: that is accepted, and the target says null for
// them. After phase 2 (`script/mainnet-file.mjs` adds `launchTime`, `positionTokenId`, `poolId`) they
// are checked and copied. Whether the contracts have launched is never taken from this file: the
// site asks `Launcher.launched()` on chain. When the source file does not exist, the target is left
// untouched and the script exits 1. This script has no network: it does not check that the
// addresses hold code (the mainnet command does).
//
// CR-102 (task F13a): the contracts were redeployed under the symbol SKYLINE. Every deployment
// record of this generation carries `"tokenSymbol": "SKYLINE"` (the token's own symbol(), written by
// the Deployer's scripts) and `secondPositionTokenId` once launched; the keys keep their first names
// (`townToken`, `townHook`, `townStaking`, ...). The site's address files name the contracts
// SkylineHook and SkylineStaking and copy `tokenSymbol`; the site reads a file without
// "SKYLINE" as "not deployed". A chain-1 record whose `tokenSymbol` is not "SKYLINE" is refused
// outright: the retired first deployment's record (TOWN, launched 15 October 2026) has none, and the
// site must never be built against it by mistake.
//
// Any other chain is refused.
//
// Usage: node scripts/addresses.mjs [--chain <id>] [source]
//   --chain 31337 (default)  source defaults to ../script/deployments/31337.json
//   --chain 11155111         source defaults to ../script/deployments/11155111.json
//   --chain 1                source defaults to ../script/deployments/1.json
// Works from any folder (`node frontend/scripts/addresses.mjs --chain 11155111` from the project
// root): the default source and the target are found from this file's place; a source given on
// the command line is taken relative to the current folder.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROJECT = join(ROOT, '..');

const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

/** The symbol of this generation's token (CR-102); the site reads only address files that name it. */
const SYMBOL = 'SKYLINE';
/** The retired first deployment's token, named in the refusal so the owner recognises it. */
const RETIRED = '0x994d362B403a5AbE6D815749f63c23B8e807fCF5';

/** `tokenSymbol` as the site's address file keeps it: the record's string, or null when it has none. */
const symbolOf = (src) => (typeof src.tokenSymbol === 'string' ? src.tokenSymbol : null);

/** `secondPositionTokenId` as a decimal string, or null; anything else stops the script. */
function secondIdOf(src, tokenId, nothingChanged) {
  const v = src.secondPositionTokenId;
  if (v === undefined || v === null) return null;
  const s = String(v);
  if (!/^\d+$/.test(s)) fail(`secondPositionTokenId is not a number: ${s}.${nothingChanged}`);
  if (tokenId === null) fail(`secondPositionTokenId ${s} is given but positionTokenId is not: the two positions are made in the same launch transaction.${nothingChanged}`);
  if (s === tokenId) fail(`secondPositionTokenId ${s} is the launch position's own token ID: the second position is a different NFT.${nothingChanged}`);
  return s;
}

function fail(message) {
  console.error(`addresses: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Arguments: `--chain <id>` or `--chain=<id>` anywhere, at most one source path.
// ---------------------------------------------------------------------------------------------
let chainArg = null;
const positional = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--chain') {
    if (i + 1 >= argv.length) fail('--chain needs a chain ID, for example: --chain 11155111');
    chainArg = argv[++i];
  } else if (a.startsWith('--chain=')) {
    chainArg = a.slice('--chain='.length);
  } else if (a.startsWith('--')) {
    fail(`unknown option ${a}. Usage: node scripts/addresses.mjs [--chain 31337|11155111|1] [source]`);
  } else {
    positional.push(a);
  }
}
if (positional.length > 1) fail(`one source file at most, got ${positional.length}: ${positional.join(' ')}`);
if (chainArg !== null && !/^\d+$/.test(chainArg)) fail(`--chain must be a chain ID (a number), got "${chainArg}"`);
const CHAIN = chainArg === null ? 31337 : Number(chainArg);

if (CHAIN !== 31337 && CHAIN !== 11155111 && CHAIN !== 1) {
  fail(
    `chain ${CHAIN} is not supported. Use --chain 31337 (the local test chain, the default), --chain 11155111 (Sepolia) or --chain 1 (Ethereum mainnet). Nothing was changed.`,
  );
}

const SOURCE = positional[0] ? resolve(process.cwd(), positional[0]) : join(PROJECT, 'script', 'deployments', `${CHAIN}.json`);
const TARGET = join(ROOT, 'src', 'addresses', `${CHAIN}.json`);

function write(data, note) {
  mkdirSync(dirname(TARGET), { recursive: true });
  const text = JSON.stringify(data, null, 2) + '\n';
  const before = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
  if (before !== text) writeFileSync(TARGET, text);
  console.log(`addresses: ${relative(ROOT, TARGET)} ${note}`);
}

function readSource() {
  try {
    return JSON.parse(readFileSync(SOURCE, 'utf8'));
  } catch (e) {
    fail(`cannot read ${SOURCE}: ${e.message}`);
  }
}

if (CHAIN === 31337) {
  // ---------------------------------------------------------------------------------------------
  // The local chain: unchanged from F8b.
  // ---------------------------------------------------------------------------------------------
  if (!existsSync(SOURCE)) {
    write(
      { chainId: 31337, source: null, tokenSymbol: null, contracts: null, owner: null, positionTokenId: null, secondPositionTokenId: null, uniswap: null, testWallets: [] },
      `written as "not deployed" (no ${relative(PROJECT, SOURCE)}; start the local chain with: bash script/local-chain.sh start)`,
    );
    process.exit(0);
  }

  const src = readSource();

  if (Number(src.chainId) !== 31337) fail(`expected chainId 31337 in ${SOURCE}, found ${src.chainId}`);
  // The local chain listens on this computer only; refuse anything else (CLAUDE.md rule 6).
  if (src.rpcUrl !== undefined && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(src.rpcUrl)) fail(`rpcUrl ${src.rpcUrl} is not a local node`);
  if (src.dryRun === true) fail('the file is a dry run: no contracts exist on the local chain');

  const pick = (key) => {
    if (!isAddress(src[key])) fail(`field ${key} is not an address: ${JSON.stringify(src[key])}`);
    return src[key];
  };

  // CR-102: the site's names; the record keeps the first deployment's keys.
  const contracts = {
    UpTownToken: pick('townToken'),
    SkylineHook: pick('townHook'),
    BuyerRewards: pick('buyerRewards'),
    Treasury: pick('treasury'),
    SkylineStaking: pick('townStaking'),
    LPVault: pick('lpVault'),
    Launcher: pick('launcher'),
  };
  const uniswap = {
    poolManager: pick('poolManager'),
    positionManager: pick('positionManager'),
    v4Quoter: pick('v4Quoter'),
    universalRouter: pick('universalRouter_2_1_2'),
    permit2: pick('permit2'),
    multicall3: pick('multicall3'),
    weth: pick('weth'),
    // CR-95 (F9v): the pool's current price is read through StateView for the dollar figures.
    stateView: pick('stateView'),
  };
  const wallets = Array.isArray(src.testWallets) ? src.testWallets : [];
  if (!wallets.every(isAddress)) fail('testWallets holds something that is not an address');
  const tokenId = src.positionTokenId === undefined || src.positionTokenId === null ? null : String(src.positionTokenId);
  if (tokenId !== null && !/^\d+$/.test(tokenId)) fail(`positionTokenId is not a number: ${tokenId}`);
  const secondId = secondIdOf(src, tokenId, '');
  const symbol = symbolOf(src);

  write(
    {
      chainId: 31337,
      source: 'script/deployments/31337.json',
      tokenSymbol: symbol,
      contracts,
      owner: pick('owner'),
      positionTokenId: tokenId,
      secondPositionTokenId: secondId,
      uniswap,
      testWallets: wallets,
    },
    `copied from ${relative(PROJECT, SOURCE)} (${Object.keys(contracts).length} contracts, ${wallets.length} test wallets)` +
      (symbol === SYMBOL
        ? ''
        : `. NOTE: the file names no "tokenSymbol": "${SYMBOL}", so it is from before the SKYLINE redeployment and the site shows "not deployed"; restart the local chain (bash script/local-chain.sh stop, then start)`),
  );
  process.exit(0);
}

// -----------------------------------------------------------------------------------------------
// The public networks: Sepolia (CR-63) and Ethereum mainnet (CR-86, F12a).
// -----------------------------------------------------------------------------------------------
const MAINNET = CHAIN === 1;
const NAME = MAINNET ? 'Ethereum mainnet' : 'Sepolia';
const OTHER_NAMES = { 1: 'Ethereum mainnet', 11155111: 'Sepolia', 31337: 'the local test chain' };
const WRITTEN_BY = MAINNET
  ? 'That file is written by the mainnet deployment: run bash script/mainnet-deploy.sh from the project root (phase 1), then run this again.'
  : 'That file is written when the contracts are deployed on Sepolia: run bash script/sepolia-rehearsal.sh from the project root, then run this again.';

if (!existsSync(SOURCE)) {
  fail(`no ${relative(PROJECT, SOURCE)}, so ${relative(ROOT, TARGET)} was left unchanged. ${WRITTEN_BY}`);
}

const src = readSource();
if (Number(src.chainId) !== CHAIN) {
  const named = OTHER_NAMES[Number(src.chainId)];
  fail(
    `expected chainId ${CHAIN} in ${SOURCE}, found ${src.chainId}${named ? ` (${named}'s file)` : ''}. ` +
      `Only a record of the ${NAME} deployment is accepted here. Nothing was changed.`,
  );
}
// Deploy writes `dryRun: false` on a broadcast and `true` on a simulation (script/README.md). On
// mainnet the field must be there and false: the mainnet command's file always carries it.
if (MAINNET ? src.dryRun !== false : src.dryRun !== false && src.dryRun !== undefined) {
  fail(
    `${SOURCE} is not the record of a real ${NAME} deployment ("dryRun" is ${JSON.stringify(src.dryRun)}): no contracts exist on ${NAME} from a dry run. Nothing was changed.`,
  );
}
if (MAINNET && src.tokenSymbol !== SYMBOL) {
  // CR-102: the retired first deployment's record (TOWN) has no tokenSymbol; anything but SKYLINE is refused.
  const said = src.tokenSymbol === undefined ? 'no "tokenSymbol"' : `"tokenSymbol": ${JSON.stringify(src.tokenSymbol)}`;
  fail(
    `${SOURCE} is not a record of the SKYLINE deployment: it says ${said}, and the site is built only for SKYLINE. ` +
      `The record of UpTown's first deployment (TOWN, ${RETIRED}), which is retired, has no "tokenSymbol". ` +
      'Run phase 1 of the SKYLINE deployment first (bash script/mainnet-deploy.sh deploy --fresh, from the project root; it runs this script itself), then run this again if needed. Nothing was changed.',
  );
}
if (MAINNET) {
  // A local-chain file relabelled as chain 1 still carries the local chain's own fields (LocalChain.s.sol).
  const local = ['forkOfChainId', 'forkUrl', 'forkBlock', 'rpcUrl', 'townBank'].filter((key) => src[key] !== undefined);
  if (Array.isArray(src.testWallets) && src.testWallets.length) local.push('testWallets');
  if (local.length) {
    fail(`${SOURCE} looks like the local test chain's file (it has ${local.join(', ')}), not a record of the Ethereum mainnet deployment. Nothing was changed.`);
  }
  // A Sepolia file relabelled as chain 1 names Sepolia's explorer (SepoliaFile.s.sol).
  if (src.explorer !== undefined && src.explorer !== 'https://etherscan.io') {
    fail(`${SOURCE} names the explorer ${JSON.stringify(src.explorer)}, not https://etherscan.io: it is not a record of the Ethereum mainnet deployment. Nothing was changed.`);
  }
}

const pickS = (key) => {
  if (!isAddress(src[key])) fail(`field ${key} in ${SOURCE} is not an address: ${JSON.stringify(src[key])}. Nothing was changed.`);
  return src[key];
};

// CR-102: the site's names; the record keeps the first deployment's keys.
const contracts = {
  UpTownToken: pickS('townToken'),
  SkylineHook: pickS('townHook'),
  BuyerRewards: pickS('buyerRewards'),
  Treasury: pickS('treasury'),
  SkylineStaking: pickS('townStaking'),
  LPVault: pickS('lpVault'),
  Launcher: pickS('launcher'),
};
const owner = pickS('owner');

// The site's proven set for this chain (src/lib/chains.ts, plain data; Node runs it directly).
const { CHAINS } = await import(new URL('../src/lib/chains.ts', import.meta.url).href);
const proven = CHAINS[CHAIN].contracts;
// Each site field and the deployment-file field that may name the same contract. The router is
// read only from `universalRouter_2_1_2`: the site's buy and sell are encoded for Universal Router
// 2.1.1 and later (minHopPriceX36, R1b A2), and the plain `universalRouter` name could be another
// version.
const FROM_FILE = {
  poolManager: 'poolManager',
  positionManager: 'positionManager',
  v4Quoter: 'v4Quoter',
  universalRouter: 'universalRouter_2_1_2',
  permit2: 'permit2',
  multicall3: 'multicall3',
  weth: 'weth',
  // CR-95 (F9v): the dollar figures read the pool's price through StateView.
  stateView: 'stateView',
};
const where = MAINNET ? 'src/lib/chains.ts, from R1b A1' : 'src/lib/chains.ts, proven on Sepolia in F9a';
const uniswap = {};
const fromFile = [];
for (const [field, key] of Object.entries(FROM_FILE)) {
  const known = proven[field];
  if (src[key] === undefined || src[key] === null) {
    uniswap[field] = known;
    continue;
  }
  const given = pickS(key);
  if (given.toLowerCase() !== known.toLowerCase()) {
    fail(
      `${key} in ${SOURCE} is ${given}, but the site's ${NAME} ${field} is ${known} (${where}). ` +
        'The two must be the same contract. Nothing was changed; ask the Lead.',
    );
  }
  uniswap[field] = given;
  fromFile.push(key);
}
// Mainnet: the Chainlink ETH/USD feed the record names must be the site's own (R1b A1); the site reads
// that feed directly for its dollar figures (CR-102).
if (MAINNET && src.ethUsdFeed !== undefined && src.ethUsdFeed !== null) {
  const given = pickS('ethUsdFeed');
  const known = CHAINS[1].ethUsdFeed;
  if (given.toLowerCase() !== known.toLowerCase()) {
    fail(
      `ethUsdFeed in ${SOURCE} is ${given}, but the site's Ethereum mainnet Chainlink ETH/USD feed is ${known} (${where}). ` +
        'The two must be the same contract. Nothing was changed; ask the Lead.',
    );
  }
  fromFile.push('ethUsdFeed');
}

const tokenId = src.positionTokenId === undefined || src.positionTokenId === null ? null : String(src.positionTokenId);
if (tokenId !== null && !/^\d+$/.test(tokenId)) fail(`positionTokenId is not a number: ${tokenId}. Nothing was changed.`);
const secondId = secondIdOf(src, tokenId, ' Nothing was changed.');
const symbol = symbolOf(src);

if (!MAINNET) {
  write(
    {
      chainId: 11155111,
      source: 'script/deployments/11155111.json',
      tokenSymbol: symbol,
      contracts,
      owner,
      positionTokenId: tokenId,
      secondPositionTokenId: secondId,
      uniswap,
      testWallets: [],
    },
    `copied from ${relative(PROJECT, SOURCE)} (${Object.keys(contracts).length} contracts; Uniswap set checked against the file for: ${fromFile.length ? fromFile.join(', ') : 'none'})` +
      (symbol === SYMBOL ? '' : `. NOTE: the file names no "tokenSymbol": "${SYMBOL}", so the site shows Sepolia as "not deployed"`),
  );
  process.exit(0);
}

// Mainnet's launch facts: absent after phase 1, all three there after phase 2 (script/mainnet-file.mjs).
const launchTime = src.launchTime === undefined || src.launchTime === null ? null : String(src.launchTime);
if (launchTime !== null && !/^[1-9]\d*$/.test(launchTime)) fail(`launchTime is not a time after 1970: ${launchTime}. Nothing was changed.`);
const poolId = src.poolId === undefined || src.poolId === null ? null : String(src.poolId);
if (poolId !== null && (!/^0x[0-9a-fA-F]{64}$/.test(poolId) || /^0x0{64}$/.test(poolId))) {
  fail(`poolId is not a pool ID (32 bytes of hex, not zero): ${poolId}. Nothing was changed.`);
}
const launchFacts = [launchTime, poolId, tokenId].filter((v) => v !== null).length;
if (launchFacts !== 0 && launchFacts !== 3) {
  fail(
    `${SOURCE} has some of the launch facts but not all (launchTime ${launchTime ?? 'missing'}, positionTokenId ${tokenId ?? 'missing'}, poolId ${poolId ?? 'missing'}). ` +
      'After phase 1 it has none, after phase 2 all three. Nothing was changed; ask the Lead.',
  );
}
// The pool key, where the file names it (the local chain's and Sepolia's files do; the mainnet
// command's may): it must be the SKYLINE pool's, native ETH and SKYLINE at 0.5%, spacing 60, through
// SkylineHook.
const KEY = {
  poolCurrency0: '0x0000000000000000000000000000000000000000',
  poolCurrency1: contracts.UpTownToken,
  poolFee: 5000,
  poolTickSpacing: 60,
  poolHooks: contracts.SkylineHook,
};
for (const [key, want] of Object.entries(KEY)) {
  if (src[key] === undefined || src[key] === null) continue;
  const same = typeof want === 'number' ? Number(src[key]) === want : String(src[key]).toLowerCase() === want.toLowerCase();
  if (!same) fail(`${key} in ${SOURCE} is ${JSON.stringify(src[key])}, but the SKYLINE pool's is ${want}. Nothing was changed; ask the Lead.`);
}

write(
  {
    chainId: 1,
    source: 'script/deployments/1.json',
    tokenSymbol: symbol,
    contracts,
    owner,
    positionTokenId: tokenId,
    secondPositionTokenId: secondId,
    launchTime,
    poolId,
    uniswap,
    testWallets: [],
  },
  `copied from ${relative(PROJECT, SOURCE)} (${Object.keys(contracts).length} contracts; ${
    launchFacts ? `launched: launch time, pool ID and position copied${secondId !== null ? ', with the second position' : ''}` : 'deployed, not launched yet: no launch time, pool ID or position (phase 1)'
  }; Uniswap set checked against the file for: ${fromFile.length ? fromFile.join(', ') : 'none'})`,
);
