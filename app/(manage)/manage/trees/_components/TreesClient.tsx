"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloudUploadIcon,
  DatabaseIcon,
  ImageIcon,
  InfoIcon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  RefreshCcwIcon,
  SearchIcon,
  Trash2Icon,
  TreesIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import Container from "@/components/ui/container";
import { useModal } from "@/components/ui/modal/context";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { MODAL_IDS } from "@/components/global/modals/ids";
import { cn } from "@/lib/utils";
import { manageApiHref, type ManageTarget } from "@/lib/links";
import { canCreateRecord, canDeleteRecord, canUpdateRecord } from "../../_lib/cgs-permissions";
import type {
  OccurrenceRecord,
  TreeMeasurementRecord,
  TreeMultimediaRecord,
  UploadTreeDatasetRecord,
} from "@/app/_lib/indexer";
import { TreesManageSkeleton } from "./TreesManageSkeleton";
import { ManageSectionHeader } from "../../_components/ManageSectionHeader";
import { TreeListPagination } from "./TreeListPagination";
import { ManageConfirmModal } from "../../_components/ManageConfirmModal";
import GreenGlobeTreePreviewCard from "./GreenGlobeTreePreviewCard";
import AddToTreeGroupModal from "./AddToTreeGroupModal";
import {
  buildDatasetLandingCards,
  DatasetLandingSection,
  getSafeRecordedByDisplayName,
  UNGROUPED_DATASET_FILTER,
  type DatasetLandingBuildOptions,
} from "./DatasetLandingSection";
import {
  CANOPY_COVER_PERCENT_MAX,
  buildTreeManagerItems,
  capCanopyCoverPercentInput,
  formatEventDate,
  formatTreeSubtitle,
  getClearedFloraMeasurementFields,
  getPhotoUrl,
  getTreeDeletionTarget,
  getTreeMeasurementDraft,
  getTreeOccurrenceDraft,
  hasAnyMeasurementValue,
  isDraftEqual,
  toFloraMeasurementPayload,
  validateMeasurementDraft,
  validateOccurrenceDraft,
  type TreeManagerItem,
  type TreeMeasurementDraft,
  type TreeOccurrenceDraft,
} from "./tree-manager-utils";
import {
  attachExistingOccurrences,
  createMeasurement,
  createMultimediaFromFile,
  createMultimediaFromUrl,
  deleteMultimedia,
  deleteOccurrenceCascade,
  deleteTreeGroupCascade,
  updateMeasurement,
  updateMultimedia,
  updateOccurrence,
  type AttachExistingOccurrencesResult,
  type DeleteTreeGroupCascadeResult,
} from "../../_lib/mutations";
import { PARTNER_ESTABLISHMENT_MEANS_OPTIONS } from "../../_lib/upload/establishment-means";
import {
  getBoundedPage,
  getTotalPages,
  getTreePageFromQuery,
  toNullableQueryValue,
  TREE_ITEMS_PER_PAGE,
  useTreesManageUrlState,
} from "./useTreesManageUrlState";

type TreesClientProps = {
  did: string;
  target: ManageTarget;
  onUpload?: () => void;
};

type ManagedSite = {
  metadata: { uri: string };
  record: { name: string | null };
};

type TreeGroupDeletionTarget = {
  treeGroup: UploadTreeDatasetRecord;
  trees: TreeManagerItem[];
  treeCount: number;
  measurementCount: number;
  photoCount: number;
};

type ConfirmTarget =
  | { type: "tree"; item: TreeManagerItem }
  | { type: "photo"; photo: TreeMultimediaRecord };

type DeletionFeedback = {
  message: string;
  tone: "success" | "warn";
};

const EMPTY_OCCURRENCE_DRAFT: TreeOccurrenceDraft = {
  scientificName: "",
  vernacularName: "",
  eventDate: "",
  recordedBy: "",
  locality: "",
  country: "",
  decimalLatitude: "",
  decimalLongitude: "",
  occurrenceRemarks: "",
  habitat: "",
  establishmentMeans: "",
};

const EMPTY_MEASUREMENT_DRAFT: TreeMeasurementDraft = {
  dbh: "",
  totalHeight: "",
  diameter: "",
  canopyCoverPercent: "",
};

const OPTIONAL_OCCURRENCE_FIELDS: Array<keyof TreeOccurrenceDraft> = [
  "vernacularName",
  "recordedBy",
  "locality",
  "country",
  "occurrenceRemarks",
  "habitat",
  "establishmentMeans",
];

const ATTACH_EXISTING_TREE_GROUP_MAX_TREES = 50;
const ALL_RECORDERS_FILTER_VALUE = "__all_recorders__";

function isUngroupedTree(item: TreeManagerItem): boolean {
  return !item.occurrence.datasetRef;
}

function chunkStrings(values: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function hashStrings(values: string[]): string {
  let hash = 5381;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 33 + value.charCodeAt(index)) % 4_294_967_295;
    }
  }
  return hash.toString(36);
}

function isErrorPayload(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const payload = (await response.json().catch(() => null)) as T | { error: string } | null;
  if (!response.ok || !payload || isErrorPayload(payload)) {
    if (isErrorPayload(payload)) console.error("Tree data request failed", payload.error);
    throw new Error("TREE_DATA_LOAD_FAILED");
  }
  return payload as T;
}

function normalizeDraftValue(value: string): string {
  return value.trim();
}

function formatSubjectPart(value: string | null, treePhotoLabel: string): string {
  if (!value || value === "wholeTree") return treePhotoLabel;
  return value
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}


function establishmentMeansLabel(value: string | null | undefined, fallback: string, translate: (value: string) => string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const knownOption = PARTNER_ESTABLISHMENT_MEANS_OPTIONS.find((option) => option.value === trimmed);
  return knownOption ? translate(knownOption.value) : trimmed;
}

function getUniqueTreeSiteRef(items: TreeManagerItem[]): string | null {
  const siteRefs = Array.from(new Set(items.map((item) => item.occurrence.siteRef).filter((value): value is string => Boolean(value))));
  return siteRefs.length === 1 ? siteRefs[0] : null;
}

function getTreeGroupDeletionTarget(treeGroup: UploadTreeDatasetRecord, items: TreeManagerItem[]): TreeGroupDeletionTarget {
  const trees = items.filter((item) => item.occurrence.datasetRef === treeGroup.uri);
  return {
    treeGroup,
    trees,
    treeCount: Math.max(trees.length, treeGroup.recordCount ?? 0),
    measurementCount: trees.reduce((count, item) => count + item.measurements.length, 0),
    photoCount: trees.reduce((count, item) => count + item.photos.length, 0),
  };
}

function buildTreeGroupDeleteFeedback(
  result: DeleteTreeGroupCascadeResult,
  treeGroupName: string,
  translate: (key: string, values: Record<string, string | number>) => string,
): DeletionFeedback {
  const deletedTrees = result.deletedTreeRkeys.length;

  if (result.treeGroupDeleted && result.errors.length === 0) {
    return { tone: "success", message: translate("deletedGroupSuccess", { name: treeGroupName, count: deletedTrees }) };
  }

  if (result.treeGroupDeleted) {
    return { tone: "warn", message: translate("deletedGroupPartial", { name: treeGroupName, count: deletedTrees }) };
  }

  if (deletedTrees > 0) {
    return { tone: "warn", message: translate("deletedGroupTreesOnly", { name: treeGroupName, count: deletedTrees }) };
  }

  return { tone: "warn", message: translate("deletedGroupFailed", { name: treeGroupName, count: deletedTrees }) };
}

function DeleteTreeGroupConfirmModal({
  target,
  onConfirm,
}: {
  target: TreeGroupDeletionTarget;
  onConfirm: () => Promise<void> | void;
}) {
  const t = useTranslations("common.manageTrees.deleteGroup");
  const { hide, popModal, stack } = useModal();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const treeGroupName = target.treeGroup.name || "this tree group";

  const close = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
      return;
    }
    popModal();
  };

  const handleConfirm = async () => {
    setIsPending(true);
    setError(null);

    try {
      await onConfirm();
    } catch (caught) {
      console.error("Tree group deletion failed", caught);
      setError(t("error"));
      setIsPending(false);
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
    await close();
  };

  return (
    <ModalContent dismissible={false} className="space-y-4">
      <ModalHeader>
        <ModalTitle>{t("title")}</ModalTitle>
        <ModalDescription>{t("description", { name: treeGroupName })}</ModalDescription>
      </ModalHeader>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{t("willDelete")}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("group")}</li>
          <li>{t("trees", { count: target.treeCount })}</li>
          <li>{t("measurements", { count: target.measurementCount })}</li>
          <li>{t("photos", { count: target.photoCount })}</li>
        </ul>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ModalFooter className="sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => void close()} disabled={isPending}>
          {t("cancel")}
        </Button>
        <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={isPending}>
          {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
          {t("confirm")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
        tone === "good" && "border-primary/25 bg-primary/5 text-primary",
        tone === "warn" && "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
        tone === "neutral" && "border-border bg-background text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4 border-t border-border/70 pt-6 first:border-t-0 first:pt-0", className)}>
      <div className="space-y-1">
        <h3 className="font-instrument text-lg font-semibold italic">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
      <span>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function DetailFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/30 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground break-words">{value}</div>
    </div>
  );
}

function measurementItemFromResult(
  did: string,
  occurrenceUri: string,
  result: { uri: string; cid: string; rkey: string; record?: Record<string, unknown> },
): TreeMeasurementRecord {
  const record = result.record ?? {};
  return {
    metadata: {
      did,
      uri: result.uri,
      rkey: result.rkey,
      cid: result.cid,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    },
    record: {
      occurrenceRef: typeof record.occurrenceRef === "string" ? record.occurrenceRef : occurrenceUri,
      result: record.result ?? null,
      measuredBy: typeof record.measuredBy === "string" ? record.measuredBy : null,
      measuredByID: typeof record.measuredByID === "string" ? record.measuredByID : null,
      measurementDate: typeof record.measurementDate === "string" ? record.measurementDate : null,
      measurementMethod: typeof record.measurementMethod === "string" ? record.measurementMethod : null,
      measurementRemarks: typeof record.measurementRemarks === "string" ? record.measurementRemarks : null,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
      legacyMeasurementType: null,
      legacyMeasurementValue: null,
      legacyMeasurementUnit: null,
      schemaVersion: "bundled",
    },
  };
}

