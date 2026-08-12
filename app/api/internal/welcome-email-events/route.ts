import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import { resolveWelcomeEmailLocale } from "@/lib/email/welcome-template";
import { NotificationRepositoryError } from "@/lib/email-notifications/repository";
import { NotificationProducerInputError } from "@/lib/email-notifications/signup-and-membership-notifications";
import { createWelcomeRuntime } from "@/lib/email-notifications/welcome-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIGNATURE_HEADER = "x-gainforest-webhook-signature";
const TIMESTAMP_HEADER = "x-gainforest-webhook-timestamp";
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const PROFILE_LOOKUP_BUDGET_MS = 3_000;
const USABLE_INVOCATION_MS = 55_000;

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

function withinProfileLookupBudget<T>(work: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timeout = setTimeout(() => resolve(fallback), PROFILE_LOOKUP_BUDGET_MS);
    work.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      () => {
        clearTimeout(timeout);
        resolve(fallback);
      },
    );
  });
}

async function organizationName(event: z.infer<typeof welcomeEventSchema>): Promise<string | undefined> {
  if (event.type !== "organization.membership.joined") return undefined;

  const explicit = event.organization.name?.trim();
  if (explicit) return explicit;

  const did = event.organization.did?.trim();
  if (!did?.startsWith("did:")) return undefined;

  const card = await getCertifiedProfileCard(did).catch(() => null);
  return card?.displayName?.trim() || undefined;
}

function plainDisplayName(value: string | null | undefined, event: z.infer<typeof welcomeEventSchema>): string | null {
  const name = value?.trim();
  if (!name) return null;

  const handle = event.user.handle?.trim();
  if (handle && name.toLowerCase() === handle.toLowerCase()) return null;
  if (name.toLowerCase() === event.user.email.toLowerCase() || name.startsWith("did:")) return null;

  return name;
}

async function friendlyName(event: z.infer<typeof welcomeEventSchema>): Promise<string | null> {
  const explicit = plainDisplayName(event.user.name, event);
  if (explicit) return explicit;

  const did = event.user.did.trim();
  if (!did.startsWith("did:")) return null;

  const card = await getCertifiedProfileCard(did).catch(() => null);
  return plainDisplayName(card?.displayName, event);
}

export async function POST(request: NextRequest) {
  const invocationStartedAt = Date.now();
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
  if (event.type === "user.signup.completed") {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "signup_welcome_uses_first_app_session",
    });
  }

  const locale = resolveWelcomeEmailLocale({
    explicitLocale: event.locale,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const [resolvedName, resolvedOrganizationName] = await Promise.all([
    withinProfileLookupBudget(friendlyName(event), null),
    withinProfileLookupBudget(organizationName(event), undefined),
  ]);
  const name = resolvedName ?? undefined;
  const common = {
    authEventId: event.eventId,
    userDid: event.user.did,
    email: event.user.email,
    name,
    locale,
    createdAt: event.createdAt ?? new Date(invocationStartedAt).toISOString(),
  };
  const input = {
    ...common,
    type: "membership_joined" as const,
    organizationDid: event.organization.did,
    organizationName: resolvedOrganizationName,
  };

  try {
    const notification = await createWelcomeRuntime().deliver(
      input,
      new Date(invocationStartedAt + USABLE_INVOCATION_MS),
    );
    return NextResponse.json({ ok: true, notification });
  } catch (error) {
    if (error instanceof NotificationProducerInputError) {
      return NextResponse.json({ error: "Invalid welcome email event payload." }, { status: 400 });
    }
    if (error instanceof NotificationRepositoryError && error.code === "idempotency_conflict") {
      return NextResponse.json({
        error: "Welcome email event ID conflicts with a previously accepted event.",
      }, { status: 409 });
    }
    console.error("welcome-email-events delivery failed", {
      eventIdHash: createHash("sha256").update(event.eventId).digest("hex").slice(0, 16),
      eventType: event.type,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "Welcome email event could not be queued. Retry the signed event." }, { status: 503 });
  }
}
