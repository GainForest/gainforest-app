import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  addBlockedDomain,
  BlockedDomainMutationError,
} from "@/app/internal/badges/_lib/blocked-domain-mutations";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(request: Request) {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return Response.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const domain = isRecord(body) && typeof body.domain === "string" ? body.domain : "";
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));

  try {
    const blockedDomain = await addBlockedDomain(access.repoDid, cookie, domain);
    return Response.json({ blockedDomain }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof BlockedDomainMutationError ? error.status : 500;
    const code = error instanceof BlockedDomainMutationError ? error.code : "save_failed";
    return Response.json({ error: code }, { status });
  }
}
