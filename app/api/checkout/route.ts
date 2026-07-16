import { formatUsdcAmount, normalizeUsdcAmountString, parseUsdcAmount } from "@/lib/facilitator/amount";
import { parsePaymentSignature } from "@/lib/facilitator/eip3009";
import { executeTransferWithAuthorization, executeUsdcTransfer, getFacilitatorAddress, SettlementTimeoutError } from "@/lib/facilitator";
import { fetchActivityCid, fetchVerifiedRecipientAddress } from "@/lib/facilitator/recipient";
import { getTipWalletAddress, TIP_ENS_NAME } from "@/lib/facilitator/tip";
import {
  isDidIdentifier,
  writeFundingReceipt,
  writeTipReceipt,
  type DidIdentifier,
  type ReceiptSender,
} from "@/lib/facilitator/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One pull + up to MAX_LINES fan-outs + tip, all sequential mainnet txs.
// Without this, the platform's default limit kills the request mid-settlement
// and the donor's checkout hangs on "Processing…" with no response.
export const maxDuration = 300;

/**
 * Batched checkout settlement: ONE wallet approval for the whole cart.
 *
 * The donor signs a single EIP-3009 transferWithAuthorization for the cart
 * TOTAL to the facilitator wallet. The facilitator pulls the total, then
 * fans it out as plain USDC transfers to every organization's verified
 * wallet plus the GainForest tip wallet, writing one public receipt per
 * line. All recipients are verified BEFORE any money moves; if a fan-out
 * transfer fails after the pull, that line is reported and the money stays
 * in the facilitator wallet for manual follow-up (logged loudly).
 */

const MAX_LINES = 20;

type CheckoutLine = {
  orgDid: string;
  rkey?: string;
  amount: string; // normalized USDC decimal string
};

type ParsedBody = {
  lines: CheckoutLine[];
  tipAmount: string | null;
  anonymous: boolean;
  donorDid?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parseBody(raw: unknown): { ok: true; body: ParsedBody } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "Invalid request body" };
  if (typeof raw.anonymous !== "boolean") return { ok: false, error: "Missing anonymous flag" };
  if (!Array.isArray(raw.lines) || raw.lines.length === 0) return { ok: false, error: "The cart is empty" };
  if (raw.lines.length > MAX_LINES) return { ok: false, error: "Too many donations in one checkout" };

  const lines: CheckoutLine[] = [];
  for (const value of raw.lines) {
    if (!isRecord(value)) return { ok: false, error: "Invalid donation line" };
    if (typeof value.orgDid !== "string" || !value.orgDid.trim()) return { ok: false, error: "Missing organization profile" };
    if (typeof value.amount !== "string") return { ok: false, error: "Invalid donation amount" };
    const amount = normalizeUsdcAmountString(value.amount);
    if (!amount || parseUsdcAmount(amount) <= 0n) return { ok: false, error: "Invalid donation amount" };
    lines.push({
      orgDid: value.orgDid.trim(),
      rkey: typeof value.rkey === "string" && value.rkey.trim() ? value.rkey.trim() : undefined,
      amount,
    });
  }

  let tipAmount: string | null = null;
  if (raw.tipAmount !== undefined && raw.tipAmount !== null) {
    if (typeof raw.tipAmount !== "string") return { ok: false, error: "Invalid tip amount" };
    tipAmount = normalizeUsdcAmountString(raw.tipAmount);
    if (!tipAmount) return { ok: false, error: "Invalid tip amount" };
    if (parseUsdcAmount(tipAmount) === 0n) tipAmount = null;
  }

  if (raw.donorDid !== undefined && typeof raw.donorDid !== "string") return { ok: false, error: "Invalid supporter profile" };

  return {
    ok: true,
    body: {
      lines,
      tipAmount,
      anonymous: raw.anonymous,
      donorDid: typeof raw.donorDid === "string" ? raw.donorDid : undefined,
    },
  };
}

type LineResult = {
  orgDid: string;
  rkey?: string;
  amount: string;
  transactionHash?: `0x${string}`;
  receiptUri?: string | null;
  error?: string;
};

