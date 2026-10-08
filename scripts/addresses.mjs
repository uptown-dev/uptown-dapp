#!/usr/bin/env node
// Copies the local chain's addresses into the site, before `npm run dev` and `npm run build`.
//
// Source: `script/deployments/31337.json`, written by `bash script/local-chain.sh start` (task D8;
// the Deployer's file, read only, never edited here). Target: `src/addresses/31337.json`
// (git-ignored: the local chain is rebuilt from scratch on every start). Only the fields the
// site uses are copied, each checked to be an address. When the source file does not exist (no
// local chain was started on this computer), the target says "not deployed", so a fresh clone
// still builds. Sepolia's and mainnet's address files (`src/addresses/11155111.json`, `1.json`)
// are committed and filled by hand in milestone 9 and at launch.
//
// Usage: node scripts/addresses.mjs [source]   (default ../script/deployments/31337.json)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, '..', 'script', 'deployments', '31337.json');
const TARGET = join(ROOT, 'src', 'addresses', '31337.json');

const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

function fail(message) {
  console.error(`addresses: ${message}`);
  process.exit(1);
}

function write(data, note) {
  mkdirSync(dirname(TARGET), { recursive: true });
  const text = JSON.stringify(data, null, 2) + '\n';
  const before = existsSync(TARGET) ? readFileSync(TARGET, 'utf8') : '';
  if (before !== text) writeFileSync(TARGET, text);
  console.log(`addresses: ${relative(ROOT, TARGET)} ${note}`);
}

if (!existsSync(SOURCE)) {
  write(
    { chainId: 31337, source: null, contracts: null, owner: null, positionTokenId: null, uniswap: null, testWallets: [] },
    `written as "not deployed" (no ${relative(join(ROOT, '..'), SOURCE)}; start the local chain with: bash script/local-chain.sh start)`,
  );
  process.exit(0);
}

let src;
try {
  src = JSON.parse(readFileSync(SOURCE, 'utf8'));
} catch (e) {
  fail(`cannot read ${SOURCE}: ${e.message}`);
}

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
  `copied from ${relative(join(ROOT, '..'), SOURCE)} (${Object.keys(contracts).length} contracts, ${wallets.length} test wallets)`,
);
