"use client";

import Image from "next/image";
import { useCallback, useId, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useTranslations } from "next-intl";
import {
  ImagePlusIcon,
  Loader2Icon,
  TriangleAlertIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ManageTarget } from "@/lib/links";
import type { ProjectImageGallery } from "../../_lib/indexer";
import { canCreateRecord } from "../../(manage)/manage/_lib/cgs-permissions";
import { createRecord, uploadBlob } from "../../(manage)/manage/_lib/mutations";

const ATTACHMENT_COLLECTION = "org.hypercerts.context.attachment";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const NO_PROJECT_VALUE = "__none__";

export type GalleryProjectOption = { uri: string; cid: string | null; title: string };

type PendingFile = { id: string; file: File; previewUrl: string };

type UploadBlobResult = { ref?: unknown; mimeType?: unknown; size?: unknown; blob?: unknown };

type SmallBlobContent = {
  $type: "org.hypercerts.defs#smallBlob";
  blob: { $type: "blob"; ref: unknown; mimeType: string; size: number };
};

export function AccountGalleryUploader({
  target,
  projects,
  accountName,
  onUploaded,
}: {
  target: ManageTarget;
  projects: GalleryProjectOption[];
  accountName: string;
  onUploaded: (gallery: ProjectImageGallery) => void;
}) {
  const t = useTranslations("common.projectGallery.upload");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [projectValue, setProjectValue] = useState<string>(NO_PROJECT_VALUE);
  const [isDragOver, setIsDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const permission = canCreateRecord(target);
  const repoOptions = target.kind === "group" ? { repo: target.did } : undefined;
  const canUpload = permission.allowed;

  const addFiles = useCallback(
    (files: File[]) => {
      setError(null);
      const accepted: PendingFile[] = [];
      for (const file of files) {
        if (!file.type.toLowerCase().startsWith("image/")) {
          setError(t("errorNotImage", { name: file.name }));
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setError(t("errorTooLarge", { name: file.name }));
          continue;
        }
        accepted.push({ id: `${file.name}-${file.size}-${crypto.randomUUID()}`, file, previewUrl: URL.createObjectURL(file) });
      }
      if (accepted.length > 0) setPendingFiles((prev) => [...prev, ...accepted]);
    },
    [t],
  );

  function removeFile(id: string) {
    setPendingFiles((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const removed = prev.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!canUpload || busy) return;
    setIsDragOver(true);
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (!canUpload || busy) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) addFiles(files);
  }

  async function handleSubmit() {
    if (pendingFiles.length === 0 || busy) return;
    if (!canUpload) {
      setError(t("permissionDenied"));
      return;
    }

    const selectedProject = projectValue === NO_PROJECT_VALUE
      ? null
      : projects.find((project) => project.uri === projectValue) ?? null;

    try {
      setBusy(true);
      setError(null);
      setProgress({ current: 0, total: pendingFiles.length });

      const content: SmallBlobContent[] = [];
      for (const [index, item] of pendingFiles.entries()) {
        setProgress({ current: index + 1, total: pendingFiles.length });
        const uploaded = await uploadBlob(item.file, repoOptions);
        content.push(toBlobContent(uploaded, item.file));
      }

      const title = selectedProject
        ? t("recordTitleProject", { projectTitle: selectedProject.title })
        : t("recordTitleAccount", { name: accountName });

      const record: Record<string, unknown> = {
        $type: ATTACHMENT_COLLECTION,
        title,
        contentType: "gallery",
        content,
        createdAt: new Date().toISOString(),
      };
      if (selectedProject?.cid) {
        record.subjects = [{ $type: "com.atproto.repo.strongRef", uri: selectedProject.uri, cid: selectedProject.cid }];
      }

      const created = await createRecord(ATTACHMENT_COLLECTION, record, undefined, repoOptions);

      const gallery: ProjectImageGallery = {
        id: created.uri,
        attachmentUri: created.uri,
        attachmentTitle: title,
        shortDescription: null,
        createdAt: new Date().toISOString(),
        projectUri: selectedProject?.uri ?? null,
        projectCid: selectedProject?.cid ?? null,
        projectTitle: selectedProject?.title ?? null,
        images: pendingFiles.map((item, index) => ({
          id: `${created.uri}#local-${index}`,
          url: item.previewUrl,
          mimeType: item.file.type || null,
          size: item.file.size,
          cid: null,
          attachmentUri: created.uri,
          projectUri: selectedProject?.uri ?? null,
        })),
      };

      onUploaded(gallery);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("errorGeneric"));
      setBusy(false);
      setProgress(null);
    }
  }

  const percentage = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <section className="py-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ImagePlusIcon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-foreground">{t("title")}</h2>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{t("body")}</p>
          </div>
          {canUpload ? (
            <Button type="button" size="sm" variant={expanded ? "outline" : "default"} onClick={() => setExpanded((open) => !open)} disabled={busy}>
              {expanded ? t("close") : t("open")}
            </Button>
          ) : null}
        </div>

        {!canUpload ? (
          <p className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface px-4 py-3 text-center text-sm text-muted-foreground">
            <TriangleAlertIcon className="size-4 shrink-0 text-warn" />
            {t("permissionDenied")}
          </p>
        ) : expanded ? (
          <>
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              aria-disabled={busy}
              onClick={() => !busy && fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (busy) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={cn(
                "mt-3 flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-6 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                isDragOver ? "border-primary bg-primary/[0.06]" : "border-border-soft bg-surface/70 hover:border-primary/50",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <UploadCloudIcon className="size-6 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">{isDragOver ? t("dropActive") : t("dropHint")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("fileHint")}</p>
              </div>
              <input
                ref={fileInputRef}
                id={inputId}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.currentTarget.value = "";
                  addFiles(files);
                }}
              />
            </div>

            {pendingFiles.length > 0 ? (
              <ul role="list" className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {pendingFiles.map((item, index) => (
                  <li key={item.id} className="group relative aspect-square overflow-hidden rounded-lg bg-surface-sunken">
                    <Image src={item.previewUrl} alt={t("previewAlt", { index: index + 1 })} fill sizes="120px" unoptimized className="object-cover" />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeFile(item.id)}
                      aria-label={t("removeImage", { index: index + 1 })}
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none"
                    >
                      <XIcon className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {projects.length > 0 ? (
              <div className="mt-5">
                <label htmlFor={`${inputId}-project`} className="block text-sm font-medium text-foreground">
                  {t("linkLabel")}
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("linkHelp")}</p>
                <Select value={projectValue} onValueChange={setProjectValue} disabled={busy}>
                  <SelectTrigger id={`${inputId}-project`} className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT_VALUE}>{t("noProject")}</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.uri} value={project.uri}>{project.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {progress ? (
              <div className="mt-4 rounded-2xl border border-border-soft bg-surface px-4 py-3" role="status" aria-live="polite">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">{t("progress", { current: progress.current, total: progress.total })}</span>
                  <span className="text-xs text-muted-foreground">{percentage}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${percentage}%` }} />
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 flex items-center gap-2 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-foreground">
                <TriangleAlertIcon className="size-4 shrink-0 text-warn" />
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex items-center justify-center">
              <Button type="button" onClick={() => void handleSubmit()} disabled={pendingFiles.length === 0 || busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
                {busy ? t("submitting") : t("submit", { count: pendingFiles.length })}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toBlobContent(uploaded: UploadBlobResult, file: File): SmallBlobContent {
  const raw = isRecord(uploaded.blob) ? uploaded.blob : uploaded;
  if (!("ref" in raw) || raw.ref === undefined || raw.ref === null) {
    throw new Error("upload-failed");
  }
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
