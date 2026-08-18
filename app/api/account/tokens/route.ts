import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie } from "@/app/_lib/auth";

export const runtime = "nodejs";

/**
 * Thin proxy for agent Personal Access Tokens (API keys for AI agents).
 *
 * The actual tokens live in the central auth service (hashed in Supabase,
 * keyed by DID) — the same place that holds the user's restorable OAuth
 * session. This route just forwards the browser's auth cookie so the auth
 * service can authenticate the user and mint/list/revoke their keys.
 *
 *   GET    → list the user's keys (metadata only, never the plaintext)
 *   POST   → { name } → mint a key; plaintext returned exactly once
 *   DELETE → { id }   → revoke a key
 */
async function forward(request: Request, method: "GET" | "POST" | "DELETE"): Promise<Response> {
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  const init: RequestInit = {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method === "GET" ? {} : { "content-type": request.headers.get("content-type") ?? "application/json" }),
    },
    cache: "no-store",
  };
  if (method !== "GET") init.body = await request.text();

  const upstream = await fetch(new URL("/api/account/tokens", getAuthBaseUrl()), init);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  return forward(request, "GET");
}

export async function POST(request: Request) {
  return forward(request, "POST");
}

export async function DELETE(request: Request) {
  return forward(request, "DELETE");
}
