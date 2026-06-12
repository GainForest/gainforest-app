"use client";

import { createRecord, deleteRecord, putRecord, uploadBlob } from "../../_lib/mutations";
import type { AudioDeploymentItem, AudioEventItem, AudioRecordingItem } from "@/app/_lib/indexer";
import type { AudioMetadataDraft } from "./types";

type MutationResult = { uri: string; cid: string; rkey: string; record?: Record<string, unknown> };

type UploadBlobResult = { ref: unknown; mimeType: string; size: number };

type RichText = { text: string; facets?: unknown };

let activeGroupRepo: string | null = null;

export function configureAudioMutationRepo(repo: string | null) {
  activeGroupRepo = repo;
}

function mutationOptions(): { repo?: string } | undefined {
  return activeGroupRepo ? { repo: activeGroupRepo } : undefined;
}

const EVENT_COLLECTION = "app.gainforest.dwc.event";
const DEPLOYMENT_COLLECTION = "app.gainforest.ac.deployment";
const AUDIO_COLLECTION = "app.gainforest.ac.audio";
const OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";

function rkeyFromUri(uri: string, fallback?: string): string {
  return uri.split("/").pop() ?? fallback ?? "unknown";
}

function omitUndefined<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined || record[key] === null) delete record[key];
  }
  return record;
}

function applyUnset(record: Record<string, unknown>, unset?: string[]) {
  for (const key of unset ?? []) delete record[key];
  return record;
}

function audioBlobFromUpload(uploaded: UploadBlobResult) {
  return {
    $type: "app.gainforest.common.defs#audio",
    file: {
      $type: "blob",
      ref: uploaded.ref,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
    },
  };
}

function richText(value: RichText | undefined) {
  if (!value) return undefined;
  return omitUndefined({
    $type: "app.gainforest.common.defs#richtext",
    text: value.text,
    facets: value.facets,
  });
}

function audioMetadata(metadata: AudioMetadataDraft & { recordedAt: string }) {
  return omitUndefined({
    $type: "app.gainforest.ac.audio#metadata",
    codec: metadata.codec,
    channels: metadata.channels,
    duration: metadata.duration,
    sampleRate: metadata.sampleRate,
    recordedAt: metadata.recordedAt,
    bitDepth: metadata.bitDepth,
    fileFormat: metadata.fileFormat,
    fileSizeBytes: metadata.fileSizeBytes,
    maxFrequencyHz: metadata.maxFrequencyHz,
  });
}

function eventRecord(data: Record<string, unknown>, createdAt?: string | null) {
  return omitUndefined({
    ...data,
    $type: EVENT_COLLECTION,
    geodeticDatum: data.geodeticDatum ?? "EPSG:4326",
    createdAt: createdAt ?? new Date().toISOString(),
  });
}

function deploymentRecord(data: Record<string, unknown>, createdAt?: string | null) {
  return omitUndefined({
    ...data,
    $type: DEPLOYMENT_COLLECTION,
    createdAt: createdAt ?? new Date().toISOString(),
  });
}

