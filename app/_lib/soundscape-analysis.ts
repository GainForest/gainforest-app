/**
 * Reading and writing stored PMN analyses (`app.gainforest.ac.soundscapeAnalysis`).
 *
 * Reads are public, straight from the owner's PDS, so any device — or anyone
 * looking at a shared library — gets the clock without re-downloading and
 * re-analyzing multi-gigabyte originals. Writes go through the session-gated
 * mutation proxy, into the signed-in account's own repo.
 */

import {
  parseAnalysisRecord,
  SOUNDSCAPE_ANALYSIS_COLLECTION,
  type StoredAnalysis,
} from "@/lib/soundscape/analysis-record";
import { resolvePdsHost } from "./pds";

/** Every stored analysis in a repo, keyed by the rkey it shares with its
 *  `ac.audio` recording. Returns an empty map when the account has none. */
export async function listStoredAnalyses(
  did: string,
  signal?: AbortSignal,
): Promise<Map<string, StoredAnalysis>> {
  const host = await resolvePdsHost(did, signal);
  if (!host) return new Map();

  const analyses = new Map<string, StoredAnalysis>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      repo: did,
      collection: SOUNDSCAPE_ANALYSIS_COLLECTION,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://${host}/xrpc/com.atproto.repo.listRecords?${params.toString()}`, {
      signal,
      cache: "no-store",
    });
    // An account that has never analyzed anything has no collection at all —
    // that is an empty result, not a failure.
    if (!res.ok) return analyses;
    const data = (await res.json()) as {
      records?: Array<{ uri?: unknown; value?: unknown }>;
      cursor?: unknown;
    };
    for (const record of data.records ?? []) {
      if (typeof record.uri !== "string") continue;
      const parsed = parseAnalysisRecord(record.value);
      if (parsed) analyses.set(record.uri.split("/").pop() ?? "", parsed);
    }
    cursor = typeof data.cursor === "string" ? data.cursor : undefined;
  } while (cursor);

  return analyses;
}

/**
 * Store one recording's analysis in the signed-in account's repo, under the
 * same rkey as the recording it describes — so re-analyzing overwrites rather
 * than piling up duplicates.
 */
export async function saveStoredAnalysis(input: {
  rkey: string;
  record: Record<string, unknown>;
}): Promise<void> {
  const { putRecord } = await import("@/app/(manage)/manage/_lib/mutations");
  await putRecord(SOUNDSCAPE_ANALYSIS_COLLECTION, input.rkey, input.record);
}
