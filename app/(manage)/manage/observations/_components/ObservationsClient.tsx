"use client";

import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentProps, type DragEvent, type ReactNode } from "react";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import {
  AlertTriangleIcon,
  BinocularsIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  FolderKanbanIcon,
  ImagePlusIcon,
  Layers2Icon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { RecordExplorer } from "@/app/_components/RecordExplorer";
import { EmptyHeroBanner } from "@/app/_components/EmptyHeroBanner";
import type { ExplorerRecord, OccurrenceRecord } from "@/app/_lib/indexer";
import { resolveBlobUrl } from "@/app/_lib/pds";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Container from "@/components/ui/container";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useModal } from "@/components/ui/modal/context";
import QuickTooltip from "@/components/ui/quick-tooltip";
import { manageApiHref, type ManageTarget } from "@/lib/links";
import { cn } from "@/lib/utils";
import { ManageConfirmModal } from "../../_components/ManageConfirmModal";
import { canCreateRecord, canDeleteRecord } from "../../_lib/cgs-permissions";
import { deleteOccurrenceCascade } from "../../_lib/mutations";
import {
  configureObservationMutationRepo,
  createObservationOccurrence,
  createObservationPhoto,
  formatObservationMutationError,
  setObservationPrimaryImage,
  type ObservationBlobRef,
} from "./observation-mutations";
import { LocationPickerModal, LocationPickerModalId } from "./LocationPickerModal";
import { AddObservationsModal } from "./AddObservationsModal";
import { takeAddDataHandoff } from "../../_lib/upload/add-data-handoff";
import {
  fetchDefaultObservationCenter,
  isValidLocation,
  type PickedLocation,
} from "./default-location";
import { clearDraft, loadDraft, saveDraft } from "./observation-draft-store";
import { cleanFileName, compressImageIfNeeded, dateFromFile, imageMetadata } from "./observation-image";

type InitialPage = NonNullable<ComponentProps<typeof RecordExplorer>["initialPage"]>;
type ObservationProjectGroup = { projectUri: string; title: string; count: number; uris: string[] };

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

// The slice of an upload item that is safe to persist to IndexedDB between
// visits (the File blob is structured-cloneable). Transient fields — preview
// object URL, progress, uploaded URI — are rebuilt on restore.
type DraftItemStatus = "analyzing" | "ready" | "error" | "uploadError";
type DraftItem = {
  id: string;
  file: File;
  originalSize: number;
  compressed: boolean;
  groupId: string;
  selected: boolean;
  status: DraftItemStatus;
  error: string | null;
  analysis: ObservationAnalysis;
};

const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
// Drag-and-drop payload types for merging observations: a whole row (group) or a
// single photo dragged out of the expanded media editor.
const DND_GROUP = "application/x-obs-group";
const DND_ITEM = "application/x-obs-item";
// Shared column template so the table header and each row line up. Columns are
// ordered by review value: select · photo · organism · date · location · kind ·
// observation grouping · AI confidence · trailing action. Lower-priority columns
// disappear first on narrower screens.
const ROW_GRID =
  "grid items-center gap-x-3 grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_6.5rem] md:grid-cols-[1.5rem_2.5rem_minmax(0,1.7fr)_6.5rem_minmax(0,1.15fr)_6.5rem] lg:grid-cols-[1.5rem_2.5rem_minmax(0,1.5fr)_6.5rem_minmax(0,1fr)_5.5rem_minmax(0,0.85fr)_6.5rem] xl:grid-cols-[1.5rem_2.5rem_minmax(0,1.45fr)_6.5rem_minmax(0,1fr)_5.5rem_minmax(0,0.85fr)_5.5rem_6.5rem]";
// How long a freshly uploaded row lingers in its green "Uploaded" state before
// it animates out, and how long that exit animation runs.
const UPLOADED_LINGER_MS = 850;
const ROW_EXIT_MS = 350;
// Hard ceiling on how many images one add session can hold, to keep the browser
// (and the per-photo PDS writes) from being overwhelmed.
const MAX_IMAGES = 100;
const UNIDENTIFIED_NAME = "Unidentified organism";
// The analyze route already retries Gemini internally; this is a thin extra
// layer so a flaky client network connection also recovers on its own.
const ANALYZE_CLIENT_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
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

function isUnidentifiedScientificName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === UNIDENTIFIED_NAME.toLowerCase() || normalized === "unidentified organisms";
}

function analysisCanUpload(analysis: ObservationAnalysis): boolean {
  const scientificName = analysis.scientificName.trim();
  return scientificName.length > 0 && !isUnidentifiedScientificName(scientificName) && analysis.eventDate.trim().length > 0;
}

function itemCanUpload(item: ObservationUploadItem): boolean {
  return (item.status === "ready" || item.status === "uploadError") && analysisCanUpload(item.analysis);
}

type ObservationGroup = { id: string; number: number; items: ObservationUploadItem[]; label: string; previewUrls: string[] };

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

function observationGroups(items: ObservationUploadItem[]): ObservationGroup[] {
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
      items: groupItems,
      label: groupDisplayName(groupItems),
      previewUrls: groupItems.slice(0, 3).map((item) => item.previewUrl),
    };
  });
}

/** Normalized identity for auto-grouping: a confident, named identification.
 *  Empty for blanks or the "Unidentified organism" placeholder so unknowns
 *  never collapse into one another. */
function speciesGroupKey(analysis: ObservationAnalysis): string {
  const name = analysis.scientificName.trim().toLowerCase();
  if (!name || name === UNIDENTIFIED_NAME.toLowerCase()) return "";
  return name;
}

function refToCid(ref: unknown): string | null {
  if (typeof ref === "string") return ref || null;
  if (ref && typeof ref === "object" && "$link" in (ref as Record<string, unknown>)) {
    const link = (ref as Record<string, unknown>).$link;
    return typeof link === "string" ? link : null;
  }
  return null;
}

/**
 * Build a placeholder explorer record for a just-uploaded observation so it shows
 * in the listing immediately, before the indexer has caught up. Resolves the PDS
 * blob URL up front (the in-memory object URL is revoked when the add panel
 * unmounts). Shares the indexer's `${did}-${rkey}` id so the indexed copy dedupes
 * cleanly once it lands.
 */
async function buildOptimisticOccurrence(input: {
  did: string;
  uri: string;
  rkey: string;
  analysis: ObservationAnalysis;
  blobRef: ObservationBlobRef | null;
  isoTimestamp: string;
  creatorName?: string | null;
}): Promise<OccurrenceRecord> {
  const { did, uri, rkey, analysis } = input;
  const lat = Number.parseFloat(analysis.decimalLatitude);
  const lon = Number.parseFloat(analysis.decimalLongitude);
  const cid = refToCid(input.blobRef?.ref);
  const imageUrl = cid ? await resolveBlobUrl(did, cid).catch(() => null) : null;
  return {
    kind: "occurrence",
    id: `${did}-${rkey}`,
    did,
    rkey,
    cid: null,
    atUri: uri,
    scientificName: analysis.scientificName.trim() || null,
    vernacularName: analysis.vernacularName.trim() || null,
    kingdom: analysis.kingdom.trim() || null,
    family: null,
    genus: null,
    basisOfRecord: "HumanObservation",
    recordedBy: analysis.recordedBy.trim() || null,
    individualCount: null,
    country: analysis.country.trim() || null,
    countryCode: null,
    stateProvince: null,
    locality: analysis.locality.trim() || null,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    coordinateUncertaintyInMeters: null,
    eventDate: analysis.eventDate.trim() || null,
    habitat: analysis.habitat.trim() || null,
    siteRef: null,
    datasetRef: null,
    datasetName: null,
    dynamicProperties: null,
    establishmentMeans: null,
    createdAt: input.isoTimestamp,
    creatorName: input.creatorName?.trim() || null,
    creatorAvatarRef: null,
    remarks: analysis.occurrenceRemarks.trim() || null,
    imageUrl,
    imageRef: cid,
    audioRef: null,
    audioUrl: null,
    media: ["image"],
  };
}

function sharedOccurrencePatch(patch: Partial<ObservationAnalysis>): Partial<ObservationAnalysis> {
  const { subjectPart: _subjectPart, caption: _caption, confidence: _confidence, ...shared } = patch;
  return shared;
}

/**
 * After a photo is analyzed, merge it into an existing observation that shares
 * the same confident identification. Only auto-groups a still-solo photo into the
 * first matching group, so it never overrides manual grouping or pulls photos out
 * of an existing group. Returns the items unchanged when there is no match.
 */
