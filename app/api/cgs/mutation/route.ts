import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie } from "@/app/_lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: await request.text(),
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
