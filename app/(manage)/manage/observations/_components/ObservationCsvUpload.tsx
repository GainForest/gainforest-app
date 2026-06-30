"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Papa from "papaparse";
import { useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  InfoIcon,
  Loader2Icon,
  RulerIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalHeader, ModalTitle, ModalDescription } from "@/components/ui/modal/modal";
import { cn } from "@/lib/utils";
import type { ManageTarget } from "@/lib/links";
import { canCreateRecord } from "../../_lib/cgs-permissions";
import { autoDetectMappings, mappingsCoverRequiredFields } from "../../_lib/upload/column-mapper";
import type { ColumnMapping } from "../../_lib/upload/types";
import { createObservationCsvAttachment } from "./observation-mutations";

// Measurement targets we surface as chips so the uploader can confirm their
// numbers came through; everything else is occurrence metadata.
const MEASUREMENT_TARGETS = ["height", "dbh", "diameter", "canopyCoverPercent"] as const;
type MeasurementTarget = (typeof MEASUREMENT_TARGETS)[number];

// Keep CSVs comfortably under the attachment blob limit (10 MB). A plain-text
// observations list is tiny, so anything larger is almost certainly the wrong
// file.
const MAX_CSV_BYTES = 10 * 1024 * 1024;

const EXAMPLE_CSV = [
  "scientificName,vernacularName,eventDate,decimalLatitude,decimalLongitude,height,dbh,notes",
  "Cecropia obtusifolia,Guarumo,2024-03-12,9.7489,-83.7534,14.5,32,Beside the river trail",
  "Inga edulis,Guama,2024-03-12,9.7491,-83.7530,9.2,21,Fruiting",
].join("\n");

type Phase = "select" | "review" | "uploading" | "done";

type CsvSummary = {
  rowCount: number;
  hasRequired: boolean;
  measurementColumns: { target: MeasurementTarget; column: string }[];
};

function measurementColumns(mappings: ColumnMapping[]): { target: MeasurementTarget; column: string }[] {
  const result: { target: MeasurementTarget; column: string }[] = [];
  for (const mapping of mappings) {
    if ((MEASUREMENT_TARGETS as readonly string[]).includes(mapping.targetField)) {
      result.push({ target: mapping.targetField as MeasurementTarget, column: mapping.sourceColumn });
    }
  }
  return result;
}

