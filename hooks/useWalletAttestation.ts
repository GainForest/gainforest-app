"use client";

import { useState } from "react";
import { useSignTypedData, useAccount } from "wagmi";
import { CHAIN_ID } from "@/lib/facilitator/usdc";

// EIP-712 domain for ATProto EVM attestation
const EIP712_DOMAIN = {
  name: "ATProto EVM Attestation",
  version: "1",
  chainId: CHAIN_ID,
} as const;

const EIP712_TYPES = {
  AttestLink: [
    { name: "did", type: "string" },
    { name: "evmAddress", type: "string" },
    { name: "chainId", type: "string" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "string" },
  ],
} as const;

type LinkStatus = "idle" | "signing" | "writing" | "success" | "error";

/** True when the error (or anything in its cause chain) is a genuine
 *  user rejection (EIP-1193 code 4001 / viem UserRejectedRequestError). */
function isUserRejection(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 6; depth++) {
    const candidate = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (candidate.code === 4001 || candidate.name === "UserRejectedRequestError") return true;
    current = candidate.cause;
  }
  return false;
}

/** Best human-readable message from a wallet/provider error. */
function extractErrorMessage(err: unknown): string | null {
  let current: unknown = err;
  let fallback: string | null = null;
  for (let depth = 0; current && depth < 6; depth++) {
    const candidate = current as { shortMessage?: unknown; message?: unknown; error?: unknown; cause?: unknown };
    const messages = [candidate.shortMessage, candidate.message, candidate.error]
      .filter((message): message is string => typeof message === "string" && message.length > 0)
      .map((message) => message.split("\n")[0]);
    const specific = messages.find((message) => !/unknown rpc error/i.test(message));
    if (specific) return specific;
    fallback ??= messages[0] ?? null;
    current = candidate.cause;
  }
  return fallback;
}

type UseWalletAttestationResult = {
  /** Current status of the linking flow */
  status: LinkStatus;
  /** Error message, if any */
  error: string | null;
  /** The URI of the created attestation record (after success) */
  attestationUri: string | null;
  /** Trigger the sign + write flow */
  linkWallet: (name?: string) => Promise<void>;
  /** Reset to idle */
  reset: () => void;
};

/**
 * Hook that handles the complete EIP-712 sign + ATProto write flow
 * for linking an EVM wallet to the given ATProto DID.
 *
 * Adapted from the bumicerts monorepo (which reads the DID from an atproto
 * store); here the authenticated DID is passed in by the caller.
 */
export function useWalletAttestation(donorDid: string, options?: { repo?: string }): UseWalletAttestationResult {
  const { address } = useAccount();
  const [status, setStatus] = useState<LinkStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attestationUri, setAttestationUri] = useState<string | null>(null);

  const { signTypedDataAsync } = useSignTypedData();

  const reset = () => {
    setStatus("idle");
    setError(null);
    setAttestationUri(null);
  };

  const linkWallet = async (name?: string) => {
    if (!address) {
      setError("No wallet connected. Connect a wallet first.");
      return;
    }
    if (!donorDid) {
      setError("Not signed in. Sign in to your GainForest account first.");
      return;
    }

    setStatus("signing");
    setError(null);

    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = String(Date.now());

    const message = {
      did: donorDid,
      evmAddress: address,
      chainId: String(CHAIN_ID),
      timestamp,
      nonce,
    };

    let signature: `0x${string}`;
    try {
      signature = await signTypedDataAsync({
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: "AttestLink",
        message,
      });
    } catch (err) {
      // Don't mislabel infrastructure failures as user rejections — surface
      // the wallet's actual error so the problem is diagnosable.
      console.error("[useWalletAttestation] signTypedData failed", err);
      setStatus("error");
      setError(
        isUserRejection(err)
          ? "Signing was rejected in your wallet."
          : extractErrorMessage(err) ?? "Failed to link wallet",
      );
      return;
    }

    setStatus("writing");

    try {
      const res = await fetch("/api/identity-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          chainId: CHAIN_ID,
          signature,
          message,
          ...(name ? { name } : {}),
          ...(options?.repo ? { repo: options.repo } : {}),
        }),
      });

      const json = (await res.json().catch(() => null)) as { uri?: string; error?: string } | null;
      if (!res.ok || !json?.uri) {
        throw new Error(json?.error ?? "Failed to link wallet");
      }

      setAttestationUri(json.uri);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to link wallet");
    }
  };

  return { status, error, attestationUri, linkWallet, reset };
}
