import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_FIELD_LENGTH = 4000;

function cleanField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_FIELD_LENGTH ? `${trimmed.slice(0, MAX_FIELD_LENGTH)}…` : trimmed;
}

/**
 * Receives best-effort crash reports from the browser (error boundaries and
 * window error/unhandledrejection listeners) and writes them to the server
 * log, where hosting providers surface them. Without this, client-side
 * "Application error" crashes are completely invisible to us.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 });
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const report = {
      context: cleanField(parsed.context) ?? "unknown",
      message: cleanField(parsed.message) ?? "(no message)",
      stack: cleanField(parsed.stack),
      componentStack: cleanField(parsed.componentStack),
      url: cleanField(parsed.url),
      userAgent: cleanField(request.headers.get("user-agent")) ?? undefined,
    };

    console.error("[client-error]", JSON.stringify(report));
  } catch {
    // Malformed reports are dropped silently; this endpoint must never error.
  }

  return new NextResponse(null, { status: 204 });
}
