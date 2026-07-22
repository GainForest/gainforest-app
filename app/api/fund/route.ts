import { formatUsdcAmount, normalizeUsdcAmountString, parseUsdcAmount } from "@/lib/facilitator/amount";
import { parsePaymentSignature } from "@/lib/facilitator/eip3009";
import { executeTransferWithAuthorization, SettlementTimeoutError } from "@/lib/facilitator";
import { fetchActivityCid, fetchVerifiedRecipientAddress } from "@/lib/facilitator/recipient";
import {
  computeDonorHash,
  isDidIdentifier,
  writeFundingReceipt,
  type ReceiptSender,
  type ReceiptText,
} from "@/lib/facilitator/receipts";
import { fetchAuthSession } from "@/app/_lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A mainnet transfer + receipt wait can exceed the platform's default
// duration limit, which would drop the request and hang the donor's UI.
export const maxDuration = 300;

type SettlementBody = {
  activityUri?: unknown;
  orgDid?: unknown;
  amount?: unknown;
  currency?: unknown;
  anonymous?: unknown;
};

type ParsedSettlementBody = {
  activityUri?: `at://${string}`;
  orgDid: string;
  amount?: string;
  currency?: "USDC";
  anonymous: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isAtUriString(value: string): value is `at://${string}` {
  return /^at:\/\/[^/]+\/[a-z0-9.]+\/.+$/i.test(value);
}

function parseBody(raw: unknown): { ok: true; body: ParsedSettlementBody } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "Invalid request body" };
  const body = raw as SettlementBody;
  if (typeof body.orgDid !== "string" || !body.orgDid.trim()) return { ok: false, error: "Missing recipient profile" };
  if (typeof body.anonymous !== "boolean") return { ok: false, error: "Missing anonymous flag" };
  if (body.activityUri !== undefined && (typeof body.activityUri !== "string" || !isAtUriString(body.activityUri))) {
    return { ok: false, error: "Invalid activity link" };
  }
  if (body.amount !== undefined && (typeof body.amount !== "string" || !normalizeUsdcAmountString(body.amount))) {
    return { ok: false, error: "Invalid donation amount" };
  }
  if (body.currency !== undefined && body.currency !== "USDC") return { ok: false, error: "This donation currency is not supported" };
  return {
    ok: true,
    body: {
      orgDid: body.orgDid.trim(),
      anonymous: body.anonymous,
      activityUri: typeof body.activityUri === "string" ? body.activityUri : undefined,
      amount: typeof body.amount === "string" ? body.amount : undefined,
      currency: body.currency === "USDC" ? "USDC" : undefined,
    },
  };
}

export async function POST(request: Request) {
  const paymentSig = request.headers.get("PAYMENT-SIGNATURE");
  const rawBody = await request.json().catch(() => null);

  // Discovery mode: tell clients what token/network to prepare before a wallet signature exists.
  if (!paymentSig) {
    const orgDid = isRecord(rawBody) && typeof rawBody.orgDid === "string" ? rawBody.orgDid : null;
    const recipientWallet = orgDid ? await fetchVerifiedRecipientAddress(orgDid).catch(() => null) : null;
    return Response.json(
      {
        paymentRequired: true,
        options: {
          crypto: {
            protocol: "x402",
            network: "Ethereum",
            payTo: recipientWallet ?? "0x0000000000000000000000000000000000000000",
            token: "USDC",
            decimals: 6,
          },
        },
      },
      { status: 402 },
    );
  }

  const parsed = parseBody(rawBody);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const body = parsed.body;

  const session = await fetchAuthSession();
  const attributedDonorDid = session.isLoggedIn && isDidIdentifier(session.did) ? session.did : null;
  if (!body.anonymous && !attributedDonorDid) {
    return Response.json(
      {
        code: "NON_ANONYMOUS_DONATION_REQUIRES_DONOR_DID",
        error: "We couldn’t link this donation to your profile. Please sign in again or donate anonymously.",
      },
      { status: 422 },
    );
  }

  let payload: ReturnType<typeof parsePaymentSignature>;
  try {
    payload = parsePaymentSignature(paymentSig);
  } catch {
    return Response.json({ error: "Payment approval could not be read" }, { status: 400 });
  }

  const { authorization, signature } = payload.payload;
  const recipientWallet = await fetchVerifiedRecipientAddress(body.orgDid).catch(() => null);
  if (!recipientWallet || !isHexAddress(recipientWallet)) {
    return Response.json({ error: "This account cannot receive donations yet" }, { status: 422 });
  }
  if (authorization.to.toLowerCase() !== recipientWallet.toLowerCase()) {
    return Response.json({ error: "Wallet details do not match this account" }, { status: 422 });
  }

  const amount = typeof body.amount === "string" ? normalizeUsdcAmountString(body.amount) : formatUsdcAmount(BigInt(authorization.value));
  if (!amount) return Response.json({ error: "Invalid donation amount" }, { status: 400 });
  if (parseUsdcAmount(amount) !== BigInt(authorization.value)) {
    return Response.json({ error: "The payment amount does not match this donation" }, { status: 422 });
  }

  let transactionHash: `0x${string}`;
  try {
    transactionHash = (await executeTransferWithAuthorization({ authorization, signature })).transactionHash;
  } catch (error) {
    console.error("[fund] On-chain transfer failed:", error);
    if (error instanceof SettlementTimeoutError) {
      // Broadcast but unconfirmed — it may still settle. Never invite a
      // blind retry: a new authorization could double-charge the donor.
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

  // Anonymous donations stay unattributed in the public record, but carry an
  // opaque owner hash (derived from the SESSION, never the request body) so
  // the donor can still see them on their own donations page.
  const donorHash = body.anonymous && session.isLoggedIn
    ? computeDonorHash(session.did, transactionHash)
    : null;

  const donorRecordedAs = body.anonymous ? "wallet" : "did";
  const receiptSender: ReceiptSender = body.anonymous
    ? { $type: "org.hypercerts.funding.receipt#text", value: authorization.from }
    : { $type: "app.certified.defs#did", did: attributedDonorDid! };
  const receiptRecipient: ReceiptText = { $type: "org.hypercerts.funding.receipt#text", value: recipientWallet };

  let receiptSubject: { uri: string; cid: string } | undefined;
  if (typeof body.activityUri === "string") {
    const cid = await fetchActivityCid(body.activityUri).catch(() => null);
    if (cid) receiptSubject = { uri: body.activityUri, cid };
  }

  let receiptUri: string | null = null;
  try {
    receiptUri = await writeFundingReceipt({
      from: receiptSender,
      to: receiptRecipient,
      amount,
      currency: "USDC",
      transactionHash,
      receiptSubject,
      donorHash,
    });
  } catch (error) {
    // The payment has already settled on-chain. Surface success and log receipt failures.
    console.error("[fund] Failed to write funding receipt:", error);
  }

  const cardEligible = Boolean(!body.anonymous && receiptSubject && receiptUri);
  return Response.json({ success: true, transactionHash, receiptUri, donorRecordedAs, cardEligible });
}
