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
  MusicIcon,
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
import { leafletDocumentHasText } from "@/app/_lib/leaflet-richtext";
import {
  EMPTY_RICH_TEXT_VALUE,
  RichTextEditor,
  type RichTextEditorLabels,
  type RichTextValue,
} from "@/app/_components/RichTextEditor";
import { Button } from "@/components/ui/button";
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
import { SoundscapeEvidencePicker } from "./SoundscapeEvidencePicker";
import { hasPublishedSoundscapes } from "@/app/_lib/soundscape-record";
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
  { id: "soundscape", icon: MusicIcon },
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
  createAttachment = createContextAttachment,
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
  /** Mockable seam for the `/_test` registry — production always uses the
   *  real `createContextAttachment` default. */
  createAttachment?: typeof createContextAttachment;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const [activeTab, setActiveTab] = useState<EvidenceTab | null>(null);
  // A soundscape is only worth offering when this account has published one;
  // a project with no recordings behind it never grows the extra button.
  const [soundscapesAvailable, setSoundscapesAvailable] = useState(false);
  // The caption lives in the WYSIWYG editor as a Leaflet document; the editor
  // is uncontrolled, so bumping `editorKey` is how a posted draft is cleared.
  const [richText, setRichText] = useState<RichTextValue>(EMPTY_RICH_TEXT_VALUE);
  const [editorKey, setEditorKey] = useState(0);
  // The update's title is asked for, never inferred from the body. Blank
  // falls back to a generic label — body text is never copied into it.
  const [title, setTitle] = useState("");
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
    soundscape: evidenceT("tabs.soundscape"),
    trees: evidenceT("tabs.trees"),
    nature: evidenceT("tabs.biodiversity"),
    files: evidenceT("tabs.files"),
  };
  const editorLabels: RichTextEditorLabels = {
    bold: evidenceT("editor.bold"),
    italic: evidenceT("editor.italic"),
    underline: evidenceT("editor.underline"),
    strikethrough: evidenceT("editor.strikethrough"),
    heading: evidenceT("editor.heading"),
    subheading: evidenceT("editor.subheading"),
    quote: evidenceT("editor.quote"),
    bulletedList: evidenceT("editor.bulletedList"),
    numberedList: evidenceT("editor.numberedList"),
    addLink: evidenceT("editor.addLink"),
    removeLink: evidenceT("editor.removeLink"),
    linkUrlPlaceholder: evidenceT("editor.linkUrlPlaceholder"),
    applyLink: evidenceT("editor.applyLink"),
    cancelLink: evidenceT("editor.cancelLink"),
  };
  // Image and file uploads need nothing from the account; the soundscape
  // picker reads its own list. The rest share one load of the org's evidence.
  const activeTabNeedsSources =
    activeTab !== null && activeTab !== "image" && activeTab !== "files" && activeTab !== "soundscape";

  useEffect(() => {
    const controller = new AbortController();
    setSoundscapesAvailable(false);
    hasPublishedSoundscapes(organizationDid, controller.signal)
      .then((available) => {
        if (!controller.signal.aborted) setSoundscapesAvailable(available);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [organizationDid]);

  useEffect(() => {
    if (!activeTabNeedsSources || sourceState.status !== "idle") {
      return;
    }

    setSourceState((current) =>
      current.status === "idle" ? { ...current, status: "loading" } : current,
    );
  }, [activeTabNeedsSources, sourceState.status]);

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
      (draft) =>
        draft.contents.length > 0 ||
        Boolean(draft.note?.trim()) ||
        leafletDocumentHasText(draft.textDocument),
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
        const result = await createAttachment({
          draft,
          activitySubject,
          organizationDid,
          repo: mutationRepo,
        });
        created.push(result.optimisticItem);
        onCreated(result.optimisticItem);
      }
      if (created.length > 0) onChanged();
      clearCaption();
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
        clearCaption();
        onSuccess?.();
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearCaption() {
    setRichText(EMPTY_RICH_TEXT_VALUE);
    setEditorKey((value) => value + 1);
    setTitle("");
  }

  function postTextUpdate() {
    if (!leafletDocumentHasText(richText.document)) return;
    submitDrafts({
      title: captionTitle ?? evidenceT("updateTitleFallback"),
      contentType: "update",
      contents: [],
      textDocument: richText.document,
    });
  }

  const visibleTabs = EVIDENCE_TABS.filter(
    (tab) => tab.id !== "soundscape" || soundscapesAvailable,
  );
  const activeConfig = activeTab ? EVIDENCE_TABS.find((tab) => tab.id === activeTab)! : null;
  const caption = richText.plaintext;
  const captionDocument = richText.document;
  const captionTitle = title.trim().replace(/\s+/g, " ") || null;
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
            captionDocument={captionDocument}
            captionTitle={captionTitle}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {sourceState.status === "ready" && activeTab === "audio" ? (
          <AudioEvidencePicker
            data={activeSources.audio}
            caption={caption}
            captionDocument={captionDocument}
            captionTitle={captionTitle}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {activeTab === "soundscape" ? (
          <SoundscapeEvidencePicker
            organizationDid={organizationDid}
            caption={caption}
            captionDocument={captionDocument}
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
            captionDocument={captionDocument}
            captionTitle={captionTitle}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {activeTab === "nature" ? (
          <NatureCsvUpload
            caption={caption}
            captionDocument={captionDocument}
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
            captionDocument={captionDocument}
            captionTitle={captionTitle}
            isSubmitting={isSubmitting}
            submitDrafts={submitDrafts}
          />
        ) : null}
        {activeTab === "files" ? (
          <FileEvidencePicker
            caption={caption}
            captionDocument={captionDocument}
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
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={isSubmitting || !createPermission.allowed}
          placeholder={evidenceT("titlePlaceholder")}
          aria-label={evidenceT("titlePlaceholder")}
          maxLength={256}
          className="w-full border-b border-border/60 bg-transparent px-3 py-2.5 text-base font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
        <RichTextEditor
          key={editorKey}
          labels={editorLabels}
          disabled={isSubmitting || !createPermission.allowed}
          placeholder={evidenceT("captionPlaceholder")}
          aria-label={evidenceT("title")}
          onChange={setRichText}
        />
        <div className="flex flex-col gap-2 border-t border-border/60 px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
          <TooltipProvider delayDuration={150}>
            <div className="flex flex-wrap items-center gap-1">
              {visibleTabs.map(({ id, icon: Icon }) => (
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
          {/* While a picker is open it owns the submit button, so hide this one
              to avoid two "Post update" buttons competing. */}
          {activeTab === null ? (
            <Button
              type="button"
              onClick={postTextUpdate}
              disabled={isSubmitting || !createPermission.allowed || !leafletDocumentHasText(richText.document)}
              className="w-full sm:w-fit"
            >
              {isSubmitting ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
              {evidenceT("postUpdate")}
            </Button>
          ) : null}
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
