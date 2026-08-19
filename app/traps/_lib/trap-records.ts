import { resolvePdsHost } from "@/app/_lib/pds";

// Lexicon collection names
export const TRAP_KILL_COLLECTION = "nz.trap.field.kill";
export const TRAP_OBSERVATION_COLLECTION = "nz.trap.field.observation";

// Known values from the lexicons
export const CONTROL_MEANS = ["Shooting", "Road Kill", "Toxin", "Predation", "Unknown", "Other"] as const;
export const SEX_VALUES = ["Male", "Female", "Unknown"] as const;
export const MATURITY_VALUES = ["Adult", "Juvenile", "Unknown"] as const;
export const VISIBILITY_VALUES = ["private", "summary", "public"] as const;
export const OBSERVATION_TYPES = ["Sighting", "Sign", "Call", "Trail camera", "Count", "Other"] as const;

export type ControlMeans = (typeof CONTROL_MEANS)[number];
export type Sex = (typeof SEX_VALUES)[number];
export type Maturity = (typeof MATURITY_VALUES)[number];
export type Visibility = (typeof VISIBILITY_VALUES)[number];
export type ObservationType = (typeof OBSERVATION_TYPES)[number];

export type GeoLocation = {
  latitude: string;
  longitude: string;
};

/** nz.trap.field.kill record shape */
export type TrapKillRecord = {
  species: string;
  count: number;
  controlMeans: ControlMeans;
  sex?: Sex;
  maturity?: Maturity;
  occurredAt: string;
  location?: GeoLocation;
  areaName?: string;
  project?: string;
  visibility?: Visibility;
  note?: string;
  photo?: { ref: { $link: string }; mimeType: string; size: number };
  createdAt: string;
};

/** nz.trap.field.observation record shape */
export type TrapObservationRecord = {
  species: string;
  observationType: ObservationType;
  count?: number;
  occurredAt: string;
  location?: GeoLocation;
  areaName?: string;
  project?: string;
  visibility?: Visibility;
  note?: string;
  photo?: { ref: { $link: string }; mimeType: string; size: number };
  createdAt: string;
};

export type TrapKill = {
  uri: string;
  rkey: string;
  did: string;
  record: TrapKillRecord;
};

export type TrapObservation = {
  uri: string;
  rkey: string;
  did: string;
  record: TrapObservationRecord;
};

type ListRecordsResponse = {
  records?: Array<{ uri?: unknown; value?: unknown }>;
  cursor?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Fetch all records of a given collection from a user's PDS.
 * Returns empty array on failure (user has no records or PDS unreachable).
 */
async function fetchCollectionRecords<T>(
  did: string,
  collection: string,
  signal?: AbortSignal
): Promise<Array<{ uri: string; rkey: string; did: string; record: T }>> {
  const host = await resolvePdsHost(did, signal).catch(() => null);
  if (!host) return [];

  const records: Array<{ uri: string; rkey: string; did: string; record: T }> = [];
  let cursor: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      repo: did,
      collection,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(
      `https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`,
      { cache: "no-store", signal }
    ).catch(() => null);

    if (!response?.ok) break;

    const payload = (await response.json().catch(() => null)) as ListRecordsResponse | null;
    for (const entry of payload?.records ?? []) {
      const uri = str(entry.uri);
      const value = entry.value;
      if (!uri || !isRecord(value)) continue;

      records.push({
        uri,
        rkey: uri.split("/").pop() ?? "",
        did,
        record: value as T,
      });
    }

    cursor = str(payload?.cursor) ?? undefined;
    if (!cursor) break;
  }

  return records;
}

/** Fetch all kill records from a user's PDS */
export async function fetchTrapKills(did: string, signal?: AbortSignal): Promise<TrapKill[]> {
  const records = await fetchCollectionRecords<TrapKillRecord>(did, TRAP_KILL_COLLECTION, signal);
  return records.sort((a, b) => b.record.occurredAt.localeCompare(a.record.occurredAt));
}

/** Fetch all observation records from a user's PDS */
export async function fetchTrapObservations(did: string, signal?: AbortSignal): Promise<TrapObservation[]> {
  const records = await fetchCollectionRecords<TrapObservationRecord>(did, TRAP_OBSERVATION_COLLECTION, signal);
  return records.sort((a, b) => b.record.occurredAt.localeCompare(a.record.occurredAt));
}

/** Fetch both kills and observations from a user's PDS */
export async function fetchAllTrapRecords(
  did: string,
  signal?: AbortSignal
): Promise<{ kills: TrapKill[]; observations: TrapObservation[] }> {
  const [kills, observations] = await Promise.all([
    fetchTrapKills(did, signal),
    fetchTrapObservations(did, signal),
  ]);
  return { kills, observations };
}

/** Combined type for display purposes */
export type TrapRecord =
  | { type: "kill"; data: TrapKill }
  | { type: "observation"; data: TrapObservation };

/** Merge kills and observations into a single sorted list */
export function mergeAndSortTrapRecords(
  kills: TrapKill[],
  observations: TrapObservation[]
): TrapRecord[] {
  const merged: TrapRecord[] = [
    ...kills.map((k) => ({ type: "kill" as const, data: k })),
    ...observations.map((o) => ({ type: "observation" as const, data: o })),
  ];
  return merged.sort((a, b) => {
    const dateA = a.type === "kill" ? a.data.record.occurredAt : a.data.record.occurredAt;
    const dateB = b.type === "kill" ? b.data.record.occurredAt : b.data.record.occurredAt;
    return dateB.localeCompare(dateA);
  });
}
