"use client";

import { useMemo, useState } from "react";
import { TreesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  ManagedLocation,
  OccurrenceRecord,
  UploadTreeDatasetRecord,
} from "@/app/_lib/indexer";
import {
  buildDatasetSiteContexts,
  getDatasetSiteContext,
  groupDatasetUrisBySite,
  type DatasetSiteContext,
} from "../datasetSiteContext";
import {
  buildSelectableTreeDatasetUris,
  getTreeDatasetSelectionState,
  type DatasetSelectionDisabledReason,
} from "../datasetEvidenceSelection";
import type { AttachmentDraft } from "../contextAttachmentMutations";
import {
  getOccurrenceDatasetRef,
  hasTreeDatasetMetadata,
  isTreeDatasetOccurrence,
} from "../treeEvidenceClassification";
import { getTreeGroupStats } from "../timelineReferences";
import { CheckRow } from "./CheckRow";
import { ListLayout, ManageLink, PickerEmpty } from "./ListHelpers";
import { SubmitButton } from "./SubmitButton";
import {
  CONTENT_TYPE_TREE_DATASET,
  type EvidenceSubmitter,
} from "./types";

export function TreeEvidencePicker({
  data,
  occurrences,
  places,
  linkedTreeGroups,
  timelineAttachmentsUnavailable,
  occurrenceCoverageIncomplete,
  caption,
  captionTitle,
  isSubmitting,
  submitDrafts,
}: {
  data: UploadTreeDatasetRecord[];
  occurrences: OccurrenceRecord[];
  places: ManagedLocation[];
  linkedTreeGroups: ReadonlySet<string>;
  timelineAttachmentsUnavailable: boolean;
  occurrenceCoverageIncomplete: boolean;
  caption: string;
  captionTitle: string | null;
  isSubmitting: boolean;
  submitDrafts: EvidenceSubmitter;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const treeDatasetMetadataUris = useMemo(
    () => new Set(data.filter(hasTreeDatasetMetadata).map((item) => item.uri)),
    [data],
  );
  const treeOccurrences = useMemo(
    () =>
      occurrences.filter((occurrence) =>
        isTreeDatasetOccurrence(occurrence, {
          treeDatasetUrisWithMetadata: treeDatasetMetadataUris,
        }),
      ),
    [occurrences, treeDatasetMetadataUris],
  );
  const treeDatasetUris = useMemo(
    () =>
      new Set(
        treeOccurrences
          .map(getOccurrenceDatasetRef)
          .filter((uri): uri is string => Boolean(uri)),
      ),
    [treeOccurrences],
  );
  const rows = useMemo(
    () =>
      data.filter(
        (item) =>
          item.uri &&
          (hasTreeDatasetMetadata(item) || treeDatasetUris.has(item.uri)),
      ),
    [data, treeDatasetUris],
  );
  const siteContextsByDataset = useMemo(
    () =>
      buildDatasetSiteContexts({
        occurrences: treeOccurrences.flatMap((occurrence) => {
          const datasetUri = getOccurrenceDatasetRef(occurrence);
          return datasetUri
            ? [{ datasetUri, siteRef: occurrence.siteRef }]
            : [];
        }),
        locations: places,
      }),
    [treeOccurrences, places],
  );
  const selectableUris = useMemo(
    () =>
      buildSelectableTreeDatasetUris({
        rows,
        siteContextsByDataset,
        linkedDatasetUris: linkedTreeGroups,
        timelineAttachmentsUnavailable,
        siteContextsUnavailable: occurrenceCoverageIncomplete,
      }),
    [
      linkedTreeGroups,
      occurrenceCoverageIncomplete,
      rows,
      siteContextsByDataset,
      timelineAttachmentsUnavailable,
    ],
  );
  const selectedDatasetUris = Array.from(selected).filter((uri) =>
    selectableUris.has(uri),
  );
  const groupedSelections = groupDatasetUrisBySite({
    datasetUris: selectedDatasetUris,
    contexts: siteContextsByDataset,
  });
  const drafts = groupedSelections.map(
    (group) =>
      ({
        title: captionTitle ?? evidenceT("attachmentTitles.trees"),
        contentType: CONTENT_TYPE_TREE_DATASET,
        contents: group.datasetUris,
        note: caption,
        contextualSubjects: [group.siteSubject],
      }) satisfies AttachmentDraft,
  );

  function siteContextLabel(context: DatasetSiteContext): string {
    if (context.status === "ready") {
      return context.siteName
        ? evidenceT("siteContextLabel", { siteName: context.siteName })
        : evidenceT("siteContextReady");
    }
    if (context.status === "mixed-site-refs") return evidenceT("siteContextMixed");
    if (context.status === "incomplete-site-ref") return evidenceT("siteContextIncomplete");
    if (context.status === "unresolved-site") return evidenceT("siteContextUnresolved");
    return evidenceT("siteContextUnavailable");
  }

  function disabledReasonLabel(
    reason: DatasetSelectionDisabledReason | null,
    context: DatasetSiteContext,
  ): string | null {
    if (reason === "already-linked") return evidenceT("alreadyLinkedDataset");
    if (reason === "checking-existing-links") return evidenceT("checkingExistingLinks");
    if (reason === "unable-to-verify-existing-links") {
      return evidenceT("unableToVerifyExistingLinks");
    }
    if (reason === "unable-to-verify-site-context") {
      return evidenceT("unableToVerifyTreeSiteContext");
    }
    if (reason) return siteContextLabel(context);
    return null;
  }

  function toggle(uri: string) {
    if (!selectableUris.has(uri)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }

  if (rows.length === 0) {
    return <PickerEmpty label={evidenceT("emptyLabels.trees")} href="/manage/trees" />;
  }

  return (
    <>
      <ListLayout>
        {rows.map((item) => {
          const stats = getTreeGroupStats(item.uri, treeOccurrences);
          const siteContext = getDatasetSiteContext(siteContextsByDataset, item.uri);
          const selectionState = getTreeDatasetSelectionState({
            uri: item.uri,
            siteContext,
            linkedDatasetUris: linkedTreeGroups,
            timelineAttachmentsUnavailable,
            siteContextsUnavailable: occurrenceCoverageIncomplete,
          });
          const status = disabledReasonLabel(
            selectionState.disabledReason,
            siteContext,
          );
          const secondary = [
            evidenceT("treeCount", { count: stats.itemCount || item.recordCount || 0 }),
            stats.speciesCount > 0
              ? evidenceT("speciesCount", { count: stats.speciesCount })
              : null,
            stats.dateRange,
            siteContext.status === "ready" ? siteContextLabel(siteContext) : null,
          ]
            .filter((value): value is string => Boolean(value))
            .join(" · ");

          return (
            <CheckRow
              key={item.uri}
              selected={selectionState.canSelect && selected.has(item.uri)}
              onToggle={() => toggle(item.uri)}
              icon={TreesIcon}
              primary={item.name || evidenceT("unnamedTreeDataset")}
              secondary={secondary}
              status={status ?? undefined}
              disabled={isSubmitting || !selectionState.canSelect}
            />
          );
        })}
      </ListLayout>
      <ManageLink
        href="/manage/trees"
        label={evidenceT("manageType", { type: evidenceT("emptyLabels.trees") })}
      />
      <SubmitButton
        count={selectedDatasetUris.length}
        isSubmitting={isSubmitting}
        onClick={() =>
          submitDrafts(drafts, () => {
            setSelected(new Set());
          })
        }
      />
    </>
  );
}
