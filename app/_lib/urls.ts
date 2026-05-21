const CERTS_URL = "https://certs.gainforest.app";
const DATA_URL = "https://data.gainforest.app";
const GAINFOREST_DOT_EARTH = "https://gainforest.earth";

// Marketing / non-profit site. Used as the destination for community
// onboarding ("Tell my impact story" in IWantTo) and the About route
// in the top nav. Stays a constant for now — there's no env override.
export const GAINFOREST_URL = GAINFOREST_DOT_EARTH;

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

export const BUMICERTS_URL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_BUMICERTS_URL,
  CERTS_URL,
  ["https://alpha.fund.gainforest.app"],
);

export const GLOBE_URL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_GREEN_GLOBE_URL,
  DATA_URL,
  ["https://gainforest.app"],
);

export const GLOBE_HOST = GLOBE_URL.replace(/^https?:\/\//, "");
