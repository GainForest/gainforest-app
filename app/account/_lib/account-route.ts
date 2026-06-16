import { cache } from "react";
import { notFound } from "next/navigation";
import {
  fetchAccountSummary,
  fetchRecordDetail,
  type AccountSummary,
  type RecordDetail,
} from "../../_lib/indexer";
import { shortDid } from "../../_lib/format";
import { preferredDidIdentifier } from "../../_lib/urls";
import { fetchCertifiedLocationCountryCode } from "../../_lib/country-location";
import { resolveBlobUrl, resolvePdsHost } from "../../_lib/pds";

export type AccountKind = "organization" | "user";

export type AccountRouteData = {
  did: string;
  urlIdentifier: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  /** Long-form "about" text, read from the org record's `longDescription`. */
  longDescription: string | null;
  website: string | null;
  country: string | null;
  createdAt: string | null;
  foundedDate: string | null;
  visibility: "Public" | "Unlisted" | null;
  /** Organization category (e.g. "Nonprofit"), read straight from the org record. */
  orgType: string | null;
  /** Social / website URLs stored on the org record's `urls` list. */
  socialLinks: string[];
  kind: AccountKind;
  summary: AccountSummary;
  detail: RecordDetail | null;
};

type AppViewProfile = {
  did?: string;
  handle?: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
};

type DirectCertifiedProfile = {
  displayName: string | null;
  description: string | null;
  website: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
};

type DirectCertifiedOrganization = {
  country: string | null;
  foundedDate: string | null;
  visibility: "Public" | "Unlisted" | null;
  createdAt: string | null;
  orgType: string | null;
  socialLinks: string[];
  longDescription: string | null;
};

export function encodeAccountSegment(value: string): string {
  return encodeURIComponent(value);
}

export function accountPath(didOrHandle: string): string {
  return `/account/${encodeAccountSegment(didOrHandle)}`;
}

export function accountBumicertsPath(didOrHandle: string): string {
  return `${accountPath(didOrHandle)}/bumicerts`;
}

export function accountDonationsPath(didOrHandle: string): string {
  return `${accountPath(didOrHandle)}/donations`;
}

export function accountObservationsPath(didOrHandle: string): string {
  return `${accountPath(didOrHandle)}/observations`;
}

export function accountGalleryPath(didOrHandle: string): string {
  return `${accountPath(didOrHandle)}/gallery`;
}

export function accountTimelinePath(didOrHandle: string): string {
  return `${accountPath(didOrHandle)}/timeline`;
}

export function accountSettingsPath(didOrHandle: string): string {
  return `${accountPath(didOrHandle)}/settings`;
}

export async function readOptionalAccountRouteParams(
  params: Promise<{ did: string }>,
): Promise<{ urlIdentifier: string; did: string } | null> {
  const { did: encodedDid } = await params;
  const urlIdentifier = safeDecode(encodedDid);
  const did = await resolveIdentifierToDid(urlIdentifier);
  return did?.startsWith("did:") ? { urlIdentifier, did } : null;
}

export async function readAccountRouteParams(
  params: Promise<{ did: string }>,
): Promise<{ urlIdentifier: string; did: string }> {
  const routeParams = await readOptionalAccountRouteParams(params);
  if (!routeParams) notFound();
  return routeParams;
}

