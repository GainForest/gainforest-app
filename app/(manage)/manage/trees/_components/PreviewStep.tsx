"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Camera, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyMappings } from "../../_lib/upload/column-mapper";
import { parseAndValidateRows } from "../../_lib/upload/schemas";
import { getTargetFieldLabel } from "../../_lib/upload/types";
import type { ColumnMapping, TreeUploadRowAttentionSummary, ValidatedRow } from "../../_lib/upload/types";
import { buildPreviewRowAttentionSummaries } from "../../_lib/upload/row-attention";
import type { KoboMediaZipIndex } from "../../_lib/upload/kobo-media-zip";
import type { UploadSiteSelection } from "../../_lib/upload/site-selection";
import { fetchUploadSiteBoundary, type SiteBoundaryGeoJson } from "../../_lib/upload/site-boundary";

const MAX_PREVIEW_ROWS = 20;

type Props = {
  parsedData: Record<string, string>[];
  mappings: ColumnMapping[];
  koboMediaZipIndex: KoboMediaZipIndex | null;
  siteSelection: UploadSiteSelection | null;
  onBack: () => void;
  onNext: (validRows: ValidatedRow[], skippedRows: TreeUploadRowAttentionSummary[]) => void;
};

function buildErrorSummary(errors: { index: number; issues: { path: string; message: string }[] }[]) {
  const map = new Map<string, { count: number; message: string }>();
  for (const err of errors) {
    for (const issue of err.issues) {
      const existing = map.get(issue.path);
      if (existing) { existing.count += 1; }
      else { map.set(issue.path, { count: 1, message: issue.message }); }
    }
  }
  return Array.from(map.entries())
    .map(([path, { count, message }]) => ({ path, count, message }))
    .sort((a, b) => b.count - a.count);
}