function occurrenceRecord(data: Record<string, unknown>) {
  return omitUndefined({
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

export function formatMutationError(error: unknown): string {
  return error instanceof Error ? error.message : "Could not save changes.";
}

export async function createAudioEvent(data: Record<string, unknown>): Promise<MutationResult> {
  const result = await createRecord(EVENT_COLLECTION, eventRecord(data), undefined, mutationOptions());
  return { ...result, rkey: rkeyFromUri(result.uri) };
}

export async function updateAudioEvent(input: {
  event: AudioEventItem;
  data: Record<string, unknown>;
  unset?: string[];
}): Promise<MutationResult> {
  const record = applyUnset(eventRecord({ ...input.event.record, ...input.data }, input.event.record.createdAt), input.unset);
  const result = await putRecord(EVENT_COLLECTION, input.event.metadata.rkey, record, mutationOptions());
  return { ...result, rkey: input.event.metadata.rkey };
}

export async function createAudioDeployment(data: Record<string, unknown>): Promise<MutationResult> {
  const result = await createRecord(DEPLOYMENT_COLLECTION, deploymentRecord(data), undefined, mutationOptions());
  return { ...result, rkey: rkeyFromUri(result.uri) };
}

export async function updateAudioDeployment(input: {
  deployment: AudioDeploymentItem;
  data: Record<string, unknown>;
  unset?: string[];
}): Promise<MutationResult> {
  const record = applyUnset(
    deploymentRecord({ ...input.deployment.record, ...input.data }, input.deployment.record.createdAt),
    input.unset,
  );
  const result = await putRecord(DEPLOYMENT_COLLECTION, input.deployment.metadata.rkey, record, mutationOptions());
  return { ...result, rkey: input.deployment.metadata.rkey };
}

export async function createAudioRecording(input: {
  audioFile: File;
  name: string;
  description?: RichText;
  metadata: AudioMetadataDraft & { recordedAt: string };
  deploymentRef?: string;
  recordedBy?: string;
  license?: string;
  tags?: string[];
  occurrenceRef?: string;
  siteRef?: string;
}): Promise<MutationResult> {
  const uploaded = await uploadBlob(input.audioFile, mutationOptions());
  const record = omitUndefined({
    $type: AUDIO_COLLECTION,
    name: input.name,
    description: richText(input.description),
    blob: audioBlobFromUpload(uploaded),
    metadata: audioMetadata(input.metadata),
    license: input.license,
    recordedBy: input.recordedBy,
    tags: input.tags,
    occurrenceRef: input.occurrenceRef,
    deploymentRef: input.deploymentRef,
    siteRef: input.siteRef,
    createdAt: new Date().toISOString(),
  });
  const result = await createRecord(AUDIO_COLLECTION, record, undefined, mutationOptions());
  return { ...result, rkey: rkeyFromUri(result.uri), record };
}

export async function linkCreatedAudioRecordingOccurrence(input: {
  rkey: string;
  record: Record<string, unknown>;
  occurrenceRef: string;
}): Promise<MutationResult> {
  const record = { ...input.record, occurrenceRef: input.occurrenceRef };
  const result = await putRecord(AUDIO_COLLECTION, input.rkey, record, mutationOptions());
  return { ...result, rkey: input.rkey, record };
}

export async function updateAudioRecording(input: {
  recording: AudioRecordingItem;
  data: {
    name?: string;
    description?: RichText;
    metadata?: { recordedAt?: string };
    deploymentRef?: string;
    recordedBy?: string;
    license?: string;
    tags?: string[];
    occurrenceRef?: string;
    siteRef?: string;
  };
  unset?: string[];
  newAudioFile?: File;
  newTechnicalMetadata?: AudioMetadataDraft;
}): Promise<MutationResult> {
  let blob = input.recording.record.blob;
  let metadata = input.recording.record.metadata as Record<string, unknown> | null;

  if (input.newAudioFile && input.newTechnicalMetadata) {
    const uploaded = await uploadBlob(input.newAudioFile, mutationOptions());
    blob = audioBlobFromUpload(uploaded);
    metadata = audioMetadata({
      ...input.newTechnicalMetadata,
      recordedAt: input.data.metadata?.recordedAt ?? String(metadata?.recordedAt ?? new Date().toISOString()),
    });
  } else if (metadata) {
    metadata = {
      ...metadata,
      $type: "app.gainforest.ac.audio#metadata",
      recordedAt: input.data.metadata?.recordedAt ?? metadata.recordedAt,
    };
  }

  const record = applyUnset(
    omitUndefined({
      $type: AUDIO_COLLECTION,
      name: input.data.name ?? input.recording.record.name,
      description: input.data.description !== undefined
        ? richText(input.data.description)
        : input.recording.record.description,
      blob,
      metadata,
      license: input.data.license ?? input.recording.record.license,
      recordedBy: input.data.recordedBy ?? input.recording.record.recordedBy,
      tags: input.data.tags ?? input.recording.record.tags,
      occurrenceRef: input.data.occurrenceRef ?? input.recording.record.occurrenceRef,
      deploymentRef: input.data.deploymentRef ?? input.recording.record.deploymentRef,
      siteRef: input.data.siteRef ?? input.recording.record.siteRef,
      createdAt: input.recording.record.createdAt ?? new Date().toISOString(),
    }),
    input.unset,
  );

  const result = await putRecord(AUDIO_COLLECTION, input.recording.metadata.rkey, record, mutationOptions());
  return { ...result, rkey: input.recording.metadata.rkey };
}

export async function createSpeciesOccurrence(data: Record<string, unknown>): Promise<MutationResult> {
  const result = await createRecord(OCCURRENCE_COLLECTION, occurrenceRecord(data), undefined, mutationOptions());
  return { ...result, rkey: rkeyFromUri(result.uri) };
}

export async function deleteAudioRecording(rkey: string): Promise<void> {
  await deleteRecord(AUDIO_COLLECTION, rkey, mutationOptions());
}
