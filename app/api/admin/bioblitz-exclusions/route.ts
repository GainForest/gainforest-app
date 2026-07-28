import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  addBioblitzExclusion,
  BioblitzExclusionMutationError,
} from "@/app/internal/badges/_lib/bioblitz-exclusion-mutations";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function loadAccess() {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return { error: Response.json({ error: "not_signed_in" }, { status: 401 }) } as const;
  }
  if (
    !access.configured ||
    !access.isModerator ||
    !access.repoDid ||
    (access.role !== "owner" && access.role !== "admin")
  ) {
    return { error: Response.json({ error: "forbidden" }, { status: 403 }) } as const;
  }
  return { repoDid: access.repoDid } as const;
}

export async function POST(request: Request) {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const body = await request.json().catch(() => null);
  const subjectDid = isRecord(body) && typeof body.subjectDid === "string" ? body.subjectDid : "";
  const roundId = isRecord(body) && typeof body.roundId === "number" ? body.roundId : Number.NaN;
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));

  try {
    const exclusion = await addBioblitzExclusion(loaded.repoDid, cookie, subjectDid, roundId);
    return Response.json({ exclusion }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof BioblitzExclusionMutationError ? error.status : 500;
    const code = error instanceof BioblitzExclusionMutationError ? error.code : "save_failed";
    return Response.json({ error: code }, { status });
  }
}
