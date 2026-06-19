"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
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
import { formatDate, formatNumber } from "@/app/_lib/format";
import {
  fetchAudioByDid,
  fetchLocationsByDid,
  fetchOccurrencesByDid,
  fetchTreeDatasetsByDid,
  type ManagedAudio,
  type ManagedLocation,
  type OccurrenceRecord,
  type TimelineAttachmentItem,
  type UploadTreeDatasetRecord,
} from "@/app/_lib/indexer";
import {
  buildDatasetSiteContexts,
  getDatasetSiteContext,
  groupDatasetUrisBySite,
  type DatasetSiteContext,
} from "./datasetSiteContext";
import {
  buildSelectableTreeDatasetUris,
  getTreeDatasetSelectionState,
  type DatasetSelectionDisabledReason,
} from "./datasetEvidenceSelection";
import { parseAtUri } from "./atUri";
import { parseAttachmentContent } from "./attachmentContentParser";
import { isAttachmentForActivity } from "./attachmentSubjects";
import {
  ATTACHMENT_MAX_FILE_BYTES,
  createContextAttachment,
  deleteContextAttachment,
  isAttachmentMutationInputError,
  type AttachmentDraft,
} from "./contextAttachmentMutations";
import {
  getOccurrenceDatasetRef,
  hasTreeDatasetMetadata,
  isTreeDatasetOccurrence,
} from "./treeEvidenceClassification";
import {
  buildTimelineReferences,
  getTimelineReferenceUrisForEntry,
  getTreeGroupStats,
  type TimelineReference,
  type TimelineReferenceCopy,
} from "./timelineReferences";

const CONTENT_TYPE_TREE_DATASET = "tree-dataset";
const CONTENT_TYPE_BIODIVERSITY = "biodiversity";
const CONTENT_TYPE_BIODIVERSITY_DATASET = "biodiversity-dataset";
const PAGE_SIZE = 8;

type TimelineSourceData = {
  audio: ManagedAudio[];
  occurrences: OccurrenceRecord[];
  occurrencesIncomplete: boolean;
  treeGroups: UploadTreeDatasetRecord[];
  places: ManagedLocation[];
};

type TimelineSourceStatus = "idle" | "loading" | "ready" | "error";

function hasTimelineSourceData(sources: TimelineSourceData): boolean {
  return sources.audio.length > 0 ||
    sources.occurrences.length > 0 ||
    sources.treeGroups.length > 0 ||
    sources.places.length > 0 ||
    sources.occurrencesIncomplete;
}

type TimelineMutationPermission = {
  allowed: boolean;
  reason: string | null;
};

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
type KnownFileContentType = "document" | "report" | "evidence" | "testimonial" | "methodology" | "photo" | "video" | "audio" | "other";

const FILTERS: Array<{ id: Exclude<EvidenceKind, "site" | "other"> }> = [
  { id: "all" },
  { id: "tree" },
  { id: "audio" },
  { id: "nature" },
  { id: "file" },
];

const EVIDENCE_TABS: Array<{ id: EvidenceTab; icon: LucideIcon }> = [
  { id: "audio", icon: MicIcon },
  { id: "trees", icon: TreesIcon },
  { id: "nature", icon: LeafIcon },
  { id: "files", icon: FileTextIcon },
];

const FILE_CONTENT_TYPES: KnownFileContentType[] = [
  "document",
  "report",
  "evidence",
  "testimonial",
  "methodology",
  "photo",
  "video",
  "audio",
  "other",
];

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
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

