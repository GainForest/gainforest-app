"use client";

import { useId, useState, type DragEvent } from "react";
import { ImageIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_MAX_FILE_BYTES,
  type AttachmentDraft,
} from "../contextAttachmentMutations";
import { formatFileSize, toFileKey } from "./fileUtils";
import { SubmitButton } from "./SubmitButton";
import type { EvidenceSubmitter } from "./types";

export function ImageEvidencePicker({
  caption,
  captionTitle,
  isSubmitting,
  submitDrafts,
}: {
  caption: string;
  captionTitle: string | null;
  isSubmitting: boolean;
  submitDrafts: EvidenceSubmitter;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  function appendFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const images = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    setFiles((current) => {
      const next = [...current];
      const seen = new Set(current.map(toFileKey));
      for (const file of images) {
        const key = toFileKey(file);
        if (!seen.has(key)) {
          next.push(file);
          seen.add(key);
        }
      }
      return next;
    });
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (isSubmitting) return;
    appendFiles(event.dataTransfer.files);
  }

  const draft: AttachmentDraft = {
    title: captionTitle ?? evidenceT("attachmentTitles.images"),
    contentType: "photo",
    contents: files,
    note: caption,
  };

  return (
    <>
      <label
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "grid min-h-[120px] cursor-pointer place-items-center rounded-2xl border border-dashed border-border/70 bg-background px-4 py-6 text-center transition-colors hover:border-primary/40",
          isDragging && "border-primary bg-primary/5",
          isSubmitting && "pointer-events-none opacity-70",
        )}
      >
        <span>
          <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground" />
          <span className="mt-2 block text-sm font-medium text-foreground">
            {evidenceT("addImagePlaceholder")}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {evidenceT("imageHelp", {
              maxSize: formatFileSize(ATTACHMENT_MAX_FILE_BYTES),
            })}
          </span>
        </span>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          multiple
          accept="image/*"
          disabled={isSubmitting}
          onChange={(event) => {
            appendFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {files.length > 0 ? (
        <div className="grid gap-2">
          {files.map((file) => {
            const key = toFileKey(file);
            return (
              <div key={key} className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                <ImageIcon className="h-4 w-4 shrink-0 text-primary/70" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 rounded-full"
                  aria-label={evidenceT("removeFile", { name: file.name })}
                  disabled={isSubmitting}
                  onClick={() =>
                    setFiles((current) => current.filter((item) => toFileKey(item) !== key))
                  }
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      <SubmitButton
        count={files.length}
        isSubmitting={isSubmitting}
        onClick={() =>
          submitDrafts(draft, () => {
            setFiles([]);
          })
        }
      />
    </>
  );
}
