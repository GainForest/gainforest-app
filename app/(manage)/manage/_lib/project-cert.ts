/**
 * Project ⇄ Cert (1:1) record helpers.
 *
 * A "project" is an `org.hypercerts.collection` record — the only thing users
 * see. Behind it sits exactly one "cert" (`org.hypercerts.claim.activity`),
 * created automatically alongside the project and kept in sync from the
 * project's own fields. This mirrors how the Ma Earth app eagerly creates an
 * "initial activity" for every project (see
 * maearth `ensureActivityFieldsFromProject`), so users never deal with the
 * cert directly.
 *
 * These builders are shared by the project create + edit flows so the two
 * records always agree on title, summary, story, photo, scope, dates,
 * contributors, and places.
 */

import {
  decodeWorkScope,
  type WorkScopeCel,
  type WorkScopeSelection,
} from "@/app/_lib/work-scope-cel";
import type { KnownWorkScopeKey } from "@/app/_lib/work-scope-labels";

export const PROJECT_COLLECTION = "org.hypercerts.collection";
export const CERT_COLLECTION = "org.hypercerts.claim.activity";

export const PROJECT_WORK_SCOPE_KEYS = [
  "reforestation",
  "forest_protection",
  "biodiversity_monitoring",
  "community_stewardship",
  "carbon_removal",
  "restoration_maintenance",
] as const;

export type ProjectCertDraft = {
  title: string;
  shortDescription: string;
  description: string;
  /**
   * Stable work-scope keys (`biodiversity_monitoring`), never translated
   * labels. The editor used to store whatever the chip rendered, which put
   * localized text into published records — render `labels[key]`, store `key`.
   */
  scopes: KnownWorkScopeKey[];
  /** Free-text scope terms, comma separated. */
  customScope: string;
  startDate: string; // yyyy-mm-dd (date input)
  endDate: string; // yyyy-mm-dd (date input)
  ongoing: boolean;
  contributors: string[];
  selectedLocationUris: string[];
};

export const emptyProjectCertDraft: ProjectCertDraft = {
  title: "",
  shortDescription: "",
  description: "",
  scopes: [],
  customScope: "",
  startDate: "",
  endDate: "",
  ongoing: true,
  contributors: [""],
  selectedLocationUris: [],
};

