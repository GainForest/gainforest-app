import { NextResponse } from "next/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { searchAccountsByName } from "@/app/_lib/indexer";
import { resolveBlobUrl, resolveDidHandle } from "@/app/_lib/pds";
import {
  effectiveRewildingGrantees,
  fetchRewildingGrantees,
} from "@/app/_lib/rewilding-grantees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/rewilding/search?q=… — find an account to enroll into a
 * Rewilding grant slot. Moderator-gated. Searches certified profiles by
 * display name and flags accounts that already hold a slot, so the picker
 * can show them as taken instead of failing on submit.
 *
 * Every result carries a handle. Display names are not unique — a search for
 * "GainForest" returns half a dozen — so without one an admin cannot tell
 * which account they are about to admit to a grant. The indexer's handle is
 * used when it has one, falling back to the account's DID document, which is
 * authoritative and always available.
 */
export async function GET(request: Request) {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (!access.isModerator) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  try {
    const [matches, enrollmentRecords] = await Promise.all([
      searchAccountsByName(query, 8),
      fetchRewildingGrantees().catch(() => []),
    ]);
    const enrolled = new Set(
      effectiveRewildingGrantees(enrollmentRecords).map((record) => record.subjectDid),
    );

    const results = await Promise.all(
      matches.map(async (match) => {
        const [handle, avatarUrl] = await Promise.all([
          match.handle ?? resolveDidHandle(match.did).catch(() => null),
          match.avatarRef ? resolveBlobUrl(match.did, match.avatarRef).catch(() => null) : null,
        ]);
        return {
          did: match.did,
          displayName: match.displayName,
          handle,
          avatarUrl,
          alreadyEnrolled: enrolled.has(match.did),
        };
      }),
    );
    return NextResponse.json({ results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[rewilding] grantee search failed", error);
    return NextResponse.json({ error: "search_failed" }, { status: 502 });
  }
}
