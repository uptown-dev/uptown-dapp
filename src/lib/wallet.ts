// Wallets and sending. Two kinds, decided by the network module's chain:
//
// - Public networks (mainnet, Sepolia): a browser wallet (EIP-1193, for example MetaMask), nothing
//   else. No wallet service that calls other hosts, no WalletConnect. The installed wallets announce
//   themselves (EIP-6963, CR-72); with more than one the visitor picks, with one the site uses it,
//   with none it falls back to `window.ethereum`. The choice lasts for the visit (this tab) only.
//   Every later chain check, account read and send goes through the chosen wallet.
// - The local chain: a "local test wallet" picked from the address file's list. Transactions go
//   to the local node with a `from` address and no key; the node accepts them because it runs
//   with auto-impersonation (script/README.md "Sending transactions without a key"). No private
//   key exists anywhere in the site.
//
// Every send first checks that its target is one of the site's own addresses (CR-72), that the
// wallet's chain is the network module's chain, then runs the same call as a read (so a failure is
// explained before anything is sent), then sends.
import { createWalletClient, custom, http, type Abi, type Hex, type PublicClient, type TransactionReceipt } from 'viem';
import type { Address } from '../data/types';
import { UNLISTED_STAKING, listedStaking, transactionTargets, type Network } from './network';
import { viemChain } from './reads';

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

/** `window.ethereum`: the fallback when no wallet announces itself (CR-72). */
export function injectedProvider(): Eip1193 | null {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return eth && typeof eth.request === 'function' ? eth : null;
}

// ---------------------------------------------------------------------------------------------
// EIP-6963: the installed wallets announce themselves (CR-72).
// ---------------------------------------------------------------------------------------------

/** One installed wallet, as it announced itself. */
export interface WalletInfo {
  /** Unique for this page load (EIP-6963). */
  uuid: string;
  /** The wallet's own name, as announced (cut to 40 characters). */
  name: string;
  /** The wallet's icon: a `data:image/...` URI, shown only as an `<img>` source; null when the announced one was not. */
  icon: string | null;
  /** The wallet's reverse-domain name, e.g. io.metamask: how the visit's choice is remembered. */
  rdns: string;
  provider: Eip1193;
}

/** Only an image `data:` URI is kept: the icon can then never make the page contact a host. */
const ICON = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,]/i;

/** The announced detail, checked; null when it is not a usable announcement. */
export function walletFromAnnouncement(detail: unknown): WalletInfo | null {
  const d = detail as { info?: { uuid?: unknown; name?: unknown; icon?: unknown; rdns?: unknown }; provider?: Eip1193 } | null;
  const info = d?.info;
  const provider = d?.provider;
  if (!info || !provider || typeof provider.request !== 'function') return null;
  if (typeof info.uuid !== 'string' || typeof info.name !== 'string' || typeof info.rdns !== 'string') return null;
  const name = info.name.trim().slice(0, 40);
  if (!name || !info.uuid) return null;
  const icon = typeof info.icon === 'string' && ICON.test(info.icon) ? info.icon : null;
  return { uuid: info.uuid, name, icon, rdns: info.rdns, provider };
}

const announced: WalletInfo[] = [];
const listeners = new Set<(list: WalletInfo[]) => void>();
let listening = false;

/** Starts listening for announcements (once) and asks the wallets to announce; `onChange` gets the list now and on every new one. */
export function watchWallets(onChange: (list: WalletInfo[]) => void): () => void {
  listeners.add(onChange);
  if (!listening) {
    listening = true;
    window.addEventListener('eip6963:announceProvider', (e) => {
      const w = walletFromAnnouncement((e as CustomEvent).detail);
      if (!w) return;
      // A wallet announces again when asked again: keep one entry per uuid, and per provider.
      const at = announced.findIndex((x) => x.uuid === w.uuid || x.provider === w.provider);
      if (at >= 0) announced[at] = w;
      else announced.push(w);
      for (const l of listeners) l([...announced]);
    });
  }
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  onChange([...announced]);
  return () => listeners.delete(onChange);
}

/** The wallet the visitor chose for this visit; null when none is chosen yet. */
let chosen: WalletInfo | null = null;
const CHOICE_KEY = 'uptown-wallet-choice';

/** Uses `w` for every later chain check, account read and send; remembered for this visit (this tab) only. */
export function chooseWallet(w: WalletInfo | null): void {
  chosen = w;
  try {
    if (w) window.sessionStorage.setItem(CHOICE_KEY, w.rdns);
    else window.sessionStorage.removeItem(CHOICE_KEY);
  } catch {
    /* storage unavailable: the choice lasts until the page is reloaded */
  }
}

export function chosenWallet(): WalletInfo | null {
  return chosen;
}

/** The wallet chosen earlier in this visit, if it is among `list`. */
export function rememberedWallet(list: WalletInfo[]): WalletInfo | null {
  let rdns: string | null = null;
  try {
    rdns = window.sessionStorage.getItem(CHOICE_KEY);
  } catch {
    rdns = null;
  }
  return rdns ? (list.find((w) => w.rdns === rdns) ?? null) : null;
}

