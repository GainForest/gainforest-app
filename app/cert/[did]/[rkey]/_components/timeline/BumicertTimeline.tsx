"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  LeafIcon,
  Loader2Icon,
  MapPinnedIcon,
  MusicIcon,
  PaperclipIcon,
  Trash2Icon,
  TreesIcon,
  VideoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/app/_lib/format";
import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import { parseAtUri } from "./atUri";
import { parseAttachmentContent } from "./attachmentContentParser";
import { isAttachmentForActivity } from "./attachmentSubjects";
import {
  deleteContextAttachment,
  isAttachmentMutationInputError,
} from "./contextAttachmentMutations";
import {
  buildTimelineReferences,
  getTimelineReferenceUrisForEntry,
  type TimelineReference,
  type TimelineReferenceCopy,
} from "./timelineReferences";
import {
  EvidenceAdder,
  type TimelineMutationPermission,
  type TimelineSourceData,
} from "./EvidenceAdder";

const CONTENT_TYPE_TREE_DATASET = "tree-dataset";
const CONTENT_TYPE_BIODIVERSITY = "biodiversity";
const CONTENT_TYPE_BIODIVERSITY_DATASET = "biodiversity-dataset";
const PAGE_SIZE = 8;


type BumicertTimelineProps = {
  organizationDid: string;
  activityUri: string;
  activityCid: string;
  bumicertTitle: string;
  canManageEvidence: boolean;
  createPermission: TimelineMutationPermission;
  deletePermission: TimelineMutationPermission;
  mutationRepo?: string;
  initialEntries: TimelineAttachmentItem[];
  sources: TimelineSourceData;
  references?: TimelineReference[];
  attachmentsUnavailable: boolean;
};

type EvidenceKind = "all" | "tree" | "audio" | "nature" | "file" | "site" | "other";
type PreviewKind = "site" | "image" | "video" | "audio" | "pdf" | "document" | "link" | "text";
type PreviewPayload = {
  kind: PreviewKind;
  href: string;
  title: string;
  body?: string;
  mimeType?: string | null;
  fileName?: string | null;
};
type TileKind = "site" | "tree" | "nature" | "audio" | "image" | "video" | "pdf" | "file" | "link" | "item";
type TimelineTile = { id: string; kind: TileKind; title: string; caption: string; preview: PreviewPayload | null };

type TimelineTileCopy = {
  linkedNatureDataGroup: string;
  linkedNatureData: string;
  linkedFile: string;
  image: string;
  video: string;
  audio: string;
  pdf: string;
  document: string;
  linkedTreeInformation: string;
  linkedItem: string;
  linkedProjectPlace: string;
  linkedTreeGroup: string;
  linkedSound: string;
  groupedData: string;
};

type MetricCopy = {
  notSpecified: string;
  treeCount: (count: number) => string;
  speciesCount: (count: number) => string;
  natureSightingCount: (count: number) => string;
  dataGroupCount: (count: number) => string;
  recordingCount: (count: number) => string;
  itemCount: (count: number) => string;
};

const FILTERS: Array<{ id: Exclude<EvidenceKind, "site" | "other"> }> = [
  { id: "all" },
  { id: "tree" },
  { id: "audio" },
  { id: "nature" },
  { id: "file" },
];



function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}


function evidenceKind(contentType: string | null | undefined, content: unknown): EvidenceKind {
  const normalized = contentType?.trim().toLowerCase();
  if (normalized === "audio") return "audio";
  if (normalized === CONTENT_TYPE_TREE_DATASET || normalized === "occurrence") return "tree";
  if (normalized === CONTENT_TYPE_BIODIVERSITY || normalized === CONTENT_TYPE_BIODIVERSITY_DATASET) return "nature";
  if (["document", "report", "evidence", "testimonial", "methodology", "photo", "video", "certificate"].includes(normalized ?? "")) return "file";

  const parsed = parseAttachmentContent(content);
  if (parsed.some((item) => item.kind === "uri" && parseAtUri(item.uri)?.collection === "app.certified.location")) return "site";
  if (parsed.some((item) => item.kind === "uri" && parseAtUri(item.uri)?.collection === "app.gainforest.dwc.dataset")) return "tree";
  if (parsed.some((item) => item.kind === "uri" && parseAtUri(item.uri)?.collection === "app.gainforest.ac.audio")) return "audio";
  if (parsed.some((item) => item.kind === "uri" && parseAtUri(item.uri)?.collection === "app.gainforest.dwc.occurrence")) return "nature";
  if (parsed.some((item) => item.kind === "blob" || (item.kind === "uri" && isHttpUrl(item.uri)))) return "file";
  return "other";
}

