"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ImagePlusIcon,
  Layers2Icon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  SparklesIcon,
  UngroupIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { RecordExplorer } from "@/app/_components/RecordExplorer";
import { TAINA_SIM } from "@/app/_lib/taina-sim";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Container from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import TelegramIcon from "@/icons/TelegramIcon";
import { manageHref, type ManageTarget } from "@/lib/links";
import { canCreateRecord } from "../../_lib/cgs-permissions";
import {
  configureObservationMutationRepo,
  createObservationOccurrence,
  createObservationPhoto,
  formatObservationMutationError,
} from "./observation-mutations";

type InitialPage = NonNullable<ComponentProps<typeof RecordExplorer>["initialPage"]>;
type Mode = "list" | "add";
type ItemStatus = "analyzing" | "ready" | "error" | "uploading" | "uploaded" | "uploadError";

type ObservationAnalysis = {
  scientificName: string;
  vernacularName: string;
  kingdom: string;
  eventDate: string;
  recordedBy: string;
  decimalLatitude: string;
  decimalLongitude: string;
  country: string;
  locality: string;
  habitat: string;
  occurrenceRemarks: string;
  subjectPart: string;
  caption: string;
  confidence: number | null;
};

type ObservationUploadItem = {
  id: string;
  file: File;
  previewUrl: string;
  originalSize: number;
  compressed: boolean;
  groupId: string;
  selected: boolean;
  status: ItemStatus;
  progress: number;
  analysis: ObservationAnalysis;
  error: string | null;
  uploadedUri: string | null;
};

type SharedOccurrenceKey = Exclude<keyof ObservationAnalysis, "subjectPart" | "caption" | "confidence">;

const TAINA_BOT_URL = "https://t.me/The" + "Tain" + "aBot";
const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
// Shared column template so the table header and each row line up. Columns:
// checkbox · thumbnail · organism · date · location · trailing actions.
// Every non-flex track is a fixed width (and the trailing column is fixed too)
// so the header grid and each row grid resolve their fr columns identically.
const ROW_GRID =
  "grid items-center gap-x-3 grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_8.5rem] md:grid-cols-[1.5rem_2.5rem_minmax(0,2fr)_6.5rem_minmax(0,1.3fr)_8.5rem]";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const EMPTY_ANALYSIS: ObservationAnalysis = {
  scientificName: "",
  vernacularName: "",
  kingdom: "Plantae",
  eventDate: "",
  recordedBy: "",
  decimalLatitude: "",
  decimalLongitude: "",
  country: "",
  locality: "",
  habitat: "",
  occurrenceRemarks: "",
  subjectPart: "wholeOrganism",
  caption: "",
  confidence: null,
};

type AnalyzeResponse = { analysis?: Partial<ObservationAnalysis>; error?: string };

function cleanFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function dateFromFile(file: File): string {
  const date = file.lastModified ? new Date(file.lastModified) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function parseExifDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function formatCoordinate(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(7)).toString();
}

function rationalAt(view: DataView, offset: number, littleEndian: boolean): number | null {
  if (offset < 0 || offset + 8 > view.byteLength) return null;
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  if (denominator === 0) return null;
  return numerator / denominator;
}

function gpsCoordinate(parts: Array<number | null>, ref: string | null): string | null {
  if (parts.some((part) => part === null)) return null;
  const [degrees, minutes, seconds] = parts as [number, number, number];
  let value = degrees + minutes / 60 + seconds / 3600;
  if (ref === "S" || ref === "W") value *= -1;
  return formatCoordinate(value);
}

type TiffEntry = { tag: number; type: number; count: number; valueOffset: number; inlineOffset: number; size: number };

