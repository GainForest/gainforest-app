import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import {
  buildTimelineReferences,
  getTimelineReferenceUrisForEntry,
  type TimelineReference,
  type TimelineReferenceCopy,
} from "../timelineReferences";
import type { TimelineSourceData } from "../EvidenceAdder";
import {
  getTimelineEvidenceKind,
  matchesTimelineFilter,
  TIMELINE_EVIDENCE_FILTERS,
  type TimelineEvidenceFilter,
  type TimelineEvidenceKind,
} from "./evidenceKind";
import {
  buildTimelineFeedTiles,
  type TimelineFeedCopy,
  type TimelineFeedTile,
} from "./timelineFeedViewModel";

export type TimelineEntryViewModel = {
  item: TimelineAttachmentItem;
  index: number;
  entryId: string;
  refs: TimelineReference[];
  kind: TimelineEvidenceKind;
  tiles: TimelineFeedTile[];
};

export type TimelinePaginationResult<T> = {
  totalPages: number;
  safePage: number;
  visibleItems: T[];
};

export function getTimelineEntryId(item: TimelineAttachmentItem, index: number): string {
  return item.metadata.uri ?? `${item.metadata.rkey ?? "entry"}-${index}`;
}

export function buildTimelineEntryViewModels(args: {
  entries: TimelineAttachmentItem[];
  sources: TimelineSourceData;
  providedReferences: TimelineReference[];
  referenceCopy: TimelineReferenceCopy;
  feedCopy: TimelineFeedCopy;
}): TimelineEntryViewModel[] {
  const refsById = new Map<string, TimelineReference>();
  const builtReferences = buildTimelineReferences({
    entries: args.entries,
    audio: args.sources.audio,
    occurrences: args.sources.occurrences,
    treeGroups: args.sources.treeGroups,
    places: args.sources.places,
    copy: args.referenceCopy,
  });

  for (const ref of builtReferences) refsById.set(ref.id, ref);
  for (const ref of args.providedReferences) refsById.set(ref.id, ref);

  return args.entries.map((item, index) => {
    const entryId = getTimelineEntryId(item, index);
    const refs = getTimelineReferenceUrisForEntry(item)
      .map((uri) => refsById.get(uri))
      .filter((ref): ref is TimelineReference => Boolean(ref));
    const kind = getTimelineEvidenceKind(item.record.contentType, item.record.content);

    return {
      item,
      index,
      entryId,
      refs,
      kind,
      tiles: buildTimelineFeedTiles({
        entryId,
        content: item.record.content,
        references: refs,
        copy: args.feedCopy,
      }),
    };
  });
}

export function getTimelineFilterCounts(
  entries: TimelineEntryViewModel[],
): Map<TimelineEvidenceFilter, number> {
  return new Map(
    TIMELINE_EVIDENCE_FILTERS.map((filter) => [
      filter.id,
      entries.filter((entry) => matchesTimelineFilter(entry.kind, filter.id)).length,
    ]),
  );
}

export function getFilteredTimelineEntries(
  entries: TimelineEntryViewModel[],
  filter: TimelineEvidenceFilter,
): TimelineEntryViewModel[] {
  return entries.filter((entry) => matchesTimelineFilter(entry.kind, filter));
}

export function paginateTimelineEntries<T>(
  entries: T[],
  page: number,
  pageSize: number,
): TimelinePaginationResult<T> {
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    totalPages,
    safePage,
    visibleItems: entries.slice((safePage - 1) * pageSize, safePage * pageSize),
  };
}