function matchesFilter(kind: EvidenceKind, filter: EvidenceKind): boolean {
  if (filter === "all") return true;
  if (filter === "file") return kind === "file" || kind === "site" || kind === "other";
  return kind === filter;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLinkedWindow(entries: TimelineAttachmentItem[]): string | null {
  const dates = entries
    .map((entry) => parseDate(entry.record.createdAt ?? entry.metadata.createdAt))
    .filter((date): date is Date => date !== null);
  if (dates.length === 0) return null;
  const first = dates.reduce((current, next) => (next.getTime() < current.getTime() ? next : current));
  const last = dates.reduce((current, next) => (next.getTime() > current.getTime() ? next : current));
  if (first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth()) {
    return formatMonthYear(first);
  }
  return `${formatMonthYear(first)} – ${formatMonthYear(last)}`;
}

function fileNameFromHref(href: string, fallback: string): string {
  try {
    const parsed = new URL(href);
    const fileName = parsed.pathname.split("/").filter(Boolean).at(-1);
    return fileName && fileName !== "com.atproto.sync.getBlob" ? decodeURIComponent(fileName) : fallback;
  } catch {
    return fallback;
  }
}

function extensionFromHref(href: string, fileName?: string | null): string | null {
  const raw = fileName || href;
  const path = raw.split("?")[0]?.split("#")[0] ?? "";
  const name = path.split("/").filter(Boolean).at(-1);
  const ext = name?.split(".").at(-1)?.toLowerCase();
  return ext && ext !== name ? ext : null;
}

function previewFromHref(href: string, mimeType: string | null, copy: TimelineTileCopy, fileName?: string | null): PreviewPayload {
  const mime = mimeType?.toLowerCase() ?? "";
  const ext = extensionFromHref(href, fileName);
  const name = cleanText(fileName) ?? fileNameFromHref(href, copy.linkedFile);
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(ext ?? "")) return { kind: "image", href, title: copy.image, fileName: name, mimeType };
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v"].includes(ext ?? "")) return { kind: "video", href, title: copy.video, fileName: name, mimeType };
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "flac"].includes(ext ?? "")) return { kind: "audio", href, title: copy.audio, fileName: name, mimeType };
  if (mime === "application/pdf" || ext === "pdf") return { kind: "pdf", href, title: copy.pdf, fileName: name, mimeType };
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"].includes(ext ?? "")) return { kind: "document", href, title: copy.document, fileName: name, mimeType };
  return { kind: "link", href, title: name, fileName: name, mimeType };
}

function previewForReference(uri: string, reference: TimelineReference | undefined, copy: TimelineTileCopy): PreviewPayload | null {
  if (reference?.kind === "location" && reference.actionHref) return { kind: "site", href: reference.actionHref, title: reference.title, body: reference.description };
  if (reference?.kind === "tree") return { kind: "text", href: "", title: reference.title, body: reference.description ?? copy.linkedTreeInformation };
  if (reference?.kind === "biodiversityDataset") return { kind: "text", href: "", title: reference.title, body: reference.description ?? copy.linkedNatureDataGroup };
  if (reference?.kind === "audio" && reference.actionHref) return { kind: "audio", href: reference.actionHref, title: reference.title, body: reference.description };
  if (reference?.actionHref) return { kind: "link", href: reference.actionHref, title: reference.title, body: reference.description };
  if (reference) return { kind: "text", href: "", title: reference.title, body: reference.description ?? copy.linkedItem };
  const parsed = parseAtUri(uri);
  if (parsed?.collection === "app.certified.location") return { kind: "text", href: "", title: copy.linkedProjectPlace };
  if (parsed?.collection === "app.gainforest.dwc.dataset") return { kind: "text", href: "", title: copy.linkedTreeGroup };
  if (parsed?.collection === "app.gainforest.ac.audio") return { kind: "text", href: "", title: copy.linkedSound };
  return { kind: "text", href: "", title: copy.linkedItem };
}

