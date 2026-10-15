// F12a item 5 (CR-86, CR-98): the mainnet build with a phase-1 address file.
//
// Makes a phase-1 shaped mainnet deployment file (chain 1, a real broadcast, the seven contracts and
// the owner, no launch time, pool or position: exactly what `bash script/mainnet-deploy.sh` writes
// after phase 1), runs the site's own `node scripts/addresses.mjs --chain 1 <file>` on it, builds
// with `VITE_CHAIN_ID=1 npm run build`, and checks the build: its page policy names only the
// mainnet RPC, it carries the seven test addresses (so the phase-1 file is what it was built from),
// its explorer is Etherscan, and the build's own guard found nothing of the local chain.
//
// The seven contract addresses are the local not-launched chain's (script/deployments/31337.json),
// which is fine for a build test; the owner is a made-up address, because the build's guard rightly
// refuses any build that holds a local-chain wallet. The committed `src/addresses/1.json` is saved
// first and put back byte for byte at the end, whatever happens: this script never leaves a test
// address in it. Nothing is sent to any network; the build talks to none.
//
// Usage, from frontend/:  node scripts/f12a-mainnet-build.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAINS } from '../src/lib/chains.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // frontend/
const PROJECT = join(ROOT, '..');
const TARGET = join(ROOT, 'src', 'addresses', '1.json');
const LOCAL = join(PROJECT, 'script', 'deployments', '31337.json');
const saved = readFileSync(TARGET);
const tmp = mkdtempSync(join(tmpdir(), 'uptown-f12a-mainnet-'));
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

if (!existsSync(LOCAL)) throw new Error('no script/deployments/31337.json: start the local chain first (bash script/local-chain.sh start --no-launch)');
const local = JSON.parse(readFileSync(LOCAL, 'utf8'));
const M = CHAINS[1].contracts;
const OWNER = '0x00000000000000000000000000000000000f12a0';
const phase1 = {
  chainId: 1,
  deployer: '0x0000000000000000000000000000000000d12a01',
  deployerStartNonce: 0,
  owner: OWNER,
  hookSalt: local.hookSalt,
  create2Deployer: local.create2Deployer,
  launcher: local.launcher,
  townToken: local.townToken,
  buyerRewards: local.buyerRewards,
  treasury: local.treasury,
  townStaking: local.townStaking,
  lpVault: local.lpVault,
  townHook: local.townHook,
  poolManager: M.poolManager,
  positionManager: M.positionManager,
  permit2: M.permit2,
  weth: M.weth,
  ethUsdFeed: CHAINS[1].ethUsdFeed,
  lockDuration: local.lockDuration,
  dryRun: false,
};
const source = join(tmp, '1.json');
writeFileSync(source, JSON.stringify(phase1, null, 2));

const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

let build = { status: 1, stdout: '', stderr: '' };
try {
  const a = spawnSync(process.execPath, ['scripts/addresses.mjs', '--chain', '1', source], { cwd: ROOT, encoding: 'utf8' });
  console.log(`$ node scripts/addresses.mjs --chain 1 <phase-1 test file>\n${(a.stdout + a.stderr).trim()}`);
  check('the address script accepts the phase-1 file (exit 0)', a.status === 0, a.stdout + a.stderr);
  const written = JSON.parse(readFileSync(TARGET, 'utf8'));
  check(
    'src/addresses/1.json now names the seven contracts and the owner, with no launch time, pool ID or position',
    written.chainId === 1 && written.contracts.UpTownToken === local.townToken && written.owner === OWNER && written.launchTime === null && written.poolId === null && written.positionTokenId === null,
    JSON.stringify(written),
  );

  build = spawnSync('npm run build', { cwd: ROOT, encoding: 'utf8', shell: true, env: { ...process.env, VITE_CHAIN_ID: '1' } });
  const out = (build.stdout + build.stderr).trim();
  console.log(`$ VITE_CHAIN_ID=1 npm run build\n${out.split('\n').filter((l) => /build:|addresses:|uptown:|built in|error|Error/.test(l)).join('\n')}`);
  check('VITE_CHAIN_ID=1 npm run build: exit 0', build.status === 0, out.slice(-600));
  const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
  const connect = csp.match(/connect-src ([^;]+)/)?.[1].trim() ?? '';
  console.log(`connect-src ${connect}          (dist/index.html)`);
  check('the page policy’s connect-src is exactly the mainnet RPC, https://ethereum-rpc.publicnode.com', connect === 'https://ethereum-rpc.publicnode.com', csp);
  const files = walk(join(ROOT, 'dist')).filter((f) => /\.(js|html|css|json|txt|svg)$/.test(f));
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n').toLowerCase();
  const seven = ['townToken', 'townHook', 'buyerRewards', 'treasury', 'townStaking', 'lpVault', 'launcher'].every((key) => all.includes(local[key].toLowerCase()));
  check('the build carries the seven addresses of the phase-1 file and Etherscan as its explorer', seven && all.includes('https://etherscan.io'));
  const rpcs = [...new Set(all.match(/https:\/\/[a-z0-9.-]*rpc[a-z0-9.-]*/g) ?? [])];
  check('the only RPC host anywhere in the build is the mainnet one (no Sepolia, no 127.0.0.1)', rpcs.length === 1 && rpcs[0] === 'https://ethereum-rpc.publicnode.com' && !all.includes('127.0.0.1'), rpcs.join(', '));
  check('the build’s own guard ran and found no local-chain data', /chain 1 build checked: \d+ files in dist\/, no 127\.0\.0\.1 and none of the \d+ local-chain wallets/.test(out), out.match(/uptown: chain 1 build checked[^\n]*/)?.[0] ?? '');
} finally {
  writeFileSync(TARGET, saved);
  rmSync(tmp, { recursive: true, force: true });
}
check('src/addresses/1.json is back, byte for byte, as committed', readFileSync(TARGET).equals(saved));

for (const t of results) console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}${t.ok || !t.detail ? '' : `\n      ${String(t.detail).replace(/\n/g, '\n      ')}`}`);
const failed = results.filter((t) => !t.ok).length;
console.log(`\nmainnet phase-1 build: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
