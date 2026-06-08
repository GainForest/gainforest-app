"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, DatabaseIcon, Loader2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createRecord, putRecord, deleteRecord } from "../../_lib/mutations";
import { occurrenceInputToRecord } from "../../_lib/upload/occurrence-adapter";
import { buildTreeDynamicProperties } from "../../_lib/upload/tree-dynamic-properties";
import { getUploadTimeEstimate } from "../../_lib/upload/time-estimate";
import {
  checkUploadRowsAgainstSelectedSite,
  fetchUploadSiteBoundary,
  type SkippedBoundaryRow,
  type UploadableBoundaryRow,
} from "../../_lib/upload/site-boundary";
import type {
  TreeUploadRowAttentionSummary, ValidatedRow,
} from "../../_lib/upload/types";
import {
  createTreeUploadRowAttentionSummary,
  getTreeUploadRowAttentionKindLabel,
  getValidatedRowLabel,
} from "../../_lib/upload/row-attention";
import { type UploadDatasetSelection } from "../../_lib/upload/upload-dataset-selection";
import type { UploadSiteSelection } from "../../_lib/upload/site-selection";
import { clearPendingUpload } from "./upload-session";

type RowStatus =
  | { state: "pending" }
  | { state: "uploading" }
  | { state: "success"; occurrenceUri: string }
  | { state: "partial"; occurrenceUri: string; error: string }
  | { state: "error"; error: string };

type UploadProgress = {
  current: number;
  total: number;
  successes: number;
  partials: number;
  failures: number;
  currentRow: string;
};

type UploadStepProps = {
  uploadId: string;
  did: string;
  validRows: ValidatedRow[];
  previewSkippedRows: TreeUploadRowAttentionSummary[];
  koboMediaZipFile: File | null;
  establishmentMeans: string | null;
  datasetSelection: UploadDatasetSelection;
  siteSelection: UploadSiteSelection | null;
  backLabel: string;
  onBack: () => void;
  onComplete: () => void;
};

function getInitialRowStatuses(rows: ValidatedRow[], skippedRows: SkippedBoundaryRow[]): RowStatus[] {
  const statuses = rows.map<RowStatus>(() => ({ state: "pending" }));
  for (const skipped of skippedRows) {
    statuses[skipped.rowIndex] = { state: "error", error: skipped.message };
  }
  return statuses;
}