function parseExifMetadata(buffer: ArrayBuffer): Partial<ObservationAnalysis> {
  const view = new DataView(buffer);
  if (view.byteLength < 14 || view.getUint16(0) !== 0xffd8) return {};

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2, false);
    if (length < 2) break;
    if (marker === 0xe1 && length >= 8) {
      const exifStart = offset + 4;
      const header = String.fromCharCode(...new Uint8Array(buffer, exifStart, Math.min(6, view.byteLength - exifStart)));
      if (header === "Exif\0\0") {
        const tiffStart = exifStart + 6;
        if (tiffStart + 8 > view.byteLength) return {};
        const littleEndian = view.getUint16(tiffStart, false) === 0x4949;
        if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return {};

        const typeSize = (type: number) => {
          if (type === 1 || type === 2 || type === 7) return 1;
          if (type === 3) return 2;
          if (type === 4 || type === 9) return 4;
          if (type === 5 || type === 10) return 8;
          return 0;
        };
        const readEntries = (ifdOffset: number): TiffEntry[] => {
          const start = tiffStart + ifdOffset;
          if (start < 0 || start + 2 > view.byteLength) return [];
          const count = view.getUint16(start, littleEndian);
          const entries: TiffEntry[] = [];
          for (let index = 0; index < count; index += 1) {
            const entryOffset = start + 2 + index * 12;
            if (entryOffset + 12 > view.byteLength) break;
            const type = view.getUint16(entryOffset + 2, littleEndian);
            const itemCount = view.getUint32(entryOffset + 4, littleEndian);
            const size = typeSize(type) * itemCount;
            entries.push({
              tag: view.getUint16(entryOffset, littleEndian),
              type,
              count: itemCount,
              valueOffset: view.getUint32(entryOffset + 8, littleEndian),
              inlineOffset: entryOffset + 8,
              size,
            });
          }
          return entries;
        };
        const valueOffset = (entry: TiffEntry) => entry.size <= 4 ? entry.inlineOffset : tiffStart + entry.valueOffset;
        const readAscii = (entry: TiffEntry | undefined): string | null => {
          if (!entry) return null;
          const start = valueOffset(entry);
          if (start < 0 || start + entry.count > view.byteLength) return null;
          return String.fromCharCode(...new Uint8Array(buffer, start, entry.count)).replace(/\0+$/, "").trim() || null;
        };
        const readRationals = (entry: TiffEntry | undefined): Array<number | null> => {
          if (!entry) return [];
          const start = valueOffset(entry);
          return Array.from({ length: entry.count }, (_, index) => rationalAt(view, start + index * 8, littleEndian));
        };
        const readLong = (entry: TiffEntry | undefined): number | null => {
          if (!entry) return null;
          const start = valueOffset(entry);
          if (start < 0 || start + 4 > view.byteLength) return null;
          return view.getUint32(start, littleEndian);
        };

        const ifd0 = readEntries(view.getUint32(tiffStart + 4, littleEndian));
        const byTag = (entries: TiffEntry[], tag: number) => entries.find((entry) => entry.tag === tag);
        const exifIfd = readLong(byTag(ifd0, 0x8769));
        const gpsIfd = readLong(byTag(ifd0, 0x8825));
        const exifEntries = exifIfd !== null ? readEntries(exifIfd) : [];
        const gpsEntries = gpsIfd !== null ? readEntries(gpsIfd) : [];

        const date = parseExifDate(readAscii(byTag(exifEntries, 0x9003)) ?? readAscii(byTag(ifd0, 0x0132)));
        const latitude = gpsCoordinate(readRationals(byTag(gpsEntries, 0x0002)), readAscii(byTag(gpsEntries, 0x0001)));
        const longitude = gpsCoordinate(readRationals(byTag(gpsEntries, 0x0004)), readAscii(byTag(gpsEntries, 0x0003)));

        return {
          ...(date ? { eventDate: date } : {}),
          ...(latitude ? { decimalLatitude: latitude } : {}),
          ...(longitude ? { decimalLongitude: longitude } : {}),
        };
      }
    }
    offset += 2 + length;
  }

  return {};
}

async function imageMetadata(file: File): Promise<Partial<ObservationAnalysis>> {
  try {
    return parseExifMetadata(await file.arrayBuffer());
  } catch {
    return {};
  }
}

function mergeAnalysisWithDefaults(analysis: ObservationAnalysis, defaults: Partial<ObservationAnalysis>): ObservationAnalysis {
  return {
    ...analysis,
    eventDate: analysis.eventDate || defaults.eventDate || "",
    decimalLatitude: analysis.decimalLatitude || defaults.decimalLatitude || "",
    decimalLongitude: analysis.decimalLongitude || defaults.decimalLongitude || "",
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not prepare image."));
    }, mimeType, quality);
  });
}

async function compressImageIfNeeded(file: File): Promise<{ file: File; compressed: boolean; originalSize: number }> {
  if (file.size <= MAX_IMAGE_BYTES) return { file, compressed: false, originalSize: file.size };

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image.");

  let width = bitmap.width;
  let height = bitmap.height;
  const mimeType = "image/jpeg";
  const extensionless = file.name.replace(/\.[^.]+$/, "") || "observation";

  for (const scale of [1, 0.86, 0.72, 0.6, 0.5, 0.42]) {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46]) {
      const blob = await canvasToBlob(canvas, mimeType, quality);
      if (blob.size <= MAX_IMAGE_BYTES) {
        return {
          file: new File([blob], `${extensionless}.jpg`, { type: mimeType, lastModified: file.lastModified }),
          compressed: true,
          originalSize: file.size,
        };
      }
    }
  }

  throw new Error("Could not prepare image.");
}

function normalizeAnalysis(raw: Partial<ObservationAnalysis> | undefined, file: File): ObservationAnalysis {
  const fallbackDate = dateFromFile(file);
  return {
    scientificName: raw?.scientificName?.trim() || "Unidentified organism",
    vernacularName: raw?.vernacularName?.trim() || "",
    kingdom: raw?.kingdom?.trim() || "Plantae",
    eventDate: raw?.eventDate?.trim() || fallbackDate,
    recordedBy: raw?.recordedBy?.trim() || "",
    decimalLatitude: raw?.decimalLatitude?.trim() || "",
    decimalLongitude: raw?.decimalLongitude?.trim() || "",
    country: raw?.country?.trim() || "",
    locality: raw?.locality?.trim() || "",
    habitat: raw?.habitat?.trim() || "",
    occurrenceRemarks: raw?.occurrenceRemarks?.trim() || "",
    subjectPart: raw?.subjectPart?.trim() || "wholeOrganism",
    caption: raw?.caption?.trim() || cleanFileName(file.name),
    confidence: typeof raw?.confidence === "number" ? raw.confidence : null,
  };
}

