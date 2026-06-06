"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TARGET_FIELDS, getTargetFieldLabel } from "../../_lib/upload/types";
import type { ColumnMapping } from "../../_lib/upload/types";
import { inferSubjectPartFromColumnName } from "../../_lib/upload/column-mapper";
import { detectKoboFormat, isExpectedSkippedKoboColumn } from "../../_lib/upload/kobo-mapper";

const MULTI_MAP_TARGETS = new Set(["photoUrl"]);
const SKIP_SENTINEL = "__skip__";

const OCCURRENCE_REQUIRED = TARGET_FIELDS.filter((f) => f.category === "occurrence" && f.required);
const OCCURRENCE_OPTIONAL = TARGET_FIELDS.filter((f) => f.category === "occurrence" && !f.required);
const MEASUREMENTS = TARGET_FIELDS.filter((f) => f.category === "measurement");
const MEDIA = TARGET_FIELDS.filter((f) => f.category === "media");
const REQUIRED_FIELDS = ["scientificName", "eventDate", "decimalLatitude", "decimalLongitude"] as const;

function getSampleValue(sampleData: Record<string, string>[] | undefined, column: string): string {
  if (!sampleData) return "";
  for (const row of sampleData) {
    const val = row[column];
    if (val !== undefined && val.trim() !== "") return val.trim();
  }
  return "";
}

function getMappedTarget(mappings: ColumnMapping[], sourceColumn: string): string {
  return mappings.find((m) => m.sourceColumn === sourceColumn)?.targetField ?? SKIP_SENTINEL;
}

type Props = {
  headers: string[];
  mappings: ColumnMapping[];
  sampleData?: Record<string, string>[];
  onMappingsChange: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
  onNext: () => void;
};

