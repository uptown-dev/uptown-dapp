// Wallets and sending. Two kinds, decided by the network module's chain:
//
// - Public networks (mainnet, Sepolia): the browser's own injected wallet (EIP-1193, for example
//   MetaMask), nothing else. No wallet service that calls other hosts, no WalletConnect.
// - The local chain: a "local test wallet" picked from the address file's list. Transactions go
//   to the local node with a `from` address and no key; the node accepts them because it runs
//   with auto-impersonation (script/README.md "Sending transactions without a key"). No private
//   key exists anywhere in the site.
//
// Every send first checks that the wallet's chain is the network module's chain, then runs the
// same call as a read (so a failure is explained before anything is sent), then sends.
import { createWalletClient, custom, http, type Abi, type Hex, type PublicClient, type TransactionReceipt } from 'viem';
import type { Address } from '../data/types';
import type { Network } from './network';
import { viemChain } from './reads';

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export function injectedProvider(): Eip1193 | null {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return eth && typeof eth.request === 'function' ? eth : null;
}

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

/** The chain ID the wallet is on right now. */
export async function walletChainId(n: Network, client: PublicClient): Promise<number> {
  if (n.local) return client.getChainId(); // the node itself: the "wallet" is the node's account
  const p = injectedProvider();
  if (!p) throw new Error('No wallet found in this browser.');
  return Number(await p.request({ method: 'eth_chainId' }));
}

/** Asks the injected wallet to move to the network module's chain. */
export async function switchWalletChain(n: Network): Promise<void> {
  const p = injectedProvider();
  if (!p) throw new Error('No wallet found in this browser.');
  await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${n.chainId.toString(16)}` }] });
}

/**
 * Sends `req` from `from`: chain check, then the same call as a read at the latest block (its
 * revert is explained without sending), then the transaction. Resolves with the hash as soon as
 * the wallet has sent it; `wait` gives the receipt.
 */
export async function sendTx(n: Network, client: PublicClient, from: Address, req: TxRequest): Promise<Hex> {
  // 1. The wallet and the network module must agree on the chain, or nothing is sent.
  const onChain = await walletChainId(n, client);
  if (onChain !== n.chainId) {
    throw new WrongChainError(`Your wallet is on another network (chain ${onChain}). Switch it to ${n.name} (chain ${n.chainId}), then try again.`);
  }
  if (n.local && n.chainId !== 31337) throw new WrongChainError('Test wallets work only on the local test chain.');

  // 2. The same call, as a read: a call that would fail is explained without sending anything.
  await client.simulateContract({ account: from, address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, value: req.value, gas: req.gas } as never);

  // 3. Send. On the local chain: from-address only, no key (the node impersonates). Elsewhere:
  //    the injected wallet signs and sends; viem checks its chain again before sending.
  const chain = viemChain(n);
  const transport = n.local ? http(n.rpcUrl) : custom(injectedProvider()!);
  const wallet = createWalletClient({ account: from, chain, transport });
  return wallet.writeContract({ address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, value: req.value, gas: req.gas, chain } as never);
}

export async function waitForTx(client: PublicClient, hash: Hex): Promise<TransactionReceipt> {
  return client.waitForTransactionReceipt({ hash, pollingInterval: 1_000, timeout: 10 * 60_000 });
}
