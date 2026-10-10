# UpTown website

The UpTown website: a static site to buy and sell TOWN, claim rebates and stake, which reads every figure straight from the UpTown contracts on Ethereum. It has no server, database or indexer: the browser talks to one public network service (RPC) and to the visitor's own wallet.

## Install and build

Needs Node.js and npm (checked with Node 24 and npm 11).

```bash
npm ci
VITE_CHAIN_ID=<1|11155111|31337> npm run build
```

The built site is in `dist/`. It uses relative paths and hash routing, so any static host (or IPFS) can serve it as plain files.

`VITE_CHAIN_ID` is required. Each build is for one network only and carries only that network's contract addresses and network service: `1` is Ethereum mainnet, `11155111` is the Sepolia test network, `31337` is a local test chain. The page's content-security policy allows the browser to contact that one network service and nothing else. Without `VITE_CHAIN_ID`, or with any other value, the build stops and builds nothing. A mainnet or Sepolia build that contains anything of the local test chain is deleted and the build stops.

The addresses come from `src/addresses/<chain ID>.json`. Before every build, `scripts/addresses.mjs` writes the local chain's file, `src/addresses/31337.json`, from `../script/deployments/31337.json` when that file exists, and as "not deployed" when it does not.

`npm run dev` starts a development server.

## Checks

```bash
npm run check:copy
npm test
```

- `npm run check:copy` scans the source and the built `dist/` for words the site must never use. Run it after a build.
- `npm test` tests the address script and the hosting rules, then runs the component tests in headless Microsoft Edge (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`). The component tests read a local test chain at `http://127.0.0.1:8545` with the contracts deployed and its address file in place; they send no transaction to any chain.

## Hosting

- `vercel.json` sets the security headers the host sends with every file: the content-security policy, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy` and `Strict-Transport-Security`, and how long the page and its files may be cached. The policy in it names the Ethereum mainnet network service.
- The Vercel project needs the environment variable `VITE_CHAIN_ID` (for example `1`), so that its build command, `npm run build`, builds for that network. Its output folder is `dist`.
