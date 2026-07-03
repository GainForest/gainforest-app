"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  FileTextIcon,
  LeafIcon,
  Loader2Icon,
  MicIcon,
  TreesIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { OccurrenceRecord, TimelineAttachmentItem } from "@/app/_lib/indexer";
import {
  fetchAudioByDid,
  fetchLocationsByDid,
  fetchOccurrencesByDid,
  fetchTreeDatasetsByDid,
} from "@/app/_lib/indexer";
import { Button } from "@/components/ui/button";
import {
  ATTACHMENT_MAX_FILE_BYTES,
  createContextAttachment,
  isAttachmentMutationInputError,
  type AttachmentDraft,
} from "../contextAttachmentMutations";
import { formatFileSize } from "./fileUtils";
import { getLinkedNatureUris, getLinkedTreeGroupUris } from "./linkedEvidence";
import { AudioEvidencePicker } from "./AudioEvidencePicker";
import { TreeEvidencePicker } from "./TreeEvidencePicker";
import { NatureEvidencePicker } from "./NatureEvidencePicker";
import { NatureCsvUpload } from "./NatureCsvUpload";
import { FileEvidencePicker } from "./FileEvidencePicker";
import {
  hasTimelineSourceData,
  type EvidenceTab,
  type TimelineMutationPermission,
  type TimelineSourceData,
  type TimelineSourceStatus,
} from "./types";

export type { TimelineMutationPermission, TimelineSourceData } from "./types";

const EVIDENCE_TABS: Array<{ id: EvidenceTab; icon: LucideIcon }> = [
  { id: "audio", icon: MicIcon },
  { id: "trees", icon: TreesIcon },
  { id: "nature", icon: LeafIcon },
  { id: "files", icon: FileTextIcon },
];

