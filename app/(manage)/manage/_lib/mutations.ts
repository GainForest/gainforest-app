"use client";

/**
 * Client-side helper for publish mutations routed through
 * /api/manage/proxy → auth.gainforest.app/api/atproto/mutation for personal
 * repo writes, or /api/cgs/mutation → auth.gainforest.app/api/cgs/mutation for
 * organization-owned writes.
 */

import { formatCgsErrorMessage } from "@/app/_lib/cgs-errors";
import type {
  AppendExistingDatasetResponse,
  AppendExistingDatasetRowInput,
} from "./upload/append-existing-dataset";

export type FloraMeasurementFields = {
  dbh?: string;
  totalHeight?: string;
  basalDiameter?: string;
  canopyCoverPercent?: string;
};

type UpdateOccurrenceData = {
  scientificName?: string;
  vernacularName?: string;
  eventDate?: string;
  recordedBy?: string;
  decimalLatitude?: string;
  decimalLongitude?: string;
  locality?: string;
  country?: string;
  habitat?: string;
  establishmentMeans?: string;
  occurrenceRemarks?: string;
};

type UpdateMeasurementData = {
  result?: Record<string, unknown>;
};

type UpdateMultimediaData = {
  caption?: string;
};

export type AttachExistingOccurrencesResult = {
  datasetUri: string;
  datasetRkey: string;
  attachedCount: number;
  skippedCount: number;
  errorCount: number;
  datasetCountUpdated: boolean;
  datasetCountError: string | null;
  results: Array<
    | { rkey: string; state: "success"; occurrenceUri: string }
    | { rkey: string; state: "skipped"; reason: string }
    | { rkey: string; state: "error"; error: string }
  >;
};

type GroupScoped = { repo?: string };

export type DeleteTreeGroupCascadeResult = {
  treeGroupRkey: string;
  treeGroupUri: string;
  foundTreeCount: number;
  deletedTreeRkeys: string[];
  deletedTreeUris: string[];
  deletedMeasurementRkeys: string[];
  deletedMultimediaRkeys: string[];
  failedTreeCount: number;
  cleanupErrorCount: number;
  treeGroupDeleted: boolean;
  treeGroupDeleteError: string | null;
  errors: string[];
};

type MutationPayload =
  | ({ operation: "createRecord"; collection: string; rkey?: string; record: Record<string, unknown> } & GroupScoped)
  | ({ operation: "putRecord"; collection: string; rkey: string; record: Record<string, unknown>; swapRecord?: string } & GroupScoped)
  | ({ operation: "deleteRecord"; collection: string; rkey: string } & GroupScoped)
  | ({ operation: "uploadBlob"; blobData: string; blobMimeType: string } & GroupScoped)
  | { operation: "createMultimediaFromFile"; blobData: string; blobMimeType: string; occurrenceRef: string; siteRef?: string; subjectPart: string; caption?: string }
  | { operation: "getDatasetRecord"; rkey: string }
  | { operation: "getCertifiedLocationRecord"; rkey: string }
  | { operation: "incrementDatasetRecordCount"; rkey: string; increment: number }
  | { operation: "createMeasurement"; occurrenceRef: string; flora: FloraMeasurementFields }
  | { operation: "updateMeasurement"; rkey: string; data: UpdateMeasurementData; unset?: string[]; resultUnset?: string[] }
  | { operation: "updateOccurrence"; rkey: string; data: UpdateOccurrenceData; unset?: string[] }
  | { operation: "updateMultimedia"; rkey: string; data: UpdateMultimediaData; unset?: string[] }
  | { operation: "deleteOccurrenceCascade"; rkey: string }
  | { operation: "deleteTreeGroupCascade"; datasetRkey: string }
  | { operation: "detachOccurrenceFromDataset"; rkey: string }
  | { operation: "attachExistingOccurrences"; datasetRkey: string; occurrenceRkeys: string[] }
  | {
      operation: "appendExistingDataset";
      datasetRkey: string;
      rows: AppendExistingDatasetRowInput[];
      establishmentMeans?: string | null;
    }
  | {
      operation: "createMultimediaFromUrl";
      url: string;
      occurrenceRef: string;
      siteRef?: string;
      subjectPart: string;
      caption?: string;
    };

