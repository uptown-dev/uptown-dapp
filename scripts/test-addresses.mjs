#!/usr/bin/env node
// Tests scripts/addresses.mjs (CR-63, F9a; chain 1 since F12a, CR-86; SKYLINE records only since F13a, CR-102). Runs the script as the Deployer's rehearsal does and as
// `npm run dev` does, with sample Sepolia deployment files written to a temporary folder outside
// the project. No network, no chain, nothing sent.
//
// The script writes its real target, src/addresses/11155111.json (tracked in git). This test saves
// the exact bytes of every address file first and puts them back at the end, whatever happens, so
// no sample Sepolia address is ever left behind (and a real one, once the owner's run has written
// it, is kept as it was).
//
// Usage: node scripts/test-addresses.mjs   (also the first half of `npm test`)

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAINS } from '../src/lib/chains.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // frontend/
const PROJECT = join(ROOT, '..');
const SCRIPT = join(ROOT, 'scripts', 'addresses.mjs');
const FILES = ['1', '11155111', '31337', '5'].map((id) => join(ROOT, 'src', 'addresses', `${id}.json`));
const [MAINNET_FILE, SEPOLIA_FILE, LOCAL_FILE, GOERLI_FILE] = FILES;

const saved = new Map(FILES.map((f) => [f, existsSync(f) ? readFileSync(f) : null]));
const tmp = mkdtempSync(join(tmpdir(), 'uptown-addresses-test-'));
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const bytes = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const run = (args, cwd = ROOT) => {
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout + r.stderr).trim() };
};
const restoreSepolia = () => {
  const b = saved.get(SEPOLIA_FILE);
  if (b === null) rmSync(SEPOLIA_FILE, { force: true });
  else writeFileSync(SEPOLIA_FILE, b);
};

// A Sepolia deployment file as Deploy.s.sol writes it after a broadcast (script/README.md "The
// deployment file"; UpTownScript._writeDeployment). The UpTown addresses are made up.
const fake = (n) => `0x${n.repeat(40)}`;
const P = CHAINS[11155111].contracts;
const deployFile = {
  chainId: 11155111,
  tokenSymbol: 'SKYLINE',
  deployer: fake('d'),
  deployerStartNonce: 0,
  owner: fake('e'),
  hookSalt: `0x${'00'.repeat(31)}01`,
  create2Deployer: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
  launcher: fake('1'),
  townToken: fake('2'),
  buyerRewards: fake('3'),
  treasury: fake('4'),
  townStaking: fake('5'),
  lpVault: fake('6'),
  townHook: fake('7'),
  poolManager: P.poolManager,
  positionManager: P.positionManager,
  permit2: P.permit2,
  weth: P.weth,
  ethUsdFeed: '0x694AA1769357215DE4FAC081bf1f309aDC325306',
  lockDuration: 31536000,
  dryRun: false,
};
// The same with the local chain's extra fields (script/README.md "The address file"), minus the
// test wallets, as CR-63 describes it; one test wallet is left in to show it is not copied.
const fullFile = {
  ...deployFile,
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  forkBlock: '',
  launchTime: 1791500000,
  positionTokenId: 12345,
  stateView: '0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C',
  v4Quoter: P.v4Quoter,
  multicall3: P.multicall3,
  universalRouter: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b',
  universalRouter_2_1_2: P.universalRouter,
  testWallets: [fake('9')],
};
const expected = (src, tokenId, secondId = null) =>
  JSON.stringify(
    {
      chainId: 11155111,
      source: 'script/deployments/11155111.json',
      tokenSymbol: src.tokenSymbol ?? null,
      contracts: {
        UpTownToken: src.townToken,
        SkylineHook: src.townHook,
        BuyerRewards: src.buyerRewards,
        Treasury: src.treasury,
        SkylineStaking: src.townStaking,
        LPVault: src.lpVault,
        Launcher: src.launcher,
      },
      owner: src.owner,
      positionTokenId: tokenId,
      secondPositionTokenId: secondId,
      uniswap: { ...P },
      testWallets: [],
    },
    null,
    2,
  ) + '\n';
