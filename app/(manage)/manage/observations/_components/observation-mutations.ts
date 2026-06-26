"use client";

import { createMultimediaFromFile, createRecord } from "../../_lib/mutations";

type MutationResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };

const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";

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
    basisOfRecord: data.basisOfRecord ?? "MachineObservation",
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

export async function createObservationPhoto(input: {
  imageFile: File;
  occurrenceRef: string;
  subjectPart: string;
  caption?: string;
  siteRef?: string;
}): Promise<MutationResult> {
  return createMultimediaFromFile(
    {
      imageFile: input.imageFile,
      occurrenceRef: input.occurrenceRef,
      subjectPart: input.subjectPart,
      caption: input.caption,
      siteRef: input.siteRef,
    },
    mutationOptions(),
  );
}
