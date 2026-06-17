"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
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
  MicIcon,
  MusicIcon,
  PaperclipIcon,
  PlusIcon,
  Trash2Icon,
  TreesIcon,
  VideoIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createRecord, deleteRecord, uploadBlob } from "@/app/(manage)/manage/_lib/mutations";
import { formatDate, formatNumber } from "@/app/_lib/format";
import type {
  ManagedAudio,
  ManagedLocation,
  OccurrenceRecord,
  TimelineAttachmentItem,
  TimelineDatasetRecord,
  UploadTreeDatasetRecord,
} from "@/app/_lib/indexer";

const ATTACHMENT_COLLECTION = "org.hypercerts.context.attachment";
const PAGE_SIZE = 8;

type TimelineSourceData = {
  audio: ManagedAudio[];
  occurrences: OccurrenceRecord[];
  treeGroups: UploadTreeDatasetRecord[];
  places: ManagedLocation[];
};

type BumicertTimelineProps = {
  organizationDid: string;
  activityUri: string;
  activityCid: string;
  bumicertTitle: string;
  isOwner: boolean;
  initialEntries: TimelineAttachmentItem[];
  sources: TimelineSourceData;
  references?: TimelineReference[];
  attachmentsUnavailable: boolean;
};

type ParsedAtUri = { did: string; collection: string; rkey: string };
type EvidenceKind = "all" | "tree" | "audio" | "nature" | "file" | "site" | "other";
type EvidenceTab = "audio" | "trees" | "nature" | "files";
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
type TimelineReference = {
  id: string;
  kind: "audio" | "occurrence" | "tree" | "location" | "unknown";
  title: string;
  description?: string;
  recordedAt?: string | null;
  dateRange?: string | null;
  treeGroupUri?: string | null;
  metrics?: { itemCount?: number; speciesCount?: number; treeCount?: number };
  mapHref?: string;
  actionHref?: string;
};
type AttachmentSubjectInfo = { uri: string; cid: string };
type ParsedAttachmentContent =
  | { kind: "uri"; uri: string }
  | { kind: "blob"; uri: string | null; cid: string | null; mimeType: string | null; size: number | null };
type AttachmentContentInput = string | File;
type AttachmentDraft = {
  title: string;
  contentType: string;
  contents: AttachmentContentInput[];
  note?: string;
  contextualSubjects?: AttachmentSubjectInfo[];
};
type KnownFileContentType = "document" | "report" | "evidence" | "testimonial" | "methodology" | "photo" | "video" | "audio" | "other";

const FILTERS: Array<{ id: Exclude<EvidenceKind, "site" | "other">; label: string }> = [
  { id: "all", label: "All" },
  { id: "tree", label: "Trees" },
  { id: "audio", label: "Sounds" },
  { id: "nature", label: "Nature" },
  { id: "file", label: "Files" },
];

const EVIDENCE_TABS: Array<{ id: EvidenceTab; label: string; icon: LucideIcon; description: string }> = [
  { id: "audio", label: "Field sounds", icon: MicIcon, description: "Add recordings already saved by this organization." },
  { id: "trees", label: "Tree groups", icon: TreesIcon, description: "Add tree information grouped by project place." },
  { id: "nature", label: "Nature sightings", icon: LeafIcon, description: "Add plant, animal, or field observations." },
  { id: "files", label: "Files and links", icon: FileTextIcon, description: "Add reports, photos, videos, or web pages." },
];

const FILE_CONTENT_TYPES: Array<{ value: KnownFileContentType; label: string }> = [
  { value: "document", label: "Document" },
  { value: "report", label: "Report" },
  { value: "evidence", label: "Evidence" },
  { value: "testimonial", label: "Testimonial" },
  { value: "methodology", label: "Method" },
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other" },
];

function parseAtUri(uri: string): ParsedAtUri | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return { did: match[1], collection: match[2], rkey: match[3] };
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function getAttachmentActivitySubject(subjects: TimelineAttachmentItem["record"]["subjects"]): AttachmentSubjectInfo | null {
  const subject = subjects?.[0];
  return subject?.uri && subject.cid ? { uri: subject.uri, cid: subject.cid } : null;
}

function isAttachmentForActivity(item: TimelineAttachmentItem, activityUri: string): boolean {
  return getAttachmentActivitySubject(item.record.subjects)?.uri === activityUri;
}

function parseAttachmentContent(content: unknown): ParsedAttachmentContent[] {
  const items = Array.isArray(content) ? content : content == null ? [] : [content];
  const parsed: ParsedAttachmentContent[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (record.$type === "org.hypercerts.defs#uri" && typeof record.uri === "string") {
      parsed.push({ kind: "uri", uri: record.uri });
      continue;
    }
    if (record.$type === "org.hypercerts.defs#smallBlob" && typeof record.blob === "object" && record.blob !== null) {
      const blob = record.blob as Record<string, unknown>;
      parsed.push({
        kind: "blob",
        uri: typeof blob.uri === "string" ? blob.uri : null,
        cid: typeof blob.cid === "string" ? blob.cid : null,
        mimeType: typeof blob.mimeType === "string" ? blob.mimeType : null,
        size: typeof blob.size === "number" ? blob.size : null,
      });
    }
  }
  return parsed;
}

function getLinkedTreeGroupUris(entries: TimelineAttachmentItem[]): Set<string> {
  const linked = new Set<string>();
  for (const entry of entries) {
    for (const item of parseAttachmentContent(entry.record.content)) {
      if (item.kind === "uri" && parseAtUri(item.uri)?.collection === "app.gainforest.dwc.dataset") {
        linked.add(item.uri);
      }
    }
  }
  return linked;
}

