/**
 * AudioMoth recorder deployments — `app.gainforest.ac.deployment` records.
 *
 * An ac.deployment describes one recorder placed at one location with one
 * configuration: device model, gain, schedule, sample rate, firmware. It sits
 * between the equipment inventory and the recordings:
 *
 *   app.gainforest.equipment   ◄─ equipmentRef ─┐
 *   app.gainforest.dwc.event   ◄─ eventRef ─────┤ ac.deployment
 *   app.gainforest.ac.audio    ── deploymentRef ┘ (one per WAV)
 *
 * Reads are public straight from the owner's PDS; writes go through the
 * session-gated `/api/manage/proxy` mutation route like the other AudioMoth
 * collections.
 */

import { resolvePdsHost } from "./pds";
import { CONFIGURATIONS, type AudioMothConfig } from "./audiomoth/config";

export const AC_DEPLOYMENT_COLLECTION = "app.gainforest.ac.deployment";

/** The subset of the ac.deployment record this app works with. */
export type AcDeploymentRecord = {
  $type: typeof AC_DEPLOYMENT_COLLECTION;
  name: string;
  deviceModel: string;
  deviceSerialNumber?: string;
  firmwareVersion?: string;
  gain?: string;
  recordingSchedule?: string;
  sampleRateHz?: number;
  deployedAt: string;
  retrievedAt?: string;
  decimalLatitude?: string;
  decimalLongitude?: string;
  siteRef?: string;
  equipmentRef?: string;
  eventRef?: string;
  remarks?: string;
  createdAt: string;
};

export type AcDeploymentItem = AcDeploymentRecord & {
  uri: string;
  rkey: string;
  cid: string;
  did: string;
};

function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

export function parseAcDeploymentRecord(value: unknown): AcDeploymentRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const name = asStr(v.name);
  const deviceModel = asStr(v.deviceModel);
  const deployedAt = asStr(v.deployedAt);
  if (!name || !deviceModel || !deployedAt) return null;
  return {
    $type: AC_DEPLOYMENT_COLLECTION,
    name,
    deviceModel,
    deviceSerialNumber: asStr(v.deviceSerialNumber),
    firmwareVersion: asStr(v.firmwareVersion),
    gain: asStr(v.gain),
    recordingSchedule: asStr(v.recordingSchedule),
    sampleRateHz: typeof v.sampleRateHz === "number" && Number.isFinite(v.sampleRateHz) ? v.sampleRateHz : undefined,
    deployedAt,
    retrievedAt: asStr(v.retrievedAt),
    decimalLatitude: asStr(v.decimalLatitude),
    decimalLongitude: asStr(v.decimalLongitude),
    siteRef: asStr(v.siteRef),
    equipmentRef: asStr(v.equipmentRef),
    eventRef: asStr(v.eventRef),
    remarks: asStr(v.remarks),
    createdAt: asStr(v.createdAt) ?? new Date().toISOString(),
  };
}

function rkeyFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

/** List every ac.deployment record in a repo, paging until exhausted. */
export async function listAcDeployments(did: string, signal?: AbortSignal): Promise<AcDeploymentItem[]> {
  const host = await resolvePdsHost(did, signal);
  if (!host) throw new Error(`Could not resolve the data host for ${did}.`);

  const items: AcDeploymentItem[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ repo: did, collection: AC_DEPLOYMENT_COLLECTION, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 400 && items.length === 0) return [];
      throw new Error(`Could not load recorder deployments (${res.status}).`);
    }
    const data = (await res.json()) as {
      records?: Array<{ uri?: unknown; cid?: unknown; value?: unknown }>;
      cursor?: unknown;
    };
    for (const r of data.records ?? []) {
      if (typeof r.uri !== "string" || typeof r.cid !== "string") continue;
      const parsed = parseAcDeploymentRecord(r.value);
      if (!parsed) continue;
      items.push({ ...parsed, uri: r.uri, cid: r.cid, rkey: rkeyFromUri(r.uri), did });
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
  } while (cursor);

  items.sort((a, b) => (b.deployedAt ?? "").localeCompare(a.deployedAt ?? ""));
  return items;
}

/* ── Config → human/structured deployment fields ─────────────────────────── */

