/**
 * AudioMoth deployment events — `app.gainforest.dwc.event` records created
 * when a recorder is set up in the field with the acoustic chime (from this
 * app's AudioMoth page or the GainForest Android app).
 *
 * The chime deployment ID goes into `eventID` (the lexicon's identifier
 * field) so the recorder can always be found again when its SD card data is
 * uploaded. Reads are public straight from the owner's PDS; writes go
 * through the session-gated `/api/manage/proxy` mutation route, matching the
 * equipment registry.
 */

import { resolvePdsHost } from "./pds";

export const DWC_EVENT_COLLECTION = "app.gainforest.dwc.event";

/** The subset of the Darwin Core event record the deployment UI works with. */
export type DeploymentEventRecord = {
  $type: typeof DWC_EVENT_COLLECTION;
  eventID: string;
  eventDate: string;
  locality?: string;
  decimalLatitude?: string;
  decimalLongitude?: string;
  geodeticDatum?: string;
  samplingProtocol?: string;
  equipmentUsed?: string;
  eventRemarks?: string;
  createdAt: string;
};

/** A record plus its repo coordinates, for deleting/linking. */
export type DeploymentEventItem = DeploymentEventRecord & {
  uri: string;
  rkey: string;
  cid: string;
  did: string;
};

function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

/** Coerce an arbitrary PDS record value into a typed event record. */
export function parseDeploymentEventRecord(value: unknown): DeploymentEventRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const eventID = asStr(v.eventID);
  const eventDate = asStr(v.eventDate);
  if (!eventID || !eventDate) return null;
  const now = new Date().toISOString();
  return {
    $type: DWC_EVENT_COLLECTION,
    eventID,
    eventDate,
    locality: asStr(v.locality),
    decimalLatitude: asStr(v.decimalLatitude),
    decimalLongitude: asStr(v.decimalLongitude),
    geodeticDatum: asStr(v.geodeticDatum),
    samplingProtocol: asStr(v.samplingProtocol),
    equipmentUsed: asStr(v.equipmentUsed),
    eventRemarks: asStr(v.eventRemarks),
    createdAt: asStr(v.createdAt) ?? now,
  };
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