function autoGroupByIdentification(items: ObservationUploadItem[], analyzedId: string): ObservationUploadItem[] {
  const me = items.find((item) => item.id === analyzedId);
  if (!me) return items;
  const key = speciesGroupKey(me.analysis);
  if (!key) return items;
  // Leave it alone if the user already grouped this photo with others.
  if (items.filter((item) => item.groupId === me.groupId).length > 1) return items;
  const match = items.find(
    (item) =>
      item.id !== me.id &&
      item.groupId !== me.groupId &&
      item.status !== "uploading" &&
      item.status !== "uploaded" &&
      speciesGroupKey(item.analysis) === key,
  );
  if (!match) return items;
  const targetItems = items.filter((item) => item.groupId === match.groupId);
  const shared = sharedOccurrenceAnalysis(occurrenceAnalysisForUpload([...targetItems, me]));
  return items.map((item) =>
    item.id === me.id ? { ...item, groupId: match.groupId, analysis: { ...item.analysis, ...shared } } : item,
  );
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

export function ObservationsClient({ target, initialPage, forProject = null }: { target: ManageTarget; initialPage: InitialPage; forProject?: string | null }) {
  const t = useTranslations("upload.observations");
  const router = useRouter();
  const modal = useModal();
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsStringEnum<Mode>(["list", "add"]).withDefault("list").withOptions(QUERY_STATE_OPTIONS),
  );
  // Observations created in this session, kept so the list shows them on return
  // even before the indexer has caught up. Newest first; deduped by id.
  const [freshRecords, setFreshRecords] = useState<ExplorerRecord[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<Map<string, OccurrenceRecord>>(() => new Map());
  const [visibleRecords, setVisibleRecords] = useState<OccurrenceRecord[]>([]);
  // True once the explorer has loaded and holds no observations at all. When
  // empty we strip the page back to just the heading and the seedling banner.
  const [isEmpty, setIsEmpty] = useState(false);
  const [deletedRecordIds, setDeletedRecordIds] = useState<Set<string>>(() => new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const createPermission = canCreateRecord(target);
  const [projectFilter, setProjectFilter] = useQueryState("project", parseAsString.withOptions(QUERY_STATE_OPTIONS));
  const [projectGroups, setProjectGroups] = useState<ObservationProjectGroup[]>([]);
  const deletePermission = canDeleteRecord(target, { ownRecord: target.kind === "personal" });
  const deleteDisabledReason = deletePermission.allowed ? null : deletePermission.reason;
  const selectedIds = useMemo(() => new Set(selectedRecords.keys()), [selectedRecords]);

  useEffect(() => {
    configureObservationMutationRepo(target.kind === "group" ? target.did : null);
    return () => configureObservationMutationRepo(null);
  }, [target]);

  // Group the steward's observations by the project they were collected for so
  // the list can be filtered per project (read straight from projectRef).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(manageApiHref("/api/manage/observations/projects", target), { cache: "no-store" });
        const data = (await response.json()) as { groups?: ObservationProjectGroup[] };
        if (cancelled || !response.ok || !Array.isArray(data?.groups)) return;
        setProjectGroups(data.groups);
      } catch {
        // Filtering is an enhancement; ignore load failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  const activeGroup = projectGroups.find((group) => group.projectUri === projectFilter) ?? null;
  const filterUris = useMemo(() => (activeGroup ? new Set(activeGroup.uris) : null), [activeGroup]);

  const handleVisibleRecordsChange = useCallback((records: OccurrenceRecord[]) => {
    setVisibleRecords(records);
    const visibleIds = new Set(records.map((record) => record.id));
    setSelectedRecords((current) => {
      const next = new Map(Array.from(current).filter(([id]) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, []);

  function toggleSelectedRecord(record: OccurrenceRecord, selected: boolean) {
    setSelectedRecords((current) => {
      const next = new Map(current);
      if (selected) next.set(record.id, record);
      else next.delete(record.id);
      return next;
    });
  }

  function selectAllVisibleRecords() {
    if (deleteDisabledReason) return;
    setSelectedRecords(new Map(visibleRecords.map((record) => [record.id, record])));
  }

  function clearSelectedRecords() {
    setSelectedRecords(new Map());
  }

  function openDeleteSelectedModal() {
    const records = Array.from(selectedRecords.values());
    if (records.length === 0) return;
    if (deleteDisabledReason) return;
    modal.pushModal(
      {
        id: "delete-selected-observations",
        content: (
          <ManageConfirmModal
            title={t("deleteSelectedTitle")}
            description={t("deleteSelectedDescription", { count: records.length })}
            confirmLabel={t("deleteSelectedConfirm")}
            cancelLabel={t("cancel")}
            destructive
            onConfirm={async () => {
              setIsDeletingSelected(true);
              await modal.hide();
              modal.popModal();
              try {
                const options = target.kind === "group" ? { repo: target.did } : undefined;
                await Promise.all(records.map((record) => deleteOccurrenceCascade(record.rkey, options)));
                const ids = new Set(records.map((record) => record.id));
                setDeletedRecordIds((current) => new Set([...current, ...ids]));
                setFreshRecords((current) => current.filter((record) => !ids.has(record.id)));
                setSelectedRecords(new Map());
              } finally {
                setIsDeletingSelected(false);
              }
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  }

  // The primary "Add observation" affordances (the grid tile and the empty
  // state) open the quick iNaturalist-style modal — the same one the sidebar
  // uses. The richer in-page bulk panel (mode=add) stays reachable from the
  // unified Add data drop zone.
  const openAddObservations = useCallback(() => {
    if (createPermission.reason) return;
    const close = () => {
      void modal.hide().then(() => modal.clear());
    };
    modal.pushModal(
      {
        id: "add-observations",
        dialogWidth: "max-w-2xl w-[calc(100%-2rem)]",
        forceDialog: true,
        content: (
          <AddObservationsModal
            target={target}
            projectRef={activeGroup?.projectUri ?? null}
            onClose={close}
            onViewObservations={() => {
              close();
              router.refresh();
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [activeGroup?.projectUri, createPermission.reason, modal, router, target]);

  if (mode === "add") {
    return (
      <ObservationBulkAddPanel
        target={target}
        forProject={forProject}
        disabledReason={createPermission.reason}
        onUploaded={(records) =>
          setFreshRecords((prev) => {
            const seen = new Set(records.map((record) => record.id));
            return [...records, ...prev.filter((record) => !seen.has(record.id))];
          })
        }
        onBack={() => {
          void setMode("list").then(() => router.refresh());
        }}
      />
    );
  }

  return (
    <div className="bg-background pb-4">
      <div className="mx-auto max-w-6xl px-6 pt-4">
        <header>
          <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("description")}</p>
        </header>

        {isEmpty ? null : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {selectedRecords.size > 0 ? t("selectedForDelete", { count: selectedRecords.size }) : t("selectToDeleteHint")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectedRecords.size === visibleRecords.length && visibleRecords.length > 0 ? clearSelectedRecords : selectAllVisibleRecords}
              disabled={visibleRecords.length === 0 || Boolean(deleteDisabledReason) || isDeletingSelected}
              title={deleteDisabledReason ?? undefined}
            >
              {selectedRecords.size === visibleRecords.length && visibleRecords.length > 0 ? t("deselectAll") : t("selectAll")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openDeleteSelectedModal}
              disabled={selectedRecords.size === 0 || Boolean(deleteDisabledReason) || isDeletingSelected}
              title={deleteDisabledReason ?? undefined}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {isDeletingSelected ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
              {isDeletingSelected ? t("deletingSelected") : t("deleteSelected")}
            </Button>
          </div>
        </div>
        )}
      </div>

      {!isEmpty && projectGroups.length > 0 ? (
        <div className="mx-auto mt-5 max-w-6xl px-6">
          <ObservationProjectFilter
            groups={projectGroups}
            value={projectFilter ?? null}
            onChange={(next) => void setProjectFilter(next)}
            allLabel={t("filterAllProjects")}
            ariaLabel={t("filterByProject")}
          />
        </div>
      ) : null}

      <Suspense fallback={null}>
        <RecordExplorer
          kind="occurrence"
          ownerDid={target.did}
          showHero={false}
          initialPage={activeGroup ? undefined : initialPage}
          extraInitialRecords={freshRecords}
          defaultOccurrenceMedia="all"
          filterUris={filterUris}
          emptyFilteredTitle={t("filterEmptyTitle")}
          emptyFilteredBody={t("filterEmptyBody")}
          leadingCard={<AddObservationTile onAdd={openAddObservations} disabledReason={createPermission.reason} />}
          emptyState={<ObservationEmptyState onAdd={openAddObservations} disabledReason={createPermission.reason} />}
          hideToolbarWhenEmpty
          hideOccurrenceFilters
          onEmptyStateChange={setIsEmpty}
          showStatsOverview={false}
          hiddenRecordIds={deletedRecordIds}
          observationSelection={{
            selectedIds,
            onToggle: toggleSelectedRecord,
            getDisabledReason: () => deleteDisabledReason,
          }}
          onObservationVisibleRecordsChange={handleVisibleRecordsChange}
        />
      </Suspense>
    </div>
  );
}

function AddObservationTile({ onAdd, disabledReason }: { onAdd: () => void; disabledReason?: string | null }) {
  const t = useTranslations("upload.observations");
  const content = (
    <>
      <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover/tile:scale-105">
        <BinocularsIcon className="size-6" />
      </span>
      <span className="mt-3 block font-instrument text-xl font-medium italic tracking-[-0.02em] text-foreground">
        {t("addTileTitle")}
      </span>
      <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
        {disabledReason ?? t("addTileBody")}
      </span>
    </>
  );

  const className = "group/tile flex aspect-square w-full flex-col items-center justify-center rounded-3xl border border-dashed border-primary/25 bg-gradient-to-b from-primary/[0.06] to-background p-4 text-center transition-colors hover:border-primary/45 hover:from-primary/[0.1]";
  return (
    <button
      type="button"
      onClick={disabledReason ? undefined : onAdd}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? undefined}
      className={cn(className, disabledReason && "cursor-not-allowed opacity-65")}
    >
      {content}
    </button>
  );
}

function ObservationEmptyState({ onAdd, disabledReason }: { onAdd: () => void; disabledReason?: string | null }) {
  const t = useTranslations("upload.observations");
  return (
    <EmptyHeroBanner
      description={t("emptyHeroDescription")}
      ctaLabel={t("addTileTitle")}
      onCtaClick={onAdd}
      ctaIcon={<BinocularsIcon />}
      ctaDisabled={Boolean(disabledReason)}
      ctaDisabledReason={disabledReason}
    />
  );
}

function ObservationProjectFilter({
  groups,
  value,
  onChange,
  allLabel,
  ariaLabel,
}: {
  groups: ObservationProjectGroup[];
  value: string | null;
  onChange: (next: string | null) => void;
  allLabel: string;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="scrollbar-hidden flex items-center gap-1.5 overflow-x-auto pb-1">
      <ObservationFilterPill selected={!value} onClick={() => onChange(null)}>
        {allLabel}
      </ObservationFilterPill>
      {groups.map((group) => (
        <ObservationFilterPill key={group.projectUri} selected={value === group.projectUri} onClick={() => onChange(group.projectUri)}>
          <span className="max-w-[12rem] truncate">{group.title}</span>
          <span className={cn("ml-1 rounded-full px-1.5 text-[11px] tabular-nums", value === group.projectUri ? "bg-primary-foreground/20" : "bg-foreground/10")}>
            {group.count}
          </span>
        </ObservationFilterPill>
      ))}
    </div>
  );
}

function ObservationFilterPill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type ObservationProject = { rkey: string; did: string; atUri: string; title: string; imageUrl: string | null; locationUri: string | null };

function ObservationBulkAddPanel({
  target,
  forProject,
  disabledReason,
  onUploaded,
  onBack,
}: {
  target: ManageTarget;
  forProject?: string | null;
  disabledReason?: string | null;
  onUploaded: (records: OccurrenceRecord[]) => void;
  onBack: () => void;
}) {
  const t = useTranslations("upload.observations");
  const modal = useModal();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<ObservationUploadItem[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [uploadProgressIds, setUploadProgressIds] = useState<Set<string>>(() => new Set());
  // A frozen snapshot of the counts shown in the status bar during an upload
  // run. Once the user clicks "Upload", the totals stay put even as uploaded
  // rows animate away, so the displayed total never appears to shrink. Cleared
  // a moment after the run settles, when the counts can safely reflect reality.
  const [uploadSession, setUploadSession] = useState<{ total: number; uploadableTotal: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // The photo being dragged out of its observation row, if any — drives the
  // "drop here to separate" zone beneath the list.
  const [draggingPhotoId, setDraggingPhotoId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ObservationProject[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectUri, setProjectUri] = useState<string>("");
  const [projectDecisionMade, setProjectDecisionMade] = useState(Boolean(forProject));
  // The mandatory observation location chosen before any image can be added.
  const [chosenLocation, setChosenLocation] = useState<PickedLocation | null>(null);
  // Best-effort starting point for the picker (default site → any site).
  const [defaultCenter, setDefaultCenter] = useState<PickedLocation | null>(null);
  // True once we have a draft restored from a previous visit (shows the notice).
  const [draftRestored, setDraftRestored] = useState(false);

  const itemsRef = useRef<ObservationUploadItem[]>([]);
  const chosenLocationRef = useRef<PickedLocation | null>(null);
  // Gate persistence until the initial draft load has run, so the empty initial
  // state never clobbers a saved draft before it is restored.
  const draftLoadedRef = useRef(false);
  // Counts enter/leave events so nested children don't flicker the drop overlay.
  const dragDepth = useRef(0);
  // Pending row-removal / navigation timeouts, cleared on unmount so they never
  // fire against a torn-down component.
  const pendingTimers = useRef<Set<number>>(new Set());
  const hasLocation = isValidLocation(chosenLocation);
  // Location is no longer a hard gate: photos can be added straight away and
  // each one falls back to its own EXIF GPS (then any chosen/default location).
  const canChooseImages = projectDecisionMade;

  // Load the steward's projects so observations can be collected for one of
  // them (writes projectRef + siteRef onto each occurrence). Optional: leaving
  // "No project" keeps the observation unattached.
  useEffect(() => {
    let cancelled = false;
    setProjectsLoaded(false);
    (async () => {
      try {
        const response = await fetch(manageApiHref("/api/manage/projects", target), { cache: "no-store" });
        const data = (await response.json()) as Array<Record<string, unknown>> | { error?: string };
        if (cancelled || !response.ok || !Array.isArray(data)) return;
        const mapped = data
          .map((raw) => {
            const did = typeof raw.did === "string" ? raw.did : null;
            const rkey = typeof raw.rkey === "string" ? raw.rkey : null;
            const atUri = typeof raw.atUri === "string" ? raw.atUri : null;
            if (!did || !rkey || !atUri) return null;
            return {
              rkey,
              did,
              atUri,
              title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Untitled project",
              imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
              locationUri: typeof raw.locationUri === "string" ? raw.locationUri : null,
            } satisfies ObservationProject;
          })
          .filter((project): project is ObservationProject => Boolean(project));
        setProjects(mapped);
        if (forProject) {
          const [forDid, forRkey] = forProject.split("/");
          const match = mapped.find((project) => project.did === forDid && project.rkey === forRkey);
          if (match) {
            setProjectUri(match.atUri);
            setProjectDecisionMade(true);
          }
        }
      } catch {
        // Project attachment is optional; ignore load failures.
      } finally {
        if (!cancelled) setProjectsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, forProject]);

  const selectedProject = projects.find((project) => project.atUri === projectUri) ?? null;

  function chooseProject(nextProjectUri: string) {
    setProjectUri(nextProjectUri);
    setProjectDecisionMade(true);
    setBulkError(null);
  }

  function skipProject() {
    setProjectUri("");
    setProjectDecisionMade(true);
    setBulkError(null);
  }

  function changeProject() {
    if (isBulkUploading) return;
    setProjectDecisionMade(false);
    setBulkError(null);
  }

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    chosenLocationRef.current = chosenLocation;
  }, [chosenLocation]);

  // Restore any in-progress draft for this target once, on mount.
  useEffect(() => {
    let cancelled = false;
    void loadDraft<DraftItem>(target.did)
      .then((draft) => {
        if (cancelled) {
          draftLoadedRef.current = true;
          return;
        }
        if (draft && draft.items.length > 0) {
          const restored: ObservationUploadItem[] = draft.items.map((stored) => {
            const item = {
              ...stored,
              previewUrl: URL.createObjectURL(stored.file),
              progress: 0,
              uploadedUri: null,
            };
            return item;
          });
          setItems(restored);
          if (typeof draft.projectUri === "string") setProjectUri(draft.projectUri);
          if (draft.projectDecisionMade || typeof draft.projectUri === "string" || restored.length > 0) setProjectDecisionMade(true);
          if (isValidLocation(draft.chosenLocation)) setChosenLocation(draft.chosenLocation);
          setDraftRestored(true);
          // Resume any analysis that was interrupted mid-flight.
          for (const item of restored) if (item.status === "analyzing") void analyzeItem(item);
        }
        draftLoadedRef.current = true;
      })
      .catch(() => {
        draftLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
    // Restore is intentionally a once-per-mount effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.did]);

  // Persist the draft (debounced) whenever the reviewable items or chosen
  // location change. Uploaded items are dropped; an empty draft is cleared.
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const timer = window.setTimeout(() => {
      const persistItems: DraftItem[] = items
        .filter((item) => item.status !== "uploaded")
        .map((item) => ({
          id: item.id,
          file: item.file,
          originalSize: item.originalSize,
          compressed: item.compressed,
          groupId: item.groupId,
          selected: item.selected,
          status: item.status === "uploading" || item.status === "uploaded" ? "ready" : item.status,
          error: item.error,
          analysis: item.analysis,
        }));
      if (persistItems.length === 0) {
        void clearDraft(target.did);
      } else {
        void saveDraft<DraftItem>({
          did: target.did,
          chosenLocation,
          projectUri: projectUri || null,
          projectDecisionMade,
          items: persistItems,
          updatedAt: Date.now(),
        });
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [items, chosenLocation, projectDecisionMade, projectUri, target.did]);

  function discardDraft() {
    setItems((current) => {
      for (const item of current) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
    setExpandedId(null);
    setUploadProgressIds(new Set());
    setDraftRestored(false);
    setBulkError(null);
    void clearDraft(target.did);
  }

  // Seed the picker's default centre from the owner's default site once.
  useEffect(() => {
    const controller = new AbortController();
    void fetchDefaultObservationCenter(target.did, controller.signal)
      .then((center) => {
        if (center) setDefaultCenter(center);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [target.did]);

  // Ingest photos handed off from the unified "Add data" drop zone, once. The
  // project step is skipped (treated as no project) so the photos land straight
  // in review; the steward can still attach a project from the in-section flow.
  const handoffConsumedRef = useRef(false);
  useEffect(() => {
    if (handoffConsumedRef.current) return;
    handoffConsumedRef.current = true;
    const files = takeAddDataHandoff("observation");
    if (files.length === 0) return;
    setProjectDecisionMade(true);
    void addFiles(files, { bypassProjectGate: true });
    // Runs once on mount; addFiles closes over the freshest refs it needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  function scheduleTimer(fn: () => void, delay: number) {
    const id = window.setTimeout(() => {
      pendingTimers.current.delete(id);
      fn();
    }, delay);
    pendingTimers.current.add(id);
  }

  // Drop fully-uploaded rows from state (and revoke their previews). Removing
  // them from `items` also drops them from the persisted draft on the next save,
  // so they never reappear on reload.
  function dropItems(ids: Set<string>) {
    setItems((current) => {
      for (const item of current) {
        if (ids.has(item.id)) URL.revokeObjectURL(item.previewUrl);
      }
      return current.filter((candidate) => !ids.has(candidate.id));
    });
  }

  // Animate uploaded rows out: once rows reach "uploaded" they render green, then
  // this drops them after a short linger so AnimatePresence can play their exit.
  // Driven by committed `items` (not the upload loop) so it never races state —
  // the timer keeps resetting while uploads are still landing, then fires once the
  // run settles. dropItems only touches setItems, so it is safe to omit from deps.
  useEffect(() => {
    const uploadedIds = items.filter((item) => item.status === "uploaded").map((item) => item.id);
    if (uploadedIds.length === 0) return;
    const ids = new Set(uploadedIds);
    const timer = window.setTimeout(() => dropItems(ids), UPLOADED_LINGER_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function openLocationPicker(opts: { initial?: PickedLocation | null; onSelect: (location: PickedLocation) => void }) {
    modal.pushModal(
      {
        id: LocationPickerModalId,
        dialogWidth: "max-w-2xl",
        content: (
          <LocationPickerModal
            initial={opts.initial ?? null}
            defaultCenter={defaultCenter}
            onSelect={opts.onSelect}
          />
        ),
      },
      true,
    );
    void modal.show();
  }

  function chooseObservationLocation() {
    openLocationPicker({
      initial: chosenLocation,
      onSelect: (location) => {
        setChosenLocation(location);
        setBulkError(null);
      },
    });
  }

  function changeItemLocation(itemId: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    const lat = Number.parseFloat(item?.analysis.decimalLatitude ?? "");
    const lng = Number.parseFloat(item?.analysis.decimalLongitude ?? "");
    const initial = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : chosenLocation;
    openLocationPicker({
      initial,
      onSelect: (location) => {
        updateAnalysis(itemId, {
          decimalLatitude: String(location.lat),
          decimalLongitude: String(location.lng),
        });
      },
    });
  }

  const readySelectedItems = items.filter((item) => item.selected && itemCanUpload(item));
  const editableItems = items.filter((item) => item.status !== "uploading" && item.status !== "uploaded");
  const selectedEditableItems = editableItems.filter((item) => item.selected);
  const uploadedCount = items.filter((item) => item.status === "uploaded").length;
  const uploadableCount = items.filter(itemCanUpload).length;
  const analyzingCount = items.filter((item) => item.status === "analyzing").length;
  // While an upload run is in flight the status bar reads from the frozen
  // snapshot so the totals never shrink as uploaded rows animate away; otherwise
  // it tracks the live counts.
  const displayTotal = uploadSession ? uploadSession.total : items.length;
  // Uploaded = frozen total minus everything still on screen that is not yet
  // uploaded. Removed (uploaded-then-dropped) rows are gone from `items`, so they
  // keep counting toward this; the number only ever climbs during a run.
  const displayUploaded = uploadSession
    ? uploadSession.total - items.filter((item) => item.status !== "uploaded").length
    : uploadedCount;
  const displayUploadableTotal = uploadSession ? uploadSession.uploadableTotal : uploadableCount;
  // The set of items in the current run is frozen at upload time, so its size is
  // a stable denominator even after uploaded rows are removed from `items`.
  const runSize = uploadProgressIds.size;
  const uploadProgressItems = runSize > 0 ? items.filter((item) => uploadProgressIds.has(item.id)) : [];
  const uploadFailedCount = uploadProgressItems.filter((item) => item.status === "uploadError").length;
  // Keep the bar visible after the run finishes when some uploads failed, so the
  // failed share can be shown in red (the all-success case navigates away).
  const showUploadProgress = runSize > 0 && (isBulkUploading || uploadFailedCount > 0);
  const overallProgress = displayTotal > 0 ? Math.round((displayUploaded / displayTotal) * 100) : 0;
  const failedProgress = runSize > 0 ? Math.round((uploadFailedCount / runSize) * 100) : 0;
  const groups = observationGroups(items);
  // Only offer the separate zone while dragging a photo that is currently part
  // of a multi-photo observation.
  const draggingPhoto = draggingPhotoId ? items.find((item) => item.id === draggingPhotoId) ?? null : null;
  const canSeparateDraggingPhoto = Boolean(
    draggingPhoto && items.filter((item) => item.groupId === draggingPhoto.groupId).length > 1,
  );
  const allEditableSelected = editableItems.length > 0 && selectedEditableItems.length === editableItems.length;
  const someEditableSelected = selectedEditableItems.length > 0 && !allEditableSelected;

  function dragHasFiles(event: DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (!dragHasFiles(event)) return;
    if (!projectDecisionMade) {
      setBulkError(t("projectRequired"));
      return;
    }
    void addFiles(event.dataTransfer.files);
  }

  function markItemError(id: string, message: string) {
    setItems((current) => current.map((candidate) =>
      candidate.id === id ? { ...candidate, status: "error", error: message, selected: false } : candidate,
    ));
  }

  async function analyzeItem(item: ObservationUploadItem) {
    setItems((current) => current.map((candidate) =>
      candidate.id === item.id ? { ...candidate, status: "analyzing", error: null } : candidate,
    ));

    let lastMessage = t("analysisFailed");
    for (let attempt = 0; attempt < ANALYZE_CLIENT_ATTEMPTS; attempt += 1) {
      try {
        const formData = new FormData();
        formData.set("image", item.file);
        const response = await fetch("/api/manage/observations/analyze", { method: "POST", body: formData });
        const data = (await response.json().catch(() => ({}))) as AnalyzeResponse;

        if (!response.ok || data.error) {
          lastMessage = analysisErrorMessage(data.error, t);
          // 429/5xx are transient — give it another go before surfacing an error.
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < ANALYZE_CLIENT_ATTEMPTS - 1) {
            await sleep(700 * (attempt + 1));
            continue;
          }
          markItemError(item.id, lastMessage);
          return;
        }

        setItems((current) => {
          const updated = current.map((candidate) => {
            if (candidate.id !== item.id) return candidate;
            const analysis = mergeAnalysisWithDefaults(normalizeAnalysis(data.analysis, item.file), candidate.analysis);
            return {
              ...candidate,
              status: "ready" as const,
              analysis,
              error: null,
              selected: analysisCanUpload(analysis),
            };
          });
          return autoGroupByIdentification(updated, item.id);
        });
        return;
      } catch {
        // Thrown fetch == network/connection blip; retry a couple of times.
        lastMessage = t("analysisFailed");
        if (attempt < ANALYZE_CLIENT_ATTEMPTS - 1) {
          await sleep(700 * (attempt + 1));
          continue;
        }
      }
    }
    markItemError(item.id, lastMessage);
  }

  function retryAnalysis(id: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (item) void analyzeItem(item);
  }

  async function addFiles(fileList: FileList | File[] | null, options?: { bypassProjectGate?: boolean }) {
    if (!options?.bypassProjectGate && !projectDecisionMade) {
      setBulkError(t("projectRequired"));
      return;
    }
    // Location is optional. Each photo prefers its own EXIF GPS; otherwise it
    // inherits a chosen location, then the owner's default site centre. Photos
    // with none simply upload without coordinates and can be placed later.
    const location = isValidLocation(chosenLocationRef.current)
      ? chosenLocationRef.current
      : isValidLocation(defaultCenter)
        ? defaultCenter
        : null;
    const imageFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    // Cap the total at MAX_IMAGES; tell the user how many were dropped.
    const remainingSlots = Math.max(0, MAX_IMAGES - itemsRef.current.length);
    const files = imageFiles.slice(0, remainingSlots);
    const ignored = imageFiles.length - files.length;
    if (ignored > 0) setBulkError(t("tooManyImages", { max: MAX_IMAGES, ignored }));
    else setBulkError(null);
    if (files.length === 0) return;

    setIsPreparing(true);
    try {
      const fallbackLat = location ? String(location.lat) : "";
      const fallbackLng = location ? String(location.lng) : "";
      const nextItems = await Promise.all(files.map(async (sourceFile) => {
        // Each photo starts as its own observation (groupId === id); identical
        // identifications are auto-grouped after analysis. No batch grouping.
        const id = `${sourceFile.name}-${sourceFile.size}-${sourceFile.lastModified}-${crypto.randomUUID()}`;
        const metadata = await imageMetadata(sourceFile);
        const analysis = {
          ...EMPTY_ANALYSIS,
          eventDate: metadata.eventDate || dateFromFile(sourceFile),
          decimalLatitude: metadata.decimalLatitude || fallbackLat,
          decimalLongitude: metadata.decimalLongitude || fallbackLng,
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
            groupId: id,
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
            groupId: id,
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

  function removeItems(ids: Set<string>) {
    setItems((current) => {
      for (const item of current) {
        if (ids.has(item.id)) URL.revokeObjectURL(item.previewUrl);
      }
      return current.filter((candidate) => !ids.has(candidate.id));
    });
    setExpandedId((current) => current && ids.has(current) ? null : current);
    setUploadProgressIds((current) => new Set(Array.from(current).filter((id) => !ids.has(id))));
    setBulkError(null);
  }

  function selectAllEditable() {
    setItems((current) => current.map((item) => item.status === "uploading" || item.status === "uploaded" ? item : { ...item, selected: true }));
    setBulkError(null);
  }

  function deselectAll() {
    setItems((current) => current.map((item) => item.selected ? { ...item, selected: false } : item));
    setBulkError(null);
  }

  function openRemoveSelectedModal() {
    const ids = new Set(selectedEditableItems.map((item) => item.id));
    if (ids.size === 0) {
      setBulkError(t("noSelectedToRemove"));
      return;
    }
    modal.pushModal(
      {
        id: "remove-selected-observation-images",
        content: (
          <ManageConfirmModal
            title={t("removeSelectedTitle")}
            description={t("removeSelectedDescription", { count: ids.size })}
            confirmLabel={t("removeSelectedConfirm")}
            cancelLabel={t("cancel")}
            destructive
            onConfirm={async () => {
              removeItems(ids);
              await modal.hide();
              modal.popModal();
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  }

  function separateItemFromGroup(itemId: string, sourceGroupId: string) {
    const nextGroupId = itemId === sourceGroupId ? crypto.randomUUID() : itemId;
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, groupId: nextGroupId } : item));
    setExpandedId(nextGroupId);
    setBulkError(null);
  }

  // Drag a photo onto the separate zone: pull it back into its own observation.
  function separateDraggedItem(itemId: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) return;
    separateItemFromGroup(itemId, item.groupId);
  }

  function addItemToGroup(groupId: string, itemId: string) {
    setItems((current) => {
      const targetItems = current.filter((item) => item.groupId === groupId);
      const shared = targetItems.length > 0 ? sharedOccurrenceAnalysis(occurrenceAnalysisForUpload(targetItems)) : null;
      return current.map((item) => {
        if (item.id !== itemId) return item;
        const analysis = shared ? { ...item.analysis, ...shared } : item.analysis;
        return { ...item, groupId, analysis };
      });
    });
    setExpandedId(groupId);
    setBulkError(null);
  }

  // Drag one observation row onto another: fold every photo from the source
  // group into the target group so they upload as a single observation. Skips
  // any photo already uploading/uploaded.
  function mergeGroups(sourceGroupId: string, targetGroupId: string) {
    if (sourceGroupId === targetGroupId) return;
    setItems((current) => {
      const targetItems = current.filter((item) => item.groupId === targetGroupId);
      const sourceItems = current.filter(
        (item) => item.groupId === sourceGroupId && item.status !== "uploading" && item.status !== "uploaded",
      );
      if (targetItems.length === 0 || sourceItems.length === 0) return current;
      const shared = sharedOccurrenceAnalysis(occurrenceAnalysisForUpload([...targetItems, ...sourceItems]));
      const moving = new Set(sourceItems.map((item) => item.id));
      return current.map((item) =>
        moving.has(item.id) ? { ...item, groupId: targetGroupId, analysis: { ...item.analysis, ...shared } } : item,
      );
    });
    setExpandedId(targetGroupId);
    setBulkError(null);
  }

  async function uploadGroup(groupId: string, itemIds?: Set<string>): Promise<OccurrenceRecord | null> {
    const snapshot = itemsRef.current;
    const groupItems = snapshot.filter((item) => item.groupId === groupId && (!itemIds || itemIds.has(item.id)));
    const uploadItems = groupItems.filter(itemCanUpload);
    if (uploadItems.length === 0 || disabledReason) {
      if (disabledReason) setBulkError(disabledReason);
      return null;
    }

    const uploadIds = new Set(uploadItems.map((item) => item.id));
    const data = occurrenceAnalysisForUpload(uploadItems);
    setBulkError(null);
    try {
      setItems((current) => current.map((candidate) => uploadIds.has(candidate.id) ? { ...candidate, status: "uploading", progress: 15, error: null } : candidate));
      const existingOccurrenceUri = snapshot.find((item) => item.groupId === groupId && item.uploadedUri)?.uploadedUri ?? null;
      let occurrenceUri = existingOccurrenceUri;
      // Only fresh occurrences carry the record/cid we need to set imageEvidence
      // and to build an optimistic listing entry.
      let occurrenceContext: { rkey: string; cid: string; record: Record<string, unknown> } | null = null;
      if (!occurrenceUri) {
        const occurrence = await createObservationOccurrence({
          basisOfRecord: "HumanObservation",
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
          ...(selectedProject ? { projectRef: selectedProject.atUri } : {}),
          ...(selectedProject?.locationUri ? { siteRef: selectedProject.locationUri } : {}),
        });
        occurrenceUri = occurrence.uri;
        occurrenceContext = { rkey: occurrence.rkey, cid: occurrence.cid, record: occurrence.record ?? {} };
      }
      if (!occurrenceUri) throw new Error(t("analysisFailed"));

      let primaryBlobRef: ObservationBlobRef | null = null;
      for (const item of uploadItems) {
        setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, progress: 60 } : candidate));
        const photo = await createObservationPhoto({
          imageFile: item.file,
          occurrenceRef: occurrenceUri,
          subjectPart: item.analysis.subjectPart.trim() || "wholeOrganism",
          caption: item.analysis.caption.trim() || undefined,
          siteRef: selectedProject?.locationUri ?? undefined,
        });
        if (!primaryBlobRef && photo.blobRef) primaryBlobRef = photo.blobRef;
        setItems((current) => current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, status: "uploaded", progress: 100, selected: false, uploadedUri: occurrenceUri, error: null }
            : candidate,
        ));
      }

      // The explorer surfaces a photo through the occurrence's own imageEvidence,
      // so copy the first uploaded blob there. Non-fatal: the photos are already
      // saved as ac.multimedia records either way.
      if (occurrenceContext && primaryBlobRef) {
        await setObservationPrimaryImage({
          rkey: occurrenceContext.rkey,
          record: occurrenceContext.record,
          swapCid: occurrenceContext.cid,
          blobRef: primaryBlobRef,
        }).catch(() => {});
      }

      if (occurrenceContext) {
        return await buildOptimisticOccurrence({
          did: target.did,
          uri: occurrenceUri,
          rkey: occurrenceContext.rkey,
          analysis: data,
          blobRef: primaryBlobRef,
          isoTimestamp: new Date().toISOString(),
          creatorName: target.displayName,
        }).catch(() => null);
      }
      return null;
    } catch (error) {
      const message = formatObservationMutationError(error);
      setItems((current) => current.map((candidate) =>
        uploadIds.has(candidate.id) && candidate.status === "uploading"
          ? { ...candidate, status: "uploadError", progress: 0, error: message }
          : candidate,
      ));
      return null;
    }
  }

  async function uploadSelected() {
    if (readySelectedItems.length === 0) {
      setBulkError(t("noReadySelected"));
      return;
    }
    const selectedIds = new Set(readySelectedItems.map((item) => item.id));
    // Collapse every expanded row and freeze the status-bar counts for the run.
    setExpandedId(null);
    setUploadProgressIds(selectedIds);
    setIsBulkUploading(true);
    setUploadSession({ total: items.length, uploadableTotal: uploadableCount });
    try {
      const groupIds = Array.from(new Set(readySelectedItems.map((item) => item.groupId)));
      const created: OccurrenceRecord[] = [];
      for (const groupId of groupIds) {
        const record = await uploadGroup(groupId, selectedIds);
        if (record) created.push(record);
      }
      // Surface the new observations in the list right away (the indexer lags).
      // Uploaded rows turn green and animate out via the removal effect.
      if (created.length > 0) onUploaded([...created].reverse());
      // Once the green rows have lingered and animated away, either return to the
      // list (everything uploaded → nothing left) or thaw the frozen counts so the
      // bar reflects the rows that remain (failed or unselected).
      scheduleTimer(() => {
        if (itemsRef.current.length === 0) {
          void clearDraft(target.did);
          onBack();
        } else {
          setUploadSession(null);
        }
      }, UPLOADED_LINGER_MS + ROW_EXIT_MS);
    } finally {
      setIsBulkUploading(false);
    }
  }

  return (
    <div
      className="relative"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Container className="space-y-4 pt-3 pb-12">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 mb-2 h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon className="size-4" /> {t("backToObservations")}
          </Button>
          <div>
            <h1 className="font-instrument text-xl font-medium italic tracking-[-0.03em] text-foreground sm:text-2xl">
              {t("bulkTitle")}
            </h1>
            <p className="mt-1 text-sm leading-snug text-muted-foreground">{t("bulkIntro")}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {draftRestored && items.length > 0 ? (
              <span className="inline-flex h-8 items-center gap-1.5 pr-1 text-xs font-medium text-foreground">
                <RotateCcwIcon className="size-3.5 shrink-0 text-primary" />
                {t("draftRestored")}
                <QuickTooltip content={t("discardDraft")} asChild>
                  <button
                    type="button"
                    onClick={discardDraft}
                    aria-label={t("discardDraft")}
                    className="grid size-6 shrink-0 place-items-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </QuickTooltip>
              </span>
            ) : null}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {projectDecisionMade ? (
                <ProjectBar project={selectedProject} hasProject={Boolean(projectUri)} onChange={changeProject} />
              ) : null}
              {hasLocation ? (
                <LocationBar location={chosenLocation!} onChange={chooseObservationLocation} />
              ) : (
                <Button variant="outline" size="sm" onClick={chooseObservationLocation} className="gap-1.5 text-muted-foreground">
                  <MapPinIcon className="size-3.5 shrink-0 text-primary" />
                  <span className="hidden sm:inline">{t("location.setLocationOptional")}</span>
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onFilesChanged} className="sr-only" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPreparing || !canChooseImages}
                title={!projectDecisionMade ? t("projectRequired") : undefined}
              >
                {isPreparing ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
                <span className="hidden sm:inline">
                  {isPreparing ? t("preparingImages") : items.length > 0 ? t("chooseMoreImages") : t("chooseImages")}
                </span>
              </Button>
            </div>
          </div>
        </div>

        {bulkError || disabledReason ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <span>{bulkError ?? disabledReason}</span>
          </div>
        ) : null}

        {!projectDecisionMade ? (
          <ProjectStep
            projects={projects}
            loading={!projectsLoaded}
            value={projectUri}
            onChoose={chooseProject}
            onSkip={skipProject}
          />
        ) : items.length === 0 && !uploadSession ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`group flex min-h-[340px] w-full flex-col items-center justify-center rounded-3xl border border-dashed p-8 text-center transition-colors ${isDragging ? "border-primary/60 bg-primary/[0.08]" : "border-primary/25 bg-gradient-to-b from-primary/[0.04] to-transparent hover:border-primary/40 hover:from-primary/[0.07]"}`}
          >
            <span className="mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-105">
              <ImagePlusIcon className="size-7" />
            </span>
            <span className="font-instrument text-2xl font-medium italic tracking-[-0.02em]">{t("emptyUploadTitle")}</span>
            <span className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("emptyUploadHint")}</span>
            <span className="mt-5 text-xs text-muted-foreground/80">{t("fileRequirements")}</span>
          </button>
        ) : (
          <>
            <div className="space-y-4 rounded-2xl bg-muted/45 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {analyzingCount > 0 ? (
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
                      {t("analyzingCount", { count: analyzingCount, total: items.length })}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground">
                        {t("uploadedCount", { uploaded: displayUploaded, total: displayTotal })}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t("selectedCount", { selected: readySelectedItems.length, total: displayUploadableTotal })}
                        <span className="mx-1.5 text-muted-foreground/50">·</span>
                        {t("mediaGroupHint")}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={openRemoveSelectedModal} disabled={selectedEditableItems.length === 0} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2Icon className="size-4" /> {t("removeSelected")}
                  </Button>
                  <Button size="sm" onClick={() => void uploadSelected()} disabled={isBulkUploading || readySelectedItems.length === 0 || Boolean(disabledReason)} title={disabledReason ?? undefined}>
                    {isBulkUploading ? <Loader2Icon className="size-4 animate-spin" /> : <UploadCloudIcon className="size-4" />}
                    {isBulkUploading ? t("uploadingSelected") : t("uploadSelected")}
                  </Button>
                </div>
              </div>
              {showUploadProgress ? (
                <ProgressBar
                  value={overallProgress}
                  errorValue={failedProgress}
                  label={
                    !isBulkUploading && uploadFailedCount > 0
                      ? t("uploadFailedSummary", { failed: uploadFailedCount, total: uploadProgressItems.length })
                      : t("progressLabel", { progress: overallProgress })
                  }
                />
              ) : null}
            </div>

            <div>
              <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                <ObservationListHeader
                  checked={allEditableSelected ? true : someEditableSelected ? "indeterminate" : false}
                  disabled={editableItems.length === 0}
                  onCheckedChange={(checked) => {
                    if (checked === true) selectAllEditable();
                    else deselectAll();
                  }}
                />
                <div className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                  {groups.map((group, index) => (
                    <ObservationListItem
                      key={group.id}
                      group={group}
                      groups={groups}
                      index={index}
                      expanded={group.id === expandedId}
                      onToggleExpanded={() => {
                        if (isBulkUploading) return;
                        setExpandedId((current) => (current === group.id ? null : group.id));
                      }}
                      onAnalysisChange={updateAnalysis}
                      onToggleSelected={(checked) => {
                        const groupItemIds = new Set(group.items.map((item) => item.id));
                        setItems((current) => current.map((candidate) => groupItemIds.has(candidate.id) && candidate.status !== "uploading" && candidate.status !== "uploaded" ? { ...candidate, selected: checked } : candidate));
                      }}
                      onRetry={(id) => retryAnalysis(id)}
                      onSeparateItem={(id) => separateItemFromGroup(id, group.id)}
                      onAddItem={addItemToGroup}
                      onMergeGroups={mergeGroups}
                      dragDisabled={isBulkUploading}
                      onPhotoDragStart={setDraggingPhotoId}
                      onPhotoDragEnd={() => setDraggingPhotoId(null)}
                      onChangeLocation={changeItemLocation}
                    />
                  ))}
                  </AnimatePresence>
                </div>
              </div>
              {canSeparateDraggingPhoto ? (
                <PhotoSeparateDropZone
                  onSeparate={(itemId) => {
                    separateDraggedItem(itemId);
                    setDraggingPhotoId(null);
                  }}
                />
              ) : null}
            </div>
          </>
        )}
      </Container>

      <AnimatePresence>
        {isDragging ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary/50 bg-card/80 px-10 py-8 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <UploadCloudIcon className="size-7" />
              </span>
              <span className="font-instrument text-2xl italic tracking-[-0.02em] text-foreground">{t("dropToAdd")}</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProjectStep({
  projects,
  loading,
  value,
  onChoose,
  onSkip,
}: {
  projects: ObservationProject[];
  loading: boolean;
  value: string;
  onChoose: (projectUri: string) => void;
  onSkip: () => void;
}) {
  const t = useTranslations("upload.observations");
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-primary/30 bg-gradient-to-b from-primary/[0.06] to-transparent p-8 text-center">
      <span className="mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <FolderKanbanIcon className="size-7" />
      </span>
      <h2 className="font-instrument text-2xl font-medium italic tracking-[-0.02em] text-foreground">{t("projectStepTitle")}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("projectStepBody")}</p>
      <div className="mt-5 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
        {loading ? (
          <Button disabled className="w-full sm:flex-1">
            <Loader2Icon className="size-4 animate-spin" /> {t("projectLoading")}
          </Button>
        ) : projects.length > 0 ? (
          <Select value={value || undefined} onValueChange={onChoose}>
            <SelectTrigger className="h-10 w-full rounded-full bg-background text-left sm:flex-1">
              <SelectValue placeholder={t("projectChoose")} />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.atUri} value={project.atUri}>
                  <span className="flex items-center gap-2">
                    {project.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={project.imageUrl} alt="" className="size-5 shrink-0 rounded object-cover ring-1 ring-border" />
                    ) : (
                      <FolderKanbanIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{project.title}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button variant={projects.length > 0 ? "outline" : "default"} className="w-full sm:w-auto" onClick={onSkip} disabled={loading}>
          {t("projectSkip")}
        </Button>
      </div>
    </div>
  );
}

function ProjectBar({ project, hasProject, onChange }: { project: ObservationProject | null; hasProject: boolean; onChange: () => void }) {
  const t = useTranslations("upload.observations");
  const label = project?.title ?? (hasProject ? t("projectLoading") : t("projectNoneSelected"));
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onChange}
      title={t("changeProject")}
      className="max-w-full gap-1.5"
    >
      <FolderKanbanIcon className="size-3.5 shrink-0 text-primary" />
      <span className="truncate">{label}</span>
      <PencilIcon className="size-3 shrink-0 text-muted-foreground" />
    </Button>
  );
}

function LocationBar({ location, onChange }: { location: PickedLocation; onChange: () => void }) {
  const t = useTranslations("upload.observations.location");
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onChange}
      title={t("changeLocation")}
      className="max-w-full gap-1.5"
    >
      <MapPinIcon className="size-3.5 shrink-0 text-primary" />
      <span className="truncate tabular-nums">
        {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
      </span>
      <PencilIcon className="size-3 shrink-0 text-muted-foreground" />
    </Button>
  );
}

function ObservationLocationRow({
  analysis,
  disabled,
  onChange,
}: {
  analysis: ObservationAnalysis;
  disabled: boolean;
  onChange: () => void;
}) {
  const t = useTranslations("upload.observations.location");
  const lat = analysis.decimalLatitude.trim();
  const lng = analysis.decimalLongitude.trim();
  const hasCoords = Boolean(lat && lng);
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5 text-sm">
        <MapPinIcon className={`size-4 shrink-0 ${hasCoords ? "text-primary" : "text-muted-foreground/50"}`} />
        <span className="min-w-0">
          <span className="block text-xs font-medium text-muted-foreground">{t("itemLocation")}</span>
          <span className="block truncate text-foreground tabular-nums">{hasCoords ? `${lat}, ${lng}` : "—"}</span>
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={onChange} disabled={disabled}>
        <MapPinIcon className="size-4" /> {t("editItemLocation")}
      </Button>
    </div>
  );
}

function ObservationListHeader({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean | "indeterminate";
  disabled: boolean;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
}) {
  const t = useTranslations("upload.observations");
  return (
    <div className={`${ROW_GRID} border-b bg-muted/40 px-3 py-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80`}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={checked === true ? t("deselectAll") : t("selectAll")}
        className="shrink-0"
      />
      <span aria-hidden />
      <span>{t("colOrganism")}</span>
      <span className="hidden md:block">{t("colDate")}</span>
      <span className="hidden md:block">{t("colLocation")}</span>
      <span className="hidden lg:block">{t("colKind")}</span>
      <span className="hidden lg:block">{t("colGroup")}</span>
      <span className="hidden xl:block">{t("colConfidence")}</span>
      <span className="text-right">{t("colStatus")}</span>
    </div>
  );
}

function ObservationListItem({
  group,
  groups,
  index,
  expanded,
  onToggleExpanded,
  onAnalysisChange,
  onToggleSelected,
  onRetry,
  onSeparateItem,
  onAddItem,
  onMergeGroups,
  dragDisabled,
  onPhotoDragStart,
  onPhotoDragEnd,
  onChangeLocation,
}: {
  group: ObservationGroup;
  groups: ObservationGroup[];
  index: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onAnalysisChange: (id: string, patch: Partial<ObservationAnalysis>) => void;
  onToggleSelected: (checked: boolean) => void;
  onRetry: (id: string) => void;
  onSeparateItem: (id: string) => void;
  onAddItem: (groupId: string, itemId: string) => void;
  onMergeGroups: (sourceGroupId: string, targetGroupId: string) => void;
  dragDisabled: boolean;
  onPhotoDragStart: (itemId: string) => void;
  onPhotoDragEnd: () => void;
  onChangeLocation: (id: string) => void;
}) {
  const t = useTranslations("upload.observations");
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [item] = group.items;
  const analysis = occurrenceAnalysisForUpload(group.items);
  const groupedCount = group.items.length;
  const editableItems = group.items.filter((candidate) => candidate.status !== "uploading" && candidate.status !== "uploaded");
  const selectedEditableCount = editableItems.filter((candidate) => candidate.selected).length;
  const checked = editableItems.length > 0 && selectedEditableCount === editableItems.length ? true : selectedEditableCount > 0 ? "indeterminate" : false;
  const disabled = editableItems.length === 0;
  const showAnalysis = group.items.some((candidate) => candidate.status === "ready" || candidate.status === "uploading" || candidate.status === "uploaded" || candidate.status === "uploadError");
  const canEdit = group.items.some((candidate) => candidate.status === "ready" || candidate.status === "uploadError");
  const primaryStatus = groupStatus(group.items);
  const isUploaded = primaryStatus === "uploaded";
  const canDrag = !dragDisabled && !isUploaded && primaryStatus !== "uploading";
  const retryItem = group.items.find((candidate) => candidate.status === "error");

  function rowDragKind(event: DragEvent<HTMLDivElement>): "group" | "item" | null {
    const types = Array.from(event.dataTransfer?.types ?? []);
    if (types.includes(DND_GROUP)) return "group";
    if (types.includes(DND_ITEM)) return "item";
    return null;
  }

  const isUnidentified = isUnidentifiedScientificName(analysis.scientificName);
  const organism = isUnidentified ? t("unidentifiedOrganism") : analysis.scientificName.trim() || group.label || (item ? cleanFileName(item.file.name) : t("unidentified"));
  const commonName = analysis.vernacularName.trim();
  const dateText = analysis.eventDate.trim();
  const locationText = (analysis.locality || analysis.country).trim();
  const hasCoords = Boolean(analysis.decimalLatitude.trim() && analysis.decimalLongitude.trim());
  const coordsText = hasCoords ? `${analysis.decimalLatitude.trim()}, ${analysis.decimalLongitude.trim()}` : "";
  const locationDisplay = locationText || coordsText;
  const groupText = groupedCount > 1 ? t("photoCount", { count: groupedCount }) : t("singlePhoto");
  const kindText = analysis.kingdom.trim();
  const confidenceValues = group.items.map((candidate) => candidate.analysis.confidence).filter((value): value is number => typeof value === "number");
  const confidenceText = confidenceValues.length > 0 ? `${Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 100)}%` : "—";
  const groupProgress = groupedCount > 0 ? Math.round(group.items.reduce((sum, candidate) => sum + candidate.progress, 0) / groupedCount) : 0;
  const errorItems = group.items.filter((candidate) => candidate.error);
  // On mobile the extra review columns are hidden, so fold the essentials into a meta line.
  const metaBits = showAnalysis ? [dateText, locationDisplay, kindText, groupedCount > 1 ? groupText : null].filter((value): value is string => Boolean(value)) : item ? [formatBytes(item.file.size)] : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1], delay: Math.min(index * 0.03, 0.18) } }}
      exit={{ opacity: 0, height: 0, transition: { duration: ROW_EXIT_MS / 1000, ease: [0.25, 0.1, 0.25, 1] } }}
      onDragOver={(event) => {
        if (!rowDragKind(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!isDropTarget) setIsDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (!rowDragKind(event)) return;
        setIsDropTarget(false);
      }}
      onDrop={(event) => {
        const kind = rowDragKind(event);
        if (!kind) return;
        event.preventDefault();
        event.stopPropagation();
        setIsDropTarget(false);
        if (kind === "group") {
          const sourceGroupId = event.dataTransfer.getData(DND_GROUP);
          if (sourceGroupId) onMergeGroups(sourceGroupId, group.id);
        } else {
          const itemId = event.dataTransfer.getData(DND_ITEM);
          if (itemId) onAddItem(group.id, itemId);
        }
      }}
      className={`group/row relative transition-colors duration-300 ${isUploaded ? "overflow-hidden bg-primary text-primary-foreground" : expanded ? "bg-primary/[0.045]" : item.selected ? "bg-primary/[0.025]" : "hover:bg-muted/40"}${isDropTarget ? " ring-2 ring-inset ring-primary/50" : ""}`}
    >
      {isUploaded ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex items-center gap-3 px-3 py-3.5"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-foreground/15">
            <CheckCircle2Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{organism}</span>
          <span className="shrink-0 text-sm font-semibold">{t("status.uploaded")}</span>
        </motion.div>
      ) : (
      <>
      {expanded ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" /> : null}
      <div className={`${ROW_GRID} gap-y-1 px-3 py-2`}>
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onToggleSelected(value === true)}
          aria-label={t("selectImage")}
          className="shrink-0"
        />
        <div
          draggable={canDrag}
          onDragStart={(event) => {
            if (!canDrag) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.setData(DND_GROUP, group.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          className={canDrag ? "cursor-grab active:cursor-grabbing" : undefined}
          title={canDrag ? t("dragRowHint") : undefined}
        >
          <StackedThumbnails group={group} />
        </div>

        {/* Organism */}
        {canEdit ? (
          <button type="button" onClick={onToggleExpanded} aria-expanded={expanded} className="group/name min-w-0 text-left" title={t("editDetails")}>
            <OrganismCell organism={organism} commonName={commonName} metaBits={metaBits} unidentified={isUnidentified} interactive />
          </button>
        ) : (
          <div className="min-w-0">
            <OrganismCell organism={organism} commonName={commonName} metaBits={metaBits} unidentified={isUnidentified} />
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

        {/* Kind (wide desktop column) */}
        <div className="hidden min-w-0 lg:block">
          <span className="truncate text-sm text-muted-foreground">{kindText || "—"}</span>
        </div>

        {/* Observation grouping (wide desktop column) */}
        <div className="hidden min-w-0 items-center gap-1.5 lg:flex">
          <Layers2Icon className={`size-3.5 shrink-0 ${groupedCount > 1 ? "text-primary/70" : "text-muted-foreground/45"}`} />
          <span className="truncate text-sm text-muted-foreground">{groupText}</span>
        </div>

        {/* AI confidence (widest desktop column) */}
        <div className="hidden min-w-0 xl:block">
          <span className="truncate text-sm text-muted-foreground">{confidenceText}</span>
        </div>

        {/* Trailing: one status or action */}
        <div className="flex shrink-0 items-center justify-end">
          <ObservationRowAction
            status={primaryStatus}
            expanded={expanded}
            canEdit={canEdit}
            analysisProgress={{
              done: group.items.filter((candidate) => candidate.status !== "analyzing").length,
              total: group.items.length,
            }}
            onEdit={onToggleExpanded}
            onRetry={() => retryItem ? onRetry(retryItem.id) : undefined}
          />
        </div>
      </div>

      {primaryStatus === "uploading" ? (
        <div className="px-3 pb-3">
          <ProgressBar value={groupProgress} label={t("progressLabel", { progress: groupProgress })} />
        </div>
      ) : null}
      {errorItems.length > 0 ? (
        <p className="flex items-center gap-1.5 px-3 pb-3 text-xs text-destructive">
          <AlertTriangleIcon className="size-3.5 shrink-0" /> {errorItems[0]?.error}
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
                  {t("photoCount", { count: groupedCount })}
                </span>
                {confidenceValues.length > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                    {t("aiConfidence", { confidence: Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 100) })}
                  </span>
                ) : null}
              </div>
              <GroupMediaEditor group={group} groups={groups} onSeparateItem={onSeparateItem} onAddItem={onAddItem} onPhotoDragStart={onPhotoDragStart} onPhotoDragEnd={onPhotoDragEnd} />
              {item ? (
                <ObservationLocationRow
                  analysis={analysis}
                  disabled={item.status === "uploading" || item.status === "uploaded"}
                  onChange={() => onChangeLocation(item.id)}
                />
              ) : null}
              {item ? <ObservationAnalysisFields item={item} onChange={(patch) => onAnalysisChange(item.id, patch)} /> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </>
      )}
    </motion.div>
  );
}

function groupStatus(items: ObservationUploadItem[]): ItemStatus {
  if (items.some((item) => item.status === "uploading")) return "uploading";
  if (items.some((item) => item.status === "analyzing")) return "analyzing";
  if (items.some((item) => item.status === "ready")) return "ready";
  if (items.some((item) => item.status === "uploadError")) return "uploadError";
  if (items.length > 0 && items.every((item) => item.status === "uploaded")) return "uploaded";
  return "error";
}

function StackedThumbnails({ group, size = "sm" }: { group: ObservationGroup; size?: "sm" | "lg" }) {
  const visible = group.items.slice(0, 3);
  const count = group.items.length;
  const large = size === "lg";
  return (
    <div className={`${large ? "size-20" : "size-10"} relative shrink-0 overflow-visible`}>
      {visible.map((item, index) => (
        <div
          key={item.id}
          className={`absolute overflow-hidden bg-muted ring-1 ring-background ${large ? "h-20 w-20 rounded-2xl" : "h-10 w-10 rounded-lg"}`}
          style={{ transform: `translate(${index * (large ? 5 : 4)}px, ${index * (large ? -4 : -3)}px)`, zIndex: 3 - index }}
        >
          <img src={item.previewUrl} alt={item.file.name} draggable={false} className="h-full w-full object-cover" />
        </div>
      ))}
      {count > 1 ? (
        <span className={`absolute z-10 grid place-items-center rounded-full bg-primary font-semibold text-primary-foreground ring-2 ring-background ${large ? "-right-3 -top-3 h-6 min-w-6 px-1.5 text-[0.7rem]" : "-right-3 -top-2 h-5 min-w-5 px-1 text-[0.6rem]"}`}>
          {count}
        </span>
      ) : null}
    </div>
  );
}

// Shown beneath the list while a photo is being dragged; dropping it here pulls
// that photo back out into its own observation row.
function PhotoSeparateDropZone({ onSeparate }: { onSeparate: (itemId: string) => void }) {
  const t = useTranslations("upload.observations");
  const [isOver, setIsOver] = useState(false);
  const isItemDrag = (event: DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer?.types ?? []).includes(DND_ITEM);
  return (
    <div
      onDragOver={(event) => {
        if (!isItemDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(event) => {
        if (!isItemDrag(event)) return;
        setIsOver(false);
      }}
      onDrop={(event) => {
        if (!isItemDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setIsOver(false);
        const itemId = event.dataTransfer.getData(DND_ITEM);
        if (itemId) onSeparate(itemId);
      }}
      className={cn(
        "mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-5 text-sm transition-colors",
        isOver ? "border-primary bg-primary/10 text-primary" : "border-primary/40 bg-primary/[0.04] text-muted-foreground",
      )}
    >
      <Layers2Icon className="size-4 shrink-0" />
      {t("separateDropZone")}
    </div>
  );
}

function GroupMediaEditor({
  group,
  groups,
  onSeparateItem,
  onAddItem,
  onPhotoDragStart,
  onPhotoDragEnd,
}: {
  group: ObservationGroup;
  groups: ObservationGroup[];
  onSeparateItem: (id: string) => void;
  onAddItem: (groupId: string, itemId: string) => void;
  onPhotoDragStart: (itemId: string) => void;
  onPhotoDragEnd: () => void;
}) {
  const t = useTranslations("upload.observations");
  const [showChooser, setShowChooser] = useState(false);
  const availableItems = groups
    .filter((candidate) => candidate.id !== group.id)
    .flatMap((candidate) => candidate.items)
    .filter((item) => item.status !== "uploading" && item.status !== "uploaded");

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <Layers2Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{t("mediaInObservation")}</span>
      </div>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">{t("mediaEditorHint")}</p>
      <div className="flex flex-wrap gap-2.5">
        {group.items.map((item) => {
          const editable = item.status !== "uploading" && item.status !== "uploaded";
          const canSeparate = group.items.length > 1 && editable;
          return (
            <div
              key={item.id}
              draggable={editable}
              onDragStart={(event) => {
                if (!editable) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.setData(DND_ITEM, item.id);
                event.dataTransfer.effectAllowed = "move";
                onPhotoDragStart(item.id);
              }}
              onDragEnd={onPhotoDragEnd}
              title={editable ? t("dragPhotoHint") : undefined}
              className={cn(
                "group/media relative size-20 overflow-hidden rounded-2xl bg-muted ring-1 ring-border",
                editable && "cursor-grab active:cursor-grabbing",
              )}
            >
              <img src={item.previewUrl} alt={item.file.name} draggable={false} className="h-full w-full object-cover" />
              {canSeparate ? (
                <QuickTooltip content={t("removeFromObservation")} asChild>
                  <button
                    type="button"
                    onClick={() => onSeparateItem(item.id)}
                    aria-label={t("removeFromObservation")}
                    className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:bg-background group-hover/media:opacity-100 focus:opacity-100"
                  >
                    <XIcon className="size-4" />
                  </button>
                </QuickTooltip>
              ) : null}
            </div>
          );
        })}
        {availableItems.length > 0 ? (
          <QuickTooltip content={t("addMediaTitle")} asChild>
            <button
              type="button"
              onClick={() => setShowChooser((current) => !current)}
              aria-expanded={showChooser}
              aria-label={t("addMediaTitle")}
              className="grid size-20 place-items-center rounded-2xl border border-dashed border-primary/30 bg-primary/[0.04] text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <ImagePlusIcon className="size-6" />
            </button>
          </QuickTooltip>
        ) : null}
      </div>

      {showChooser && availableItems.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border/70 bg-background p-3">
          <p className="mb-3 text-xs leading-5 text-muted-foreground">{t("addMediaHint")}</p>
          <div className="flex flex-wrap gap-2.5">
            {availableItems.map((item) => (
              <QuickTooltip key={item.id} content={t("addToObservation")} asChild>
                <button
                  type="button"
                  onClick={() => {
                    onAddItem(group.id, item.id);
                    setShowChooser(false);
                  }}
                  aria-label={t("addToObservation")}
                  className="group/add relative size-20 overflow-hidden rounded-2xl bg-muted ring-1 ring-border transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                  <span className="absolute inset-0 grid place-items-center bg-background/0 transition-colors group-hover/add:bg-background/45 group-focus:bg-background/45">
                    <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-sm transition-opacity group-hover/add:opacity-100 group-focus:opacity-100">
                      <ImagePlusIcon className="size-4" />
                    </span>
                  </span>
                </button>
              </QuickTooltip>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrganismCell({ organism, commonName, metaBits, unidentified, interactive }: { organism: string; commonName: string; metaBits: string[]; unidentified?: boolean; interactive?: boolean }) {
  return (
    <>
      <span className={`block truncate text-sm font-medium ${unidentified ? "text-destructive" : "text-foreground"} ${interactive ? "underline-offset-2 group-hover/name:underline group-hover/name:decoration-dotted" : ""} ${interactive && !unidentified ? "group-hover/name:text-primary" : ""}`}>
        {organism}
      </span>
      {commonName ? <span className="block truncate text-xs italic text-muted-foreground">{commonName}</span> : null}
      {metaBits.length > 0 ? (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground md:hidden">{metaBits.join(" · ")}</span>
      ) : null}
    </>
  );
}

function ObservationRowAction({
  status,
  expanded,
  canEdit,
  analysisProgress,
  onEdit,
  onRetry,
}: {
  status: ItemStatus;
  expanded: boolean;
  canEdit: boolean;
  analysisProgress?: { done: number; total: number };
  onEdit: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("upload.observations");
  const statusT = useTranslations("upload.observations.status");

  if (status === "error") {
    return (
      <Button variant="ghost" size="sm" onClick={onRetry} className="h-8 px-2.5 text-muted-foreground hover:text-primary">
        <RotateCcwIcon className="size-3.5" /> {t("retryAnalysis")}
      </Button>
    );
  }

  if (status === "analyzing" && analysisProgress) {
    return <CircularAnalysisProgress done={analysisProgress.done} total={analysisProgress.total} />;
  }

  if (canEdit) {
    return (
      <Button
        variant={expanded ? "default" : "outline"}
        size="sm"
        onClick={onEdit}
        aria-expanded={expanded}
        className={expanded ? "h-9 min-w-20 px-3 shadow-sm" : "h-9 min-w-20 border-primary/35 bg-primary/10 px-3 font-semibold text-primary shadow-sm hover:bg-primary/15 hover:text-primary"}
      >
        {expanded ? t("doneEditing") : t("editShort")}
      </Button>
    );
  }

  const busy = status === "analyzing" || status === "uploading";
  const icon = busy
    ? <Loader2Icon className="size-3.5 animate-spin" />
    : status === "uploaded"
      ? <CheckCircle2Icon className="size-3.5" />
      : status === "uploadError"
        ? <AlertTriangleIcon className="size-3.5" />
        : null;
  const tone = status === "uploaded"
    ? "text-primary"
    : status === "uploadError"
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <span className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${tone}`}>
      {icon}
      {statusT(status)}
    </span>
  );
}

function CircularAnalysisProgress({ done, total }: { done: number; total: number }) {
  const t = useTranslations("upload.observations");
  const boundedTotal = Math.max(1, total);
  const boundedDone = Math.max(0, Math.min(done, boundedTotal));
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (boundedDone / boundedTotal) * circumference;
  const label = t("status.analyzing");
  const valueText = t("analysisProgress", { done: boundedDone, total: boundedTotal });

  return (
    <span
      className="inline-flex h-9 min-w-24 items-center justify-end gap-2 text-xs font-medium text-muted-foreground"
      aria-label={valueText}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={boundedTotal}
      aria-valuenow={boundedDone}
    >
      <span className="relative grid size-7 place-items-center">
        <svg className="size-7 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/80" />
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-primary transition-[stroke-dashoffset] duration-300"
          />
        </svg>
      </span>
      <span>{label}</span>
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

function ProgressBar({ value, errorValue = 0, label, className }: { value: number; errorValue?: number; label: string; className?: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  const failed = Math.max(0, Math.min(100 - bounded, errorValue));
  return (
    <div className={className} aria-label={label} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${bounded}%` }} />
        <div className="h-full bg-destructive transition-all" style={{ width: `${failed}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
