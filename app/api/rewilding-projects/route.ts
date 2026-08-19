import { fetchRewildingProjectUris } from "@/app/_lib/rewilding-projects";

export const runtime = "nodejs";

/**
 * Public, read-only list of the project record URIs that are part of the
 * "Rewilding the Web" grant right now — selected by an admin *and* owned by an
 * account that still holds a grant slot (the filtering happens server-side in
 * `fetchRewildingProjectUris`). The projects page uses it to render the
 * Rewilding the Web shelf and the per-project indicator. Selecting projects
 * happens only in the admin panel, so there is no write here.
 */
export async function GET() {
  const uris = await fetchRewildingProjectUris().catch(() => []);
  return Response.json({ uris }, { headers: { "cache-control": "no-store" } });
}
