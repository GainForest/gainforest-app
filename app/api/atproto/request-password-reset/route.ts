import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { relayUpstreamCookies } from "@/app/_lib/upstream-cookies";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const headerList = await headers();
  const cookie = headerList.get("cookie");

  try {
    const upstream = await fetch(`${getAuthBaseUrl()}/api/atproto/request-password-reset`, {
      method: "POST",
      headers: cookie ? { cookie } : undefined,
    });
    const result = await upstream.json().catch(() => ({ error: "Invalid response from auth server" }));
    // The auth service may refresh the session here (it backfills the account
    // email the first time it resolves it) — pass the cookie on.
    return relayUpstreamCookies(upstream, NextResponse.json(result, { status: upstream.status }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send reset email";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
