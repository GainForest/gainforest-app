"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  ImagePlusIcon,
  Layers2Icon,
  Loader2Icon,
  MapPinIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SplitIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModalContent, ModalHeader, ModalTitle, ModalDescription } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import type { ManageTarget } from "@/lib/links";
import { canCreateRecord } from "../../_lib/cgs-permissions";
import {
  cleanFileName,
  compressImageIfNeeded,
  dateFromFile,
  imageMetadata,
} from "./observation-image";
import {
  configureObservationMutationRepo,
  createObservationOccurrence,
  createObservationPhoto,
  formatObservationMutationError,
  setObservationPrimaryImage,
  type ObservationBlobRef,
} from "./observation-mutations";
import { LocationPickerModal, LocationPickerModalId } from "./LocationPickerModal";
import { fetchDefaultObservationCenter, roundCoord, type PickedLocation } from "./default-location";
import {
  buildObservationLocationFields,
  DEFAULT_FUZZY_AREA,
  FUZZY_AREA_OPTIONS,
  radiusForArea,
  type FuzzyAreaId,
} from "./fuzzy-location";

// Keep one quick-add session light; the rich bulk panel handles big imports.
const MAX_PHOTOS = 50;
const ANALYZE_ATTEMPTS = 2;
// Safety net so a stalled connection can't leave a card spinning on
// "Identifying…" forever. Sits above the analyze route's own worst-case runtime
// so it only ever trips on a genuine hang, never on a slow-but-working call.
const ANALYZE_TIMEOUT_MS = 75_000;
const UNIDENTIFIED = "unidentified organism";

type ItemStatus = "identifying" | "ready" | "uploading" | "uploaded" | "error";

// Drag payload type used to merge one photo card into another observation.
const OBS_ITEM_DND = "application/x-obs-item";

type QuickItem = {
  id: string;
  // Photos sharing a groupId upload as one observation (one occurrence + many
  // photos). Each photo starts in its own group; dragging one onto another
  // merges them.
  groupId: string;
  file: File;
  previewUrl: string;
  scientificName: string;
  vernacularName: string;
  kingdom: string;
  eventDate: string;
  location: PickedLocation | null;
  notes: string;
  caption: string;
  status: ItemStatus;
  error: string | null;
};

