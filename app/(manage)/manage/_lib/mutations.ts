"use client";

/**
 * Client-side helper for publish mutations routed through
 * /api/manage/proxy for personal repo writes, or /api/cgs/mutation for
 * organization-owned writes. Server routes forward to the configured auth
 * service.
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
  kingdom?: string;
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

type MutationPayload = GroupScoped & (
  | { operation: "createRecord"; collection: string; rkey?: string; record: Record<string, unknown> }
  | { operation: "putRecord"; collection: string; rkey: string; record: Record<string, unknown>; swapRecord?: string }
  | { operation: "deleteRecord"; collection: string; rkey: string }
  | { operation: "uploadBlob"; blobData: string; blobMimeType: string }
  | { operation: "getRecord"; collection: string; rkey: string }
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
    }
);

type CreateResult = { uri: string; cid: string };
type RecordMutationResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };
type UploadBlobResult = { ref: unknown; mimeType: string; size: number; blob?: unknown; $type?: string };
type MultimediaResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };
type RecordReadResult = { uri: string; cid: string; rkey: string; record: Record<string, unknown> };
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
const DIRECT_CGS_OPERATIONS = new Set<MutationPayload["operation"]>(["createRecord", "putRecord", "deleteRecord", "uploadBlob"]);

async function callProxy<T>(payload: MutationPayload): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), MUTATION_TIMEOUT_MS);
  const isGroupScoped = "repo" in payload && typeof payload.repo === "string" && payload.repo.length > 0;
  const useDirectCgs = isGroupScoped && DIRECT_CGS_OPERATIONS.has(payload.operation);

  try {
    const res = await fetch(useDirectCgs ? "/api/cgs/mutation" : "/api/manage/proxy", {
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

export async function getRecord(collection: string, rkey: string, options?: { repo?: string }): Promise<RecordReadResult> {
  return callProxy({ operation: "getRecord", collection, rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function getDatasetRecord(rkey: string, options?: { repo?: string }): Promise<DatasetRecordResult> {
  return callProxy({ operation: "getDatasetRecord", rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function getCertifiedLocationRecord(rkey: string, options?: { repo?: string }): Promise<CertifiedLocationRecordResult> {
  return callProxy({ operation: "getCertifiedLocationRecord", rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function incrementDatasetRecordCount(rkey: string, increment: number, options?: { repo?: string }): Promise<DatasetRecordResult> {
  return callProxy({ operation: "incrementDatasetRecordCount", rkey, increment, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function createMeasurement(input: {
  occurrenceRef: string;
  flora: FloraMeasurementFields;
}, options?: { repo?: string }): Promise<RecordMutationResult> {
  if (options?.repo) {
    const basalDiameter = input.flora.basalDiameter;
    const record = {
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
    };
    const result = await createRecord("app.gainforest.dwc.measurement", record, undefined, options);
    return { ...result, rkey: result.uri.split("/").pop() ?? "", record };
  }
  return callProxy({ operation: "createMeasurement", ...input });
}

export async function updateMeasurement(input: {
  rkey: string;
  data: UpdateMeasurementData;
  unset?: string[];
  resultUnset?: string[];
}, options?: { repo?: string }): Promise<RecordMutationResult> {
  return callProxy({ operation: "updateMeasurement", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function deleteMeasurement(rkey: string, options?: { repo?: string }): Promise<void> {
  await deleteRecord("app.gainforest.dwc.measurement", rkey, options);
}

export async function updateOccurrence(input: {
  rkey: string;
  data: UpdateOccurrenceData;
  unset?: string[];
}, options?: { repo?: string }): Promise<RecordMutationResult> {
  return callProxy({ operation: "updateOccurrence", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function appendExistingDataset(input: {
  datasetRkey: string;
  rows: AppendExistingDatasetRowInput[];
  establishmentMeans?: string | null;
}, options?: { repo?: string }): Promise<AppendExistingDatasetResponse> {
  return callProxy({ operation: "appendExistingDataset", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function detachOccurrenceFromDataset(rkey: string, options?: { repo?: string }): Promise<RecordMutationResult> {
  return callProxy({ operation: "detachOccurrenceFromDataset", rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function attachExistingOccurrences(input: {
  datasetRkey: string;
  occurrenceRkeys: string[];
}, options?: { repo?: string }): Promise<AttachExistingOccurrencesResult> {
  return callProxy({ operation: "attachExistingOccurrences", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function updateMultimedia(input: {
  rkey: string;
  data: UpdateMultimediaData;
  unset?: string[];
}, options?: { repo?: string }): Promise<RecordMutationResult> {
  return callProxy({ operation: "updateMultimedia", ...input, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function deleteMultimedia(rkey: string, options?: { repo?: string }): Promise<void> {
  await deleteRecord(MULTIMEDIA_COLLECTION, rkey, options);
}

export async function deleteOccurrenceCascade(rkey: string, options?: { repo?: string }): Promise<CascadeDeleteResult> {
  return callProxy({ operation: "deleteOccurrenceCascade", rkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

export async function deleteTreeGroupCascade(datasetRkey: string, options?: { repo?: string }): Promise<DeleteTreeGroupCascadeResult> {
  return callProxy({ operation: "deleteTreeGroupCascade", datasetRkey, ...(options?.repo ? { repo: options.repo } : {}) });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeUploadBlobResult(value: unknown): UploadBlobResult {
  const candidate = isRecord(value) && isRecord(value.blob) ? value.blob : value;
  if (!isRecord(candidate) || !("ref" in candidate)) {
    throw new Error("We could not upload this photo. Please try again.");
  }

  return {
    $type: typeof candidate.$type === "string" ? candidate.$type : "blob",
    ref: candidate.ref,
    mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType : "application/octet-stream",
    size: typeof candidate.size === "number" ? candidate.size : 0,
  };
}

export async function uploadBlob(file: File, options?: { repo?: string }): Promise<UploadBlobResult> {
  const buf = await file.arrayBuffer();
  const b64 = bytesToBase64(new Uint8Array(buf));
  const result = await callProxy<unknown>({
    operation: "uploadBlob",
    blobData: b64,
    blobMimeType: file.type || "application/octet-stream",
    ...(options?.repo ? { repo: options.repo } : {}),
  });
  return normalizeUploadBlobResult(result);
}

export async function createMultimediaFromFile(input: CreateMultimediaFromFileInput, options?: { repo?: string }): Promise<MultimediaResult> {
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
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}

export async function createMultimediaFromUrl(input: CreateMultimediaFromUrlInput, options?: { repo?: string }): Promise<MultimediaResult> {
  return callProxy({
    operation: "createMultimediaFromUrl",
    url: input.url,
    occurrenceRef: input.occurrenceRef,
    ...(input.siteRef ? { siteRef: input.siteRef } : {}),
    subjectPart: input.subjectPart,
    ...(input.caption ? { caption: input.caption } : {}),
    ...(options?.repo ? { repo: options.repo } : {}),
  });
}
