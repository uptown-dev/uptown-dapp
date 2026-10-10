// The site's content-security policy (F9h, CL-53). Pure text, no imports: `vite.config.ts` writes it
// into the built index.html, and `scripts/test-hosting.mjs` checks `vercel.json` against it.
//
// What it allows: the site's own files (scripts, the stylesheet, the two fonts, the icon) and, for
// reading and sending, the one RPC host of the chain the build is for. Nothing else: no inline
// script or style, no frame, no form submission, no other host. Trusted types with no policy: the
// site never writes HTML from a string.
//
// One addition (F9i, CR-72): `img-src 'self' data:`. The wallet picker shows each installed
// wallet's icon, which the wallet announces as a `data:` image (EIP-6963); the site renders it only
// as an `<img>` source, and `data:` images contact no host. No other image source is allowed.
//
// The development server (`npm run dev`) keeps the looser policy in index.html: Vite injects its
// styles inline and talks to the page over a WebSocket. Only the built page carries this one.

/** The policy, as written in the built page's `<meta http-equiv="Content-Security-Policy">`. */
export function sitePolicy(rpcOrigin: string): string {
  return policy([rpcOrigin]);
}

/** The policy's directives, with connect-src listing the given origins in the order given. */
function policy(rpcOrigins: readonly string[]): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${rpcOrigins.join(' ')}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join('; ');
}

/**
 * The same policy as a response header from the host. A header can also forbid framing
 * (`frame-ancestors`, which a `<meta>` policy cannot carry); on IPFS, where no header can be set,
 * the page's own policy still applies.
 *
 * Its connect-src names the RPC origins of both public networks the site is built for, mainnet and
 * Sepolia (`hostedRpcOrigins()` in chains.ts, F9p), so the same host settings serve either build.
 * The browser enforces the header and the page's own policy together: a request must pass both, so
 * a built page still reaches only its own network's RPC (CL-53).
 */
export function hostPolicy(rpcOrigins: readonly string[]): string {
  return `${policy(rpcOrigins)}; frame-ancestors 'none'`;
}
