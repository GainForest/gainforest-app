"use client";

/**
 * Client-side helpers for the USDC donation checkout: wallet discovery,
 * network switching, balance reads, EIP-3009 signing payload construction and
 * the x402 PAYMENT-SIGNATURE header. Shared by the cart checkout flow.
 * (Originally part of the per-cert DonationModals flow.)
 */

import {
  BLOCK_EXPLORER_URL,
  CHAIN_ID,
  CHAIN_NAME,
  DECIMALS,
  RPC_URL,
  USDC_CONTRACT,
} from "@/lib/facilitator/usdc";

export type EthereumProvider = {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export type RecipientStatus =
  | { hasAttestation: true; address: string; chainId: number }
  | { hasAttestation: false };

export function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export async function ensureEthereumNetwork(ethereum: EthereumProvider) {
  const hexChainId = `0x${CHAIN_ID.toString(16)}`;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? Number(error.code) : null;
    if (code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexChainId,
          chainName: CHAIN_NAME,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: [BLOCK_EXPLORER_URL],
        },
      ],
    });
  }
}

export async function fetchRecipient(orgDid: string): Promise<RecipientStatus> {
  const response = await fetch(`/api/verify-recipient?did=${encodeURIComponent(orgDid)}`);
  const json = (await response.json().catch(() => null)) as RecipientStatus | null;
  if (!response.ok || !json) return { hasAttestation: false };
  return json;
}

function encodeBalanceOf(address: string): `0x${string}` {
  return `0x70a08231${address.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
}

export async function readUsdcBalance(ethereum: EthereumProvider, address: string): Promise<bigint | null> {
  const result = await ethereum.request<string>({
    method: "eth_call",
    params: [{ to: USDC_CONTRACT, data: encodeBalanceOf(address) }, "latest"],
  });
  if (typeof result !== "string" || !result.startsWith("0x")) return null;
  return BigInt(result);
}

export function formatUsdc(units: bigint): string {
  const whole = units / BigInt(10 ** DECIMALS);
  const frac = units % BigInt(10 ** DECIMALS);
  return `${whole}.${frac.toString().padStart(DECIMALS, "0").slice(0, 2)}`;
}

export function shortWallet(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function createNonce(): `0x${string}` {
  const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
  return nonce as `0x${string}`;
}

export function createPaymentSignatureHeader(params: {
  signature: `0x${string}`;
  senderWallet: string;
  recipientWallet: string;
  usdcAmount: bigint;
  nonce: `0x${string}`;
  validBefore: string;
}): string {
  const payload = {
    x402Version: 2,
    scheme: "exact",
    networkId: `eip155:${CHAIN_ID}`,
    payload: {
      signature: params.signature,
      authorization: {
        from: params.senderWallet,
        to: params.recipientWallet,
        value: params.usdcAmount.toString(),
        validAfter: "0",
        validBefore: params.validBefore,
        nonce: params.nonce,
      },
    },
  };
  return btoa(JSON.stringify(payload));
}
