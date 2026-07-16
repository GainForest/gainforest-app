import { createPublicClient, createWalletClient, http, WaitForTransactionReceiptTimeoutError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { RPC_URL, USDC_ABI, USDC_CONTRACT } from "./usdc";
import { splitSignature, type Eip3009Authorization } from "./eip3009";

/**
 * How long to poll for a transaction receipt before giving up. Mainnet
 * blocks are ~12s; anything unconfirmed after this is stuck (e.g. gas
 * spike or a queued nonce) and must fail fast instead of hanging the
 * donation request until the platform kills it — which left donors
 * staring at an endless "Processing…" spinner.
 */
const RECEIPT_TIMEOUT_MS = 90_000;

/**
 * The transaction was broadcast but not confirmed within the timeout.
 * It may STILL confirm later, so callers must not blindly retry —
 * a retry mints a brand-new authorization and can double-charge.
 */
export class SettlementTimeoutError extends Error {
  constructor(public readonly transactionHash: `0x${string}`) {
    super(`Transaction ${transactionHash} was not confirmed within ${RECEIPT_TIMEOUT_MS / 1000}s`);
    this.name = "SettlementTimeoutError";
  }
}

async function waitForReceipt(
  publicClient: ReturnType<typeof getPublicClient>,
  txHash: `0x${string}`,
): Promise<void> {
  try {
    await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: RECEIPT_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof WaitForTransactionReceiptTimeoutError) throw new SettlementTimeoutError(txHash);
    throw error;
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is not set`);
  return value;
}

function getFacilitatorAccount() {
  return privateKeyToAccount(getRequiredEnv("FACILITATOR_PRIVATE_KEY") as `0x${string}`);
}

/** The facilitator's own address — the `to` of batched checkout authorizations. */
export function getFacilitatorAddress(): `0x${string}` {
  return getFacilitatorAccount().address;
}

/**
 * Plain USDC transfer from the facilitator wallet. Used by the batched
 * checkout: the donor signs ONE authorization for the total to the
 * facilitator, which then fans the money out to each recipient.
 */
export async function executeUsdcTransfer(params: { to: `0x${string}`; value: bigint }): Promise<{ transactionHash: `0x${string}` }> {
  const account = getFacilitatorAccount();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();
  const txHash = await walletClient.writeContract({
    address: USDC_CONTRACT,
    abi: USDC_ABI,
    functionName: "transfer",
    account,
    args: [params.to, params.value],
  });
  await waitForReceipt(publicClient, txHash);
  return { transactionHash: txHash };
}

function getPublicClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETHEREUM_RPC_URL || process.env.MAINNET_RPC_URL || RPC_URL),
  });
}

function getWalletClient() {
  return createWalletClient({
    chain: mainnet,
    transport: http(process.env.ETHEREUM_RPC_URL || process.env.MAINNET_RPC_URL || RPC_URL),
    account: getFacilitatorAccount(),
  });
}

export type TransferWithAuthParams = {
  authorization: Eip3009Authorization;
  signature: `0x${string}`;
};

export async function executeTransferWithAuthorization(params: TransferWithAuthParams): Promise<{ transactionHash: `0x${string}` }> {
  const { authorization, signature } = params;
  const { v, r, s } = splitSignature(signature);
  const account = getFacilitatorAccount();
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const txHash = await walletClient.writeContract({
    address: USDC_CONTRACT,
    abi: USDC_ABI,
    functionName: "transferWithAuthorization",
    account,
    args: [
      authorization.from,
      authorization.to,
      BigInt(authorization.value),
      BigInt(authorization.validAfter),
      BigInt(authorization.validBefore),
      authorization.nonce,
      v,
      r,
      s,
    ],
  });

  await waitForReceipt(publicClient, txHash);
  return { transactionHash: txHash };
}
