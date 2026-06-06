import { formatUsdcAmount, normalizeUsdcAmountString, parseUsdcAmount } from "@/lib/facilitator/amount";
import { parsePaymentSignature } from "@/lib/facilitator/eip3009";
import { executeTransferWithAuthorization } from "@/lib/facilitator";
import { fetchActivityCid, fetchVerifiedRecipientAddress } from "@/lib/facilitator/recipient";
import { FACILITATOR_DID } from "@/app/_lib/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DidIdentifier = `did:${string}:${string}`;
type ReceiptSender =
  | { $type: "org.hypercerts.funding.receipt#text"; value: string }
  | { $type: "app.certified.defs#did"; did: DidIdentifier };
type ReceiptText = { $type: "org.hypercerts.funding.receipt#text"; value: string };

type SettlementBody = {
  activityUri?: unknown;
  orgDid?: unknown;
  amount?: unknown;
  currency?: unknown;
  donorDid?: unknown;
  anonymous?: unknown;
};

type ParsedSettlementBody = {
  activityUri?: `at://${string}`;
  orgDid: string;
  amount?: string;
  currency?: "USDC";
  donorDid?: string;
  anonymous: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHexAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isDidIdentifier(value: string): value is DidIdentifier {
  return /^did:[a-z0-9]+:.+$/i.test(value);
}

function isAtUriString(value: string): value is `at://${string}` {
  return /^at:\/\/[^/]+\/[a-z0-9.]+\/.+$/i.test(value);
}

function parseBody(raw: unknown): { ok: true; body: ParsedSettlementBody } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "Invalid request body" };
  const body = raw as SettlementBody;
  if (typeof body.orgDid !== "string" || !body.orgDid.trim()) return { ok: false, error: "Missing organization profile" };
  if (typeof body.anonymous !== "boolean") return { ok: false, error: "Missing anonymous flag" };
  if (body.activityUri !== undefined && (typeof body.activityUri !== "string" || !isAtUriString(body.activityUri))) {
    return { ok: false, error: "Invalid activity link" };
  }
  if (body.amount !== undefined && (typeof body.amount !== "string" || !normalizeUsdcAmountString(body.amount))) {
    return { ok: false, error: "Invalid donation amount" };
  }
  if (body.currency !== undefined && body.currency !== "USDC") return { ok: false, error: "This donation currency is not supported" };
  if (body.donorDid !== undefined && typeof body.donorDid !== "string") return { ok: false, error: "Invalid supporter profile" };
  return {
    ok: true,
    body: {
      orgDid: body.orgDid.trim(),
      anonymous: body.anonymous,
      activityUri: typeof body.activityUri === "string" ? body.activityUri : undefined,
      amount: typeof body.amount === "string" ? body.amount : undefined,
      currency: body.currency === "USDC" ? "USDC" : undefined,
      donorDid: typeof body.donorDid === "string" ? body.donorDid : undefined,
    },
  };
}

async function createFacilitatorSession(): Promise<string> {
  const serviceHost = process.env.FACILITATOR_SERVICE_HOST?.replace(/\/$/, "");
  const identifier = process.env.NEXT_PUBLIC_FACILITATOR_DID || FACILITATOR_DID;
  const password = process.env.FACILITATOR_PASSWORD;
  if (!serviceHost) throw new Error("FACILITATOR_SERVICE_HOST env var is not set");
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

async function writeFundingReceipt(params: {
  from: ReceiptSender;
  to: ReceiptText;
  amount: string;
  currency: "USDC";
  transactionHash: string;
  receiptSubject?: { uri: string; cid: string };
}): Promise<string | null> {
  const serviceHost = process.env.FACILITATOR_SERVICE_HOST?.replace(/\/$/, "");
  if (!serviceHost) throw new Error("FACILITATOR_SERVICE_HOST env var is not set");

  const token = await createFacilitatorSession();
  const occurredAt = new Date().toISOString();
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
        to: params.to,
        amount: params.amount,
        currency: params.currency,
        paymentRail: "x402-usdc-base",
        paymentNetwork: "base",
        transactionId: params.transactionHash,
        for: params.receiptSubject,
        notes: `${params.from.$type === "app.certified.defs#did" ? params.from.did : params.from.value} paid ${params.amount}${params.currency} using wallet`,
        occurredAt,
      },
    }),
  });

  const json = (await response.json().catch(() => null)) as { uri?: string; message?: string } | null;
  if (!response.ok) throw new Error(json?.message || "Unable to prepare public donation note");
  return json?.uri ?? null;
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
            network: "Base",
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
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid PAYMENT-SIGNATURE header" }, { status: 400 });
  }

  const { authorization, signature } = payload.payload;
  const recipientWallet = await fetchVerifiedRecipientAddress(body.orgDid).catch(() => null);
  if (!recipientWallet || !isHexAddress(recipientWallet)) {
    return Response.json({ error: "This organization cannot receive donations yet" }, { status: 422 });
  }
  if (authorization.to.toLowerCase() !== recipientWallet.toLowerCase()) {
    return Response.json({ error: "Payment app details do not match this organization" }, { status: 422 });
  }

  const amount = typeof body.amount === "string" ? normalizeUsdcAmountString(body.amount) : formatUsdcAmount(BigInt(authorization.value));
  if (!amount) return Response.json({ error: "Invalid donation amount" }, { status: 400 });
  if (parseUsdcAmount(amount) !== BigInt(authorization.value)) {
    return Response.json({ error: "Authorization amount does not match donation amount" }, { status: 422 });
  }

  let transactionHash: `0x${string}`;
  try {
    transactionHash = (await executeTransferWithAuthorization({ authorization, signature })).transactionHash;
  } catch (error) {
    console.error("[fund] On-chain transfer failed:", error);
    return Response.json({ error: "On-chain transfer failed", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }

  const donorRecordedAs = body.anonymous ? "wallet" : "did";
  const receiptSender: ReceiptSender = body.anonymous
    ? { $type: "org.hypercerts.funding.receipt#text", value: authorization.from }
    : { $type: "app.certified.defs#did", did: donorDid! };
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
    });
  } catch (error) {
    // The payment has already settled on-chain. Surface success and log receipt failures.
    console.error("[fund] Failed to write funding receipt:", error);
  }

  return Response.json({ success: true, transactionHash, receiptUri, donorRecordedAs });
}