const sample = (name, data) => {
  const f = join(tmp, name);
  writeFileSync(f, JSON.stringify(data, null, 2));
  return f;
};

try {
  const placeholder = bytes(SEPOLIA_FILE);
  check('the committed Sepolia file is present before the test', placeholder !== null);

  // 1. Deploy's broadcast file, from frontend/ with a relative source path.
  const a = sample('deploy-11155111.json', deployFile);
  let r = run([SCRIPT, '--chain', '11155111', a]);
  check('--chain 11155111 with the Deploy file: exit 0', r.code === 0, r.out);
  check('--chain 11155111 with the Deploy file: writes the expected file (Uniswap set from chains.ts)', bytes(SEPOLIA_FILE) === expected(deployFile, null), bytes(SEPOLIA_FILE));
  check('--chain 11155111 leaves mainnet\'s and the local chain\'s files alone', bytes(MAINNET_FILE) === saved.get(MAINNET_FILE)?.toString('utf8') && bytes(LOCAL_FILE) === (saved.get(LOCAL_FILE)?.toString('utf8') ?? null));
  restoreSepolia();

  // 2. The fuller file, from the project root, exactly as the rehearsal calls it (plus a source).
  const b = sample('full-11155111.json', fullFile);
  r = run(['frontend/scripts/addresses.mjs', '--chain', '11155111', b], PROJECT);
  check('from the project root, node frontend/scripts/addresses.mjs --chain 11155111 <file>: exit 0', r.code === 0, r.out);
  check('the fuller file: same contracts, router 2.1.2 checked, position ID copied, no test wallets', bytes(SEPOLIA_FILE) === expected(fullFile, '12345'), bytes(SEPOLIA_FILE));
  check('the fuller file: the message lists the Uniswap fields checked against it', /v4Quoter, universalRouter_2_1_2, permit2, multicall3, weth/.test(r.out), r.out);
  restoreSepolia();

  // 2b. CR-102: a Sepolia record without "tokenSymbol" (from before the redeployment) is copied with
  // tokenSymbol null, which the site reads as "not deployed", and the message says so; the second
  // position's token ID is copied when the record has it.
  const { tokenSymbol: _sym, ...oldSepolia } = deployFile;
  r = run([SCRIPT, '--chain', '11155111', sample('old-11155111.json', oldSepolia)]);
  check('CR-102: a Sepolia record without "tokenSymbol" is copied with tokenSymbol null, and the message says the site shows "not deployed"', r.code === 0 && bytes(SEPOLIA_FILE) === expected(oldSepolia, null) && /not deployed/.test(r.out), `${r.out}\n${bytes(SEPOLIA_FILE)}`);
  restoreSepolia();
  r = run([SCRIPT, '--chain', '11155111', sample('second-11155111.json', { ...fullFile, secondPositionTokenId: 12346 })]);
  check('CR-102: a Sepolia record with "secondPositionTokenId": copied as a string beside the position', r.code === 0 && bytes(SEPOLIA_FILE) === expected(fullFile, '12345', '12346'), `${r.out}\n${bytes(SEPOLIA_FILE)}`);
  restoreSepolia();

  // 3. --chain=11155111 form.
  r = run([SCRIPT, '--chain=11155111', a]);
  check('--chain=11155111 works too', r.code === 0 && bytes(SEPOLIA_FILE) === expected(deployFile, null), r.out);
  restoreSepolia();

  // 4. No source: nothing changes, exit 1, says how to create it.
  r = run([SCRIPT, '--chain', '11155111', join(tmp, 'missing.json')]);
  check('--chain 11155111 without a source file: exit 1', r.code === 1, r.out);
  check('--chain 11155111 without a source file: target unchanged', bytes(SEPOLIA_FILE) === placeholder);
  check('--chain 11155111 without a source file: says how to create it', /sepolia-rehearsal\.sh/.test(r.out), r.out);
  if (!existsSync(join(PROJECT, 'script', 'deployments', '11155111.json'))) {
    r = run(['frontend/scripts/addresses.mjs', '--chain', '11155111'], PROJECT);
    check('the rehearsal\'s exact command, before any Sepolia deployment: exit 1, target unchanged', r.code === 1 && bytes(SEPOLIA_FILE) === placeholder, r.out);
  } else {
    check('the rehearsal\'s exact command (skipped: script/deployments/11155111.json exists)', true);
  }

  // 5. Refused chains. (Chain 1 is accepted since F12a: its own checks are in part 8.)
  r = run([SCRIPT, '--chain', '1', a]);
  check('--chain 1 with a Sepolia file is refused (exit 1, Sepolia named, mainnet file unchanged)', r.code === 1 && /found 11155111 \(Sepolia's file\)/.test(r.out) && bytes(MAINNET_FILE) === saved.get(MAINNET_FILE)?.toString('utf8'), r.out);
  r = run([SCRIPT, '--chain', '5', a]);
  check('--chain 5 is refused (exit 1, no 5.json written)', r.code === 1 && /not supported/.test(r.out) && !existsSync(GOERLI_FILE), r.out);
  r = run([SCRIPT, '--chain', 'sepolia']);
  check('--chain sepolia (not a number) is refused', r.code === 1, r.out);
  check('no refusal changed the Sepolia file', bytes(SEPOLIA_FILE) === placeholder);

  // 6. Bad source files: refused, target unchanged.
  const bad = [
    ['a dry-run file', { ...deployFile, dryRun: true }],
    ['a file for another chain', { ...deployFile, chainId: 31337 }],
    ['a contract that is not an address', { ...deployFile, townHook: '0x1234' }],
    ['a quoter other than the proven one', { ...fullFile, v4Quoter: fake('a') }],
    ['a 2.1.2 router other than the proven one', { ...fullFile, universalRouter_2_1_2: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b' }],
    ['a PoolManager other than the proven one', { ...deployFile, poolManager: fake('b') }],
  ];
  for (const [label, data] of bad) {
    r = run([SCRIPT, '--chain', '11155111', sample('bad.json', data)]);
    check(`refused: ${label} (exit 1, target unchanged)`, r.code === 1 && bytes(SEPOLIA_FILE) === placeholder, r.out);
  }

  // 7. The local chain: --chain 31337 is the default and behaves exactly as before.
  r = run([SCRIPT]);
  const def = { ...r, file: bytes(LOCAL_FILE) };
  r = run([SCRIPT, '--chain', '31337']);
  check('--chain 31337 and no option give the same output and the same file', r.code === 0 && def.code === 0 && r.out === def.out && bytes(LOCAL_FILE) === def.file, `${def.out}\n${r.out}`);
  r = run([SCRIPT, join(tmp, 'missing.json')]);
  check('local chain without a source: "not deployed", exit 0 (as before)', r.code === 0 && /not deployed/.test(r.out) && JSON.parse(bytes(LOCAL_FILE)).contracts === null, r.out);

  // 8. Ethereum mainnet (CR-86, CR-98, F12a): the file the mainnet command writes after phase 1, and
  // after phase 2; then every file that must be refused, each leaving the committed mainnet file as it was.
  const mainnetBefore = bytes(MAINNET_FILE);
  const localBefore = bytes(LOCAL_FILE);
  const restoreMainnet = () => {
    const b = saved.get(MAINNET_FILE);
    if (b === null) rmSync(MAINNET_FILE, { force: true });
    else writeFileSync(MAINNET_FILE, b);
  };
  const M = CHAINS[1].contracts;
  // Deploy.s.sol's broadcast file on chain 1 (UpTownScript._writeDeployment): the phase-1 record.
  const phase1 = {
    chainId: 1,
    tokenSymbol: 'SKYLINE',
    deployer: fake('d'),
    deployerStartNonce: 3,
    owner: fake('e'),
    hookSalt: `0x${'00'.repeat(31)}2a`,
    create2Deployer: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
    launcher: fake('1'),
    townToken: fake('2'),
    buyerRewards: fake('3'),
    treasury: fake('4'),
    townStaking: fake('5'),
    lpVault: fake('6'),
    townHook: fake('7'),
    poolManager: M.poolManager,
    positionManager: M.positionManager,
    permit2: M.permit2,
    weth: M.weth,
    ethUsdFeed: CHAINS[1].ethUsdFeed,
    lockDuration: 315360000,
    dryRun: false,
  };
  // The same after phase 2: script/mainnet-file.mjs adds the launch time, the position, the pool ID and the explorer.
  const POOL_ID = `0x${'ab'.repeat(32)}`;
  const phase2 = { ...phase1, launchTime: 1792540800, positionTokenId: 123456, secondPositionTokenId: 123457, poolId: POOL_ID, explorer: 'https://etherscan.io' };
  const expectedMainnet = (s, launch) =>
    JSON.stringify(
      {
        chainId: 1,
        source: 'script/deployments/1.json',
        tokenSymbol: 'SKYLINE',
        contracts: {
          UpTownToken: s.townToken,
          SkylineHook: s.townHook,
          BuyerRewards: s.buyerRewards,
          Treasury: s.treasury,
          SkylineStaking: s.townStaking,
          LPVault: s.lpVault,
          Launcher: s.launcher,
        },
        owner: s.owner,
        positionTokenId: launch ? String(s.positionTokenId) : null,
        secondPositionTokenId: launch && s.secondPositionTokenId !== undefined ? String(s.secondPositionTokenId) : null,
        launchTime: launch ? String(s.launchTime) : null,
        poolId: launch ? s.poolId : null,
        uniswap: { ...M },
        testWallets: [],
      },
      null,
      2,
    ) + '\n';

  const p1 = sample('phase1-1.json', phase1);
  r = run(['frontend/scripts/addresses.mjs', '--chain', '1', p1], PROJECT);
  check('mainnet phase 1: from the project root, as script/mainnet-deploy.sh runs it, exit 0', r.code === 0, r.out);
  check('mainnet phase 1: the seven contracts and the owner; no launch time, pool ID or position (null); the site\'s own Uniswap set', bytes(MAINNET_FILE) === expectedMainnet(phase1, false), bytes(MAINNET_FILE));
  check('mainnet phase 1: the message says deployed, not launched, and lists what was checked (the Chainlink feed included)', /deployed, not launched yet/.test(r.out) && /poolManager, positionManager, permit2, weth, ethUsdFeed/.test(r.out), r.out);
  check('mainnet phase 1 leaves Sepolia\'s and the local chain\'s files alone', bytes(SEPOLIA_FILE) === placeholder && bytes(LOCAL_FILE) === localBefore);
  restoreMainnet();

  const p2 = sample('phase2-1.json', phase2);
  r = run([SCRIPT, '--chain=1', p2]);
  check('mainnet phase 2: exit 0; launch time, pool ID and position copied, and the second position (CR-102)', r.code === 0 && bytes(MAINNET_FILE) === expectedMainnet(phase2, true) && /launched: launch time, pool ID and position copied, with the second position/.test(r.out), `${r.out}\n${bytes(MAINNET_FILE)}`);
  restoreMainnet();

  // The mainnet command's file without the optional second position (script/mainnet-file.mjs takes it as optional).
  const { secondPositionTokenId: _s2, ...phase2NoSecond } = phase2;
  r = run([SCRIPT, '--chain', '1', sample('phase2-nosecond-1.json', phase2NoSecond)]);
  check('mainnet phase 2 without "secondPositionTokenId": exit 0, written as null (the site reads LPVault.secondTokenId() itself)', r.code === 0 && bytes(MAINNET_FILE) === expectedMainnet(phase2NoSecond, true), `${r.out}\n${bytes(MAINNET_FILE)}`);
  restoreMainnet();

  // CR-102: the retired first deployment's record (TOWN) must never be copied as chain 1.
  const { tokenSymbol: _t, ...townRecord } = phase2;
  for (const [label, data] of [
    ['a chain-1 record without "tokenSymbol" (as the retired TOWN record is)', townRecord],
    ['a chain-1 record with "tokenSymbol": "TOWN"', { ...phase2, tokenSymbol: 'TOWN' }],
    ['a chain-1 record with "tokenSymbol": "skyline" (the symbol is exact)', { ...phase2, tokenSymbol: 'skyline' }],
  ]) {
    r = run([SCRIPT, '--chain', '1', sample('town-1.json', data)]);
    check(
      `CR-102 refused: ${label} (exit 1, target unchanged, plain message naming SKYLINE and the retired TOWN)`,
      r.code === 1 && bytes(MAINNET_FILE) === mainnetBefore && /not a record of the SKYLINE deployment/.test(r.out) && /TOWN, 0x994d362B403a5AbE6D815749f63c23B8e807fCF5/.test(r.out) && /Nothing was changed/.test(r.out),
      r.out,
    );
  }
  const realMainnet = join(PROJECT, 'script', 'deployments', '1.json');
  if (existsSync(realMainnet) && JSON.parse(readFileSync(realMainnet, 'utf8')).tokenSymbol !== 'SKYLINE') {
    r = run(['frontend/scripts/addresses.mjs', '--chain', '1'], PROJECT);
    check('CR-102 refused: the real script/deployments/1.json of today, the retired TOWN record, as script/mainnet-deploy.sh would run it (exit 1, target unchanged)', r.code === 1 && bytes(MAINNET_FILE) === mainnetBefore && /not a record of the SKYLINE deployment/.test(r.out), r.out);
  } else {
    check('CR-102: the real script/deployments/1.json (skipped: it is absent or already SKYLINE\'s)', true);
  }

  // A phase-2 file that also names the pool key and the local-style helper fields, all agreeing.
  const p2key = sample('phase2-key-1.json', {
    ...phase2,
    poolCurrency0: '0x0000000000000000000000000000000000000000',
    poolCurrency1: phase2.townToken,
    poolFee: 5000,
    poolTickSpacing: 60,
    poolHooks: phase2.townHook,
    v4Quoter: M.v4Quoter,
    multicall3: M.multicall3,
    stateView: M.stateView,
    universalRouter_2_1_2: M.universalRouter,
  });
  r = run([SCRIPT, '--chain', '1', p2key]);
  check('mainnet phase 2 with the pool key and every helper named: exit 0, same file', r.code === 0 && bytes(MAINNET_FILE) === expectedMainnet(phase2, true), r.out);
  restoreMainnet();

  // No source: nothing changes, says how the file is made.
  r = run([SCRIPT, '--chain', '1', join(tmp, 'missing.json')]);
  check('mainnet without a source file: exit 1, target unchanged, names the mainnet command', r.code === 1 && bytes(MAINNET_FILE) === mainnetBefore && /mainnet-deploy\.sh/.test(r.out), r.out);

  // The real Sepolia and local deployment files, given as mainnet's.
  for (const [label, file] of [
    ['the real Sepolia deployment file (script/deployments/11155111.json)', join(PROJECT, 'script', 'deployments', '11155111.json')],
    ['the local chain\'s deployment file (script/deployments/31337.json)', join(PROJECT, 'script', 'deployments', '31337.json')],
  ]) {
    if (!existsSync(file)) {
      check(`refused as mainnet: ${label} (skipped: the file is not on this computer)`, true);
      continue;
    }
    r = run([SCRIPT, '--chain', '1', file]);
    check(`refused as mainnet: ${label} (exit 1, target unchanged)`, r.code === 1 && bytes(MAINNET_FILE) === mainnetBefore && /expected chainId 1/.test(r.out), r.out);
  }

  const sepoliaReal = existsSync(join(PROJECT, 'script', 'deployments', '11155111.json')) ? JSON.parse(readFileSync(join(PROJECT, 'script', 'deployments', '11155111.json'), 'utf8')) : { ...fullFile, explorer: 'https://sepolia.etherscan.io' };
  const badMainnet = [
    ['a file for another chain (chainId 5)', { ...phase1, chainId: 5 }],
    ['a Sepolia file relabelled chainId 1', { ...sepoliaReal, chainId: 1 }],
    ['a local-chain file relabelled chainId 1', { ...phase2, rpcUrl: 'http://127.0.0.1:8545', forkOfChainId: 1, forkBlock: '26146000', testWallets: [fake('9')] }],
    ['a dry run', { ...phase1, dryRun: true }],
    ['a file without "dryRun"', (({ dryRun, ...rest }) => rest)(phase1)],
    ['a PoolManager other than the site\'s', { ...phase1, poolManager: fake('b') }],
    ['a PositionManager other than the site\'s (Sepolia\'s)', { ...phase1, positionManager: CHAINS[11155111].contracts.positionManager }],
    ['WETH other than the site\'s (Sepolia\'s)', { ...phase1, weth: CHAINS[11155111].contracts.weth }],
    ['a 2.1.2 router other than the site\'s', { ...phase1, universalRouter_2_1_2: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af' }],
    ['a StateView other than the site\'s', { ...phase1, stateView: fake('c') }],
    ['a Chainlink feed other than the site\'s (Sepolia\'s)', { ...phase1, ethUsdFeed: '0x694AA1769357215DE4FAC081bf1f309aDC325306' }],
    ['a contract that is not an address', { ...phase1, treasury: '0x1234' }],
    ['no owner', (({ owner, ...rest }) => rest)(phase1)],
    ['some launch facts but not all', { ...phase1, launchTime: 1792540800 }],
    ['a zero pool ID', { ...phase2, poolId: `0x${'00'.repeat(32)}` }],
    ['a pool key naming another hook', { ...phase2, poolHooks: fake('8') }],
    ['Sepolia\'s explorer', { ...phase2, explorer: 'https://sepolia.etherscan.io' }],
    ['a second position with the launch position\'s own token ID', { ...phase2, secondPositionTokenId: phase2.positionTokenId }],
    ['a second position before the launch facts', { ...phase1, secondPositionTokenId: 7 }],
    ['a second position that is not a number', { ...phase2, secondPositionTokenId: 'x7' }],
  ];
  for (const [label, data] of badMainnet) {
    r = run([SCRIPT, '--chain', '1', sample('bad-1.json', data)]);
    check(`refused as mainnet: ${label} (exit 1, target unchanged)`, r.code === 1 && bytes(MAINNET_FILE) === mainnetBefore && /Nothing was changed/.test(r.out), r.out);
  }
  check('the "refused until milestone 12" message is gone from the script', !/milestone 12/.test(readFileSync(SCRIPT, 'utf8')));
} finally {
  for (const [f, b] of saved) {
    if (b === null) rmSync(f, { force: true });
    else writeFileSync(f, b);
  }
  rmSync(tmp, { recursive: true, force: true });
}

const back = FILES.every((f) => {
  const b = saved.get(f);
  return b === null ? !existsSync(f) : existsSync(f) && readFileSync(f).equals(b);
});
check('every address file is back, byte for byte (the Sepolia placeholder included)', back);

for (const t of results) console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.ok || !t.detail ? '' : `\n      ${t.detail.replace(/\n/g, '\n      ')}`}`);
const failed = results.filter((t) => !t.ok).length;
console.log(`\naddresses script: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