type AnalyzeResponse = {
  analysis?: {
    scientificName?: string;
    vernacularName?: string;
    kingdom?: string;
    eventDate?: string;
    decimalLatitude?: string;
    decimalLongitude?: string;
    occurrenceRemarks?: string;
  };
  error?: string;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isNamed(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized.length > 0 && normalized !== UNIDENTIFIED;
}

// The analyze route falls back to an "unidentified organism" placeholder when the
// model isn't confident. Treat that as blank so the species field stays empty and
// the observation is clearly flagged as still needing an ID.
function cleanSpecies(name: string | undefined): string {
  const value = (name ?? "").trim();
  return isNamed(value) ? value : "";
}

// The occurrence-level fields shared by every photo in one observation. The
// caption stays per-photo; everything here is unified across the group.
type QuickGroupFields = {
  scientificName: string;
  vernacularName: string;
  kingdom: string;
  eventDate: string;
  notes: string;
  location: PickedLocation | null;
};

function mergedGroupFields(items: QuickItem[]): QuickGroupFields {
  const firstText = (key: "scientificName" | "vernacularName" | "kingdom" | "eventDate" | "notes"): string => {
    for (const item of items) {
      const value = item[key].trim();
      if (value) return value;
    }
    return "";
  };
  return {
    scientificName: firstText("scientificName"),
    vernacularName: firstText("vernacularName"),
    kingdom: firstText("kingdom") || "Plantae",
    eventDate: firstText("eventDate"),
    notes: firstText("notes"),
    location: items.find((item) => item.location)?.location ?? null,
  };
}

type QuickGroup = { id: string; items: QuickItem[]; fields: QuickGroupFields };

function quickGroups(items: QuickItem[]): QuickGroup[] {
  const order: string[] = [];
  const byId = new Map<string, QuickItem[]>();
  for (const item of items) {
    if (!byId.has(item.groupId)) {
      order.push(item.groupId);
      byId.set(item.groupId, []);
    }
    byId.get(item.groupId)!.push(item);
  }
  return order.map((id) => {
    const groupItems = byId.get(id)!;
    return { id, items: groupItems, fields: mergedGroupFields(groupItems) };
  });
}

function canSubmitGroup(group: QuickGroup): boolean {
  return group.fields.eventDate.trim().length > 0 && group.items.some((item) => item.status !== "uploaded");
}

function quickGroupStatus(items: QuickItem[]): ItemStatus {
  if (items.some((item) => item.status === "uploading")) return "uploading";
  if (items.some((item) => item.status === "identifying")) return "identifying";
  if (items.some((item) => item.status === "error")) return "error";
  if (items.length > 0 && items.every((item) => item.status === "uploaded")) return "uploaded";
  return "ready";
}

export function AddObservationsModal({
  target,
  projectRef,
  onViewObservations,
  onClose,
}: {
  target: ManageTarget;
  /** When set, each new observation is attached to this project (at-uri). */
  projectRef?: string | null;
  /** Navigate to the observations list (called after a successful add). */
  onViewObservations: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("upload.observations.quickAdd");
  const modal = useModal();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const itemsRef = useRef<QuickItem[]>([]);
  // Caches the one device-location request per modal session so adding several
  // photos never re-prompts. Resolves to null when sharing is denied/unavailable.
  const deviceLocationRef = useRef<Promise<PickedLocation | null> | null>(null);

  const [items, setItems] = useState<QuickItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  // Tracks how many observations have finished uploading during a submit run, so
  // the footer can show a progress bar instead of just a spinning button.
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [defaultCenter, setDefaultCenter] = useState<PickedLocation | null>(null);
  // Privacy: when on, each observation is published as an approximate circle
  // centred on a randomised point rather than the exact pin.
  const [obscureLocation, setObscureLocation] = useState(false);
  const [fuzzyArea, setFuzzyArea] = useState<FuzzyAreaId>(DEFAULT_FUZZY_AREA);

  const createPermission = canCreateRecord(target);
  const disabledReason = createPermission.allowed ? null : createPermission.reason;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Point the shared occurrence mutations at the right repo (the org for a
  // group context, the signed-in user otherwise) for the lifetime of the modal.
  useEffect(() => {
    configureObservationMutationRepo(target.kind === "group" ? target.did : null);
    return () => configureObservationMutationRepo(null);
  }, [target]);

  // Best-effort starting point for the map picker.
  useEffect(() => {
    const controller = new AbortController();
    void fetchDefaultObservationCenter(target.did, controller.signal)
      .then((center) => {
        if (center) setDefaultCenter(center);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [target.did]);

  // Revoke object URLs on unmount so previews don't leak.
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  // Ask the device for its current location so photos without their own GPS can
  // be auto-located. We prompt at most once per modal session and, crucially,
  // never guess: if the observer denies access or the browser can't resolve a
  // fix, this resolves to null and the location is simply left blank.
  const requestDeviceLocation = useCallback((): Promise<PickedLocation | null> => {
    if (deviceLocationRef.current) return deviceLocationRef.current;
    const promise = new Promise<PickedLocation | null>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve(null);
        return;
      }
      if (typeof window !== "undefined" && !window.isSecureContext) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({ lat: roundCoord(position.coords.latitude), lng: roundCoord(position.coords.longitude) }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 20_000, maximumAge: 10 * 60_000 },
      );
    });
    deviceLocationRef.current = promise;
    return promise;
  }, []);

  // One analyze call with a couple of retries on transient (429/5xx/network)
  // failures. Returns the model's suggestion, or null when identification
  // couldn't be completed at all.
  const fetchAnalysis = useCallback(async (file: File): Promise<NonNullable<AnalyzeResponse["analysis"]> | null> => {
    for (let attempt = 0; attempt < ANALYZE_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
      try {
        const formData = new FormData();
        formData.set("image", file);
        const response = await fetch("/api/manage/observations/analyze", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as AnalyzeResponse;
        if (!response.ok || data.error) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < ANALYZE_ATTEMPTS - 1) {
            await sleep(700 * (attempt + 1));
            continue;
          }
          return null;
        }
        return data.analysis ?? {};
      } catch {
        // Includes the abort fired when one attempt outruns ANALYZE_TIMEOUT_MS.
        if (attempt < ANALYZE_ATTEMPTS - 1) {
          await sleep(700 * (attempt + 1));
          continue;
        }
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }
    return null;
  }, []);

  // First-pass identification for a freshly added photo. Fills only the fields
  // the observer hasn't set, so it never clobbers manual edits.
  const analyzeItem = useCallback(
    async (id: string, file: File) => {
      const a = await fetchAnalysis(file);
      if (!a) {
        // Identification is best-effort: leave the fields for the user.
        setItems((current) =>
          current.map((item) => (item.id === id && item.status === "identifying" ? { ...item, status: "ready" } : item)),
        );
        return;
      }
      setItems((current) =>
        current.map((item) => {
          if (item.id !== id) return item;
          const lat = Number.parseFloat(a.decimalLatitude ?? "");
          const lng = Number.parseFloat(a.decimalLongitude ?? "");
          const suggestedLocation =
            !item.location && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : item.location;
          return {
            ...item,
            status: "ready",
            scientificName: isNamed(item.scientificName) ? item.scientificName : cleanSpecies(a.scientificName),
            vernacularName: item.vernacularName || a.vernacularName?.trim() || "",
            kingdom: a.kingdom?.trim() || item.kingdom,
            eventDate: item.eventDate || a.eventDate?.trim() || "",
            location: suggestedLocation,
            notes: item.notes || a.occurrenceRemarks?.trim() || "",
          };
        }),
      );
    },
    [fetchAnalysis],
  );

  // Re-run identification for one observation on demand and replace the species
  // suggestion across every photo in it, while keeping the observer's date,
  // location, notes and captions intact.
  const reanalyzeGroup = useCallback(
    async (groupId: string) => {
      const groupItems = itemsRef.current.filter((item) => item.groupId === groupId);
      const sample = groupItems[0];
      if (!sample || groupItems.some((item) => item.status === "uploading" || item.status === "uploaded")) return;
      const ids = new Set(groupItems.map((item) => item.id));
      setItems((current) =>
        current.map((item) => (ids.has(item.id) ? { ...item, status: "identifying", error: null } : item)),
      );
      const a = await fetchAnalysis(sample.file);
      setItems((current) =>
        current.map((item) => {
          if (!ids.has(item.id)) return item;
          if (!a) return { ...item, status: "ready" };
          return {
            ...item,
            status: "ready",
            scientificName: cleanSpecies(a.scientificName),
            vernacularName: a.vernacularName?.trim() || "",
            kingdom: a.kingdom?.trim() || item.kingdom,
            notes: item.notes || a.occurrenceRemarks?.trim() || "",
          };
        }),
      );
    },
    [fetchAnalysis],
  );

  const addFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (disabledReason) {
        setError(disabledReason);
        return;
      }
      setAddedCount(null);
      const imageFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      const remaining = Math.max(0, MAX_PHOTOS - itemsRef.current.length);
      const files = imageFiles.slice(0, remaining);
      if (files.length < imageFiles.length) setError(t("tooMany", { max: MAX_PHOTOS }));
      else setError(null);
      if (files.length === 0) return;

      setIsPreparing(true);
      try {
        const prepared = await Promise.all(
          files.map(async (source) => {
            const id = `${source.name}-${source.size}-${source.lastModified}-${crypto.randomUUID()}`;
            const meta = await imageMetadata(source);
            const lat = Number.parseFloat(meta.decimalLatitude ?? "");
            const lng = Number.parseFloat(meta.decimalLongitude ?? "");
            let file = source;
            try {
              file = (await compressImageIfNeeded(source)).file;
            } catch {
              // Fall back to the original; the upload may still succeed.
            }
            const item: QuickItem = {
              id,
              groupId: id,
              file,
              previewUrl: URL.createObjectURL(file),
              scientificName: "",
              vernacularName: "",
              kingdom: "Plantae",
              eventDate: meta.eventDate || dateFromFile(source),
              // Only seed from the photo's own GPS here. Photos without EXIF
              // coordinates are auto-located from the device below (with the
              // observer's permission) rather than dropped on a default pin.
              location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
              notes: "",
              caption: cleanFileName(source.name),
              status: "identifying",
              error: null,
            };
            return item;
          }),
        );
        setItems((current) => [...current, ...prepared]);
        for (const item of prepared) void analyzeItem(item.id, item.file);

        // Auto-fill the location for freshly added photos that have no GPS of
        // their own. This asks for location access once; if the observer allows
        // it we drop the current-location pin, and if they deny it we leave the
        // field blank for them to set manually instead of guessing.
        const needLocation = prepared.filter((item) => !item.location);
        if (needLocation.length > 0) {
          void requestDeviceLocation().then((coords) => {
            if (!coords) return;
            const ids = new Set(needLocation.map((item) => item.id));
            setItems((current) =>
              current.map((item) => (ids.has(item.id) && !item.location ? { ...item, location: coords } : item)),
            );
          });
        }
      } finally {
        setIsPreparing(false);
      }
    },
    [analyzeItem, disabledReason, requestDeviceLocation, t],
  );

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(event.target.files);
    event.currentTarget.value = "";
  }

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
    void addFiles(event.dataTransfer.files);
  }

  // Remove a whole observation (all its photos) from the queue.
  function removeGroup(groupId: string) {
    setItems((current) => {
      for (const item of current) {
        if (item.groupId === groupId) URL.revokeObjectURL(item.previewUrl);
      }
      return current.filter((item) => item.groupId !== groupId);
    });
    setError(null);
  }

  // Apply a shared occurrence-level change to every photo in one observation.
  function patchGroup(groupId: string, patch: Partial<QuickGroupFields>) {
    setItems((current) => current.map((item) => (item.groupId === groupId ? { ...item, ...patch } : item)));
  }

  // Drag a photo onto another observation: move it into that group and unify the
  // group's shared fields (keeping any non-empty value from either side).
  function mergeItemIntoGroup(itemId: string, targetGroupId: string) {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === itemId);
      if (!item || item.groupId === targetGroupId) return current;
      const combined = [...current.filter((candidate) => candidate.groupId === targetGroupId), item];
      if (combined.length < 2) return current;
      const fields = mergedGroupFields(combined);
      return current.map((candidate) =>
        candidate.groupId === targetGroupId || candidate.id === itemId
          ? { ...candidate, groupId: targetGroupId, ...fields }
          : candidate,
      );
    });
    setError(null);
  }

  // Pull one photo back out of a multi-photo observation into its own.
  function separateItem(itemId: string) {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === itemId);
      if (!item || current.filter((candidate) => candidate.groupId === item.groupId).length <= 1) return current;
      return current.map((candidate) =>
        candidate.id === itemId ? { ...candidate, groupId: `${candidate.id}-${crypto.randomUUID()}` } : candidate,
      );
    });
    setError(null);
  }

  function openLocationPicker(group: QuickGroup) {
    modal.pushModal(
      {
        id: LocationPickerModalId,
        dialogWidth: "max-w-2xl",
        content: (
          <LocationPickerModal
            initial={group.fields.location}
            defaultCenter={defaultCenter}
            onSelect={(location) => patchGroup(group.id, { location })}
          />
        ),
      },
      false,
    );
    void modal.show();
  }

  const groups = quickGroups(items);
  const submittableCount = groups.filter(canSubmitGroup).length;
  // Drives the AI-detection progress bar so the identify phase never feels frozen.
  const identifyingCount = items.filter((item) => item.status === "identifying").length;

  // Upload one observation: a single occurrence carrying every photo in the
  // group, with the first photo set as the primary image the explorer reads.
  async function uploadGroup(group: QuickGroup): Promise<boolean> {
    const { fields } = group;
    // Resolve the location into Darwin Core fields, swapping the precise pin for
    // a randomised circle when the observer opted to keep their location private.
    const locationFields = fields.location
      ? buildObservationLocationFields(fields.location, {
          obscure: obscureLocation,
          radiusMeters: radiusForArea(fuzzyArea),
        })
      : { decimalLatitude: "", decimalLongitude: "" };
    const occurrence = await createObservationOccurrence({
      basisOfRecord: "MachineObservation",
      scientificName: fields.scientificName.trim(),
      vernacularName: fields.vernacularName.trim(),
      kingdom: fields.kingdom.trim() || "Plantae",
      eventDate: fields.eventDate.trim(),
      occurrenceRemarks: fields.notes.trim(),
      associatedMedia: group.items.map((item) => item.file.name).join(", "),
      ...locationFields,
      ...(projectRef ? { projectRef } : {}),
    });
    let primaryBlobRef: ObservationBlobRef | null = null;
    for (const item of group.items) {
      const photo = await createObservationPhoto({
        imageFile: item.file,
        occurrenceRef: occurrence.uri,
        subjectPart: "wholeOrganism",
        caption: item.caption.trim() || undefined,
      });
      if (!primaryBlobRef && photo.blobRef) primaryBlobRef = photo.blobRef;
    }
    if (primaryBlobRef) {
      await setObservationPrimaryImage({
        rkey: occurrence.rkey,
        record: occurrence.record ?? {},
        swapCid: occurrence.cid,
        blobRef: primaryBlobRef,
      }).catch(() => {});
    }
    return true;
  }

  async function submit() {
    if (disabledReason) {
      setError(disabledReason);
      return;
    }
    const queue = quickGroups(itemsRef.current).filter(canSubmitGroup);
    if (queue.length === 0) {
      setError(t("nothingToSubmit"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setUploadProgress({ done: 0, total: queue.length });
    let success = 0;
    for (const group of queue) {
      const ids = new Set(group.items.map((item) => item.id));
      setItems((current) => current.map((item) => (ids.has(item.id) ? { ...item, status: "uploading", error: null } : item)));
      try {
        await uploadGroup(group);
        success += 1;
        setUploadProgress((progress) => (progress ? { ...progress, done: progress.done + 1 } : progress));
        setItems((current) => {
          for (const item of current) {
            if (ids.has(item.id)) URL.revokeObjectURL(item.previewUrl);
          }
          return current.filter((item) => !ids.has(item.id));
        });
      } catch (uploadError) {
        const message = formatObservationMutationError(uploadError);
        setItems((current) => current.map((item) => (ids.has(item.id) ? { ...item, status: "error", error: message } : item)));
      }
    }
    setIsSubmitting(false);
    setUploadProgress(null);
    if (success > 0) {
      setAddedCount(success);
      setError(null);
    } else {
      setError(t("uploadFailed"));
    }
  }

  // Success screen — shown once at least one observation has been added.
  if (addedCount !== null && items.length === 0) {
    return (
      <ModalContent className="space-y-5" dismissible={false}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <CheckCircle2Icon className="size-7" />
          </span>
          <div>
            <ModalTitle>{t("doneTitle", { count: addedCount })}</ModalTitle>
            <ModalDescription className="mt-1">{t("doneBody")}</ModalDescription>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => setAddedCount(null)}>
            <ImagePlusIcon className="size-4" />
            {t("addMore")}
          </Button>
          <Button onClick={onViewObservations}>{t("viewObservations")}</Button>
        </div>
      </ModalContent>
    );
  }

  const showEmptyState = items.length === 0;

  return (
    <ModalContent className="space-y-4" dismissible={false}>
      <ModalHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <ModalTitle>{t("title")}</ModalTitle>
            <ModalDescription className="mt-1">{t("description")}</ModalDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={onClose}
            aria-label={t("close")}
            className="-mr-1 -mt-1 shrink-0 rounded-full"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </ModalHeader>

      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "rounded-2xl border border-dashed transition-colors",
          isDragging ? "border-primary bg-primary/10" : "border-primary/30",
          showEmptyState ? "px-6 py-10" : "p-3",
        )}
      >
        {showEmptyState ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
              {isPreparing ? <Loader2Icon className="size-7 animate-spin" /> : <UploadCloudIcon className="size-7" />}
            </span>
            <div>
              <p className="font-instrument text-xl font-medium italic tracking-[-0.02em] text-foreground">
                {t("dropTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("dropHint", { max: MAX_PHOTOS })}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(disabledReason) || isPreparing}
              title={disabledReason ?? undefined}
            >
              {t("choose")}
            </Button>
          </div>
        ) : (
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {identifyingCount > 0 ? (
              <QuickProgress
                label={t("identifyingProgress", { done: items.length - identifyingCount, total: items.length })}
                done={items.length - identifyingCount}
                total={items.length}
              />
            ) : null}
            {items.length > 1 ? (
              <p className="flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground">
                <Layers2Icon className="size-3.5 shrink-0 text-primary" />
                {t("combineTip")}
              </p>
            ) : null}
            {groups.map((group) => (
              <ObservationGroupCard
                key={group.id}
                group={group}
                disabled={isSubmitting}
                onChange={(patch) => patchGroup(group.id, patch)}
                onRemoveGroup={() => removeGroup(group.id)}
                onSeparateItem={separateItem}
                onDropItem={(itemId) => mergeItemIntoGroup(itemId, group.id)}
                onPickLocation={() => openLocationPicker(group)}
                onReanalyze={() => reanalyzeGroup(group.id)}
                t={t}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full rounded-xl border-dashed"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(disabledReason) || isPreparing || isSubmitting || items.length >= MAX_PHOTOS}
            >
              {isPreparing ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
              {t("addMore")}
            </Button>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onInputChange} />

      {!showEmptyState ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={obscureLocation}
              onCheckedChange={(checked) => setObscureLocation(checked === true)}
              disabled={isSubmitting}
              className="mt-0.5"
              aria-label={t("obscureLabel")}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <ShieldCheckIcon className="size-4 shrink-0 text-primary" />
                {t("obscureLabel")}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{t("obscureHint")}</span>
            </span>
          </label>
          {obscureLocation ? (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("obscureAreaLabel")}</span>
              <Select
                value={fuzzyArea}
                onValueChange={(value) => setFuzzyArea(value as FuzzyAreaId)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="h-8 w-full sm:w-56" aria-label={t("obscureAreaLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUZZY_AREA_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {t(`obscureArea_${option.id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {!showEmptyState ? (
        <div className="space-y-3 border-t border-border pt-3">
          {isSubmitting && uploadProgress ? (
            <QuickProgress
              label={t("uploadingProgress", { done: uploadProgress.done, total: uploadProgress.total })}
              done={uploadProgress.done}
              total={uploadProgress.total}
            />
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("readyCount", { count: submittableCount })}</p>
            <Button onClick={submit} disabled={submittableCount === 0 || isSubmitting || Boolean(disabledReason)}>
              {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {isSubmitting ? t("submitting") : t("submit", { count: submittableCount })}
            </Button>
          </div>
        </div>
      ) : null}
    </ModalContent>
  );
}

// Per-observation status pill: a clear at-a-glance signal for whether a card is
// still identifying, ready with a name, or uploaded-but-unidentified and waiting
// for the observer to add an ID.
function QuickStatusBadge({
  status,
  named,
  t,
}: {
  status: ItemStatus;
  named: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "identifying") {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Loader2Icon className="size-3.5 animate-spin" />
        {t("identifying")}
      </span>
    );
  }
  if (status === "uploading") {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Loader2Icon className="size-3.5 animate-spin" />
        {t("submitting")}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={cn(base, "bg-destructive/10 text-destructive")}>
        <CircleHelpIcon className="size-3.5" />
        {t("statusError")}
      </span>
    );
  }
  if (named) {
    return (
      <span className={cn(base, "bg-primary/10 text-primary")}>
        <CheckCircle2Icon className="size-3.5" />
        {t("statusReady")}
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
      <CircleHelpIcon className="size-3.5" />
      {t("statusNeedsId")}
    </span>
  );
}

// Determinate progress bar reused for both the AI-detection and upload phases, so
// the observer can always see things are moving rather than wondering if the page
// has frozen. The caller passes the already-localized label.
function QuickProgress({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GroupThumb({
  item,
  canSeparate,
  disabled,
  onSeparate,
  t,
}: {
  item: QuickItem;
  canSeparate: boolean;
  disabled: boolean;
  onSeparate: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const uploading = item.status === "uploading";
  return (
    <div className="group/thumb relative size-20 shrink-0">
      <div
        draggable={!disabled && !uploading}
        onDragStart={(event) => {
          event.dataTransfer.setData(OBS_ITEM_DND, item.id);
          event.dataTransfer.setData("text/plain", item.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        className={cn(
          "relative size-20 overflow-hidden rounded-xl bg-muted ring-1 ring-border",
          !disabled && !uploading && "cursor-grab active:cursor-grabbing",
        )}
      >
        <Image src={item.previewUrl} alt={item.caption} fill sizes="80px" draggable={false} className="object-cover" unoptimized />
        {uploading ? (
          <div className="absolute inset-0 grid place-items-center bg-background/60">
            <Loader2Icon className="size-5 animate-spin text-primary" />
          </div>
        ) : null}
      </div>
      {canSeparate && !disabled && !uploading ? (
        <button
          type="button"
          onClick={onSeparate}
          aria-label={t("separatePhoto")}
          title={t("separatePhoto")}
          className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-background text-primary shadow-sm ring-1 ring-border transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <SplitIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function ObservationGroupCard({
  group,
  disabled,
  onChange,
  onRemoveGroup,
  onSeparateItem,
  onDropItem,
  onPickLocation,
  onReanalyze,
  t,
}: {
  group: QuickGroup;
  disabled: boolean;
  onChange: (patch: Partial<QuickGroupFields>) => void;
  onRemoveGroup: () => void;
  onSeparateItem: (itemId: string) => void;
  onDropItem: (itemId: string) => void;
  onPickLocation: () => void;
  onReanalyze: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [isOver, setIsOver] = useState(false);
  const { fields, items } = group;
  const status = quickGroupStatus(items);
  const identifying = status === "identifying";
  const uploading = status === "uploading";
  const multi = items.length > 1;
  // A blank species is allowed (submitted as unidentified); show a gentle hint
  // rather than a validation warning.
  const unnamed = !isNamed(fields.scientificName) && !identifying;
  const error = items.find((item) => item.error)?.error ?? null;

  function isItemDrag(event: DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(OBS_ITEM_DND);
  }

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
        const itemId = event.dataTransfer.getData(OBS_ITEM_DND) || event.dataTransfer.getData("text/plain");
        if (itemId) onDropItem(itemId);
      }}
      className={cn(
        "relative rounded-2xl border bg-card p-3 transition-colors",
        isOver ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <QuickStatusBadge status={status} named={isNamed(fields.scientificName)} t={t} />
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onReanalyze}
            disabled={disabled || uploading || identifying}
            aria-label={t("reanalyzeAria")}
            title={t("reanalyzeAria")}
            className="h-7 rounded-full px-2 text-muted-foreground hover:text-foreground"
          >
            <RotateCcwIcon className="size-3.5" />
            <span className="hidden sm:inline">{t("reanalyze")}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemoveGroup}
            disabled={disabled || uploading}
            aria-label={t("removeObservation")}
            title={t("removeObservation")}
            className="rounded-full text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <GroupThumb
            key={item.id}
            item={item}
            canSeparate={multi}
            disabled={disabled}
            onSeparate={() => onSeparateItem(item.id)}
            t={t}
          />
        ))}
      </div>

      {multi ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
          <Layers2Icon className="size-3.5 shrink-0 text-primary" />
          <span>{t("photoCount", { count: items.length })}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{t("dragMergeHint")}</span>
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <div className="relative">
          <Input
            value={fields.scientificName}
            onChange={(event) => onChange({ scientificName: event.target.value })}
            placeholder={identifying ? t("identifying") : t("speciesPlaceholder")}
            disabled={disabled || uploading}
            aria-label={t("speciesLabel")}
            className="pr-8"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            {identifying ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4 opacity-50" />
            )}
          </span>
        </div>
        {fields.vernacularName ? (
          <p className="-mt-1 truncate text-xs text-muted-foreground">{fields.vernacularName}</p>
        ) : unnamed ? (
          <p className="-mt-1 text-xs text-muted-foreground">{t("speciesOptionalHint")}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="relative">
            <CalendarIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={fields.eventDate}
              onChange={(event) => onChange({ eventDate: event.target.value })}
              disabled={disabled || uploading}
              aria-label={t("dateLabel")}
              className="pl-8"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onPickLocation}
            disabled={disabled || uploading}
            className="justify-start gap-2 font-normal"
          >
            <MapPinIcon className={cn("size-4 shrink-0", fields.location ? "text-primary" : "text-muted-foreground")} />
            <span className="truncate">
              {fields.location ? t("locationSet", { lat: fields.location.lat, lng: fields.location.lng }) : t("setLocation")}
            </span>
          </Button>
        </div>

        <Textarea
          value={fields.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder={t("notesPlaceholder")}
          disabled={disabled || uploading}
          aria-label={t("notesLabel")}
          rows={2}
          className="resize-none"
        />

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
