import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie } from "@/app/_lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL("/api/cgs/groups", getAuthBaseUrl());
  upstreamUrl.search = sourceUrl.search;

  const upstream = await fetch(upstreamUrl, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
