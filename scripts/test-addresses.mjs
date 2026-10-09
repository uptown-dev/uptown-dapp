#!/usr/bin/env node
// Tests scripts/addresses.mjs (CR-63, F9a). Runs the script as the Deployer's rehearsal does and as
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
const expected = (src, tokenId) =>
  JSON.stringify(
    {
      chainId: 11155111,
      source: 'script/deployments/11155111.json',
      contracts: {
        UpTownToken: src.townToken,
        TownHook: src.townHook,
        BuyerRewards: src.buyerRewards,
        Treasury: src.treasury,
        TownStaking: src.townStaking,
        LPVault: src.lpVault,
        Launcher: src.launcher,
      },
      owner: src.owner,
      positionTokenId: tokenId,
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

  // 5. Refused chains.
  r = run([SCRIPT, '--chain', '1', a]);
  check('--chain 1 is refused (exit 1, milestone 12 named, mainnet file unchanged)', r.code === 1 && /milestone 12/.test(r.out) && bytes(MAINNET_FILE) === saved.get(MAINNET_FILE)?.toString('utf8'), r.out);
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
