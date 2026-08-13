/**
 * Audio-branch logic for the quick "Add observations" modal (design 1d:
 * one drop zone, plus a device chip that appears only once audio lands).
 *
 * The modal's drop zone accepts a whole AudioMoth SD card next to photos.
 * Everything here is pure: which dropped files count as recordings, the
 * card summary shown after headers are read (count, size, kHz, date range,
 * device), and where the batch should be filed (an existing folder, the
 * deployment matched by acoustic chime, or a new folder named after the
 * card). The upload itself is handed to the background upload tray.
 */

import type { AudioMothRecordingInfo } from "@/app/_lib/audiomoth/wav-metadata";
import type { DeploymentEventItem } from "@/app/_lib/deployment-events";
import type { UploadFolderOption } from "@/app/_lib/audiomoth/upload-folder";
import { findUploadFolderByName } from "@/app/_lib/audiomoth/upload-folder";

/** One WAV waiting in the modal, with its parsed header (null = unreadable). */
export type QuickRecording = {
  id: string;
  file: File;
  info: AudioMothRecordingInfo | null;
};

/** A recording file by name: `.wav`, not a hidden/AppleDouble sidecar. */
export function isWavCandidate(name: string): boolean {
  return /\.wav$/i.test(name) && !name.startsWith("._") && !name.startsWith(".");
}

/**
 * Split one drop/pick into the photo branch and the audio branch. Anything
 * that is neither an image nor a WAV is ignored, exactly like non-image
 * files were before audio support.
 */
export function splitObservationFiles(files: File[]): { images: File[]; wavs: File[] } {
  const images: File[] = [];
  const wavs: File[] = [];
  for (const file of files) {
    if (file.type.startsWith("image/")) images.push(file);
    else if (isWavCandidate(file.name)) wavs.push(file);
  }
  return { images, wavs };
}

/** Recording time: header timestamp → filename pattern → file mtime. */
export function quickRecordingTime(rec: QuickRecording): Date {
  if (rec.info?.recordedAt) return rec.info.recordedAt;
  const match = rec.file.name.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, y, mo, d, h, mi, s] = match;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  }
  return new Date(rec.file.lastModified);
}

/** The card summary chip shown once audio lands. */
export type AudioBatchSummary = {
  /** Readable recordings (header parsed). */
  count: number;
  /** Files that could not be read as AudioMoth WAVs. */
  unreadable: number;
  totalBytes: number;
  /** Distinct sample rates across the batch, descending, in Hz. */
  sampleRatesHz: number[];
  earliest: Date | null;
  latest: Date | null;
  /** Distinct AudioMoth device IDs (16 hex chars) found in the headers. */
  deviceIds: string[];
  /** Distinct acoustic-chime deployment IDs found in the headers. */
  chimeIds: string[];
};

export function summarizeAudioBatch(recordings: QuickRecording[]): AudioBatchSummary {
  const readable = recordings.filter((rec) => rec.info);
  const sampleRates = new Set<number>();
  const deviceIds = new Set<string>();
  const chimeIds = new Set<string>();
  let earliest: Date | null = null;
  let latest: Date | null = null;
  let totalBytes = 0;
  for (const rec of readable) {
    totalBytes += rec.file.size;
    if (rec.info!.sampleRate) sampleRates.add(rec.info!.sampleRate);
    if (rec.info!.deviceId) deviceIds.add(rec.info!.deviceId);
    if (rec.info!.deploymentId) chimeIds.add(rec.info!.deploymentId);
    const time = quickRecordingTime(rec);
    if (!earliest || time < earliest) earliest = time;
    if (!latest || time > latest) latest = time;
  }
  return {
    count: readable.length,
    unreadable: recordings.length - readable.length,
    totalBytes,
    sampleRatesHz: [...sampleRates].sort((a, b) => b - a),
    earliest,
    latest,
    deviceIds: [...deviceIds],
    chimeIds: [...chimeIds],
  };
}

export function formatRecordingBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "48 kHz" (or "48/192 kHz" when a card carries mixed rates). */
export function formatSampleRates(sampleRatesHz: number[]): string | null {
  if (sampleRatesHz.length === 0) return null;
  const toKhz = (hz: number) => {
    const khz = hz / 1000;
    return Number.isInteger(khz) ? String(khz) : khz.toFixed(1);
  };
  return `${sampleRatesHz.map(toKhz).join("/")} kHz`;
}