function tileKindFromPreview(preview: PreviewPayload): TileKind {
  if (preview.kind === "site") return "site";
  if (preview.kind === "text") return "item";
  if (preview.kind === "document") return "file";
  if (preview.kind === "link") return "link";
  return preview.kind;
}

function buildTiles(entryId: string, content: unknown, references: TimelineReference[], copy: TimelineTileCopy): TimelineTile[] {
  const refs = new Map(references.map((ref) => [ref.id, ref]));
  const tiles: TimelineTile[] = [];
  parseAttachmentContent(content).forEach((item, index) => {
    const id = `${entryId}-${index}`;
    if (item.kind === "blob") {
      if (!item.uri) return;
      const fileName = item.name ?? item.cid;
      const preview = previewFromHref(item.uri, item.mimeType, copy, fileName);
      tiles.push({ id, kind: tileKindFromPreview(preview), title: preview.title, caption: preview.fileName ?? fileName ?? copy.linkedFile, preview });
      return;
    }
    if (item.kind !== "uri") return;
    if (isHttpUrl(item.uri)) {
      const preview = previewFromHref(item.uri, null, copy);
      tiles.push({ id, kind: tileKindFromPreview(preview), title: preview.title, caption: preview.fileName ?? item.uri, preview });
      return;
    }
    const reference = refs.get(item.uri);
    const preview = previewForReference(item.uri, reference, copy);
    const parsed = parseAtUri(item.uri);
    const kind: TileKind = reference?.kind === "tree" ? "tree" : reference?.kind === "occurrence" || reference?.kind === "biodiversityDataset" ? "nature" : reference?.kind === "audio" ? "audio" : reference?.kind === "location" ? "site" : "item";
    const title = reference?.title ?? (parsed?.collection === "app.gainforest.dwc.dataset" ? copy.groupedData : copy.linkedItem);
    tiles.push({ id, kind, title, caption: reference?.description ?? title, preview });
  });
  return tiles;
}

function getEntryId(item: TimelineAttachmentItem, index: number): string {
  return item.metadata.uri ?? `${item.metadata.rkey ?? "entry"}-${index}`;
}

function noteFromDescription(description: unknown): string | null {
  if (!description || typeof description !== "object") return null;
  const record = description as Record<string, unknown>;
  if (record.$type === "org.hypercerts.defs#descriptionString" && typeof record.value === "string") {
    return cleanText(record.value);
  }
  return null;
}

type EntryCopy = {
  kindLabels: Record<EvidenceKind, string>;
  natureObservationsFallback: string;
};

function kindLabel(kind: EvidenceKind, labels: Record<EvidenceKind, string>): string {
  return labels[kind] ?? labels.other;
}

function titleForEntry(item: TimelineAttachmentItem, kind: EvidenceKind, references: TimelineReference[], copy: EntryCopy): string {
  const explicit = cleanText(item.record.title);
  const treeRef = references.find((ref) => ref.kind === "tree");
  if (kind === "tree" && treeRef) return treeRef.title;
  if (kind === "nature") return explicit ?? copy.natureObservationsFallback;
  return explicit ?? kindLabel(kind, copy.kindLabels);
}

function recordedDateForEntry(kind: EvidenceKind, references: TimelineReference[], notSpecified: string): string {
  const referenceRange = references.find((ref) => ref.dateRange)?.dateRange;
  if (referenceRange) return referenceRange;
  const dates = references.map((ref) => ref.recordedAt).filter((value): value is string => Boolean(value));
  const range = formatDateRangeFromValues(dates);
  if (range) return range;
  if (kind === "audio") return formatDate(dates[0]) || notSpecified;
  return notSpecified;
}

