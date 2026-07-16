import { formatUsdcAmount, normalizeUsdcAmountString, parseUsdcAmount } from "@/lib/facilitator/amount";
import { parsePaymentSignature } from "@/lib/facilitator/eip3009";
import { executeTransferWithAuthorization, SettlementTimeoutError } from "@/lib/facilitator";
import { getTipWalletAddress, TIP_ENS_NAME } from "@/lib/facilitator/tip";
import { isDidIdentifier, writeTipReceipt, type DidIdentifier } from "@/lib/facilitator/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A mainnet transfer + receipt wait can exceed the platform's default
// duration limit, which would drop the request and hang the donor's UI.
export const maxDuration = 300;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    if (error instanceof SettlementTimeoutError) {
      return Response.json(
        {
          code: "SETTLEMENT_TIMEOUT",
          error: "The payment is taking longer than expected and may still complete.",
          transactionHash: error.transactionHash,
        },
        { status: 504 },
      );
    }
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
    receiptUri = await writeTipReceipt({ from, toWallet: tipWallet, amount, transactionHash, ensName: TIP_ENS_NAME });
  } catch (error) {
    // The tip has already settled on-chain — log receipt failures only.
    console.error("[tip] Failed to write tip receipt:", error);
  }

  return Response.json({ success: true, transactionHash, receiptUri });
}
