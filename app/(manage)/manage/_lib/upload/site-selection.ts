import type { ManagedLocation } from "@/app/_lib/indexer";

export type UploadSiteSelection = {
  uri: string;
  rkey: string;
  name: string;
  location: unknown;
  locationType: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAtUri(value: unknown): value is string {
  return typeof value === "string" && /^at:\/\/[^/]+\/[^/]+\/[^/]+$/.test(value);
}

export function toUploadSiteSelection(site: ManagedLocation): UploadSiteSelection | null {
  const uri = site.metadata?.uri;
  const rkey = site.metadata?.rkey;
  if (!uri || !rkey || !isAtUri(uri)) return null;

  return {
    uri,
    rkey,
    name: site.record.name?.trim() || "Unnamed site",
    location: site.record.location ?? null,
    locationType: site.record.locationType ?? null,
  };
}

function extractSiteLocationUrl(location: unknown): string | null {
  if (!isRecord(location)) return null;
  if (location.$type === "app.certified.location#string") return null;
  if (typeof location.uri === "string") return location.uri;
  if (isRecord(location.blob) && typeof location.blob.uri === "string") return location.blob.uri;
  return null;
}

function isTransientBoundaryUrl(url: string): boolean {
  return url.startsWith("blob:");
}

export function uploadSiteHasBoundary(site: UploadSiteSelection): boolean {
  const boundaryUrl = extractSiteLocationUrl(site.location);
  return boundaryUrl !== null && !isTransientBoundaryUrl(boundaryUrl);
}

export function uploadSiteHasTransientBoundary(site: UploadSiteSelection): boolean {
  const boundaryUrl = extractSiteLocationUrl(site.location);
  return boundaryUrl !== null && isTransientBoundaryUrl(boundaryUrl);
}

export function getBoundaryCapableUploadSites(sites: UploadSiteSelection[]): UploadSiteSelection[] {
  return sites.filter(uploadSiteHasBoundary);
}

export function getSiteLocationUrl(site: UploadSiteSelection): string | null {
  return extractSiteLocationUrl(site.location);
}

export function shouldOfferCreateUploadSiteBoundary(options: {
  sitesWithBoundary: UploadSiteSelection[];
  selectedSite: UploadSiteSelection | null;
  selectedSiteBoundaryFailed: boolean;
  allBoundaryCandidatesFailed?: boolean;
}): boolean {
  if (options.sitesWithBoundary.length === 0) return true;
  if (options.allBoundaryCandidatesFailed) return true;
  if (options.sitesWithBoundary.length !== 1 || !options.selectedSiteBoundaryFailed || !options.selectedSite) return false;
  return options.sitesWithBoundary[0]?.uri === options.selectedSite.uri;
}

export function resolveUploadSiteSelection(options: {
  sites: UploadSiteSelection[];
  selectedSiteUri: string | null;
}): UploadSiteSelection | null {
  if (options.selectedSiteUri) {
    return options.sites.find((s) => s.uri === options.selectedSiteUri) ?? null;
  }
  if (options.sites.length === 1) return options.sites[0] ?? null;
  return null;
}

export function isUploadSiteSelection(value: unknown): value is UploadSiteSelection {
  if (!isRecord(value)) return false;
  return (
    typeof value.uri === "string" &&
    typeof value.rkey === "string" &&
    value.rkey.length > 0 &&
    isAtUri(value.uri) &&
    typeof value.name === "string" &&
    (typeof value.locationType === "string" || value.locationType === null) &&
    "location" in value
  );
}