function metricBadges(kind: EvidenceKind, references: TimelineReference[], tileCount: number, copy: MetricCopy): string[] {
  if (kind === "tree") {
    const treeCount = references.reduce((sum, ref) => sum + (ref.metrics?.treeCount ?? ref.metrics?.itemCount ?? 0), 0);
    const speciesCount = references.reduce((sum, ref) => sum + (ref.metrics?.speciesCount ?? 0), 0);
    return [treeCount > 0 ? copy.treeCount(treeCount) : null, speciesCount > 0 ? copy.speciesCount(speciesCount) : null].filter((value): value is string => Boolean(value));
  }
  if (kind === "nature") {
    const sightings = references.filter((ref) => ref.kind === "occurrence");
    const datasets = references.filter((ref) => ref.kind === "biodiversityDataset");
    const datasetSightingCount = datasets.reduce((sum, ref) => sum + (ref.metrics?.itemCount ?? 0), 0);
    const sightingCount = sightings.length + datasetSightingCount;
    const species = new Set(sightings.map((ref) => ref.title.trim().toLowerCase()).filter(Boolean));
    const datasetSpeciesCount = datasets.reduce((sum, ref) => sum + (ref.metrics?.speciesCount ?? 0), 0);
    return [
      sightingCount > 0 ? copy.natureSightingCount(sightingCount) : datasets.length > 0 ? copy.dataGroupCount(datasets.length) : null,
      species.size + datasetSpeciesCount > 0 ? copy.speciesCount(species.size + datasetSpeciesCount) : null,
    ].filter((value): value is string => Boolean(value));
  }
  if (kind === "audio") return [copy.recordingCount(Math.max(tileCount, references.filter((ref) => ref.kind === "audio").length))];
  if (kind === "file") return [copy.itemCount(tileCount)];
  return [];
}

function formatDateRangeFromValues(values: Array<string | null | undefined>): string | null {
  const dates = values.map(parseDate).filter((date): date is Date => date !== null);
  if (dates.length === 0) return null;
  const first = dates.reduce((current, next) => (next.getTime() < current.getTime() ? next : current));
  const last = dates.reduce((current, next) => (next.getTime() > current.getTime() ? next : current));
  if (first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth()) return formatMonthYear(first);
  return `${formatMonthYear(first)} – ${formatMonthYear(last)}`;
}