export default function UploadStep({
  did, validRows, previewSkippedRows, establishmentMeans, datasetSelection, siteSelection,
  backLabel, onBack, onComplete,
}: UploadStepProps) {
  const [uploadStarted, setUploadStarted] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadStartedAtMs, setUploadStartedAtMs] = useState<number | null>(null);
  const [uploadFatalError, setUploadFatalError] = useState<string | null>(null);
  const [datasetUpdateWarning, setDatasetUpdateWarning] = useState<string | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [progress, setProgress] = useState<UploadProgress>({
    current: 0, total: validRows.length, successes: 0, partials: 0, failures: 0, currentRow: "",
  });
  const [rowStatuses, setRowStatuses] = useState<RowStatus[]>(validRows.map(() => ({ state: "pending" as const })));
  const [failedRowsOpen, setFailedRowsOpen] = useState(false);
  const [skippedUploadRowIndexes, setSkippedUploadRowIndexes] = useState<number[]>([]);
  const uploadRef = useRef(false);

  const skippedUploadRowIndexSet = useMemo(() => new Set(skippedUploadRowIndexes), [skippedUploadRowIndexes]);

  const rowAttentionSummaries = useMemo(() => {
    const uploadAttention = rowStatuses.flatMap((status, rowIndex) => {
      if (status.state !== "error" && status.state !== "partial") return [];
      const row = validRows[rowIndex];
      if (!row) return [];
      return [createTreeUploadRowAttentionSummary({
        sourceRowIndex: row.index,
        rowLabel: getValidatedRowLabel(row),
        messages: [status.state === "partial" || status.state === "error" ? status.error : ""],
        kind: status.state === "partial" ? "partial" : skippedUploadRowIndexSet.has(rowIndex) ? "skipped" : "failed",
      })];
    });
    return [...previewSkippedRows, ...uploadAttention].sort((a, b) => a.sourceRowIndex - b.sourceRowIndex);
  }, [previewSkippedRows, rowStatuses, skippedUploadRowIndexSet, validRows]);

  const runUpload = useCallback(async () => {
    if (uploadRef.current) return;
    uploadRef.current = true;
    const uploadStartMs = Date.now();
    setClockMs(uploadStartMs);
    setUploadStarted(true);
    setUploadFatalError(null);
    setDatasetUpdateWarning(null);

    let rowsToUpload: UploadableBoundaryRow[] = [];
    let skippedRowsForUpload: SkippedBoundaryRow[] = [];

    if (!siteSelection) {
      setUploadFatalError("No site selected. Go back and choose or create a site boundary.");
      setClockMs(Date.now());
      setUploadDone(true);
      return;
    }

    try {
      const boundary = await fetchUploadSiteBoundary(siteSelection);
      const siteBoundaryCheck = checkUploadRowsAgainstSelectedSite({ rows: validRows, siteSelection, boundary });
      rowsToUpload = siteBoundaryCheck.rowsToUpload;
      skippedRowsForUpload = siteBoundaryCheck.skippedRows;

      setSkippedUploadRowIndexes(skippedRowsForUpload.map((r) => r.rowIndex));
      setRowStatuses(getInitialRowStatuses(validRows, skippedRowsForUpload));
      setProgress({
        current: skippedRowsForUpload.length, total: validRows.length,
        successes: 0, partials: 0, failures: skippedRowsForUpload.length, currentRow: "",
      });

      if (siteBoundaryCheck.fatalError) {
        setUploadFatalError(siteBoundaryCheck.fatalError);
        setClockMs(Date.now());
        setUploadDone(true);
        return;
      }
      if (rowsToUpload.length === 0) {
        clearPendingUpload();
        setClockMs(Date.now());
        setUploadDone(true);
        return;
      }
    } catch {
      setUploadFatalError("Could not check the selected drawn map area. Go back, choose or create a site boundary, then try again.");
      setClockMs(Date.now());
      setUploadDone(true);
      return;
    }

    clearPendingUpload();

    // Phase 0: Create dataset if needed
    let datasetUri: string | undefined;
    let datasetRkey: string | undefined;

    if (datasetSelection.mode === "new" && datasetSelection.name.trim().length > 0) {
      try {
        const dsResult = await createRecord("app.gainforest.dwc.dataset", {
          $type: "app.gainforest.dwc.dataset",
          name: datasetSelection.name.trim(),
          ...(datasetSelection.description.trim() ? { description: datasetSelection.description.trim() } : {}),
          ...(establishmentMeans ? { establishmentMeans } : {}),
          createdAt: new Date().toISOString(),
        });
        datasetUri = dsResult.uri;
        datasetRkey = dsResult.uri.split("/").pop();
      } catch {
        setUploadFatalError("Could not create the tree group. Try again or continue without a group.");
        setClockMs(Date.now());
        setUploadDone(true);
        return;
      }
    } else if (datasetSelection.mode === "existing") {
      datasetUri = datasetSelection.dataset.uri;
      datasetRkey = datasetSelection.dataset.rkey;
    }

    const rowUploadStartMs = Date.now();
    setClockMs(rowUploadStartMs);
    setUploadStartedAtMs(rowUploadStartMs);

    let successes = 0;
    let partials = 0;
    let failures = skippedRowsForUpload.length;

    // Phase 1: Upload occurrences + measurements
    for (let uploadIndex = 0; uploadIndex < rowsToUpload.length; uploadIndex++) {
      const entry = rowsToUpload[uploadIndex];
      if (!entry) continue;
      const { row, rowIndex } = entry;
      const speciesName = row.occurrence.scientificName || `Row ${rowIndex + 1}`;

      setRowStatuses((prev) => { const next = [...prev]; next[rowIndex] = { state: "uploading" }; return next; });
      setProgress((prev) => ({ ...prev, current: Math.min(skippedRowsForUpload.length + uploadIndex + 1, validRows.length), currentRow: speciesName }));
      setClockMs(Date.now());

      try {
        const occurrence = {
          ...row.occurrence,
          ...(establishmentMeans ? { establishmentMeans } : {}),
          siteRef: siteSelection.uri,
          ...(datasetUri ? { datasetRef: datasetUri } : {}),
          dynamicProperties: buildTreeDynamicProperties(datasetUri),
        };
        const occRecord = occurrenceInputToRecord(occurrence);
        const occResult = await createRecord("app.gainforest.dwc.occurrence", occRecord as Record<string, unknown>);

        if (row.floraMeasurement) {
          try {
            await createRecord("app.gainforest.dwc.measurement", {
              $type: "app.gainforest.dwc.measurement",
              occurrenceRef: occResult.uri,
              ...(row.floraMeasurement.dbh ? { dbh: row.floraMeasurement.dbh } : {}),
              ...(row.floraMeasurement.totalHeight ? { totalHeight: row.floraMeasurement.totalHeight } : {}),
              ...(row.floraMeasurement.diameter ? { basalDiameter: row.floraMeasurement.diameter } : {}),
              ...(row.floraMeasurement.canopyCoverPercent ? { canopyCoverPercent: row.floraMeasurement.canopyCoverPercent } : {}),
              createdAt: new Date().toISOString(),
            });
          } catch {
            // Measurement failed - mark as partial but keep occurrence
            partials += 1;
            setRowStatuses((prev) => {
              const next = [...prev];
              next[rowIndex] = { state: "partial", occurrenceUri: occResult.uri, error: "Tree saved but measurement could not be added." };
              return next;
            });
            setProgress((prev) => ({ ...prev, successes, partials, failures }));
            continue;
          }
        }

        successes += 1;
        setRowStatuses((prev) => { const next = [...prev]; next[rowIndex] = { state: "success", occurrenceUri: occResult.uri }; return next; });
      } catch (err) {
        failures += 1;
        setRowStatuses((prev) => {
          const next = [...prev];
          next[rowIndex] = { state: "error", error: err instanceof Error ? err.message : "Failed to save." };
          return next;
        });
      }

      setProgress((prev) => ({ ...prev, successes, partials, failures }));
      setClockMs(Date.now());
    }

    // Phase 1.5: update dataset record count
    const persistedOccurrences = successes + partials;
    if (datasetSelection.mode === "new" && datasetRkey && persistedOccurrences === 0) {
      try {
        await deleteRecord("app.gainforest.dwc.dataset", datasetRkey);
      } catch {
        setDatasetUpdateWarning("The empty tree group could not be removed automatically.");
      }
    } else if (datasetRkey && persistedOccurrences > 0) {
      try {
        const dsRecord = {
          $type: "app.gainforest.dwc.dataset",
          name: datasetSelection.mode === "new" ? datasetSelection.name : datasetSelection.mode === "existing" ? datasetSelection.dataset.name : "",
          recordCount: (datasetSelection.mode === "existing" ? (datasetSelection.dataset.recordCount ?? 0) : 0) + persistedOccurrences,
          createdAt: new Date().toISOString(),
        };
        await putRecord("app.gainforest.dwc.dataset", datasetRkey, dsRecord as Record<string, unknown>);
      } catch {
        setDatasetUpdateWarning("Tree group created, but its tree count could not be updated.");
      }
    }

    setClockMs(Date.now());
    setUploadDone(true);
  }, [datasetSelection, establishmentMeans, previewSkippedRows, siteSelection, validRows]);

  useEffect(() => {
    if (!uploadStarted) {
      void runUpload();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { current, total: uploadTotal, successes, partials, failures, currentRow } = progress;
  const progressPercent = uploadTotal > 0 ? Math.round((current / uploadTotal) * 100) : 0;
  const progressLabel = current > 0
    ? `Saving row ${current} of ${uploadTotal}${currentRow ? ` — ${currentRow}` : ""}…`
    : "Preparing to save…";

  const treeUploadTimeEstimate = getUploadTimeEstimate({
    startedAtMs: uploadStartedAtMs, nowMs: clockMs,
    completedUnits: successes + partials + failures, totalUnits: uploadTotal,
    isComplete: uploadDone, unitLabel: "tree",
  });

  const totalFailureCount = failures + previewSkippedRows.length;
  const persistedCount = successes + partials;
  const attentionCount = rowAttentionSummaries.length;
  const allSucceeded = uploadDone && totalFailureCount === 0 && partials === 0 && !uploadFatalError;
  const someFailed = uploadDone && attentionCount > 0 && !uploadFatalError;
  const isUploadInProgress = uploadStarted && !uploadDone;
  const showBackNavigation = !uploadDone;

  const selectedDatasetName =
    datasetSelection.mode === "new" ? datasetSelection.name :
    datasetSelection.mode === "existing" ? datasetSelection.dataset.name : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Saving your trees</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Saving {uploadTotal} tree{uploadTotal !== 1 ? "s" : ""} to GainForest.
        </p>
        {siteSelection && <p className="text-xs text-muted-foreground mt-1">Assigning to {siteSelection.name}.</p>}
        {selectedDatasetName && (
          <p className="text-xs text-muted-foreground mt-1">
            {datasetSelection.mode === "existing" ? `Adding to ${selectedDatasetName}.` : `Creating group "${selectedDatasetName}".`}
          </p>
        )}
      </div>

      {isUploadInProgress && (
        <div className="flex items-start gap-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Do not refresh or close this page</p>
            <p>Keep this tab open until saving finishes.</p>
          </div>
        </div>
      )}

      {!uploadDone && (
        <div className="space-y-2">
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">{progressLabel}</span>
            <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{treeUploadTimeEstimate.label}</span>
              <span className="font-mono">{progressPercent}%</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>{successes} succeeded{partials > 0 ? `, ${partials} need follow-up` : ""}{`, ${failures} failed`}</p>
            <p>{treeUploadTimeEstimate.description}</p>
          </div>
        </div>
      )}

      {uploadFatalError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{uploadFatalError}</span>
        </div>
      )}

      {uploadDone && allSucceeded && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Successfully saved {successes} tree{successes !== 1 ? "s" : ""}.</span>
        </div>
      )}

      {uploadDone && someFailed && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{persistedCount} saved{partials > 0 ? `, ${partials} need follow-up` : ""}{totalFailureCount > 0 ? `, ${totalFailureCount} skipped or failed.` : "."}</span>
        </div>
      )}

      {datasetUpdateWarning && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{datasetUpdateWarning}</span>
        </div>
      )}

      {/* Per-row status list */}
      {!uploadFatalError && (
        <div className="rounded-lg border overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {validRows.map((row, i) => {
              const status = rowStatuses[i];
              const species = getValidatedRowLabel(row);
              return (
                <div key={row.index} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-6 shrink-0">{row.index + 1}</span>
                  <span className="flex-1 min-w-0 truncate">{species}</span>
                  <span>
                    {status?.state === "pending" && <span className="text-xs text-muted-foreground">Pending</span>}
                    {status?.state === "uploading" && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                    {status?.state === "success" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    {status?.state === "partial" && <span title={status.error}><AlertTriangle className="h-4 w-4 text-yellow-500" /></span>}
                    {status?.state === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Failed rows detail */}
      {rowAttentionSummaries.length > 0 && !uploadFatalError && (
        <div className="rounded-lg border border-destructive/30 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/30 transition-colors"
            onClick={() => setFailedRowsOpen((v) => !v)}
          >
            <span className="flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4 shrink-0" />
              {attentionCount} row{attentionCount !== 1 ? "s" : ""} need attention
            </span>
            {failedRowsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {failedRowsOpen && (
            <div className="border-t border-destructive/20 px-4 py-3">
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {rowAttentionSummaries.map((summary) => (
                  <li key={`${summary.kind}-${summary.sourceRowIndex}`} className="text-xs border border-destructive/20 rounded-md p-2 space-y-1">
                    <p className="font-medium">Row {summary.sourceRowIndex + 1} — {summary.rowLabel}</p>
                    <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">{getTreeUploadRowAttentionKindLabel(summary.kind)}</p>
                    <ul className="space-y-0.5">
                      {summary.messages.map((msg, idx) => <li key={idx} className="text-destructive">{msg}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className={`flex items-center pt-2 border-t border-border ${showBackNavigation ? "justify-between" : "justify-end"}`}>
        {showBackNavigation && (
          <Button variant="outline" onClick={onBack} disabled={isUploadInProgress}>{backLabel}</Button>
        )}
        {uploadDone && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onComplete}>
              {uploadFatalError ? "Start Over" : "Add More Trees"}
            </Button>
            {!uploadFatalError && (
              <Button onClick={onComplete}>
                <DatabaseIcon />
                Done
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
