/**
 * GainForest field-equipment registry — a small atproto record type for
 * tracking physical gear (AudioMoths, phones, Raspberry Pis, cameras, GPS
 * units …): which unit it is, who currently holds it, which project site it
 * lives at, and what state it is in.
 *
 * Records live in each person's own repo under `app.gainforest.equipment`
 * — the same "write to your own PDS" model the tree forms use. Reads are
 * public (the PDS list endpoints serve `access-control-allow-origin: *`), so
 * the profile tab lists records straight from the browser; writes go through
 * the existing session-gated `/api/manage/proxy` mutation route.
 *
 * Ported from the gainforest-explorer equipment registry so both apps share
 * one record shape.
 */

import { resolvePdsHost } from "./pds";

export const EQUIPMENT_COLLECTION = "app.gainforest.equipment";

export type EquipmentCategory =
  | "audiomoth"
  | "phone"
  | "raspberrypi"
  | "camera"
  | "sensor"
  | "gps"
  | "drone"
  | "starlink"
  | "laptop"
  | "other";

export type EquipmentStatus = "deployed" | "storage" | "repair" | "lost" | "retired";

export type EquipmentGeo = { lat: number; lon: number };

/** The on-PDS record shape (what we read back / write). */
export type EquipmentRecord = {
  $type: typeof EQUIPMENT_COLLECTION;
  /** Serial number / asset tag / IMEI — the unit's stable identifier. */
  assetId: string;
  /** Friendly label, e.g. "AudioMoth #14 (canopy)". */
  name: string;
  category: EquipmentCategory;
  status: EquipmentStatus;
  /** Person/team currently holding the unit (freeform). */
  currentOwner?: string;
  /** Optional atproto DID of the current holder. */
  ownerDid?: string;
  /** Deployment site / location name (freeform). */
  projectSite?: string;
  /** Optional precise coordinates. */
  geo?: EquipmentGeo;
  /** Free notes (firmware, condition, last serviced …). */
  notes?: string;
  /** When the unit was acquired (YYYY-MM-DD). */
  acquiredAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** A record plus its repo coordinates, for editing/deleting. */
export type EquipmentItem = EquipmentRecord & {
  /** at:// URI of the record. */
  uri: string;
  /** Record key (last path segment of the URI). */
  rkey: string;
  /** CID of the version we read (used as swapRecord on update). */
  cid: string;
  /** DID of the repo the record lives in. */
  did: string;
};

// ── Display metadata ────────────────────────────────────────────────────────
// Labels are translated (common.equipment.categories / .statuses); this only
// carries language-neutral presentation hints.

export const CATEGORY_ICONS: Record<EquipmentCategory, string> = {
  audiomoth: "🦗",
  phone: "📱",
  raspberrypi: "🍓",
  camera: "📷",
  sensor: "🛰️",
  gps: "📍",
  drone: "🚁",
  starlink: "🛰️",
  laptop: "💻",
  other: "📦",
};

export type EquipmentStatusTone = "ok" | "warn" | "down" | "neutral";

export const STATUS_TONES: Record<EquipmentStatus, EquipmentStatusTone> = {
  deployed: "ok",
  storage: "neutral",
  repair: "warn",
  lost: "down",
  retired: "neutral",
};

export const EQUIPMENT_CATEGORIES = Object.keys(CATEGORY_ICONS) as EquipmentCategory[];
export const EQUIPMENT_STATUSES = Object.keys(STATUS_TONES) as EquipmentStatus[];

export function categoryIcon(category: string): string {
  return (CATEGORY_ICONS as Record<string, string>)[category] ?? "📦";
}

// ── Parse / build ───────────────────────────────────────────────────────────

function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

function asCategory(v: unknown): EquipmentCategory {
  return EQUIPMENT_CATEGORIES.includes(v as EquipmentCategory) ? (v as EquipmentCategory) : "other";
}

function asStatus(v: unknown): EquipmentStatus {
  return EQUIPMENT_STATUSES.includes(v as EquipmentStatus) ? (v as EquipmentStatus) : "storage";
}

function asGeo(v: unknown): EquipmentGeo | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const lat = Number((v as Record<string, unknown>).lat);
  const lon = Number((v as Record<string, unknown>).lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  return { lat, lon };
}

/** Coerce an arbitrary PDS record value into a typed EquipmentRecord. */
export function parseEquipmentRecord(value: unknown): EquipmentRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const assetId = asStr(v.assetId) ?? "";
  const name = asStr(v.name) ?? assetId;
  if (!assetId && !name) return null;
  const now = new Date().toISOString();
  return {
    $type: EQUIPMENT_COLLECTION,
    assetId,
    name,
    category: asCategory(v.category),
    status: asStatus(v.status),
    currentOwner: asStr(v.currentOwner),
    ownerDid: asStr(v.ownerDid),
    projectSite: asStr(v.projectSite),
    geo: asGeo(v.geo),
    notes: asStr(v.notes),
    acquiredAt: asStr(v.acquiredAt),
    createdAt: asStr(v.createdAt) ?? now,
    updatedAt: asStr(v.updatedAt) ?? asStr(v.createdAt) ?? now,
  };
}