export const getAccountRouteData = cache(async (
  did: string,
  urlIdentifier = did,
): Promise<AccountRouteData> => {
  const [summaryResult, appViewProfile, directCertifiedProfile, directCertifiedOrganization] = await Promise.all([
    fetchAccountSummary(did).catch((error) => {
      console.warn("[account] Failed to read indexer account summary", did, error);
      return null;
    }),
    fetchAppViewProfile(did).catch(() => null),
    fetchDirectCertifiedProfile(did).catch(() => null),
    fetchDirectCertifiedOrganization(did).catch(() => null),
  ]);

  const fallbackSummary: AccountSummary = {
    did,
    handle: appViewProfile?.handle ?? null,
    displayName: appViewProfile?.displayName ?? null,
    avatarUrl: appViewProfile?.avatar ?? null,
    bio: appViewProfile?.description ?? null,
    website: null,
    country: null,
    createdAt: null,
    foundedDate: null,
    visibility: null,
    hasCertifiedProfile: false,
    hasCertifiedOrg: false,
    certOrgType: null,
    bumicertCount: 0,
    observationCount: 0,
  };

  const baseSummary = summaryResult ?? fallbackSummary;
  const summary = {
    ...baseSummary,
    displayName: baseSummary.displayName ?? directCertifiedProfile?.displayName ?? null,
    avatarUrl: baseSummary.avatarUrl ?? directCertifiedProfile?.avatarUrl ?? null,
    bio: baseSummary.bio ?? directCertifiedProfile?.description ?? null,
    website: baseSummary.website ?? directCertifiedProfile?.website ?? null,
    country: directCertifiedOrganization ? directCertifiedOrganization.country : baseSummary.country ?? null,
    createdAt: baseSummary.createdAt ?? directCertifiedOrganization?.createdAt ?? directCertifiedProfile?.createdAt ?? null,
    foundedDate: baseSummary.foundedDate ?? directCertifiedOrganization?.foundedDate ?? null,
    visibility: baseSummary.visibility ?? directCertifiedOrganization?.visibility ?? null,
    hasCertifiedProfile: baseSummary.hasCertifiedProfile || Boolean(directCertifiedProfile),
    hasCertifiedOrg: baseSummary.hasCertifiedOrg || Boolean(directCertifiedOrganization),
  };
  const kind: AccountKind = summary.hasCertifiedOrg ? "organization" : "user";
  const detail = await readBestAccountDetail(did, summary);
  const displayName =
    summary.displayName?.trim() ||
    appViewProfile?.displayName?.trim() ||
    summary.handle ||
    appViewProfile?.handle ||
    shortDid(did);

  return {
    did,
    urlIdentifier: preferredDidIdentifier(did, summary.handle ?? appViewProfile?.handle ?? (urlIdentifier === did ? null : urlIdentifier)),
    displayName,
    handle: summary.handle ?? appViewProfile?.handle ?? null,
    avatarUrl: summary.avatarUrl ?? appViewProfile?.avatar ?? null,
    coverUrl: appViewProfile?.banner ?? null,
    description: summary.bio ?? appViewProfile?.description ?? detail?.blurb ?? null,
    longDescription: directCertifiedOrganization?.longDescription ?? null,
    website: summary.website,
    country: summary.country,
    createdAt: summary.createdAt,
    foundedDate: summary.foundedDate,
    visibility: summary.visibility,
    orgType: directCertifiedOrganization?.orgType ?? summary.certOrgType ?? null,
    socialLinks: directCertifiedOrganization?.socialLinks ?? [],
    kind,
    summary,
    detail,
  };
});

/**
 * Slim profile card for a DID, read straight from `app.certified.actor.profile`.
 * Used by account pickers/cards where we only need basic profile copy +
 * avatar per group and don't want the full indexer/AppView hydration.
 */
export const getCertifiedProfileCard = cache(
  async (did: string): Promise<{ displayName: string | null; description: string | null; avatarUrl: string | null; handle: string | null }> => {
    if (!did.startsWith("did:")) return { displayName: null, description: null, avatarUrl: null, handle: null };
    const [profile, appViewProfile] = await Promise.all([
      fetchDirectCertifiedProfile(did).catch(() => null),
      fetchAppViewProfile(did).catch(() => null),
    ]);
    return {
      displayName: profile?.displayName ?? appViewProfile?.displayName ?? null,
      description: profile?.description ?? appViewProfile?.description ?? null,
      avatarUrl: profile?.avatarUrl ?? appViewProfile?.avatar ?? null,
      handle: appViewProfile?.handle ?? null,
    };
  },
);

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function resolveIdentifierToDid(identifier: string): Promise<string | null> {
  if (identifier.startsWith("did:")) return identifier;

  const appViewProfile = await fetchAppViewProfile(identifier).catch(() => null);
  if (appViewProfile?.did?.startsWith("did:")) return appViewProfile.did;

  const plcDid = await resolveHandleWithPlc(identifier).catch(() => null);
  return plcDid?.startsWith("did:") ? plcDid : null;
}