function photoItemFromResult(
  did: string,
  occurrenceUri: string,
  result: { uri: string; cid: string; rkey: string; record?: Record<string, unknown> },
  previewUrl: string | null,
): TreeMultimediaRecord {
  const record = result.record ?? {};
  return {
    metadata: {
      did,
      uri: result.uri,
      rkey: result.rkey,
      cid: result.cid,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    },
    record: {
      occurrenceRef: typeof record.occurrenceRef === "string" ? record.occurrenceRef : occurrenceUri,
      siteRef: typeof record.siteRef === "string" ? record.siteRef : null,
      subjectPart: typeof record.subjectPart === "string" ? record.subjectPart : "wholeTree",
      subjectPartUri: typeof record.subjectPartUri === "string" ? record.subjectPartUri : null,
      subjectOrientation: typeof record.subjectOrientation === "string" ? record.subjectOrientation : null,
      file: record.file ?? null,
      format: typeof record.format === "string" ? record.format : null,
      accessUri: previewUrl ?? (typeof record.accessUri === "string" ? record.accessUri : null),
      variantLiteral: typeof record.variantLiteral === "string" ? record.variantLiteral : null,
      caption: typeof record.caption === "string" ? record.caption : null,
      creator: typeof record.creator === "string" ? record.creator : null,
      createDate: typeof record.createDate === "string" ? record.createDate : null,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    },
  };
}

function mergeTreeDetail(existing: OccurrenceRecord, detail: Partial<OccurrenceRecord>): OccurrenceRecord {
  return {
    ...existing,
    ...detail,
    kind: "occurrence",
    id: existing.id,
    did: existing.did,
    rkey: existing.rkey,
    atUri: detail.atUri ?? existing.atUri,
    createdAt: detail.createdAt ?? existing.createdAt,
    imageUrl: detail.imageUrl ?? existing.imageUrl,
    imageRef: detail.imageRef ?? existing.imageRef,
    audioRef: detail.audioRef ?? existing.audioRef,
    audioUrl: detail.audioUrl ?? existing.audioUrl,
    media: detail.media ?? existing.media,
  };
}

