/**
 * Per-device record of the recording configuration last written to an
 * AudioMoth from this browser. The device cannot report its configuration
 * back over USB (GET_APP_PACKET returns time/ID/battery, not settings), so
 * this is the source of truth for "what did we put on this unit" — it backs
 * the GainForest-setup badge and pre-fills the Recording settings form.
 */

import { DEFAULT_CONFIG, type AudioMothConfig } from "./config";

const STORAGE_PREFIX = "audiomoth:lastConfig:";

export interface AppliedConfigEntry {
  config: AudioMothConfig;
  appliedAt: string;
  firmwareVersion: [number, number, number];
}

function storageKey(deviceId: string): string {
  return `${STORAGE_PREFIX}${deviceId.toUpperCase()}`;
}

export function saveAppliedConfig(
  deviceId: string,
  config: AudioMothConfig,
  firmwareVersion: [number, number, number],
): void {
  try {
    const entry: AppliedConfigEntry = {
      config,
      appliedAt: new Date().toISOString(),
      firmwareVersion,
    };
    window.localStorage.setItem(storageKey(deviceId), JSON.stringify(entry));
  } catch {
    /* storage unavailable (private mode / quota) — the badge just stays unknown */
  }
}

/**
 * Marker line opening the auto-generated setup block inside an equipment
 * record's notes. Brand/product label, deliberately identical in every
 * locale so an existing block can be found and replaced later.
 */
export const SETUP_NOTES_HEADER = "— GainForest AudioMoth —";

/**
 * Replace (or append) the auto-generated setup block in an equipment
 * record's notes, leaving any handwritten notes untouched. The block starts
 * at the marker header and runs to the next blank line or the end.
 */
export function mergeSetupNotes(existingNotes: string | undefined, block: string): string {
  const pattern = new RegExp(`(?:^|\\n+)${SETUP_NOTES_HEADER}[\\s\\S]*?(?=\\n\\n|$)`);
  const handwritten = (existingNotes ?? "").replace(pattern, "").trim();
  return handwritten ? `${handwritten}\n\n${block}` : block;
}

export function loadAppliedConfig(deviceId: string): AppliedConfigEntry | null {
  try {
    const raw = window.localStorage.getItem(storageKey(deviceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppliedConfigEntry>;
    if (typeof parsed !== "object" || parsed === null || typeof parsed.config !== "object" || parsed.config === null) {
      return null;
    }
    const firmwareVersion = Array.isArray(parsed.firmwareVersion) && parsed.firmwareVersion.length === 3
      ? (parsed.firmwareVersion.map((value) => Number(value) || 0) as [number, number, number])
      : ([0, 0, 0] as [number, number, number]);
    return {
      /* Tolerate entries written by older app versions missing newer fields */
      config: { ...DEFAULT_CONFIG, ...parsed.config },
      appliedAt: typeof parsed.appliedAt === "string" ? parsed.appliedAt : new Date(0).toISOString(),
      firmwareVersion,
    };
  } catch {
    return null;
  }
}
