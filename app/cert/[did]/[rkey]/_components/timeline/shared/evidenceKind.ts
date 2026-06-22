import { parseAtUri } from "../atUri";
import { parseAttachmentContent } from "../attachmentContentParser";

export type TimelineEvidenceFilter = "all" | "tree" | "audio" | "nature" | "file";
export type TimelineEvidenceKind = Exclude<TimelineEvidenceFilter, "all"> | "site" | "other";

export const TIMELINE_EVIDENCE_FILTERS: Array<{ id: TimelineEvidenceFilter }> = [
  { id: "all" },
  { id: "tree" },
  { id: "audio" },
  { id: "nature" },
  { id: "file" },
];

const FILE_CONTENT_TYPES = new Set([
  "document",
  "report",
  "audit",
  "evidence",
  "testimonial",
  "methodology",
  "photo",
  "video",
  "certificate",
  "dataset",
  "other",
]);

function contentHasCollection(content: unknown, collection: string): boolean {
  return parseAttachmentContent(content).some((item) => {
    if (item.kind !== "uri" || item.uriKind !== "at-uri") return false;
    return parseAtUri(item.uri)?.collection === collection;
  });
}

function contentHasFileLikeItem(content: unknown): boolean {
  return parseAttachmentContent(content).some((item) => {
    if (item.kind === "blob") return true;
    return item.kind === "uri" && item.uriKind === "http-url";
  });
}

export function getTimelineEvidenceKind(
  contentType: string | null | undefined,
  content: unknown,
): TimelineEvidenceKind {
  const normalized = contentType?.trim().toLowerCase();

  if (normalized === "audio") return "audio";
  if (normalized === "tree-dataset" || normalized === "occurrence") return "tree";
  if (
    normalized === "biodiversity" ||
    normalized === "biodiversity-dataset" ||
    normalized === "biodiversity-observations" ||
    normalized === "nature" ||
    normalized === "nature-dataset"
  ) {
    return "nature";
  }
  if (normalized === "location") return "site";
  if (normalized && FILE_CONTENT_TYPES.has(normalized)) return "file";

  if (contentHasCollection(content, "app.certified.location")) return "site";
  if (contentHasCollection(content, "app.gainforest.dwc.dataset")) return "tree";
  if (contentHasCollection(content, "app.gainforest.ac.audio")) return "audio";
  if (contentHasCollection(content, "app.gainforest.dwc.occurrence")) return "nature";
  if (contentHasFileLikeItem(content)) return "file";

  return "other";
}

export function matchesTimelineFilter(
  kind: TimelineEvidenceKind,
  filter: TimelineEvidenceFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "file") return kind === "file" || kind === "site" || kind === "other";
  return kind === filter;
}
