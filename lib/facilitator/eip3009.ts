import { hexToNumber, slice } from "viem";
import { CHAIN_ID, EIP3009_DOMAIN_NAME, EIP3009_DOMAIN_VERSION, EIP3009_TYPES, USDC_CONTRACT } from "./usdc";

export type Eip3009Authorization = {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
};

export type PaymentSignaturePayload = {
  x402Version: number;
  scheme: string;
  networkId: string;
  payload: {
    signature: `0x${string}`;
    authorization: Eip3009Authorization;
  };
};

function isHexAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHexString(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAuthorization(value: unknown): Eip3009Authorization | null {
  if (!isRecord(value)) return null;
  const from = value.from;
  const to = value.to;
  const nonce = value.nonce;
  const valueRaw = value.value;
  const validAfter = value.validAfter;
  const validBefore = value.validBefore;
  if (!isHexAddress(from) || !isHexAddress(to) || !isHexString(nonce)) return null;
  if (typeof valueRaw !== "string" || !/^\d+$/.test(valueRaw)) return null;
  if (typeof validAfter !== "string" || !/^\d+$/.test(validAfter)) return null;
  if (typeof validBefore !== "string" || !/^\d+$/.test(validBefore)) return null;
  return { from, to, nonce, value: valueRaw, validAfter, validBefore };
}

export function buildEip3009Domain() {
  return {
    name: EIP3009_DOMAIN_NAME,
    version: EIP3009_DOMAIN_VERSION,
    chainId: CHAIN_ID,
    verifyingContract: USDC_CONTRACT,
  } as const;
}

export function buildEip3009TypedData(authorization: Eip3009Authorization) {
  return {
    domain: buildEip3009Domain(),
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  };
}

export function parsePaymentSignature(header: string): PaymentSignaturePayload {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  } catch {
    throw new Error("PAYMENT-SIGNATURE is not valid base64 JSON.");
  }

  if (!isRecord(parsedJson)) throw new Error("PAYMENT-SIGNATURE payload must be an object.");
  const payload = parsedJson.payload;
  if (!isRecord(payload)) throw new Error("PAYMENT-SIGNATURE payload is missing payment data.");
  const signature = payload.signature;
  const authorization = parseAuthorization(payload.authorization);
  if (!isHexString(signature) || !authorization) {
    throw new Error("PAYMENT-SIGNATURE payload is invalid.");
  }

  return {
    x402Version: typeof parsedJson.x402Version === "number" ? parsedJson.x402Version : 2,
    scheme: typeof parsedJson.scheme === "string" ? parsedJson.scheme : "exact",
    networkId: typeof parsedJson.networkId === "string" ? parsedJson.networkId : "eip155:8453",
    payload: { signature, authorization },
  };
}

export type VRS = { v: number; r: `0x${string}`; s: `0x${string}` };

export function splitSignature(sig: `0x${string}`): VRS {
  const r = slice(sig, 0, 32) as `0x${string}`;
  const s = slice(sig, 32, 64) as `0x${string}`;
  const vHex = slice(sig, 64, 65) as `0x${string}`;
  let v = hexToNumber(vHex);
  if (v < 27) v += 27;
  return { v, r, s };
}