export function EvidenceAdder({
  organizationDid,
  activityUri,
  activityCid,
  sources,
  entries,
  attachmentsUnavailable,
  createPermission,
  mutationRepo,
  onCreated,
  onChanged,
}: {
  organizationDid: string;
  activityUri: string;
  activityCid: string;
  sources: TimelineSourceData;
  entries: TimelineAttachmentItem[];
  attachmentsUnavailable: boolean;
  createPermission: TimelineMutationPermission;
  mutationRepo?: string;
  onCreated: (entry: TimelineAttachmentItem) => void;
  onChanged: () => void;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const [activeTab, setActiveTab] = useState<EvidenceTab | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceState, setSourceState] = useState<{
    status: TimelineSourceStatus;
    data: TimelineSourceData;
  }>(() => ({
    status: hasTimelineSourceData(sources) ? "ready" : "idle",
    data: sources,
  }));
  const linkedTreeGroups = useMemo(() => getLinkedTreeGroupUris(entries), [entries]);
  const linkedNatureUris = useMemo(() => getLinkedNatureUris(entries), [entries]);
  const tabLabels: Record<EvidenceTab, string> = {
    audio: evidenceT("tabs.audio"),
    trees: evidenceT("tabs.trees"),
    nature: evidenceT("tabs.biodiversity"),
    files: evidenceT("tabs.files"),
  };
  const tabDescriptions: Record<EvidenceTab, string> = {
    audio: evidenceT("tabDescriptions.audio"),
    trees: evidenceT("tabDescriptions.trees"),
    nature: evidenceT("tabDescriptions.biodiversity"),
    files: evidenceT("tabDescriptions.files"),
  };

  useEffect(() => {
    if (activeTab === null || activeTab === "files" || sourceState.status !== "idle") {
      return;
    }

    setSourceState((current) =>
      current.status === "idle" ? { ...current, status: "loading" } : current,
    );
  }, [activeTab, sourceState.status]);

  useEffect(() => {
    if (sourceState.status !== "loading") {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    Promise.all([
      fetchAudioByDid(organizationDid, controller.signal).catch(() => []),
      fetchOccurrencesByDid(organizationDid, 10000, null, controller.signal).catch(() => ({
        records: [] as OccurrenceRecord[],
        cursor: null,
        hasMore: true,
      })),
      fetchTreeDatasetsByDid(organizationDid, controller.signal).catch(() => []),
      fetchLocationsByDid(organizationDid, controller.signal).catch(() => []),
    ])
      .then(([audio, occurrencePage, treeGroups, places]) => {
        if (cancelled) return;
        setSourceState({
          status: "ready",
          data: {
            audio,
            occurrences: occurrencePage.records,
            occurrencesIncomplete: occurrencePage.hasMore,
            treeGroups,
            places,
          },
        });
      })
      .catch((err) => {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) return;
        setSourceState((current) => ({ ...current, status: "error" }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [organizationDid, sourceState.status]);

  function mutationErrorMessage(error: unknown): string {
    if (!isAttachmentMutationInputError(error)) {
      console.error("Unable to link timeline evidence", error);
      return evidenceT("linkError");
    }

    switch (error.code) {
      case "file-too-large":
        return evidenceT("validation.fileTooLarge", {
          maxSize: formatFileSize(ATTACHMENT_MAX_FILE_BYTES),
        });
      case "file-type-not-allowed":
        return evidenceT("validation.fileTypeNotAllowed");
      case "invalid-link":
        return evidenceT("invalidUrl");
      case "too-many-items":
        return evidenceT("validation.tooManyItems");
      case "invalid-activity":
        return evidenceT("incompleteBumicertReference");
      case "invalid-context":
        return evidenceT("validation.invalidContext");
      default:
        return evidenceT("linkError");
    }
  }

  async function submitDrafts(
    drafts: AttachmentDraft | AttachmentDraft[],
    onSuccess?: () => void,
  ) {
    const items = (Array.isArray(drafts) ? drafts : [drafts]).filter(
      (draft) => draft.contents.length > 0,
    );
    if (items.length === 0) return;

    if (!createPermission.allowed) {
      setError(createPermission.reason ?? evidenceT("permissions.createDenied"));
      return;
    }

    if (!activityCid) {
      setError(evidenceT("incompleteBumicertReference"));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const created: TimelineAttachmentItem[] = [];
    const activitySubject = { uri: activityUri, cid: activityCid };

    try {
      for (const draft of items) {
        const result = await createContextAttachment({
          draft,
          activitySubject,
          organizationDid,
          repo: mutationRepo,
        });
        created.push(result.optimisticItem);
        onCreated(result.optimisticItem);
      }
      if (created.length > 0) onChanged();
      onSuccess?.();
    } catch (err) {
      const message = mutationErrorMessage(err);
      if (created.length > 0) {
        setError(
          evidenceT("partialLinkSuccess", {
            createdCount: created.length,
            totalCount: items.length,
            error: message,
          }),
        );
        onChanged();
        onSuccess?.();
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (activeTab === null) {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <h2 id="link-evidence-heading" className="text-2xl tracking-tight text-foreground">
            {evidenceT("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {evidenceT("selectSourceToLink")}
          </p>
        </div>
        {!createPermission.allowed ? (
          <p className="rounded-xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">
            {createPermission.reason ?? evidenceT("permissions.createDenied")}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {EVIDENCE_TABS.map(({ id, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveTab(id)}
              disabled={!createPermission.allowed}
              title={
                !createPermission.allowed
                  ? createPermission.reason ?? evidenceT("permissions.createDenied")
                  : tabDescriptions[id]
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {tabLabels[id]}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const activeConfig = EVIDENCE_TABS.find((tab) => tab.id === activeTab)!;
  const activeTabNeedsSources = activeTab !== "files";
  const activeSources = sourceState.data;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          disabled={isSubmitting}
          aria-label={evidenceT("backToEvidenceTypes")}
          onClick={() => setActiveTab(null)}
        >
          <ChevronLeftIcon />
        </Button>
        <div className="flex flex-col">
          <h2 id="link-evidence-heading" className="text-2xl tracking-tight text-foreground">
            {evidenceT("linkType", { type: tabLabels[activeConfig.id] })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {evidenceT("selectRecordsToLink")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {activeTabNeedsSources && sourceState.status === "loading" ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            {evidenceT("loadingSources")}
          </div>
        ) : null}
        {activeTabNeedsSources && sourceState.status === "error" ? (
          <p className="rounded-xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">
            {evidenceT("sourcesLoadError")}
          </p>
        ) : null}
        {sourceState.status === "ready" && activeTab === "audio" ? (
          <AudioEvidencePicker
            data={activeSources.audio}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {sourceState.status === "ready" && activeTab === "trees" ? (
          <TreeEvidencePicker
            data={activeSources.treeGroups}
            occurrences={activeSources.occurrences}
            places={activeSources.places}
            linkedTreeGroups={linkedTreeGroups}
            timelineAttachmentsUnavailable={attachmentsUnavailable}
            occurrenceCoverageIncomplete={activeSources.occurrencesIncomplete}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {activeTab === "nature" ? (
          <NatureCsvUpload isSubmitting={isSubmitting} submitDrafts={submitDrafts} />
        ) : null}
        {sourceState.status === "ready" && activeTab === "nature" ? (
          <NatureEvidencePicker
            occurrences={activeSources.occurrences}
            datasets={activeSources.treeGroups}
            linkedUris={linkedNatureUris}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {activeTab === "files" ? (
          <FileEvidencePicker
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
