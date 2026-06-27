"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ImagePlusIcon,
  Loader2Icon,
  RefreshCcwIcon,
  ReplaceIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { manageApiHref, profileBasePath, type ManageTarget } from "@/lib/links";
import { canCreateRecord, canDeleteRecord, canUpdateRecord } from "../../../../_lib/cgs-permissions";
import { createRecord, deleteRecord, putRecord, uploadBlob } from "../../../../_lib/mutations";

const ATTACHMENT_COLLECTION = "org.hypercerts.context.attachment";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ERROR_MESSAGE = "flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75";

type ManagedProject = {
  kind: "project";
  id: string;
  did: string;
  rkey: string;
  atUri: string;
  cid: string | null;
  title: string;
  shortDescription: string | null;
  createdAt: string;
  imageUrl: string | null;
};

type GalleryContentItem = {
  id: string;
  index: number;
  kind: "blob" | "uri";
  url: string;
  mimeType: string | null;
  size: number | null;
  cid: string | null;
};

type ManagedGallery = {
  id: string;
  uri: string;
  rkey: string;
  cid: string;
  title: string | null;
  shortDescription: string | null;
  createdAt: string | null;
  projectUri: string;
  projectCid: string | null;
  images: GalleryContentItem[];
  rawRecord: Record<string, unknown>;
};

type GalleryResponse = {
  project: ManagedProject;
  galleries: ManagedGallery[];
};

type UploadBlobResult = {
  ref?: unknown;
  mimeType?: unknown;
  size?: unknown;
  blob?: unknown;
};

type SmallBlobContent = {
  $type: "org.hypercerts.defs#smallBlob";
  blob: {
    $type: "blob";
    ref: unknown;
    mimeType: string;
    size: number;
  };
};

type UriContent = { $type: "org.hypercerts.defs#uri"; uri: string };
type GalleryContent = SmallBlobContent | UriContent;

type PendingAction =
  | { type: "upload" }
  | { type: "delete"; id: string }
  | { type: "replace"; id: string }
  | null;

type UploadProgress = { current: number; total: number } | null;

type GalleryImageWithGallery = GalleryContentItem & { gallery: ManagedGallery };

