/**
 * The GainForest tip wallet: TIP_WALLET_ADDRESS env override when set,
 * otherwise gainforest.eth resolved via ENS on mainnet. Shared by /api/tip
 * and the batched /api/checkout settlement.
 */

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { cachedAsync } from "@/app/_lib/async-cache";
import { RPC_URL } from "./usdc";

export const TIP_ENS_NAME = "gainforest.eth";
const TIP_WALLET_CACHE_MS = 60 * 60 * 1000; // 1 hour

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Throws on RPC failure so the cache retries instead of pinning a transient
 * outage for the full TTL; resolves to null only when the name genuinely has
 * no address.
 */
async function resolveTipWalletUncached(): Promise<`0x${string}` | null> {
  const override = process.env.TIP_WALLET_ADDRESS?.trim();
  if (override) return isHexAddress(override) ? override : null;
  const client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETHEREUM_RPC_URL || process.env.MAINNET_RPC_URL || RPC_URL),
  });
  const address = await client.getEnsAddress({ name: normalize(TIP_ENS_NAME) });
  return address && isHexAddress(address) ? address : null;
}

export async function getTipWalletAddress(): Promise<`0x${string}` | null> {
  return cachedAsync("tip-wallet-address", TIP_WALLET_CACHE_MS, resolveTipWalletUncached).catch(() => null);
}
