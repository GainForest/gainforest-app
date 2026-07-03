import {
  contentHasFileLikeItem,
  contentHasRecordCollection,
  getRegisteredEvidenceKind,
} from "./evidenceContentTypeRegistry";

export type TimelineEvidenceFilter = "all" | "tree" | "audio" | "nature" | "file";
export type TimelineEvidenceKind = Exclude<TimelineEvidenceFilter, "all"> | "site" | "update" | "other";

export const TIMELINE_EVIDENCE_FILTERS: Array<{ id: TimelineEvidenceFilter }> = [
  { id: "all" },
  { id: "tree" },
  { id: "audio" },
  { id: "nature" },
  { id: "file" },
];

export function getTimelineEvidenceKind(
  contentType: string | null | undefined,
  content: unknown,
): TimelineEvidenceKind {
  const registeredKind = getRegisteredEvidenceKind(contentType);
  if (registeredKind) return registeredKind;

  if (contentHasRecordCollection(content, "app.certified.location")) return "site";
  if (contentHasRecordCollection(content, "app.gainforest.dwc.dataset")) return "tree";
  if (contentHasRecordCollection(content, "app.gainforest.ac.audio")) return "audio";
  if (contentHasRecordCollection(content, "app.gainforest.dwc.occurrence")) return "nature";
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