function evidenceKind(contentType: string | null | undefined, content: unknown): EvidenceKind {
  const normalized = contentType?.trim().toLowerCase();
  if (normalized === "audio") return "audio";
  if (normalized === "tree-dataset" || normalized === "occurrence") return "tree";
  if (normalized === "biodiversity") return "nature";
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

function fileNameFromHref(href: string): string {
  try {
    const parsed = new URL(href);
    const fileName = parsed.pathname.split("/").filter(Boolean).at(-1);
    return fileName && fileName !== "com.atproto.sync.getBlob" ? decodeURIComponent(fileName) : "Linked file";
  } catch {
    return "Linked file";
  }
}

function extensionFromHref(href: string, fileName?: string | null): string | null {
  const raw = fileName || href;
  const path = raw.split("?")[0]?.split("#")[0] ?? "";
  const name = path.split("/").filter(Boolean).at(-1);
  const ext = name?.split(".").at(-1)?.toLowerCase();
  return ext && ext !== name ? ext : null;
}

function previewFromHref(href: string, mimeType: string | null, fileName?: string | null): PreviewPayload {
  const mime = mimeType?.toLowerCase() ?? "";
  const ext = extensionFromHref(href, fileName);
  const name = cleanText(fileName) ?? fileNameFromHref(href);
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(ext ?? "")) return { kind: "image", href, title: "Image", fileName: name, mimeType };
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v"].includes(ext ?? "")) return { kind: "video", href, title: "Video", fileName: name, mimeType };
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "flac"].includes(ext ?? "")) return { kind: "audio", href, title: "Audio", fileName: name, mimeType };
  if (mime === "application/pdf" || ext === "pdf") return { kind: "pdf", href, title: "PDF", fileName: name, mimeType };
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"].includes(ext ?? "")) return { kind: "document", href, title: "Document", fileName: name, mimeType };
  return { kind: "link", href, title: name, fileName: name, mimeType };
}

function previewForReference(uri: string, reference: TimelineReference | undefined): PreviewPayload | null {
  if (reference?.kind === "location" && reference.actionHref) return { kind: "site", href: reference.actionHref, title: reference.title, body: reference.description };
  if (reference?.kind === "tree") return { kind: "text", href: "", title: reference.title, body: reference.description ?? "Linked tree information" };
  if (reference?.kind === "audio" && reference.actionHref) return { kind: "audio", href: reference.actionHref, title: reference.title, body: reference.description };
  if (reference?.actionHref) return { kind: "link", href: reference.actionHref, title: reference.title, body: reference.description };
  if (reference) return { kind: "text", href: "", title: reference.title, body: reference.description ?? "Linked item" };
  const parsed = parseAtUri(uri);
  if (parsed?.collection === "app.certified.location") return { kind: "text", href: "", title: "Linked project place" };
  if (parsed?.collection === "app.gainforest.dwc.dataset") return { kind: "text", href: "", title: "Linked tree group" };
  if (parsed?.collection === "app.gainforest.ac.audio") return { kind: "text", href: "", title: "Linked sound" };
  return { kind: "text", href: "", title: "Linked item" };
}

function tileKindFromPreview(preview: PreviewPayload): TileKind {
  if (preview.kind === "site") return "site";
  if (preview.kind === "text") return "item";
  if (preview.kind === "document") return "file";
  if (preview.kind === "link") return "link";
  return preview.kind;
}

