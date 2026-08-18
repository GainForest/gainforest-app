import {
  TREE_UPLOAD_EVENTS,
  type TreeUploadEventName,
  type TreeUploadEventPayload,
} from "./events";
import { hasAnalyticsConsent } from "./consent";
import { isTreeUploadTrackingSurface } from "./tree-upload";

type ContentsquareCommand = [string, ...unknown[]];

declare global {
  interface Window {
    hj?: (command: string, ...args: unknown[]) => void;
    _uxa?: ContentsquareCommand[];
  }
}

const TREE_UPLOAD_DYNAMIC_KEYS: Array<keyof TreeUploadEventPayload> = [
  "uploadId",
  "stepIndex",
  "stepName",
  "datasetMode",
  "sourceFormat",
  "fileExtension",
  "fileSizeBucket",
  "mediaZipSizeBucket",
  "totalRows",
  "validRows",
  "invalidRows",
  "totalColumns",
  "mappedColumns",
  "skippedColumns",
  "requiredMissingCount",
  "duplicateMappingCount",
  "expectedSkippedKoboColumnCount",
  "savedRows",
  "partialRows",
  "failedRows",
  "photoTotal",
  "photoSucceeded",
  "photoFailed",
  "hasKoboZip",
  "mediaZipImageCount",
  "mediaZipSubmissionCount",
  "durationSeconds",
  "failureReason",
];

function canTrackTreeUpload(): boolean {
  return (
    typeof window !== "undefined" &&
    hasAnalyticsConsent() &&
    isTreeUploadTrackingSurface(window.location.pathname, window.location.search)
  );
}

function toDynamicValue(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function pushContentsquareCommand(command: ContentsquareCommand): boolean {
  if (!canTrackTreeUpload()) return false;

  try {
    window._uxa = window._uxa ?? [];
    window._uxa.push(command);
    return true;
  } catch {
    return false;
  }
}

function trackHotjarEvent(eventName: TreeUploadEventName): boolean {
  if (!canTrackTreeUpload() || typeof window.hj !== "function") return false;

  try {
    window.hj("event", eventName);
    return true;
  } catch {
    return false;
  }
}

function trackTreeUploadDynamicVariables(payload: TreeUploadEventPayload): boolean {
  let tracked = false;
  for (const key of TREE_UPLOAD_DYNAMIC_KEYS) {
    const dynamicValue = toDynamicValue(payload[key]);
    if (dynamicValue === null) continue;
    tracked = pushContentsquareCommand([
      "trackDynamicVariable",
      { key: `tree_upload_${key}`, value: dynamicValue },
    ]) || tracked;
  }
  return tracked;
}

export function trackTreeUploadEvent(
  eventName: TreeUploadEventName,
  payload: TreeUploadEventPayload = {},
): boolean {
  if (!canTrackTreeUpload()) return false;

  const trackedEvent = trackHotjarEvent(eventName);
  const trackedPageEvent = pushContentsquareCommand(["trackPageEvent", eventName]);
  const trackedTrigger = pushContentsquareCommand(["trackEventTriggerRecording", eventName]);
  const trackedVariables = trackTreeUploadDynamicVariables(payload);

  return trackedEvent || trackedPageEvent || trackedTrigger || trackedVariables;
}

export function trackTreeUploadFeedbackPromptShown(
  payload: TreeUploadEventPayload,
): boolean {
  return trackTreeUploadEvent(TREE_UPLOAD_EVENTS.FEEDBACK_PROMPT_SHOWN, payload);
}
