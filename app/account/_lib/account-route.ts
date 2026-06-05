import { cache } from "react";
import { notFound } from "next/navigation";
import {
  fetchAccountSummary,
  fetchRecordDetail,
  type AccountSummary,
  type RecordDetail,
} from "../../_lib/indexer";
import { shortDid } from "../../_lib/format";

export type AccountKind = "organization" | "user";

export type AccountRouteData = {
  did: string;
  urlIdentifier: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  website: string | null;
  country: string | null;
  createdAt: string | null;
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

export function accountTimelinePath(didOrHandle: string): string {
  return `${accountPath(didOrHandle)}/timeline`;
}

export function accountSettingsPath(didOrHandle: string): string {
  return `${accountPath(didOrHandle)}/settings`;
}

export async function readAccountRouteParams(
  params: Promise<{ did: string }>,
): Promise<{ urlIdentifier: string; did: string }> {
  const { did: encodedDid } = await params;
  const urlIdentifier = safeDecode(encodedDid);
  const did = await resolveIdentifierToDid(urlIdentifier);
  if (!did?.startsWith("did:")) notFound();
  return { urlIdentifier, did };
}

export const getAccountRouteData = cache(async (
  did: string,
  urlIdentifier = did,
): Promise<AccountRouteData> => {
  const [summaryResult, appViewProfile] = await Promise.all([
    fetchAccountSummary(did).catch((error) => {
      console.warn("[account] Failed to read indexer account summary", did, error);
      return null;
    }),
    fetchAppViewProfile(did).catch(() => null),
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
    hasCertifiedOrg: false,
    certOrgType: null,
    hasGainforestOrg: false,
    bumicertCount: 0,
    observationCount: 0,
  };

  const summary = summaryResult ?? fallbackSummary;
  const kind: AccountKind = summary.hasCertifiedOrg || summary.hasGainforestOrg ? "organization" : "user";
  const detail = await readBestAccountDetail(did, summary);
  const displayName =
    summary.displayName?.trim() ||
    appViewProfile?.displayName?.trim() ||
    summary.handle ||
    appViewProfile?.handle ||
    shortDid(did);

  return {
    did,
    urlIdentifier,
    displayName,
    handle: summary.handle ?? appViewProfile?.handle ?? null,
    avatarUrl: summary.avatarUrl ?? appViewProfile?.avatar ?? null,
    coverUrl: appViewProfile?.banner ?? null,
    description: summary.bio ?? appViewProfile?.description ?? detail?.blurb ?? null,
    website: summary.website,
    country: summary.country,
    createdAt: summary.createdAt,
    kind,
    summary,
    detail,
  };
});

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function resolveIdentifierToDid(identifier: string): Promise<string | null> {
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
    summary.hasGainforestOrg ? `at://${did}/app.gainforest.organization.info/self` : null,
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