function buildTiles(entryId: string, content: unknown, references: TimelineReference[]): TimelineTile[] {
  const refs = new Map(references.map((ref) => [ref.id, ref]));
  const tiles: TimelineTile[] = [];
  parseAttachmentContent(content).forEach((item, index) => {
    const id = `${entryId}-${index}`;
    if (item.kind === "blob") {
      if (!item.uri) return;
      const preview = previewFromHref(item.uri, item.mimeType, item.cid);
      tiles.push({ id, kind: tileKindFromPreview(preview), title: preview.title, caption: preview.fileName ?? item.cid ?? "Linked file", preview });
      return;
    }
    if (isHttpUrl(item.uri)) {
      const preview = previewFromHref(item.uri, null);
      tiles.push({ id, kind: tileKindFromPreview(preview), title: preview.title, caption: preview.fileName ?? item.uri, preview });
      return;
    }
    const reference = refs.get(item.uri);
    const preview = previewForReference(item.uri, reference);
    const parsed = parseAtUri(item.uri);
    const kind: TileKind = reference?.kind === "tree" ? "tree" : reference?.kind === "occurrence" ? "nature" : reference?.kind === "audio" ? "audio" : reference?.kind === "location" ? "site" : "item";
    const title = reference?.title ?? (parsed?.collection === "app.gainforest.dwc.dataset" ? "Tree group" : "Linked item");
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

function kindLabel(kind: EvidenceKind): string {
  if (kind === "tree") return "Tree group";
  if (kind === "audio") return "Field sound";
  if (kind === "nature") return "Nature sightings";
  if (kind === "site") return "Project place";
  if (kind === "file") return "File";
  return "Evidence";
}

function titleForEntry(item: TimelineAttachmentItem, kind: EvidenceKind, references: TimelineReference[]): string {
  const explicit = cleanText(item.record.title);
  const treeRef = references.find((ref) => ref.kind === "tree");
  if (kind === "tree" && treeRef) return treeRef.title;
  if (kind === "nature") return explicit ?? "Nature sightings";
  return explicit ?? kindLabel(kind);
}

function recordedDateForEntry(kind: EvidenceKind, references: TimelineReference[]): string {
  const treeRange = references.find((ref) => ref.kind === "tree" && ref.dateRange)?.dateRange;
  if (treeRange) return treeRange;
  const dates = references.map((ref) => ref.recordedAt).filter((value): value is string => Boolean(value));
  const range = formatDateRangeFromValues(dates);
  if (range) return range;
  if (kind === "audio") return formatDate(dates[0]) || "Not specified";
  return "Not specified";
}

function metricBadges(kind: EvidenceKind, references: TimelineReference[], tileCount: number): string[] {
  if (kind === "tree") {
    const treeCount = references.reduce((sum, ref) => sum + (ref.metrics?.treeCount ?? ref.metrics?.itemCount ?? 0), 0);
    const speciesCount = references.reduce((sum, ref) => sum + (ref.metrics?.speciesCount ?? 0), 0);
    return [treeCount > 0 ? `${formatNumber(treeCount)} trees` : null, speciesCount > 0 ? `${formatNumber(speciesCount)} species` : null].filter((value): value is string => Boolean(value));
  }
  if (kind === "nature") {
    const observations = references.filter((ref) => ref.kind === "occurrence");
    const species = new Set(observations.map((ref) => ref.title.trim().toLowerCase()).filter(Boolean));
    return [`${formatNumber(observations.length)} sightings`, species.size > 0 ? `${formatNumber(species.size)} species` : null].filter((value): value is string => Boolean(value));
  }
  if (kind === "audio") return [`${formatNumber(Math.max(tileCount, references.filter((ref) => ref.kind === "audio").length))} recordings`];
  if (kind === "file") return [`${formatNumber(tileCount)} items`];
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function toFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function makeLocalRkey(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toStrongRefs(subjects: AttachmentSubjectInfo[]) {
  const seen = new Set<string>();
  return subjects.filter((subject) => {
    if (!subject.uri || !subject.cid || seen.has(subject.uri)) return false;
    seen.add(subject.uri);
    return true;
  }).map((subject) => ({ $type: "com.atproto.repo.strongRef", uri: subject.uri, cid: subject.cid }));
}

function getTreeGroupStats(treeGroupUri: string, occurrences: OccurrenceRecord[]): { itemCount: number; speciesCount: number; dateRange: string | null } {
  const items = occurrences.filter((item) => item.datasetRef === treeGroupUri);
  const species = new Set(items.map((item) => (item.scientificName ?? item.vernacularName ?? "").trim().toLowerCase()).filter(Boolean));
  return { itemCount: items.length, speciesCount: species.size, dateRange: formatDateRangeFromValues(items.map((item) => item.eventDate ?? item.createdAt)) };
}

function getPlaceForTreeGroup(treeGroupUri: string, occurrences: OccurrenceRecord[], places: ManagedLocation[]): AttachmentSubjectInfo | null {
  const siteRefs = new Set(occurrences.filter((item) => item.datasetRef === treeGroupUri).map((item) => item.siteRef).filter((value): value is string => Boolean(value)));
  if (siteRefs.size !== 1) return null;
  const [siteRef] = Array.from(siteRefs);
  const place = places.find((item) => item.metadata.uri === siteRef);
  return place ? { uri: place.metadata.uri, cid: place.metadata.cid } : null;
}

function isNatureSighting(item: OccurrenceRecord): boolean {
  return !item.datasetRef;
}

function buildOptimisticAttachment(args: {
  organizationDid: string;
  created: { uri: string; cid: string; rkey: string };
  title: string;
  contentType: string;
  note?: string;
  contents: unknown[];
  subjects: AttachmentSubjectInfo[];
}): TimelineAttachmentItem {
  const createdAt = new Date().toISOString();
  return {
    metadata: { did: args.organizationDid, uri: args.created.uri, rkey: args.created.rkey, cid: args.created.cid, createdAt, indexedAt: null },
    creatorInfo: { did: args.organizationDid, organizationName: null, organizationLogo: null },
    record: {
      title: args.title,
      shortDescription: null,
      description: args.note ? { $type: "org.hypercerts.defs#descriptionString", value: args.note } : null,
      contentType: args.contentType,
      subjects: args.subjects,
      content: args.contents,
      createdAt,
    },
  };
}

export function BumicertTimeline({
  organizationDid,
  activityUri,
  activityCid,
  bumicertTitle,
  isOwner,
  initialEntries,
  sources,
  references = [],
  attachmentsUnavailable,
}: BumicertTimelineProps) {
  const [entries, setEntries] = useState(() => initialEntries.filter((entry) => isAttachmentForActivity(entry, activityUri)));
  const [activeFilter, setActiveFilter] = useState<EvidenceKind>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const linkedWindow = useMemo(() => formatLinkedWindow(entries), [entries]);
  const allReferences = useMemo(() => {
    const built = buildTimelineReferences({
      entries,
      audio: sources.audio,
      occurrences: sources.occurrences,
      treeGroups: sources.treeGroups,
      places: sources.places,
    });
    const byId = new Map<string, TimelineReference>();
    for (const ref of [...built, ...references]) byId.set(ref.id, ref);
    return Array.from(byId.values());
  }, [entries, references, sources.audio, sources.occurrences, sources.treeGroups, sources.places]);
  const refsById = useMemo(() => new Map(allReferences.map((ref) => [ref.id, ref])), [allReferences]);
  const entryModels = useMemo(() => entries.map((item, index) => {
    const entryId = getEntryId(item, index);
    const entryRefs = parseAttachmentContent(item.record.content)
      .filter((content): content is { kind: "uri"; uri: string } => content.kind === "uri" && content.uri.startsWith("at://"))
      .map((content) => refsById.get(content.uri))
      .filter((ref): ref is TimelineReference => Boolean(ref));
    const kind = evidenceKind(item.record.contentType, item.record.content);
    return { item, index, entryId, refs: entryRefs, kind, tiles: buildTiles(entryId, item.record.content, entryRefs) };
  }), [entries, refsById]);
  const counts = useMemo(() => new Map(FILTERS.map((filter) => [filter.id, entryModels.filter((entry) => matchesFilter(entry.kind, filter.id)).length])), [entryModels]);
  const filteredEntries = entryModels.filter((entry) => matchesFilter(entry.kind, activeFilter));
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const visibleEntries = filteredEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const mapRefs = entryModels.flatMap((entry) => entry.refs.filter((ref) => ref.kind === "tree" && ref.mapHref));

  function handleCreated(created: TimelineAttachmentItem) {
    setEntries((current) => [created, ...current.filter((entry) => entry.metadata.rkey !== created.metadata.rkey)]);
    setStatus("Linked to the public timeline. It may take a moment to appear for everyone.");
  }

  function handleDeleted(rkey: string) {
    setEntries((current) => current.filter((entry) => entry.metadata.rkey !== rkey));
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
        {isOwner ? (
          <section className="rounded-3xl border border-primary/25 bg-primary/5 p-4 shadow-sm ring-1 ring-primary/10" aria-labelledby="link-evidence-heading">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Owner tools</p>
                <h2 id="link-evidence-heading" className="mt-1 text-2xl tracking-tight text-foreground">Link evidence</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Attach saved items or files to {bumicertTitle}. Linked items appear in the public timeline below.</p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-primary/25 bg-background/80 px-3 py-1 text-xs font-medium text-primary">Not public here yet</span>
            </div>
            {attachmentsUnavailable ? (
              <p className="mt-3 rounded-2xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">Existing timeline links could not be checked. Refresh before adding tree groups.</p>
            ) : null}
            <div className="mt-4 rounded-2xl border border-border/60 bg-background/85 p-4 shadow-xs">
              <EvidenceAdder
                organizationDid={organizationDid}
                activityUri={activityUri}
                activityCid={activityCid}
                sources={sources}
                entries={entries}
                onCreated={handleCreated}
              />
            </div>
            {status ? <p className="mt-3 text-sm text-primary">{status}</p> : null}
          </section>
        ) : null}

        <section className="space-y-4" aria-labelledby="timeline-heading">
          <div className="rounded-2xl border border-border/50 bg-background p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 id="timeline-heading" className="text-2xl tracking-tight text-foreground">Linked evidence timeline</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {entries.length === 1 ? "1 item linked to this Cert" : `${formatNumber(entries.length)} items linked to this Cert`}
                  {linkedWindow ? ` · linked ${linkedWindow}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Review files, field notes, tree information, sounds, and map layers already added to this public timeline.</p>
              </div>
              {linkedWindow ? <p className="text-xs text-muted-foreground">Linked window: {linkedWindow}</p> : null}
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
                    {filter.label}{filter.id !== "all" && count > 0 ? ` ${count}` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {mapRefs.length > 0 ? <TimelineMapPreview refs={mapRefs} /> : null}

          {entries.length === 0 ? (
            <TimelineEmpty />
          ) : filteredEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">No evidence matches this filter.</div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {visibleEntries.map((entry) => (
                  <TimelineEntryCard
                    key={entry.entryId}
                    {...entry}
                    isOwner={isOwner}
                    onDeleted={handleDeleted}
                  />
                ))}
              </div>
              {totalPages > 1 ? (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">Page {safePage} of {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon-sm" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage <= 1} aria-label="Previous page"><ChevronLeftIcon /></Button>
                    <Button type="button" variant="outline" size="icon-sm" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage >= totalPages} aria-label="Next page"><ChevronRightIcon /></Button>
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
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border-soft bg-surface/50 px-6 py-12 text-center">
      <PaperclipIcon className="h-8 w-8 text-muted-foreground/50" />
      <h3 className="mt-3 text-sm font-medium text-foreground">No evidence uploaded yet</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">Reports, field notes, and saved project information from this organization will appear here.</p>
    </div>
  );
}

function TimelineMapPreview({ refs }: { refs: TimelineReference[] }) {
  const [activeId, setActiveId] = useState(refs[0]?.id ?? "");
  const active = refs.find((ref) => ref.id === activeId) ?? refs[0];
  if (!active?.mapHref) return null;
  return (
    <div className="rounded-2xl border border-border/50 bg-background p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-medium text-foreground">Map preview</h3>
          <p className="mt-1 text-xs text-muted-foreground">Preview tree groups linked to this timeline.</p>
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
        <iframe src={active.mapHref} className="h-[420px] w-full border-0" loading="lazy" title="Tree group map preview" />
      </div>
      <Link href={active.mapHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        Open map <ExternalLinkIcon className="h-4 w-4" />
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
  isOwner,
  onDeleted,
}: {
  item: TimelineAttachmentItem;
  index: number;
  entryId: string;
  refs: TimelineReference[];
  kind: EvidenceKind;
  tiles: TimelineTile[];
  isOwner: boolean;
  onDeleted: (rkey: string) => void;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const panelId = useId();
  const rkey = item.metadata.rkey;
  const title = titleForEntry(item, kind, refs);
  const badges = metricBadges(kind, refs, tiles.length);
  const linkedDate = formatDate(item.record.createdAt ?? item.metadata.createdAt) || "Not specified";
  const recordedDate = recordedDateForEntry(kind, refs);
  const note = noteFromDescription(item.record.description);
  const mapHref = refs.find((ref) => ref.mapHref)?.mapHref ?? null;
  const previewTiles = tiles.filter((tile) => tile.preview && !(kind === "nature" && tile.preview.kind === "text"));
  const selectedTile = activeTileId ? previewTiles.find((tile) => tile.id === activeTileId) : undefined;
  const activePreview = selectedTile?.preview ?? previewTiles[0]?.preview ?? null;

  async function handleDelete() {
    if (!rkey) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteRecord(ATTACHMENT_COLLECTION, rkey);
      onDeleted(rkey);
      setShowDeleteConfirm(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to remove this item.");
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
            <span className="text-xs text-primary">{kindLabel(kind)}</span>
            {badges.map((badge) => <span key={badge} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{badge}</span>)}
          </div>
          <h3 className="mt-1 text-base text-foreground">{title}</h3>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{recordedDate}</span>
            <span>linked {linkedDate}</span>
          </div>
        </button>
        <div className="flex items-center gap-1">
          {mapHref ? <Link href={mapHref} target="_blank" rel="noreferrer" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Open map"><ExternalLinkIcon className="h-4 w-4" /></Link> : null}
          {isOwner && rkey ? (
            <button type="button" onClick={() => { setShowDeleteConfirm(true); setDeleteError(null); }} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove evidence"><Trash2Icon className="h-4 w-4" /></button>
          ) : null}
          <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((value) => !value)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={expanded ? "Collapse evidence" : "Expand evidence"}>
            <ChevronDownIcon className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={panelId} className="space-y-3 border-t border-border/50 p-4 pt-3">
          {note ? <div className="rounded-xl bg-muted/20 px-3 py-2 text-sm leading-6 text-foreground/80">{note}</div> : null}
          {kind === "nature" && refs.filter((ref) => ref.kind === "occurrence").length > 0 ? (
            <div className="rounded-xl bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Selected sightings</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {refs.filter((ref) => ref.kind === "occurrence").slice(0, 8).map((ref) => <span key={ref.id} className="rounded-full bg-background px-2.5 py-1 text-xs text-foreground shadow-xs">{ref.title}</span>)}
                {refs.filter((ref) => ref.kind === "occurrence").length > 8 ? <span className="rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-xs">+{refs.filter((ref) => ref.kind === "occurrence").length - 8} more</span> : null}
              </div>
            </div>
          ) : null}
          {refs.filter((ref) => ref.kind === "tree" && ref.mapHref).length > 0 ? <TreeMapCards refs={refs.filter((ref) => ref.kind === "tree" && ref.mapHref)} /> : null}
          <TimelinePreviewPanel preview={activePreview} />
          {previewTiles.length > 1 ? <TimelineTileRow tiles={previewTiles} activeTileId={activeTileId ?? previewTiles[0]?.id ?? null} onTileClick={(tile) => setActiveTileId(tile.id)} /> : null}
          {mapHref && !activePreview ? <Link href={mapHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm text-foreground hover:bg-muted/30">View map <ExternalLinkIcon className="h-4 w-4" /></Link> : null}
        </div>
      ) : null}

      {showDeleteConfirm ? (
        <div className="border-t border-border/50 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-foreground">Remove evidence?</p>
          <p className="mt-1 text-sm text-muted-foreground">Remove “{title}”? This cannot be undone.</p>
          {deleteError ? <p className="mt-2 text-sm text-destructive">{deleteError}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>{isDeleting ? <Loader2Icon className="animate-spin" /> : null} Remove</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </motion.article>
  );
}

function TreeMapCards({ refs }: { refs: TimelineReference[] }) {
  return (
    <div className="rounded-xl bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">Tree group map layers</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {refs.map((ref) => (
          <Link key={ref.id} href={ref.mapHref ?? "#"} target="_blank" rel="noreferrer" className="rounded-xl border border-border/60 bg-background p-3 text-sm transition-colors hover:border-primary/40 hover:text-primary">
            <span className="font-medium">{ref.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{ref.description ?? "Open map layer"}</span>
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

function EvidenceAdder({
  organizationDid,
  activityUri,
  activityCid,
  sources,
  entries,
  onCreated,
}: {
  organizationDid: string;
  activityUri: string;
  activityCid: string;
  sources: TimelineSourceData;
  entries: TimelineAttachmentItem[];
  onCreated: (entry: TimelineAttachmentItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<EvidenceTab | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkedTreeGroups = useMemo(() => getLinkedTreeGroupUris(entries), [entries]);

  async function submitDrafts(drafts: AttachmentDraft | AttachmentDraft[], onSuccess?: () => void) {
    const items = (Array.isArray(drafts) ? drafts : [drafts]).filter((draft) => draft.contents.length > 0);
    if (items.length === 0) return;
    if (!activityCid) {
      setError("This Cert is still loading its timeline details. Refresh and try again.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const created: TimelineAttachmentItem[] = [];
    try {
      for (const draft of items) {
        const resolvedContents: unknown[] = [];
        const recordContents = [];
        for (const content of draft.contents) {
          if (typeof content === "string") {
            recordContents.push({ $type: "org.hypercerts.defs#uri", uri: content });
            resolvedContents.push({ $type: "org.hypercerts.defs#uri", uri: content });
          } else {
            const uploaded = await uploadBlob(content);
            recordContents.push({ $type: "org.hypercerts.defs#smallBlob", blob: { $type: "blob", ...uploaded, mimeType: content.type || uploaded.mimeType } });
            resolvedContents.push({ $type: "org.hypercerts.defs#smallBlob", blob: { $type: "blob", uri: URL.createObjectURL(content), cid: content.name, mimeType: content.type || uploaded.mimeType, size: content.size } });
          }
        }
        const subjects = [{ uri: activityUri, cid: activityCid }, ...(draft.contextualSubjects ?? [])];
        const record: Record<string, unknown> = {
          $type: ATTACHMENT_COLLECTION,
          title: draft.title,
          contentType: draft.contentType,
          subjects: toStrongRefs(subjects),
          content: recordContents,
          ...(draft.note?.trim() ? { description: { $type: "org.hypercerts.defs#descriptionString", value: draft.note.trim(), facets: [] } } : {}),
          createdAt: new Date().toISOString(),
        };
        const result = await createRecord(ATTACHMENT_COLLECTION, record);
        const rkey = result.uri.split("/").pop() ?? makeLocalRkey();
        const optimistic = buildOptimisticAttachment({ organizationDid, created: { uri: result.uri, cid: result.cid, rkey }, title: draft.title, contentType: draft.contentType, note: draft.note, contents: resolvedContents, subjects });
        created.push(optimistic);
        onCreated(optimistic);
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to link this evidence. Please try again.");
      if (created.length > 0) onSuccess?.();
    } finally {
      setIsSubmitting(false);
    }
  }

  if (activeTab === null) {
    return (
      <div className="flex flex-col">
        <span className="text-2xl font-medium text-foreground">Choose evidence type</span>
        <span className="text-sm text-muted-foreground">Select a source to link existing evidence to this timeline.</span>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EVIDENCE_TABS.map(({ id, icon: Icon, label, description }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} className="flex min-h-32 flex-col items-start justify-between rounded-2xl border border-border/60 bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
              <Icon className="h-5 w-5 text-primary/70" />
              <span>
                <span className="block text-base font-medium text-foreground">{label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const activeConfig = EVIDENCE_TABS.find((tab) => tab.id === activeTab)!;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" size="icon-sm" disabled={isSubmitting} onClick={() => setActiveTab(null)}><ChevronLeftIcon /></Button>
        <div className="flex flex-col">
          <span className="text-2xl font-medium text-foreground">Link {activeConfig.label}</span>
          <span className="text-sm text-muted-foreground">Select items to link to this timeline.</span>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {activeTab === "audio" ? <AudioPicker data={sources.audio} isSubmitting={isSubmitting} submitDrafts={submitDrafts} /> : null}
        {activeTab === "trees" ? <TreeGroupPicker data={sources.treeGroups} occurrences={sources.occurrences} places={sources.places} linkedTreeGroups={linkedTreeGroups} isSubmitting={isSubmitting} submitDrafts={submitDrafts} /> : null}
        {activeTab === "nature" ? <NaturePicker data={sources.occurrences.filter(isNatureSighting)} isSubmitting={isSubmitting} submitDrafts={submitDrafts} /> : null}
        {activeTab === "files" ? <FilePicker isSubmitting={isSubmitting} submitDrafts={submitDrafts} /> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

function CheckRow({ selected, onToggle, icon: Icon, primary, secondary, status, disabled }: { selected: boolean; onToggle: () => void; icon: LucideIcon; primary: string; secondary?: string; status?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled} className={cn("flex w-full items-center gap-3 rounded-xl border bg-background px-3 py-2 text-left transition-colors", selected ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/30", disabled && "cursor-not-allowed opacity-60")}>
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{selected ? <PlusIcon className="h-3 w-3 rotate-45" /> : null}</span>
      <Icon className="h-4 w-4 shrink-0 text-primary/70" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{primary}</span>
        {secondary ? <span className="block truncate text-xs text-muted-foreground">{secondary}</span> : null}
      </span>
      {status ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{status}</span> : null}
    </button>
  );
}

function OptionalNote({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">Optional note</label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder="Add context about this evidence…" rows={3} />
    </div>
  );
}

function SubmitButton({ count, isSubmitting, onClick }: { count: number; isSubmitting: boolean; onClick: () => void }) {
  return (
    <Button type="button" onClick={onClick} disabled={isSubmitting || count === 0} className="w-full">
      {isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
      {isSubmitting ? "Linking…" : count === 0 ? "Select evidence to link" : count === 1 ? "Link 1 item" : `Link ${count} items`}
      {!isSubmitting ? <ArrowRightIcon /> : null}
    </Button>
  );
}

function AudioPicker({ data, isSubmitting, submitDrafts }: { data: ManagedAudio[]; isSubmitting: boolean; submitDrafts: (draft: AttachmentDraft, onSuccess?: () => void) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const selectable = data.filter((item) => item.metadata.uri);
  function toggle(uri: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }
  if (selectable.length === 0) return <PickerEmpty label="field sound recordings" href="/manage/audio" />;
  return (
    <>
      <div className="grid gap-2">
        {selectable.map((item) => (
          <CheckRow key={item.metadata.uri} selected={selected.has(item.metadata.uri)} onToggle={() => toggle(item.metadata.uri)} icon={MicIcon} primary={item.record.name ?? "Untitled recording"} secondary={formatDate(item.record.recordedAt ?? item.metadata.createdAt)} disabled={isSubmitting} />
        ))}
      </div>
      <ManageLink href="/manage/audio" label="Manage field sounds" />
      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton count={selected.size} isSubmitting={isSubmitting} onClick={() => submitDrafts({ title: "Field sound recordings", contentType: "audio", contents: Array.from(selected), note }, () => { setSelected(new Set()); setNote(""); })} />
    </>
  );
}

function TreeGroupPicker({ data, occurrences, places, linkedTreeGroups, isSubmitting, submitDrafts }: { data: UploadTreeDatasetRecord[]; occurrences: OccurrenceRecord[]; places: ManagedLocation[]; linkedTreeGroups: Set<string>; isSubmitting: boolean; submitDrafts: (drafts: AttachmentDraft[], onSuccess?: () => void) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const rows = data.filter((item) => item.uri);
  function toggle(uri: string) {
    if (linkedTreeGroups.has(uri)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }
  if (rows.length === 0) return <PickerEmpty label="tree groups" href="/manage/trees" />;
  const drafts = Array.from(selected).map((uri) => {
    const place = getPlaceForTreeGroup(uri, occurrences, places);
    return { title: "Tree group", contentType: "tree-dataset", contents: [uri], note, contextualSubjects: place ? [place] : [] } satisfies AttachmentDraft;
  });
  return (
    <>
      <div className="grid gap-2">
        {rows.map((item) => {
          const stats = getTreeGroupStats(item.uri, occurrences);
          const place = getPlaceForTreeGroup(item.uri, occurrences, places);
          const secondary = [
            `${formatNumber(stats.itemCount || item.recordCount || 0)} trees`,
            stats.speciesCount > 0 ? `${formatNumber(stats.speciesCount)} species` : null,
            stats.dateRange,
            place ? "Project place ready" : "Project place not confirmed",
          ].filter(Boolean).join(" · ");
          const alreadyLinked = linkedTreeGroups.has(item.uri);
          return <CheckRow key={item.uri} selected={!alreadyLinked && selected.has(item.uri)} onToggle={() => toggle(item.uri)} icon={TreesIcon} primary={item.name || "Unnamed tree group"} secondary={secondary} status={alreadyLinked ? "Already linked" : undefined} disabled={isSubmitting || alreadyLinked} />;
        })}
      </div>
      <ManageLink href="/manage/trees" label="Manage tree information" />
      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton count={selected.size} isSubmitting={isSubmitting} onClick={() => submitDrafts(drafts, () => { setSelected(new Set()); setNote(""); })} />
    </>
  );
}

function NaturePicker({ data, isSubmitting, submitDrafts }: { data: OccurrenceRecord[]; isSubmitting: boolean; submitDrafts: (draft: AttachmentDraft, onSuccess?: () => void) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const rows = data.filter((item) => item.atUri);
  function toggle(uri: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }
  if (rows.length === 0) return <PickerEmpty label="nature sightings" />;
  return (
    <>
      <div className="grid max-h-[420px] gap-2 overflow-auto pr-1">
        {rows.map((item) => {
          const title = item.scientificName ?? item.vernacularName ?? item.remarks ?? "Unknown sighting";
          const secondary = [item.kingdom, formatDate(item.eventDate ?? item.createdAt), item.locality].filter(Boolean).join(" · ");
          return <CheckRow key={item.atUri} selected={selected.has(item.atUri)} onToggle={() => toggle(item.atUri)} icon={LeafIcon} primary={title} secondary={secondary} disabled={isSubmitting} />;
        })}
      </div>
      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton count={selected.size} isSubmitting={isSubmitting} onClick={() => submitDrafts({ title: "Nature sightings", contentType: "biodiversity", contents: Array.from(selected), note }, () => { setSelected(new Set()); setNote(""); })} />
    </>
  );
}

function FilePicker({ isSubmitting, submitDrafts }: { isSubmitting: boolean; submitDrafts: (draft: AttachmentDraft, onSuccess?: () => void) => void }) {
  const [selectedContentType, setSelectedContentType] = useState<KnownFileContentType>("document");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const inputId = useId();

  function appendFileList(fileList: FileList | null) {
    if (!fileList) return;
    setFiles((current) => {
      const next = [...current];
      const seen = new Set(current.map(toFileKey));
      for (const file of Array.from(fileList)) {
        const key = toFileKey(file);
        if (!seen.has(key)) next.push(file);
      }
      return next;
    });
  }
  function addLink() {
    const trimmed = linkInput.trim();
    setLinkError(null);
    if (!trimmed) return;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        setLinkError("Use a web link that starts with http or https.");
        return;
      }
      const normalized = parsed.toString();
      setLinks((current) => current.includes(normalized) ? current : [...current, normalized]);
      setLinkInput("");
    } catch {
      setLinkError("Enter a valid web link.");
    }
  }
  const title = FILE_CONTENT_TYPES.find((item) => item.value === selectedContentType)?.label ?? "Evidence";
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">File kind</label>
          <Select value={selectedContentType} onValueChange={(value) => setSelectedContentType(value as KnownFileContentType)} disabled={isSubmitting}>
            <SelectTrigger><SelectValue placeholder="Select file kind" /></SelectTrigger>
            <SelectContent>{FILE_CONTENT_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label htmlFor={inputId} className={cn("grid min-h-[120px] cursor-pointer place-items-center rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center transition-colors hover:border-primary/40", isSubmitting && "pointer-events-none opacity-70")}>
          <span><PaperclipIcon className="mx-auto h-6 w-6 text-muted-foreground" /><span className="mt-2 block text-sm font-medium text-foreground">Add a file as evidence</span><span className="mt-1 block text-xs text-muted-foreground">Photos, sounds, videos, reports, and notes up to 4 MB.</span></span>
          <input id={inputId} type="file" className="sr-only" multiple accept="image/*,audio/*,video/*,application/*,text/*" disabled={isSubmitting} onChange={(event) => { appendFileList(event.target.files); event.currentTarget.value = ""; }} />
        </label>
        <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-background p-3">
          <label className="text-sm font-medium">Web link</label>
          <div className="flex gap-2">
            <Input value={linkInput} placeholder="https://example.org/report" disabled={isSubmitting} aria-invalid={linkError ? true : undefined} onChange={(event) => setLinkInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} />
            <Button type="button" variant="secondary" onClick={addLink} disabled={isSubmitting || linkInput.trim().length === 0}>Add</Button>
          </div>
          <p className={cn("text-xs", linkError ? "text-destructive" : "text-muted-foreground")}>{linkError ?? "Link reports, websites, or external project notes."}</p>
        </div>
        {files.length > 0 || links.length > 0 ? (
          <div className="grid gap-2">
            {files.map((file) => {
              const key = toFileKey(file);
              return <SelectedItem key={key} title={file.name} detail={`${formatFileSize(file.size)}${file.type ? ` · ${file.type}` : ""}`} onRemove={() => setFiles((current) => current.filter((item) => toFileKey(item) !== key))} disabled={isSubmitting} />;
            })}
            {links.map((link) => <SelectedItem key={link} title="Web link" detail={link} onRemove={() => setLinks((current) => current.filter((item) => item !== link))} disabled={isSubmitting} />)}
          </div>
        ) : <div className="rounded-xl bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">No files or links selected yet.</div>}
      </div>
      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton count={files.length + links.length} isSubmitting={isSubmitting} onClick={() => submitDrafts({ title, contentType: selectedContentType, contents: [...files, ...links], note }, () => { setFiles([]); setLinks([]); setLinkInput(""); setNote(""); })} />
    </>
  );
}

function SelectedItem({ title, detail, onRemove, disabled }: { title: string; detail: string; onRemove: () => void; disabled?: boolean }) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-xl border bg-background px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <button type="button" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" onClick={onRemove} disabled={disabled} aria-label="Remove"><XIcon className="h-4 w-4" /></button>
    </div>
  );
}

function PickerEmpty({ label, href }: { label: string; href?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 p-5 text-center">
      <p className="text-sm font-medium text-foreground">No {label} uploaded yet.</p>
      {href ? <ManageLink href={href} label={`Manage ${label}`} /> : null}
    </div>
  );
}

function ManageLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:text-primary">{label}<ExternalLinkIcon className="h-3 w-3" /></Link>;
}

export function buildTimelineReferences(args: {
  entries: TimelineAttachmentItem[];
  audio: ManagedAudio[];
  occurrences: OccurrenceRecord[];
  treeGroups: Array<UploadTreeDatasetRecord | TimelineDatasetRecord>;
  places: ManagedLocation[];
}): TimelineReference[] {
  const audioByUri = new Map(args.audio.map((item) => [item.metadata.uri, item]));
  const occurrenceByUri = new Map(args.occurrences.map((item) => [item.atUri, item]));
  const treeByUri = new Map(args.treeGroups.map((item) => {
    if ("record" in item) return [item.metadata.uri, { uri: item.metadata.uri, name: item.record.name, description: item.record.description, recordCount: item.record.recordCount, createdAt: item.record.createdAt }] as const;
    return [item.uri, item] as const;
  }));
  const placeByUri = new Map(args.places.map((item) => [item.metadata.uri, item]));
  const uris = new Set<string>();
  for (const entry of args.entries) {
    for (const item of parseAttachmentContent(entry.record.content)) {
      if (item.kind === "uri" && item.uri.startsWith("at://")) uris.add(item.uri);
    }
  }
  return Array.from(uris).map((uri) => {
    const parsed = parseAtUri(uri);
    if (parsed?.collection === "app.gainforest.ac.audio") {
      const item = audioByUri.get(uri);
      return { id: uri, kind: "audio", title: item?.record.name ?? "Linked sound", description: formatDate(item?.record.recordedAt ?? item?.metadata.createdAt) || "Field sound", recordedAt: item?.record.recordedAt ?? item?.metadata.createdAt ?? null, actionHref: item?.record.audioUrl ?? undefined } satisfies TimelineReference;
    }
    if (parsed?.collection === "app.gainforest.dwc.dataset") {
      const item = treeByUri.get(uri);
      const stats = getTreeGroupStats(uri, args.occurrences);
      const title = item?.name ?? "Linked tree group";
      const count = stats.itemCount || item?.recordCount || 0;
      return { id: uri, kind: "tree", title, description: [`${formatNumber(count)} trees`, stats.speciesCount > 0 ? `${formatNumber(stats.speciesCount)} species` : null].filter(Boolean).join(" · "), recordedAt: item?.createdAt ?? null, dateRange: stats.dateRange, treeGroupUri: uri, metrics: { itemCount: count, treeCount: count, speciesCount: stats.speciesCount }, mapHref: greenGlobeTreePreview(parsed.did, uri), actionHref: greenGlobeTreePreview(parsed.did, uri) } satisfies TimelineReference;
    }
    if (parsed?.collection === "app.gainforest.dwc.occurrence") {
      const item = occurrenceByUri.get(uri);
      return { id: uri, kind: "occurrence", title: item?.scientificName ?? item?.vernacularName ?? "Linked sighting", description: [item?.individualCount ? `${formatNumber(item.individualCount)} individuals` : null, formatDate(item?.eventDate ?? item?.createdAt)].filter(Boolean).join(" · "), recordedAt: item?.eventDate ?? item?.createdAt ?? null, treeGroupUri: item?.datasetRef ?? null } satisfies TimelineReference;
    }
    if (parsed?.collection === "app.certified.location") {
      const item = placeByUri.get(uri);
      return { id: uri, kind: "location", title: item?.record.name ?? "Linked project place", description: item?.record.locationType ?? "Project place", actionHref: polygonsViewHref(uri) } satisfies TimelineReference;
    }
    return { id: uri, kind: "unknown", title: "Linked item" } satisfies TimelineReference;
  });
}

function greenGlobeTreePreview(did: string, treeGroupUri: string): string {
  const params = new URLSearchParams({ orgDid: did, datasetRef: treeGroupUri });
  return `https://greenglobe.gainforest.earth/tree-preview?${params.toString()}`;
}

function polygonsViewHref(locationUri: string): string {
  return `https://polygons-gainforest.vercel.app/view?${new URLSearchParams({ certifiedLocationRecordUri: locationUri }).toString()}`;
}