export async function POST(request: Request) {
  const paymentSig = request.headers.get("PAYMENT-SIGNATURE");
  if (!paymentSig) return Response.json({ error: "Missing payment approval" }, { status: 400 });

  const parsed = parseBody(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const body = parsed.body;

  let donorDid: DidIdentifier | undefined;
  if (!body.anonymous) {
    if (typeof body.donorDid !== "string" || !isDidIdentifier(body.donorDid)) {
      return Response.json(
        {
          code: "NON_ANONYMOUS_DONATION_REQUIRES_DONOR_DID",
          error: "We couldn’t link this donation to your profile. Please sign in again or donate anonymously.",
        },
        { status: 422 },
      );
    }
    donorDid = body.donorDid;
  }

  let payload: ReturnType<typeof parsePaymentSignature>;
  try {
    payload = parsePaymentSignature(paymentSig);
  } catch {
    return Response.json({ error: "Payment approval could not be read" }, { status: 400 });
  }
  const { authorization, signature } = payload.payload;

  // The single authorization must pay the facilitator exactly the cart total.
  let facilitatorAddress: `0x${string}`;
  try {
    facilitatorAddress = getFacilitatorAddress();
  } catch {
    return Response.json({ error: "Payments are not available right now" }, { status: 503 });
  }
  if (authorization.to.toLowerCase() !== facilitatorAddress.toLowerCase()) {
    return Response.json({ error: "Wallet details do not match this checkout" }, { status: 422 });
  }

  const lineTotal = body.lines.reduce((sum, line) => sum + parseUsdcAmount(line.amount), 0n);
  const tipUnits = body.tipAmount ? parseUsdcAmount(body.tipAmount) : 0n;
  const total = lineTotal + tipUnits;
  if (total !== BigInt(authorization.value)) {
    return Response.json({ error: "The payment amount does not match this checkout" }, { status: 422 });
  }

  // Verify EVERY recipient before any money moves.
  const recipients = new Map<string, `0x${string}`>();
  for (const line of body.lines) {
    if (recipients.has(line.orgDid)) continue;
    const address = await fetchVerifiedRecipientAddress(line.orgDid).catch(() => null);
    if (!address || !isHexAddress(address)) {
      return Response.json(
        { error: "This organization cannot receive donations yet", orgDid: line.orgDid },
        { status: 422 },
      );
    }
    recipients.set(line.orgDid, address);
  }
  let tipWallet: `0x${string}` | null = null;
  if (tipUnits > 0n) {
    tipWallet = await getTipWalletAddress();
    if (!tipWallet) return Response.json({ error: "Tips are not available right now" }, { status: 503 });
  }

  // Pull the total from the donor (their one approval).
  let pullTransactionHash: `0x${string}`;
  try {
    pullTransactionHash = (await executeTransferWithAuthorization({ authorization, signature })).transactionHash;
  } catch (error) {
    console.error("[checkout] Pull transfer failed:", error);
    if (error instanceof SettlementTimeoutError) {
      // The pull tx was broadcast but not confirmed in time. It may still
      // settle, so the client must warn the donor before any retry.
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

  const sender: ReceiptSender = body.anonymous
    ? { $type: "org.hypercerts.funding.receipt#text", value: authorization.from }
    : { $type: "app.certified.defs#did", did: donorDid! };

  // Fan out. A failed transfer here is reported per line; the pulled funds
  // stay in the facilitator wallet for manual follow-up.
  const lineResults: LineResult[] = [];
  for (const line of body.lines) {
    const recipient = recipients.get(line.orgDid)!;
    const result: LineResult = { orgDid: line.orgDid, rkey: line.rkey, amount: line.amount };
    try {
      result.transactionHash = (await executeUsdcTransfer({ to: recipient, value: parseUsdcAmount(line.amount) })).transactionHash;
    } catch (error) {
      console.error(`[checkout] FAN-OUT FAILED for ${line.orgDid} (${line.amount} USDC) — funds remain in facilitator ${facilitatorAddress}, pull tx ${pullTransactionHash}:`, error);
      result.error = "The transfer to this organization could not be completed. Your payment is safe and our team will finish it.";
      lineResults.push(result);
      continue;
    }
    try {
      let receiptSubject: { uri: string; cid: string } | undefined;
      if (line.rkey) {
        const activityUri = `at://${line.orgDid}/org.hypercerts.claim.activity/${line.rkey}`;
        const cid = await fetchActivityCid(activityUri).catch(() => null);
        if (cid) receiptSubject = { uri: activityUri, cid };
      }
      result.receiptUri = await writeFundingReceipt({
        from: sender,
        to: { $type: "org.hypercerts.funding.receipt#text", value: recipient },
        amount: line.amount,
        currency: "USDC",
        transactionHash: result.transactionHash,
        receiptSubject,
      });
    } catch (error) {
      // The transfer settled; only the public note failed.
      console.error("[checkout] Failed to write funding receipt:", error);
    }
    lineResults.push(result);
  }

  let tipResult: { amount: string; transactionHash?: `0x${string}`; error?: string } | undefined;
  if (tipUnits > 0n && tipWallet) {
    tipResult = { amount: formatUsdcAmount(tipUnits) };
    try {
      tipResult.transactionHash = (await executeUsdcTransfer({ to: tipWallet, value: tipUnits })).transactionHash;
      await writeTipReceipt({
        from: sender,
        toWallet: tipWallet,
        amount: tipResult.amount,
        transactionHash: tipResult.transactionHash,
        ensName: TIP_ENS_NAME,
      }).catch((error) => {
        console.error("[checkout] Failed to write tip receipt:", error);
        return null;
      });
    } catch (error) {
      console.error(`[checkout] TIP FAN-OUT FAILED (${tipResult.amount} USDC) — funds remain in facilitator ${facilitatorAddress}, pull tx ${pullTransactionHash}:`, error);
      tipResult.error = "The tip transfer could not be completed.";
    }
  }

  return Response.json({ success: true, pullTransactionHash, lines: lineResults, tip: tipResult });
}