type CreateResult = { uri: string; cid: string };
type RecordMutationResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };
type UploadBlobResult = { ref: unknown; mimeType: string; size: number; blob?: unknown };
type MultimediaResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };
type DatasetRecordResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };
type CertifiedLocationRecordResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };
type CascadeDeleteResult = {
  deletedOccurrenceRkey: string;
  deletedMeasurementRkeys: string[];
  deletedMultimediaRkeys: string[];
  treeGroupCountUpdated?: boolean;
  treeGroupCountError?: string | null;
  cleanupError?: string | null;
};

type CreateMultimediaInput = {
  occurrenceRef: string;
  siteRef?: string;
  subjectPart: string;
  caption?: string;
  format?: string;
};

type CreateMultimediaFromFileInput = CreateMultimediaInput & {
  imageFile: File;
};

type CreateMultimediaFromUrlInput = CreateMultimediaInput & {
  url: string;
};

const MULTIMEDIA_COLLECTION = "app.gainforest.ac.multimedia";
const MUTATION_TIMEOUT_MS = 45_000;

async function callProxy<T>(payload: MutationPayload): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), MUTATION_TIMEOUT_MS);
  const isGroupScoped = "repo" in payload && typeof payload.repo === "string" && payload.repo.length > 0;

  try {
    const res = await fetch(isGroupScoped ? "/api/cgs/mutation" : "/api/manage/proxy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = (await res.json()) as T & { error?: string; message?: string };
    if (!res.ok || data.error) {
      const fallback = isGroupScoped ? "Organization request failed." : `Saving failed (${res.status})`;
      throw new Error(isGroupScoped ? formatCgsErrorMessage(data.message ?? data.error, fallback) : data.error ?? fallback);
    }
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Saving timed out. Please try again.");
    }
    if (isGroupScoped) {
      throw new Error(formatCgsErrorMessage(error, "Organization request failed."));
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function createRecord(
  collection: string,
  record: Record<string, unknown>,
  rkey?: string,
  options?: { repo?: string },
): Promise<CreateResult> {
  return callProxy({
    operation: "createRecord",
    collection,
    record,
    ...(rkey ? { rkey } : {}),
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}

export async function putRecord(
  collection: string,
  rkey: string,
  record: Record<string, unknown>,
  options?: { swapRecord?: string; repo?: string },
): Promise<CreateResult> {
  return callProxy({
    operation: "putRecord",
    collection,
    rkey,
    record,
    ...(options?.swapRecord ? { swapRecord: options.swapRecord } : {}),
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}

export async function deleteRecord(collection: string, rkey: string, options?: { repo?: string }): Promise<void> {
  await callProxy({ operation: "deleteRecord", collection, rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function getDatasetRecord(rkey: string): Promise<DatasetRecordResult> {
  return callProxy({ operation: "getDatasetRecord", rkey });
}

export async function getCertifiedLocationRecord(rkey: string): Promise<CertifiedLocationRecordResult> {
  return callProxy({ operation: "getCertifiedLocationRecord", rkey });
}

export async function incrementDatasetRecordCount(rkey: string, increment: number): Promise<DatasetRecordResult> {
  return callProxy({ operation: "incrementDatasetRecordCount", rkey, increment });
}

export async function createMeasurement(input: {
  occurrenceRef: string;
  flora: FloraMeasurementFields;
}, options?: { repo?: string }): Promise<RecordMutationResult> {
  if (options?.repo) {
    const basalDiameter = input.flora.basalDiameter;
    return createRecord("app.gainforest.dwc.measurement", {
      $type: "app.gainforest.dwc.measurement",
      occurrenceRef: input.occurrenceRef,
      result: {
        $type: "app.gainforest.dwc.measurement#floraMeasurement",
        dbh: input.flora.dbh,
        totalHeight: input.flora.totalHeight,
        basalDiameter,
        canopyCoverPercent: input.flora.canopyCoverPercent,
      },
      createdAt: new Date().toISOString(),
    }, undefined, options) as Promise<RecordMutationResult>;
  }
  return callProxy({ operation: "createMeasurement", ...input });
}

export async function updateMeasurement(input: {
  rkey: string;
  data: UpdateMeasurementData;
  unset?: string[];
  resultUnset?: string[];
}): Promise<RecordMutationResult> {
  return callProxy({ operation: "updateMeasurement", ...input });
}

export async function deleteMeasurement(rkey: string): Promise<void> {
  await deleteRecord("app.gainforest.dwc.measurement", rkey);
}

export async function updateOccurrence(input: {
  rkey: string;
  data: UpdateOccurrenceData;
  unset?: string[];
}): Promise<RecordMutationResult> {
  return callProxy({ operation: "updateOccurrence", ...input });
}

export async function appendExistingDataset(input: {
  datasetRkey: string;
  rows: AppendExistingDatasetRowInput[];
  establishmentMeans?: string | null;
}): Promise<AppendExistingDatasetResponse> {
  return callProxy({ operation: "appendExistingDataset", ...input });
}

export async function detachOccurrenceFromDataset(rkey: string): Promise<RecordMutationResult> {
  return callProxy({ operation: "detachOccurrenceFromDataset", rkey });
}

export async function attachExistingOccurrences(input: {
  datasetRkey: string;
  occurrenceRkeys: string[];
}): Promise<AttachExistingOccurrencesResult> {
  return callProxy({ operation: "attachExistingOccurrences", ...input });
}

export async function updateMultimedia(input: {
  rkey: string;
  data: UpdateMultimediaData;
  unset?: string[];
}): Promise<RecordMutationResult> {
  return callProxy({ operation: "updateMultimedia", ...input });
}

export async function deleteMultimedia(rkey: string): Promise<void> {
  await deleteRecord(MULTIMEDIA_COLLECTION, rkey);
}

export async function deleteOccurrenceCascade(rkey: string): Promise<CascadeDeleteResult> {
  return callProxy({ operation: "deleteOccurrenceCascade", rkey });
}

export async function deleteTreeGroupCascade(datasetRkey: string): Promise<DeleteTreeGroupCascadeResult> {
  return callProxy({ operation: "deleteTreeGroupCascade", datasetRkey });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function uploadBlob(file: File, options?: { repo?: string }): Promise<UploadBlobResult> {
  const buf = await file.arrayBuffer();
  const b64 = bytesToBase64(new Uint8Array(buf));
  return callProxy({
    operation: "uploadBlob",
    blobData: b64,
    blobMimeType: file.type,
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}

export async function createMultimediaFromFile(input: CreateMultimediaFromFileInput): Promise<MultimediaResult> {
  const buf = await input.imageFile.arrayBuffer();
  const b64 = bytesToBase64(new Uint8Array(buf));
  return callProxy({
    operation: "createMultimediaFromFile",
    blobData: b64,
    blobMimeType: input.imageFile.type,
    occurrenceRef: input.occurrenceRef,
    ...(input.siteRef ? { siteRef: input.siteRef } : {}),
    subjectPart: input.subjectPart,
    ...(input.caption ? { caption: input.caption } : {}),
  });
}

export async function createMultimediaFromUrl(input: CreateMultimediaFromUrlInput): Promise<MultimediaResult> {
  return callProxy({
    operation: "createMultimediaFromUrl",
    url: input.url,
    occurrenceRef: input.occurrenceRef,
    ...(input.siteRef ? { siteRef: input.siteRef } : {}),
    subjectPart: input.subjectPart,
    ...(input.caption ? { caption: input.caption } : {}),
  });
}
