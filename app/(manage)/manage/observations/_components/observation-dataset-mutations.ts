"use client";

import { createRecord, deleteRecord, getRecord, putRecord } from "../../_lib/mutations";

// Observation datasets are first-class Darwin Core dataset records. Observations
// point up to them via `datasetRef`; the dataset itself stores the steward-facing
// name/description and a best-effort record count.
const DATASET_COLLECTION = "app.gainforest.dwc.dataset";
const COLLECTION_COLLECTION = "org.hypercerts.collection";
const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";

// app.gainforest.dwc.dataset limits: name ≤256 graphemes, description ≤2048.
const NAME_MAX = 256;
const DESCRIPTION_MAX = 2048;

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

/** Create an `app.gainforest.dwc.dataset` record to group observations under. */
export async function createObservationDataset(
  input: { name: string; description?: string | null },
  options?: RepoOptions,
): Promise<CreatedObservationDataset> {
  const name = input.name.trim().slice(0, NAME_MAX);
  if (!name) throw new Error("Name your dataset first.");
  const description = input.description?.trim().slice(0, DESCRIPTION_MAX);
  const record: Record<string, unknown> = {
    $type: DATASET_COLLECTION,
    name,
    ...(description ? { description } : {}),
    recordCount: 0,
    createdAt: new Date().toISOString(),
  };
  const result = await createRecord(DATASET_COLLECTION, record, undefined, options);
  return { uri: result.uri, rkey: result.uri.split("/").pop() ?? "", cid: result.cid, name };
}

async function incrementObservationDatasetCount(
  datasetRkey: string,
  incrementBy: number,
  options?: RepoOptions,
): Promise<void> {
  const current = await getRecord(DATASET_COLLECTION, datasetRkey, options);
  const storedCount = typeof current.record.recordCount === "number" && Number.isFinite(current.record.recordCount)
    ? current.record.recordCount
    : 0;
  const nextRecord: Record<string, unknown> = {
    ...current.record,
    $type: typeof current.record.$type === "string" ? current.record.$type : DATASET_COLLECTION,
    recordCount: Math.max(0, storedCount + incrementBy),
  };
  await putRecord(DATASET_COLLECTION, datasetRkey, nextRecord, {
    swapRecord: current.cid,
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}

export type AttachInputOccurrence = { rkey: string; datasetRef: string | null };

export type AttachObservationsResult = {
  attached: string[];
  skipped: Array<{ rkey: string; reason: "already" }>;
  errors: Array<{ rkey: string; error: string }>;
};

/**
 * Move observations into a dataset by stamping `datasetRef` (the dataset
 * AT-URI) + `datasetName` onto each occurrence (a read-modify-write
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

  if (attached.length > 0) {
    const datasetRkey = input.datasetUri.split("/").pop();
    if (datasetRkey) {
      await incrementObservationDatasetCount(datasetRkey, attached.length, options).catch(() => {
        // Non-fatal: the folder view derives counts from occurrence refs.
      });
    }
  }

  return { attached, skipped, errors };
}

export type UnnestDatasetResult = {
  unnestedFrom: string[];
  unnestErrors: Array<{ rkey: string; error: string }>;
};

/**
 * Drop a dataset from the `items[]` of the given project collections. Used when
 * a dataset is deleted (no dangling reference) and when it is filed under a
 * different project (a dataset lives in one project, the same way each of its
 * sightings names one project in `projectRef`).
 */
export async function unnestDatasetFromProjects(
  input: { datasetUri: string; parentRkeys: string[] },
  options?: RepoOptions,
): Promise<UnnestDatasetResult> {
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
  return { unnestedFrom, unnestErrors };
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
 * Delete a dataset WITHOUT deleting its observations. First ungroups every
 * observation (clears `datasetRef` + `datasetName`, preserving the rest of
 * the occurrence), then deletes the `app.gainforest.dwc.dataset` record itself.
 * The observations survive as standalone occurrences. Detach is per-occurrence
 * (getRecord→putRecord with swapRecord); failures are reported, not thrown, and
 * the dataset record is still removed so the grouping disappears from the UI.
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

  // Unnest the dataset from any project collection that lists it in items[], so
  // no dangling reference is left behind.
  const { unnestedFrom, unnestErrors } = await unnestDatasetFromProjects(
    { datasetUri: input.datasetUri, parentRkeys: input.parentRkeys },
    options,
  );

  let collectionDeleted = false;
  let collectionError: string | null = null;
  try {
    await deleteRecord(DATASET_COLLECTION, input.datasetRkey, options);
    collectionDeleted = true;
  } catch (error) {
    collectionError = error instanceof Error ? error.message : "The dataset could not be deleted.";
  }

  return { detached, detachErrors, unnestedFrom, unnestErrors, collectionDeleted, collectionError };
}

/**
 * Reference a dataset from a project collection by adding it to the project's
 * `items[]`. Idempotent: a no-op if the dataset is already listed. Best-effort
 * — callers should not fail the whole
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