/** List every dwc.event record in a repo, paging the PDS until exhausted. */
export async function listDeploymentEvents(
  did: string,
  signal?: AbortSignal,
): Promise<DeploymentEventItem[]> {
  const host = await resolvePdsHost(did, signal);
  if (!host) throw new Error(`Could not resolve the data host for ${did}.`);

  const items: DeploymentEventItem[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      repo: did,
      collection: DWC_EVENT_COLLECTION,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(
      `https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
      { signal, cache: "no-store" },
    );
    if (!res.ok) {
      if (res.status === 400 && items.length === 0) return [];
      throw new Error(`Could not load deployments (${res.status}).`);
    }
    const data = (await res.json()) as {
      records?: Array<{ uri?: unknown; cid?: unknown; value?: unknown }>;
      cursor?: unknown;
    };
    for (const r of data.records ?? []) {
      if (typeof r.uri !== "string" || typeof r.cid !== "string") continue;
      const parsed = parseDeploymentEventRecord(r.value);
      if (!parsed) continue;
      items.push({ ...parsed, uri: r.uri, cid: r.cid, rkey: rkeyFromUri(r.uri), did });
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
  } while (cursor);

  // Newest deployment first.
  items.sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));
  return items;
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

export type DeploymentEventDraft = {
  /** 16 lowercase hex characters — the chime deployment ID. */
  deploymentIdHex: string;
  /** Friendly site name (stored in `locality`). */
  siteName?: string;
  lat: number;
  lon: number;
  /** When the chime was played. */
  deployedAt: Date;
  /** Optional linked equipment record. */
  equipment?: { name: string; assetId: string; uri: string } | null;
};

/** Build the dwc.event record for one chime deployment. */
export function buildDeploymentEventRecord(draft: DeploymentEventDraft): DeploymentEventRecord {
  const record: DeploymentEventRecord = {
    $type: DWC_EVENT_COLLECTION,
    eventID: draft.deploymentIdHex.trim().toLowerCase(),
    eventDate: draft.deployedAt.toISOString(),
    decimalLatitude: draft.lat.toFixed(6),
    decimalLongitude: draft.lon.toFixed(6),
    geodeticDatum: "EPSG:4326",
    samplingProtocol: "AudioMoth passive acoustic monitoring",
    equipmentUsed: draft.equipment
      ? [draft.equipment.name, draft.equipment.assetId && `(${draft.equipment.assetId})`]
          .filter(Boolean)
          .join(" ")
      : "AudioMoth",
    eventRemarks: [
      `Chime deployment ID ${draft.deploymentIdHex.trim().toLowerCase()}. Clock, location and ID set acoustically with the GainForest web app.`,
      draft.equipment ? `Equipment record: ${draft.equipment.uri}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    createdAt: new Date().toISOString(),
  };
  const site = draft.siteName?.trim();
  if (site) record.locality = site;
  return record;
}

/** The AT-URI of the equipment linked to a deployment, if any (stored in the
 *  event's remarks as `Equipment record: at://…`). */
export function linkedEquipmentUri(remarks: string | undefined): string | null {
  const match = (remarks ?? "").match(/Equipment record:\s*(at:\/\/\S+)/);
  return match ? match[1]! : null;
}

/** Strip any existing `Equipment record: at://…` reference from remarks. */
function stripEquipmentRemark(remarks: string | undefined): string {
  return (remarks ?? "").replace(/\s*Equipment record:\s*at:\/\/\S+/g, "").trim();
}

/** The only two fields a deployment lets you change after the chime: the site
 *  name and the linked AudioMoth. Everything else is fixed to the chime. */
export type DeploymentEventEdit = {
  siteName?: string;
  equipment?: { name: string; assetId: string; uri: string } | null;
};

function equipmentUsedLabel(equipment: DeploymentEventEdit["equipment"]): string {
  return equipment
    ? [equipment.name, equipment.assetId && `(${equipment.assetId})`].filter(Boolean).join(" ")
    : "AudioMoth";
}

/**
 * Rebuild an event record changing only the name (`locality`) and the linked
 * equipment (`equipmentUsed` + the `Equipment record:` remark). The chime
 * identity — eventID, eventDate, coordinates, protocol — is carried over
 * untouched from the stored record.
 */
export function buildUpdatedDeploymentEventRecord(
  item: DeploymentEventItem,
  edit: DeploymentEventEdit,
): DeploymentEventRecord {
  const record: DeploymentEventRecord = {
    $type: DWC_EVENT_COLLECTION,
    eventID: item.eventID,
    eventDate: item.eventDate,
    geodeticDatum: item.geodeticDatum ?? "EPSG:4326",
    samplingProtocol: item.samplingProtocol ?? "AudioMoth passive acoustic monitoring",
    equipmentUsed: equipmentUsedLabel(edit.equipment),
    createdAt: item.createdAt,
  };
  if (item.decimalLatitude) record.decimalLatitude = item.decimalLatitude;
  if (item.decimalLongitude) record.decimalLongitude = item.decimalLongitude;
  const site = edit.siteName?.trim();
  if (site) record.locality = site;
  const remarks = [
    stripEquipmentRemark(item.eventRemarks) ||
      `Chime deployment ID ${item.eventID}. Clock, location and ID set acoustically with the GainForest web app.`,
    edit.equipment ? `Equipment record: ${edit.equipment.uri}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  if (remarks) record.eventRemarks = remarks;
  return record;
}

/** Merge an edit back into a list item locally (after a successful put). */
export function applyDeploymentEdit(
  item: DeploymentEventItem,
  edit: DeploymentEventEdit,
  cid: string,
): DeploymentEventItem {
  const record = buildUpdatedDeploymentEventRecord(item, edit);
  return { ...item, ...record, uri: item.uri, rkey: item.rkey, did: item.did, cid };
}

export async function updateDeploymentEvent(
  item: DeploymentEventItem,
  edit: DeploymentEventEdit,
): Promise<MutationResult> {
  return postMutation<MutationResult>(
    {
      operation: "putRecord",
      collection: DWC_EVENT_COLLECTION,
      rkey: item.rkey,
      swapRecord: item.cid,
      record: buildUpdatedDeploymentEventRecord(item, edit),
    },
    "Could not update the deployment.",
  );
}

export async function createDeploymentEvent(draft: DeploymentEventDraft): Promise<MutationResult> {
  return postMutation<MutationResult>(
    {
      operation: "createRecord",
      collection: DWC_EVENT_COLLECTION,
      record: buildDeploymentEventRecord(draft),
    },
    "Could not save the deployment.",
  );
}

export async function deleteDeploymentEvent(item: DeploymentEventItem): Promise<void> {
  await postMutation<{ success?: boolean }>(
    {
      operation: "deleteRecord",
      collection: DWC_EVENT_COLLECTION,
      rkey: item.rkey,
    },
    "Could not delete the deployment.",
  );
}