function analysisErrorMessage(code: string | undefined, t: ReturnType<typeof useTranslations>): string {
  if (code === "not_configured") return t("analysisNotConfigured");
  if (code === "unsupported_image") return t("unsupportedImage");
  if (code === "image_too_large") return t("imageTooLarge");
  return t("analysisFailed");
}

function itemCanUpload(item: ObservationUploadItem): boolean {
  return (item.status === "ready" || item.status === "uploadError") && item.analysis.scientificName.trim().length > 0 && item.analysis.eventDate.trim().length > 0;
}

type GroupOption = { id: string; number: number; count: number; label: string; previewUrl: string };

function groupDisplayName(items: ObservationUploadItem[]): string {
  for (const item of items) {
    const scientific = item.analysis.scientificName.trim();
    if (scientific && scientific !== "Unidentified organism") return scientific;
  }
  for (const item of items) {
    const common = item.analysis.vernacularName.trim();
    if (common) return common;
  }
  return "";
}

function observationGroupOptions(items: ObservationUploadItem[]): GroupOption[] {
  const order: string[] = [];
  const groups = new Map<string, ObservationUploadItem[]>();
  for (const item of items) {
    if (!groups.has(item.groupId)) {
      order.push(item.groupId);
      groups.set(item.groupId, []);
    }
    groups.get(item.groupId)?.push(item);
  }
  return order.map((id, index) => {
    const groupItems = groups.get(id) ?? [];
    return {
      id,
      number: index + 1,
      count: groupItems.length,
      label: groupDisplayName(groupItems),
      previewUrl: groupItems[0]?.previewUrl ?? "",
    };
  });
}

function sharedOccurrencePatch(patch: Partial<ObservationAnalysis>): Partial<ObservationAnalysis> {
  const { subjectPart: _subjectPart, caption: _caption, confidence: _confidence, ...shared } = patch;
  return shared;
}

function sharedOccurrenceAnalysis(analysis: ObservationAnalysis): Partial<ObservationAnalysis> {
  return sharedOccurrencePatch(analysis);
}

function occurrenceAnalysisForUpload(items: ObservationUploadItem[]): ObservationAnalysis {
  const [primary] = items;
  const analysis = { ...(primary?.analysis ?? EMPTY_ANALYSIS) };
  const sharedKeys: SharedOccurrenceKey[] = [
    "scientificName",
    "vernacularName",
    "kingdom",
    "eventDate",
    "recordedBy",
    "decimalLatitude",
    "decimalLongitude",
    "country",
    "locality",
    "habitat",
    "occurrenceRemarks",
  ];

  for (const item of items) {
    for (const key of sharedKeys) {
      const current = analysis[key];
      const candidate = item.analysis[key];
      const shouldReplaceUnknownName = key === "scientificName" && current === "Unidentified organism" && typeof candidate === "string" && candidate.trim() !== "" && candidate !== current;
      if ((typeof current !== "string" || current.trim() === "" || shouldReplaceUnknownName) && typeof candidate === "string" && candidate.trim() !== "") {
        analysis[key] = candidate;
      }
    }
  }

  return analysis;
}

