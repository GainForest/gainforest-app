"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import {
  CalendarIcon,
  CheckCircle2Icon,
  ImagePlusIcon,
  Loader2Icon,
  MapPinIcon,
  SparklesIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { fetchDefaultObservationCenter, isValidLocation, type PickedLocation } from "./default-location";

// Keep one quick-add session light; the rich bulk panel handles big imports.
// MAX_PHOTOS bounds the total images across every observation in the session;
// MAX_PHOTOS_PER_OBSERVATION bounds how many angles/parts one observation holds.
const MAX_PHOTOS = 30;
const MAX_PHOTOS_PER_OBSERVATION = 8;
const ANALYZE_ATTEMPTS = 2;
const UNIDENTIFIED = "unidentified organism";

// Plain-language "what this photo shows" tags. The value is the canonical
// `subjectPart` stored on each ac.multimedia record (the explorer renders it),
// the label is looked up via i18n. The first photo of an observation is its
// cover and defaults to the whole organism.
const SUBJECT_PARTS = [
  "wholeOrganism",
  "leaf",
  "leafUnderside",
  "bark",
  "flower",
  "fruit",
  "habitat",
  "other",
] as const;
const PRIMARY_SUBJECT_PART: (typeof SUBJECT_PARTS)[number] = "wholeOrganism";

type ItemStatus = "identifying" | "ready" | "uploading" | "uploaded" | "error";

type QuickPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  /** Canonical subjectPart for this image (e.g. "leaf", "leafUnderside"). */
  subjectPart: string;
};

