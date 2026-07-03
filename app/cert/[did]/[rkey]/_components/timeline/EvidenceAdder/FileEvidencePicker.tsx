"use client";

import { useId, useState } from "react";
import { PaperclipIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_MAX_FILE_BYTES,
  type AttachmentDraft,
} from "../contextAttachmentMutations";
import {
  getFilePickerEvidenceContentTypeOptions,
  type FilePickerEvidenceContentType,
} from "../shared/evidenceContentTypeRegistry";
import { formatFileSize, toFileKey } from "./fileUtils";
import { SubmitButton } from "./SubmitButton";
import type { EvidenceSubmitter } from "./types";

const FILE_CONTENT_TYPE_OPTIONS = getFilePickerEvidenceContentTypeOptions();

export function FileEvidencePicker({
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
  const [selectedContentType, setSelectedContentType] =
    useState<FilePickerEvidenceContentType>("document");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const inputId = useId();
  const contentTypeLabelId = useId();
  const externalLinkInputId = useId();
  const externalLinkHelpId = `${externalLinkInputId}-help`;
  const contentTypeLabels: Record<FilePickerEvidenceContentType, string> = {
    document: evidenceT("contentTypes.document"),
    report: evidenceT("contentTypes.report"),
    audit: evidenceT("contentTypes.audit"),
    evidence: evidenceT("contentTypes.evidence"),
    testimonial: evidenceT("contentTypes.testimonial"),
    methodology: evidenceT("contentTypes.methodology"),
    photo: evidenceT("contentTypes.photo"),
    video: evidenceT("contentTypes.video"),
    dataset: evidenceT("contentTypes.dataset"),
    certificate: evidenceT("contentTypes.certificate"),
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
        if (!seen.has(key)) {
          next.push(file);
          seen.add(key);
        }
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
      setLinks((current) =>
        current.includes(normalized) ? current : [...current, normalized],
      );
      setLinkInput("");
    } catch {
      setLinkError(evidenceT("invalidUrl"));
    }
  }

  const title =
    contentTypeLabels[selectedContentType] ?? evidenceT("contentTypes.evidence");
  const draft: AttachmentDraft = {
    title: captionTitle ?? title,
    contentType: selectedContentType,
    contents: [...files, ...links],
    note: caption,
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <label id={contentTypeLabelId} className="text-sm font-medium">
            {evidenceT("contentType")}
          </label>
          <Select
            value={selectedContentType}
            onValueChange={(value) =>
              setSelectedContentType(value as FilePickerEvidenceContentType)
            }
            disabled={isSubmitting}
          >
            <SelectTrigger aria-labelledby={contentTypeLabelId}>
              <SelectValue placeholder={evidenceT("selectContentType")} />
            </SelectTrigger>
            <SelectContent>
              {FILE_CONTENT_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {contentTypeLabels[option.value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label
          htmlFor={inputId}
          className={cn(
            "grid min-h-[120px] cursor-pointer place-items-center rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center transition-colors hover:border-primary/40",
            isSubmitting && "pointer-events-none opacity-70",
          )}
        >
          <span>
            <PaperclipIcon className="mx-auto h-6 w-6 text-muted-foreground" />
            <span className="mt-2 block text-sm font-medium text-foreground">
              {evidenceT("addFilePlaceholder")}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {evidenceT("fileHelp", {
                maxSize: formatFileSize(ATTACHMENT_MAX_FILE_BYTES),
              })}
            </span>
          </span>
          <input
            id={inputId}
            type="file"
            className="sr-only"
            multiple
            accept="image/*,audio/*,video/*,application/*,text/*"
            disabled={isSubmitting}
            onChange={(event) => {
              appendFileList(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={externalLinkInputId} className="text-sm font-medium">
            {evidenceT("externalLink")}
          </label>
          <div className="flex gap-2">
            <Input
              id={externalLinkInputId}
              value={linkInput}
              placeholder={evidenceT("externalLinkPlaceholder")}
              disabled={isSubmitting}
              aria-invalid={linkError ? true : undefined}
              aria-describedby={externalLinkHelpId}
              onChange={(event) => setLinkInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!isSubmitting) addLink();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addLink}
              disabled={isSubmitting || linkInput.trim().length === 0}
            >
              {evidenceT("addLink")}
            </Button>
          </div>
          <p
            id={externalLinkHelpId}
            className={cn("text-xs", linkError ? "text-destructive" : "text-muted-foreground")}
          >
            {linkError ?? evidenceT("externalLinkHelp")}
          </p>
        </div>

        {files.length > 0 || links.length > 0 ? (
          <div className="grid gap-2">
            {files.map((file) => {
              const key = toFileKey(file);
              return (
                <SelectedItem
                  key={key}
                  title={file.name}
                  detail={`${formatFileSize(file.size)}${file.type ? ` · ${file.type}` : ""}`}
                  onRemove={() =>
                    setFiles((current) =>
                      current.filter((item) => toFileKey(item) !== key),
                    )
                  }
                  disabled={isSubmitting}
                  removeLabel={evidenceT("removeFile", { name: file.name })}
                />
              );
            })}
            {links.map((link) => (
              <SelectedItem
                key={link}
                title={evidenceT("externalLink")}
                detail={link}
                onRemove={() =>
                  setLinks((current) => current.filter((item) => item !== link))
                }
                disabled={isSubmitting}
                removeLabel={evidenceT("removeExternalLink")}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
            {evidenceT("noFilesSelected")}
          </div>
        )}
      </div>

      <SubmitButton
        count={files.length + links.length}
        isSubmitting={isSubmitting}
        onClick={() =>
          submitDrafts(draft, () => {
            setFiles([]);
            setLinks([]);
            setLinkInput("");
          })
        }
      />
    </>
  );
}

function SelectedItem({
  title,
  detail,
  onRemove,
  disabled,
  removeLabel,
}: {
  title: string;
  detail: string;
  onRemove: () => void;
  disabled?: boolean;
  removeLabel: string;
}) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <button
        type="button"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel}
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
