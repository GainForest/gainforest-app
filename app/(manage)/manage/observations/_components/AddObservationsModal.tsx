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
  ShieldCheckIcon,
  SparklesIcon,
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
const MAX_PHOTOS = 20;
const ANALYZE_ATTEMPTS = 2;
const UNIDENTIFIED = "unidentified organism";

type ItemStatus = "identifying" | "ready" | "uploading" | "uploaded" | "error";

type QuickItem = {
  id: string;
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

function canSubmitItem(item: QuickItem): boolean {
  // A species name is optional — nameless photos are submitted as unidentified
  // observations. Only a date is required (it auto-fills from EXIF/file).
  return item.eventDate.trim().length > 0 && item.status !== "uploaded";
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

  const patchItem = useCallback((id: string, patch: Partial<QuickItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
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

  function removeItem(id: string) {
    setItems((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
    setError(null);
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
    // Resolve the location into Darwin Core fields, swapping the precise pin for
    // a randomised circle when the observer opted to keep their location private.
    const locationFields = item.location
      ? buildObservationLocationFields(item.location, {
          obscure: obscureLocation,
          radiusMeters: radiusForArea(fuzzyArea),
        })
      : { decimalLatitude: "", decimalLongitude: "" };
    const occurrence = await createObservationOccurrence({
      basisOfRecord: "MachineObservation",
      scientificName: item.scientificName.trim(),
      vernacularName: item.vernacularName.trim(),
      kingdom: item.kingdom.trim() || "Plantae",
      eventDate: item.eventDate.trim(),
      occurrenceRemarks: item.notes.trim(),
      associatedMedia: item.file.name,
      ...locationFields,
      ...(projectRef ? { projectRef } : {}),
    });
    let primaryBlobRef: ObservationBlobRef | null = null;
    const photo = await createObservationPhoto({
      imageFile: item.file,
      occurrenceRef: occurrence.uri,
      subjectPart: "wholeOrganism",
      caption: item.caption.trim() || undefined,
    });
    if (photo.blobRef) primaryBlobRef = photo.blobRef;
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
          if (uploaded) URL.revokeObjectURL(uploaded.previewUrl);
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
                onChange={(patch) => patchItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
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
  onChange,
  onRemove,
  onPickLocation,
  t,
}: {
  item: QuickItem;
  disabled: boolean;
  onChange: (patch: Partial<QuickItem>) => void;
  onRemove: () => void;
  onPickLocation: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const identifying = item.status === "identifying";
  const uploading = item.status === "uploading";
  // A blank species is allowed (submitted as unidentified); show a gentle hint
  // rather than a validation warning.
  const unnamed = !isNamed(item.scientificName) && !identifying;

  return (
    <div className="relative flex gap-3 rounded-2xl border border-border bg-card p-3">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
        <Image src={item.previewUrl} alt={item.caption} fill sizes="80px" className="object-cover" unoptimized />
        {uploading ? (
          <div className="absolute inset-0 grid place-items-center bg-background/60">
            <Loader2Icon className="size-5 animate-spin text-primary" />
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
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

        {item.error ? <p className="text-xs text-destructive">{item.error}</p> : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        disabled={disabled || uploading}
        aria-label={t("remove")}
        className="absolute right-2 top-2 rounded-full text-muted-foreground hover:text-destructive"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
