/**
 * Recorder uploads, grouped into one entry per folder per day of uploading.
 *
 * There is no "an upload happened" record to read: an upload writes one
 * `app.gainforest.ac.audio` per recording, and the `ac.deployment` folder they
 * land in is created once, up front. So neither record on its own answers
 * "who uploaded recordings, and when" — the folder's own timestamp is when it
 * was *made* (often days before, or long after, the recordings arrive), and a
 * single recording is far too fine-grained to be an event.
 *
 * The upload day is the unit that matches what actually happened: a person
 * emptying an SD card. This walks the recordings newest-first, buckets them by
 * (folder, UTC day of `createdAt`), and reports each bucket with its exact
 * count and the timestamp of its newest recording. Dropping a card over
 * several days yields one entry per day; adding more to a folder months later
 * yields a fresh entry rather than quietly inflating the old one.
 *
 * The result is a small, complete, in-memory list (tens of entries against
 * thousands of recordings), which is what lets the feed merge it like an
 * ordinary record stream: every entry carries a real `createdAt` and a stable
 * id, so the feed's compound cursor pages through them correctly. Deriving
 * them from a live query per page could not do that — an aggregate can't be
 * filtered by the cursor the way a record stream can.
 */

import { cachedAsync } from "./async-cache";
import { indexerQuery } from "./indexer";

const SWEEP_CACHE_KEY = "audio-recordings-sweep";
/** Matches the feed's own page cache, so a fresh upload shows up as quickly
 *  as any other new record without re-sweeping per page. */
const CACHE_TTL_MS = 60_000;
const PAGE_SIZE = 1000; // indexer max
/** Ceiling on the sweep: 20 pages ≈ 20k recordings. Past that the oldest
 *  upload days fall off the feed rather than the cost growing without bound. */
const MAX_PAGES = 20;

/** One folder's uploading on one day — a single feed-row's worth of activity. */
export interface AudioUploadDay {
  /** Stable row id: the folder (or owner, when unfoldered) plus the day. */
  id: string;
  /** Owner of the recordings. */
  did: string;
  /** The `ac.deployment` the recordings belong to, when they belong to one. */
  folderUri: string | null;
  /** UTC day the recordings were uploaded (YYYY-MM-DD). */
  day: string;
  /** Newest recording in the bucket — what the feed orders the row by. */
  createdAt: string;
  /** Exactly how many recordings were uploaded to this folder that day. */
  recordingCount: number;
  /** The folder's name ("INN2-004"), when it has one. */
  recorderName: string | null;
  /** The chime deployment event behind the folder, when it has one. */
  eventRef: string | null;
}

/** What one folder holds in total — the honest size of a recorder folder,
 *  counted from the recordings rather than read off anything written about
 *  them. Shared by every surface that has to state a folder's size. */
export interface AudioFolderTotal {
  folderUri: string;
  /** Owner of the folder — the folder record's repo when it is known. */
  did: string;
  /** Recordings in the folder right now. */
  recordingCount: number;
  /** Newest upload into the folder, ISO. */
  uploadedAt: string | null;
  /** Distinct days the recordings were *recorded* on, earliest first. */
  recordedDates: string[];
  name: string | null;
  deviceModel: string | null;
  siteRef: string | null;
  eventRef: string | null;
}

export type RawRecording = {
  did?: string | null;
  uri?: string | null;
  deploymentRef?: string | null;
  createdAt?: string | null;
  metadata?: { recordedAt?: string | null } | null;
};

export type RawFolder = {
  did?: string | null;
  uri?: string | null;
  name?: string | null;
  deviceModel?: string | null;
  siteRef?: string | null;
  eventRef?: string | null;
};

const RECORDINGS_QUERY = `
  query AudioUploadDayRecordings($after: String) {
    appGainforestAcAudio(
      first: ${PAGE_SIZE}
      after: $after
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { did uri deploymentRef createdAt metadata { recordedAt } } }
    }
  }
`;

const FOLDERS_QUERY = `
  query AudioUploadDayFolders {
    appGainforestAcDeployment(first: ${PAGE_SIZE}, sortBy: createdAt, sortDirection: DESC) {
      edges { node { did uri name deviceModel siteRef eventRef } }
    }
  }
`;

/** The UTC calendar day an ISO timestamp falls on, or null if unparseable. */
function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct?.[1]) return direct[1];
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

async function listFolders(signal?: AbortSignal): Promise<Map<string, RawFolder>> {
  const data = await indexerQuery<{
    appGainforestAcDeployment?: { edges?: Array<{ node?: RawFolder | null } | null> | null } | null;
  }>(FOLDERS_QUERY, {}, signal).catch(() => null);
  const byUri = new Map<string, RawFolder>();
  for (const edge of data?.appGainforestAcDeployment?.edges ?? []) {
    const folder = edge?.node;
    if (folder?.uri) byUri.set(folder.uri, folder);
  }
  return byUri;
}

type PageInfo = { hasNextPage?: boolean | null; endCursor?: string | null } | null | undefined;

type RecordingPage = {
  appGainforestAcAudio?: {
    pageInfo?: PageInfo;
    edges?: Array<{ node?: RawRecording | null } | null> | null;
  } | null;
};

