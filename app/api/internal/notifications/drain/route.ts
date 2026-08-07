import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createNotificationDelivery } from "@/lib/email-notifications/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USABLE_INVOCATION_MS = 55_000;

function configuredSecret(): string | null {
  const secret = process.env.NOTIFICATION_CRON_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

function authorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: NextRequest) {
  const invocationStartedAt = Date.now();
  const secret = configuredSecret();
  if (!secret) {
    return NextResponse.json({ error: "Notification recovery is not configured." }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized notification recovery request." }, { status: 401 });
  }

  try {
    const delivery = createNotificationDelivery();
    const result = await delivery.drain(new Date(invocationStartedAt + USABLE_INVOCATION_MS));
    const health = result.kind === "disabled" ? null : await delivery.health();
    return NextResponse.json({ ...result, health });
  } catch {
    return NextResponse.json({ error: "Notification recovery could not complete. Retry the scheduled request." }, { status: 503 });
  }
}