async function fetchAppViewProfile(actor: string): Promise<AppViewProfile | null> {
  const response = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
    { next: { revalidate: 300 } },
  );
  if (!response.ok) return null;
  return (await response.json()) as AppViewProfile;
}

async function fetchDirectRecordValue(did: string, collection: string): Promise<Record<string, unknown> | null> {
  const host = await resolvePdsHost(did);
  if (!host) return null;
  const params = new URLSearchParams({ repo: did, collection, rkey: "self" });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { value?: Record<string, unknown> };
  return data.value ?? null;
}

async function fetchDirectCertifiedProfile(did: string): Promise<DirectCertifiedProfile | null> {
  const value = await fetchDirectRecordValue(did, "app.certified.actor.profile");
  if (!value) return null;

  const avatar = value.avatar;
  const avatarRef = typeof avatar === "object" && avatar !== null && "image" in avatar
    ? blobRef((avatar as { image?: unknown }).image)
    : null;

  return {
    displayName: typeof value.displayName === "string" && value.displayName.trim() ? value.displayName.trim() : null,
    description: typeof value.description === "string" ? value.description : null,
    website: typeof value.website === "string" ? value.website : null,
    avatarUrl: await resolveBlobUrl(did, avatarRef),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
  };
}

function blobRef(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return null;
  const ref = (value as { ref?: unknown }).ref;
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && ref !== null && "$link" in ref) {
    const link = (ref as { $link?: unknown }).$link;
    return typeof link === "string" ? link : null;
  }
  return null;
}

async function fetchDirectCertifiedOrganization(did: string): Promise<DirectCertifiedOrganization | null> {
  const value = await fetchDirectRecordValue(did, "app.certified.actor.organization");
  if (!value) return null;
  const rawVisibility = typeof value.visibility === "string" ? value.visibility : null;
  const location = value.location;
  const locationUri = typeof location === "object" && location !== null && "uri" in location
    ? typeof location.uri === "string" ? location.uri : null
    : null;
  const orgTypes = Array.isArray(value.organizationType)
    ? value.organizationType.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];
  const socialLinks = Array.isArray(value.urls)
    ? value.urls
        .map((entry) => (typeof entry === "object" && entry !== null && "url" in entry ? (entry as { url?: unknown }).url : null))
        .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    : [];
  const longDescription = typeof value.longDescription === "object" && value.longDescription !== null && "value" in value.longDescription
    ? typeof (value.longDescription as { value?: unknown }).value === "string"
      ? (value.longDescription as { value: string }).value.trim() || null
      : null
    : null;
  return {
    country: await fetchCertifiedLocationCountryCode(locationUri),
    foundedDate: typeof value.foundedDate === "string" ? value.foundedDate : null,
    visibility: rawVisibility === "unlisted" || rawVisibility === "Unlisted" ? "Unlisted" : rawVisibility ? "Public" : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
    orgType: orgTypes.length ? orgTypes.join(", ") : null,
    socialLinks,
    longDescription,
  };
}

async function resolveHandleWithPlc(handle: string): Promise<string | null> {
  const response = await fetch(
    `https://plc.directory/resolve?handle=${encodeURIComponent(handle)}`,
    { next: { revalidate: 300 } },
  );
  if (!response.ok) return null;
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { did?: string; id?: string };
    return json.did ?? json.id ?? null;
  } catch {
    return text.trim();
  }
}

async function readBestAccountDetail(
  did: string,
  summary: AccountSummary,
): Promise<RecordDetail | null> {
  const uris = [
    summary.hasCertifiedOrg ? `at://${did}/app.certified.actor.organization/self` : null,
  ].filter((uri): uri is string => Boolean(uri));

  for (const uri of uris) {
    const detail = await fetchRecordDetail(uri).catch((error) => {
      console.warn("[account] Failed to read account detail", uri, error);
      return null;
    });
    if (detail) return detail;
  }

  return null;
}
