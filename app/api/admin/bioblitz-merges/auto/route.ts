import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { BioblitzAdminRoundNotFoundError } from "@/app/admin/_lib/bioblitz-dashboard";
import { loadBioblitzAutoMergePlan } from "@/app/admin/_lib/bioblitz-duplicates";
import {
  addBioblitzMerge,
  BioblitzMergeMutationError,
} from "@/app/internal/badges/_lib/bioblitz-merge-mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * One-click bulk merge of every identical-image duplicate group in a round.
 * The plan is recomputed server-side from the same detection the dashboard
 * shows, so the client cannot submit arbitrary merge lists through this
 * endpoint, and re-running it is idempotent.
 */
export async function POST(request: Request) {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) {
    return Response.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const roundId = isRecord(body) && typeof body.roundId === "number" ? body.roundId : Number.NaN;
  if (!Number.isSafeInteger(roundId) || roundId < 1) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));

  let plan;
  try {
    plan = await loadBioblitzAutoMergePlan(roundId);
  } catch (error) {
    if (error instanceof BioblitzAdminRoundNotFoundError) {
      return Response.json({ error: "round_not_found" }, { status: 404 });
    }
    console.error("[admin-bioblitz] auto-merge plan failed", error);
    return Response.json({ error: "duplicates_load_failed" }, { status: 502 });
  }

  let merged = 0;
  let failed = 0;
  for (const entry of plan.entries) {
    try {
      await addBioblitzMerge(access.repoDid, cookie, {
        subjectDid: entry.did,
        roundId: plan.roundId,
        canonicalUri: entry.canonicalUri,
        duplicateUris: entry.duplicateUris,
      });
      merged += 1;
    } catch (error) {
      // A closed round can never be partially merged — surface it directly.
      if (error instanceof BioblitzMergeMutationError && error.code === "round_finalized") {
        return Response.json({ error: error.code }, { status: error.status });
      }
      failed += 1;
    }
  }

  return Response.json(
    { planned: plan.entries.length, merged, failed },
    { headers: { "cache-control": "no-store" } },
  );
}
