"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { DatabaseIcon, LeafIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OccurrenceRecord, UploadTreeDatasetRecord } from "@/app/_lib/indexer";
import { formatDate } from "@/app/_lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AttachmentDraft } from "../contextAttachmentMutations";
import {
  getOccurrenceDatasetRef,
  hasTreeDatasetMetadata,
  isTreeDatasetOccurrence,
} from "../treeEvidenceClassification";
import { CheckRow } from "./CheckRow";
import { ManageLink, PickerEmpty } from "./ListHelpers";
import { OptionalNote } from "./OptionalNote";
import { SubmitButton } from "./SubmitButton";
import {
  buildNatureDatasetGroups,
  formatRecorderSummary,
  getSafeRecorderDisplayName,
  matchesRecordedBy,
  occurrenceSearchText,
  occurrenceTitle,
  uniqueRecordedByValues,
} from "./natureEvidenceSelection";
import {
  CONTENT_TYPE_NATURE,
  CONTENT_TYPE_NATURE_DATASET,
  type EvidenceSubmitter,
} from "./types";

const ALL_RECORDERS_VALUE = "__all_recorders__";

export function NatureEvidencePicker({
  occurrences,
  datasets,
  linkedUris,
  isSubmitting,
  submitDrafts,
}: {
  occurrences: OccurrenceRecord[];
  datasets: UploadTreeDatasetRecord[];
  linkedUris: ReadonlySet<string>;
  isSubmitting: boolean;
  submitDrafts: EvidenceSubmitter;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const natureT = useTranslations("bumicert.detail.evidenceAdder.biodiversity");
  const [selectedOccurrences, setSelectedOccurrences] = useState<Set<string>>(new Set());
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set());
  const [recordedByFilter, setRecordedByFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [note, setNote] = useState("");
  const searchInputId = useId();
  const recorderLabelId = useId();
  const fallbackObservationName = evidenceT("unknownObservation");
  const treeDatasetMetadataUris = useMemo(
    () => new Set(datasets.filter(hasTreeDatasetMetadata).map((item) => item.uri)),
    [datasets],
  );
  const rows = useMemo(
    () =>
      occurrences.filter(
        (item) =>
          item.atUri &&
          !isTreeDatasetOccurrence(item, {
            treeDatasetUrisWithMetadata: treeDatasetMetadataUris,
          }),
      ),
    [occurrences, treeDatasetMetadataUris],
  );
  const natureDatasetRefs = useMemo(
    () =>
      new Set(
        rows
          .map(getOccurrenceDatasetRef)
          .filter((uri): uri is string => Boolean(uri)),
      ),
    [rows],
  );
  const natureDatasets = useMemo(
    () =>
      datasets.filter(
        (dataset) =>
          !hasTreeDatasetMetadata(dataset) || natureDatasetRefs.has(dataset.uri),
      ),
    [datasets, natureDatasetRefs],
  );
  const datasetGroups = useMemo(
    () =>
      buildNatureDatasetGroups(
        natureDatasets,
        rows,
        natureT("groupedNatureDataFallback"),
        fallbackObservationName,
      ),
    [fallbackObservationName, natureDatasets, natureT, rows],
  );
  const datasetByUri = useMemo(
    () => new Map(datasetGroups.map((group) => [group.uri, group])),
    [datasetGroups],
  );
  const datasetNameByUri = useMemo(
    () => new Map(datasetGroups.map((group) => [group.uri, group.name])),
    [datasetGroups],
  );
  const recordedByOptions = useMemo(() => uniqueRecordedByValues(rows), [rows]);
  const normalizedRecordedBy = recordedByFilter.trim().toLowerCase();
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const displayedRows = useMemo(
    () =>
      rows.filter((item) => {
        if (!matchesRecordedBy(item, normalizedRecordedBy)) return false;
        if (!normalizedSearch) return true;
        return occurrenceSearchText(
          item,
          item.datasetRef ? datasetNameByUri.get(item.datasetRef) : null,
          fallbackObservationName,
        ).includes(normalizedSearch);
      }),
    [datasetNameByUri, fallbackObservationName, normalizedRecordedBy, normalizedSearch, rows],
  );
  const displayedDatasets = useMemo(
    () =>
      datasetGroups
        .map((group) => {
          const groupDetailsMatch =
            !normalizedSearch || group.detailsSearchText.includes(normalizedSearch);
          const matchingRecords = group.records.filter((item) => {
            if (!matchesRecordedBy(item, normalizedRecordedBy)) return false;
            if (!normalizedSearch || groupDetailsMatch) return true;
            return occurrenceSearchText(item, group.name, fallbackObservationName).includes(
              normalizedSearch,
            );
          });
          return { ...group, groupDetailsMatch, matchingRecords };
        })
        .filter((group) => {
          if (group.matchingRecords.length > 0) return true;
          return !normalizedRecordedBy && group.groupDetailsMatch;
        }),
    [datasetGroups, fallbackObservationName, normalizedRecordedBy, normalizedSearch],
  );
  const linkedDatasetUris = useMemo(
    () => new Set(Array.from(linkedUris).filter((uri) => datasetByUri.has(uri))),
    [datasetByUri, linkedUris],
  );
  const selectedOrLinkedDatasetUris = useMemo(
    () => new Set([...linkedDatasetUris, ...selectedDatasets]),
    [linkedDatasetUris, selectedDatasets],
  );
  const isCoveredBySelectedOrLinkedDataset = useCallback(
    (item: OccurrenceRecord) =>
      Boolean(item.datasetRef && selectedOrLinkedDatasetUris.has(item.datasetRef)),
    [selectedOrLinkedDatasetUris],
  );
  const displayedRowUris = displayedRows
    .filter((item) => !isCoveredBySelectedOrLinkedDataset(item))
    .map((item) => item.atUri)
    .filter((uri): uri is string => Boolean(uri) && !linkedUris.has(uri));
  const allDisplayedSelected =
    displayedRowUris.length > 0 &&
    displayedRowUris.every((uri) => selectedOccurrences.has(uri));
  const selectableSelectedOccurrenceCount = Array.from(selectedOccurrences).filter(
    (uri) => {
      const item = rows.find((row) => row.atUri === uri);
      return item && !linkedUris.has(uri) && !isCoveredBySelectedOrLinkedDataset(item);
    },
  ).length;
  const selectedDatasetCount = Array.from(selectedDatasets).filter(
    (uri) => !linkedUris.has(uri),
  ).length;
  const selectedCount = selectableSelectedOccurrenceCount + selectedDatasetCount;

  function toggleOccurrence(uri: string) {
    if (linkedUris.has(uri)) return;
    const item = rows.find((row) => row.atUri === uri);
    if (item && isCoveredBySelectedOrLinkedDataset(item)) return;
    setSelectedOccurrences((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }

  function toggleDataset(uri: string) {
    if (linkedUris.has(uri)) return;
    const willSelect = !selectedDatasets.has(uri);
    setSelectedDatasets((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
    if (willSelect) {
      const memberUris = new Set(
        (datasetByUri.get(uri)?.records ?? [])
          .map((item) => item.atUri)
          .filter(Boolean),
      );
      setSelectedOccurrences((current) => {
        const next = new Set(current);
        for (const memberUri of memberUris) next.delete(memberUri);
        return next;
      });
    }
  }

  function toggleDisplayedRows() {
    setSelectedOccurrences((current) => {
      const next = new Set(current);
      if (allDisplayedSelected) {
        for (const uri of displayedRowUris) next.delete(uri);
      } else {
        for (const uri of displayedRowUris) next.add(uri);
      }
      return next;
    });
  }

  function submitSelection() {
    const datasetUris = Array.from(selectedDatasets).filter((uri) => !linkedUris.has(uri));
    const blockedDatasetUris = new Set([...linkedDatasetUris, ...datasetUris]);
    const occurrenceUris = Array.from(selectedOccurrences).filter((uri) => {
      if (linkedUris.has(uri)) return false;
      const item = rows.find((row) => row.atUri === uri);
      return item ? !item.datasetRef || !blockedDatasetUris.has(item.datasetRef) : true;
    });
    const datasetDrafts = datasetUris.flatMap((uri) => {
      const group = datasetByUri.get(uri);
      return [
        {
          title: group?.name ?? natureT("attachmentGroupTitle"),
          contentType: CONTENT_TYPE_NATURE_DATASET,
          contents: [uri],
          note,
        } satisfies AttachmentDraft,
      ];
    });
    const drafts = [
      ...datasetDrafts,
      ...(occurrenceUris.length > 0
        ? [
            {
              title: natureT("attachmentObservationsTitle"),
              contentType: CONTENT_TYPE_NATURE,
              contents: occurrenceUris,
              note,
            } satisfies AttachmentDraft,
          ]
        : []),
    ];
    submitDrafts(drafts, () => {
      setSelectedOccurrences(new Set());
      setSelectedDatasets(new Set());
      setNote("");
    });
  }

  if (rows.length === 0 && datasetGroups.length === 0) {
    return (
      <PickerEmpty
        label={natureT("emptyLabel")}
        href="/manage/observations"
        manageLabel={natureT("manageData")}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={searchInputId} className="text-sm font-medium">
              {natureT("searchLabel")}
            </label>
            <Input
              id={searchInputId}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              disabled={isSubmitting}
              placeholder={natureT("searchPlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span id={recorderLabelId} className="text-sm font-medium">
              {natureT("recorderLabel")}
            </span>
            <Select
              value={recordedByFilter || ALL_RECORDERS_VALUE}
              onValueChange={(value) =>
                setRecordedByFilter(value === ALL_RECORDERS_VALUE ? "" : value)
              }
              disabled={isSubmitting || recordedByOptions.length === 0}
            >
              <SelectTrigger aria-labelledby={recorderLabelId}>
                <SelectValue placeholder={natureT("allRecorders")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_RECORDERS_VALUE}>
                  {natureT("allRecorders")}
                </SelectItem>
                {recordedByOptions.map((recordedBy, index) => (
                  <SelectItem key={recordedBy} value={recordedBy}>
                    {getSafeRecorderDisplayName(recordedBy) ??
                      natureT("recorderOptionFallback", { number: index + 1 })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <section className="grid gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {natureT("displayedTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {natureT("displayedSummary", {
                  shown: displayedRows.length,
                  total: rows.length,
                })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleDisplayedRows}
              disabled={isSubmitting || displayedRowUris.length === 0}
            >
              {allDisplayedSelected
                ? natureT("clearDisplayed")
                : natureT("selectDisplayed")}
            </Button>
          </div>
          {displayedRows.length === 0 ? (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
              {natureT("noDataMatches")}
            </p>
          ) : (
            <div className="grid max-h-[360px] gap-2 overflow-auto pr-1">
              {displayedRows.map((item) => {
                const title = occurrenceTitle(item, fallbackObservationName);
                const datasetName = item.datasetRef
                  ? datasetNameByUri.get(item.datasetRef) ?? item.datasetName
                  : item.datasetName;
                const secondary = [
                  item.kingdom,
                  formatDate(item.eventDate ?? item.createdAt),
                  item.locality,
                  item.recordedBy
                    ? natureT("recordedBy", {
                        name:
                          getSafeRecorderDisplayName(item.recordedBy) ??
                          natureT("recorderFallback"),
                      })
                    : null,
                  datasetName,
                ]
                  .filter((value): value is string => Boolean(value))
                  .join(" · ");
                const alreadyLinked = linkedUris.has(item.atUri);
                const coveredByDataset = isCoveredBySelectedOrLinkedDataset(item);

                return (
                  <CheckRow
                    key={item.atUri}
                    selected={
                      !alreadyLinked &&
                      !coveredByDataset &&
                      selectedOccurrences.has(item.atUri)
                    }
                    onToggle={() => toggleOccurrence(item.atUri)}
                    icon={LeafIcon}
                    primary={title}
                    secondary={secondary}
                    status={
                      alreadyLinked
                        ? natureT("alreadyLinked")
                        : coveredByDataset
                          ? natureT("coveredByGroup")
                          : undefined
                    }
                    disabled={isSubmitting || alreadyLinked || coveredByDataset}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-3">
          <p className="text-sm font-medium text-foreground">{natureT("groupsTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {natureT("groupsDescription")}
          </p>
          {displayedDatasets.length === 0 ? (
            <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
              {natureT("noGroupsMatch")}
            </p>
          ) : (
            <div className="grid gap-2">
              {displayedDatasets.map((group) => {
                const alreadyLinked = linkedUris.has(group.uri);
                const recorder = formatRecorderSummary(group.recordedByValues, {
                  fallback: natureT("recorderFallback"),
                  multiple: (count) => natureT("multipleRecorders", { count }),
                  firstAndMore: (name, count) =>
                    natureT("firstRecorderAndMore", { name, count }),
                });
                const secondary = [
                  natureT("shownCount", { count: group.matchingRecords.length }),
                  natureT("totalCount", { count: group.recordCount }),
                  group.speciesCount > 0
                    ? natureT("speciesCount", { count: group.speciesCount })
                    : null,
                  group.dateRange,
                  recorder ? natureT("recordedBy", { name: recorder }) : null,
                ]
                  .filter((value): value is string => Boolean(value))
                  .join(" · ");

                return (
                  <CheckRow
                    key={group.uri}
                    selected={!alreadyLinked && selectedDatasets.has(group.uri)}
                    onToggle={() => toggleDataset(group.uri)}
                    icon={DatabaseIcon}
                    primary={group.name}
                    secondary={secondary}
                    status={
                      alreadyLinked
                        ? natureT("alreadyLinked")
                        : natureT("groupStatus")
                    }
                    disabled={isSubmitting || alreadyLinked}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
      <ManageLink href="/manage/observations" label={natureT("manageData")} />
      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton count={selectedCount} isSubmitting={isSubmitting} onClick={submitSelection} />
    </>
  );
}
