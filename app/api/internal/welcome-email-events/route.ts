import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "x-gainforest-webhook-signature";
const TIMESTAMP_HEADER = "x-gainforest-webhook-timestamp";
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

const welcomeUserSchema = z.object({
  did: z.string().min(1).max(256),
  handle: z.string().max(253).optional(),
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
});

const baseWelcomeEventSchema = z.object({
  eventId: z.string().min(1).max(256),
  createdAt: z.string().max(64).optional(),
  locale: z.string().max(35).optional(),
  user: welcomeUserSchema,
});

const welcomeEventSchema = z.discriminatedUnion("type", [
  baseWelcomeEventSchema.extend({
    type: z.literal("user.signup.completed"),
  }),
  baseWelcomeEventSchema.extend({
    type: z.literal("organization.membership.joined"),
    organization: z.object({
      did: z.string().min(1).max(256).optional(),
      name: z.string().min(1).max(200).optional(),
    }),
  }),
]);

function configuredSecret(): string | null {
  const secret = process.env.WELCOME_EMAIL_WEBHOOK_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

function requestBodyTooLarge(request: NextRequest): boolean {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return false;
  const parsed = Number(contentLength);
  return Number.isFinite(parsed) && parsed > MAX_WEBHOOK_BODY_BYTES;
}

async function readBoundedBody(request: NextRequest): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function normalizeSignature(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.startsWith("sha256=") ? trimmed.slice("sha256=".length) : trimmed;
}

function safeCompareHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifySignature(rawBody: string, request: NextRequest, secret: string): boolean {
  const timestamp = request.headers.get(TIMESTAMP_HEADER)?.trim();
  const signature = normalizeSignature(request.headers.get(SIGNATURE_HEADER));
  if (!timestamp || !signature) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  const timestampMs = timestampNumber > 10_000_000_000 ? timestampNumber : timestampNumber * 1000;
  if (Math.abs(Date.now() - timestampMs) > MAX_SIGNATURE_AGE_MS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    return safeCompareHex(expected, signature);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const secret = configuredSecret();
  if (!secret) {
    return NextResponse.json({ error: "Welcome email webhook is not configured." }, { status: 503 });
  }

  if (requestBodyTooLarge(request)) {
    return NextResponse.json({ error: "Welcome email event payload is too large." }, { status: 413 });
  }

  const rawBody = await readBoundedBody(request);
  if (rawBody === null) {
    return NextResponse.json({ error: "Welcome email event payload is too large." }, { status: 413 });
  }

  if (!verifySignature(rawBody, request, secret)) {
    return NextResponse.json({ error: "Invalid welcome email event signature." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid welcome email event payload." }, { status: 400 });
  }

  const parsed = welcomeEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid welcome email event payload." }, { status: 400 });
  }

  const event = parsed.data;
  return NextResponse.json({
    ok: true,
    ignored: true,
    reason: event.type === "user.signup.completed"
      ? "signup_welcome_uses_first_app_session"
      : "membership_welcome_uses_invitation_acceptance",
  });
}
