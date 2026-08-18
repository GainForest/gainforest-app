import { headers } from "next/headers";
import { CgsRequestError, fetchCgsMembersWithCookie } from "@/app/_lib/cgs-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = url.searchParams.get("repo")?.trim() ?? "";
  const cursor = url.searchParams.get("cursor");
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const headerList = await headers();

  try {
    const result = await fetchCgsMembersWithCookie({
      repo,
      cursor,
      limit,
      cookie: headerList.get("cookie"),
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof CgsRequestError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Could not load members.";
    return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