export type StrongRef = { uri: string; cid?: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function clampSummary(value: string): string {
  return value.trim().slice(0, 300);
}

/**
 * The draft's scope as the CEL builder wants it: stable keys plus free text.
 * `draft.scopes` holds keys (not translated labels) — see the note on
 * `ProjectCertDraft.scopes`.
 */
export function scopeSelection(draft: Pick<ProjectCertDraft, "scopes" | "customScope">): WorkScopeSelection {
  const keys = draft.scopes
    .map((item) => item.trim())
    .filter(Boolean) as KnownWorkScopeKey[];
  const custom = draft.customScope
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return { keys, custom };
}

/** Display terms for the scope, for UI that just needs something to render. */
export function scopeList(
  draft: Pick<ProjectCertDraft, "scopes" | "customScope">,
  labels?: Partial<Record<string, string>>,
): string[] {
  const { keys, custom } = scopeSelection(draft);
  return [...keys.map((key) => labels?.[key] ?? key), ...custom];
}

export function contributorList(draft: Pick<ProjectCertDraft, "contributors">): string[] {
  return draft.contributors.map((item) => item.trim()).filter(Boolean);
}

function dateInputToIso(date: string): string | null {
  if (!date) return null;
  const iso = new Date(`${date}T12:00:00.000Z`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

function isoToDateInput(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function descriptionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.value === "string") return value.value;
  return "";
}

/**
 * Resolve the user-selected site URIs into strong refs. Cids come from the
 * loaded sites list; for any selected URI whose cid we don't have locally
 * (e.g. it was attached on another device), fall back to the cert's existing
 * location ref so an edit never drops a place it can't re-resolve.
 */
export function resolveSiteRefs(
  selectedUris: string[],
  loadedSites: ReadonlyArray<{ uri: string; cid?: string | null }>,
  existingLocations: ReadonlyArray<{ uri: string; cid?: string | null }> = [],
): StrongRef[] {
  const byUri = new Map<string, StrongRef>();
  for (const ref of existingLocations) {
    if (ref.uri) byUri.set(ref.uri, { uri: ref.uri, ...(ref.cid ? { cid: ref.cid } : {}) });
  }
  for (const site of loadedSites) {
    if (site.uri) byUri.set(site.uri, { uri: site.uri, ...(site.cid ? { cid: site.cid } : {}) });
  }
  return selectedUris
    .map((uri) => byUri.get(uri) ?? { uri })
    .filter((ref): ref is StrongRef => Boolean(ref.uri));
}

export function extractLocationRefs(record: Record<string, unknown> | null | undefined): StrongRef[] {
  if (!record || !Array.isArray(record.locations)) return [];
  return record.locations
    .map((entry): StrongRef | null => {
      if (!isRecord(entry)) return null;
      const uri = stringValue(entry.uri);
      if (!uri) return null;
      return { uri, ...(stringValue(entry.cid) ? { cid: stringValue(entry.cid)! } : {}) };
    })
    .filter((ref): ref is StrongRef => Boolean(ref));
}

/**
 * Build the `org.hypercerts.claim.activity` record (the cert) from the project
 * draft. Preserves unknown fields on an existing record so an edit only
 * rewrites what the project owns.
 */
export function buildCertRecord(
  draft: ProjectCertDraft,
  options: {
    existing?: Record<string, unknown> | null;
    image?: Record<string, unknown> | null;
    siteRefs?: StrongRef[];
    createdAt?: string;
    /** CEL work scope from `buildWorkScopeCel`; null clears, undefined keeps. */
    workScope?: WorkScopeCel | null;
  } = {},
): Record<string, unknown> {
  const base = isRecord(options.existing) ? { ...options.existing } : {};
  const record: Record<string, unknown> = {
    ...base,
    $type: CERT_COLLECTION,
    title: draft.title.trim(),
    createdAt: stringValue(base.createdAt) ?? options.createdAt ?? new Date().toISOString(),
  };

  const summary = clampSummary(draft.shortDescription);
  if (summary) record.shortDescription = summary;
  else delete record.shortDescription;

  const story = draft.description.trim();
  if (story) record.description = { $type: "org.hypercerts.defs#descriptionString", value: story };
  else delete record.description;

  // Work scope is CEL-only on write. It is built async (tag records have to
  // exist first), so callers resolve it and hand it in; `undefined` means the
  // caller had nothing to say and an existing scope should be left alone.
  if (options.workScope === null) delete record.workScope;
  else if (options.workScope) record.workScope = options.workScope;

  const startIso = dateInputToIso(draft.startDate);
  if (startIso) record.startDate = startIso;
  else delete record.startDate;

  const endIso = draft.ongoing ? null : dateInputToIso(draft.endDate);
  if (endIso) record.endDate = endIso;
  else delete record.endDate;

  const contributors = contributorList(draft);
  if (contributors.length) {
    record.contributors = contributors.map((identity) => ({
      contributorIdentity: {
        $type: "org.hypercerts.claim.activity#contributorIdentity",
        identity,
      },
    }));
  } else {
    delete record.contributors;
  }

  const siteRefs = options.siteRefs ?? [];
  if (siteRefs.length) {
    record.locations = siteRefs.map((ref) => ({ uri: ref.uri, ...(ref.cid ? { cid: ref.cid } : {}) }));
  } else {
    delete record.locations;
  }

  if (options.image === null) {
    delete record.image;
  } else if (options.image) {
    record.image = { $type: "org.hypercerts.defs#smallImage", image: options.image };
  }

  return record;
}

/**
 * Build the `org.hypercerts.collection` record (the project). Keeps the cert
 * linked through `items[]` (the 1:1 cert plus any previously linked records)
 * and stores summary/story/banner for list + detail views.
 */
export function buildProjectRecord(
  draft: Pick<ProjectCertDraft, "title" | "shortDescription" | "description">,
  options: {
    existing?: Record<string, unknown> | null;
    banner?: Record<string, unknown> | null;
    certRef?: StrongRef;
    existingItemUris?: string[];
  } = {},
): Record<string, unknown> {
  const base = isRecord(options.existing) ? { ...options.existing } : {};
  const record: Record<string, unknown> = {
    ...base,
    $type: PROJECT_COLLECTION,
    title: draft.title.trim(),
    type: "project",
    createdAt: stringValue(base.createdAt) ?? new Date().toISOString(),
  };

  const summary = clampSummary(draft.shortDescription);
  if (summary) record.shortDescription = summary;
  else delete record.shortDescription;

  const story = draft.description.trim();
  if (story) record.description = { $type: "org.hypercerts.defs#descriptionString", value: story };
  else delete record.description;

  if (options.banner === null) {
    delete record.banner;
  } else if (options.banner) {
    record.banner = { $type: "org.hypercerts.defs#largeImage", image: options.banner };
  }

  // Maintain items[]: keep existing linked refs, ensure the cert is present.
  const existingItems = Array.isArray(base.items) ? base.items.filter(isRecord) : [];
  let items = existingItems;
  if (options.certRef?.uri) {
    const already = existingItems.some((item) => projectItemUri(item) === options.certRef!.uri);
    if (!already) {
      items = [
        ...existingItems,
        {
          itemIdentifier: {
            uri: options.certRef.uri,
            ...(options.certRef.cid ? { cid: options.certRef.cid } : {}),
          },
        },
      ];
    }
  }
  if (items.length) record.items = items;

  return record;
}

function projectItemUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const itemIdentifier = isRecord(value.itemIdentifier) ? value.itemIdentifier : value;
  return stringValue(itemIdentifier.uri);
}

/** Pull rich cert fields back out of a stored record so edits can hydrate. */
export function certToDraftFields(
  record: Record<string, unknown> | null | undefined,
): Pick<ProjectCertDraft, "scopes" | "customScope" | "startDate" | "endDate" | "ongoing" | "contributors" | "selectedLocationUris"> {
  // Reads accept both union arms: CEL (what we write now) and the legacy comma
  // string, whose terms may be translated display labels from an older editor.
  const { keys, custom } = decodeWorkScope(record?.workScope);
  const contributors = Array.isArray(record?.contributors)
    ? record!.contributors
        .map((entry) => {
          if (!isRecord(entry)) return null;
          const identity = isRecord(entry.contributorIdentity) ? entry.contributorIdentity : null;
          return identity ? stringValue(identity.identity) : null;
        })
        .filter((value): value is string => Boolean(value))
    : [];
  const startDate = isoToDateInput(record?.startDate);
  const endDate = isoToDateInput(record?.endDate);
  return {
    scopes: keys,
    customScope: custom.join(", "),
    startDate,
    endDate,
    ongoing: !endDate,
    contributors: contributors.length ? contributors : [""],
    selectedLocationUris: extractLocationRefs(record).map((ref) => ref.uri),
  };
}

export function extractRkey(uri: string): string {
  return uri.split("/").filter(Boolean).pop() ?? "";
}