export function ObservationsClient({ target, initialPage }: { target: ManageTarget; initialPage: InitialPage }) {
  const t = useTranslations("upload.observations");
  const router = useRouter();
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsStringEnum<Mode>(["list", "add"]).withDefault("list").withOptions(QUERY_STATE_OPTIONS),
  );
  const createPermission = canCreateRecord(target);

  useEffect(() => {
    configureObservationMutationRepo(target.kind === "group" ? target.did : null);
    return () => configureObservationMutationRepo(null);
  }, [target]);

  if (mode === "add") {
    return (
      <ObservationBulkAddPanel
        target={target}
        disabledReason={createPermission.reason}
        onBack={() => {
          void setMode("list").then(() => router.refresh());
        }}
      />
    );
  }

  return (
    <div className="bg-background pb-4">
      <div className="mx-auto max-w-6xl px-6 pt-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("description")}</p>
          </div>
          {createPermission.allowed ? (
            <Button asChild>
              <Link href={manageHref(target, "observations", { mode: "add" })}>
                <ImagePlusIcon className="size-4" /> {t("addObservation")}
              </Link>
            </Button>
          ) : (
            <Button disabled title={createPermission.reason ?? undefined}>
              <ImagePlusIcon className="size-4" /> {t("addObservation")}
            </Button>
          )}
        </header>

        <div className="group relative mt-5 overflow-hidden rounded-3xl border border-dashed border-primary/20 bg-gradient-to-br from-primary/[0.07] via-accent/30 to-background p-5 sm:p-6">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
            <div className="relative w-fit shrink-0">
              <div className="grid size-16 place-items-center overflow-visible rounded-2xl bg-gradient-to-br from-accent/70 to-primary/10 ring-1 ring-primary/15 transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-105 sm:size-20">
                <img
                  src={TAINA_SIM.posterUrl}
                  alt={TAINA_SIM.name}
                  width={80}
                  height={80}
                  loading="lazy"
                  className="h-[115%] w-[115%] -translate-y-2 object-contain sm:-translate-y-3"
                />
              </div>
              <span className="absolute -bottom-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-[#229ED9] text-white ring-2 ring-background">
                <TelegramIcon className="size-3.5" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-instrument text-xl font-medium italic tracking-[-0.02em] text-foreground sm:text-2xl">
                  {t("tainaTitle")}
                </p>
                <Button asChild className="hidden sm:inline-flex sm:shrink-0">
                  <Link href={TAINA_BOT_URL} target="_blank" rel="noreferrer">
                    <TelegramIcon />
                    {t("tainaCta")}
                  </Link>
                </Button>
              </div>
              <p className="mt-1.5 max-w-prose text-sm leading-6 text-muted-foreground">{t("tainaBody")}</p>
              <Button asChild className="mt-4 w-full sm:hidden">
                <Link href={TAINA_BOT_URL} target="_blank" rel="noreferrer">
                  <TelegramIcon />
                  {t("tainaCta")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <RecordExplorer kind="occurrence" ownerDid={target.did} showHero={false} initialPage={initialPage} defaultOccurrenceMedia="all" />
      </Suspense>
    </div>
  );
}

