"use client";

import { useId, useState, type ChangeEvent } from "react";
import { FileSpreadsheetIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ATTACHMENT_MAX_FILE_BYTES, type AttachmentDraft } from "../contextAttachmentMutations";
import { formatFileSize } from "./fileUtils";
import { OptionalNote } from "./OptionalNote";
import { SubmitButton } from "./SubmitButton";
import { CONTENT_TYPE_NATURE_OBSERVATIONS, type EvidenceSubmitter } from "./types";

/**
 * Upload a raw observations spreadsheet (CSV) as a single biodiversity
 * attachment, instead of expanding it into thousands of occurrence records.
 * Reuses the EvidenceAdder's draft pipeline, so the file is uploaded as a blob,
 * tagged as biodiversity evidence, and linked to the activity automatically.
 */
export function NatureCsvUpload({
  isSubmitting,
  submitDrafts,
}: {
  isSubmitting: boolean;
  submitDrafts: EvidenceSubmitter;
}) {
  const t = useTranslations("bumicert.detail.evidenceAdder.biodiversity.csvUpload");
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!picked) return;
    const isCsv = picked.type === "text/csv" || /\.csv$/i.test(picked.name);
    if (!isCsv) {
      setError(t("notCsv"));
      return;
    }
    if (picked.size > ATTACHMENT_MAX_FILE_BYTES) {
      setError(t("tooLarge", { maxSize: formatFileSize(ATTACHMENT_MAX_FILE_BYTES) }));
      return;
    }
    setError(null);
    setFile(picked);
  }

  function submit() {
    if (!file) return;
    const draft: AttachmentDraft = {
      title: file.name,
      contentType: CONTENT_TYPE_NATURE_OBSERVATIONS,
      contents: [file],
      note,
    };
    submitDrafts([draft], () => {
      setFile(null);
      setNote("");
      setError(null);
    });
  }

  return (
    <section className="grid gap-3">
      <div>
        <p className="text-sm font-medium text-foreground">{t("title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
      </div>

      {file ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <FileSpreadsheetIcon className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 rounded-full"
            aria-label={t("remove")}
            disabled={isSubmitting}
            onClick={() => setFile(null)}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "grid min-h-[96px] cursor-pointer place-items-center rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-5 text-center transition-colors hover:border-primary/40",
            isSubmitting && "pointer-events-none opacity-70",
          )}
        >
          <span>
            <FileSpreadsheetIcon className="mx-auto size-6 text-muted-foreground" />
            <span className="mt-2 block text-sm font-medium text-foreground">{t("choose")}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{t("hint")}</span>
          </span>
          <input
            id={inputId}
            type="file"
            className="sr-only"
            accept=".csv,text/csv"
            disabled={isSubmitting}
            onChange={onPick}
          />
        </label>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <OptionalNote value={note} onChange={setNote} disabled={isSubmitting} />
      <SubmitButton count={file ? 1 : 0} isSubmitting={isSubmitting} onClick={submit} />
    </section>
  );
}
