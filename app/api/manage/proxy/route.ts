import { headers } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthBaseUrl } from "@/app/_lib/auth";

export const runtime = "nodejs";

/**
 * Thin proxy from gainforest-explorer API routes → auth.gainforest.app/api/atproto/mutation.
 *
 * The client sends mutation payloads to this route; the route validates the
 * local session and forwards the request to the auth server with the same
 * session cookie so the auth server can restore the ATProto OAuth agent and
 * execute the PDS operation on behalf of the user.
 */
export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const headerList = await headers();
  const cookie = headerList.get("cookie");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const authUrl = `${getAuthBaseUrl()}/api/atproto/mutation`;
  let upstream: Response;
  try {
    upstream = await fetch(authUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth server unreachable";
    return Response.json({ error: message }, { status: 502 });
  }

  const result = await upstream.json().catch(() => ({ error: "Invalid response from auth server" }));
  return Response.json(result, { status: upstream.status });
}