export const AUDIOMOTH_GAIN_LABELS = ["low", "low-medium", "medium", "medium-high", "high"] as const;

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Human-readable duty cycle description, e.g. "60s on / 240s off, 00:00–24:00 UTC+0". */
export function describeRecordingSchedule(config: AudioMothConfig): string {
  const duty = config.dutyEnabled
    ? `${config.recordDuration}s on / ${config.sleepDuration}s off`
    : "continuous recording";
  const periods =
    config.timePeriods.length === 0
      ? "no scheduled periods"
      : config.timePeriods
          .map((p) => `${formatMinutes(p.startMins)}\u2013${p.endMins >= 1440 ? "24:00" : formatMinutes(p.endMins)}`)
          .join(", ");
  const offset = config.timeZoneOffsetMinutes;
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const tz = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
  return `${duty}, ${periods} ${tz}`;
}

export function configSampleRateHz(config: AudioMothConfig): number | undefined {
  const entry = CONFIGURATIONS[config.sampleRateIndex];
  return entry ? entry.trueSampleRate * 1000 : undefined;
}

export function configGainLabel(config: AudioMothConfig): string | undefined {
  return AUDIOMOTH_GAIN_LABELS[config.gain];
}

/* ── Write (through the session-gated manage proxy, own repo only) ────────── */

type MutationResult = { uri: string; cid: string };

async function postMutation<T>(body: Record<string, unknown>, fallbackMessage: string): Promise<T> {
  const res = await fetch("/api/manage/proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!res.ok || !json || json.error) {
    throw new Error(json?.message ?? json?.error ?? fallbackMessage);
  }
  return json;
}

export type AcDeploymentDraft = {
  name: string;
  deployedAt: Date;
  lat?: number;
  lon?: number;
  /** Linked chime deployment event (dwc.event). */
  eventUri?: string;
  /** Linked equipment inventory record. */
  equipment?: { name: string; assetId: string; uri: string } | null;
  /** The recording configuration last written to the unit, when known. */
  config?: AudioMothConfig | null;
  firmwareVersion?: [number, number, number] | null;
  remarks?: string;
};

export function buildAcDeploymentRecord(draft: AcDeploymentDraft): AcDeploymentRecord {
  const record: AcDeploymentRecord = {
    $type: AC_DEPLOYMENT_COLLECTION,
    name: draft.name,
    deviceModel: "AudioMoth",
    deployedAt: draft.deployedAt.toISOString(),
    createdAt: new Date().toISOString(),
  };
  if (draft.equipment) {
    record.equipmentRef = draft.equipment.uri;
    if (draft.equipment.assetId) record.deviceSerialNumber = draft.equipment.assetId;
  }
  if (typeof draft.lat === "number" && typeof draft.lon === "number") {
    record.decimalLatitude = draft.lat.toFixed(6);
    record.decimalLongitude = draft.lon.toFixed(6);
  }
  if (draft.eventUri) record.eventRef = draft.eventUri;
  if (draft.config) {
    const gain = configGainLabel(draft.config);
    if (gain) record.gain = gain;
    record.recordingSchedule = describeRecordingSchedule(draft.config);
    const rate = configSampleRateHz(draft.config);
    if (rate) record.sampleRateHz = rate;
  }
  if (draft.firmwareVersion && draft.firmwareVersion.some((n) => n > 0)) {
    record.firmwareVersion = draft.firmwareVersion.join(".");
  }
  if (draft.remarks?.trim()) record.remarks = draft.remarks.trim();
  return record;
}

export async function createAcDeployment(draft: AcDeploymentDraft): Promise<MutationResult> {
  return postMutation<MutationResult>(
    {
      operation: "createRecord",
      collection: AC_DEPLOYMENT_COLLECTION,
      record: buildAcDeploymentRecord(draft),
    },
    "Could not save the recorder deployment.",
  );
}

export async function deleteAcDeployment(item: AcDeploymentItem): Promise<void> {
  await postMutation<{ success?: boolean }>(
    {
      operation: "deleteRecord",
      collection: AC_DEPLOYMENT_COLLECTION,
      rkey: item.rkey,
    },
    "Could not delete the recorder deployment.",
  );
}
