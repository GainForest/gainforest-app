import { NextResponse } from "next/server";
import { GAINFOREST_APP_URL } from "../../_lib/urls";

// Same-origin proxy for the merged app's Certified profile-card endpoint
// (`/api/account/cards`). The Partners globe resolves each org's avatar
// through this route because the upstream does not serve CORS headers,
// so the browser can't call gainforest.app directly from gainforest.earth.
//
// Mirrors the upstream contract: repeated `?did=` params in, a
// `{ profiles: [{ did, handle, displayName, avatar }] }` document out.

const MAX_DIDS_PER_REQUEST = 25; // upstream batch size
const UPSTREAM_TIMEOUT_MS = 15_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dids = url.searchParams
    .getAll("did")
    .map((did) => did.trim())
    .filter((did) => did.startsWith("did:"))
    .slice(0, MAX_DIDS_PER_REQUEST);

  if (dids.length === 0) {
    return NextResponse.json({ profiles: [] });
  }

  const upstream = new URL(`${GAINFOREST_APP_URL}/api/account/cards`);
  for (const did of dids) upstream.searchParams.append("did", did);

  try {
    const res = await fetch(upstream, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // Avatars change rarely; let Next's data cache absorb repeat visits.
      next: { revalidate: 60 * 30 },
    });
    if (!res.ok) {
      return NextResponse.json({ profiles: [] }, { status: 200 });
    }
    const json = (await res.json()) as unknown;
    return NextResponse.json(json, {
      headers: {
        "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch {
    // Degrade to "no avatars" — the globe falls back to the drawn badges.
    return NextResponse.json({ profiles: [] }, { status: 200 });
  }
}
