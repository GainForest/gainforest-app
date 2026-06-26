import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthBaseUrl } from "@/app/_lib/auth";

export const dynamic = "force-dynamic";

/**
 * Full-handle validation. A handle is a hostname: 2+ dot-separated segments,
 * each 1–63 chars of [a-z0-9-], no leading/trailing hyphen, TLD ≥ 2 chars.
 * Mirrors the shape `com.atproto.identity.updateHandle` enforces server-side
 * so we can fail fast with a friendly message.
 */
const HANDLE_REGEX =
  /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * POST /api/account/handle — change the signed-in user's username (handle).
 * Body: `{ handle: string }` (the FULL new handle, e.g. "alice.gainforest.app").
 *
 * This app delegates authenticated AT Protocol calls to the central auth
 * service (NEXT_PUBLIC_AUTH_BASE_URL), which holds the user's OAuth session.
 * We forward the incoming auth cookie to the auth service's
 * `/api/atproto/update-handle`, exactly like the password-reset proxy does
 * for `/api/atproto/request-password-reset`.
 */
export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { handle?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const handle =
    typeof body.handle === "string" ? body.handle.trim().toLowerCase().replace(/^@/, "") : "";

  if (!handle || handle.length > 253 || !HANDLE_REGEX.test(handle)) {
    return NextResponse.json({ error: "Please enter a valid username." }, { status: 400 });
  }

  const headerList = await headers();
  const cookie = headerList.get("cookie");

  try {
    const upstream = await fetch(`${getAuthBaseUrl()}/api/atproto/update-handle`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ handle }),
    });
    const result = await upstream.json().catch(() => ({ error: "Invalid response from auth server" }));
    return NextResponse.json(result, { status: upstream.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update username";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
