"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BinocularsIcon,
  ChevronLeftIcon,
  FileTextIcon,
  ImageIcon,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { ImageEvidencePicker } from "./ImageEvidencePicker";
import {
  hasTimelineSourceData,
  type EvidenceTab,
  type TimelineMutationPermission,
  type TimelineSourceData,
  type TimelineSourceStatus,
} from "./types";

export type { TimelineMutationPermission, TimelineSourceData } from "./types";

const EVIDENCE_TABS: Array<{ id: EvidenceTab; icon: LucideIcon }> = [
  { id: "image", icon: ImageIcon },
  { id: "audio", icon: MicIcon },
  { id: "trees", icon: TreesIcon },
  { id: "nature", icon: BinocularsIcon },
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
  const [caption, setCaption] = useState("");
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
    image: evidenceT("tabs.images"),
    audio: evidenceT("tabs.audio"),
    trees: evidenceT("tabs.trees"),
    nature: evidenceT("tabs.biodiversity"),
    files: evidenceT("tabs.files"),
  };
  useEffect(() => {
    if (activeTab === null || activeTab === "image" || activeTab === "files" || sourceState.status !== "idle") {
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

  function titleFromCaption(value: string): string {
    const singleLine = value.trim().replace(/\s+/g, " ");
    if (!singleLine) return evidenceT("updateTitleFallback");
    return singleLine.length > 80 ? `${singleLine.slice(0, 77)}…` : singleLine;
  }

  async function submitDrafts(
    drafts: AttachmentDraft | AttachmentDraft[],
    onSuccess?: () => void,
  ) {
    const items = (Array.isArray(drafts) ? drafts : [drafts]).filter(
      (draft) => draft.contents.length > 0 || Boolean(draft.note?.trim()),
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
      setCaption("");
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
        setCaption("");
        onSuccess?.();
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function postTextUpdate() {
    const note = caption.trim();
    if (!note) return;
    submitDrafts({
      title: titleFromCaption(note),
      contentType: "update",
      contents: [],
      note,
    });
  }

  const activeConfig = activeTab ? EVIDENCE_TABS.find((tab) => tab.id === activeTab)! : null;
  const captionTitle = caption.trim() ? titleFromCaption(caption) : null;
  const activeTabNeedsSources = activeTab !== null && activeTab !== "image" && activeTab !== "files";
  const activeSources = sourceState.data;

  function renderAttachmentPanel() {
    if (activeTab === null) return null;

    return (
      <div className="flex flex-col gap-2">
        {activeTabNeedsSources && sourceState.status === "loading" ? (
          <div className="flex items-center gap-2 rounded-xl bg-background/70 px-3 py-4 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            {evidenceT("loadingSources")}
          </div>
        ) : null}
        {activeTabNeedsSources && sourceState.status === "error" ? (
          <p className="rounded-xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">
            {evidenceT("sourcesLoadError")}
          </p>
        ) : null}
        {activeTab === "image" ? (
          <ImageEvidencePicker
            caption={caption}
            captionTitle={captionTitle}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {sourceState.status === "ready" && activeTab === "audio" ? (
          <AudioEvidencePicker
            data={activeSources.audio}
            caption={caption}
            captionTitle={captionTitle}
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
            caption={caption}
            captionTitle={captionTitle}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {activeTab === "nature" ? (
          <NatureCsvUpload
            caption={caption}
            captionTitle={captionTitle}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {sourceState.status === "ready" && activeTab === "nature" ? (
          <NatureEvidencePicker
            occurrences={activeSources.occurrences}
            datasets={activeSources.treeGroups}
            linkedUris={linkedNatureUris}
            caption={caption}
            captionTitle={captionTitle}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {activeTab === "files" ? (
          <FileEvidencePicker
            caption={caption}
            captionTitle={captionTitle}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 id="link-evidence-heading" className="sr-only">
        {evidenceT("title")}
      </h2>
      {!createPermission.allowed ? (
        <p className="rounded-xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">
          {createPermission.reason ?? evidenceT("permissions.createDenied")}
        </p>
      ) : null}
      <motion.div
        layout
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        className="overflow-hidden rounded-xl border border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      >
        <Textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          disabled={isSubmitting || !createPermission.allowed}
          placeholder={evidenceT("captionPlaceholder")}
          className="min-h-28 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex flex-col gap-2 border-t border-border/60 px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
          <TooltipProvider delayDuration={150}>
            <div className="flex flex-wrap items-center gap-1">
              {EVIDENCE_TABS.map(({ id, icon: Icon }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={activeTab === id ? "secondary" : "ghost"}
                      size="icon-sm"
                      onClick={() => setActiveTab(id)}
                      disabled={!createPermission.allowed}
                      aria-label={tabLabels[id]}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{tabLabels[id]}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
          <Button
            type="button"
            onClick={postTextUpdate}
            disabled={isSubmitting || !createPermission.allowed || caption.trim().length === 0}
            className="w-full sm:w-fit"
          >
            {isSubmitting ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
            {evidenceT("postUpdate")}
          </Button>
        </div>
        <AnimatePresence initial={false} mode="wait">
          {activeTab ? (
            <motion.div
              key={activeTab}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden border-t border-border/60"
            >
              <div className="bg-muted p-3">
                <div className="mb-3 flex items-center gap-2">
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
                  <p className="text-sm text-muted-foreground">
                    {evidenceT("attachingType", { type: tabLabels[activeConfig!.id] })}
                  </p>
                </div>
                {renderAttachmentPanel()}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {error ? (
          <p className="border-t border-border/60 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