export function BumicertTimeline({
  organizationDid,
  activityUri,
  activityCid,
  bumicertTitle,
  canManageEvidence,
  createPermission,
  deletePermission,
  mutationRepo,
  initialEntries,
  sources,
  references = [],
  attachmentsUnavailable,
}: BumicertTimelineProps) {
  const router = useRouter();
  const timelineT = useTranslations("bumicert.detail.timeline");
  const entryT = useTranslations("bumicert.detail.timelineEntry");
  const referenceT = useTranslations("bumicert.detail.reference");
  const filterLabels: Record<Exclude<EvidenceKind, "site" | "other">, string> = {
    all: timelineT("filters.all"),
    tree: timelineT("filters.tree"),
    audio: timelineT("filters.audio"),
    nature: timelineT("filters.biodiversity"),
    file: timelineT("filters.file"),
  };
  const [entries, setEntries] = useState(() => initialEntries.filter((entry) => isAttachmentForActivity(entry, activityUri)));
  const [activeFilter, setActiveFilter] = useState<EvidenceKind>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const linkedWindow = useMemo(() => formatLinkedWindow(entries), [entries]);
  const timelineFallbacks = useMemo<TimelineTileCopy>(() => ({
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
  }), [entryT, timelineT]);
  const referenceCopy = useMemo<TimelineReferenceCopy>(() => ({
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
  }), [entryT, referenceT, timelineT]);
  const providedReferencesById = useMemo(() => new Map(references.map((ref) => [ref.id, ref])), [references]);
  const entryModels = useMemo(() => entries.map((item, index) => {
    const entryId = getEntryId(item, index);
    const builtReferences = buildTimelineReferences({
      entries: [item],
      audio: sources.audio,
      occurrences: sources.occurrences,
      treeGroups: sources.treeGroups,
      places: sources.places,
      copy: referenceCopy,
    });
    const refsById = new Map(builtReferences.map((ref) => [ref.id, ref]));
    for (const ref of providedReferencesById.values()) refsById.set(ref.id, ref);
    const entryRefs = getTimelineReferenceUrisForEntry(item)
      .map((uri) => refsById.get(uri))
      .filter((ref): ref is TimelineReference => Boolean(ref));
    const kind = evidenceKind(item.record.contentType, item.record.content);
    return { item, index, entryId, refs: entryRefs, kind, tiles: buildTiles(entryId, item.record.content, entryRefs, timelineFallbacks) };
  }), [entries, providedReferencesById, referenceCopy, sources.audio, sources.occurrences, sources.places, sources.treeGroups, timelineFallbacks]);
  const counts = useMemo(() => new Map(FILTERS.map((filter) => [filter.id, entryModels.filter((entry) => matchesFilter(entry.kind, filter.id)).length])), [entryModels]);
  const filteredEntries = entryModels.filter((entry) => matchesFilter(entry.kind, activeFilter));
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const visibleEntries = filteredEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const mapRefs = entryModels.flatMap((entry) => entry.refs.filter((ref) => ref.kind === "tree" && ref.mapHref));

  function handleCreated(created: TimelineAttachmentItem) {
    setEntries((current) => [created, ...current.filter((entry) => entry.metadata.rkey !== created.metadata.rkey)]);
    setStatus(timelineT("linkSuccess"));
  }

  function handleDeleted(rkey: string) {
    setEntries((current) => current.filter((entry) => entry.metadata.rkey !== rkey));
    router.refresh();
  }

  return (
    <motion.article
      key="timeline"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="py-1"
    >
      <div className="flex flex-col gap-6">
        {canManageEvidence ? (
          <section className="rounded-3xl border border-primary/25 bg-primary/5 p-4 shadow-sm ring-1 ring-primary/10" aria-labelledby="link-evidence-heading">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{timelineT("timelineTools")}</p>
                <h2 id="link-evidence-heading" className="mt-1 text-2xl tracking-tight text-foreground">{timelineT("linkEvidenceTitle")}</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{timelineT("linkEvidenceDescription", { title: bumicertTitle })}</p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-primary/25 bg-background/80 px-3 py-1 text-xs font-medium text-primary">{timelineT("notTimelineYet")}</span>
            </div>
            {attachmentsUnavailable ? (
              <p className="mt-3 rounded-2xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">{timelineT("linksUnavailable")}</p>
            ) : null}
            <div className="mt-4 rounded-2xl border border-border/60 bg-background/85 p-4 shadow-xs">
              <EvidenceAdder
                organizationDid={organizationDid}
                activityUri={activityUri}
                activityCid={activityCid}
                sources={sources}
                entries={entries}
                attachmentsUnavailable={attachmentsUnavailable}
                createPermission={createPermission}
                mutationRepo={mutationRepo}
                onCreated={handleCreated}
                onChanged={() => router.refresh()}
              />
            </div>
            {status ? <p className="mt-3 text-sm text-primary">{status}</p> : null}
          </section>
        ) : null}

        <section className="space-y-4" aria-labelledby="timeline-heading">
          <div className="rounded-2xl border border-border/50 bg-background p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 id="timeline-heading" className="text-2xl tracking-tight text-foreground">{timelineT("linkedTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {timelineT("linkedItemCount", { count: entries.length })}
                  {linkedWindow ? ` · ${timelineT("linked", { window: linkedWindow })}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{timelineT("linkedDescription")}</p>
              </div>
              {linkedWindow ? <p className="text-xs text-muted-foreground">{timelineT("linkedWindow", { window: linkedWindow })}</p> : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {FILTERS.map((filter) => {
                const isActive = activeFilter === filter.id;
                const count = counts.get(filter.id) ?? 0;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => { setActiveFilter(filter.id); setCurrentPage(1); }}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {filterLabels[filter.id]}{filter.id !== "all" && count > 0 ? ` ${count}` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {mapRefs.length > 0 ? <TimelineMapPreview refs={mapRefs} /> : null}

          {entries.length === 0 ? (
            <TimelineEmpty />
          ) : filteredEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">{timelineT("emptyFiltered")}</div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {visibleEntries.map((entry) => (
                  <TimelineEntryCard
                    key={entry.entryId}
                    {...entry}
                    canManageEvidence={canManageEvidence}
                    canDeleteEvidence={deletePermission.allowed}
                    deleteDisabledReason={deletePermission.reason}
                    mutationRepo={mutationRepo}
                    onDeleted={handleDeleted}
                  />
                ))}
              </div>
              {totalPages > 1 ? (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">{timelineT("pageOf", { current: safePage, total: totalPages })}</p>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon-sm" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage <= 1} aria-label={timelineT("previousPage")}><ChevronLeftIcon /></Button>
                    <Button type="button" variant="outline" size="icon-sm" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage >= totalPages} aria-label={timelineT("nextPage")}><ChevronRightIcon /></Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </motion.article>
  );
}

function TimelineEmpty() {
  const timelineT = useTranslations("bumicert.detail.timeline");

  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border-soft bg-surface/50 px-6 py-12 text-center">
      <PaperclipIcon className="h-8 w-8 text-muted-foreground/50" />
      <h3 className="mt-3 text-sm font-medium text-foreground">{timelineT("emptyTitle")}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{timelineT("emptyDescription")}</p>
    </div>
  );
}

function TimelineMapPreview({ refs }: { refs: TimelineReference[] }) {
  const entryT = useTranslations("bumicert.detail.timelineEntry");
  const [activeId, setActiveId] = useState(refs[0]?.id ?? "");
  const active = refs.find((ref) => ref.id === activeId) ?? refs[0];
  if (!active?.mapHref) return null;
  return (
    <div className="rounded-2xl border border-border/50 bg-background p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-medium text-foreground">{entryT("mapPreviewTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{entryT("mapPreviewDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {refs.map((ref) => (
            <button
              key={ref.id}
              type="button"
              onClick={() => setActiveId(ref.id)}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", active.id === ref.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {ref.title}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border-soft bg-muted/30">
        <iframe src={active.mapHref} className="h-[420px] w-full border-0" loading="lazy" title={entryT("treeGroupMapPreview")} />
      </div>
      <Link href={active.mapHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        {entryT("openMap")} <ExternalLinkIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}

function TimelineEntryCard({
  item,
  index,
  entryId,
  refs,
  kind,
  tiles,
  canManageEvidence,
  canDeleteEvidence,
  deleteDisabledReason,
  mutationRepo,
  onDeleted,
}: {
  item: TimelineAttachmentItem;
  index: number;
  entryId: string;
  refs: TimelineReference[];
  kind: EvidenceKind;
  tiles: TimelineTile[];
  canManageEvidence: boolean;
  canDeleteEvidence: boolean;
  deleteDisabledReason: string | null;
  mutationRepo?: string;
  onDeleted: (rkey: string) => void;
}) {
  const entryT = useTranslations("bumicert.detail.timelineEntry");
  const [expanded, setExpanded] = useState(index === 0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const panelId = useId();
  const rkey = item.metadata.rkey;
  const entryCopy: EntryCopy = {
    kindLabels: {
      all: entryT("kind.other"),
      tree: entryT("kind.tree"),
      audio: entryT("kind.audio"),
      nature: entryT("kind.biodiversity"),
      file: entryT("kind.document"),
      site: entryT("kind.site"),
      other: entryT("kind.other"),
    },
    natureObservationsFallback: entryT("natureObservationsFallback"),
  };
  const metricCopy: MetricCopy = {
    notSpecified: entryT("notSpecified"),
    treeCount: (count: number) => entryT("treeCount", { count }),
    speciesCount: (count: number) => entryT("speciesCount", { count }),
    natureSightingCount: (count: number) => entryT("observationCount", { count }),
    dataGroupCount: (count: number) => entryT("dataGroupCount", { count }),
    recordingCount: (count: number) => entryT("recordingCount", { count }),
    itemCount: (count: number) => entryT("itemCount", { count }),
  };
  const title = titleForEntry(item, kind, refs, entryCopy);
  const badges = metricBadges(kind, refs, tiles.length, metricCopy);
  const linkedDate = formatDate(item.record.createdAt ?? item.metadata.createdAt) || metricCopy.notSpecified;
  const recordedDate = recordedDateForEntry(kind, refs, metricCopy.notSpecified);
  const note = noteFromDescription(item.record.description);
  const mapHref = refs.find((ref) => ref.mapHref)?.mapHref ?? null;
  const previewTiles = tiles.filter((tile) => tile.preview && !(kind === "nature" && tile.preview.kind === "text"));
  const selectedTile = activeTileId ? previewTiles.find((tile) => tile.id === activeTileId) : undefined;
  const activePreview = selectedTile?.preview ?? previewTiles[0]?.preview ?? null;
  const biodiversityRefs = refs.filter((ref) => ref.kind === "occurrence" || ref.kind === "biodiversityDataset");

  async function handleDelete() {
    if (!rkey) return;
    if (!canDeleteEvidence) {
      setDeleteError(deleteDisabledReason ?? entryT("deleteUnavailable"));
      return;
    }
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteContextAttachment({ rkey, repo: mutationRepo });
      onDeleted(rkey);
      setShowDeleteConfirm(false);
    } catch (error) {
      if (isAttachmentMutationInputError(error) && error.code === "not-found") {
        setDeleteError(entryT("deleteAlreadyRemoved"));
        onDeleted(rkey);
        setShowDeleteConfirm(false);
        return;
      }
      console.error("Unable to remove timeline evidence", error);
      setDeleteError(entryT("deleteError"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <motion.article
      className="rounded-2xl border border-border/60 bg-background shadow-sm"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2), ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="flex items-start gap-3 p-4">
        <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((value) => !value)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-primary">{kindLabel(kind, entryCopy.kindLabels)}</span>
            {badges.map((badge) => <span key={badge} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{badge}</span>)}
          </div>
          <h3 className="mt-1 text-base text-foreground">{title}</h3>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{recordedDate}</span>
            <span>{entryT("linked", { date: linkedDate })}</span>
          </div>
        </button>
        <div className="flex items-center gap-1">
          {mapHref ? <Link href={mapHref} target="_blank" rel="noreferrer" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={entryT("openMap")}><ExternalLinkIcon className="h-4 w-4" /></Link> : null}
          {canManageEvidence && rkey ? (
            <button type="button" onClick={() => { setShowDeleteConfirm(true); setDeleteError(null); }} disabled={!canDeleteEvidence} title={!canDeleteEvidence ? deleteDisabledReason ?? entryT("deleteUnavailable") : undefined} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50" aria-label={canDeleteEvidence ? entryT("removeEvidence") : deleteDisabledReason ?? entryT("deleteUnavailable")}><Trash2Icon className="h-4 w-4" /></button>
          ) : null}
          <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((value) => !value)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={expanded ? entryT("collapseEvidence") : entryT("expandEvidence")}>
            <ChevronDownIcon className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={panelId} className="space-y-3 border-t border-border/50 p-4 pt-3">
          {note ? <div className="rounded-xl bg-muted/20 px-3 py-2 text-sm leading-6 text-foreground/80">{note}</div> : null}
          {canManageEvidence && rkey && !canDeleteEvidence && deleteDisabledReason ? (
            <p className="rounded-xl border border-warn/20 bg-warn/10 px-3 py-2 text-xs text-warn">{deleteDisabledReason}</p>
          ) : null}
          {kind === "nature" && biodiversityRefs.length > 0 ? (
            <div className="rounded-xl bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">{entryT("displayedBiodiversityData")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {biodiversityRefs.slice(0, 8).map((ref) => <span key={ref.id} className="rounded-full bg-background px-2.5 py-1 text-xs text-foreground shadow-xs">{ref.title}</span>)}
                {biodiversityRefs.length > 8 ? <span className="rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-xs">{entryT("more", { count: biodiversityRefs.length - 8 })}</span> : null}
              </div>
            </div>
          ) : null}
          {refs.filter((ref) => ref.kind === "tree" && ref.mapHref).length > 0 ? <TreeMapCards refs={refs.filter((ref) => ref.kind === "tree" && ref.mapHref)} /> : null}
          <TimelinePreviewPanel preview={activePreview} />
          {previewTiles.length > 1 ? <TimelineTileRow tiles={previewTiles} activeTileId={activeTileId ?? previewTiles[0]?.id ?? null} onTileClick={(tile) => setActiveTileId(tile.id)} /> : null}
          {mapHref && !activePreview ? <Link href={mapHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm text-foreground hover:bg-muted/30">{entryT("viewMap")} <ExternalLinkIcon className="h-4 w-4" /></Link> : null}
        </div>
      ) : null}

      {showDeleteConfirm ? (
        <div className="border-t border-border/50 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-foreground">{entryT("deleteConfirm.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{entryT("deleteConfirm.body", { title })}</p>
          {deleteError ? <p className="mt-2 text-sm text-destructive">{deleteError}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting || !canDeleteEvidence}>{isDeleting ? <Loader2Icon className="animate-spin" /> : null} {isDeleting ? entryT("deleteConfirm.removing") : entryT("deleteConfirm.remove")}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>{entryT("deleteConfirm.cancel")}</Button>
          </div>
        </div>
      ) : null}
    </motion.article>
  );
}

function TreeMapCards({ refs }: { refs: TimelineReference[] }) {
  const entryT = useTranslations("bumicert.detail.timelineEntry");

  return (
    <div className="rounded-xl bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{entryT("treeDatasetMapLayers")}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {refs.map((ref) => (
          <Link key={ref.id} href={ref.mapHref ?? "#"} target="_blank" rel="noreferrer" className="rounded-xl border border-border/60 bg-background p-3 text-sm transition-colors hover:border-primary/40 hover:text-primary">
            <span className="font-medium">{ref.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{ref.description ?? entryT("openMapLayer")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function TimelinePreviewPanel({ preview }: { preview: PreviewPayload | null }) {
  if (!preview) return null;
  if (preview.kind === "image") {
    return (
      <Link href={preview.href} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border/60 bg-muted/30">
        <Image src={preview.href} alt={preview.title} width={960} height={540} unoptimized className="max-h-[420px] w-full object-contain" />
      </Link>
    );
  }
  if (preview.kind === "video") return <video src={preview.href} controls className="max-h-[420px] w-full rounded-xl border border-border/60 bg-black" />;
  if (preview.kind === "audio") return <audio src={preview.href} controls className="w-full" />;
  if (preview.kind === "pdf") return <iframe src={preview.href} className="h-[420px] w-full rounded-xl border border-border/60" title={preview.fileName ?? preview.title} loading="lazy" />;
  if (preview.kind === "site") return <iframe src={preview.href} className="h-[420px] w-full rounded-xl border border-border/60" title={preview.title} loading="lazy" />;
  if (preview.kind === "text") {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
        <p className="text-sm font-medium text-foreground">{preview.title}</p>
        {preview.body ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{preview.body}</p> : null}
      </div>
    );
  }
  return (
    <Link href={preview.href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-4 text-sm transition-colors hover:border-primary/40 hover:text-primary">
      <span className="min-w-0 truncate">{preview.fileName ?? preview.title}</span>
      <ExternalLinkIcon className="h-4 w-4 shrink-0" />
    </Link>
  );
}

function TimelineTileRow({ tiles, activeTileId, onTileClick }: { tiles: TimelineTile[]; activeTileId: string | null; onTileClick: (tile: TimelineTile) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tiles.map((tile) => {
        const Icon = tileIcon(tile.kind);
        const active = activeTileId === tile.id;
        return (
          <button key={tile.id} type="button" onClick={() => onTileClick(tile)} className={cn("flex min-w-[150px] items-center gap-2 rounded-xl border p-2 text-left transition-colors", active ? "border-primary bg-primary/10" : "border-border/60 bg-background hover:bg-muted/40")}>
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-foreground">{tile.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{tile.caption}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function tileIcon(kind: TileKind) {
  if (kind === "site") return MapPinnedIcon;
  if (kind === "tree") return TreesIcon;
  if (kind === "nature") return LeafIcon;
  if (kind === "audio") return MusicIcon;
  if (kind === "image") return ImageIcon;
  if (kind === "video") return VideoIcon;
  if (kind === "link") return GlobeIcon;
  return FileTextIcon;
}
