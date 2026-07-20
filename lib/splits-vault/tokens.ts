/**
 * Tokens the donation wallet understands — shared (client + server).
 *
 * The wallet shows and sends ETH plus the two stablecoins donations settle
 * in. Amounts cross the API as decimal-free unit strings (bigint-safe JSON).
 */

import { USDC_CONTRACT } from "@/lib/facilitator/usdc";

export const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as const;

export type WalletTokenSymbol = "ETH" | "USDC" | "USDT";

export type WalletToken = {
  symbol: WalletTokenSymbol;
  name: string;
  decimals: number;
  /** ERC-20 contract, or null for native ETH. */
  address: `0x${string}` | null;
  /** Whether 1 token ≈ 1 USD (stablecoins). */
  stable: boolean;
};

export const WALLET_TOKENS: readonly WalletToken[] = [
  { symbol: "USDC", name: "USD Coin", decimals: 6, address: USDC_CONTRACT, stable: true },
  { symbol: "USDT", name: "Tether USD", decimals: 6, address: USDT_CONTRACT, stable: true },
  { symbol: "ETH", name: "Ether", decimals: 18, address: null, stable: false },
] as const;

export function getWalletToken(symbol: string): WalletToken | null {
  return WALLET_TOKENS.find((token) => token.symbol === symbol) ?? null;
}

/** One token balance as it crosses the API (units = raw integer string). */
export type WalletTokenBalance = {
  symbol: WalletTokenSymbol;
  units: string;
  /** Estimated USD value, when a price is known. */
  usd: number | null;
};

export type WalletBalances = {
  tokens: WalletTokenBalance[];
  /** ETH spot price in USD used for the estimate, when available. */
  ethUsd: number | null;
};

/** Render raw units as a human decimal string, trimming trailing zeros. */
export function formatTokenUnits(units: bigint | string, decimals: number, maxFractionDigits?: number): string {
  const value = typeof units === "bigint" ? units : BigInt(units || "0");
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0");
  if (typeof maxFractionDigits === "number") frac = frac.slice(0, maxFractionDigits);
  frac = frac.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Parse a user-typed decimal amount into raw units. Returns null when invalid. */
export function parseTokenUnits(input: string, decimals: number): bigint | null {
  const trimmed = input.trim().replace(",", ".");
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(trimmed)) return null;
  const [wholeRaw = "0", fracRaw = ""] = trimmed.split(".");
  if (fracRaw.length > decimals) return null;
  try {
    const whole = BigInt(wholeRaw || "0");
    const frac = BigInt((fracRaw || "").padEnd(decimals, "0") || "0");
    return whole * 10n ** BigInt(decimals) + frac;
  } catch {
    return null;
  }
}
