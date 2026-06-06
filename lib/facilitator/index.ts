import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { USDC_ABI, USDC_CONTRACT } from "./usdc";
import { splitSignature, type Eip3009Authorization } from "./eip3009";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is not set`);
  return value;
}

function getFacilitatorAccount() {
  return privateKeyToAccount(getRequiredEnv("FACILITATOR_PRIVATE_KEY") as `0x${string}`);
}

function getPublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
  });
}

function getWalletClient() {
  return createWalletClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
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

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { transactionHash: txHash };
}