export default function ColumnMappingStep({ headers, mappings, sampleData, onMappingsChange, onBack, onNext }: Props) {
  const koboDetection = useMemo(() => detectKoboFormat(headers), [headers]);

  const targetToSources = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const m of mappings) {
      if (!m.targetField) continue;
      if (!map[m.targetField]) map[m.targetField] = [];
      map[m.targetField].push(m.sourceColumn);
    }
    return map;
  }, [mappings]);

  const mappedTargets = useMemo(() => new Set(mappings.filter((m) => m.targetField).map((m) => m.targetField)), [mappings]);
  const missingRequired = REQUIRED_FIELDS.filter((f) => !mappedTargets.has(f));
  const allRequiredMapped = missingRequired.length === 0;

  const skippedColumns = useMemo(() => headers.filter((h) => getMappedTarget(mappings, h) === SKIP_SENTINEL), [headers, mappings]);
  const skippedColumnsNeedingReview = useMemo(() =>
    skippedColumns.filter((h) => !(koboDetection.isKobo && isExpectedSkippedKoboColumn(h, headers))),
    [headers, koboDetection.isKobo, skippedColumns],
  );
  const expectedSkippedKoboCount = skippedColumns.length - skippedColumnsNeedingReview.length;

  const duplicateSourceColumns = useMemo(() => {
    const dupes = new Set<string>();
    for (const [target, sources] of Object.entries(targetToSources)) {
      if (sources.length > 1 && !MULTI_MAP_TARGETS.has(target)) {
        for (let i = 1; i < sources.length; i++) {
          const src = sources[i];
          if (src !== undefined) dupes.add(`${src}::${sources[0]}`);
        }
      }
    }
    return dupes;
  }, [targetToSources]);

  const handleSelectChange = (sourceColumn: string, newTarget: string) => {
    const updated = mappings.filter((m) => m.sourceColumn !== sourceColumn);
    if (newTarget !== SKIP_SENTINEL) updated.push({ sourceColumn, targetField: newTarget });
    onMappingsChange(updated);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Match File Headings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Match your file headings to the tree information Bumicerts needs. {headers.length} headings detected.
        </p>
      </div>

      {!allRequiredMapped && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive space-y-1">
          <p className="font-medium">Required information not matched:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {missingRequired.map((f) => <li key={f}>{getTargetFieldLabel(f)}</li>)}
          </ul>
        </div>
      )}

      {skippedColumnsNeedingReview.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
          <CircleAlertIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Review unmatched headings</p>
            <p className="text-yellow-700/90 dark:text-yellow-300/90">{skippedColumnsNeedingReview.length} heading{skippedColumnsNeedingReview.length !== 1 ? "s" : ""} will not be saved.</p>
          </div>
        </div>
      )}

      {expectedSkippedKoboCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <p>{expectedSkippedKoboCount} field-form note{expectedSkippedKoboCount !== 1 ? "s" : ""} automatically skipped.</p>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-0 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <span>File heading</span>
          <span>Sample value</span>
          <span>Map to</span>
        </div>
        <div className="divide-y divide-border">
          {headers.map((header) => {
            const currentTarget = getMappedTarget(mappings, header);
            const sample = getSampleValue(sampleData, header);
            const isDuplicate = currentTarget !== SKIP_SENTINEL && duplicateSourceColumns.has(`${header}::${currentTarget}`);
            const isMapped = currentTarget !== SKIP_SENTINEL;
            const isSkipped = !isMapped;
            const isExpectedKoboSkip = isSkipped && koboDetection.isKobo && isExpectedSkippedKoboColumn(header, headers);
            const targetMeta = TARGET_FIELDS.find((f) => f.field === currentTarget);
            const isRequiredField = targetMeta?.required ?? false;

            return (
              <div
                key={header}
                className={`grid grid-cols-[1fr_1fr_1fr] gap-0 items-center px-4 py-3 ${
                  isDuplicate ? "bg-yellow-500/5" :
                  isSkipped && !isExpectedKoboSkip ? "border-l-2 border-l-yellow-500/60 bg-yellow-500/5" :
                  isExpectedKoboSkip ? "bg-muted/20" : ""
                }`}
              >
                <div className="flex items-center gap-2 pr-3">
                  <span className="text-sm font-mono truncate">{header}</span>
                  {isRequiredField && <span className="shrink-0 text-xs text-destructive font-medium">*</span>}
                </div>
                <div className="pr-3">
                  {sample ? (
                    <span className="text-xs text-muted-foreground font-mono truncate block max-w-[180px]">{sample}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50 italic">(empty)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={currentTarget} onValueChange={(val) => handleSelectChange(header, val)}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Skip" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP_SENTINEL}><span className="text-muted-foreground">Skip this heading</span></SelectItem>
                      <SelectGroup>
                        <SelectLabel>Required information</SelectLabel>
                        {OCCURRENCE_REQUIRED.map((f) => (
                          <SelectItem key={f.field} value={f.field}>{getTargetFieldLabel(f.field)} <span className="text-destructive ml-1">*</span></SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Optional information</SelectLabel>
                        {OCCURRENCE_OPTIONAL.map((f) => <SelectItem key={f.field} value={f.field}>{getTargetFieldLabel(f.field)}</SelectItem>)}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Tree measurements</SelectLabel>
                        {MEASUREMENTS.map((f) => <SelectItem key={f.field} value={f.field}>{getTargetFieldLabel(f.field)}</SelectItem>)}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Photos</SelectLabel>
                        {MEDIA.map((f) => <SelectItem key={f.field} value={f.field}>{getTargetFieldLabel(f.field)}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {isMapped && currentTarget === "photoUrl" && (
                    <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
                      {inferSubjectPartFromColumnName(header)}
                    </span>
                  )}
                  {isDuplicate ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
                  ) : isMapped ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : isExpectedKoboSkip ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  ) : (
                    <CircleAlertIcon className="h-4 w-4 shrink-0 text-yellow-500" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {duplicateSourceColumns.size > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Some headings match the same information. Only the first match will be used.</span>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />Mapped</span>
        <span className="flex items-center gap-1"><CircleAlertIcon className="h-3.5 w-3.5 text-yellow-500" />Skipped — will not be saved</span>
        <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />Duplicate target</span>
        <span className="flex items-center gap-1"><span className="text-destructive font-medium">*</span>Required field</span>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={!allRequiredMapped}>Continue to Preview</Button>
      </div>
    </div>
  );
}
