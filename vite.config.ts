import { defineConfig, loadEnv, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { CHAINS, CHAIN_ORDER, buildChain, rpcOrigin, rpcOrigins, type ChainId } from './src/lib/chains.ts';
import { sitePolicy } from './src/lib/policy.ts';
import { ROOT, localWallets, removeDir, searchFiles } from './scripts/build-guards.mjs';

const VIRTUAL = 'virtual:uptown-site-chains';
const RESOLVED = `\0${VIRTUAL}`;

/**
 * The chains the site carries (F9h, CL-53), as the module `virtual:uptown-site-chains` (types in
 * src/site-chains.d.ts): a production build carries only the chain VITE_CHAIN_ID names, its entry
 * from src/lib/chains.ts and its address file; the development server without VITE_CHAIN_ID
 * carries all three and the network module picks at run time.
 */
function siteChains(chain: ChainId | null): Plugin {
  const ids: ChainId[] = chain === null ? CHAIN_ORDER : [chain];
  return {
    name: 'uptown-site-chains',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      return [
        ...ids.map((c) => `import file${c} from '/src/addresses/${c}.json';`),
        `export const CHAIN_IDS = ${JSON.stringify(ids)};`,
        `export const FIXED_CHAIN_ID = ${JSON.stringify(chain)};`,
        `export const CHAIN_INFO = { ${ids.map((c) => `${c}: ${JSON.stringify(CHAINS[c])}`).join(', ')} };`,
        `export const ADDRESS_FILES = { ${ids.map((c) => `${c}: file${c}`).join(', ')} };`,
      ].join('\n');
    },
  };
}

/**
 * The content-security policy. Development server (with or without VITE_CHAIN_ID): index.html's
 * own looser policy (Vite injects inline styles and talks over a WebSocket), whose connect-src must
 * name exactly the RPC hosts of the network module besides 'self' (unchanged). Production build:
 * the strict policy of src/lib/policy.ts replaces it, with connect-src the build's own chain's RPC
 * host and nothing else; the build stops if the written page says anything else. `built` is the
 * build's chain, null on the development server.
 */
function pagePolicy(built: ChainId | null): Plugin {
  const CSP = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;
  return {
    name: 'uptown-csp-check',
    transformIndexHtml(html) {
      if (!CSP.test(html)) throw new Error('index.html: no content-security policy');
      if (built !== null && !/<meta name="referrer" content="no-referrer"/.test(html)) {
        throw new Error('index.html: no <meta name="referrer" content="no-referrer">');
      }
      const out = built === null ? html : html.replace(CSP, (_, a: string, _b: string, c: string) => a + sitePolicy(rpcOrigin(built)) + c);
      const m = out.match(/connect-src ([^;"]+)/);
      if (!m) throw new Error('index.html: the content-security policy has no connect-src');
      const all = m[1].trim().split(/\s+/);
      const listed = (built === null ? all.filter((s) => s !== "'self'") : all).sort();
      const wanted = built === null ? [...new Set(rpcOrigins())].sort() : [rpcOrigin(built)];
      if (listed.join(' ') !== wanted.join(' ')) {
        throw new Error(`index.html: connect-src lists [${listed.join(', ')}] but the RPC hosts for this build are [${wanted.join(', ')}]`);
      }
      return out;
    },
  };
}

/**
 * A mainnet or Sepolia build must hold nothing of the local chain: no 127.0.0.1, no local test
 * wallet, no local owner. Checked on every written file, the copied public files included; if one
 * is found, dist/ is deleted and the build stops.
 */
function noLocalData(chain: ChainId | null): Plugin {
  return {
    name: 'uptown-no-local-data',
    apply: 'build',
    closeBundle() {
      if (chain === null || CHAINS[chain].local) return;
      const words = ['127.0.0.1', ...localWallets()];
      const { files, hits } = searchFiles('dist', words);
      if (hits.length) {
        removeDir('dist');
        throw new Error(`a chain ${chain} build held local-chain data, so dist/ was deleted:\n  ${hits.join('\n  ')}`);
      }
      console.log(`uptown: chain ${chain} build checked: ${files} files in dist/, no 127.0.0.1 and none of the ${words.length - 1} local-chain wallets`);
    },
  };
}

// A static build: relative paths so the output works from any static host or IPFS,
// hash routing (no server-side routes), every asset bundled locally.
export default defineConfig(({ command, mode }) => {
  const raw = loadEnv(mode, ROOT, 'VITE_').VITE_CHAIN_ID;
  let chain: ChainId | null = null;
  if (command === 'build' || (raw ?? '').trim() !== '') {
    const b = buildChain(raw);
    if (b.error !== undefined) throw new Error(b.error + (command === 'build' ? ' Nothing was built.' : ''));
    chain = b.chainId;
  }
  return {
    base: './',
    plugins: [preact(), siteChains(chain), pagePolicy(command === 'build' ? chain : null), noLocalData(chain)],
    build: {
      target: 'es2020',
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
    },
    preview: {
      host: '127.0.0.1',
    },
  };
});