async function sweepRecordings(signal?: AbortSignal): Promise<RawRecording[]> {
  const all: RawRecording[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: RecordingPage | null = await indexerQuery<RecordingPage>(
      RECORDINGS_QUERY,
      { after },
      signal,
    ).catch(() => null);
    if (!data) break;

    for (const edge of data.appGainforestAcAudio?.edges ?? []) {
      const node = edge?.node;
      if (node?.did && node.createdAt) all.push(node);
    }

    const pageInfo: PageInfo = data.appGainforestAcAudio?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return all;
}

/**
 * Bucket recordings into one entry per folder per day of uploading, newest
 * first. Pure: the caller supplies the recordings and the folders they name.
 *
 * A folder with no recordings produces nothing — creating one isn't an upload
 * — and a folder uploaded to on several days produces one entry per day, each
 * counting only that day's recordings.
 */
export function groupRecordingsByUploadDay(
  recordings: readonly RawRecording[],
  folders: ReadonlyMap<string, RawFolder>,
): AudioUploadDay[] {
  type Bucket = { did: string; folderUri: string | null; day: string; count: number; newest: string };
  const buckets = new Map<string, Bucket>();

  for (const recording of recordings) {
    if (!recording.did || !recording.createdAt) continue;
    const day = dayKey(recording.createdAt);
    if (!day) continue;
    // A recording uploaded outside any folder still counts as an upload; it
    // buckets per owner instead, and the row names no recorder.
    const folderUri = recording.deploymentRef?.startsWith("at://") ? recording.deploymentRef : null;
    const did = (folderUri ? folders.get(folderUri)?.did : null) ?? recording.did;
    const key = `${folderUri ?? `did:${did}`}|${day}`;
    const current = buckets.get(key);
    if (current) {
      current.count += 1;
      // The sweep is newest-first, so the first hit is already the newest;
      // compare anyway so the bucket is order-independent.
      if (recording.createdAt > current.newest) current.newest = recording.createdAt;
    } else {
      buckets.set(key, { did, folderUri, day, count: 1, newest: recording.createdAt });
    }
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const folder = bucket.folderUri ? folders.get(bucket.folderUri) : undefined;
      return {
        id: key,
        did: bucket.did,
        folderUri: bucket.folderUri,
        day: bucket.day,
        createdAt: bucket.newest,
        recordingCount: bucket.count,
        recorderName: folder?.name?.trim() || folder?.deviceModel?.trim() || null,
        eventRef: folder?.eventRef?.startsWith("at://") ? folder.eventRef : null,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/**
 * Total up each folder from the same recordings. Pure.
 *
 * This is the one place a folder's size is decided. Anything written *about* a
 * folder — an attachment note, say — is a snapshot of the moment it was
 * written and goes stale the next time somebody uploads; the recordings
 * themselves cannot.
 */
export function collectFolderTotals(
  recordings: readonly RawRecording[],
  folders: ReadonlyMap<string, RawFolder>,
): Map<string, AudioFolderTotal> {
  type Bucket = { count: number; uploadedAt: string | null; recorded: Set<string> };
  const buckets = new Map<string, Bucket>();

  for (const recording of recordings) {
    const ref = recording.deploymentRef?.startsWith("at://") ? recording.deploymentRef : null;
    if (!ref || !recording.createdAt) continue;
    const bucket = buckets.get(ref) ?? { count: 0, uploadedAt: null, recorded: new Set<string>() };
    bucket.count += 1;
    if (!bucket.uploadedAt || recording.createdAt > bucket.uploadedAt) {
      bucket.uploadedAt = recording.createdAt;
    }
    const recorded = dayKey(recording.metadata?.recordedAt);
    if (recorded) bucket.recorded.add(recorded);
    buckets.set(ref, bucket);
  }

  const totals = new Map<string, AudioFolderTotal>();
  for (const [ref, bucket] of buckets) {
    const folder = folders.get(ref);
    totals.set(ref, {
      folderUri: ref,
      did: folder?.did ?? parseRepo(ref) ?? "",
      recordingCount: bucket.count,
      uploadedAt: bucket.uploadedAt,
      recordedDates: [...bucket.recorded].sort(),
      name: folder?.name?.trim() || null,
      deviceModel: folder?.deviceModel?.trim() || null,
      siteRef: folder?.siteRef ?? null,
      eventRef: folder?.eventRef?.startsWith("at://") ? folder.eventRef : null,
    });
  }
  return totals;
}

/** Repo DID of an `at://` URI. */
function parseRepo(uri: string): string | null {
  return uri.match(/^at:\/\/([^/]+)\//)?.[1] ?? null;
}

type AudioSweep = { recordings: RawRecording[]; folders: Map<string, RawFolder> };

/**
 * One walk of every recording plus every folder record, cached.
 *
 * Both views below are derived from this, so the feed's upload rows and the
 * Audio page's folder sizes cost a single sweep between them rather than one
 * each — and can never disagree about how many recordings a folder holds.
 */
async function sweepAudio(signal?: AbortSignal): Promise<AudioSweep> {
  return cachedAsync(
    SWEEP_CACHE_KEY,
    CACHE_TTL_MS,
    async () => {
      const [recordings, folders] = await Promise.all([sweepRecordings(), listFolders()]);
      return { recordings, folders };
    },
    signal,
  );
}

/** Every folder-day of uploading on the network, newest first. */
export async function listAudioUploadDays(signal?: AbortSignal): Promise<AudioUploadDay[]> {
  const { recordings, folders } = await sweepAudio(signal);
  if (recordings.length === 0) return [];
  return groupRecordingsByUploadDay(recordings, folders);
}

/** How many recordings each folder holds right now, keyed by folder AT-URI. */
export async function listAudioFolderTotals(
  signal?: AbortSignal,
): Promise<Map<string, AudioFolderTotal>> {
  const { recordings, folders } = await sweepAudio(signal);
  return collectFolderTotals(recordings, folders);
}