function ObservationBulkAddPanel({
  disabledReason,
  onBack,
}: {
  target: ManageTarget;
  disabledReason?: string | null;
  onBack: () => void;
}) {
  const t = useTranslations("upload.observations");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<ObservationUploadItem[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const itemsRef = useRef<ObservationUploadItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  const readySelectedItems = items.filter((item) => item.selected && itemCanUpload(item));
  const selectedEditableItems = items.filter((item) => item.selected && item.status !== "uploading" && item.status !== "uploaded");
  const uploadedCount = items.filter((item) => item.status === "uploaded").length;
  const uploadableCount = items.filter(itemCanUpload).length;
  const overallProgress = items.length > 0 ? Math.round((uploadedCount / items.length) * 100) : 0;
  const groupOptions = observationGroupOptions(items);

  async function analyzeItem(item: ObservationUploadItem) {
    try {
      const formData = new FormData();
      formData.set("image", item.file);
      const response = await fetch("/api/manage/observations/analyze", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as AnalyzeResponse;
      if (!response.ok || data.error) throw new Error(analysisErrorMessage(data.error, t));
      setItems((current) => current.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              status: "ready",
              analysis: mergeAnalysisWithDefaults(normalizeAnalysis(data.analysis, item.file), candidate.analysis),
              error: null,
              selected: true,
            }
          : candidate,
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("analysisFailed");
      setItems((current) => current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, status: "error", error: message, selected: false } : candidate,
      ));
    }
  }

  async function addFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    setIsPreparing(true);
    try {
      const defaultGroupId = itemsRef.current.find((item) => item.status !== "uploaded")?.groupId ?? crypto.randomUUID();
      const nextItems = await Promise.all(files.map(async (sourceFile) => {
        const id = `${sourceFile.name}-${sourceFile.size}-${sourceFile.lastModified}-${crypto.randomUUID()}`;
        const metadata = await imageMetadata(sourceFile);
        const analysis = {
          ...EMPTY_ANALYSIS,
          eventDate: metadata.eventDate || dateFromFile(sourceFile),
          decimalLatitude: metadata.decimalLatitude || "",
          decimalLongitude: metadata.decimalLongitude || "",
          caption: cleanFileName(sourceFile.name),
        };
        try {
          const prepared = await compressImageIfNeeded(sourceFile);
          return {
            id,
            file: prepared.file,
            previewUrl: URL.createObjectURL(prepared.file),
            originalSize: prepared.originalSize,
            compressed: prepared.compressed,
            groupId: defaultGroupId,
            selected: false,
            status: "analyzing" as const,
            progress: 0,
            analysis,
            error: null,
            uploadedUri: null,
          };
        } catch {
          return {
            id,
            file: sourceFile,
            previewUrl: URL.createObjectURL(sourceFile),
            originalSize: sourceFile.size,
            compressed: false,
            groupId: defaultGroupId,
            selected: false,
            status: "error" as const,
            progress: 0,
            analysis,
            error: t("compressionFailed"),
            uploadedUri: null,
          };
        }
      }));
      setItems((current) => [...current, ...nextItems]);
      for (const item of nextItems) {
        if (item.status === "analyzing") void analyzeItem(item);
      }
    } finally {
      setIsPreparing(false);
    }
  }

  function onFilesChanged(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(event.target.files);
    event.currentTarget.value = "";
  }

  function updateAnalysis(id: string, patch: Partial<ObservationAnalysis>) {
    setItems((current) => {
      const source = current.find((item) => item.id === id);
      const sharedPatch = sharedOccurrencePatch(patch);
      return current.map((item) => {
        if (item.id === id) return { ...item, analysis: { ...item.analysis, ...patch } };
        if (source && item.groupId === source.groupId && Object.keys(sharedPatch).length > 0) {
          return { ...item, analysis: { ...item.analysis, ...sharedPatch } };
        }
        return item;
      });
    });
  }

  function removeItem(id: string) {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((candidate) => candidate.id !== id);
    });
  }

  function groupSelected() {
    if (selectedEditableItems.length < 2) {
      setBulkError(t("selectTwoToGroup"));
      return;
    }
    const target = selectedEditableItems[0];
    const targetGroupId = target?.groupId;
    if (!target || !targetGroupId) return;
    const selectedIds = new Set(selectedEditableItems.map((item) => item.id));
    const shared = sharedOccurrenceAnalysis(target.analysis);
    setItems((current) => current.map((item) => selectedIds.has(item.id) ? { ...item, groupId: targetGroupId, analysis: { ...item.analysis, ...shared } } : item));
    setBulkError(null);
  }

  function ungroupSelected() {
    const selectedIds = new Set(selectedEditableItems.map((item) => item.id));
    setItems((current) => current.map((item) => selectedIds.has(item.id) ? { ...item, groupId: item.id } : item));
    setBulkError(null);
  }

  function updateGroup(itemId: string, groupId: string) {
    setItems((current) => {
      const targetGroupItem = current.find((item) => item.groupId === groupId);
      const shared = targetGroupItem ? sharedOccurrenceAnalysis(targetGroupItem.analysis) : null;
      return current.map((item) => item.id === itemId ? { ...item, groupId, analysis: shared ? { ...item.analysis, ...shared } : item.analysis } : item);
    });
  }

  async function uploadGroup(groupId: string, itemIds?: Set<string>) {
    const snapshot = itemsRef.current;
    const groupItems = snapshot.filter((item) => item.groupId === groupId && (!itemIds || itemIds.has(item.id)));
    const uploadItems = groupItems.filter(itemCanUpload);
    if (uploadItems.length === 0 || disabledReason) {
      if (disabledReason) setBulkError(disabledReason);
      return;
    }

    const uploadIds = new Set(uploadItems.map((item) => item.id));
    setBulkError(null);
    try {
      setItems((current) => current.map((candidate) => uploadIds.has(candidate.id) ? { ...candidate, status: "uploading", progress: 15, error: null } : candidate));
      const existingOccurrenceUri = snapshot.find((item) => item.groupId === groupId && item.uploadedUri)?.uploadedUri ?? null;
      let occurrenceUri = existingOccurrenceUri;
      if (!occurrenceUri) {
        const data = occurrenceAnalysisForUpload(uploadItems);
        const occurrence = await createObservationOccurrence({
          basisOfRecord: "MachineObservation",
          scientificName: data.scientificName.trim(),
          vernacularName: data.vernacularName.trim(),
          kingdom: data.kingdom.trim(),
          eventDate: data.eventDate.trim(),
          recordedBy: data.recordedBy.trim(),
          decimalLatitude: data.decimalLatitude.trim(),
          decimalLongitude: data.decimalLongitude.trim(),
          country: data.country.trim(),
          locality: data.locality.trim(),
          habitat: data.habitat.trim(),
          occurrenceRemarks: data.occurrenceRemarks.trim(),
          associatedMedia: uploadItems.map((item) => item.file.name).join(", "),
        });
        occurrenceUri = occurrence.uri;
      }
      if (!occurrenceUri) throw new Error(t("analysisFailed"));

      for (const item of uploadItems) {
        setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, progress: 60 } : candidate));
        await createObservationPhoto({
          imageFile: item.file,
          occurrenceRef: occurrenceUri,
          subjectPart: item.analysis.subjectPart.trim() || "wholeOrganism",
          caption: item.analysis.caption.trim() || undefined,
        });
        setItems((current) => current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, status: "uploaded", progress: 100, selected: false, uploadedUri: occurrenceUri, error: null }
            : candidate,
        ));
      }
    } catch (error) {
      const message = formatObservationMutationError(error);
      setItems((current) => current.map((candidate) =>
        uploadIds.has(candidate.id) && candidate.status === "uploading"
          ? { ...candidate, status: "uploadError", progress: 0, error: message }
          : candidate,
      ));
    }
  }

  async function uploadSelected() {
    if (readySelectedItems.length === 0) {
      setBulkError(t("noReadySelected"));
      return;
    }
    setIsBulkUploading(true);
    try {
      const selectedIds = new Set(readySelectedItems.map((item) => item.id));
      const groupIds = Array.from(new Set(readySelectedItems.map((item) => item.groupId)));
      for (const groupId of groupIds) {
        await uploadGroup(groupId, selectedIds);
      }
    } finally {
      setIsBulkUploading(false);
    }
  }

  return (
    <Container className="space-y-6 pt-4 pb-12">
      <div>
        <Button variant="ghost" onClick={onBack} className="-ml-2 mb-3 text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-4" /> {t("backToObservations")}
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
              {t("bulkTitle")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("bulkIntro")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onFilesChanged} className="sr-only" />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isPreparing}>
              {isPreparing ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
              {isPreparing ? t("preparingImages") : items.length > 0 ? t("chooseMoreImages") : t("chooseImages")}
            </Button>
            {items.length > 0 ? (
              <Button onClick={() => void uploadSelected()} disabled={isBulkUploading || readySelectedItems.length === 0 || Boolean(disabledReason)} title={disabledReason ?? undefined}>
                {isBulkUploading ? <Loader2Icon className="size-4 animate-spin" /> : <UploadCloudIcon className="size-4" />}
                {isBulkUploading ? t("uploadingSelected") : t("uploadSelected")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {bulkError || disabledReason ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <span>{bulkError ?? disabledReason}</span>
        </div>
      ) : null}

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group flex min-h-[340px] w-full flex-col items-center justify-center rounded-3xl border border-dashed border-primary/25 bg-gradient-to-b from-primary/[0.04] to-transparent p-8 text-center transition-colors hover:border-primary/40 hover:from-primary/[0.07]"
        >
          <span className="mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-105">
            <ImagePlusIcon className="size-7" />
          </span>
          <span className="font-instrument text-2xl font-medium italic tracking-[-0.02em]">{t("emptyUploadTitle")}</span>
          <span className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("emptyUploadDescription")}</span>
          <span className="mt-5 text-xs text-muted-foreground/80">{t("fileRequirements")}</span>
        </button>
      ) : (
        <>
          <div className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <UploadCloudIcon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t("uploadedCount", { uploaded: uploadedCount, total: items.length })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("fileRequirements")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={groupSelected} disabled={selectedEditableItems.length < 2}>
                  <Layers2Icon className="size-4" /> {t("groupSelected")}
                </Button>
                <Button variant="ghost" size="sm" onClick={ungroupSelected} disabled={selectedEditableItems.length === 0}>
                  <UngroupIcon className="size-4" /> {t("ungroupSelected")}
                </Button>
              </div>
            </div>
            <ProgressBar value={overallProgress} label={t("progressLabel", { progress: overallProgress })} className="mt-4" />
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("groupingHelp")}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t("listTitle")}</h2>
              <span className="text-sm text-muted-foreground">{t("selectedCount", { selected: readySelectedItems.length, total: uploadableCount })}</span>
            </div>
            <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
              <ObservationListHeader />
              <div className="divide-y divide-border/60">
                {items.map((item, index) => (
                  <ObservationListItem
                    key={item.id}
                    item={item}
                    index={index}
                    groupOptions={groupOptions}
                    expanded={item.id === expandedId}
                    disabledReason={disabledReason}
                    onToggleExpanded={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                    onAnalysisChange={updateAnalysis}
                    onGroupChange={(groupId) => updateGroup(item.id, groupId)}
                    onToggleSelected={(checked) => setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, selected: checked } : candidate))}
                    onUpload={() => void uploadGroup(item.groupId)}
                    onRemove={() => {
                      if (item.id === expandedId) setExpandedId(null);
                      removeItem(item.id);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Container>
  );
}

function ObservationListHeader() {
  const t = useTranslations("upload.observations");
  return (
    <div className={`${ROW_GRID} hidden border-b bg-muted/40 px-3 py-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80 md:grid`}>
      <span aria-hidden />
      <span aria-hidden />
      <span>{t("colOrganism")}</span>
      <span>{t("colDate")}</span>
      <span>{t("colLocation")}</span>
      <span aria-hidden />
    </div>
  );
}

function ObservationListItem({
  item,
  index,
  groupOptions,
  expanded,
  disabledReason,
  onToggleExpanded,
  onAnalysisChange,
  onGroupChange,
  onToggleSelected,
  onUpload,
  onRemove,
}: {
  item: ObservationUploadItem;
  index: number;
  groupOptions: GroupOption[];
  expanded: boolean;
  disabledReason?: string | null;
  onToggleExpanded: () => void;
  onAnalysisChange: (id: string, patch: Partial<ObservationAnalysis>) => void;
  onGroupChange: (groupId: string) => void;
  onToggleSelected: (checked: boolean) => void;
  onUpload: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("upload.observations");
  const canUpload = itemCanUpload(item) && !disabledReason;
  const showAnalysis = item.status === "ready" || item.status === "uploading" || item.status === "uploaded" || item.status === "uploadError";
  const currentGroup = groupOptions.find((group) => group.id === item.groupId);
  const groupedCount = currentGroup?.count ?? 1;
  const groupingDisabled = item.status === "uploading" || item.status === "uploaded";
  const showUploadAction = item.status === "ready" || item.status === "uploadError";
  const canEdit = showAnalysis;

  const organism = item.analysis.scientificName.trim() || cleanFileName(item.file.name);
  const commonName = item.analysis.vernacularName.trim();
  const dateText = item.analysis.eventDate.trim();
  const locationText = (item.analysis.locality || item.analysis.country).trim();
  const hasCoords = Boolean(item.analysis.decimalLatitude.trim() && item.analysis.decimalLongitude.trim());
  const coordsText = hasCoords ? `${item.analysis.decimalLatitude.trim()}, ${item.analysis.decimalLongitude.trim()}` : "";
  const locationDisplay = locationText || coordsText;
  // On mobile the date/location columns are hidden, so fold them into a meta line.
  const metaBits = showAnalysis ? [dateText, locationDisplay].filter(Boolean) : [formatBytes(item.file.size)];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1], delay: Math.min(index * 0.03, 0.18) }}
      className={`group/row relative transition-colors ${expanded ? "bg-primary/[0.045]" : item.selected ? "bg-primary/[0.025]" : "hover:bg-muted/40"}`}
    >
      {expanded ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" /> : null}
      <div className={`${ROW_GRID} gap-y-1 px-3 py-2`}>
        <Checkbox
          checked={item.selected}
          disabled={!itemCanUpload(item)}
          onCheckedChange={(value) => onToggleSelected(value === true)}
          aria-label={t("selectForUpload")}
          className="shrink-0"
        />
        <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border">
          <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
          {groupedCount > 1 ? (
            <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[0.55rem] font-semibold text-primary-foreground ring-2 ring-background">
              {groupedCount}
            </span>
          ) : null}
        </div>

        {/* Organism */}
        {canEdit ? (
          <button type="button" onClick={onToggleExpanded} aria-expanded={expanded} className="group/name min-w-0 text-left" title={t("editDetails")}>
            <OrganismCell organism={organism} commonName={commonName} metaBits={metaBits} interactive />
          </button>
        ) : (
          <div className="min-w-0">
            <OrganismCell organism={organism} commonName={commonName} metaBits={metaBits} />
          </div>
        )}

        {/* Date (desktop column) */}
        <div className="hidden min-w-0 items-center gap-1.5 md:flex">
          <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground/45" />
          <span className="truncate text-sm tabular-nums text-muted-foreground">{dateText || "—"}</span>
        </div>

        {/* Location (desktop column) */}
        <div className="hidden min-w-0 items-center gap-1.5 md:flex">
          <MapPinIcon className={`size-3.5 shrink-0 ${hasCoords ? "text-primary/70" : "text-muted-foreground/45"}`} />
          <span className="truncate text-sm text-muted-foreground">{locationDisplay || "—"}</span>
        </div>

        {/* Trailing: status · actions */}
        <div className="flex shrink-0 items-center justify-end gap-0.5">
          <StatusIcon status={item.status} />
          {showUploadAction ? (
            <Button
              size="icon-sm"
              disabled={!canUpload}
              title={disabledReason ?? (groupedCount > 1 ? t("uploadGroup") : t("uploadOne"))}
              aria-label={groupedCount > 1 ? t("uploadGroup") : t("uploadOne")}
              onClick={onUpload}
              className="ml-0.5"
            >
              <UploadCloudIcon className="size-4" />
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              aria-label={expanded ? t("hideDetails") : t("editDetails")}
              title={expanded ? t("hideDetails") : t("editDetails")}
              className={expanded ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground"}
            >
              <PencilIcon className="size-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={t("removeImage")}
            title={t("removeImage")}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>

      {item.status === "uploading" ? (
        <div className="px-3 pb-3">
          <ProgressBar value={item.progress} label={t("progressLabel", { progress: item.progress })} />
        </div>
      ) : null}
      {item.error ? (
        <p className="flex items-center gap-1.5 px-3 pb-3 text-xs text-destructive">
          <AlertTriangleIcon className="size-3.5 shrink-0" /> {item.error}
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {expanded && showAnalysis ? (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-primary/10 bg-muted/30 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <SparklesIcon className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 truncate">
                  {item.file.name} · {formatBytes(item.file.size)}
                  {item.compressed ? ` · ${t("compressedFrom", { size: formatBytes(item.originalSize) })}` : ""}
                </span>
                {item.analysis.confidence !== null ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                    {t("aiConfidence", { confidence: Math.round(item.analysis.confidence * 100) })}
                  </span>
                ) : null}
              </div>
              <div className="mb-5 rounded-xl border bg-background p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <Layers2Icon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{t("groupControlLabel")}</span>
                </div>
                <p className="mb-3 text-xs leading-5 text-muted-foreground">{t("groupItemHelp")}</p>
                <Select value={item.groupId} onValueChange={onGroupChange} disabled={groupingDisabled}>
                  <SelectTrigger className="w-full sm:max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={item.id}>{t("keepSeparate")}</SelectItem>
                    {groupOptions.filter((group) => group.id !== item.id).map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        <span className="flex items-center gap-2">
                          {group.previewUrl ? (
                            <img src={group.previewUrl} alt="" className="size-5 shrink-0 rounded object-cover ring-1 ring-border" />
                          ) : null}
                          <span className="truncate">{group.label || t("unidentified")}</span>
                          <span className="shrink-0 text-muted-foreground">· {t("photoCount", { count: group.count })}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ObservationAnalysisFields item={item} onChange={(patch) => onAnalysisChange(item.id, patch)} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function OrganismCell({ organism, commonName, metaBits, interactive }: { organism: string; commonName: string; metaBits: string[]; interactive?: boolean }) {
  return (
    <>
      <span className={`block truncate text-sm font-medium text-foreground ${interactive ? "underline-offset-2 group-hover/name:text-primary group-hover/name:underline group-hover/name:decoration-dotted" : ""}`}>
        {organism}
      </span>
      {commonName ? <span className="block truncate text-xs italic text-muted-foreground">{commonName}</span> : null}
      {metaBits.length > 0 ? (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground md:hidden">{metaBits.join(" · ")}</span>
      ) : null}
    </>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  const t = useTranslations("upload.observations.status");
  const label = t(status);
  const isError = status === "error" || status === "uploadError";
  const isBusy = status === "analyzing" || status === "uploading";
  const tone = status === "uploaded"
    ? "text-primary"
    : isError
      ? "text-destructive"
      : "text-muted-foreground";
  return (
    <span title={label} className={`grid size-7 shrink-0 place-items-center ${tone}`}>
      {isBusy ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {status === "uploaded" ? <CheckCircle2Icon className="size-4" /> : null}
      {isError ? <AlertTriangleIcon className="size-4" /> : null}
      {status === "ready" ? <span className="size-2 rounded-full bg-primary ring-2 ring-primary/20" /> : null}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function ObservationAnalysisFields({ item, onChange }: { item: ObservationUploadItem; onChange: (patch: Partial<ObservationAnalysis>) => void }) {
  const t = useTranslations("upload.observations");
  const disabled = item.status === "uploading" || item.status === "uploaded";
  return (
    <div className="space-y-4">
      <div className="grid gap-x-4 gap-y-4 lg:grid-cols-2">
        <Field label={t("fields.scientificName")} value={item.analysis.scientificName} disabled={disabled} onChange={(value) => onChange({ scientificName: value })} required />
        <Field label={t("fields.commonName")} value={item.analysis.vernacularName} disabled={disabled} onChange={(value) => onChange({ vernacularName: value })} />
      </div>
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("fields.eventDate")} type="date" value={item.analysis.eventDate} disabled={disabled} onChange={(value) => onChange({ eventDate: value })} required />
        <Field label={t("fields.kingdom")} value={item.analysis.kingdom} disabled={disabled} onChange={(value) => onChange({ kingdom: value })} />
        <Field label={t("fields.latitude")} value={item.analysis.decimalLatitude} disabled={disabled} onChange={(value) => onChange({ decimalLatitude: value })} />
        <Field label={t("fields.longitude")} value={item.analysis.decimalLongitude} disabled={disabled} onChange={(value) => onChange({ decimalLongitude: value })} />
      </div>
      <div className="grid gap-x-4 gap-y-4 lg:grid-cols-3">
        <Field label={t("fields.recordedBy")} value={item.analysis.recordedBy} disabled={disabled} onChange={(value) => onChange({ recordedBy: value })} />
        <Field label={t("fields.country")} value={item.analysis.country} disabled={disabled} onChange={(value) => onChange({ country: value })} />
        <Field label={t("fields.locality")} value={item.analysis.locality} disabled={disabled} onChange={(value) => onChange({ locality: value })} />
      </div>
      <div className="grid gap-x-4 gap-y-4 lg:grid-cols-2">
        <Field label={t("fields.subjectPart")} value={item.analysis.subjectPart} disabled={disabled} onChange={(value) => onChange({ subjectPart: value })} />
        <TextareaField label={t("fields.caption")} value={item.analysis.caption} disabled={disabled} onChange={(value) => onChange({ caption: value })} />
      </div>
      <div className="grid gap-x-4 gap-y-4 lg:grid-cols-2">
        <TextareaField label={t("fields.habitat")} value={item.analysis.habitat} disabled={disabled} onChange={(value) => onChange({ habitat: value })} />
        <TextareaField label={t("fields.remarks")} value={item.analysis.occurrenceRemarks} disabled={disabled} onChange={(value) => onChange({ occurrenceRemarks: value })} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; required?: boolean }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      <Input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextareaField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Textarea value={value} disabled={disabled} rows={3} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className={className} aria-label={label} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${bounded}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
