"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TimelineMutationPermission, TimelineSourceData } from "../EvidenceAdder";
import type { TimelineReference, TimelineReferenceCopy } from "../timelineReferences";
import {
  TIMELINE_EVIDENCE_FILTERS,
  type TimelineEvidenceFilter,
} from "../shared/evidenceKind";
import type { TimelineFeedCopy } from "../shared/timelineFeedViewModel";
import { formatLinkedWindow } from "../shared/timelineDates";
import {
  buildTimelineEntryViewModels,
  getFilteredTimelineEntries,
  getTimelineFilterCounts,
  paginateTimelineEntries,
  type TimelineEntryViewModel,
} from "../shared/timelineViewModel";
import { TimelineEntryList } from "./TimelineEntryList";
import { TimelineEmpty } from "./shared/TimelineEmpty";
import { TimelineGreenGlobePreview } from "./shared/TimelineGreenGlobePreview";
import {
  buildTimelineMapLayers,
  type TimelineMapLayer,
} from "./shared/timelineMapLayers";
import { TimelineViewerStoreProvider } from "./shared/timelineViewerStore";

const DEFAULT_PAGE_SIZE = 8;

type TimelineEntryListItem = TimelineEntryViewModel & {
  mapLayers: TimelineMapLayer[];
};

export function TimelinePanel({
  organizationDid,
  entries,
  sources,
  references,
  canManageEvidence,
  deletePermission,
  mutationRepo,
  onDeleted,
  pageSize = DEFAULT_PAGE_SIZE,
  summaryScope = "activity",
  previewMode = false,
  previewLimit = 1,
  seeMoreHref,
}: {
  organizationDid: string;
  entries: TimelineAttachmentItem[];
  sources: TimelineSourceData;
  references: TimelineReference[];
  canManageEvidence: boolean;
  deletePermission: TimelineMutationPermission;
  mutationRepo?: string;
  onDeleted: (rkey: string) => void;
  pageSize?: number;
  summaryScope?: "activity" | "organization";
  // Compact digest used on profile/overview pages: render a limited set of
  // updates first, then either reveal the rest or link to the full timeline.
  // Filters, the map preview, and pagination are hidden in this mode.
  previewMode?: boolean;
  previewLimit?: number;
  seeMoreHref?: string;
}) {
  const timelineT = useTranslations("bumicert.detail.timeline");
  const entryT = useTranslations("bumicert.detail.timelineEntry");
  const referenceT = useTranslations("bumicert.detail.reference");
  const locale = useLocale();
  const [activeFilter, setActiveFilter] = useState<TimelineEvidenceFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const linkedWindow = useMemo(() => formatLinkedWindow(entries, locale), [entries, locale]);
  const referenceCopy = useMemo<TimelineReferenceCopy>(
    () => ({
      linkedRecord: referenceT("linkedRecord"),
      linkedAudioRecord: referenceT("linkedAudioRecord"),
      audioEvidence: referenceT("audioEvidence"),
      linkedDataset: referenceT("linkedDataset"),
      linkedTreeRecord: referenceT("linkedTreeRecord"),
      linkedSiteRecord: referenceT("linkedSiteRecord"),
      siteEvidence: referenceT("siteEvidence"),
      linkedNatureData: timelineT("fallbacks.linkedNatureData"),
      treeCount: (count: number) => entryT("treeCount", { count }),
      speciesCount: (count: number) => entryT("speciesCount", { count }),
      observationCount: (count: number) => entryT("observationCount", { count }),
      individualCount: (count: number) => referenceT("individualCount", { count }),
    }),
    [entryT, referenceT, timelineT],
  );
  const feedCopy = useMemo<TimelineFeedCopy>(
    () => ({
      linkedNatureDataGroup: timelineT("fallbacks.linkedNatureDataGroup"),
      linkedNatureData: timelineT("fallbacks.linkedNatureData"),
      linkedFile: entryT("linkedFile"),
      image: entryT("previewKinds.image"),
      video: entryT("previewKinds.video"),
      audio: entryT("previewKinds.audio"),
      pdf: entryT("previewKinds.pdf"),
      document: entryT("previewKinds.document"),
      linkedTreeInformation: entryT("linkedTreeInformation"),
      linkedItem: entryT("linkedItem"),
      linkedProjectPlace: entryT("linkedProjectPlace"),
      linkedTreeGroup: entryT("linkedTreeGroup"),
      linkedSound: entryT("linkedSound"),
      groupedData: entryT("groupedData"),
      unresolvedReferenceBody: entryT("unresolvedReferenceBody"),
    }),
    [entryT, timelineT],
  );
  const entryModels = useMemo(
    () =>
      buildTimelineEntryViewModels({
        entries,
        sources,
        providedReferences: references,
        referenceCopy,
        feedCopy,
      }),
    [entries, feedCopy, referenceCopy, references, sources],
  );
  const entryListItems = useMemo<TimelineEntryListItem[]>(
    () =>
      entryModels.map((entry) => ({
        ...entry,
        mapLayers: buildTimelineMapLayers([
          { item: entry.item, references: entry.refs },
        ]),
      })),
    [entryModels],
  );
  const mapLayers = useMemo<TimelineMapLayer[]>(() => {
    const seenDatasetUris = new Set<string>();
    const layers: TimelineMapLayer[] = [];

    for (const entry of entryListItems) {
      for (const layer of entry.mapLayers) {
        if (seenDatasetUris.has(layer.datasetUri)) continue;
        seenDatasetUris.add(layer.datasetUri);
        layers.push(layer);
      }
    }

    return layers;
  }, [entryListItems]);
  const counts = useMemo(() => getTimelineFilterCounts(entryModels), [entryModels]);
  const filteredEntries = useMemo(
    () => getFilteredTimelineEntries(entryListItems, activeFilter),
    [activeFilter, entryListItems],
  );
  const { totalPages, safePage, visibleItems } = useMemo(
    () => paginateTimelineEntries(filteredEntries, currentPage, pageSize),
    [currentPage, filteredEntries, pageSize],
  );
  const previewActive = previewMode && !showAll;
  const safePreviewLimit = Math.max(1, previewLimit);
  const previewEntries = previewActive ? entryListItems.slice(0, safePreviewLimit) : entryListItems;
  const hiddenCount = entries.length - previewEntries.length;

  function handleFilterChange(filter: TimelineEvidenceFilter) {
    setActiveFilter(filter);
    setCurrentPage(1);
  }

  const filterLabels: Record<TimelineEvidenceFilter, string> = {
    all: timelineT("filters.all"),
    tree: timelineT("filters.tree"),
    audio: timelineT("filters.audio"),
    nature: timelineT("filters.biodiversity"),
    file: timelineT("filters.file"),
  };

  return (
    <TimelineViewerStoreProvider>
      <section className="space-y-4" aria-labelledby="timeline-heading">
      <div className="rounded-2xl border border-border/50 bg-background p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2
              id="timeline-heading"
              className={cn(
                "text-foreground",
                // Match the org profile's other section headings (About, Data
                // Council) so the digest reads coherently; keep the plain style
                // on the per-activity cert/project timelines.
                summaryScope === "organization"
                  ? "font-instrument text-2xl italic leading-none"
                  : "text-2xl tracking-tight",
              )}
            >
              {timelineT(summaryScope === "organization" ? "orgTitle" : "linkedTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {timelineT(summaryScope === "organization" ? "orgItemCount" : "linkedItemCount", { count: entries.length })}
              {linkedWindow
                ? summaryScope === "organization"
                  ? ` · ${linkedWindow}`
                  : ` · ${timelineT("linked", { window: linkedWindow })}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {timelineT(summaryScope === "organization" ? "orgDescription" : "linkedDescription")}
            </p>
          </div>
          {linkedWindow && summaryScope !== "organization" ? (
            <p className="text-xs text-muted-foreground">
              {timelineT("linkedWindow", { window: linkedWindow })}
            </p>
          ) : null}
        </div>

        {previewMode ? null : (
          <div className="mt-4 flex flex-wrap gap-2">
            {TIMELINE_EVIDENCE_FILTERS.map((filter) => {
              const isActive = activeFilter === filter.id;
              const count = counts.get(filter.id) ?? 0;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleFilterChange(filter.id)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {filterLabels[filter.id]}
                  {filter.id !== "all" && count > 0 ? ` ${count}` : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {previewMode ? null : (
        <TimelineGreenGlobePreview
          organizationDid={organizationDid}
          layers={mapLayers}
          isLoading={false}
        />
      )}

      {entries.length === 0 ? (
        <TimelineEmpty />
      ) : previewMode ? (
        <>
          <TimelineEntryList
            entries={previewEntries}
            canManageEvidence={canManageEvidence}
            canDeleteEvidence={deletePermission.allowed}
            deleteDisabledReason={deletePermission.reason}
            mutationRepo={mutationRepo}
            onDeleted={onDeleted}
          />
          {previewActive && hiddenCount > 0 ? (
            <div className="flex justify-center pt-1">
              {seeMoreHref ? (
                <Link
                  href={seeMoreHref}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {timelineT("seeMore", { count: hiddenCount })}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {timelineT("seeMore", { count: hiddenCount })}
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
          {timelineT("emptyFiltered")}
        </div>
      ) : (
        <>
          <TimelineEntryList
            entries={visibleItems}
            canManageEvidence={canManageEvidence}
            canDeleteEvidence={deletePermission.allowed}
            deleteDisabledReason={deletePermission.reason}
            mutationRepo={mutationRepo}
            onDeleted={onDeleted}
          />
          {totalPages > 1 ? (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                {timelineT("pageOf", { current: safePage, total: totalPages })}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                  disabled={safePage <= 1}
                  aria-label={timelineT("previousPage")}
                >
                  <ChevronLeftIcon />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage >= totalPages}
                  aria-label={timelineT("nextPage")}
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
      </section>
    </TimelineViewerStoreProvider>
  );
}
