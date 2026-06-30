"use client";

import { createRecord, deleteRecord, getRecord, putRecord } from "../../_lib/mutations";

// A dataset is a certified collection — the same primitive projects use —
// distinguished by `type: "dataset"`. Observations point UP to it via the
// occurrence's `datasetRef` (a back-pointer that scales past the collection's
// 1000-item cap), while a project nests a dataset by listing it in `items[]`.
const COLLECTION_COLLECTION = "org.hypercerts.collection";
const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
export const DATASET_COLLECTION_TYPE = "dataset";

// Collection lexicon limits (org.hypercerts.collection): title ≤80 graphemes,
// shortDescription ≤300 graphemes.
const TITLE_MAX = 80;
const SHORT_DESCRIPTION_MAX = 300;

type RepoOptions = { repo?: string } | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function itemUri(item: unknown): string | null {
  if (!isRecord(item)) return null;
  const identifier = isRecord(item.itemIdentifier) ? item.itemIdentifier : item;
  return typeof identifier.uri === "string" ? identifier.uri : null;
}

export type CreatedObservationDataset = { uri: string; rkey: string; cid: string; name: string };

/**
 * Create an `org.hypercerts.collection` record (type "dataset") to group
 * observations under. No recordCount is stored — the dataset's size is derived
 * from the observations that point at it.
 */
export async function createObservationDataset(
  input: { name: string; description?: string | null },
  options?: RepoOptions,
): Promise<CreatedObservationDataset> {
  const title = input.name.trim().slice(0, TITLE_MAX);
  if (!title) throw new Error("Name your dataset first.");
  const shortDescription = input.description?.trim().slice(0, SHORT_DESCRIPTION_MAX);
  const record: Record<string, unknown> = {
    $type: COLLECTION_COLLECTION,
    type: DATASET_COLLECTION_TYPE,
    title,
    ...(shortDescription ? { shortDescription } : {}),
    createdAt: new Date().toISOString(),
  };
  const result = await createRecord(COLLECTION_COLLECTION, record, undefined, options);
  return { uri: result.uri, rkey: result.uri.split("/").pop() ?? "", cid: result.cid, name: title };
}

export type AttachInputOccurrence = { rkey: string; datasetRef: string | null };

export type AttachObservationsResult = {
  attached: string[];
  skipped: Array<{ rkey: string; reason: "already" }>;
  errors: Array<{ rkey: string; error: string }>;
};

/**
 * Move observations into a dataset by stamping `datasetRef` (the dataset
 * collection's AT-URI) + `datasetName` onto each occurrence (a read-modify-write
 * that preserves everything else, including photo evidence). Observations that
 * already live in a dataset are left alone so membership never silently moves;
 * detach them first to re-group. Never touches `dynamicProperties`, so an
 * observation is never mislabelled as a measured tree.
 */
export async function attachObservationsToDataset(
  input: {
    datasetUri: string;
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

  return { attached, skipped, errors };
}

export type DeleteObservationDatasetResult = {
  detached: string[];
  detachErrors: Array<{ rkey: string; error: string }>;
  unnestedFrom: string[];
  unnestErrors: Array<{ rkey: string; error: string }>;
  collectionDeleted: boolean;
  collectionError: string | null;
};

/**
 * Delete a dataset collection WITHOUT deleting its observations. First ungroups
 * every observation (clears `datasetRef` + `datasetName`, preserving the rest of
 * the occurrence), then deletes the `org.hypercerts.collection` record itself.
 * The observations survive as standalone occurrences. Detach is per-occurrence
 * (getRecord→putRecord with swapRecord); failures are reported, not thrown, and
 * the collection is still removed so the grouping disappears from the UI.
 */
export async function deleteObservationDataset(
  input: { datasetUri: string; datasetRkey: string; occurrenceRkeys: string[]; parentRkeys: string[] },
  options?: RepoOptions,
): Promise<DeleteObservationDatasetResult> {
  const detached: string[] = [];
  const detachErrors: Array<{ rkey: string; error: string }> = [];

  for (const rkey of input.occurrenceRkeys) {
    try {
      const current = await getRecord(OCCURRENCE_COLLECTION, rkey, options);
      const nextRecord: Record<string, unknown> = {
        ...current.record,
        $type: typeof current.record.$type === "string" ? current.record.$type : OCCURRENCE_COLLECTION,
      };
      delete nextRecord.datasetRef;
      delete nextRecord.datasetName;
      await putRecord(OCCURRENCE_COLLECTION, rkey, nextRecord, {
        swapRecord: current.cid,
        ...(options?.repo ? { repo: options.repo } : {}),
      });
      detached.push(rkey);
    } catch (error) {
      detachErrors.push({
        rkey,
        error: error instanceof Error ? error.message : "This observation could not be ungrouped.",
      });
    }
  }

  // Unnest the dataset from any collection (project, etc.) that lists it in
  // items[], so no dangling reference is left behind.
  const unnestedFrom: string[] = [];
  const unnestErrors: Array<{ rkey: string; error: string }> = [];
  for (const rkey of input.parentRkeys) {
    try {
      const current = await getRecord(COLLECTION_COLLECTION, rkey, options);
      const items = Array.isArray(current.record.items) ? current.record.items : [];
      const nextItems = items.filter((item) => itemUri(item) !== input.datasetUri);
      if (nextItems.length === items.length) continue; // nothing to remove
      const nextRecord: Record<string, unknown> = {
        ...current.record,
        $type: typeof current.record.$type === "string" ? current.record.$type : COLLECTION_COLLECTION,
        items: nextItems,
      };
      await putRecord(COLLECTION_COLLECTION, rkey, nextRecord, {
        swapRecord: current.cid,
        ...(options?.repo ? { repo: options.repo } : {}),
      });
      unnestedFrom.push(rkey);
    } catch (error) {
      unnestErrors.push({
        rkey,
        error: error instanceof Error ? error.message : "A parent collection could not be updated.",
      });
    }
  }

  let collectionDeleted = false;
  let collectionError: string | null = null;
  try {
    await deleteRecord(COLLECTION_COLLECTION, input.datasetRkey, options);
    collectionDeleted = true;
  } catch (error) {
    collectionError = error instanceof Error ? error.message : "The dataset could not be deleted.";
  }

  return { detached, detachErrors, unnestedFrom, unnestErrors, collectionDeleted, collectionError };
}

/**
 * Nest a dataset collection inside a project collection by adding it to the
 * project's `items[]` (recursive collection nesting). Idempotent: a no-op if the
 * dataset is already listed. Best-effort — callers should not fail the whole
 * grouping if this throws.
 */
export async function nestDatasetUnderProject(
  input: { projectUri: string; datasetUri: string; datasetCid?: string | null },
  options?: RepoOptions,
): Promise<void> {
  const projectRkey = input.projectUri.split("/").pop();
  if (!projectRkey) throw new Error("Could not resolve the project to nest under.");

  const current = await getRecord(COLLECTION_COLLECTION, projectRkey, options);
  const items = Array.isArray(current.record.items) ? [...current.record.items] : [];
  if (items.some((item) => itemUri(item) === input.datasetUri)) return;

  items.push({
    itemIdentifier: {
      uri: input.datasetUri,
      ...(input.datasetCid ? { cid: input.datasetCid } : {}),
    },
  });

  const nextRecord: Record<string, unknown> = {
    ...current.record,
    $type: typeof current.record.$type === "string" ? current.record.$type : COLLECTION_COLLECTION,
    items,
  };
  await putRecord(COLLECTION_COLLECTION, projectRkey, nextRecord, {
    swapRecord: current.cid,
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}
