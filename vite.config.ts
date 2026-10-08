import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// A static build: relative paths so the output works from any static host or IPFS,
// hash routing (no server-side routes), every asset bundled locally.
export default defineConfig({
  base: './',
  plugins: [preact()],
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
