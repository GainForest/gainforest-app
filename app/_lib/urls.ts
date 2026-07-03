// Outbound product URLs.
//
// July 2026: green_globe (data.gainforest.app) and Bumicerts
// (certs.gainforest.app) were merged into ONE app at gainforest.app
// ("the GainForest app", repo: GainForest/gainforest-explorer). Both
// legacy hosts still exist — certs.gainforest.app 308-redirects
// path-preserving into gainforest.app, and data.gainforest.app still
// serves the old green_globe deployment (we keep depending on its
// `/api/list-organizations` endpoint, which the merged app does NOT
// expose) — but every visitor-facing link on this landing points at
// the merged app.
//
// Route map of the merged app (verified 2026-07-03):
//   /projects              project list (old /bumicerts redirects here)
//   /cert/<did>/<rkey>     cert detail (old /bumicert/<did>-<rkey> still 200)
//   /globe                 the merged green_globe
//   /organizations         org directory
//   /observations          biodiversity observations feed
//   /manage/organizations  steward dashboard (the "showcase your work" CTA;
//                          the old /bumicert/create route is a 404 upstream)
const GAINFOREST_APP_FALLBACK = "https://gainforest.app";
const GREEN_GLOBE_API_FALLBACK = "https://data.gainforest.app";
// Documentation portal. Community onboarding ("Tell my impact story"
// in IWantTo) points here now that this landing itself lives at
// gainforest.earth (a self-link would be pointless).
export const DOCS_URL = "https://docs.gainforest.earth";

function normalizeBaseUrl(
  value: string | undefined,
  fallback: string,
  legacyHosts: ReadonlyArray<string>,
): string {
  const raw = value?.trim() || fallback;
  const withoutTrailingSlash = raw.replace(/\/+$/, "");
  return legacyHosts.includes(withoutTrailingSlash)
    ? fallback
    : withoutTrailingSlash;
}

/** The merged GainForest app. Old env overrides that still point at the
 *  pre-merge hosts are treated as legacy and snapped to the fallback. */
export const GAINFOREST_APP_URL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_GAINFOREST_APP_URL,
  GAINFOREST_APP_FALLBACK,
  [
    "https://alpha.fund.gainforest.app",
    "https://certs.gainforest.app",
    "https://data.gainforest.app",
  ],
);

// Visitor-facing routes inside the merged app.
export const PROJECTS_URL = `${GAINFOREST_APP_URL}/projects`;
export const GLOBE_URL = `${GAINFOREST_APP_URL}/globe`;
export const ORGANIZATIONS_URL = `${GAINFOREST_APP_URL}/organizations`;
export const OBSERVATIONS_URL = `${GAINFOREST_APP_URL}/observations`;
/** Steward dashboard — the merged app's "showcase your regenerative
 *  work" entry point (replaces the retired /bumicert/create flow). */
export const MANAGE_URL = `${GAINFOREST_APP_URL}/manage/organizations`;

/** Cert detail page: /cert/<url-encoded did>/<rkey> (the merged app's
 *  canonical pattern; the legacy /bumicert/<did>-<rkey> path still
 *  resolves upstream but new links should use this one). */
export function certUrl(did: string, rkey: string): string {
  return `${GAINFOREST_APP_URL}/cert/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
}

/** Display host for UI captions, e.g. "gainforest.app". */
export const GAINFOREST_APP_HOST = GAINFOREST_APP_URL.replace(
  /^https?:\/\//,
  "",
);

/**
 * Data-API origin for `fetchProjectPins()` ONLY. The merged app does
 * not serve green_globe's `/api/list-organizations` route (verified:
 * 404 on gainforest.app), so the pin fetcher keeps reading from the
 * still-deployed data.gainforest.app. Do NOT use this for links.
 */
export const GREEN_GLOBE_API_URL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_GREEN_GLOBE_URL,
  GREEN_GLOBE_API_FALLBACK,
  ["https://gainforest.app"],
);
