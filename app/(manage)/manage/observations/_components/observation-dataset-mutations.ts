"use client";

import { createRecord, getRecord, incrementDatasetRecordCount, putRecord } from "../../_lib/mutations";

const DATASET_COLLECTION = "app.gainforest.dwc.dataset";
const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";

type RepoOptions = { repo?: string } | undefined;

export type CreatedObservationDataset = { uri: string; rkey: string; name: string };

/**
 * Create an `app.gainforest.dwc.dataset` record to group observations under.
 * Starts at recordCount 0; the attach step increments it by however many
 * observations actually land in the dataset.
 */
export async function createObservationDataset(
  input: { name: string; description?: string | null },
  options?: RepoOptions,
): Promise<CreatedObservationDataset> {
  const name = input.name.trim();
  if (!name) throw new Error("Name your dataset first.");
  const description = input.description?.trim();
  const record: Record<string, unknown> = {
    $type: DATASET_COLLECTION,
    name,
    ...(description ? { description } : {}),
    recordCount: 0,
    createdAt: new Date().toISOString(),
  };
  const result = await createRecord(DATASET_COLLECTION, record, undefined, options);
  return { uri: result.uri, rkey: result.uri.split("/").pop() ?? "", name };
}

export type AttachInputOccurrence = { rkey: string; datasetRef: string | null };

export type AttachObservationsResult = {
  attached: string[];
  skipped: Array<{ rkey: string; reason: "already" }>;
  errors: Array<{ rkey: string; error: string }>;
};

/**
 * Move the given observations into a dataset by stamping `datasetRef` +
 * `datasetName` onto each occurrence record (a read-modify-write that preserves
 * everything else, including photo evidence). Observations that already live in
 * a dataset are left alone so counts never drift; detach them first to re-group.
 * Unlike the tree attach path this never touches `dynamicProperties`, so an
 * observation never gets mislabelled as a measured tree.
 */
export async function attachObservationsToDataset(
  input: {
    datasetUri: string;
    datasetRkey: string;
    datasetName: string;
    occurrences: AttachInputOccurrence[];
  },
  options?: RepoOptions,
): Promise<AttachObservationsResult> {
  const attached: string[] = [];
  const skipped: Array<{ rkey: string; reason: "already" }> = [];
  const errors: Array<{ rkey: string; error: string }> = [];

  for (const occurrence of input.occurrences) {
    if (occurrence.datasetRef) {
      skipped.push({ rkey: occurrence.rkey, reason: "already" });
      continue;
    }
    try {
      const current = await getRecord(OCCURRENCE_COLLECTION, occurrence.rkey, options);
      const nextRecord: Record<string, unknown> = {
        ...current.record,
        $type: typeof current.record.$type === "string" ? current.record.$type : OCCURRENCE_COLLECTION,
        datasetRef: input.datasetUri,
        datasetName: input.datasetName,
      };
      await putRecord(OCCURRENCE_COLLECTION, occurrence.rkey, nextRecord, {
        swapRecord: current.cid,
        ...(options?.repo ? { repo: options.repo } : {}),
      });
      attached.push(occurrence.rkey);
    } catch (error) {
      errors.push({
        rkey: occurrence.rkey,
        error: error instanceof Error ? error.message : "This observation could not be added to the dataset.",
      });
    }
  }

  // The dataset's record count is a convenience for the folder badge; a failure
  // here doesn't undo the attach, so it's best-effort.
  if (attached.length > 0) {
    try {
      await incrementDatasetRecordCount(input.datasetRkey, attached.length, options);
    } catch {
      // Ignore; the datasets route recomputes counts from occurrences anyway.
    }
  }

  return { attached, skipped, errors };
}
