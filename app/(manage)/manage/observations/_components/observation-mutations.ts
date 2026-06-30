"use client";

import { createMultimediaFromFile, createRecord, putRecord, uploadBlob } from "../../_lib/mutations";
import { resolveStrongRef } from "@/app/_lib/pds";

type MutationResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };

/** Blob reference as stored on a record's media field. */
export type ObservationBlobRef = { $type: "blob"; ref: unknown; mimeType: string; size: number };

type ObservationPhotoResult = MutationResult & { blobRef: ObservationBlobRef | null };

const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";
const ATTACHMENT_COLLECTION = "org.hypercerts.context.attachment";
// Tags the attachment so the dataset is recognisable as a bulk observations
// upload rather than a generic document.
const OBSERVATION_DATASET_CONTENT_TYPE = "observation-dataset";
// Occurrence photos surface in the explorer/indexer through the occurrence's own
// `imageEvidence` field (an app.gainforest.common.defs#image wrapper), not the
// separate ac.multimedia records — so the primary photo must be copied there.
const IMAGE_DEF_TYPE = "app.gainforest.common.defs#image";

let activeGroupRepo: string | null = null;

export function configureObservationMutationRepo(repo: string | null) {
  activeGroupRepo = repo;
}

function mutationOptions(): { repo?: string } | undefined {
  return activeGroupRepo ? { repo: activeGroupRepo } : undefined;
}

function rkeyFromUri(uri: string, fallback?: string): string {
  return uri.split("/").pop() ?? fallback ?? "unknown";
}

function omitEmpty<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value === undefined || value === null || value === "") delete record[key];
  }
  return record;
}

function occurrenceRecord(data: Record<string, unknown>) {
  return omitEmpty({
    ...data,
    $type: OCCURRENCE_COLLECTION,
    basisOfRecord: data.basisOfRecord ?? "HumanObservation",
    occurrenceID: data.occurrenceID ?? crypto.randomUUID(),
    occurrenceStatus: data.occurrenceStatus ?? "present",
    geodeticDatum: data.geodeticDatum ?? "EPSG:4326",
    license: data.license ?? "CC-BY-4.0",
    kingdom: data.kingdom ?? "Plantae",
    createdAt: new Date().toISOString(),
  });
}

export function formatObservationMutationError(error: unknown): string {
  return error instanceof Error ? error.message : "Could not upload this observation.";
}

export async function createObservationOccurrence(data: Record<string, unknown>): Promise<MutationResult> {
  const record = occurrenceRecord(data);
  const result = await createRecord(OCCURRENCE_COLLECTION, record, undefined, mutationOptions());
  return { ...result, rkey: rkeyFromUri(result.uri), record };
}

/**
 * Store a raw observations CSV as a single hypercert attachment record instead
 * of expanding it into thousands of occurrence records. The file is kept as an
 * uploaded blob on the attachment's `content`, so a large dataset costs one
 * record + one blob rather than flooding the repo and indexer. When a project
 * is in context we link the attachment to it via `subjects`; otherwise the
 * dataset is stored standalone.
 */
export async function createObservationCsvAttachment(input: {
  file: File;
  title: string;
  note?: string;
  subjectUri?: string | null;
}): Promise<MutationResult> {
  const options = mutationOptions();
  const uploaded = await uploadBlob(input.file, options);
  const blob = {
    $type: "blob",
    ref: uploaded.ref,
    mimeType: uploaded.mimeType || "text/csv",
    size: uploaded.size,
  };

  const subjects: { $type: "com.atproto.repo.strongRef"; uri: string; cid: string }[] = [];
  if (input.subjectUri) {
    try {
      const ref = await resolveStrongRef(input.subjectUri);
      subjects.push({ $type: "com.atproto.repo.strongRef", uri: ref.uri, cid: ref.cid });
    } catch {
      // Best-effort link only; store the dataset standalone if the project
      // can't be referenced right now.
    }
  }

  const record = omitEmpty({
    $type: ATTACHMENT_COLLECTION,
    title: input.title.slice(0, 256),
    contentType: OBSERVATION_DATASET_CONTENT_TYPE,
    content: [{ $type: "org.hypercerts.defs#smallBlob", blob }],
    ...(subjects.length > 0 ? { subjects } : {}),
    ...(input.note ? { description: { $type: "org.hypercerts.defs#descriptionString", value: input.note } } : {}),
    createdAt: new Date().toISOString(),
  });

  const result = await createRecord(ATTACHMENT_COLLECTION, record, undefined, options);
  return { ...result, rkey: rkeyFromUri(result.uri), record };
}

function extractBlobRef(record: Record<string, unknown> | undefined): ObservationBlobRef | null {
  const file = record?.file;
  if (file && typeof file === "object" && "ref" in (file as Record<string, unknown>)) {
    const candidate = file as Record<string, unknown>;
    return {
      $type: "blob",
      ref: candidate.ref,
      mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType : "application/octet-stream",
      size: typeof candidate.size === "number" ? candidate.size : 0,
    };
  }
  return null;
}

export async function createObservationPhoto(input: {
  imageFile: File;
  occurrenceRef: string;
  subjectPart: string;
  caption?: string;
  siteRef?: string;
}): Promise<ObservationPhotoResult> {
  const result = await createMultimediaFromFile(
    {
      imageFile: input.imageFile,
      occurrenceRef: input.occurrenceRef,
      subjectPart: input.subjectPart,
      caption: input.caption,
      siteRef: input.siteRef,
    },
    mutationOptions(),
  );
  return { ...result, blobRef: extractBlobRef(result.record) };
}

/**
 * Copy the first uploaded photo's blob onto the occurrence's `imageEvidence`
 * field. The explorer reads occurrence photos from `imageEvidence.file.ref`, so
 * without this the uploaded ac.multimedia records would never show up in the
 * listing (and would be filtered out entirely under the "Photos" media filter).
 */
export async function setObservationPrimaryImage(input: {
  rkey: string;
  record: Record<string, unknown>;
  swapCid: string;
  blobRef: ObservationBlobRef;
}): Promise<void> {
  const nextRecord = {
    ...input.record,
    imageEvidence: { $type: IMAGE_DEF_TYPE, file: input.blobRef },
  };
  await putRecord(OCCURRENCE_COLLECTION, input.rkey, nextRecord, {
    ...mutationOptions(),
    swapRecord: input.swapCid,
  });
}
