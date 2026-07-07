import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { formatUsdcAmount, normalizeUsdcAmountString, parseUsdcAmount } from "@/lib/facilitator/amount";
import { parsePaymentSignature } from "@/lib/facilitator/eip3009";
import { executeTransferWithAuthorization } from "@/lib/facilitator";
import { cachedAsync } from "@/app/_lib/async-cache";
import { FACILITATOR_DID } from "@/app/_lib/urls";
import { PAYMENT_NETWORK, PAYMENT_RAIL, RPC_URL } from "@/lib/facilitator/usdc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional GainForest tip at checkout. The tip is a plain USDC
 * transferWithAuthorization to GainForest's own wallet (gainforest.eth,
 * resolved via ENS) — NOT the facilitator wallet. The facilitator still
 * executes the transfer on-chain (paying the gas), but the money lands in
 * gainforest.eth.
 *
 * GET  → { enabled, address, ensName } so the client knows where tips go.
 * POST → executes the signed authorization and writes a public receipt.
 */

/** Tips go to GainForest's own wallet, resolved fresh from ENS. */
const TIP_ENS_NAME = "gainforest.eth";
const TIP_WALLET_CACHE_MS = 60 * 60 * 1000; // 1 hour

type DidIdentifier = `did:${string}:${string}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isDidIdentifier(value: string): value is DidIdentifier {
  return /^did:[a-z0-9]+:.+$/i.test(value);
}

/**
 * Resolve the tip wallet: the TIP_WALLET_ADDRESS env override when set,
 * otherwise gainforest.eth via ENS on mainnet. Throws on RPC failure so the
 * cache retries instead of pinning a transient outage for the full TTL;
 * resolves to null only when the name genuinely has no address.
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

async function getTipWalletAddress(): Promise<`0x${string}` | null> {
  return cachedAsync("tip-wallet-address", TIP_WALLET_CACHE_MS, resolveTipWalletUncached).catch(() => null);
}

function getFacilitatorServiceHost(): string {
  const configuredHost = process.env.FACILITATOR_SERVICE_HOST?.trim().replace(/\/+$/, "");
  if (!configuredHost) throw new Error("FACILITATOR_SERVICE_HOST env var is not set");
  return /^https?:\/\//i.test(configuredHost) ? configuredHost : `https://${configuredHost}`;
}

async function createFacilitatorSession(): Promise<string> {
  const serviceHost = getFacilitatorServiceHost();
  const identifier = process.env.NEXT_PUBLIC_FACILITATOR_DID || FACILITATOR_DID;
  const password = process.env.FACILITATOR_PASSWORD;
  if (!password) throw new Error("FACILITATOR_PASSWORD env var is not set");

  const response = await fetch(`${serviceHost}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const json = (await response.json().catch(() => null)) as { accessJwt?: string; message?: string } | null;
  if (!response.ok || !json?.accessJwt) throw new Error(json?.message || "Unable to prepare donation service");
  return json.accessJwt;
}

async function writeTipReceipt(params: {
  from: { $type: "org.hypercerts.funding.receipt#text"; value: string } | { $type: "app.certified.defs#did"; did: DidIdentifier };
  toWallet: string;
  amount: string;
  transactionHash: string;
}): Promise<string | null> {
  const serviceHost = getFacilitatorServiceHost();
  const token = await createFacilitatorSession();
  const occurredAt = new Date().toISOString();
  const fromLabel = params.from.$type === "app.certified.defs#did" ? params.from.did : params.from.value;
  const response = await fetch(`${serviceHost}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      repo: process.env.NEXT_PUBLIC_FACILITATOR_DID || FACILITATOR_DID,
      collection: "org.hypercerts.funding.receipt",
      record: {
        $type: "org.hypercerts.funding.receipt",
        from: params.from,
        to: { $type: "org.hypercerts.funding.receipt#text", value: params.toWallet },
        amount: params.amount,
        currency: "USDC",
        paymentRail: PAYMENT_RAIL,
        paymentNetwork: PAYMENT_NETWORK,
        transactionId: params.transactionHash,
        notes: `${fromLabel} tipped ${params.amount}USDC to GainForest (${TIP_ENS_NAME})`,
        occurredAt,
      },
    }),
  });

  const json = (await response.json().catch(() => null)) as { uri?: string; message?: string } | null;
  if (!response.ok) throw new Error(json?.message || "Unable to prepare public tip note");
  return json?.uri ?? null;
}

export async function GET() {
  const address = await getTipWalletAddress();
  if (!address) return Response.json({ enabled: false });
  return Response.json({ enabled: true, address, ensName: TIP_ENS_NAME });
}

export async function POST(request: Request) {
  const paymentSig = request.headers.get("PAYMENT-SIGNATURE");
  if (!paymentSig) return Response.json({ error: "Missing payment approval" }, { status: 400 });

  const tipWallet = await getTipWalletAddress();
  if (!tipWallet) return Response.json({ error: "Tips are not available right now" }, { status: 503 });

  const rawBody = await request.json().catch(() => null);
  const body = isRecord(rawBody) ? rawBody : {};

  let payload: ReturnType<typeof parsePaymentSignature>;
  try {
    payload = parsePaymentSignature(paymentSig);
  } catch {
    return Response.json({ error: "Payment approval could not be read" }, { status: 400 });
  }

  const { authorization, signature } = payload.payload;
  if (authorization.to.toLowerCase() !== tipWallet.toLowerCase()) {
    return Response.json({ error: "Tip wallet details do not match" }, { status: 422 });
  }

  const amount =
    typeof body.amount === "string"
      ? normalizeUsdcAmountString(body.amount)
      : formatUsdcAmount(BigInt(authorization.value));
  if (!amount) return Response.json({ error: "Invalid tip amount" }, { status: 400 });
  if (parseUsdcAmount(amount) !== BigInt(authorization.value)) {
    return Response.json({ error: "The payment amount does not match this tip" }, { status: 422 });
  }

  let transactionHash: `0x${string}`;
  try {
    transactionHash = (await executeTransferWithAuthorization({ authorization, signature })).transactionHash;
  } catch (error) {
    console.error("[tip] On-chain transfer failed:", error);
    return Response.json({ error: "Payment could not be completed. Please try again later." }, { status: 500 });
  }

  const donorDid = typeof body.donorDid === "string" && isDidIdentifier(body.donorDid) ? body.donorDid : null;
  const anonymous = body.anonymous !== false;
  const from =
    !anonymous && donorDid
      ? ({ $type: "app.certified.defs#did", did: donorDid } as const)
      : ({ $type: "org.hypercerts.funding.receipt#text", value: authorization.from } as const);

  let receiptUri: string | null = null;
  try {
    receiptUri = await writeTipReceipt({ from, toWallet: tipWallet, amount, transactionHash });
  } catch (error) {
    // The tip has already settled on-chain — log receipt failures only.
    console.error("[tip] Failed to write tip receipt:", error);
  }

  return Response.json({ success: true, transactionHash, receiptUri });
}