/**
 * Short device chip label, e.g. "AM-61DA539A" for device
 * 24F3190361DA539A. The full 16-hex ID is unwieldy in a chip; the last 8
 * characters are the serial-ish tail people recognise on their units.
 */
export function deviceChipLabel(deviceId: string): string {
  return `AM-${deviceId.slice(-8).toUpperCase()}`;
}

/**
 * The deployment event matched by acoustic chime, when every readable
 * recording agrees on one chime ID that maps to a known deployment. A card
 * with mixed or missing chimes gets no automatic match — the folder picker
 * takes over.
 */
export function matchChimeDeployment(
  summary: AudioBatchSummary,
  events: DeploymentEventItem[] | null,
): DeploymentEventItem | null {
  if (!events || summary.chimeIds.length !== 1) return null;
  const chime = summary.chimeIds[0]!.toLowerCase();
  return events.find((event) => event.eventID.toLowerCase() === chime) ?? null;
}

/** Where the audio batch is headed — mirrors the tray's UploadTarget. */
export type AudioTargetPlan =
  | { kind: "event"; event: DeploymentEventItem }
  | { kind: "existing"; uri: string; name: string }
  | { kind: "named"; name: string; deployedAt: string };

/** Sentinel value for the folder picker's "new folder from this card" row. */
export const NEW_AUDIO_FOLDER = "__new__";

/**
 * Resolve the folder picker's selection into an upload target:
 *
 *  - a chime-matched deployment wins when the user left the picker alone,
 *  - an explicitly selected folder is used as-is,
 *  - otherwise a new folder named after the card (falling back to a dated
 *    default) is created on the fly by the tray — reusing an existing
 *    folder of the same name, so a re-read card never forks a duplicate.
 */
export function resolveAudioTarget({
  summary,
  matchedEvent,
  selection,
  folders,
  cardName,
  fallbackName,
}: {
  summary: AudioBatchSummary;
  matchedEvent: DeploymentEventItem | null;
  /** Folder picker value: "" (auto), NEW_AUDIO_FOLDER, or a folder AT-URI. */
  selection: string;
  folders: (UploadFolderOption & { name: string })[];
  /** The dropped card folder's name, when the drop carried one. */
  cardName: string;
  /** Localised default folder name when the card has none, e.g. "Recordings 12 Jun 2026". */
  fallbackName: string;
}): AudioTargetPlan {
  if (selection && selection !== NEW_AUDIO_FOLDER) {
    const folder = folders.find((candidate) => candidate.uri === selection);
    if (folder) return { kind: "existing", uri: folder.uri, name: folder.name };
  }
  if (!selection && matchedEvent) return { kind: "event", event: matchedEvent };
  const name = cardName.trim() || fallbackName;
  // The tray re-checks by name before creating, but resolving here too keeps
  // the modal's preview label honest when the folder already exists.
  const existing = findUploadFolderByName(folders, name);
  if (existing) return { kind: "existing", uri: existing.uri, name };
  const deployedAt = (summary.earliest ?? new Date()).toISOString();
  return { kind: "named", name, deployedAt };
}

/**
 * True when the card's device has no deployment to attach to — the "set one
 * up ↗" flow's trigger. A chime match settles it; otherwise the account's
 * folders are checked against the card's device IDs (folders record the
 * unit's serial). With no folders at all the answer is always yes; with
 * folders but anonymous headers we can't tell, so the picker takes over.
 */
export function deviceNeedsDeployment(
  summary: AudioBatchSummary,
  folders: { deviceSerialNumber?: string }[] | null,
  matchedEvent: DeploymentEventItem | null,
): boolean {
  if (matchedEvent || summary.count === 0 || folders === null) return false;
  if (folders.length === 0) return true;
  if (summary.deviceIds.length === 0) return false;
  const ids = new Set(summary.deviceIds.map((id) => id.trim().toUpperCase()));
  return !folders.some(
    (folder) => folder.deviceSerialNumber && ids.has(folder.deviceSerialNumber.trim().toUpperCase()),
  );
}

/**
 * Device IDs from the card that are not in the equipment registry yet.
 * Matching follows the registry convention: `assetId` carries the 16-hex
 * AudioMoth ID, compared case-insensitively.
 */
export function unregisteredDeviceIds(
  deviceIds: string[],
  equipmentAssetIds: string[] | null,
): string[] {
  if (!equipmentAssetIds) return [];
  const known = new Set(equipmentAssetIds.map((id) => id.trim().toUpperCase()));
  return deviceIds.filter((id) => !known.has(id.trim().toUpperCase()));
}
