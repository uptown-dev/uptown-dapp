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
// Any other chain is refused. Chain 1 too: mainnet's address file is written at milestone 12.
//
// Usage: node scripts/addresses.mjs [--chain <id>] [source]
//   --chain 31337 (default)  source defaults to ../script/deployments/31337.json
//   --chain 11155111         source defaults to ../script/deployments/11155111.json
// Works from any folder (`node frontend/scripts/addresses.mjs --chain 11155111` from the project
// root): the default source and the target are found from this file's place; a source given on
// the command line is taken relative to the current folder.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROJECT = join(ROOT, '..');

const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

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
    fail(`unknown option ${a}. Usage: node scripts/addresses.mjs [--chain 31337|11155111] [source]`);
  } else {
    positional.push(a);
  }
}
if (positional.length > 1) fail(`one source file at most, got ${positional.length}: ${positional.join(' ')}`);
if (chainArg !== null && !/^\d+$/.test(chainArg)) fail(`--chain must be a chain ID (a number), got "${chainArg}"`);
const CHAIN = chainArg === null ? 31337 : Number(chainArg);

if (CHAIN === 1) {
  fail('chain 1 (Ethereum mainnet) is refused: mainnet addresses are written at milestone 12 (launch), not by this script. Nothing was changed.');
}
if (CHAIN !== 31337 && CHAIN !== 11155111) {
  fail(`chain ${CHAIN} is not supported. Use --chain 31337 (the local test chain, the default) or --chain 11155111 (Sepolia). Nothing was changed.`);
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
      { chainId: 31337, source: null, contracts: null, owner: null, positionTokenId: null, uniswap: null, testWallets: [] },
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

  const contracts = {
    UpTownToken: pick('townToken'),
    TownHook: pick('townHook'),
    BuyerRewards: pick('buyerRewards'),
    Treasury: pick('treasury'),
    TownStaking: pick('townStaking'),
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

  write(
    {
      chainId: 31337,
      source: 'script/deployments/31337.json',
      contracts,
      owner: pick('owner'),
      positionTokenId: tokenId,
      uniswap,
      testWallets: wallets,
    },
    `copied from ${relative(PROJECT, SOURCE)} (${Object.keys(contracts).length} contracts, ${wallets.length} test wallets)`,
  );
  process.exit(0);
}

// -----------------------------------------------------------------------------------------------
// Sepolia (CR-63).
// -----------------------------------------------------------------------------------------------
if (!existsSync(SOURCE)) {
  fail(
    `no ${relative(PROJECT, SOURCE)}, so ${relative(ROOT, TARGET)} was left unchanged. ` +
      'That file is written when the contracts are deployed on Sepolia: run bash script/sepolia-rehearsal.sh from the project root, then run this again.',
  );
}

const src = readSource();
if (Number(src.chainId) !== 11155111) fail(`expected chainId 11155111 in ${SOURCE}, found ${src.chainId}. Nothing was changed.`);
// Deploy writes `dryRun: false` on a broadcast and `true` on a simulation (script/README.md).
if (src.dryRun !== false && src.dryRun !== undefined) {
  fail(`${SOURCE} is not the record of a real Sepolia deployment ("dryRun" is ${JSON.stringify(src.dryRun)}): no contracts exist on Sepolia from a dry run. Nothing was changed.`);
}

const pickS = (key) => {
  if (!isAddress(src[key])) fail(`field ${key} in ${SOURCE} is not an address: ${JSON.stringify(src[key])}. Nothing was changed.`);
  return src[key];
};

const contracts = {
  UpTownToken: pickS('townToken'),
  TownHook: pickS('townHook'),
  BuyerRewards: pickS('buyerRewards'),
  Treasury: pickS('treasury'),
  TownStaking: pickS('townStaking'),
  LPVault: pickS('lpVault'),
  Launcher: pickS('launcher'),
};
const owner = pickS('owner');

// The site's proven Sepolia set (src/lib/chains.ts, plain data; Node runs it directly).
const { CHAINS } = await import(new URL('../src/lib/chains.ts', import.meta.url).href);
const proven = CHAINS[11155111].contracts;
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
      `${key} in ${SOURCE} is ${given}, but the site's Sepolia ${field} is ${known} (src/lib/chains.ts, proven on Sepolia in F9a). ` +
        'The two must be the same contract. Nothing was changed; ask the Lead.',
    );
  }
  uniswap[field] = given;
  fromFile.push(key);
}

const tokenId = src.positionTokenId === undefined || src.positionTokenId === null ? null : String(src.positionTokenId);
if (tokenId !== null && !/^\d+$/.test(tokenId)) fail(`positionTokenId is not a number: ${tokenId}. Nothing was changed.`);

write(
  {
    chainId: 11155111,
    source: 'script/deployments/11155111.json',
    contracts,
    owner,
    positionTokenId: tokenId,
    uniswap,
    testWallets: [],
  },
  `copied from ${relative(PROJECT, SOURCE)} (${Object.keys(contracts).length} contracts; Uniswap set checked against the file for: ${fromFile.length ? fromFile.join(', ') : 'none'})`,
);
