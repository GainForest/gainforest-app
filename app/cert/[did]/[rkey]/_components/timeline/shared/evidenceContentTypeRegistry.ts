import { parseAtUri } from "../atUri";
import { parseAttachmentContent } from "../attachmentContentParser";
import {
  getTimelineDocumentFormat,
  type TimelineDocumentFormat,
} from "./timelineDocumentFormats";

export type RegisteredEvidenceKind = "tree" | "audio" | "nature" | "file" | "site" | "other";

export const EVIDENCE_CONTENT_TYPE_REGISTRY = [
  { value: "document", translationKey: "document", filePickerEligible: true, evidenceKind: "file" },
  { value: "report", translationKey: "report", filePickerEligible: true, evidenceKind: "file" },
  { value: "audit", translationKey: "audit", filePickerEligible: true, evidenceKind: "file" },
  { value: "evidence", translationKey: "evidence", filePickerEligible: true, evidenceKind: "file" },
  { value: "testimonial", translationKey: "testimonial", filePickerEligible: true, evidenceKind: "file" },
  { value: "methodology", translationKey: "methodology", filePickerEligible: true, evidenceKind: "file" },
  { value: "photo", translationKey: "photo", filePickerEligible: true, evidenceKind: "file" },
  { value: "video", translationKey: "video", filePickerEligible: true, evidenceKind: "file" },
  { value: "dataset", translationKey: "dataset", filePickerEligible: true, evidenceKind: "file" },
  { value: "certificate", translationKey: "certificate", filePickerEligible: true, evidenceKind: "file" },
  { value: "audio", translationKey: "audio", filePickerEligible: true, evidenceKind: "audio" },
  { value: "other", translationKey: "other", filePickerEligible: true, evidenceKind: "file" },
  { value: "tree-dataset", translationKey: "treeDataset", filePickerEligible: false, evidenceKind: "tree" },
  { value: "biodiversity", translationKey: "biodiversity", filePickerEligible: false, evidenceKind: "nature" },
  { value: "biodiversity-dataset", translationKey: "biodiversity", filePickerEligible: false, evidenceKind: "nature" },
  { value: "biodiversity-observations", translationKey: "biodiversity", filePickerEligible: false, evidenceKind: "nature" },
  { value: "nature", translationKey: "biodiversity", filePickerEligible: false, evidenceKind: "nature" },
  { value: "nature-dataset", translationKey: "biodiversity", filePickerEligible: false, evidenceKind: "nature" },
  { value: "occurrence", translationKey: "occurrence", filePickerEligible: false, evidenceKind: "tree" },
  { value: "location", translationKey: "location", filePickerEligible: false, evidenceKind: "site" },
] as const satisfies ReadonlyArray<{
  value: string;
  translationKey: string;
  filePickerEligible: boolean;
  evidenceKind: RegisteredEvidenceKind;
}>;

export type KnownEvidenceContentType =
  (typeof EVIDENCE_CONTENT_TYPE_REGISTRY)[number]["value"];

export type FilePickerEvidenceContentType = Extract<
  (typeof EVIDENCE_CONTENT_TYPE_REGISTRY)[number],
  { filePickerEligible: true }
>["value"];

export type AttachmentPreviewClassification = {
  kind: "image" | "video" | "audio" | "pdf" | "document" | "link";
  documentFormat: TimelineDocumentFormat | null;
};

const CONTENT_TYPE_BY_VALUE: Map<string, (typeof EVIDENCE_CONTENT_TYPE_REGISTRY)[number]> = new Map(
  EVIDENCE_CONTENT_TYPE_REGISTRY.map((entry) => [entry.value, entry]),
);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "oga", "flac", "aac"]);

function normalizeContentType(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizeMimeType(value: string | null | undefined): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isSpecificMimeType(mimeType: string): boolean {
  return (
    mimeType.length > 0 &&
    mimeType !== "application/octet-stream" &&
    mimeType !== "binary/octet-stream"
  );
}

export function getEvidenceContentTypeEntry(contentType: string | null | undefined) {
  const normalized = normalizeContentType(contentType);
  return normalized ? CONTENT_TYPE_BY_VALUE.get(normalized) ?? null : null;
}

export function getRegisteredEvidenceKind(
  contentType: string | null | undefined,
): RegisteredEvidenceKind | null {
  return getEvidenceContentTypeEntry(contentType)?.evidenceKind ?? null;
}

export function getFilePickerEvidenceContentTypeOptions(): Array<{
  value: FilePickerEvidenceContentType;
  translationKey: string;
}> {
  return EVIDENCE_CONTENT_TYPE_REGISTRY.filter(
    (entry): entry is Extract<(typeof EVIDENCE_CONTENT_TYPE_REGISTRY)[number], { filePickerEligible: true }> =>
      entry.filePickerEligible,
  ).map((entry) => ({
    value: entry.value,
    translationKey: entry.translationKey,
  }));
}

export function contentHasRecordCollection(content: unknown, collection: string): boolean {
  return parseAttachmentContent(content).some((item) => {
    if (item.kind !== "uri" || item.uriKind !== "at-uri") return false;
    return parseAtUri(item.uri)?.collection === collection;
  });
}

export function contentHasFileLikeItem(content: unknown): boolean {
  return parseAttachmentContent(content).some((item) => {
    if (item.kind === "blob") return true;
    return item.kind === "uri" && item.uriKind === "http-url";
  });
}

export function classifyAttachmentPreview(
  mimeType: string | null | undefined,
  extension: string | null | undefined,
): AttachmentPreviewClassification {
  const normalizedMime = normalizeMimeType(mimeType);
  const normalizedExtension = extension?.trim().toLowerCase() || null;

  if (isSpecificMimeType(normalizedMime)) {
    if (normalizedMime.startsWith("image/")) return { kind: "image", documentFormat: null };
    if (normalizedMime.startsWith("video/")) return { kind: "video", documentFormat: null };
    if (normalizedMime.startsWith("audio/")) return { kind: "audio", documentFormat: null };
  }

  const documentFormat = getTimelineDocumentFormat(normalizedMime, normalizedExtension);
  if (documentFormat === "pdf") return { kind: "pdf", documentFormat };
  if (documentFormat) return { kind: "document", documentFormat };

  if (normalizedExtension && IMAGE_EXTENSIONS.has(normalizedExtension)) {
    return { kind: "image", documentFormat: null };
  }
  if (normalizedExtension && VIDEO_EXTENSIONS.has(normalizedExtension)) {
    return { kind: "video", documentFormat: null };
  }
  if (normalizedExtension && AUDIO_EXTENSIONS.has(normalizedExtension)) {
    return { kind: "audio", documentFormat: null };
  }

  return { kind: "link", documentFormat: null };
}