export type EquipmentDraft = {
  assetId: string;
  name: string;
  category: EquipmentCategory;
  status: EquipmentStatus;
  currentOwner?: string;
  projectSite?: string;
  geo?: EquipmentGeo | null;
  notes?: string;
  acquiredAt?: string;
};

/** Build a clean record from a draft, dropping empty optional fields. */
export function buildEquipmentRecord(
  draft: EquipmentDraft,
  opts: { createdAt?: string } = {},
): EquipmentRecord {
  const now = new Date().toISOString();
  const rec: EquipmentRecord = {
    $type: EQUIPMENT_COLLECTION,
    assetId: draft.assetId.trim(),
    name: draft.name.trim() || draft.assetId.trim(),
    category: draft.category,
    status: draft.status,
    createdAt: opts.createdAt ?? now,
    updatedAt: now,
  };
  const owner = draft.currentOwner?.trim();
  if (owner) rec.currentOwner = owner;
  const site = draft.projectSite?.trim();
  if (site) rec.projectSite = site;
  const notes = draft.notes?.trim();
  if (notes) rec.notes = notes;
  const acquiredAt = draft.acquiredAt?.trim();
  if (acquiredAt) rec.acquiredAt = acquiredAt;
  if (draft.geo && Number.isFinite(draft.geo.lat) && Number.isFinite(draft.geo.lon)) {
    // AT Protocol records are encoded with the IPLD data model, which has
    // integers but no floating-point number type. Store coordinates as strings;
    // `parseEquipmentRecord` coerces them back to numbers for the UI.
    rec.geo = { lat: String(draft.geo.lat), lon: String(draft.geo.lon) } as unknown as EquipmentGeo;
  }
  return rec;
}

// ── Read (public, works in the browser and on the server) ──────────────────

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

