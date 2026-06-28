/**
 * Global search — the data layer behind the top-right ⌘K command palette.
 *
 * Unlike the explore pages (which page a single record stream), the palette
 * searches Projects, Organizations, and Observations at once. Each stream is a
 * thin wrapper over the existing indexer
 * fetchers, which already push the user's query down to Hyperindex as a
 * server-side `contains` filter — so this stays a handful of cheap queries
 * per keystroke (debounced upstream) instead of downloading a whole corpus.
 *
 * Everything runs in the browser, directly against the indexer, exactly like
 * the explore grids. `Promise.allSettled` keeps one slow/failed stream from
 * blanking the others.
 */

import {
  fetchHiddenAccountDids,
  fetchProjects,
  searchAccountsByName,
  walkOccurrences,
  isLikelyTestRecordName,
} from "./indexer";
import {
  localProjectHref,
  localObservationHref,
  accountHref,
} from "./urls";

export type GlobalSearchKind = "project" | "organization" | "observation";

/** A single result row in the palette. */
export type GlobalSearchHit = {
  kind: GlobalSearchKind;
  /** Stable key for React lists + active-row tracking. */
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** Owner DID — lets the avatar/thumbnail resolve a PDS blob lazily. */
  did?: string;
  /** Organization avatar blob ref (CID), resolved on render. */
  avatarRef?: string | null;
  /** Ready-to-render image URL (external thumbnails / hosted covers). */
  imageUrl?: string | null;
};

/** One group of results, in display order. */
export type GlobalSearchSection = {
  kind: GlobalSearchKind;
  hits: GlobalSearchHit[];
};

export type GlobalSearchResults = {
  sections: GlobalSearchSection[];
  /** Flattened, in section order — drives keyboard navigation. */
  flat: GlobalSearchHit[];
  totalCount: number;
};

/** Don't fire until the query is at least this long — avoids hammering the
 *  indexer on a single stray character. */
export const MIN_QUERY_LENGTH = 2;

/** Per-section result cap. Keeps the dropdown compact and the queries light. */
const PER_KIND_CAP = 5;

/** Section order in the palette. */
const KIND_ORDER: GlobalSearchKind[] = ["project", "organization", "observation"];

const EMPTY_RESULTS: GlobalSearchResults = { sections: [], flat: [], totalCount: 0 };

function observationTitle(record: {
  vernacularName: string | null;
  scientificName: string | null;
}): string {
  return record.vernacularName?.trim() || record.scientificName?.trim() || "Sighting";
}

function observationSubtitle(record: {
  vernacularName: string | null;
  scientificName: string | null;
  locality: string | null;
  country: string | null;
}): string | null {
  // Prefer the scientific name as a subtitle when the common name is the
  // title; otherwise fall back to where it was seen.
  if (record.vernacularName?.trim() && record.scientificName?.trim()) {
    return record.scientificName.trim();
  }
  return record.locality?.trim() || record.country?.trim() || null;
}

/**
 * Search Projects, Organizations, and Observations for `query` and return them
 * grouped + flattened. Returns empty for queries shorter than
 * {@link MIN_QUERY_LENGTH}. Each stream is independent — a failure in one
 * leaves the others intact.
 */
export async function searchEverything(
  query: string,
  signal?: AbortSignal,
): Promise<GlobalSearchResults> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return EMPTY_RESULTS;

  // Accounts a steward flagged as "test" never surface in search — neither the
  // accounts themselves nor any of their projects / observations. Resolved once
  // (cached) and applied as a final guard over every stream's results.
  const hidden = await fetchHiddenAccountDids(signal).catch(() => new Set<string>());

  const [projectResult, orgResult, observationResult] = await Promise.allSettled([
    fetchProjects(PER_KIND_CAP, null, signal, undefined, {
      query: q,
      featuredBadgesOnly: false,
    }),
    searchAccountsByName(q, PER_KIND_CAP, signal),
    walkOccurrences({
      media: "all",
      target: PER_KIND_CAP,
      after: null,
      query: q,
      signal,
      // Skip per-result blob resolution — the palette shows external
      // thumbnails when present and a kind icon otherwise, so a getBlob
      // round-trip per keystroke would be wasted work.
      resolveMedia: false,
    }),
  ]);

  const byKind: Record<GlobalSearchKind, GlobalSearchHit[]> = {
    project: [],
    organization: [],
    observation: [],
  };

  if (projectResult.status === "fulfilled") {
    for (const record of projectResult.value.records) {
      if (hidden.has(record.did) || isLikelyTestRecordName(record.title)) continue;
      byKind.project.push({
        kind: "project",
        id: record.id,
        title: record.title,
        subtitle: record.shortDescription,
        href: localProjectHref(record.did, record.rkey),
        did: record.did,
        imageUrl: record.imageUrl,
      });
    }
  }

  if (orgResult.status === "fulfilled") {
    for (const account of orgResult.value) {
      if (hidden.has(account.did)) continue;
      byKind.organization.push({
        kind: "organization",
        id: account.did,
        title: account.displayName,
        subtitle: null,
        href: accountHref(account.did),
        did: account.did,
        avatarRef: account.avatarRef,
      });
    }
  }

  if (observationResult.status === "fulfilled") {
    for (const record of observationResult.value.records) {
      if (
        hidden.has(record.did) ||
        isLikelyTestRecordName(record.scientificName) ||
        isLikelyTestRecordName(record.vernacularName)
      ) {
        continue;
      }
      byKind.observation.push({
        kind: "observation",
        id: record.id,
        title: observationTitle(record),
        subtitle: observationSubtitle(record),
        href: localObservationHref(record.did, record.rkey),
        did: record.did,
        imageUrl: record.imageUrl,
      });
    }
  }

  const sections: GlobalSearchSection[] = [];
  const flat: GlobalSearchHit[] = [];
  let totalCount = 0;
  for (const kind of KIND_ORDER) {
    const hits = byKind[kind].slice(0, PER_KIND_CAP);
    if (hits.length === 0) continue;
    sections.push({ kind, hits });
    flat.push(...hits);
    totalCount += hits.length;
  }

  return { sections, flat, totalCount };
}