function getLinkedBiodiversityUris(entries: TimelineAttachmentItem[]): Set<string> {
  const linked = new Set<string>();
  for (const entry of entries) {
    if (evidenceKind(entry.record.contentType, entry.record.content) !== "nature") continue;
    for (const item of parseAttachmentContent(entry.record.content)) {
      if (item.kind !== "uri") continue;
      const collection = parseAtUri(item.uri)?.collection;
      if (collection === "app.gainforest.dwc.occurrence" || collection === "app.gainforest.dwc.dataset") linked.add(item.uri);
    }
  }
  return linked;
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

function previewForReference(uri: string, reference: TimelineReference | undefined, copy: { linkedNatureDataGroup: string }): PreviewPayload | null {
  if (reference?.kind === "location" && reference.actionHref) return { kind: "site", href: reference.actionHref, title: reference.title, body: reference.description };
  if (reference?.kind === "tree") return { kind: "text", href: "", title: reference.title, body: reference.description ?? "Linked tree information" };
  if (reference?.kind === "biodiversityDataset") return { kind: "text", href: "", title: reference.title, body: reference.description ?? copy.linkedNatureDataGroup };
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

function buildTiles(entryId: string, content: unknown, references: TimelineReference[], copy: { linkedNatureDataGroup: string }): TimelineTile[] {
  const refs = new Map(references.map((ref) => [ref.id, ref]));
  const tiles: TimelineTile[] = [];
  parseAttachmentContent(content).forEach((item, index) => {
    const id = `${entryId}-${index}`;
    if (item.kind === "blob") {
      if (!item.uri) return;
      const fileName = item.name ?? item.cid;
      const preview = previewFromHref(item.uri, item.mimeType, fileName);
      tiles.push({ id, kind: tileKindFromPreview(preview), title: preview.title, caption: preview.fileName ?? fileName ?? "Linked file", preview });
      return;
    }
    if (item.kind !== "uri") return;
    if (isHttpUrl(item.uri)) {
      const preview = previewFromHref(item.uri, null);
      tiles.push({ id, kind: tileKindFromPreview(preview), title: preview.title, caption: preview.fileName ?? item.uri, preview });
      return;
    }
    const reference = refs.get(item.uri);
    const preview = previewForReference(item.uri, reference, copy);
    const parsed = parseAtUri(item.uri);
    const kind: TileKind = reference?.kind === "tree" ? "tree" : reference?.kind === "occurrence" || reference?.kind === "biodiversityDataset" ? "nature" : reference?.kind === "audio" ? "audio" : reference?.kind === "location" ? "site" : "item";
    const title = reference?.title ?? (parsed?.collection === "app.gainforest.dwc.dataset" ? "Grouped data" : "Linked item");
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

function recordedDateForEntry(kind: EvidenceKind, references: TimelineReference[]): string {
  const referenceRange = references.find((ref) => ref.dateRange)?.dateRange;
  if (referenceRange) return referenceRange;
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
    const datasets = references.filter((ref) => ref.kind === "biodiversityDataset");
    const datasetObservationCount = datasets.reduce((sum, ref) => sum + (ref.metrics?.itemCount ?? 0), 0);
    const observationCount = observations.length + datasetObservationCount;
    const species = new Set(observations.map((ref) => ref.title.trim().toLowerCase()).filter(Boolean));
    const datasetSpeciesCount = datasets.reduce((sum, ref) => sum + (ref.metrics?.speciesCount ?? 0), 0);
    return [
      observationCount > 0 ? `${formatNumber(observationCount)} observations` : datasets.length > 0 ? `${formatNumber(datasets.length)} data groups` : null,
      species.size + datasetSpeciesCount > 0 ? `${formatNumber(species.size + datasetSpeciesCount)} species` : null,
    ].filter((value): value is string => Boolean(value));
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

type BiodiversityDatasetGroup = {
  uri: string;
  name: string;
  description: string | null;
  recordCount: number;
  records: OccurrenceRecord[];
  speciesCount: number;
  dateRange: string | null;
  recordedByValues: string[];
  searchText: string;
};

function occurrenceTitle(item: OccurrenceRecord): string {
  return item.scientificName ?? item.vernacularName ?? item.remarks ?? "Unknown observation";
}

function getSafeRecorderDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (/^(\/\/|www\.)/i.test(trimmed)) return null;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
  if (!trimmed.includes(" ") && /^@?[a-z0-9._-]+\.[a-z]{2,}$/i.test(trimmed)) return null;
  return trimmed;
}

function formatRecorderSummary(values: string[], options: { fallback: string; multiple: (count: number) => string; firstAndMore: (name: string, count: number) => string }): string | null {
  if (values.length === 0) return null;
  const displayValues = values.map(getSafeRecorderDisplayName).filter((value): value is string => Boolean(value));
  if (displayValues.length === 0) return values.length === 1 ? options.fallback : options.multiple(values.length);
  if (values.length === 1) return displayValues[0] ?? options.fallback;
  return options.firstAndMore(displayValues[0] ?? options.fallback, values.length - 1);
}

function uniqueRecordedByValues(items: OccurrenceRecord[]): string[] {
  const values = new Map<string, string>();
  for (const item of items) {
    const recordedBy = item.recordedBy?.trim();
    if (!recordedBy) continue;
    const key = recordedBy.toLowerCase();
    if (!values.has(key)) values.set(key, recordedBy);
  }
  return Array.from(values.values()).sort((left, right) => left.localeCompare(right));
}

function matchesRecordedBy(item: OccurrenceRecord, recordedBy: string): boolean {
  if (!recordedBy) return true;
  return item.recordedBy?.trim().toLowerCase() === recordedBy.toLowerCase();
}

function occurrenceSearchText(item: OccurrenceRecord, datasetName?: string | null): string {
  return [
    occurrenceTitle(item),
    item.kingdom,
    item.family,
    item.genus,
    item.locality,
    item.country,
    item.recordedBy ? getSafeRecorderDisplayName(item.recordedBy) : null,
    item.eventDate,
    datasetName ?? item.datasetName,
  ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ").toLowerCase();
}

function buildBiodiversityDatasetGroups(datasets: UploadTreeDatasetRecord[], occurrences: OccurrenceRecord[], fallbackGroupName: string): BiodiversityDatasetGroup[] {
  const datasetLookup = new Map(datasets.map((dataset) => [dataset.uri, dataset]));
  const recordsByDataset = new Map<string, OccurrenceRecord[]>();

  for (const occurrence of occurrences) {
    if (!occurrence.datasetRef) continue;
    const existing = recordsByDataset.get(occurrence.datasetRef) ?? [];
    existing.push(occurrence);
    recordsByDataset.set(occurrence.datasetRef, existing);
  }

  const datasetUris = new Set<string>([...datasets.map((dataset) => dataset.uri), ...recordsByDataset.keys()]);

  return Array.from(datasetUris).map((uri) => {
    const records = recordsByDataset.get(uri) ?? [];
    const dataset = datasetLookup.get(uri);
    const species = new Set(records.map((item) => occurrenceTitle(item).trim().toLowerCase()).filter(Boolean));
    const recordedByValues = uniqueRecordedByValues(records);
    const name = dataset?.name ?? records.find((item) => item.datasetName)?.datasetName ?? fallbackGroupName;
    const description = dataset?.description ?? null;
    const dateRange = formatDateRangeFromValues(records.map((item) => item.eventDate ?? item.createdAt));
    const searchableRecordedByValues = recordedByValues.map(getSafeRecorderDisplayName).filter((value): value is string => Boolean(value));
    const searchText = [
      name,
      description,
      dateRange,
      dataset?.createdAt,
      searchableRecordedByValues.join(" "),
      ...records.map((item) => occurrenceSearchText(item, name)),
    ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ").toLowerCase();

    return {
      uri,
      name,
      description,
      recordCount: Math.max(records.length, dataset?.recordCount ?? 0),
      records,
      speciesCount: species.size,
      dateRange,
      recordedByValues,
      searchText,
    };
  }).sort((left, right) => right.recordCount - left.recordCount || left.name.localeCompare(right.name));
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
  const timelineFallbacks = useMemo(() => ({
    linkedNatureDataGroup: timelineT("fallbacks.linkedNatureDataGroup"),
    linkedNatureData: timelineT("fallbacks.linkedNatureData"),
  }), [timelineT]);
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
  const title = titleForEntry(item, kind, refs, entryCopy);
  const badges = metricBadges(kind, refs, tiles.length);
  const linkedDate = formatDate(item.record.createdAt ?? item.metadata.createdAt) || entryT("notSpecified");
  const recordedDate = recordedDateForEntry(kind, refs);
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
          {mapHref ? <Link href={mapHref} target="_blank" rel="noreferrer" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Open map"><ExternalLinkIcon className="h-4 w-4" /></Link> : null}
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
          {mapHref && !activePreview ? <Link href={mapHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm text-foreground hover:bg-muted/30">View map <ExternalLinkIcon className="h-4 w-4" /></Link> : null}
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
  const [sourceState, setSourceState] = useState<{ status: TimelineSourceStatus; data: TimelineSourceData }>(() => ({
    status: hasTimelineSourceData(sources) ? "ready" : "idle",
    data: sources,
  }));
  const linkedTreeGroups = useMemo(() => getLinkedTreeGroupUris(entries), [entries]);
  const linkedBiodiversityUris = useMemo(() => getLinkedBiodiversityUris(entries), [entries]);
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
    if (activeTab === null || activeTab === "files" || sourceState.status !== "idle") return;

    const controller = new AbortController();
    let cancelled = false;

    setSourceState((current) => ({ ...current, status: "loading" }));
    Promise.all([
      fetchAudioByDid(organizationDid, controller.signal).catch(() => []),
      fetchOccurrencesByDid(organizationDid, 10000, null, controller.signal).catch(() => ({ records: [] as OccurrenceRecord[], cursor: null, hasMore: true })),
      fetchTreeDatasetsByDid(organizationDid, controller.signal).catch(() => []),
      fetchLocationsByDid(organizationDid, controller.signal).catch(() => []),
    ]).then(([audio, occurrencePage, treeGroups, places]) => {
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
    }).catch((err) => {
      if (cancelled || (err instanceof Error && err.name === "AbortError")) return;
      setSourceState((current) => ({ ...current, status: "error" }));
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, organizationDid]);

  function mutationErrorMessage(error: unknown): string {
    if (!isAttachmentMutationInputError(error)) {
      console.error("Unable to link timeline evidence", error);
      return evidenceT("linkError");
    }

    switch (error.code) {
      case "file-too-large":
        return evidenceT("validation.fileTooLarge", { maxSize: formatFileSize(ATTACHMENT_MAX_FILE_BYTES) });
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

  async function submitDrafts(drafts: AttachmentDraft | AttachmentDraft[], onSuccess?: () => void) {
    const items = (Array.isArray(drafts) ? drafts : [drafts]).filter((draft) => draft.contents.length > 0);
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
        setError(evidenceT("partialLinkSuccess", { createdCount: created.length, totalCount: items.length, error: message }));
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
      <div className="flex flex-col">
        <span className="text-2xl font-medium text-foreground">{evidenceT("chooseEvidenceType")}</span>
        <span className="text-sm text-muted-foreground">{evidenceT("selectSourceToLink")}</span>
        {!createPermission.allowed ? <p className="mt-3 rounded-xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">{createPermission.reason ?? evidenceT("permissions.createDenied")}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EVIDENCE_TABS.map(({ id, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} disabled={!createPermission.allowed} title={!createPermission.allowed ? createPermission.reason ?? evidenceT("permissions.createDenied") : undefined} className="flex min-h-32 flex-col items-start justify-between rounded-2xl border border-border/60 bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60">
              <Icon className="h-5 w-5 text-primary/70" />
              <span>
                <span className="block text-base font-medium text-foreground">{tabLabels[id]}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{tabDescriptions[id]}</span>
              </span>
            </button>
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
        <Button type="button" variant="secondary" size="icon-sm" disabled={isSubmitting} onClick={() => setActiveTab(null)}><ChevronLeftIcon /></Button>
        <div className="flex flex-col">
          <span className="text-2xl font-medium text-foreground">{evidenceT("linkType", { type: tabLabels[activeConfig.id] })}</span>
          <span className="text-sm text-muted-foreground">{evidenceT("selectRecordsToLink")}</span>
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
          <p className="rounded-xl border border-warn/20 bg-warn/10 px-3 py-2 text-sm text-warn">{evidenceT("sourcesLoadError")}</p>
        ) : null}
        {sourceState.status === "ready" && activeTab === "audio" ? <AudioPicker data={activeSources.audio} isSubmitting={isSubmitting} submitDrafts={submitDrafts} /> : null}
        {sourceState.status === "ready" && activeTab === "trees" ? <TreeGroupPicker data={activeSources.treeGroups} occurrences={activeSources.occurrences} places={activeSources.places} linkedTreeGroups={linkedTreeGroups} timelineAttachmentsUnavailable={attachmentsUnavailable} occurrenceCoverageIncomplete={activeSources.occurrencesIncomplete} isSubmitting={isSubmitting} submitDrafts={submitDrafts} /> : null}
        {sourceState.status === "ready" && activeTab === "nature" ? <BiodiversityPicker occurrences={activeSources.occurrences} datasets={activeSources.treeGroups} linkedUris={linkedBiodiversityUris} isSubmitting={isSubmitting} submitDrafts={submitDrafts} /> : null}
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
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{evidenceT("optionalNote")}</label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={evidenceT("optionalNotePlaceholder")} rows={3} />
    </div>
  );
}

function SubmitButton({ count, isSubmitting, onClick }: { count: number; isSubmitting: boolean; onClick: () => void }) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  return (
    <Button type="button" onClick={onClick} disabled={isSubmitting || count === 0} className="w-full">
      {isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
      {isSubmitting ? evidenceT("linking") : count === 0 ? evidenceT("selectToLink") : evidenceT("linkItems", { count })}
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

function TreeGroupPicker({
  data,
  occurrences,
  places,
  linkedTreeGroups,
  timelineAttachmentsUnavailable,
  occurrenceCoverageIncomplete,
  isSubmitting,
  submitDrafts,
}: {
  data: UploadTreeDatasetRecord[];
  occurrences: OccurrenceRecord[];
  places: ManagedLocation[];
  linkedTreeGroups: Set<string>;
  timelineAttachmentsUnavailable: boolean;
  occurrenceCoverageIncomplete: boolean;
  isSubmitting: boolean;
  submitDrafts: (drafts: AttachmentDraft[], onSuccess?: () => void) => void;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const treeDatasetMetadataUris = useMemo(() => new Set(
    data.filter(hasTreeDatasetMetadata).map((item) => item.uri),
  ), [data]);
  const treeOccurrences = useMemo(() => occurrences.filter((occurrence) => isTreeDatasetOccurrence(
    occurrence,
    { treeDatasetUrisWithMetadata: treeDatasetMetadataUris },
  )), [occurrences, treeDatasetMetadataUris]);
  const treeDatasetUris = useMemo(() => new Set(
    treeOccurrences.map(getOccurrenceDatasetRef).filter((uri): uri is string => Boolean(uri)),
  ), [treeOccurrences]);
  const rows = useMemo(() => data.filter((item) => item.uri && (hasTreeDatasetMetadata(item) || treeDatasetUris.has(item.uri))), [data, treeDatasetUris]);
  const siteContextsByDataset = useMemo(() => buildDatasetSiteContexts({
    occurrences: treeOccurrences.flatMap((occurrence) => {
      const datasetUri = getOccurrenceDatasetRef(occurrence);
      return datasetUri ? [{ datasetUri, siteRef: occurrence.siteRef }] : [];
    }),
    locations: places,
  }), [treeOccurrences, places]);
  const selectableUris = useMemo(() => buildSelectableTreeDatasetUris({
    rows,
    siteContextsByDataset,
    linkedDatasetUris: linkedTreeGroups,
    timelineAttachmentsUnavailable,
    siteContextsUnavailable: occurrenceCoverageIncomplete,
  }), [linkedTreeGroups, occurrenceCoverageIncomplete, rows, siteContextsByDataset, timelineAttachmentsUnavailable]);
  const selectedDatasetUris = Array.from(selected).filter((uri) => selectableUris.has(uri));
  const groupedSelections = groupDatasetUrisBySite({ datasetUris: selectedDatasetUris, contexts: siteContextsByDataset });
  const drafts = groupedSelections.map((group) => ({
    title: evidenceT("attachmentTitles.trees"),
    contentType: CONTENT_TYPE_TREE_DATASET,
    contents: group.datasetUris,
    note,
    contextualSubjects: [group.siteSubject],
  }) satisfies AttachmentDraft);

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

  function disabledReasonLabel(reason: DatasetSelectionDisabledReason | null, context: DatasetSiteContext): string | null {
    if (reason === "already-linked") return evidenceT("alreadyLinkedDataset");
    if (reason === "checking-existing-links") return evidenceT("checkingExistingLinks");
    if (reason === "unable-to-verify-existing-links") return evidenceT("unableToVerifyExistingLinks");
    if (reason === "unable-to-verify-site-context") return evidenceT("unableToVerifyTreeSiteContext");
    if (reason) return siteContextLabel(context);
    return null;
  }

  function toggle(uri: string) {
    if (!selectableUris.has(uri)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }

  if (rows.length === 0) return <PickerEmpty label={evidenceT("emptyLabels.trees")} href="/manage/trees" />;

  return (
    <>
      <div className="grid gap-2">
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
          const status = disabledReasonLabel(selectionState.disabledReason, siteContext);
          const secondary = [
            evidenceT("treeCount", { count: stats.itemCount || item.recordCount || 0 }),
            stats.speciesCount > 0 ? evidenceT("speciesCount", { count: stats.speciesCount }) : null,
            stats.dateRange,
            siteContext.status === "ready" ? siteContextLabel(siteContext) : null,
          ].filter(Boolean).join(" · ");
          return <CheckRow key={item.uri} selected={selectionState.canSelect && selected.has(item.uri)} onToggle={() => toggle(item.uri)} icon={TreesIcon} primary={item.name || evidenceT("unnamedTreeDataset")} secondary={secondary} status={status ?? undefined} disabled={isSubmitting || !selectionState.canSelect} />;
        })}
      </div>
      <ManageLink href="/manage/trees" label={evidenceT("manageType", { type: evidenceT("emptyLabels.trees") })} />
      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton count={selectedDatasetUris.length} isSubmitting={isSubmitting} onClick={() => submitDrafts(drafts, () => { setSelected(new Set()); setNote(""); })} />
    </>
  );
}

function BiodiversityPicker({
  occurrences,
  datasets,
  linkedUris,
  isSubmitting,
  submitDrafts,
}: {
  occurrences: OccurrenceRecord[];
  datasets: UploadTreeDatasetRecord[];
  linkedUris: Set<string>;
  isSubmitting: boolean;
  submitDrafts: (drafts: AttachmentDraft[], onSuccess?: () => void) => void;
}) {
  const biodiversityT = useTranslations("bumicert.detail.evidenceAdder.biodiversity");
  const [selectedOccurrences, setSelectedOccurrences] = useState<Set<string>>(new Set());
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set());
  const [recordedByFilter, setRecordedByFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [note, setNote] = useState("");
  const rows = useMemo(() => occurrences.filter((item) => item.atUri), [occurrences]);
  const datasetGroups = useMemo(() => buildBiodiversityDatasetGroups(datasets, rows, biodiversityT("groupedNatureDataFallback")), [biodiversityT, datasets, rows]);
  const datasetByUri = useMemo(() => new Map(datasetGroups.map((group) => [group.uri, group])), [datasetGroups]);
  const datasetNameByUri = useMemo(() => new Map(datasetGroups.map((group) => [group.uri, group.name])), [datasetGroups]);
  const recordedByOptions = useMemo(() => uniqueRecordedByValues(rows), [rows]);
  const normalizedRecordedBy = recordedByFilter.trim().toLowerCase();
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const displayedRows = useMemo(() => rows.filter((item) => {
    if (!matchesRecordedBy(item, normalizedRecordedBy)) return false;
    if (!normalizedSearch) return true;
    return occurrenceSearchText(item, item.datasetRef ? datasetNameByUri.get(item.datasetRef) : null).includes(normalizedSearch);
  }), [datasetNameByUri, normalizedRecordedBy, normalizedSearch, rows]);
  const displayedDatasets = useMemo(() => datasetGroups.map((group) => {
    const groupDetailsSearchText = [group.name, group.description, group.dateRange, group.recordedByValues.map(getSafeRecorderDisplayName).filter(Boolean).join(" ")]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase();
    const groupDetailsMatch = !normalizedSearch || groupDetailsSearchText.includes(normalizedSearch);
    const matchingRecords = group.records.filter((item) => {
      if (!matchesRecordedBy(item, normalizedRecordedBy)) return false;
      if (!normalizedSearch || groupDetailsMatch) return true;
      return occurrenceSearchText(item, group.name).includes(normalizedSearch);
    });
    return { ...group, groupDetailsMatch, matchingRecords };
  }).filter((group) => {
    if (group.matchingRecords.length > 0) return true;
    return !normalizedRecordedBy && group.groupDetailsMatch;
  }), [datasetGroups, normalizedRecordedBy, normalizedSearch]);
  const linkedDatasetUris = useMemo(() => new Set(Array.from(linkedUris).filter((uri) => datasetByUri.has(uri))), [datasetByUri, linkedUris]);
  const selectedOrLinkedDatasetUris = useMemo(() => new Set([...linkedDatasetUris, ...selectedDatasets]), [linkedDatasetUris, selectedDatasets]);
  const isCoveredBySelectedOrLinkedDataset = useCallback((item: OccurrenceRecord) => Boolean(item.datasetRef && selectedOrLinkedDatasetUris.has(item.datasetRef)), [selectedOrLinkedDatasetUris]);
  const displayedRowUris = displayedRows
    .filter((item) => !isCoveredBySelectedOrLinkedDataset(item))
    .map((item) => item.atUri)
    .filter((uri): uri is string => Boolean(uri) && !linkedUris.has(uri));
  const allDisplayedSelected = displayedRowUris.length > 0 && displayedRowUris.every((uri) => selectedOccurrences.has(uri));
  const selectableSelectedOccurrenceCount = Array.from(selectedOccurrences).filter((uri) => {
    const item = rows.find((row) => row.atUri === uri);
    return item && !linkedUris.has(uri) && !isCoveredBySelectedOrLinkedDataset(item);
  }).length;
  const selectedCount = selectableSelectedOccurrenceCount + selectedDatasets.size;
  const allRecordersValue = "__all_recorders__";
  const searchInputId = useId();
  const recorderLabelId = useId();

  function toggleOccurrence(uri: string) {
    if (linkedUris.has(uri)) return;
    const item = rows.find((row) => row.atUri === uri);
    if (item && isCoveredBySelectedOrLinkedDataset(item)) return;
    setSelectedOccurrences((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }

  function toggleDataset(uri: string) {
    if (linkedUris.has(uri)) return;
    const willSelect = !selectedDatasets.has(uri);
    setSelectedDatasets((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
    if (willSelect) {
      const memberUris = new Set((datasetByUri.get(uri)?.records ?? []).map((item) => item.atUri).filter(Boolean));
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
      return [{ title: group?.name ?? biodiversityT("attachmentGroupTitle"), contentType: CONTENT_TYPE_BIODIVERSITY_DATASET, contents: [uri], note } satisfies AttachmentDraft];
    });
    const drafts = [
      ...datasetDrafts,
      ...(occurrenceUris.length > 0 ? [{ title: biodiversityT("attachmentObservationsTitle"), contentType: CONTENT_TYPE_BIODIVERSITY, contents: occurrenceUris, note } satisfies AttachmentDraft] : []),
    ];
    submitDrafts(drafts, () => {
      setSelectedOccurrences(new Set());
      setSelectedDatasets(new Set());
      setNote("");
    });
  }

  if (rows.length === 0 && datasetGroups.length === 0) return <PickerEmpty label={biodiversityT("emptyLabel")} href="/manage/trees" />;

  return (
    <>
      <div className="grid gap-3">
        <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={searchInputId} className="text-sm font-medium">{biodiversityT("searchLabel")}</label>
            <Input id={searchInputId} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} disabled={isSubmitting} placeholder={biodiversityT("searchPlaceholder")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span id={recorderLabelId} className="text-sm font-medium">{biodiversityT("recorderLabel")}</span>
            <Select value={recordedByFilter || allRecordersValue} onValueChange={(value) => setRecordedByFilter(value === allRecordersValue ? "" : value)} disabled={isSubmitting || recordedByOptions.length === 0}>
              <SelectTrigger aria-labelledby={recorderLabelId}><SelectValue placeholder={biodiversityT("allRecorders")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={allRecordersValue}>{biodiversityT("allRecorders")}</SelectItem>
                {recordedByOptions.map((recordedBy, index) => <SelectItem key={recordedBy} value={recordedBy}>{getSafeRecorderDisplayName(recordedBy) ?? biodiversityT("recorderOptionFallback", { number: index + 1 })}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <section className="rounded-xl border border-border/60 bg-background p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{biodiversityT("displayedTitle")}</p>
              <p className="text-xs text-muted-foreground">{biodiversityT("displayedSummary", { shown: displayedRows.length, total: rows.length })}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={toggleDisplayedRows} disabled={isSubmitting || displayedRowUris.length === 0}>
              {allDisplayedSelected ? biodiversityT("clearDisplayed") : biodiversityT("selectDisplayed")}
            </Button>
          </div>
          {displayedRows.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">{biodiversityT("noDataMatches")}</p>
          ) : (
            <div className="mt-3 grid max-h-[360px] gap-2 overflow-auto pr-1">
              {displayedRows.map((item) => {
                const title = occurrenceTitle(item);
                const datasetName = item.datasetRef ? datasetNameByUri.get(item.datasetRef) ?? item.datasetName : item.datasetName;
                const secondary = [
                  item.kingdom,
                  formatDate(item.eventDate ?? item.createdAt),
                  item.locality,
                  item.recordedBy ? biodiversityT("recordedBy", { name: getSafeRecorderDisplayName(item.recordedBy) ?? biodiversityT("recorderFallback") }) : null,
                  datasetName,
                ].filter(Boolean).join(" · ");
                const alreadyLinked = linkedUris.has(item.atUri);
                const coveredByDataset = isCoveredBySelectedOrLinkedDataset(item);
                return <CheckRow key={item.atUri} selected={!alreadyLinked && !coveredByDataset && selectedOccurrences.has(item.atUri)} onToggle={() => toggleOccurrence(item.atUri)} icon={LeafIcon} primary={title} secondary={secondary} status={alreadyLinked ? biodiversityT("alreadyLinked") : coveredByDataset ? biodiversityT("coveredByGroup") : undefined} disabled={isSubmitting || alreadyLinked || coveredByDataset} />;
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border/60 bg-background p-3">
          <p className="text-sm font-medium text-foreground">{biodiversityT("groupsTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{biodiversityT("groupsDescription")}</p>
          {displayedDatasets.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">{biodiversityT("noGroupsMatch")}</p>
          ) : (
            <div className="mt-3 grid gap-2">
              {displayedDatasets.map((group) => {
                const alreadyLinked = linkedUris.has(group.uri);
                const recorder = formatRecorderSummary(group.recordedByValues, {
                  fallback: biodiversityT("recorderFallback"),
                  multiple: (count) => biodiversityT("multipleRecorders", { count }),
                  firstAndMore: (name, count) => biodiversityT("firstRecorderAndMore", { name, count }),
                });
                const secondary = [
                  biodiversityT("shownCount", { count: group.matchingRecords.length }),
                  biodiversityT("totalCount", { count: group.recordCount }),
                  group.speciesCount > 0 ? biodiversityT("speciesCount", { count: group.speciesCount }) : null,
                  group.dateRange,
                  recorder ? biodiversityT("recordedBy", { name: recorder }) : null,
                ].filter(Boolean).join(" · ");
                return <CheckRow key={group.uri} selected={!alreadyLinked && selectedDatasets.has(group.uri)} onToggle={() => toggleDataset(group.uri)} icon={DatabaseIcon} primary={group.name} secondary={secondary} status={alreadyLinked ? biodiversityT("alreadyLinked") : biodiversityT("groupStatus")} disabled={isSubmitting || alreadyLinked} />;
              })}
            </div>
          )}
        </section>
      </div>
      <ManageLink href="/manage/trees" label={biodiversityT("manageData")} />
      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton count={selectedCount} isSubmitting={isSubmitting} onClick={submitSelection} />
    </>
  );
}

function FilePicker({ isSubmitting, submitDrafts }: { isSubmitting: boolean; submitDrafts: (draft: AttachmentDraft, onSuccess?: () => void) => void }) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const [selectedContentType, setSelectedContentType] = useState<KnownFileContentType>("document");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const inputId = useId();
  const contentTypeLabels: Record<KnownFileContentType, string> = {
    document: evidenceT("contentTypes.document"),
    report: evidenceT("contentTypes.report"),
    evidence: evidenceT("contentTypes.evidence"),
    testimonial: evidenceT("contentTypes.testimonial"),
    methodology: evidenceT("contentTypes.methodology"),
    photo: evidenceT("contentTypes.photo"),
    video: evidenceT("contentTypes.video"),
    audio: evidenceT("contentTypes.audio"),
    other: evidenceT("contentTypes.other"),
  };

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
        setLinkError(evidenceT("invalidUrlProtocol"));
        return;
      }
      const normalized = parsed.toString();
      setLinks((current) => current.includes(normalized) ? current : [...current, normalized]);
      setLinkInput("");
    } catch {
      setLinkError(evidenceT("invalidUrl"));
    }
  }
  const title = contentTypeLabels[selectedContentType] ?? evidenceT("contentTypes.evidence");
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">{evidenceT("contentType")}</label>
          <Select value={selectedContentType} onValueChange={(value) => setSelectedContentType(value as KnownFileContentType)} disabled={isSubmitting}>
            <SelectTrigger><SelectValue placeholder={evidenceT("selectContentType")} /></SelectTrigger>
            <SelectContent>{FILE_CONTENT_TYPES.map((value) => <SelectItem key={value} value={value}>{contentTypeLabels[value]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label htmlFor={inputId} className={cn("grid min-h-[120px] cursor-pointer place-items-center rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center transition-colors hover:border-primary/40", isSubmitting && "pointer-events-none opacity-70")}>
          <span><PaperclipIcon className="mx-auto h-6 w-6 text-muted-foreground" /><span className="mt-2 block text-sm font-medium text-foreground">{evidenceT("addFilePlaceholder")}</span><span className="mt-1 block text-xs text-muted-foreground">{evidenceT("fileHelp", { maxSize: formatFileSize(ATTACHMENT_MAX_FILE_BYTES) })}</span></span>
          <input id={inputId} type="file" className="sr-only" multiple accept="image/*,audio/*,video/*,application/*,text/*" disabled={isSubmitting} onChange={(event) => { appendFileList(event.target.files); event.currentTarget.value = ""; }} />
        </label>
        <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-background p-3">
          <label className="text-sm font-medium">{evidenceT("externalLink")}</label>
          <div className="flex gap-2">
            <Input value={linkInput} placeholder="https://example.org/report" disabled={isSubmitting} aria-invalid={linkError ? true : undefined} onChange={(event) => setLinkInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} />
            <Button type="button" variant="secondary" onClick={addLink} disabled={isSubmitting || linkInput.trim().length === 0}>{evidenceT("addLink")}</Button>
          </div>
          <p className={cn("text-xs", linkError ? "text-destructive" : "text-muted-foreground")}>{linkError ?? evidenceT("externalLinkHelp")}</p>
        </div>
        {files.length > 0 || links.length > 0 ? (
          <div className="grid gap-2">
            {files.map((file) => {
              const key = toFileKey(file);
              return <SelectedItem key={key} title={file.name} detail={`${formatFileSize(file.size)}${file.type ? ` · ${file.type}` : ""}`} onRemove={() => setFiles((current) => current.filter((item) => toFileKey(item) !== key))} disabled={isSubmitting} removeLabel={evidenceT("remove")} />;
            })}
            {links.map((link) => <SelectedItem key={link} title={evidenceT("externalLink")} detail={link} onRemove={() => setLinks((current) => current.filter((item) => item !== link))} disabled={isSubmitting} removeLabel={evidenceT("remove")} />)}
          </div>
        ) : <div className="rounded-xl bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">{evidenceT("noFilesSelected")}</div>}
      </div>
      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton count={files.length + links.length} isSubmitting={isSubmitting} onClick={() => submitDrafts({ title, contentType: selectedContentType, contents: [...files, ...links], note }, () => { setFiles([]); setLinks([]); setLinkInput(""); setNote(""); })} />
    </>
  );
}

function SelectedItem({ title, detail, onRemove, disabled, removeLabel }: { title: string; detail: string; onRemove: () => void; disabled?: boolean; removeLabel: string }) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-xl border bg-background px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <button type="button" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" onClick={onRemove} disabled={disabled} aria-label={removeLabel}><XIcon className="h-4 w-4" /></button>
    </div>
  );
}

function PickerEmpty({ label, href }: { label: string; href?: string }) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  return (
    <div className="rounded-xl border border-dashed border-border/70 p-5 text-center">
      <p className="text-sm font-medium text-foreground">{evidenceT("emptyUploaded", { type: label })}</p>
      {href ? <ManageLink href={href} label={evidenceT("manageType", { type: label })} /> : null}
    </div>
  );
}

function ManageLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:text-primary">{label}<ExternalLinkIcon className="h-3 w-3" /></Link>;
}