export function ProjectGalleryManagerClient({ target, projectRkey }: { target: ManageTarget; projectRkey: string }) {
  const [data, setData] = useState<GalleryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modal = useModal();
  const createPermission = canCreateRecord(target);
  const updatePermission = canUpdateRecord(target);
  const deletePermission = canDeleteRecord(target);
  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;

  const loadGallery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(manageApiHref(`/api/manage/projects/${encodeURIComponent(projectRkey)}/gallery`, target), { cache: "no-store" });
      const result = (await response.json()) as GalleryResponse | { error?: string };
      if (!response.ok || !("project" in result)) {
        const message = "error" in result ? result.error : null;
        setError(message ?? "Failed to load project gallery.");
        setData(null);
        return;
      }
      setData(result);
    } catch {
      setError("Could not reach the server.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectRkey, target]);

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  const images = useMemo<GalleryImageWithGallery[]>(
    () => data?.galleries.flatMap((gallery) => gallery.images.map((image) => ({ ...image, gallery }))) ?? [],
    [data?.galleries],
  );

  const canAppendToExisting = updatePermission.allowed;
  const canCreateNewGallery = createPermission.allowed;
  const uploadDisabledReason = !data?.project.cid
    ? "We couldn't prepare this gallery yet. Refresh the page and try again."
    : canAppendToExisting || canCreateNewGallery
      ? null
      : createPermission.reason ?? updatePermission.reason ?? "You cannot add gallery images.";

  function onFilesChanged(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";
    void handleUpload(files);
  }

  async function handleUpload(files: File[]) {
    if (!data) return;
    if (uploadDisabledReason) {
      setError(uploadDisabledReason);
      return;
    }

    if (files.length === 0) return;

    try {
      setPending({ type: "upload" });
      setUploadProgress({ current: 0, total: files.length });
      setError(null);

      for (const file of files) validateImageFile(file);

      const content: GalleryContent[] = [];
      for (const [index, file] of files.entries()) {
        setUploadProgress({ current: index + 1, total: files.length });
        const uploaded = await uploadBlob(file, repoOptions);
        content.push(toBlobContent(uploaded, file));
      }

      await appendImages(data.project, data.galleries, content);
      await loadGallery();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to add gallery images.");
    } finally {
      setPending(null);
      setUploadProgress(null);
    }
  }

  async function appendImages(project: ManagedProject, galleries: ManagedGallery[], content: GalleryContent[]) {
    const existingGallery = galleries.find((gallery) => gallery.images.length > 0) ?? galleries[0] ?? null;
    if (existingGallery && canAppendToExisting) {
      const record = normalizeGalleryRecord(existingGallery.rawRecord, project);
      record.content = [...recordContent(record), ...content];
      await putRecord(ATTACHMENT_COLLECTION, existingGallery.rkey, record, {
        ...(existingGallery.cid ? { swapRecord: existingGallery.cid } : {}),
        ...(repoOptions ?? {}),
      });
      return;
    }

    if (!canCreateNewGallery) {
      throw new Error(createPermission.reason ?? "You cannot create a gallery for this project.");
    }
    if (!project.cid) throw new Error("We couldn't prepare this gallery yet. Refresh the page and try again.");

    await createRecord(ATTACHMENT_COLLECTION, buildNewGalleryRecord(project, content), undefined, repoOptions);
  }

  async function performDeleteImage(gallery: ManagedGallery, image: GalleryContentItem) {
    if (!deletePermission.allowed) {
      throw new Error(deletePermission.reason ?? "You cannot delete this gallery image.");
    }
    if (!data) throw new Error("Gallery could not be loaded. Refresh the page and try again.");

    try {
      setPending({ type: "delete", id: image.id });
      setError(null);
      const record = normalizeGalleryRecord(gallery.rawRecord, data.project);
      const nextContent = recordContent(record).filter((_, index) => index !== image.index);
      if (nextContent.length === 0) {
        await deleteRecord(ATTACHMENT_COLLECTION, gallery.rkey, repoOptions);
      } else {
        record.content = nextContent;
        await putRecord(ATTACHMENT_COLLECTION, gallery.rkey, record, {
          ...(gallery.cid ? { swapRecord: gallery.cid } : {}),
          ...(repoOptions ?? {}),
        });
      }
      await loadGallery();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Failed to delete gallery image.";
      setError(message);
      throw new Error(message);
    } finally {
      setPending(null);
    }
  }

  function confirmDeleteImage(gallery: ManagedGallery, image: GalleryContentItem, imageNumber: number) {
    if (!deletePermission.allowed) {
      setError(deletePermission.reason ?? "You cannot delete this gallery image.");
      return;
    }

    modal.pushModal(
      {
        id: `delete-gallery-image-${image.id}`,
        content: (
          <DeleteGalleryImageModal
            imageNumber={imageNumber}
            projectTitle={data?.project.title ?? "this project"}
            onConfirm={() => performDeleteImage(gallery, image)}
          />
        ),
      },
      true,
    );
    void modal.show();
  }

  async function replaceImage(gallery: ManagedGallery, image: GalleryContentItem, file: File | null) {
    if (!file) return;
    if (!updatePermission.allowed) {
      setError(updatePermission.reason ?? "You cannot update this gallery image.");
      return;
    }
    if (!data) return;

    try {
      setPending({ type: "replace", id: image.id });
      setError(null);
      validateImageFile(file);
      const uploaded = await uploadBlob(file, repoOptions);
      const record = normalizeGalleryRecord(gallery.rawRecord, data.project);
      const nextContent = recordContent(record).map((item, index) => index === image.index ? toBlobContent(uploaded, file) : item);
      record.content = nextContent;
      await putRecord(ATTACHMENT_COLLECTION, gallery.rkey, record, {
        ...(gallery.cid ? { swapRecord: gallery.cid } : {}),
        ...(repoOptions ?? {}),
      });
      await loadGallery();
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : "Failed to replace gallery image.");
    } finally {
      setPending(null);
    }
  }

  const project = data?.project ?? null;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`${profileBasePath(target)}/projects`}>
            <ArrowLeftIcon className="size-4" />
            Projects
          </Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void loadGallery()} disabled={loading || pending !== null}>
          <RefreshCcwIcon className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <GallerySkeleton />
      ) : error && !project ? (
        <ErrorState message={error} onRetry={() => void loadGallery()} />
      ) : project ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-3xl">
              <h1 className="font-instrument text-3xl font-light italic tracking-[-0.03em] text-foreground sm:text-5xl">
                {project.title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This is the image gallery for this project. Add, replace, or remove photos that should appear on the organization gallery.
              </p>
            </div>
            <div className="shrink-0">
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onFilesChanged} className="sr-only" />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(uploadDisabledReason) || pending !== null}
                title={uploadDisabledReason ?? undefined}
              >
                {pending?.type === "upload" ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
                Add images
              </Button>
            </div>
          </div>

          {uploadProgress ? <UploadProgressBar progress={uploadProgress} /> : null}

          {error ? (
            <div className="flex items-center gap-2 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-foreground">
              <TriangleAlertIcon className="size-4 text-warn" />
              {error}
            </div>
          ) : null}

          {images.length === 0 ? (
            <EmptyGallery />
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" role="list">
              {images.map(({ gallery, ...image }, index) => (
                <GalleryImageTile
                  key={image.id}
                  image={image}
                  gallery={gallery}
                  index={index}
                  projectTitle={project.title}
                  pending={pending}
                  canUpdate={updatePermission.allowed}
                  canDelete={deletePermission.allowed}
                  updateDisabledReason={updatePermission.reason}
                  deleteDisabledReason={deletePermission.reason}
                  onReplace={(file) => replaceImage(gallery, image, file)}
                  onDelete={() => confirmDeleteImage(gallery, image, index + 1)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GalleryImageTile({
  image,
  gallery,
  index,
  projectTitle,
  pending,
  canUpdate,
  canDelete,
  updateDisabledReason,
  deleteDisabledReason,
  onReplace,
  onDelete,
}: {
  image: GalleryContentItem;
  gallery: ManagedGallery;
  index: number;
  projectTitle: string;
  pending: PendingAction;
  canUpdate: boolean;
  canDelete: boolean;
  updateDisabledReason: string | null;
  deleteDisabledReason: string | null;
  onReplace: (file: File | null) => void | Promise<void>;
  onDelete: () => void;
}) {
  void gallery;
  const [actionLabel, setActionLabel] = useState<string | null>(null);
  const replacing = pending?.type === "replace" && pending.id === image.id;
  const deleting = pending?.type === "delete" && pending.id === image.id;
  const disabled = pending !== null;

  return (
    <li className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
      <Image
        src={image.url}
        alt={`${projectTitle} gallery image ${index + 1}`}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 180px"
        unoptimized
        className="object-cover transition duration-500 group-hover:scale-105 group-hover:brightness-[0.55]"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="flex items-center gap-2">
          <label
            className={cn(
              "grid size-10 cursor-pointer place-items-center rounded-full bg-white/92 text-foreground shadow-lg backdrop-blur transition hover:bg-white focus-within:ring-2 focus-within:ring-primary/60",
              (!canUpdate || disabled) && "pointer-events-none opacity-50",
            )}
            title={updateDisabledReason ?? "Replace image"}
            onMouseEnter={() => setActionLabel("Replace image")}
            onMouseLeave={() => setActionLabel(null)}
            onFocus={() => setActionLabel("Replace image")}
            onBlur={() => setActionLabel(null)}
          >
            {replacing ? <Loader2Icon className="size-4 animate-spin" /> : <ReplaceIcon className="size-4" />}
            <span className="sr-only">Replace image</span>
            <input
              type="file"
              accept="image/*"
              disabled={!canUpdate || disabled}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.currentTarget.value = "";
                void onReplace(file);
              }}
              className="sr-only"
            />
          </label>
          <button
            type="button"
            disabled={!canDelete || disabled}
            title={deleteDisabledReason ?? "Delete image"}
            onMouseEnter={() => setActionLabel("Delete image")}
            onMouseLeave={() => setActionLabel(null)}
            onFocus={() => setActionLabel("Delete image")}
            onBlur={() => setActionLabel(null)}
            onClick={onDelete}
            className="grid size-10 place-items-center rounded-full bg-white/92 text-destructive shadow-lg backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:pointer-events-none disabled:opacity-50"
          >
            {deleting ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
            <span className="sr-only">Delete image</span>
          </button>
        </div>
        <div className="min-h-6 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white shadow-sm backdrop-blur">
          {actionLabel ?? `Image ${index + 1}`}
        </div>
      </div>
    </li>
  );
}

function UploadProgressBar({ progress }: { progress: NonNullable<UploadProgress> }) {
  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm" role="status" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">Uploading {progress.current} of {progress.total}</span>
        <span className="text-xs text-muted-foreground">{percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function DeleteGalleryImageModal({
  imageNumber,
  projectTitle,
  onConfirm,
}: {
  imageNumber: number;
  projectTitle: string;
  onConfirm: () => Promise<void>;
}) {
  const modal = useModal();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = async () => {
    await modal.hide();
    modal.popModal();
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      await close();
    } catch (deleteImageError) {
      setError(deleteImageError instanceof Error ? deleteImageError.message : "Image could not be deleted.");
      setPending(false);
    }
  };

  return (
    <ModalContent dismissible={!pending} className="space-y-4">
      <ModalHeader>
        <ModalTitle>Delete image?</ModalTitle>
        <ModalDescription>
          This will remove image {imageNumber} from the gallery for “{projectTitle}”. This action cannot be undone.
        </ModalDescription>
      </ModalHeader>
      {error ? (
        <p className={ERROR_MESSAGE}>
          <TriangleAlertIcon className="size-3.5 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void close()}>Cancel</Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => void confirm()}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          Delete image
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

function validateImageFile(file: File) {
  if (!file.type.toLowerCase().startsWith("image/")) throw new Error(`${file.name} is not an image.`);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is larger than 10 MB.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toBlobContent(uploaded: UploadBlobResult, file: File): SmallBlobContent {
  const raw = isRecord(uploaded.blob) ? uploaded.blob : uploaded;
  if (!("ref" in raw) || raw.ref === undefined || raw.ref === null) throw new Error("We could not upload this image. Please try again.");
  return {
    $type: "org.hypercerts.defs#smallBlob",
    blob: {
      $type: "blob",
      ref: raw.ref,
      mimeType: typeof raw.mimeType === "string" ? raw.mimeType : file.type || "application/octet-stream",
      size: typeof raw.size === "number" ? raw.size : file.size,
    },
  };
}

function buildNewGalleryRecord(project: ManagedProject, content: GalleryContent[]): Record<string, unknown> {
  if (!project.cid) throw new Error("We couldn't prepare this gallery yet. Refresh the page and try again.");
  return {
    $type: ATTACHMENT_COLLECTION,
    title: `${project.title} gallery`,
    contentType: "gallery",
    subjects: [{ $type: "com.atproto.repo.strongRef", uri: project.atUri, cid: project.cid }],
    content,
    createdAt: new Date().toISOString(),
  };
}

function normalizeGalleryRecord(record: Record<string, unknown>, project: ManagedProject): Record<string, unknown> {
  const normalized = { ...record };
  normalized.$type = ATTACHMENT_COLLECTION;
  normalized.title = typeof normalized.title === "string" && normalized.title.trim() ? normalized.title : `${project.title} gallery`;
  normalized.contentType = "gallery";
  normalized.createdAt = typeof normalized.createdAt === "string" ? normalized.createdAt : new Date().toISOString();
  if (!Array.isArray(normalized.subjects) && project.cid) {
    normalized.subjects = [{ $type: "com.atproto.repo.strongRef", uri: project.atUri, cid: project.cid }];
  }
  normalized.content = recordContent(normalized);
  return normalized;
}

function recordContent(record: Record<string, unknown>): GalleryContent[] {
  return Array.isArray(record.content) ? record.content.filter(isGalleryContent) : [];
}

function isGalleryContent(value: unknown): value is GalleryContent {
  if (!isRecord(value)) return false;
  return value.$type === "org.hypercerts.defs#smallBlob" || value.$type === "org.hypercerts.defs#uri";
}

function GallerySkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-28 rounded-3xl" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}
      </div>
    </div>
  );
}

function EmptyGallery() {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-[2rem] border border-dashed border-border bg-muted/20 px-6 text-center">
      <ImagePlusIcon className="mb-4 size-10 text-primary" />
      <h2 className="font-instrument text-2xl font-light italic tracking-[-0.02em] text-foreground">No gallery images yet</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Add the first image to start showing this project in the organization gallery.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-[2rem] bg-muted/30 px-6 text-center">
      <TriangleAlertIcon className="mb-4 size-9 text-muted-foreground opacity-70" />
      <h2 className="font-instrument text-2xl font-medium italic tracking-[-0.02em]">Could not load gallery</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-5">
        Retry
      </Button>
    </div>
  );
}