type QuickItem = {
  id: string;
  /** One observation, one-to-many supporting photos. photos[0] is the cover. */
  photos: QuickPhoto[];
  scientificName: string;
  vernacularName: string;
  kingdom: string;
  eventDate: string;
  location: PickedLocation | null;
  notes: string;
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

function canSubmitItem(item: QuickItem): boolean {
  // A species name is optional — nameless photos are submitted as unidentified
  // observations. Only a date is required (it auto-fills from EXIF/file).
  return item.photos.length > 0 && item.eventDate.trim().length > 0 && item.status !== "uploaded";
}

function totalPhotoCount(items: QuickItem[]): number {
  return items.reduce((sum, item) => sum + item.photos.length, 0);
}

/**
 * Prepare a dropped/selected file into a photo: pull EXIF (date/GPS) when asked
 * (only the cover photo seeds the observation's metadata) and downscale oversized
 * images so they fit within the PDS blob limit.
 */
async function preparePhoto(source: File, subjectPart: string): Promise<{ photo: QuickPhoto; meta: Awaited<ReturnType<typeof imageMetadata>> }> {
  const meta = await imageMetadata(source);
  let file = source;
  try {
    file = (await compressImageIfNeeded(source)).file;
  } catch {
    // Fall back to the original; the upload may still succeed.
  }
  const photo: QuickPhoto = {
    id: `${source.name}-${source.size}-${source.lastModified}-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
    subjectPart,
  };
  return { photo, meta };
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

  const [items, setItems] = useState<QuickItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [defaultCenter, setDefaultCenter] = useState<PickedLocation | null>(null);

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
      for (const item of itemsRef.current) {
        for (const photo of item.photos) URL.revokeObjectURL(photo.previewUrl);
      }
    };
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<QuickItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const analyzeItem = useCallback(
    async (id: string, file: File) => {
      for (let attempt = 0; attempt < ANALYZE_ATTEMPTS; attempt += 1) {
        try {
          const formData = new FormData();
          formData.set("image", file);
          const response = await fetch("/api/manage/observations/analyze", { method: "POST", body: formData });
          const data = (await response.json().catch(() => ({}))) as AnalyzeResponse;
          if (!response.ok || data.error) {
            const retryable = response.status === 429 || response.status >= 500;
            if (retryable && attempt < ANALYZE_ATTEMPTS - 1) {
              await sleep(700 * (attempt + 1));
              continue;
            }
            // Identification is best-effort: leave the fields for the user.
            setItems((current) =>
              current.map((item) => (item.id === id && item.status === "identifying" ? { ...item, status: "ready" } : item)),
            );
            return;
          }
          const a = data.analysis ?? {};
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
                scientificName: isNamed(item.scientificName) ? item.scientificName : a.scientificName?.trim() || "",
                vernacularName: item.vernacularName || a.vernacularName?.trim() || "",
                kingdom: a.kingdom?.trim() || item.kingdom,
                eventDate: item.eventDate || a.eventDate?.trim() || "",
                location: suggestedLocation,
                notes: item.notes || a.occurrenceRemarks?.trim() || "",
              };
            }),
          );
          return;
        } catch {
          if (attempt < ANALYZE_ATTEMPTS - 1) {
            await sleep(700 * (attempt + 1));
            continue;
          }
          setItems((current) =>
            current.map((item) => (item.id === id && item.status === "identifying" ? { ...item, status: "ready" } : item)),
          );
        }
      }
    },
    [],
  );

  // Each dropped file starts a new observation (with one cover photo). Use the
  // per-card "add photo" control to attach more angles to an existing one.
  const addFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (disabledReason) {
        setError(disabledReason);
        return;
      }
      setAddedCount(null);
      const imageFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      const remaining = Math.max(0, MAX_PHOTOS - totalPhotoCount(itemsRef.current));
      const files = imageFiles.slice(0, remaining);
      if (files.length < imageFiles.length) setError(t("tooMany", { max: MAX_PHOTOS }));
      else setError(null);
      if (files.length === 0) return;

      setIsPreparing(true);
      try {
        const prepared = await Promise.all(
          files.map(async (source) => {
            const { photo, meta } = await preparePhoto(source, PRIMARY_SUBJECT_PART);
            const lat = Number.parseFloat(meta.decimalLatitude ?? "");
            const lng = Number.parseFloat(meta.decimalLongitude ?? "");
            const item: QuickItem = {
              id: `obs-${crypto.randomUUID()}`,
              photos: [photo],
              scientificName: "",
              vernacularName: "",
              kingdom: "Plantae",
              eventDate: meta.eventDate || dateFromFile(source),
              location:
                Number.isFinite(lat) && Number.isFinite(lng)
                  ? { lat, lng }
                  : isValidLocation(defaultCenter)
                    ? defaultCenter
                    : null,
              notes: "",
              status: "identifying",
              error: null,
            };
            return item;
          }),
        );
        setItems((current) => [...current, ...prepared]);
        for (const item of prepared) void analyzeItem(item.id, item.photos[0].file);
      } finally {
        setIsPreparing(false);
      }
    },
    [analyzeItem, defaultCenter, disabledReason, t],
  );

  // Attach extra photos (a leaf underside, the whole plant, another angle…) to
  // one existing observation. These never re-run identification — the cover
  // photo already seeded the species, date and location.
  const addPhotosToItem = useCallback(
    async (itemId: string, fileList: FileList | File[] | null) => {
      if (disabledReason) {
        setError(disabledReason);
        return;
      }
      const targetItem = itemsRef.current.find((item) => item.id === itemId);
      if (!targetItem) return;
      setAddedCount(null);
      const imageFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      const perObsRemaining = Math.max(0, MAX_PHOTOS_PER_OBSERVATION - targetItem.photos.length);
      const globalRemaining = Math.max(0, MAX_PHOTOS - totalPhotoCount(itemsRef.current));
      const remaining = Math.min(perObsRemaining, globalRemaining);
      const files = imageFiles.slice(0, remaining);
      if (files.length < imageFiles.length) {
        setError(perObsRemaining <= globalRemaining ? t("tooManyPerObservation", { max: MAX_PHOTOS_PER_OBSERVATION }) : t("tooMany", { max: MAX_PHOTOS }));
      } else {
        setError(null);
      }
      if (files.length === 0) return;

      setIsPreparing(true);
      try {
        const prepared = await Promise.all(files.map((source) => preparePhoto(source, PRIMARY_SUBJECT_PART)));
        const photos = prepared.map((entry) => entry.photo);
        setItems((current) =>
          current.map((item) => (item.id === itemId ? { ...item, photos: [...item.photos, ...photos] } : item)),
        );
      } finally {
        setIsPreparing(false);
      }
    },
    [disabledReason, t],
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

  function removeItem(id: string) {
    setItems((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) for (const photo of removed.photos) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== id);
    });
    setError(null);
  }

  // Drop one photo. Removing the last photo removes the whole observation.
  function removePhoto(itemId: string, photoId: string) {
    setItems((current) => {
      const next: QuickItem[] = [];
      for (const item of current) {
        if (item.id !== itemId) {
          next.push(item);
          continue;
        }
        const removed = item.photos.find((photo) => photo.id === photoId);
        if (removed) URL.revokeObjectURL(removed.previewUrl);
        const photos = item.photos.filter((photo) => photo.id !== photoId);
        if (photos.length === 0) continue; // last photo gone → drop the observation
        next.push({ ...item, photos });
      }
      return next;
    });
    setError(null);
  }

  function setPhotoPart(itemId: string, photoId: string, subjectPart: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, photos: item.photos.map((photo) => (photo.id === photoId ? { ...photo, subjectPart } : photo)) }
          : item,
      ),
    );
  }

  function openLocationPicker(item: QuickItem) {
    modal.pushModal(
      {
        id: LocationPickerModalId,
        dialogWidth: "max-w-2xl",
        content: (
          <LocationPickerModal
            initial={item.location}
            defaultCenter={defaultCenter}
            onSelect={(location) => patchItem(item.id, { location })}
          />
        ),
      },
      false,
    );
    void modal.show();
  }

  const submittableCount = items.filter(canSubmitItem).length;

  async function uploadItem(item: QuickItem): Promise<boolean> {
    const cover = item.photos[0];
    const occurrence = await createObservationOccurrence({
      basisOfRecord: "MachineObservation",
      scientificName: item.scientificName.trim(),
      vernacularName: item.vernacularName.trim(),
      kingdom: item.kingdom.trim() || "Plantae",
      eventDate: item.eventDate.trim(),
      decimalLatitude: item.location ? String(item.location.lat) : "",
      decimalLongitude: item.location ? String(item.location.lng) : "",
      occurrenceRemarks: item.notes.trim(),
      associatedMedia: cover.file.name,
      ...(projectRef ? { projectRef } : {}),
    });
    // Upload every photo as its own ac.multimedia under this occurrence; the
    // cover photo's blob is also copied onto the occurrence's imageEvidence so
    // the explorer shows it as the primary image.
    let primaryBlobRef: ObservationBlobRef | null = null;
    for (let index = 0; index < item.photos.length; index += 1) {
      const photo = item.photos[index];
      const result = await createObservationPhoto({
        imageFile: photo.file,
        occurrenceRef: occurrence.uri,
        subjectPart: photo.subjectPart || PRIMARY_SUBJECT_PART,
        caption: cleanFileName(photo.file.name) || undefined,
      });
      if (index === 0 && result.blobRef) primaryBlobRef = result.blobRef;
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
    const queue = itemsRef.current.filter(canSubmitItem);
    if (queue.length === 0) {
      setError(t("nothingToSubmit"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    let success = 0;
    for (const item of queue) {
      patchItem(item.id, { status: "uploading", error: null });
      try {
        await uploadItem(item);
        success += 1;
        setItems((current) => {
          const uploaded = current.find((candidate) => candidate.id === item.id);
          if (uploaded) for (const photo of uploaded.photos) URL.revokeObjectURL(photo.previewUrl);
          return current.filter((candidate) => candidate.id !== item.id);
        });
      } catch (uploadError) {
        patchItem(item.id, { status: "error", error: formatObservationMutationError(uploadError) });
      }
    }
    setIsSubmitting(false);
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
  const atPhotoLimit = totalPhotoCount(items) >= MAX_PHOTOS;

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
            {items.map((item) => (
              <ObservationCard
                key={item.id}
                item={item}
                disabled={isSubmitting}
                canAddPhoto={!atPhotoLimit && item.photos.length < MAX_PHOTOS_PER_OBSERVATION}
                onChange={(patch) => patchItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
                onRemovePhoto={(photoId) => removePhoto(item.id, photoId)}
                onChangePhotoPart={(photoId, part) => setPhotoPart(item.id, photoId, part)}
                onAddPhotos={(fileList) => void addPhotosToItem(item.id, fileList)}
                onPickLocation={() => openLocationPicker(item)}
                t={t}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full rounded-xl border-dashed"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(disabledReason) || isPreparing || isSubmitting || atPhotoLimit}
            >
              {isPreparing ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
              {t("addObservation")}
            </Button>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onInputChange} />

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {!showEmptyState ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">{t("readyCount", { count: submittableCount })}</p>
          <Button onClick={submit} disabled={submittableCount === 0 || isSubmitting || Boolean(disabledReason)}>
            {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {isSubmitting ? t("submitting") : t("submit", { count: submittableCount })}
          </Button>
        </div>
      ) : null}
    </ModalContent>
  );
}

function ObservationCard({
  item,
  disabled,
  canAddPhoto,
  onChange,
  onRemove,
  onRemovePhoto,
  onChangePhotoPart,
  onAddPhotos,
  onPickLocation,
  t,
}: {
  item: QuickItem;
  disabled: boolean;
  canAddPhoto: boolean;
  onChange: (patch: Partial<QuickItem>) => void;
  onRemove: () => void;
  onRemovePhoto: (photoId: string) => void;
  onChangePhotoPart: (photoId: string, subjectPart: string) => void;
  onAddPhotos: (fileList: FileList | null) => void;
  onPickLocation: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const identifying = item.status === "identifying";
  const uploading = item.status === "uploading";
  // A blank species is allowed (submitted as unidentified); show a gentle hint
  // rather than a validation warning.
  const unnamed = !isNamed(item.scientificName) && !identifying;
  const multiPhoto = item.photos.length > 1;

  return (
    <div className="relative rounded-2xl border border-border bg-card p-3">
      {uploading ? (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-background/60">
          <Loader2Icon className="size-5 animate-spin text-primary" />
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        disabled={disabled || uploading}
        aria-label={t("removeObservation")}
        className="absolute right-2 top-2 rounded-full text-muted-foreground hover:text-destructive"
      >
        <XIcon className="size-4" />
      </Button>

      <div className="space-y-3 pr-7">
        <div className="space-y-2">
          <div className="relative">
            <Input
              value={item.scientificName}
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
          {item.vernacularName ? (
            <p className="-mt-1 truncate text-xs text-muted-foreground">{item.vernacularName}</p>
          ) : unnamed ? (
            <p className="-mt-1 text-xs text-muted-foreground">{t("speciesOptionalHint")}</p>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="relative">
              <CalendarIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                value={item.eventDate}
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
              <MapPinIcon className={cn("size-4 shrink-0", item.location ? "text-primary" : "text-muted-foreground")} />
              <span className="truncate">
                {item.location ? t("locationSet", { lat: item.location.lat, lng: item.location.lng }) : t("setLocation")}
              </span>
            </Button>
          </div>

          <Textarea
            value={item.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            placeholder={t("notesPlaceholder")}
            disabled={disabled || uploading}
            aria-label={t("notesLabel")}
            rows={2}
            className="resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            {t("photosTitle", { count: item.photos.length })}
          </p>
          <div className="flex flex-wrap gap-2">
            {item.photos.map((photo, index) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                isCover={index === 0}
                showCoverBadge={multiPhoto && index === 0}
                showRemove={multiPhoto}
                disabled={disabled || uploading}
                onRemove={() => onRemovePhoto(photo.id)}
                onChangePart={(part) => onChangePhotoPart(photo.id, part)}
                t={t}
              />
            ))}
            {canAddPhoto ? (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={disabled || uploading}
                className="flex size-[92px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImagePlusIcon className="size-5" />
                <span className="px-1 text-center text-[10px] leading-tight">{t("addPhoto")}</span>
              </button>
            ) : null}
          </div>
        </div>

        {item.error ? <p className="text-xs text-destructive">{item.error}</p> : null}
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onAddPhotos(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function PhotoTile({
  photo,
  isCover,
  showCoverBadge,
  showRemove,
  disabled,
  onRemove,
  onChangePart,
  t,
}: {
  photo: QuickPhoto;
  isCover: boolean;
  showCoverBadge: boolean;
  showRemove: boolean;
  disabled: boolean;
  onRemove: () => void;
  onChangePart: (subjectPart: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="w-[92px] space-y-1">
      <div className={cn("relative aspect-square overflow-hidden rounded-xl bg-muted ring-1", isCover ? "ring-primary/40" : "ring-border")}>
        <Image src={photo.previewUrl} alt={t(`subjectParts.${photo.subjectPart}`)} fill sizes="92px" className="object-cover" unoptimized />
        {showCoverBadge ? (
          <span className="absolute left-1 top-1 rounded-md bg-background/85 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-foreground ring-1 ring-border">
            {t("coverBadge")}
          </span>
        ) : null}
        {showRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={t("remove")}
            className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-background/85 text-muted-foreground ring-1 ring-border transition-colors hover:text-destructive disabled:opacity-50"
          >
            <XIcon className="size-3" />
          </button>
        ) : null}
      </div>
      <Select value={photo.subjectPart} onValueChange={onChangePart} disabled={disabled}>
        <SelectTrigger className="h-7 w-full rounded-lg px-2 text-[11px]" aria-label={t("photoPartLabel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUBJECT_PARTS.map((part) => (
            <SelectItem key={part} value={part} className="text-xs">
              {t(`subjectParts.${part}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