/**
 * The wallet the site talks to: the chosen one; else the only one announced; else, when none
 * announced itself, `window.ethereum`. With several announced and none chosen: none (the visitor
 * picks first).
 */
export function activeProvider(): Eip1193 | null {
  if (chosen) return chosen.provider;
  if (announced.length === 1) return announced[0].provider;
  if (announced.length === 0) return injectedProvider();
  return null;
}

// ---------------------------------------------------------------------------------------------
// Sending.
// ---------------------------------------------------------------------------------------------

/** One transaction the site sends: a contract call, with ETH and a gas limit where needed. */
export interface TxRequest {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  /** An explicit gas limit (staking actions: 700,000; spec "Frontend -> Stake"). */
  gas?: bigint;
}

export class WrongChainError extends Error {}
export class UnknownTargetError extends Error {}

const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

/**
 * The last check before anything is checked, prepared or sent (CR-72): the target is one of the
 * site's own addresses (the seven contracts, the listed staking contracts, the Universal Router,
 * Permit2), and a TOWN approval names only Permit2 or a listed staking contract. Gives the reason
 * when it is not, else null.
 */
export function targetProblem(n: Network, req: TxRequest): string | null {
  const to = req.address;
  if (!transactionTargets(n).some((a) => same(a, to))) {
    return `This site sends transactions only to its own contracts, and ${to} is not one of them, so nothing was sent.`;
  }
  const town = n.deployment?.contracts.UpTownToken;
  if (town && same(to, town) && req.functionName === 'approve') {
    const spender = req.args?.[0];
    const ok = (n.uniswap && same(spender, n.uniswap.permit2)) || (typeof spender === 'string' && listedStaking(n, spender) !== null);
    if (!ok) return `${UNLISTED_STAKING}: it does not list ${String(spender)}, so no approval was sent.`;
  }
  return null;
}

/** The chain ID the wallet is on right now. */
export async function walletChainId(n: Network, client: PublicClient): Promise<number> {
  if (n.local) return client.getChainId(); // the node itself: the "wallet" is the node's account
  const p = activeProvider();
  if (!p) throw new Error('No wallet chosen. Select Connect wallet and pick one.');
  return Number(await p.request({ method: 'eth_chainId' }));
}

/** Asks the chosen wallet to move to the network module's chain. */
export async function switchWalletChain(n: Network): Promise<void> {
  const p = activeProvider();
  if (!p) throw new Error('No wallet chosen. Select Connect wallet and pick one.');
  await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${n.chainId.toString(16)}` }] });
}

/**
 * Sends `req` from `from`: the target check, the chain check, then the same call as a read at the
 * latest block (its revert is explained without sending), then the transaction. Resolves with the
 * hash as soon as the wallet has sent it; `wait` gives the receipt.
 */
export async function sendTx(n: Network, client: PublicClient, from: Address, req: TxRequest): Promise<Hex> {
  // 0. Only the site's own contracts (CR-72): nothing goes to an address the RPC alone named.
  const problem = targetProblem(n, req);
  if (problem) throw new UnknownTargetError(problem);

  // 1. The wallet and the network module must agree on the chain, or nothing is sent.
  const onChain = await walletChainId(n, client);
  if (onChain !== n.chainId) {
    throw new WrongChainError(`Your wallet is on another network (chain ${onChain}). Switch it to ${n.name} (chain ${n.chainId}), then try again.`);
  }
  if (n.local && n.chainId !== 31337) throw new WrongChainError('Test wallets work only on the local test chain.');

  // 2. The same call, as a read: a call that would fail is explained without sending anything.
  await client.simulateContract({ account: from, address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, value: req.value, gas: req.gas } as never);

  // 3. Send. On the local chain: from-address only, no key (the node impersonates). Elsewhere:
  //    the chosen wallet signs and sends; viem checks its chain again before sending.
  const chain = viemChain(n);
  const provider = n.local ? null : activeProvider();
  if (!n.local && !provider) throw new Error('No wallet chosen. Select Connect wallet and pick one.');
  const transport = n.local ? http(n.rpcUrl) : custom(provider!);
  const wallet = createWalletClient({ account: from, chain, transport });
  return wallet.writeContract({ address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, value: req.value, gas: req.gas, chain } as never);
}

/**
 * Waits for `hash` to be included. `onReplaced` hears when the wallet replaced the transaction
 * (sped up: "repriced"; cancelled or changed: "cancelled" or "replaced"), before the replacement's
 * receipt is returned (CR-82: a run stops on anything but a speed-up).
 */
export async function waitForTx(client: PublicClient, hash: Hex, onReplaced?: (reason: 'cancelled' | 'replaced' | 'repriced', newHash: Hex) => void): Promise<TransactionReceipt> {
  return client.waitForTransactionReceipt({
    hash,
    pollingInterval: 1_000,
    timeout: 10 * 60_000,
    onReplaced: onReplaced ? (r) => onReplaced(r.reason, r.transaction.hash) : undefined,
  });
}
