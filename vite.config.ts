import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { rpcOrigins } from './src/lib/chains.ts';

/**
 * The content-security policy in index.html must name exactly the RPC hosts of the network
 * module (src/lib/chains.ts) in connect-src, besides 'self'. The build stops if it does not.
 */
function cspMatchesNetworks(): Plugin {
  return {
    name: 'uptown-csp-check',
    transformIndexHtml(html) {
      const m = html.match(/connect-src ([^;"]+)/);
      if (!m) throw new Error('index.html: the content-security policy has no connect-src');
      const listed = m[1].trim().split(/\s+/).filter((s) => s !== "'self'").sort();
      const wanted = [...new Set(rpcOrigins())].sort();
      if (listed.join(' ') !== wanted.join(' ')) {
        throw new Error(`index.html: connect-src lists [${listed.join(', ')}] but the network module's RPC hosts are [${wanted.join(', ')}]`);
      }
      return html;
    },
  };
}

// A static build: relative paths so the output works from any static host or IPFS,
// hash routing (no server-side routes), every asset bundled locally.
export default defineConfig({
  base: './',
  plugins: [preact(), cspMatchesNetworks()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  preview: {
    host: '127.0.0.1',
  },
});