export default function PreviewStep({ parsedData, mappings, koboMediaZipIndex, siteSelection, onBack, onNext }: Props) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [errorSectionOpen, setErrorSectionOpen] = useState(false);
  const [siteBoundary, setSiteBoundary] = useState<SiteBoundaryGeoJson | null>(null);
  const [siteBoundarySiteUri, setSiteBoundarySiteUri] = useState<string | null>(null);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!siteSelection) {
      setBoundaryLoading(false);
      setBoundaryError(null);
      setSiteBoundary(null);
      setSiteBoundarySiteUri(null);
      return;
    }
    setBoundaryLoading(true);
    setBoundaryError(null);
    setSiteBoundary(null);
    setSiteBoundarySiteUri(null);
    fetchUploadSiteBoundary(siteSelection)
      .then((b) => {
        if (cancelled) return;
        setSiteBoundary(b);
        setSiteBoundarySiteUri(siteSelection.uri);
        setBoundaryLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setBoundaryError(err instanceof Error ? err.message : "Failed to load boundary.");
        setBoundaryLoading(false);
      });
    return () => { cancelled = true; };
  }, [siteSelection]);

  const activeSiteBoundary = siteSelection && siteBoundarySiteUri === siteSelection.uri ? siteBoundary : null;

  const { validationResult, mappedHeaders, mappedRows, hasAnyPhotos } = useMemo(() => {
    const mapped = applyMappings(parsedData, mappings);
    const result = parseAndValidateRows(mapped, parsedData, mappings, {
      koboMediaZipIndex,
      siteBoundary: siteSelection && activeSiteBoundary ? { geoJson: activeSiteBoundary, siteRef: siteSelection.uri } : null,
    });
    const headerSet = new Set<string>();
    for (const row of mapped) {
      for (const key of Object.keys(row)) {
        if (key !== "photoUrl") headerSet.add(key);
      }
    }
    const anyPhotos = result.valid.some((r) => r.photos && r.photos.length > 0);
    return { validationResult: result, mappedHeaders: Array.from(headerSet), mappedRows: mapped, hasAnyPhotos: anyPhotos };
  }, [koboMediaZipIndex, parsedData, mappings, activeSiteBoundary, siteSelection]);

  const { valid, errors } = validationResult;
  const totalRows = parsedData.length;
  const validCount = valid.length;
  const errorCount = errors.length;
  const allValid = errorCount === 0;
  const allInvalid = validCount === 0;
  const canContinue = siteSelection !== null && activeSiteBoundary !== null && validCount > 0 && !boundaryLoading && !boundaryError;

  const photoCountByIndex = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of valid) {
      if (row.photos && row.photos.length > 0) map.set(row.index, row.photos.length);
    }
    return map;
  }, [valid]);

  const errorByIndex = useMemo(() => {
    const map = new Map<number, { path: string; message: string }[]>();
    for (const err of errors) map.set(err.index, err.issues);
    return map;
  }, [errors]);

  const errorSummary = useMemo(() => buildErrorSummary(errors), [errors]);
  const previewSkippedRows = useMemo(() => buildPreviewRowAttentionSummaries(errors, mappedRows), [errors, mappedRows]);

  const previewRows = mappedRows.slice(0, MAX_PREVIEW_ROWS).map((row, sliceIdx) => ({ row, rowIndex: sliceIdx }));
  const showingNote = totalRows > MAX_PREVIEW_ROWS;

  const toggleRow = (rowIndex: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Review & Verify</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Review your tree information before saving.</p>
      </div>

      {/* Summary banner */}
      {siteSelection === null ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>No site selected. Go back and choose or create a site boundary.</span>
        </div>
      ) : boundaryLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Checking drawn map area for {siteSelection.name}…</span>
        </div>
      ) : boundaryError ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Could not check the selected drawn map area ({boundaryError}). Go back, choose or create a site boundary, then try again.</span>
        </div>
      ) : allValid ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>All {totalRows} row{totalRows !== 1 ? "s" : ""} ready — ready to save to {siteSelection.name}.</span>
        </div>
      ) : allInvalid ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>No valid rows found. Fix errors and try again.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{validCount} ready, {errorCount} need fixes. Rows with problems will be skipped.</span>
        </div>
      )}

      {/* Data preview table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Tree information preview</h3>
          {showingNote && <span className="text-xs text-muted-foreground">Showing first {MAX_PREVIEW_ROWS} of {totalRows} rows</span>}
        </div>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide w-8">#</th>
                {mappedHeaders.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    {h === "siteBoundary" ? "Site boundary" : getTargetFieldLabel(h)}
                  </th>
                ))}
                {hasAnyPhotos && <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Photos</th>}
                <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide w-16">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {previewRows.map(({ row, rowIndex }) => {
                const rowErrors = errorByIndex.get(rowIndex);
                const hasError = !!rowErrors;
                const isExpanded = expandedRows.has(rowIndex);
                return (
                  <Fragment key={rowIndex}>
                    <tr
                      className={`${hasError ? "border-l-2 border-l-destructive bg-destructive/5 cursor-pointer hover:bg-destructive/10" : "hover:bg-muted/20"}`}
                      onClick={hasError ? () => toggleRow(rowIndex) : undefined}
                    >
                      <td className="px-3 py-2 text-muted-foreground font-mono">{rowIndex + 1}</td>
                      {mappedHeaders.map((h) => (
                        <td key={h} className="px-3 py-2 font-mono text-foreground max-w-[160px] truncate">
                          {row[h] ?? <span className="text-muted-foreground/50 italic">—</span>}
                        </td>
                      ))}
                      {hasAnyPhotos && (
                        <td className="px-3 py-2">
                          {(() => {
                            const count = photoCountByIndex.get(rowIndex);
                            if (!count) return <span className="text-muted-foreground/50 italic">—</span>;
                            return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Camera className="h-3 w-3" />{count}</span>;
                          })()}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        {hasError ? (
                          <div className="flex items-center gap-1 text-destructive">
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                            {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                          </div>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        )}
                      </td>
                    </tr>
                    {hasError && isExpanded && (
                      <tr className="bg-destructive/5">
                        <td colSpan={mappedHeaders.length + (hasAnyPhotos ? 3 : 2)} className="px-4 py-2">
                          <ul className="space-y-0.5">
                            {rowErrors.map((issue, i) => (
                              <li key={i} className="text-xs text-destructive flex items-start gap-1.5">
                                <span className="font-medium shrink-0">{getTargetFieldLabel(issue.path)}:</span>
                                <span>{issue.message}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error summary */}
      {errorCount > 0 && (
        <div className="rounded-lg border border-destructive/30 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/30 transition-colors"
            onClick={() => setErrorSectionOpen((v) => !v)}
          >
            <span className="flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4 shrink-0" />
              {errorCount} row{errorCount !== 1 ? "s" : ""} with errors
            </span>
            {errorSectionOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>
          {errorSectionOpen && (
            <div className="border-t border-destructive/20 px-4 py-3 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Common issues</p>
                <ul className="space-y-1">
                  {errorSummary.map((item) => (
                    <li key={item.path} className="text-sm flex items-start gap-2">
                      <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-xs font-medium px-1.5 py-0.5 min-w-[1.5rem]">{item.count}</span>
                      <span><span className="font-medium">{getTargetFieldLabel(item.path)}</span>{" — "}<span className="text-muted-foreground">{item.message}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Error rows</p>
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {errors.map((err) => (
                    <li key={err.index} className="text-xs border border-destructive/20 rounded-md p-2 space-y-0.5">
                      <p className="font-medium">Row {err.index + 1}</p>
                      {err.issues.map((issue, i) => (
                        <p key={i} className="text-muted-foreground">
                          <span className="text-destructive font-medium">{getTargetFieldLabel(issue.path)}:</span> {issue.message}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button variant="outline" onClick={onBack}>Back to Column Mapping</Button>
        <Button onClick={() => onNext(valid, previewSkippedRows)} disabled={!canContinue}>
          Upload {validCount} valid row{validCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}
