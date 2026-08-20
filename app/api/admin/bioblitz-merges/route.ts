import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  addBioblitzMerge,
  BioblitzMergeMutationError,
} from "@/app/internal/badges/_lib/bioblitz-merge-mutations";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Merge one collector's duplicate observations into a single counting one. */
export async function POST(request: Request) {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return Response.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const subjectDid = isRecord(body) && typeof body.subjectDid === "string" ? body.subjectDid : "";
  const roundId = isRecord(body) && typeof body.roundId === "number" ? body.roundId : Number.NaN;
  const canonicalUri = isRecord(body) && typeof body.canonicalUri === "string" ? body.canonicalUri : "";
  const duplicateUris =
    isRecord(body) && Array.isArray(body.duplicateUris)
      ? body.duplicateUris.filter((uri): uri is string => typeof uri === "string")
      : [];
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));

  try {
    const merge = await addBioblitzMerge(access.repoDid, cookie, {
      subjectDid,
      roundId,
      canonicalUri,
      duplicateUris,
    });
    return Response.json({ merge }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof BioblitzMergeMutationError ? error.status : 500;
    const code = error instanceof BioblitzMergeMutationError ? error.code : "save_failed";
    return Response.json({ error: code }, { status });
  }
}