/** Local path of an equipment unit's own page. */
export function equipmentDetailPath(did: string, rkey: string): string {
  return `/equipment/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
}

/** Read one equipment record straight from its owner's PDS (public). */
export async function getEquipment(
  did: string,
  rkey: string,
  signal?: AbortSignal,
): Promise<EquipmentItem | null> {
  const host = await resolvePdsHost(did, signal);
  if (!host) return null;
  const params = new URLSearchParams({
    repo: did,
    collection: EQUIPMENT_COLLECTION,
    rkey,
  });
  const res = await fetch(
    `https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`,
    { signal, cache: "no-store" },
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as
    | { uri?: unknown; cid?: unknown; value?: unknown }
    | null;
  if (!data || typeof data.uri !== "string" || typeof data.cid !== "string") return null;
  const parsed = parseEquipmentRecord(data.value);
  if (!parsed) return null;
  return { ...parsed, uri: data.uri, cid: data.cid, rkey: rkeyFromUri(data.uri), did };
}

/** List every equipment record in a repo, paging the PDS until exhausted. */
export async function listEquipment(
  did: string,
  signal?: AbortSignal,
): Promise<EquipmentItem[]> {
  const host = await resolvePdsHost(did, signal);
  if (!host) throw new Error(`Could not resolve the data host for ${did}.`);

  const items: EquipmentItem[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      repo: did,
      collection: EQUIPMENT_COLLECTION,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(
      `https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
      { signal, cache: "no-store" },
    );
    if (!res.ok) {
      // An empty/never-written collection returns 200 with []; a real error
      // (e.g. repo unreachable) we surface.
      if (res.status === 400 && items.length === 0) return [];
      throw new Error(`Could not load equipment (${res.status}).`);
    }
    const data = (await res.json()) as {
      records?: Array<{ uri?: unknown; cid?: unknown; value?: unknown }>;
      cursor?: unknown;
    };
    for (const r of data.records ?? []) {
      if (typeof r.uri !== "string" || typeof r.cid !== "string") continue;
      const parsed = parseEquipmentRecord(r.value);
      if (!parsed) continue;
      items.push({ ...parsed, uri: r.uri, cid: r.cid, rkey: rkeyFromUri(r.uri), did });
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
  } while (cursor);

  // Newest first.
  items.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return items;
}

/**
 * List equipment across several repos (an organization's team) in parallel
 * with bounded concurrency. Per-repo failures are skipped so one unreachable
 * member never blanks the whole table. `onProgress` streams the merged,
 * newest-first list as each repo resolves so the table fills in waves.
 */
export async function listEquipmentAcross(
  dids: string[],
  opts: { signal?: AbortSignal; onProgress?: (items: EquipmentItem[]) => void } = {},
): Promise<EquipmentItem[]> {
  const { signal, onProgress } = opts;
  const unique = [...new Set(dids)];

  const byDid = new Map<string, EquipmentItem[]>();
  const emit = () => {
    const merged = [...byDid.values()].flat();
    merged.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    onProgress?.(merged);
    return merged;
  };

  let cursor = 0;
  const CONCURRENCY = 6;
  async function worker() {
    while (cursor < unique.length) {
      const did = unique[cursor++]!;
      try {
        byDid.set(did, await listEquipment(did, signal));
        emit();
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        byDid.set(did, []); // unreachable repo / empty collection → skip
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  return emit();
}

// ── Write (through the session-gated manage proxy, own repo only) ──────────

type MutationResult = { uri: string; cid: string };

async function postMutation<T>(body: Record<string, unknown>, fallbackMessage: string): Promise<T> {
  const res = await fetch("/api/manage/proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as
    | (T & { error?: string; message?: string })
    | null;
  if (!res.ok || !json || json.error) {
    throw new Error(json?.message ?? json?.error ?? fallbackMessage);
  }
  return json;
}

export async function createEquipment(draft: EquipmentDraft): Promise<MutationResult> {
  return postMutation<MutationResult>({
    operation: "createRecord",
    collection: EQUIPMENT_COLLECTION,
    record: buildEquipmentRecord(draft),
  }, "Could not save equipment.");
}

export async function updateEquipment(
  item: EquipmentItem,
  draft: EquipmentDraft,
): Promise<MutationResult> {
  return postMutation<MutationResult>({
    operation: "putRecord",
    collection: EQUIPMENT_COLLECTION,
    rkey: item.rkey,
    swapRecord: item.cid,
    record: buildEquipmentRecord(draft, { createdAt: item.createdAt }),
  }, "Could not save equipment.");
}

export async function deleteEquipment(item: EquipmentItem): Promise<void> {
  await postMutation<{ success?: boolean }>({
    operation: "deleteRecord",
    collection: EQUIPMENT_COLLECTION,
    rkey: item.rkey,
  }, "Could not delete equipment.");
}