export function TreesClient({ did, target, onUpload }: TreesClientProps) {
  const locale = useLocale();
  const treeFilterT = useTranslations("common.manageTrees.filters");
  const datasetLandingT = useTranslations("common.manageTrees.datasetLanding");
  const managerT = useTranslations("common.manageTrees.manager");
  const {
    searchQuery,
    selectedTreeRkey,
    datasetFilter,
    treePageQuery,
    setQueryValues,
  } = useTreesManageUrlState();
  const { pushModal, show } = useModal();

  const [trees, setTrees] = useState<OccurrenceRecord[]>([]);
  const [datasets, setDatasets] = useState<UploadTreeDatasetRecord[]>([]);
  const [measurements, setMeasurements] = useState<TreeMeasurementRecord[]>([]);
  const [photos, setPhotos] = useState<TreeMultimediaRecord[]>([]);
  const [sites, setSites] = useState<ManagedSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [detailLoadingRkey, setDetailLoadingRkey] = useState<string | null>(null);
  const [occurrenceDraft, setOccurrenceDraft] = useState<TreeOccurrenceDraft>(EMPTY_OCCURRENCE_DRAFT);
  const [initialOccurrenceDraft, setInitialOccurrenceDraft] = useState<TreeOccurrenceDraft>(EMPTY_OCCURRENCE_DRAFT);
  const [measurementDraft, setMeasurementDraft] = useState<TreeMeasurementDraft>(EMPTY_MEASUREMENT_DRAFT);
  const [initialMeasurementDraft, setInitialMeasurementDraft] = useState<TreeMeasurementDraft>(EMPTY_MEASUREMENT_DRAFT);
  const [occurrenceError, setOccurrenceError] = useState<string | null>(null);
  const [occurrenceFeedback, setOccurrenceFeedback] = useState<string | null>(null);
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const [measurementFeedback, setMeasurementFeedback] = useState<string | null>(null);
  const [savingOccurrence, setSavingOccurrence] = useState(false);
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [newPhotoCaption, setNewPhotoCaption] = useState("");
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoFeedback, setPhotoFeedback] = useState<string | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [editingPhotoRkey, setEditingPhotoRkey] = useState<string | null>(null);
  const [photoCaptionDraft, setPhotoCaptionDraft] = useState("");
  const [savingPhotoCaptionRkey, setSavingPhotoCaptionRkey] = useState<string | null>(null);
  const [photoCaptionError, setPhotoCaptionError] = useState<string | null>(null);
  const [deletedFeedback, setDeletedFeedback] = useState<DeletionFeedback | null>(null);
  const [treeGroupAttachFeedback, setTreeGroupAttachFeedback] = useState<string | null>(null);
  const [treeGroupAttachPending, setTreeGroupAttachPending] = useState(false);
  const [treeGroupSearchQuery, setTreeGroupSearchQuery] = useState("");
  const [treeGroupRecordedByFilter, setTreeGroupRecordedByFilter] = useState("");
  const [selectedUngroupedTreeRkeys, setSelectedUngroupedTreeRkeys] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastDraftResetKeyRef = useRef<string | null>(null);
  const selectedDraftTreeRkeyRef = useRef<string | null>(null);
  const writeOptions = target.kind === "group" ? { repo: target.did } : undefined;
  const createPermission = canCreateRecord(target);
  const updatePermission = canUpdateRecord(target);
  const deletePermission = canDeleteRecord(target);

  const loadAll = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [treeData, datasetData, measurementData, photoData, siteData] = await Promise.all([
        fetchJson<OccurrenceRecord[]>(manageApiHref("/api/manage/trees", target), signal),
        fetchJson<UploadTreeDatasetRecord[]>(manageApiHref("/api/manage/trees/datasets", target), signal),
        fetchJson<TreeMeasurementRecord[]>(manageApiHref("/api/manage/trees/measurements", target), signal),
        fetchJson<TreeMultimediaRecord[]>(manageApiHref("/api/manage/trees/photos", target), signal),
        fetchJson<ManagedSite[]>(manageApiHref("/api/manage/sites", target), signal).catch(() => []),
      ]);
      setTrees(treeData);
      setDatasets(datasetData);
      setMeasurements(measurementData);
      setPhotos(photoData);
      setSites(siteData);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      console.error("Tree manager load failed", error);
      setFetchError(managerT("loadErrorBody"));
    } finally {
      setIsLoading(false);
    }
  }, [managerT, target]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAll(controller.signal);
    return () => controller.abort();
  }, [loadAll]);

  const datasetLookup = useMemo(() => {
    const map = new Map<string, UploadTreeDatasetRecord>();
    for (const dataset of datasets) map.set(dataset.uri, dataset);
    return map;
  }, [datasets]);

  const siteLookup = useMemo(() => {
    const map = new Map<string, ManagedSite>();
    for (const site of sites) map.set(site.metadata.uri, site);
    return map;
  }, [sites]);

  const treeItems = useMemo(
    () => buildTreeManagerItems(trees, measurements, photos),
    [measurements, photos, trees],
  );

  const datasetLandingBuildOptions = useMemo<DatasetLandingBuildOptions>(() => ({
    locale,
    copy: {
      dateUnavailable: datasetLandingT("dateUnavailable"),
      locationNotSet: datasetLandingT("locationNotSet"),
      additionalLocations: (count) => datasetLandingT("additionalLocations", { count }),
      ungroupedTrees: datasetLandingT("ungroupedTrees"),
      unnamedTreeGroup: datasetLandingT("unnamedTreeGroup"),
      statusNoTrees: datasetLandingT("statuses.noTrees"),
      statusNeedsCleanup: datasetLandingT("statuses.needsCleanup"),
      statusMigrationNeeded: datasetLandingT("statuses.migrationNeeded"),
      statusMeasurementsReady: datasetLandingT("statuses.measurementsReady"),
      statusPartlyMeasured: datasetLandingT("statuses.partlyMeasured"),
      statusNoMeasurements: datasetLandingT("statuses.noMeasurements"),
    },
  }), [datasetLandingT, locale]);
  const treeGroupCards = useMemo(
    () => buildDatasetLandingCards(datasets, treeItems, datasetLandingBuildOptions),
    [datasetLandingBuildOptions, datasets, treeItems],
  );
  const showTreeGroupLanding = !datasetFilter && treeGroupCards.length > 0;
  const treeGroupRecorderOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const card of treeGroupCards) {
      for (const recordedBy of card.recordedByValues) {
        const key = recordedBy.toLowerCase();
        if (!values.has(key)) values.set(key, recordedBy);
      }
    }
    return Array.from(values.values()).sort((left, right) => left.localeCompare(right));
  }, [treeGroupCards]);

  const filteredTreeGroupCards = useMemo(() => {
    const query = treeGroupSearchQuery.trim().toLowerCase();
    const recordedBy = treeGroupRecordedByFilter.trim().toLowerCase();
    return treeGroupCards.filter((card) => {
      const matchesQuery = !query || card.searchText.includes(query);
      const matchesRecorder = !recordedBy || card.recordedByValues.some((value) => value.toLowerCase() === recordedBy);
      return matchesQuery && matchesRecorder;
    });
  }, [treeGroupCards, treeGroupRecordedByFilter, treeGroupSearchQuery]);

  const datasetScopedTrees = useMemo(() => {
    if (datasetFilter === UNGROUPED_DATASET_FILTER) return treeItems.filter(isUngroupedTree);
    if (!datasetFilter) return treeItems;
    return treeItems.filter((item) => item.occurrence.datasetRef === datasetFilter);
  }, [datasetFilter, treeItems]);

  const filteredTrees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return datasetScopedTrees;
    return datasetScopedTrees.filter((item) => {
      const tree = item.occurrence;
      const groupName = tree.datasetRef ? datasetLookup.get(tree.datasetRef)?.name : null;
      const haystack = [
        tree.scientificName,
        tree.vernacularName,
        tree.locality,
        tree.country,
        tree.recordedBy,
        tree.eventDate,
        groupName,
      ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [datasetLookup, datasetScopedTrees, searchQuery]);

  const filteredUngroupedTreeRkeys = useMemo(() => {
    if (datasetFilter !== UNGROUPED_DATASET_FILTER) return [];
    return filteredTrees.flatMap((item) => {
      const rkey = item.occurrence.rkey;
      return rkey && isUngroupedTree(item) ? [rkey] : [];
    });
  }, [datasetFilter, filteredTrees]);
  const filteredUngroupedTreeRkeySet = useMemo(() => new Set(filteredUngroupedTreeRkeys), [filteredUngroupedTreeRkeys]);
  const selectedUngroupedTreeRkeySet = useMemo(() => new Set(selectedUngroupedTreeRkeys), [selectedUngroupedTreeRkeys]);
  const selectedUngroupedTrees = useMemo(
    () => filteredTrees.filter((item) => selectedUngroupedTreeRkeySet.has(item.occurrence.rkey)),
    [filteredTrees, selectedUngroupedTreeRkeySet],
  );
  const allFilteredUngroupedTreesSelected =
    filteredUngroupedTreeRkeys.length > 0 &&
    filteredUngroupedTreeRkeys.every((rkey) => selectedUngroupedTreeRkeySet.has(rkey));
  const someFilteredUngroupedTreesSelected = filteredUngroupedTreeRkeys.some((rkey) => selectedUngroupedTreeRkeySet.has(rkey));
  const selectAllUngroupedChecked = allFilteredUngroupedTreesSelected
    ? true
    : someFilteredUngroupedTreesSelected
      ? "indeterminate"
      : false;

  const requestedTreePage = useMemo(() => getTreePageFromQuery(treePageQuery), [treePageQuery]);
  const totalTreePages = getTotalPages(filteredTrees.length, TREE_ITEMS_PER_PAGE);
  const currentTreePage = getBoundedPage(requestedTreePage, totalTreePages);
  const paginatedTrees = useMemo(() => {
    const startIndex = (currentTreePage - 1) * TREE_ITEMS_PER_PAGE;
    return filteredTrees.slice(startIndex, startIndex + TREE_ITEMS_PER_PAGE);
  }, [currentTreePage, filteredTrees]);

  const selectedTree = useMemo(() => {
    if (showTreeGroupLanding) return null;
    if (selectedTreeRkey) {
      return treeItems.find((item) => item.occurrence.rkey === selectedTreeRkey) ?? null;
    }
    return paginatedTrees[0] ?? null;
  }, [paginatedTrees, selectedTreeRkey, showTreeGroupLanding, treeItems]);
  const selectedUngroupedTreeCount = selectedUngroupedTreeRkeys.length;

  useEffect(() => {
    if (!showTreeGroupLanding || !selectedTreeRkey) return;
    setQueryValues({ tree: null });
  }, [selectedTreeRkey, setQueryValues, showTreeGroupLanding]);

  useEffect(() => {
    if (!treeGroupRecordedByFilter) return;
    const stillAvailable = treeGroupRecorderOptions.some((value) => value === treeGroupRecordedByFilter);
    if (!stillAvailable) setTreeGroupRecordedByFilter("");
  }, [treeGroupRecordedByFilter, treeGroupRecorderOptions]);

  useEffect(() => {
    if (datasetFilter !== UNGROUPED_DATASET_FILTER) {
      if (selectedUngroupedTreeRkeys.length > 0) setSelectedUngroupedTreeRkeys([]);
      return;
    }

    setSelectedUngroupedTreeRkeys((current) => {
      const next = current.filter((rkey) => filteredUngroupedTreeRkeySet.has(rkey));
      return next.length === current.length ? current : next;
    });
  }, [datasetFilter, filteredUngroupedTreeRkeySet, selectedUngroupedTreeRkeys.length]);

  useEffect(() => {
    if (isLoading) return;
    const selectedRkey = selectedTree?.occurrence.rkey ?? "";
    if (!selectedRkey || selectedTreeRkey === selectedRkey) return;
    setQueryValues({ tree: selectedRkey });
  }, [isLoading, selectedTree?.occurrence.rkey, selectedTreeRkey, setQueryValues]);

  useEffect(() => {
    if (isLoading) return;
    const canonicalPage = currentTreePage === 1 ? null : String(currentTreePage);
    if (treePageQuery !== canonicalPage) {
      setQueryValues({ "tree-page": canonicalPage });
    }
  }, [currentTreePage, isLoading, setQueryValues, treePageQuery]);

  useEffect(() => {
    if (isLoading) return;
    if (!selectedTreeRkey) return;
    const stillVisible = filteredTrees.some((item) => item.occurrence.rkey === selectedTreeRkey);
    if (!stillVisible) {
      setQueryValues({ tree: paginatedTrees[0]?.occurrence.rkey ?? null });
    }
  }, [filteredTrees, isLoading, paginatedTrees, selectedTreeRkey, setQueryValues]);

  useEffect(() => {
    const rkey = selectedTree?.occurrence.rkey;
    if (!rkey) return;
    let cancelled = false;
    setDetailLoadingRkey(rkey);
    fetchJson<Partial<OccurrenceRecord>>(manageApiHref(`/api/manage/trees/${encodeURIComponent(rkey)}`, target))
      .then((detail) => {
        if (cancelled) return;
        setTrees((current) => current.map((tree) => tree.rkey === rkey ? mergeTreeDetail(tree, detail) : tree));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDetailLoadingRkey(null);
      });
    return () => { cancelled = true; };
  }, [selectedTree?.occurrence.rkey, target]);

  const activeTreeResetKey = selectedTree
    ? [
        selectedTree.occurrence.rkey,
        selectedTree.occurrence.scientificName,
        selectedTree.occurrence.vernacularName,
        selectedTree.occurrence.eventDate,
        selectedTree.occurrence.recordedBy,
        selectedTree.occurrence.locality,
        selectedTree.occurrence.country,
        selectedTree.occurrence.lat,
        selectedTree.occurrence.lon,
        selectedTree.occurrence.remarks,
        selectedTree.occurrence.habitat,
        selectedTree.occurrence.establishmentMeans,
        selectedTree.preferredMeasurement?.metadata.rkey,
        selectedTree.floraMeasurement?.dbh,
        selectedTree.floraMeasurement?.totalHeight,
        selectedTree.floraMeasurement?.basalDiameter,
        selectedTree.floraMeasurement?.canopyCoverPercent,
      ].map((value) => String(value ?? "")).join("|")
    : null;
  const selectedTreeIdentity = selectedTree?.occurrence.rkey ?? null;

  useEffect(() => {
    const selectedTreeChanged = selectedDraftTreeRkeyRef.current !== selectedTreeIdentity;
    if (!selectedTreeChanged && lastDraftResetKeyRef.current === activeTreeResetKey) return;

    selectedDraftTreeRkeyRef.current = selectedTreeIdentity;
    lastDraftResetKeyRef.current = activeTreeResetKey;

    const nextOccurrenceDraft = selectedTree ? getTreeOccurrenceDraft(selectedTree.occurrence) : EMPTY_OCCURRENCE_DRAFT;
    const nextMeasurementDraft = getTreeMeasurementDraft(selectedTree?.floraMeasurement ?? null);

    if (selectedTreeChanged) {
      setOccurrenceDraft(nextOccurrenceDraft);
      setInitialOccurrenceDraft(nextOccurrenceDraft);
      setMeasurementDraft(nextMeasurementDraft);
      setInitialMeasurementDraft(nextMeasurementDraft);
      setOccurrenceError(null);
      setOccurrenceFeedback(null);
      setMeasurementError(null);
      setMeasurementFeedback(null);
      setPhotoError(null);
      setPhotoFeedback(null);
      setEditingPhotoRkey(null);
      setPhotoCaptionDraft("");
      return;
    }

    if (isDraftEqual(occurrenceDraft, initialOccurrenceDraft)) {
      setOccurrenceDraft(nextOccurrenceDraft);
      setInitialOccurrenceDraft(nextOccurrenceDraft);
    }
    if (isDraftEqual(measurementDraft, initialMeasurementDraft)) {
      setMeasurementDraft(nextMeasurementDraft);
      setInitialMeasurementDraft(nextMeasurementDraft);
    }
  }, [
    activeTreeResetKey,
    initialMeasurementDraft,
    initialOccurrenceDraft,
    measurementDraft,
    occurrenceDraft,
    selectedTree,
    selectedTreeIdentity,
  ]);

  const occurrenceHasChanges = !isDraftEqual(occurrenceDraft, initialOccurrenceDraft);
  const measurementHasChanges = !isDraftEqual(measurementDraft, initialMeasurementDraft);
  const occurrenceValidationError = occurrenceHasChanges ? validateOccurrenceDraft(occurrenceDraft) : null;
  const measurementValidationError = measurementHasChanges ? validateMeasurementDraft(measurementDraft) : null;
  const measurementEditingBlocked = Boolean(
    selectedTree?.hasLegacyMeasurements ||
    selectedTree?.hasUnsupportedMeasurements ||
    selectedTree?.hasDuplicateBundledMeasurements,
  );
  const selectedTreeHasShownMeasurement = selectedTree
    ? hasAnyMeasurementValue(getTreeMeasurementDraft(selectedTree.floraMeasurement))
    : false;

  const activeDatasetName = selectedTree?.occurrence.datasetRef
    ? datasetLookup.get(selectedTree.occurrence.datasetRef)?.name ?? selectedTree.occurrence.datasetName
    : null;
  const activeSiteName = selectedTree?.occurrence.siteRef
    ? siteLookup.get(selectedTree.occurrence.siteRef)?.record.name ?? managerT("connectedPlace")
    : null;
  const selectedTreeGroup = datasetFilter ? datasetLookup.get(datasetFilter) ?? null : null;
  const selectedTreeGroupPreviewTree = datasetFilter && selectedTree?.occurrence.datasetRef === datasetFilter ? selectedTree : null;
  const selectedTreeGroupPreviewSiteRef = datasetFilter ? getUniqueTreeSiteRef(datasetScopedTrees) : null;
  const selectedTreeGroupPreviewFocusedSiteRef = selectedTreeGroupPreviewTree?.occurrence.siteRef ?? null;
  const selectedTreeGroupPreviewTreeCount = selectedTreeGroup ? selectedTreeGroup.recordCount ?? datasetScopedTrees.length : null;

  const handleTreeSearchChange = useCallback((value: string) => {
    setQueryValues({ q: toNullableQueryValue(value), "tree-page": null, tree: null });
  }, [setQueryValues]);

  const handleDatasetChange = useCallback((uri: string | null) => {
    setQueryValues({ dataset: uri, q: null, "tree-page": null, tree: null });
  }, [setQueryValues]);

  const handleReturnToTreeGroups = useCallback(() => {
    setQueryValues({ dataset: null, q: null, "tree-page": null, tree: null });
  }, [setQueryValues]);

  const handleToggleUngroupedTreeSelection = useCallback((rkey: string) => {
    setSelectedUngroupedTreeRkeys((current) => {
      if (current.includes(rkey)) return current.filter((selectedRkey) => selectedRkey !== rkey);
      return [...current, rkey];
    });
  }, []);

  const handleToggleAllFilteredUngroupedTrees = useCallback(() => {
    setSelectedUngroupedTreeRkeys((current) => {
      if (allFilteredUngroupedTreesSelected) {
        return current.filter((rkey) => !filteredUngroupedTreeRkeySet.has(rkey));
      }

      const next = new Set(current);
      for (const rkey of filteredUngroupedTreeRkeys) next.add(rkey);
      return Array.from(next);
    });
  }, [allFilteredUngroupedTreesSelected, filteredUngroupedTreeRkeySet, filteredUngroupedTreeRkeys]);

  const handleTreePageChange = useCallback((nextPage: number) => {
    const bounded = getBoundedPage(nextPage, totalTreePages);
    setQueryValues({ "tree-page": bounded === 1 ? null : String(bounded), tree: null });
  }, [setQueryValues, totalTreePages]);

  const handleOccurrenceFieldChange = (field: keyof TreeOccurrenceDraft, value: string) => {
    setOccurrenceDraft((current) => ({ ...current, [field]: value }));
    setOccurrenceError(null);
    setOccurrenceFeedback(null);
  };

  const handleMeasurementFieldChange = (field: keyof TreeMeasurementDraft, value: string) => {
    const nextValue = field === "canopyCoverPercent" ? capCanopyCoverPercentInput(value) : value;
    setMeasurementDraft((current) => ({ ...current, [field]: nextValue }));
    setMeasurementError(null);
    setMeasurementFeedback(null);
  };

  const handleSaveOccurrence = async () => {
    const tree = selectedTree?.occurrence;
    if (!tree) return;
    if (!updatePermission.allowed) {
      setOccurrenceError(managerT("editTreeDenied"));
      return;
    }
    const validationError = validateOccurrenceDraft(occurrenceDraft);
    if (validationError) {
      setOccurrenceError(validationError);
      return;
    }

    const normalizedCurrent = Object.fromEntries(
      Object.entries(occurrenceDraft).map(([key, value]) => [key, normalizeDraftValue(value)]),
    ) as TreeOccurrenceDraft;
    const normalizedInitial = Object.fromEntries(
      Object.entries(initialOccurrenceDraft).map(([key, value]) => [key, normalizeDraftValue(value)]),
    ) as TreeOccurrenceDraft;
    const data: Record<string, string> = {};
    const unset: string[] = [];

    (Object.keys(normalizedCurrent) as Array<keyof TreeOccurrenceDraft>).forEach((field) => {
      if (normalizedCurrent[field] === normalizedInitial[field]) return;
      if (OPTIONAL_OCCURRENCE_FIELDS.includes(field) && normalizedCurrent[field] === "") {
        unset.push(field);
        if (field === "occurrenceRemarks") unset.push("fieldNotes");
        return;
      }
      data[field] = normalizedCurrent[field];
    });

    if (
      normalizedCurrent.decimalLatitude !== normalizedInitial.decimalLatitude ||
      normalizedCurrent.decimalLongitude !== normalizedInitial.decimalLongitude
    ) {
      data.decimalLatitude = normalizedCurrent.decimalLatitude;
      data.decimalLongitude = normalizedCurrent.decimalLongitude;
    }

    if (Object.keys(data).length === 0 && unset.length === 0) {
      setOccurrenceFeedback(managerT("noChanges"));
      return;
    }

    setSavingOccurrence(true);
    try {
      await updateOccurrence({ rkey: tree.rkey, data, unset }, writeOptions);
      setTrees((current) => current.map((item) => item.rkey === tree.rkey ? {
        ...item,
        scientificName: normalizedCurrent.scientificName || null,
        vernacularName: normalizedCurrent.vernacularName || null,
        eventDate: normalizedCurrent.eventDate || null,
        recordedBy: normalizedCurrent.recordedBy || null,
        locality: normalizedCurrent.locality || null,
        country: normalizedCurrent.country || null,
        lat: normalizedCurrent.decimalLatitude ? Number(normalizedCurrent.decimalLatitude) : null,
        lon: normalizedCurrent.decimalLongitude ? Number(normalizedCurrent.decimalLongitude) : null,
        remarks: normalizedCurrent.occurrenceRemarks || null,
        habitat: normalizedCurrent.habitat || null,
        establishmentMeans: normalizedCurrent.establishmentMeans || null,
      } : item));
      setInitialOccurrenceDraft(normalizedCurrent);
      setOccurrenceDraft(normalizedCurrent);
      setOccurrenceFeedback(managerT("treeSaved"));
      setOccurrenceError(null);
    } catch (error) {
      console.error("Tree save failed", error);
      setOccurrenceError(managerT("saveTreeError"));
    } finally {
      setSavingOccurrence(false);
    }
  };

  const handleSaveMeasurement = async () => {
    const tree = selectedTree;
    if (!tree) return;
    const occurrenceUri = tree.occurrence.atUri;
    const measurementRkey = tree.preferredMeasurement?.metadata.rkey ?? null;

    if (measurementEditingBlocked) {
      setMeasurementError(managerT("measurementManualReview"));
      return;
    }

    const mutationPermission = measurementRkey ? updatePermission : createPermission;
    if (!mutationPermission.allowed) {
      setMeasurementError(managerT("measurementDenied"));
      return;
    }

    const validationError = validateMeasurementDraft(measurementDraft);
    if (validationError) {
      setMeasurementError(validationError);
      return;
    }

    const normalizedCurrent = Object.fromEntries(
      Object.entries(measurementDraft).map(([key, value]) => [key, normalizeDraftValue(value)]),
    ) as TreeMeasurementDraft;

    if (isDraftEqual(normalizedCurrent, initialMeasurementDraft)) {
      setMeasurementFeedback(managerT("noChanges"));
      return;
    }

    const floraPayload = toFloraMeasurementPayload(normalizedCurrent);
    const resultUnset = getClearedFloraMeasurementFields(normalizedCurrent);
    setSavingMeasurement(true);
    try {
      if (measurementRkey) {
        const result = await updateMeasurement({
          rkey: measurementRkey,
          data: { result: floraPayload ?? toFloraMeasurementPayload(normalizedCurrent, { includeEmpty: true }) ?? undefined },
          resultUnset,
        }, writeOptions);
        const nextItem = measurementItemFromResult(did, occurrenceUri, result);
        setMeasurements((current) => current.map((item) => item.metadata.rkey === measurementRkey ? nextItem : item));
        setMeasurementFeedback(floraPayload ? managerT("measurementsSaved") : managerT("measurementsRemoved"));
      } else {
        if (!floraPayload) {
          setMeasurementError(managerT("measurementRequired"));
          return;
        }
        const result = await createMeasurement({
          occurrenceRef: occurrenceUri,
          flora: {
            dbh: floraPayload.dbh,
            totalHeight: floraPayload.totalHeight,
            basalDiameter: floraPayload.basalDiameter,
            canopyCoverPercent: floraPayload.canopyCoverPercent,
          },
        }, writeOptions);
        setMeasurements((current) => [measurementItemFromResult(did, occurrenceUri, result), ...current]);
        setMeasurementFeedback(managerT("measurementsAdded"));
      }
      setInitialMeasurementDraft(normalizedCurrent);
      setMeasurementDraft(normalizedCurrent);
      setMeasurementError(null);
    } catch (error) {
      console.error("Tree measurement save failed", error);
      setMeasurementError(managerT("saveMeasurementError"));
    } finally {
      setSavingMeasurement(false);
    }
  };

  const handleAddPhotoFile = async (file: File | null) => {
    const tree = selectedTree;
    if (!tree || !file) return;
    if (!createPermission.allowed) {
      setPhotoError(managerT("photoAddDenied"));
      return;
    }
    setSavingPhoto(true);
    setPhotoError(null);
    setPhotoFeedback(null);
    const previewUrl = URL.createObjectURL(file);
    try {
      const result = await createMultimediaFromFile({
        imageFile: file,
        occurrenceRef: tree.occurrence.atUri,
        siteRef: tree.occurrence.siteRef ?? undefined,
        subjectPart: "wholeTree",
        caption: newPhotoCaption.trim() || undefined,
      }, writeOptions);
      setPhotos((current) => [photoItemFromResult(did, tree.occurrence.atUri, result, previewUrl), ...current]);
      setNewPhotoCaption("");
      setPhotoFeedback(managerT("photoAddedFeedback"));
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      console.error("Tree photo save failed", error);
      setPhotoError(managerT("savePhotoError"));
    } finally {
      setSavingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddPhotoUrl = async () => {
    const tree = selectedTree;
    const url = newPhotoUrl.trim();
    if (!tree || !url) return;
    if (!createPermission.allowed) {
      setPhotoError(managerT("photoAddDenied"));
      return;
    }
    setSavingPhoto(true);
    setPhotoError(null);
    setPhotoFeedback(null);
    try {
      const result = await createMultimediaFromUrl({
        url,
        occurrenceRef: tree.occurrence.atUri,
        siteRef: tree.occurrence.siteRef ?? undefined,
        subjectPart: "wholeTree",
        caption: newPhotoCaption.trim() || undefined,
      }, writeOptions);
      setPhotos((current) => [photoItemFromResult(did, tree.occurrence.atUri, result, url), ...current]);
      setNewPhotoUrl("");
      setNewPhotoCaption("");
      setPhotoFeedback(managerT("photoAddedFeedback"));
    } catch (error) {
      console.error("Linked tree photo save failed", error);
      setPhotoError(managerT("savePhotoError"));
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleSavePhotoCaption = async (photo: TreeMultimediaRecord) => {
    const rkey = photo.metadata.rkey;
    const normalizedCaption = photoCaptionDraft.trim();
    const currentCaption = (photo.record.caption ?? "").trim();
    if (normalizedCaption === currentCaption) {
      setEditingPhotoRkey(null);
      setPhotoCaptionDraft("");
      return;
    }
    if (!updatePermission.allowed) {
      setPhotoCaptionError(managerT("photoEditDenied"));
      return;
    }
    setSavingPhotoCaptionRkey(rkey);
    setPhotoCaptionError(null);
    try {
      await updateMultimedia({
        rkey,
        data: normalizedCaption ? { caption: normalizedCaption } : {},
        unset: normalizedCaption ? [] : ["caption"],
      }, writeOptions);
      setPhotos((current) => current.map((item) => item.metadata.rkey === rkey ? {
        ...item,
        record: { ...item.record, caption: normalizedCaption || null },
      } : item));
      setEditingPhotoRkey(null);
      setPhotoCaptionDraft("");
      setPhotoFeedback(managerT("captionSaved"));
    } catch (error) {
      console.error("Tree photo caption save failed", error);
      setPhotoCaptionError(managerT("saveCaptionError"));
    } finally {
      setSavingPhotoCaptionRkey(null);
    }
  };

  const handleConfirmDeletePhoto = async (photo: TreeMultimediaRecord) => {
    if (!deletePermission.allowed) throw new Error(managerT("photoDeleteDenied"));
    await deleteMultimedia(photo.metadata.rkey, writeOptions);
    setPhotos((current) => current.filter((item) => item.metadata.rkey !== photo.metadata.rkey));
    if (editingPhotoRkey === photo.metadata.rkey) {
      setEditingPhotoRkey(null);
      setPhotoCaptionDraft("");
    }
    setPhotoFeedback(managerT("photoDeleted"));
  };

  const handleConfirmDeleteTree = async (item: TreeManagerItem) => {
    const target = getTreeDeletionTarget(item);
    if (!target) throw new Error(managerT("chooseTreeToDelete"));
    if (!deletePermission.allowed) throw new Error(managerT("treeDeleteDenied"));
    const result = await deleteOccurrenceCascade(target.occurrenceRkey, writeOptions);
    const deletedMeasurementRkeys = new Set(result.deletedMeasurementRkeys);
    const deletedPhotoRkeys = new Set(result.deletedMultimediaRkeys);
    setTrees((current) => current.filter((tree) => tree.rkey !== target.occurrenceRkey));
    setMeasurements((current) => current.filter((measurement) => (
      measurement.record.occurrenceRef !== target.occurrenceUri && !deletedMeasurementRkeys.has(measurement.metadata.rkey)
    )));
    setPhotos((current) => current.filter((photo) => (
      photo.record.occurrenceRef !== target.occurrenceUri && !deletedPhotoRkeys.has(photo.metadata.rkey)
    )));
    setQueryValues({ tree: null });
    const deleteNotes = [
      result.cleanupError,
      result.treeGroupCountUpdated === false ? managerT("groupCountDelayed") : null,
    ].filter((note): note is string => Boolean(note));
    setDeletedFeedback({
      tone: deleteNotes.length > 0 ? "warn" : "success",
      message: deleteNotes.length > 0 ? managerT("treeDeletedWithNotes", { notes: deleteNotes.join(" ") }) : managerT("treeDeleted"),
    });
  };

  const handleConfirmDeleteTreeGroup = async (target: TreeGroupDeletionTarget) => {
    if (!deletePermission.allowed) throw new Error(managerT("groupDeleteDenied"));
    const result = await deleteTreeGroupCascade(target.treeGroup.rkey, writeOptions);
    const deletedTreeRkeys = new Set(result.deletedTreeRkeys);
    const deletedTreeUris = new Set(result.deletedTreeUris);
    const deletedMeasurementRkeys = new Set(result.deletedMeasurementRkeys);
    const deletedPhotoRkeys = new Set(result.deletedMultimediaRkeys);
    const treeGroupName = target.treeGroup.name || managerT("groupFallback");

    if (deletedTreeRkeys.size > 0) {
      setTrees((current) => current.filter((tree) => !deletedTreeRkeys.has(tree.rkey)));
      setMeasurements((current) => current.filter((measurement) => (
        !deletedMeasurementRkeys.has(measurement.metadata.rkey) &&
        (!measurement.record.occurrenceRef || !deletedTreeUris.has(measurement.record.occurrenceRef))
      )));
      setPhotos((current) => current.filter((photo) => (
        !deletedPhotoRkeys.has(photo.metadata.rkey) &&
        (!photo.record.occurrenceRef || !deletedTreeUris.has(photo.record.occurrenceRef))
      )));
    }

    if (result.treeGroupDeleted) {
      setDatasets((current) => current.filter((item) => item.rkey !== target.treeGroup.rkey));
      setQueryValues({ dataset: null, q: null, "tree-page": null, tree: null });
    } else if (deletedTreeRkeys.size > 0) {
      setDatasets((current) => current.map((item) => (
        item.rkey === target.treeGroup.rkey
          ? { ...item, recordCount: item.recordCount === null ? null : Math.max(0, item.recordCount - deletedTreeRkeys.size) }
          : item
      )));
      if (selectedTreeRkey && deletedTreeRkeys.has(selectedTreeRkey)) {
        setQueryValues({ tree: null });
      }
    }

    setDeletedFeedback(buildTreeGroupDeleteFeedback(result, treeGroupName, (key, values) => managerT(key as never, values as never)));
  };

  const applyAttachResult = (result: AttachExistingOccurrencesResult, treeGroup: UploadTreeDatasetRecord) => {
    const successfulRkeys = result.results.flatMap((item) => item.state === "success" ? [item.rkey] : []);
    const successfulRkeySet = new Set(successfulRkeys);
    const treeGroupName = treeGroup.name || "the selected tree group";

    if (successfulRkeys.length > 0) {
      setTrees((current) => current.map((tree) => (
        successfulRkeySet.has(tree.rkey)
          ? { ...tree, datasetRef: result.datasetUri, datasetName: treeGroup.name || tree.datasetName }
          : tree
      )));
      setDatasets((current) => current.map((item) => (
        item.rkey === treeGroup.rkey
          ? { ...item, recordCount: (item.recordCount ?? 0) + successfulRkeys.length }
          : item
      )));
      setSelectedUngroupedTreeRkeys((current) => current.filter((rkey) => !successfulRkeySet.has(rkey)));
      if (selectedTreeRkey && successfulRkeySet.has(selectedTreeRkey)) {
        setQueryValues({ tree: null });
      }
    }

    const feedbackParts: string[] = [];
    if (result.attachedCount > 0) {
      feedbackParts.push(managerT("treesAddedToGroup", { count: result.attachedCount, name: treeGroupName }));
    } else {
      feedbackParts.push(managerT("noTreesAdded", { name: treeGroupName }));
    }
    if (result.skippedCount > 0) {
      feedbackParts.push(`${result.skippedCount} tree${result.skippedCount === 1 ? " was" : "s were"} already in a tree group and skipped.`);
    }
    if (result.errorCount > 0) {
      feedbackParts.push(`${result.errorCount} tree${result.errorCount === 1 ? "" : "s"} could not be added.`);
    }
    if (!result.datasetCountUpdated) {
      feedbackParts.push(managerT("groupCountDelayed"));
    }
    setTreeGroupAttachFeedback(feedbackParts.join(" "));
  };

  const handleAttachTreesToTreeGroup = async (occurrenceRkeys: string[], treeGroup: UploadTreeDatasetRecord) => {
    const uniqueRkeys = Array.from(new Set(occurrenceRkeys.filter(Boolean)));
    if (uniqueRkeys.length === 0) throw new Error(managerT("chooseUngrouped"));
    if (!updatePermission.allowed) throw new Error(managerT("groupAttachDenied"));

    setTreeGroupAttachPending(true);
    try {
      const chunks = chunkStrings(uniqueRkeys, ATTACH_EXISTING_TREE_GROUP_MAX_TREES);
      const aggregate: AttachExistingOccurrencesResult = {
        datasetUri: treeGroup.uri,
        datasetRkey: treeGroup.rkey,
        attachedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        datasetCountUpdated: true,
        datasetCountError: null,
        results: [],
      };
      let fatalChunkError: string | null = null;

      for (const [chunkIndex, chunk] of chunks.entries()) {
        try {
          const result = await attachExistingOccurrences({ datasetRkey: treeGroup.rkey, occurrenceRkeys: chunk }, writeOptions);
          aggregate.datasetUri = result.datasetUri;
          aggregate.datasetRkey = result.datasetRkey;
          aggregate.attachedCount += result.attachedCount;
          aggregate.skippedCount += result.skippedCount;
          aggregate.errorCount += result.errorCount;
          aggregate.results.push(...result.results);
          if (!result.datasetCountUpdated) {
            aggregate.datasetCountUpdated = false;
            aggregate.datasetCountError = result.datasetCountError ?? aggregate.datasetCountError;
          }
        } catch (error) {
          const remaining = chunks.slice(chunkIndex).reduce((count, nextChunk) => count + nextChunk.length, 0);
          aggregate.errorCount += remaining;
          console.error("Tree group attachment failed", error);
          fatalChunkError = managerT("someTreesNotAdded");
          break;
        }
      }

      if (aggregate.attachedCount === 0 && aggregate.skippedCount === 0 && fatalChunkError) {
        throw new Error(fatalChunkError);
      }

      applyAttachResult(aggregate, treeGroup);
      if (fatalChunkError) {
        setTreeGroupAttachFeedback((current) => [current, fatalChunkError].filter(Boolean).join(" "));
      }
    } finally {
      setTreeGroupAttachPending(false);
    }
  };

  const openAddToTreeGroupModal = (items: TreeManagerItem[]) => {
    if (!updatePermission.allowed) {
      setTreeGroupAttachFeedback(managerT("groupAttachDenied"));
      return;
    }
    if (datasets.length === 0) {
      setTreeGroupAttachFeedback(managerT("createGroupFirst"));
      return;
    }

    const occurrenceRkeys = items.flatMap((item) => isUngroupedTree(item) && item.occurrence.rkey ? [item.occurrence.rkey] : []);
    if (occurrenceRkeys.length === 0) {
      setTreeGroupAttachFeedback(managerT("chooseUngrouped"));
      return;
    }

    setTreeGroupAttachFeedback(null);
    const selectionHash = hashStrings(occurrenceRkeys);
    pushModal(
      {
        id: `${MODAL_IDS.MANAGE_TREE_ADD_TO_TREE_GROUP}/${occurrenceRkeys.length}/${selectionHash}`,
        content: (
          <AddToTreeGroupModal
            treeGroups={datasets}
            treeCount={occurrenceRkeys.length}
            onConfirm={(treeGroup) => handleAttachTreesToTreeGroup(occurrenceRkeys, treeGroup)}
          />
        ),
        dialogWidth: "max-w-md",
      },
      true,
    );
    void show();
  };

  const openDeleteTreeGroupConfirm = (treeGroupId: string) => {
    if (!deletePermission.allowed) {
      setDeletedFeedback({ tone: "warn", message: managerT("groupDeleteDenied") });
      return;
    }
    if (treeGroupId === UNGROUPED_DATASET_FILTER) return;
    const treeGroup = datasetLookup.get(treeGroupId);
    if (!treeGroup) {
      setDeletedFeedback({ tone: "warn", message: managerT("groupCheckError") });
      return;
    }

    const target = getTreeGroupDeletionTarget(treeGroup, treeItems);
    pushModal(
      {
        id: `${MODAL_IDS.MANAGE_TREE_DELETE_TREE_GROUP}/${treeGroup.rkey}`,
        content: (
          <DeleteTreeGroupConfirmModal
            target={target}
            onConfirm={() => handleConfirmDeleteTreeGroup(target)}
          />
        ),
        dialogWidth: "max-w-md",
      },
      true,
    );
    void show();
  };

  const activeDeletionTarget = selectedTree ? getTreeDeletionTarget(selectedTree) : null;
  const confirmDescription = (() => {
    if (confirmTarget?.type === "tree") {
      const deletionTarget = getTreeDeletionTarget(confirmTarget.item);
      return deletionTarget
        ? managerT("deleteTreeConfirmCounts", { photos: deletionTarget.photoCount, measurements: deletionTarget.measurementCount })
        : managerT("deleteTreeConfirm");
    }

    return managerT("deletePhotoConfirm");
  })();

  if (isLoading) return <TreesManageSkeleton />;

  if (fetchError) {
    return (
      <Container className="pt-4 pb-8">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-destructive/20 bg-background">
            <AlertTriangleIcon className="size-5 text-destructive" />
          </div>
          <div className="space-y-1">
            <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">{managerT("loadErrorTitle")}</h1>
            <p className="text-sm text-muted-foreground">{fetchError}</p>
          </div>
          <Button variant="outline" onClick={() => void loadAll()}>
            <RefreshCcwIcon />
            {managerT("retry")}
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <Container className="pt-4 pb-8 space-y-6">
      <ManageSectionHeader
        title={managerT("title")}
        description={managerT("description")}
        actions={onUpload ? (
          <Button variant="outline" onClick={onUpload} disabled={!createPermission.allowed} aria-describedby={!createPermission.allowed ? "tree-upload-permission" : undefined}>
            <CloudUploadIcon />
            {managerT("upload")}
          </Button>
        ) : null}
      />
      {!createPermission.allowed ? <p id="tree-upload-permission" className="text-sm text-muted-foreground">{managerT("uploadDenied")}</p> : null}

      {!showTreeGroupLanding && treeGroupCards.length > 0 ? (
        <Button variant="ghost" className="-ml-2 w-fit" onClick={handleReturnToTreeGroups}>
          <ChevronLeftIcon />
          {managerT("backToGroups")}
        </Button>
      ) : null}

      {deletedFeedback ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-2xl border px-4 py-3",
            deletedFeedback.tone === "warn"
              ? "border-yellow-500/30 bg-yellow-500/10"
              : "border-primary/20 bg-primary/5",
          )}
        >
          <InfoIcon className={cn("mt-0.5 size-4 shrink-0", deletedFeedback.tone === "warn" ? "text-yellow-700 dark:text-yellow-300" : "text-primary")} />
          <p className="text-sm text-foreground">{deletedFeedback.message}</p>
        </div>
      ) : null}

      {treeGroupAttachFeedback ? (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm text-foreground">{treeGroupAttachFeedback}</p>
        </div>
      ) : null}

      {treeGroupCards.length > 0 || treeItems.length > 0 ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-2xl">
            <div className="relative w-full sm:max-w-sm">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={showTreeGroupLanding ? treeGroupSearchQuery : searchQuery}
                onChange={(event) => {
                  if (showTreeGroupLanding) setTreeGroupSearchQuery(event.target.value);
                  else handleTreeSearchChange(event.target.value);
                }}
                placeholder={showTreeGroupLanding ? treeFilterT("searchTreeGroups") : treeFilterT("searchTrees")}
                className="pl-9"
              />
            </div>
            {showTreeGroupLanding && treeGroupRecorderOptions.length > 0 ? (
              <div className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 sm:w-80">
                <UserRoundIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="shrink-0 text-muted-foreground">{treeFilterT("recorder")}</span>
                <Select
                  value={treeGroupRecordedByFilter || ALL_RECORDERS_FILTER_VALUE}
                  onValueChange={(value) => setTreeGroupRecordedByFilter(value === ALL_RECORDERS_FILTER_VALUE ? "" : value)}
                >
                  <SelectTrigger
                    aria-label={treeFilterT("filterByRecorder")}
                    className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-left shadow-none ring-offset-0 focus:ring-0 [&>svg]:ml-2 [&>svg]:size-4"
                  >
                    <SelectValue placeholder={treeFilterT("allRecorders")} />
                  </SelectTrigger>
                  <SelectContent align="start" className="min-w-80 max-w-[calc(100vw-2rem)]">
                    <SelectItem value={ALL_RECORDERS_FILTER_VALUE}>{treeFilterT("allRecorders")}</SelectItem>
                    {treeGroupRecorderOptions.map((recordedBy, index) => (
                      <SelectItem key={recordedBy} value={recordedBy}>
                        <span className="block max-w-[30rem] whitespace-normal leading-5">{getSafeRecordedByDisplayName(recordedBy) ?? treeFilterT("recorderOptionFallback", { number: index + 1 })}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {showTreeGroupLanding
              ? treeFilterT("treeGroupCount", { shown: filteredTreeGroupCards.length, total: treeGroupCards.length })
              : treeFilterT("treeCount", { shown: filteredTrees.length, total: datasetScopedTrees.length })}
          </p>
        </div>
      ) : null}

      {selectedTreeGroup && datasetFilter !== UNGROUPED_DATASET_FILTER ? (
        <div className="space-y-3">
          <GreenGlobeTreePreviewCard
            did={did}
            datasetRef={selectedTreeGroup.uri}
            treeGroupName={selectedTreeGroup.name}
            treeCount={selectedTreeGroupPreviewTreeCount}
            treeUri={selectedTreeGroupPreviewTree?.occurrence.atUri ?? null}
            treeName={selectedTreeGroupPreviewTree?.occurrence.scientificName ?? null}
            siteRef={selectedTreeGroupPreviewSiteRef}
            focusedSiteRef={selectedTreeGroupPreviewFocusedSiteRef}
          />
          <div className="flex justify-end">
            <Button variant="destructive" size="sm" onClick={() => openDeleteTreeGroupConfirm(selectedTreeGroup.uri)} disabled={!deletePermission.allowed} title={!deletePermission.allowed ? managerT("groupDeleteDenied") : undefined}>
              <Trash2Icon />
              {managerT("deleteGroup")}
            </Button>
          </div>
        </div>
      ) : null}

      {treeGroupCards.length === 0 && treeItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 rounded-2xl border border-dashed border-border text-center px-6">
          <h2 className="font-instrument text-2xl italic text-foreground">{managerT("emptyTitle")}</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {managerT("emptyBody")}
          </p>
          {onUpload ? (
            <Button onClick={onUpload}>
              <CloudUploadIcon />
              {managerT("upload")}
            </Button>
          ) : null}
        </div>
      ) : showTreeGroupLanding ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {managerT("groupHelp")}
              </p>
            </div>
          </div>

          {filteredTreeGroupCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 gap-3 rounded-2xl border border-dashed border-border text-center px-6">
              <h2 className="font-instrument text-2xl italic text-foreground">{treeFilterT("noTreeGroupsTitle")}</h2>
              <p className="text-sm text-muted-foreground">{treeFilterT("noTreeGroupsDescription")}</p>
              <Button variant="outline" onClick={() => { setTreeGroupSearchQuery(""); setTreeGroupRecordedByFilter(""); }}>{treeFilterT("clearFilters")}</Button>
            </div>
          ) : (
            <DatasetLandingSection datasetCards={filteredTreeGroupCards} onOpen={handleDatasetChange} onDelete={openDeleteTreeGroupConfirm} deleteDisabledReason={!deletePermission.allowed ? managerT("groupDeleteDenied") : null} />
          )}
        </div>
      ) : filteredTrees.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-56 gap-3 rounded-2xl border border-dashed border-border text-center px-6">
          <h2 className="font-instrument text-2xl italic text-foreground">{managerT("noMatchesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{managerT("noMatchesBody")}</p>
          <Button variant="outline" onClick={() => handleTreeSearchChange("")}>{managerT("clearSearch")}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <section className="rounded-2xl border border-border bg-background overflow-hidden">
            <div className="border-b border-border px-4 py-3 space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {datasetFilter === UNGROUPED_DATASET_FILTER ? managerT("ungroupedTitle") : managerT("savedTitle")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {datasetFilter === UNGROUPED_DATASET_FILTER
                    ? managerT("ungroupedDescription")
                    : managerT("savedDescription")}
                </p>
              </div>

              {datasetFilter === UNGROUPED_DATASET_FILTER ? (
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={selectAllUngroupedChecked}
                      onCheckedChange={handleToggleAllFilteredUngroupedTrees}
                      disabled={filteredUngroupedTreeRkeys.length === 0}
                      aria-label={managerT("selectAllAria")}
                    />
                    <span>{managerT("selectAll")}</span>
                    {selectedUngroupedTreeCount > 0 ? (
                      <span className="font-medium text-foreground">{managerT("selectedCount", { count: selectedUngroupedTreeCount })}</span>
                    ) : null}
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAddToTreeGroupModal(selectedUngroupedTrees)}
                    disabled={selectedUngroupedTreeCount === 0 || datasets.length === 0 || treeGroupAttachPending || !updatePermission.allowed}
                    title={!updatePermission.allowed ? managerT("groupAttachDenied") : undefined}
                    className="w-full sm:w-auto"
                  >
                    {treeGroupAttachPending ? <Loader2Icon className="animate-spin" /> : <DatabaseIcon />}
                    {selectedUngroupedTreeCount > 1 ? managerT("addCountToGroup", { count: selectedUngroupedTreeCount }) : managerT("addToGroup")}
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="divide-y divide-border">
              {paginatedTrees.map((item) => {
                const tree = item.occurrence;
                const selected = selectedTree?.occurrence.rkey === tree.rkey;
                const groupName = tree.datasetRef ? datasetLookup.get(tree.datasetRef)?.name ?? tree.datasetName : null;
                const canSelectUngroupedTree = datasetFilter === UNGROUPED_DATASET_FILTER && isUngroupedTree(item);
                const isUngroupedTreeSelected = selectedUngroupedTreeRkeySet.has(tree.rkey);
                return (
                  <div
                    key={tree.atUri}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/35",
                      (selected || isUngroupedTreeSelected) && "bg-primary/5",
                    )}
                  >
                    {canSelectUngroupedTree ? (
                      <Checkbox
                        checked={isUngroupedTreeSelected}
                        onCheckedChange={() => handleToggleUngroupedTreeSelection(tree.rkey)}
                        aria-label={managerT("selectTree", { name: tree.scientificName ?? managerT("treeFallback") })}
                        className="mt-0.5"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setQueryValues({ tree: tree.rkey })}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-lg font-medium leading-none">{tree.scientificName ?? managerT("unnamedTree")}</p>
                          {tree.vernacularName ? <p className="truncate text-xs italic text-muted-foreground">{tree.vernacularName}</p> : null}
                          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <MapPinIcon className="size-3" />
                            {formatTreeSubtitle(item)}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatEventDate(tree.eventDate)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {groupName ? <Badge><DatabaseIcon className="size-3" />{groupName}</Badge> : null}
                          {item.photos.length > 0 ? <Badge><ImageIcon className="size-3" />{item.photos.length}</Badge> : null}
                          {item.hasDuplicateBundledMeasurements ? <Badge tone="warn">{managerT("reviewNeeded")}</Badge> : hasAnyMeasurementValue(getTreeMeasurementDraft(item.floraMeasurement)) ? <Badge tone="good">{managerT("measured")}</Badge> : null}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
            <TreeListPagination
              currentPage={currentTreePage}
              totalPages={totalTreePages}
              totalItems={filteredTrees.length}
              pageSize={TREE_ITEMS_PER_PAGE}
              onPageChange={handleTreePageChange}
            />
          </section>

          {selectedTree ? (
            <div className="space-y-4">
              <section className="rounded-2xl border border-border bg-background p-4 md:p-5 space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <h2 className="font-instrument truncate text-3xl italic leading-none">{selectedTree.occurrence.scientificName ?? managerT("unnamedTree")}</h2>
                    {selectedTree.occurrence.vernacularName ? (
                      <p className="text-sm italic text-muted-foreground">{selectedTree.occurrence.vernacularName}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Badge><MapPinIcon className="size-3" />{formatTreeSubtitle(selectedTree)}</Badge>
                      <Badge><CalendarIcon className="size-3" />{formatEventDate(selectedTree.occurrence.eventDate)}</Badge>
                      {activeDatasetName ? <Badge><DatabaseIcon className="size-3" />{activeDatasetName}</Badge> : null}
                      {detailLoadingRkey === selectedTree.occurrence.rkey ? <Badge><Loader2Icon className="size-3 animate-spin" />{managerT("loadingDetails")}</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isUngroupedTree(selectedTree) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAddToTreeGroupModal([selectedTree])}
                        disabled={datasets.length === 0 || treeGroupAttachPending || !updatePermission.allowed}
                        title={!updatePermission.allowed ? managerT("groupAttachDenied") : undefined}
                      >
                        {treeGroupAttachPending ? <Loader2Icon className="animate-spin" /> : <DatabaseIcon />}
                        {managerT("addToGroup")}
                      </Button>
                    ) : null}
                    <Badge>{managerT("photoCount", { count: selectedTree.photos.length })}</Badge>
                    {selectedTree.hasDuplicateBundledMeasurements ? (
                      <Badge tone="warn">{managerT("measurementReviewNeeded")}</Badge>
                    ) : selectedTreeHasShownMeasurement ? (
                      <Badge tone="good">{managerT("measurementsReady")}</Badge>
                    ) : selectedTree.hasLegacyMeasurements || selectedTree.hasUnsupportedMeasurements ? (
                      <Badge tone="warn">{managerT("measurementReviewNeeded")}</Badge>
                    ) : (
                      <Badge>{managerT("noMeasurements")}</Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <DetailFact label={managerT("treeGroupLabel")} value={activeDatasetName ?? managerT("noTreeGroup")} />
                  <DetailFact label={managerT("projectPlaceLabel")} value={activeSiteName ?? managerT("notLinked")} />
                  <DetailFact label={managerT("establishmentLabel")} value={establishmentMeansLabel(selectedTree.occurrence.establishmentMeans, managerT("notSet"), (value) => managerT(`establishmentOptions.${value}` as never))} />
                </div>
              </section>

              <SectionCard title={managerT("informationTitle")} description={managerT("informationDescription")}>
                {!updatePermission.allowed ? <p className="text-sm text-muted-foreground">{managerT("editTreeDenied")}</p> : null}
                <fieldset disabled={!updatePermission.allowed} className="grid grid-cols-1 gap-4 disabled:opacity-70 md:grid-cols-2">
                  <Field label={managerT("scientificName")} required>
                    <Input value={occurrenceDraft.scientificName} onChange={(event) => handleOccurrenceFieldChange("scientificName", event.target.value)} />
                  </Field>
                  <Field label={managerT("commonName")}>
                    <Input value={occurrenceDraft.vernacularName} onChange={(event) => handleOccurrenceFieldChange("vernacularName", event.target.value)} />
                  </Field>
                  <Field label={managerT("eventDate")} required>
                    <Input value={occurrenceDraft.eventDate} onChange={(event) => handleOccurrenceFieldChange("eventDate", event.target.value)} placeholder="YYYY-MM-DD" />
                  </Field>
                  <Field label={managerT("recordedBy")}>
                    <Input value={occurrenceDraft.recordedBy} onChange={(event) => handleOccurrenceFieldChange("recordedBy", event.target.value)} />
                  </Field>
                  <Field label={managerT("latitude")} required>
                    <Input inputMode="decimal" value={occurrenceDraft.decimalLatitude} onChange={(event) => handleOccurrenceFieldChange("decimalLatitude", event.target.value)} />
                  </Field>
                  <Field label={managerT("longitude")} required>
                    <Input inputMode="decimal" value={occurrenceDraft.decimalLongitude} onChange={(event) => handleOccurrenceFieldChange("decimalLongitude", event.target.value)} />
                  </Field>
                  <Field label={managerT("country")}>
                    <Input value={occurrenceDraft.country} onChange={(event) => handleOccurrenceFieldChange("country", event.target.value)} />
                  </Field>
                  <Field label={managerT("locality")}>
                    <Input value={occurrenceDraft.locality} onChange={(event) => handleOccurrenceFieldChange("locality", event.target.value)} />
                  </Field>
                  <Field label={managerT("establishmentLabel")}>
                    <select
                      value={occurrenceDraft.establishmentMeans}
                      onChange={(event) => handleOccurrenceFieldChange("establishmentMeans", event.target.value)}
                      className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">{managerT("notSpecified")}</option>
                      {PARTNER_ESTABLISHMENT_MEANS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{managerT(`establishmentOptions.${option.value}` as never)}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="hidden md:block" />
                  <Field label={managerT("habitat")}>
                    <Textarea value={occurrenceDraft.habitat} onChange={(event) => handleOccurrenceFieldChange("habitat", event.target.value)} rows={3} />
                  </Field>
                  <Field label={managerT("remarks")}>
                    <Textarea value={occurrenceDraft.occurrenceRemarks} onChange={(event) => handleOccurrenceFieldChange("occurrenceRemarks", event.target.value)} rows={3} />
                  </Field>
                </fieldset>

                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-h-5 text-sm">
                    {occurrenceError || occurrenceValidationError ? (
                      <span className="text-destructive">{occurrenceError ?? occurrenceValidationError}</span>
                    ) : occurrenceFeedback ? (
                      <span className="text-muted-foreground">{occurrenceFeedback}</span>
                    ) : null}
                  </div>
                  <Button onClick={() => void handleSaveOccurrence()} disabled={!occurrenceHasChanges || Boolean(occurrenceValidationError) || savingOccurrence || !updatePermission.allowed} title={!updatePermission.allowed ? managerT("editTreeDenied") : undefined}>
                    {savingOccurrence ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                    {managerT("saveTree")}
                  </Button>
                </div>
              </SectionCard>

              <SectionCard title={managerT("measurementsTitle")} description={managerT("measurementsDescription")}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <DetailFact label={managerT("linkedMeasurements")} value={selectedTree.measurements.length} />
                  <DetailFact label="DBH" value={selectedTree.floraMeasurement?.dbh ? `${selectedTree.floraMeasurement.dbh} cm` : managerT("notSet")} />
                  <DetailFact label={managerT("height")} value={selectedTree.floraMeasurement?.totalHeight ? `${selectedTree.floraMeasurement.totalHeight} m` : managerT("notSet")} />
                  <DetailFact label={managerT("rootCollarCm")} value={selectedTree.floraMeasurement?.basalDiameter ?? managerT("notSet")} />
                  <DetailFact label={managerT("canopyCover")} value={selectedTree.floraMeasurement?.canopyCoverPercent ? `${selectedTree.floraMeasurement.canopyCoverPercent}%` : managerT("notSet")} />
                </div>

                {measurementEditingBlocked ? (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300">
                    {selectedTree.hasDuplicateBundledMeasurements
                      ? managerT("duplicateMeasurements")
                      : managerT("measurementManualReview")}
                  </div>
                ) : (
                  <>
                    {!((selectedTree.preferredMeasurement ? updatePermission : createPermission).allowed) ? (
                      <p className="text-sm text-muted-foreground">{managerT("measurementDenied")}</p>
                    ) : null}
                    <fieldset
                      disabled={!(selectedTree.preferredMeasurement ? updatePermission : createPermission).allowed}
                      className="grid grid-cols-1 gap-4 disabled:opacity-70 md:grid-cols-2"
                    >
                      <Field label="DBH (cm)">
                        <Input value={measurementDraft.dbh} inputMode="decimal" onChange={(event) => handleMeasurementFieldChange("dbh", event.target.value)} />
                      </Field>
                      <Field label={managerT("heightM")}>
                        <Input value={measurementDraft.totalHeight} inputMode="decimal" onChange={(event) => handleMeasurementFieldChange("totalHeight", event.target.value)} />
                      </Field>
                      <Field label={managerT("rootCollarCm")}>
                        <Input value={measurementDraft.diameter} inputMode="decimal" onChange={(event) => handleMeasurementFieldChange("diameter", event.target.value)} />
                        <p className="text-xs leading-relaxed text-muted-foreground">{managerT("rootCollarHint")}</p>
                      </Field>
                      <Field label={managerT("canopyCoverPercent")}>
                        <Input type="number" min={0} max={CANOPY_COVER_PERCENT_MAX} step="any" value={measurementDraft.canopyCoverPercent} onChange={(event) => handleMeasurementFieldChange("canopyCoverPercent", event.target.value)} />
                      </Field>
                    </fieldset>
                    <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-h-5 text-sm">
                        {measurementError || measurementValidationError ? (
                          <span className="text-destructive">{measurementError ?? measurementValidationError}</span>
                        ) : measurementFeedback ? (
                          <span className="text-muted-foreground">{measurementFeedback}</span>
                        ) : !selectedTree.preferredMeasurement ? (
                          <span className="text-muted-foreground">{managerT("measurementEmptyHint")}</span>
                        ) : null}
                      </div>
                      <Button
                        onClick={() => void handleSaveMeasurement()}
                        disabled={
                          !measurementHasChanges ||
                          Boolean(measurementValidationError) ||
                          savingMeasurement ||
                          (!selectedTree.preferredMeasurement && !hasAnyMeasurementValue(measurementDraft)) ||
                          !(selectedTree.preferredMeasurement ? updatePermission.allowed : createPermission.allowed)
                        }
                        title={!(selectedTree.preferredMeasurement ? updatePermission : createPermission).allowed ? managerT("measurementDenied") : undefined}
                      >
                        {savingMeasurement ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                        {selectedTree.preferredMeasurement && !hasAnyMeasurementValue(measurementDraft)
                          ? managerT("removeMeasurements")
                          : selectedTree.preferredMeasurement
                            ? managerT("saveMeasurements")
                            : managerT("addMeasurements")}
                      </Button>
                    </div>
                  </>
                )}
              </SectionCard>

              <SectionCard title={managerT("photosTitle")} description={managerT("photosDescription")}>
                <div className="space-y-3 rounded-xl bg-muted/30 p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-photo-caption">{managerT("photoCaption")}</Label>
                      <Input id="new-photo-caption" value={newPhotoCaption} onChange={(event) => setNewPhotoCaption(event.target.value)} placeholder={managerT("photoCaptionPlaceholder")} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => void handleAddPhotoFile(event.currentTarget.files?.[0] ?? null)}
                      />
                      <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={savingPhoto || !createPermission.allowed} title={!createPermission.allowed ? managerT("photoAddDenied") : undefined}>
                        {savingPhoto ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
                        {managerT("choosePhoto")}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 md:flex-row">
                    <Input value={newPhotoUrl} onChange={(event) => setNewPhotoUrl(event.target.value)} placeholder={managerT("photoLinkPlaceholder")} />
                    <Button type="button" variant="outline" onClick={() => void handleAddPhotoUrl()} disabled={savingPhoto || !newPhotoUrl.trim() || !createPermission.allowed} title={!createPermission.allowed ? managerT("photoAddDenied") : undefined}>
                      {managerT("addLinkedPhoto")}
                    </Button>
                  </div>
                  {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}
                  {photoFeedback ? <p className="text-sm text-muted-foreground">{photoFeedback}</p> : null}
                </div>

                {selectedTree.photos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
                    <CameraIcon className="size-8 text-muted-foreground" />
                    <p className="text-muted-foreground">{managerT("photosEmpty")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {selectedTree.photos.map((photo) => {
                      const photoUrl = getPhotoUrl(photo);
                      const isEditing = editingPhotoRkey === photo.metadata.rkey;
                      const isSavingCaption = savingPhotoCaptionRkey === photo.metadata.rkey;
                      return (
                        <article key={photo.metadata.uri} className="overflow-hidden rounded-xl border border-border">
                          <div className="flex h-48 w-full items-center justify-center overflow-hidden bg-muted">
                            {photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={photoUrl} alt={photo.record.caption ?? managerT(selectedTree.occurrence.scientificName ? "photoAltNamed" : "photoAlt", { name: selectedTree.occurrence.scientificName ?? "" })} className="h-full w-full object-cover" />
                            ) : (
                              <CameraIcon className="size-8 text-muted-foreground" />
                            )}
                          </div>
                          <div className="space-y-3 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-2">
                                <Badge>{formatSubjectPart(photo.record.subjectPart, managerT("treePhoto"))}</Badge>
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <Textarea value={photoCaptionDraft} onChange={(event) => { setPhotoCaptionDraft(event.target.value); setPhotoCaptionError(null); }} rows={3} className="resize-none text-sm" />
                                    {photoCaptionError ? <p className="text-xs text-destructive">{photoCaptionError}</p> : null}
                                    <div className="flex flex-wrap gap-2">
                                      <Button size="sm" onClick={() => void handleSavePhotoCaption(photo)} disabled={isSavingCaption || !updatePermission.allowed} title={!updatePermission.allowed ? managerT("photoEditDenied") : undefined}>
                                        {isSavingCaption ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                                        {managerT("saveCaption")}
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => { setEditingPhotoRkey(null); setPhotoCaptionDraft(""); setPhotoCaptionError(null); }} disabled={isSavingCaption}>
                                        <XIcon />
                                        {managerT("cancel")}
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <p className={cn("text-sm break-words", !photo.record.caption && "text-muted-foreground")}>{photo.record.caption ?? managerT("noCaption")}</p>
                                    <Button type="button" variant="outline" size="sm" onClick={() => { setEditingPhotoRkey(photo.metadata.rkey); setPhotoCaptionDraft(photo.record.caption ?? ""); setPhotoCaptionError(null); }} disabled={savingPhotoCaptionRkey !== null || !updatePermission.allowed} title={!updatePermission.allowed ? managerT("photoEditDenied") : undefined}>
                                      <PencilIcon />
                                      {photo.record.caption ? managerT("editCaption") : managerT("addCaption")}
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={managerT("deletePhoto")} onClick={() => setConfirmTarget({ type: "photo", photo })} disabled={!deletePermission.allowed} title={!deletePermission.allowed ? managerT("photoDeleteDenied") : undefined}>
                                <Trash2Icon />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">{managerT("photoAdded", { date: formatEventDate(photo.metadata.createdAt) })}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              <SectionCard title={managerT("deleteTitle")} description={managerT("deleteDescription")}>
                <div className="flex flex-col gap-3 rounded-xl bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{managerT("deletePermanently")}</p>
                    <p className="text-sm text-muted-foreground">
                      {activeDeletionTarget
                        ? managerT("deleteTreeLinkedBody", { photos: activeDeletionTarget.photoCount, measurements: activeDeletionTarget.measurementCount })
                        : managerT("deleteTreeLoadingBody")}
                    </p>
                  </div>
                  <Button variant="destructive" disabled={!activeDeletionTarget || !deletePermission.allowed} title={!deletePermission.allowed ? managerT("treeDeleteDenied") : undefined} onClick={() => setConfirmTarget({ type: "tree", item: selectedTree })}>
                    <Trash2Icon />
                    {managerT("deleteTree")}
                  </Button>
                </div>
              </SectionCard>
            </div>
          ) : null}
        </div>
      )}

      <ManageConfirmModal
        open={confirmTarget !== null}
        title={confirmTarget?.type === "tree" ? managerT("deleteTreeTitle") : managerT("deletePhotoTitle")}
        description={confirmDescription}
        confirmLabel={confirmTarget?.type === "tree" ? managerT("deleteTree") : managerT("deletePhoto")}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}
        onConfirm={async () => {
          if (!confirmTarget) return;
          if (confirmTarget.type === "tree") await handleConfirmDeleteTree(confirmTarget.item);
          else await handleConfirmDeletePhoto(confirmTarget.photo);
        }}
      />
    </Container>
  );
}
