import { parseUnits } from "viem";
import { DECIMALS, fromUsdcUnits } from "./usdc";

const USDC_AMOUNT_REGEX = /^\d+(?:\.\d+)?$/;
const USDC_SCALE = 10 ** DECIMALS;
const FLOAT_ARTIFACT_EPSILON = 1e-3;

export function normalizeUsdcAmountString(value: string): string | null {
  const trimmedValue = value.trim();
  if (!USDC_AMOUNT_REGEX.test(trimmedValue)) return null;

  const numericValue = Number(trimmedValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;

  const scaledValue = numericValue * USDC_SCALE;
  const roundedScaledValue = Math.round(scaledValue);
  if (!Number.isSafeInteger(roundedScaledValue)) return null;
  if (Math.abs(scaledValue - roundedScaledValue) > FLOAT_ARTIFACT_EPSILON) return null;

  return formatUsdcAmount(BigInt(roundedScaledValue));
}

export function parseUsdcAmount(value: string): bigint {
  const normalizedValue = normalizeUsdcAmountString(value);
  if (!normalizedValue) throw new Error("Amount must be a valid USDC value.");
  return parseUnits(normalizedValue, DECIMALS);
}

export function formatUsdcAmount(value: bigint): string {
  return fromUsdcUnits(value);
}
