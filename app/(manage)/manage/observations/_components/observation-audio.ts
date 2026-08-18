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
import { chimeDeploymentName } from "@/app/_lib/unified-deployments";

/** One WAV waiting in the modal, with its parsed header (null = unreadable). */
export type QuickRecording = {
  id: string;
  file: File;
  info: AudioMothRecordingInfo | null;
  /** Content CID — undefined until hashed, null when the file can't be read. */
  cid?: string | null;
  /** Already in the destination account (by content or legacy name+size). */
  skipped?: boolean;
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

/** MIME types WAV files travel under; many systems leave the type empty. */
const WAV_MIME_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"]);

/**
 * True when a drag payload holds files and none of them could possibly be
 * used here — every one carries a known MIME type that is neither an image
 * nor WAV audio (a voice memo, a video, a spreadsheet). The drop zone then
 * refuses the drop outright (not-allowed cursor) instead of swallowing the
 * files. Items with an empty type stay droppable: a directory (a whole SD
 * card) and a file the OS didn't tag both look like that mid-drag, and
 * filenames can't be read until the drop lands.
 */
export function dragPayloadRejected(
  items: ArrayLike<{ kind: string; type: string }> | null | undefined,
): boolean {
  let fileCount = 0;
  for (let i = 0; i < (items?.length ?? 0); i += 1) {
    const item = items![i]!;
    if (item.kind !== "file") continue;
    fileCount += 1;
    const type = item.type.toLowerCase();
    if (!type || type.startsWith("image/") || WAV_MIME_TYPES.has(type)) return false;
  }
  return fileCount > 0;
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

/** Where a group of recordings is headed — mirrors the tray's UploadTarget. */
export type AudioTargetPlan =
  | { kind: "event"; event: DeploymentEventItem }
  | { kind: "existing"; uri: string; name: string }
  | { kind: "named"; name: string; deployedAt: string };

/** Sentinel value for the folder picker's "new folder from this card" row. */
export const NEW_AUDIO_FOLDER = "__new__";

/** Picker value for assigning unmatched recordings to a deployment event. */
export const AUDIO_EVENT_SELECTION_PREFIX = "event:";

/** Recordings that will actually upload: readable and not already uploaded. */
export function uploadableRecordings(recordings: QuickRecording[]): QuickRecording[] {
  return recordings.filter((rec) => rec.info && !rec.skipped);
}

export type PlannedAudioGroups = {
  /** One entry per upload target, exactly like the Upload tab's hand-off. */
  groups: { plan: AudioTargetPlan; recordings: QuickRecording[] }[];
  /** Recordings whose chime matched a deployment — filed there, always. */
  matchedCount: number;
  /** Recordings governed by the folder picker. */
  unmatchedCount: number;
  /** Where the picker-governed pool goes, or null when everything matched. */
  unmatchedPlan: AudioTargetPlan | null;
};

/**
 * Split the batch into upload groups the same way the AudioMoth Upload tab
 * does (`handOffToTray`): recordings are grouped by the acoustic-chime ID in
 * their headers, a group whose chime maps to a known deployment always files
 * under that deployment — the folder picker cannot override it — and
 * everything else (unknown chime, or no chime at all) follows the picker:
 * a chosen deployment event, a chosen folder, or a folder named after the
 * card (reusing an existing folder of that name, so a re-read card never
 * forks a duplicate).
 */
export function planAudioUploadGroups({
  recordings,
  events,
  selection,
  folders,
  cardName,
  fallbackName,
}: {
  recordings: QuickRecording[];
  events: DeploymentEventItem[] | null;
  /**
   * Folder picker value: "" (automatic), NEW_AUDIO_FOLDER, a folder AT-URI,
   * or `event:<at-uri>` for a manually assigned deployment event.
   */
  selection: string;
  folders: (UploadFolderOption & { name: string })[];
  /** The dropped card folder's name, when the drop carried one. */
  cardName: string;
  /** Localised default folder name when the card has none, e.g. "Recordings 12 Jun 2026". */
  fallbackName: string;
}): PlannedAudioGroups {
  const uploadable = uploadableRecordings(recordings);

  // Group by chime ID, preserving first-seen order like the Upload tab.
  const byChime = new Map<string, QuickRecording[]>();
  for (const rec of uploadable) {
    const key = rec.info!.deploymentId ?? "";
    const list = byChime.get(key) ?? [];
    list.push(rec);
    byChime.set(key, list);
  }

  const matchFor = (chime: string): DeploymentEventItem | null =>
    events?.find((event) => event.eventID.toLowerCase() === chime.toLowerCase()) ?? null;

  const groups: PlannedAudioGroups["groups"] = [];
  const unmatched: QuickRecording[] = [];
  let matchedCount = 0;

  // A manually assigned event applies to the picker-governed pool, mirroring
  // the Upload tab's manual "assign to deployment" select.
  const manualEvent = selection.startsWith(AUDIO_EVENT_SELECTION_PREFIX)
    ? (events?.find((event) => event.uri === selection.slice(AUDIO_EVENT_SELECTION_PREFIX.length)) ?? null)
    : null;

  for (const [chime, groupRecordings] of byChime) {
    const event = chime ? matchFor(chime) : null;
    if (event) {
      groups.push({ plan: { kind: "event", event }, recordings: groupRecordings });
      matchedCount += groupRecordings.length;
    } else {
      unmatched.push(...groupRecordings);
    }
  }

  let unmatchedPlan: AudioTargetPlan | null = null;
  if (unmatched.length > 0) {
    if (manualEvent) {
      unmatchedPlan = { kind: "event", event: manualEvent };
    } else if (
      selection &&
      selection !== NEW_AUDIO_FOLDER &&
      !selection.startsWith(AUDIO_EVENT_SELECTION_PREFIX)
    ) {
      const folder = folders.find((candidate) => candidate.uri === selection);
      if (folder) unmatchedPlan = { kind: "existing", uri: folder.uri, name: folder.name };
    }
    if (!unmatchedPlan) {
      const name = cardName.trim() || fallbackName;
      // The tray re-checks by name before creating, but resolving here too
      // keeps the modal's preview label honest when the folder exists.
      const existing = findUploadFolderByName(folders, name);
      if (existing) {
        unmatchedPlan = { kind: "existing", uri: existing.uri, name };
      } else {
        // A chime deployment already carrying this name is the same
        // deployment — the recordings join it instead of forking a
        // second one with the same name beside it.
        const chime = findUploadFolderByName(
          (events ?? []).map((event) => ({ uri: event.uri, name: chimeDeploymentName(event), event })),
          name,
        );
        if (chime) {
          unmatchedPlan = { kind: "event", event: chime.event };
        } else {
          const times = unmatched.map((rec) => quickRecordingTime(rec).getTime());
          unmatchedPlan = { kind: "named", name, deployedAt: new Date(Math.min(...times)).toISOString() };
        }
      }
    }
    groups.push({ plan: unmatchedPlan, recordings: unmatched });
  }

  return { groups, matchedCount, unmatchedCount: unmatched.length, unmatchedPlan };
}

/**
 * True when the card's device has no deployment to attach to — the "set one
 * up ↗" flow's trigger. Any chime match settles it; otherwise the account's
 * folders are checked against the card's device IDs (folders record the
 * unit's serial). With no folders at all the answer is always yes; with
 * folders but anonymous headers we can't tell, so the picker takes over.
 */
export function deviceNeedsDeployment(
  summary: AudioBatchSummary,
  folders: { deviceSerialNumber?: string }[] | null,
  hasChimeMatch: boolean,
): boolean {
  if (hasChimeMatch || summary.count === 0 || folders === null) return false;
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
