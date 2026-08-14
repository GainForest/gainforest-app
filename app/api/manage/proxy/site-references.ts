/**
 * Reference tracking for site (app.certified.location) deletion.
 *
 * Sites are referenced from three kinds of records in the same repo:
 *
 *  - Certs (`org.hypercerts.claim.activity`) list places in `locations[]`.
 *    A Cert is a published claim about work at those places, so a site a
 *    Cert points at may NOT be deleted — the Cert must be edited or deleted
 *    first. These references BLOCK deletion.
 *  - Projects (`org.hypercerts.collection`) carry a single `location` pointer,
 *    and the org profile (`app.certified.actor.organization/self`) carries a
 *    single `location` pointer. These are soft pointers: deleting the site
 *    drops them (the record then shows "no location set").
 *  - The default-site pointer (`app.gainforest.organization.defaultSite/self`)
 *    exists only to point at a site; when its site is deleted the pointer
 *    record is deleted with it.
 *
 * `scanSiteReferences` is pure — the proxy route fetches the records and runs
 * the resulting cleanups, so this logic stays unit-testable.
 */

export const SITE_COLLECTION = "app.certified.location";
export const SITE_CERT_COLLECTION = "org.hypercerts.claim.activity";
export const SITE_PROJECT_COLLECTION = "org.hypercerts.collection";
export const SITE_ORG_PROFILE_COLLECTION = "app.certified.actor.organization";
export const SITE_DEFAULT_POINTER_COLLECTION = "app.gainforest.organization.defaultSite";

export type RepoRecordSnapshot = { uri: string; value: unknown };

export type SiteReferenceCleanup =
  | { kind: "putRecord"; collection: string; rkey: string; record: Record<string, unknown> }
  | { kind: "deleteRecord"; collection: string; rkey: string };

export type SiteReferenceScan = {
  /** Titles of Certs that use this site as a place — these block deletion. */
  blockingCertTitles: string[];
  /** Pointer-dropping writes to run once the site has been deleted. */
  cleanups: SiteReferenceCleanup[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rkeyFromUri(uri: string): string | null {
  const rkey = uri.split("/").filter(Boolean).pop();
  return rkey || null;
}

function locationPointerUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const location = value.location;
  if (!isRecord(location)) return null;
  return typeof location.uri === "string" ? location.uri : null;
}

function certReferencesSite(value: unknown, siteUri: string): boolean {
  if (!isRecord(value) || !Array.isArray(value.locations)) return false;
  return value.locations.some((entry) => isRecord(entry) && entry.uri === siteUri);
}

function certTitle(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.title === "string" && value.title.trim() ? value.title.trim() : null;
}

function withoutLocation(value: Record<string, unknown>): Record<string, unknown> {
  const { location: _dropped, ...rest } = value;
  return rest;
}

export function scanSiteReferences(
  siteUri: string,
  repo: {
    certs: RepoRecordSnapshot[];
    projects: RepoRecordSnapshot[];
    orgProfile: { rkey: string; value: unknown } | null;
    defaultSitePointer: { rkey: string; value: unknown } | null;
  },
): SiteReferenceScan {
  const blockingCertTitles: string[] = [];
  for (const cert of repo.certs) {
    if (certReferencesSite(cert.value, siteUri)) {
      blockingCertTitles.push(certTitle(cert.value) ?? "an untitled Cert");
    }
  }

  const cleanups: SiteReferenceCleanup[] = [];

  for (const project of repo.projects) {
    const rkey = rkeyFromUri(project.uri);
    if (!rkey || locationPointerUri(project.value) !== siteUri || !isRecord(project.value)) continue;
    cleanups.push({
      kind: "putRecord",
      collection: SITE_PROJECT_COLLECTION,
      rkey,
      record: withoutLocation(project.value),
    });
  }

  if (
    repo.orgProfile &&
    isRecord(repo.orgProfile.value) &&
    locationPointerUri(repo.orgProfile.value) === siteUri
  ) {
    cleanups.push({
      kind: "putRecord",
      collection: SITE_ORG_PROFILE_COLLECTION,
      rkey: repo.orgProfile.rkey,
      record: withoutLocation(repo.orgProfile.value),
    });
  }

  if (
    repo.defaultSitePointer &&
    isRecord(repo.defaultSitePointer.value) &&
    repo.defaultSitePointer.value.site === siteUri
  ) {
    cleanups.push({
      kind: "deleteRecord",
      collection: SITE_DEFAULT_POINTER_COLLECTION,
      rkey: repo.defaultSitePointer.rkey,
    });
  }

  return { blockingCertTitles, cleanups };
}

/** Plain-language explanation for a blocked site deletion. */
export function siteInUseMessage(certTitles: string[]): string {
  const quoted = certTitles.map((title) => `“${title}”`);
  if (quoted.length === 1) {
    return `This site can't be deleted because the Cert ${quoted[0]} uses it as a place. Remove the site from that Cert (or delete the Cert) first.`;
  }
  return `This site can't be deleted because ${quoted.length} Certs use it as a place: ${quoted.join(", ")}. Remove the site from those Certs (or delete them) first.`;
}