export function ObservationCsvUpload({
  target,
  projectRef,
  onBack,
  onClose,
}: {
  target: ManageTarget;
  /** When set, the stored dataset is linked to this project (at-uri). */
  projectRef?: string | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("upload.observations.csvUpload");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  const [phase, setPhase] = useState<Phase>("select");
  const [isParsing, setIsParsing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<CsvSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const createPermission = canCreateRecord(target);
  const disabledReason = createPermission.allowed ? null : createPermission.reason;

  const handleFile = useCallback(
    (incoming: File | undefined) => {
      if (!incoming) return;
      if (disabledReason) {
        setError(disabledReason);
        return;
      }
      const isCsv = incoming.type === "text/csv" || /\.csv$/i.test(incoming.name);
      if (!isCsv) {
        setError(t("notCsv"));
        return;
      }
      if (incoming.size > MAX_CSV_BYTES) {
        setError(t("tooLarge"));
        return;
      }
      setError(null);
      setFile(incoming);
      setIsParsing(true);
      // We parse only to preview the dataset (row count + detected columns).
      // The file itself is stored verbatim, so parsing never gates the upload.
      Papa.parse<Record<string, string>>(incoming, {
        header: true,
        skipEmptyLines: true,
        complete: (parsed) => {
          setIsParsing(false);
          const headers = parsed.meta.fields ?? [];
          const rowCount = parsed.data.length;
          if (rowCount === 0) {
            setError(t("empty"));
            setSummary(null);
            setFile(null);
            return;
          }
          const mappings = autoDetectMappings(headers);
          setSummary({
            rowCount,
            hasRequired: mappingsCoverRequiredFields(mappings),
            measurementColumns: measurementColumns(mappings),
          });
          setPhase("review");
        },
        error: () => {
          setIsParsing(false);
          setError(t("parseError"));
          setFile(null);
        },
      });
    },
    [disabledReason, t],
  );

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
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
    handleFile(event.dataTransfer.files?.[0]);
  }

  function startOver() {
    setSummary(null);
    setFile(null);
    setError(null);
    setPhase("select");
  }

  function downloadExample() {
    const blob = new Blob([EXAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "observations-example.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function upload() {
    if (!file) return;
    if (disabledReason) {
      setError(disabledReason);
      return;
    }
    setPhase("uploading");
    setError(null);
    try {
      await createObservationCsvAttachment({
        file,
        title: file.name,
        subjectUri: projectRef ?? null,
      });
      setPhase("done");
    } catch {
      setError(t("uploadFailed"));
      setPhase("review");
    }
  }

  const measurementLabel = useMemo(
    () => ({
      height: t("measureHeight"),
      dbh: t("measureDbh"),
      diameter: t("measureDiameter"),
      canopyCoverPercent: t("measureCanopy"),
    }),
    [t],
  );

  // ── Done screen ────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <ModalContent className="space-y-5" dismissible={false}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <CheckCircle2Icon className="size-7" />
          </span>
          <div>
            <ModalTitle>{t("doneTitle")}</ModalTitle>
            <ModalDescription className="mt-1">{t("doneBody")}</ModalDescription>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={startOver}>
            <FileSpreadsheetIcon className="size-4" />
            {t("uploadAnother")}
          </Button>
          <Button onClick={onClose}>{t("done")}</Button>
        </div>
      </ModalContent>
    );
  }

  const uploading = phase === "uploading";

  return (
    <ModalContent className="space-y-4" dismissible={false}>
      <ModalHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onBack}
              aria-label={t("back")}
              className="-ml-1 -mt-1 shrink-0 rounded-full text-muted-foreground"
              disabled={uploading}
            >
              <ArrowLeftIcon className="size-4" />
            </Button>
            <div>
              <ModalTitle>{t("title")}</ModalTitle>
              <ModalDescription className="mt-1">{t("description")}</ModalDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={onClose}
            aria-label={t("close")}
            className="-mr-1 -mt-1 shrink-0 rounded-full"
            disabled={uploading}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </ModalHeader>

      {phase === "select" ? (
        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "rounded-2xl border border-dashed px-6 py-10 transition-colors",
            isDragging ? "border-primary bg-primary/10" : "border-primary/30",
          )}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
              {isParsing ? <Loader2Icon className="size-7 animate-spin" /> : <UploadCloudIcon className="size-7" />}
            </span>
            <div>
              <p className="font-instrument text-xl font-medium italic tracking-[-0.02em] text-foreground">
                {t("dropTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("dropHint")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(disabledReason) || isParsing}
              title={disabledReason ?? undefined}
            >
              {t("choose")}
            </Button>
            <button
              type="button"
              onClick={downloadExample}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <DownloadIcon className="size-3.5" />
              {t("downloadExample")}
            </button>
          </div>
        </div>
      ) : null}

      {summary && file && (phase === "review" || uploading) ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
            <FileSpreadsheetIcon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{file.name}</span>
            {phase === "review" ? (
              <Button type="button" variant="ghost" size="xs" onClick={startOver} className="shrink-0 rounded-full">
                {t("replace")}
              </Button>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border p-3">
            <p className="text-sm font-medium text-foreground">{t("rowsFound", { count: summary.rowCount })}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("storedAsFile")}</p>
            {!summary.hasRequired ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-amber-700 dark:text-amber-400">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                {t("missingRequired")}
              </p>
            ) : null}
            {summary.measurementColumns.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <RulerIcon className="size-3.5 text-primary" />
                  {t("measurementsFound")}
                </span>
                {summary.measurementColumns.map((entry) => (
                  <span
                    key={entry.column}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {measurementLabel[entry.target]}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onInputChange} />

      {summary && (phase === "review" || uploading) ? (
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button onClick={upload} disabled={!file || uploading || Boolean(disabledReason)} title={disabledReason ?? undefined}>
            {uploading ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {uploading ? t("saving") : t("submit")}
          </Button>
        </div>
      ) : null}
    </ModalContent>
  );
}
