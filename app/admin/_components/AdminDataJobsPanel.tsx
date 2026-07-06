"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import {
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FolderSearchIcon,
  KeyRoundIcon,
  Loader2Icon,
} from "lucide-react";
import type { DataJob, DataJobStatus } from "@/app/_lib/data-jobs-shared";
import { DATA_JOB_ADMIN_STATUSES } from "@/app/_lib/data-jobs-shared";
import { formatBytes, formatRelative } from "@/app/_lib/format";
import { accountPath } from "@/app/account/_lib/account-route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AdminAvatar, AdminEmptyState } from "./AdminModerationDashboard";

/** A job enriched server-side with the submitter's profile card. */
export type AdminDataJobRow = DataJob & {
  displayName: string | null;
  avatarUrl: string | null;
};

const STATUS_STYLES: Record<DataJobStatus, string> = {
  uploading: "bg-muted text-muted-foreground",
  received: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  inReview: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  published: "bg-primary/10 text-primary",
  needsAttention: "bg-destructive/10 text-destructive",
};

type ZipContents = {
  totalEntries: number;
  totalUncompressedBytes: number;
  byExtension: { extension: string; count: number; bytes: number }[];
  entries: { path: string; sizeBytes: number }[];
  listedEntries: number;
};

/**
 * Admin roster of partner data batches: who submitted what, how big it is and
 * where it sits in the review pipeline. Each row expands into remote archive
 * inspection (listing + CSV preview via range reads — no 10GB downloads), a
 * download link, status controls and a note back to the submitter.
 */
export function AdminDataJobsPanel({ rows }: { rows: AdminDataJobRow[] | null }) {
  const t = useTranslations("common.adminDataJobs");

  if (rows === null) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {t("unavailable")}
      </div>
    );
  }
  if (rows.length === 0) return <AdminEmptyState>{t("empty")}</AdminEmptyState>;

  return (
    <ul className="divide-y divide-border/70">
      {rows.map((row) => (
        <JobRow key={row.id} row={row} />
      ))}
    </ul>
  );
}

function JobRow({ row }: { row: AdminDataJobRow }) {
  const t = useTranslations("common.adminDataJobs");
  const [job, setJob] = useState<AdminDataJobRow>(row);
  const [open, setOpen] = useState(false);

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={accountPath(job.did)}
          className="flex min-w-0 flex-1 basis-52 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AdminAvatar url={job.avatarUrl} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{job.displayName || t("unnamed")}</span>
            <span className="truncate text-xs text-muted-foreground">{job.handle}</span>
          </span>
        </Link>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[job.status])}>
          {t(`status.${job.status}`)}
        </span>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setOpen((v) => !v)}>
          <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
          {t("details")}
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-13 text-xs text-muted-foreground">
        <span className="font-mono text-foreground/80">{job.filename}</span>
        <span className="tabular-nums">{formatBytes(job.sizeBytes)}</span>
        {job.project ? <span className="truncate">{job.project}</span> : null}
        <span>{t("submitted", { when: formatRelative(job.createdAt) })}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1",
            job.hasAgentKey ? "text-primary" : "text-destructive",
          )}
        >
          <KeyRoundIcon className="size-3" />
          {job.hasAgentKey ? t("keyActive") : t("keyMissing")}
        </span>
      </div>

      {job.notes ? (
        <p className="mt-2 pl-13 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground/80">{t("submitterNotes")}</span> {job.notes}
        </p>
      ) : null}

      {open ? <JobDetails job={job} onUpdated={setJob} /> : null}
    </li>
  );
}

function JobDetails({
  job,
  onUpdated,
}: {
  job: AdminDataJobRow;
  onUpdated: (job: AdminDataJobRow) => void;
}) {
  const t = useTranslations("common.adminDataJobs");
  const [reviewNote, setReviewNote] = useState(job.reviewNote ?? "");
  const [publishedCount, setPublishedCount] = useState(job.publishedCount?.toString() ?? "");
  const [saving, setSaving] = useState<DataJobStatus | "note" | null>(null);
  const [saveState, setSaveState] = useState<null | "saved" | "failed">(null);
  const [downloading, setDownloading] = useState(false);
  const [contents, setContents] = useState<ZipContents | null>(null);
  const [contentsState, setContentsState] = useState<"idle" | "loading" | "failed">("idle");

  async function patch(body: Record<string, unknown>, busy: DataJobStatus | "note") {
    setSaving(busy);
    setSaveState(null);
    try {
      const response = await fetch(`/api/admin/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { job?: DataJob };
      if (!response.ok || !data.job) throw new Error();
      onUpdated({ ...job, ...data.job });
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    } finally {
      setSaving(null);
    }
  }

  async function openDownload() {
    setDownloading(true);
    try {
      const response = await fetch(`/api/admin/jobs/${job.id}/download`);
      const data = (await response.json().catch(() => ({}))) as { url?: string };
      if (data.url) window.open(data.url, "_blank", "noopener");
    } finally {
      setDownloading(false);
    }
  }

  async function loadContents() {
    setContentsState("loading");
    try {
      const response = await fetch(`/api/admin/jobs/${job.id}/contents`);
      if (!response.ok) throw new Error();
      setContents((await response.json()) as ZipContents);
      setContentsState("idle");
    } catch {
      setContentsState("failed");
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-2xl border border-border bg-muted/30 p-4 sm:ml-13">
      {/* status + download */}
      <div className="flex flex-wrap items-center gap-2">
        {DATA_JOB_ADMIN_STATUSES.map((status) => (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={job.status === status ? "default" : "outline"}
            disabled={saving !== null}
            onClick={() =>
              void patch(
                status === "published" && publishedCount.trim() !== ""
                  ? { status, publishedCount: Number(publishedCount) }
                  : { status },
                status,
              )
            }
          >
            {saving === status ? <Loader2Icon className="animate-spin" /> : null}
            {t(`status.${status}`)}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={downloading} onClick={() => void openDownload()}>
          {downloading ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
          {t("download")}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`published-${job.id}`}>
            {t("publishedCountLabel")}
          </label>
          <Input
            id={`published-${job.id}`}
            type="number"
            min={0}
            value={publishedCount}
            onChange={(event) => setPublishedCount(event.target.value)}
            className="mt-1 bg-background"
          />
        </div>
      </div>

      {/* review note back to the submitter */}
      <div>
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`note-${job.id}`}>
          {t("reviewNoteLabel")}
        </label>
        <Textarea
          id={`note-${job.id}`}
          value={reviewNote}
          rows={2}
          maxLength={2000}
          placeholder={t("reviewNotePlaceholder")}
          onChange={(event) => setReviewNote(event.target.value)}
          className="mt-1 bg-background"
        />
        <div className="mt-2 flex items-center gap-2.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving !== null}
            onClick={() => void patch({ reviewNote }, "note")}
          >
            {saving === "note" ? <Loader2Icon className="animate-spin" /> : null}
            {t("saveNote")}
          </Button>
          {saveState === "saved" ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-primary">
              <CheckIcon className="size-4" />
              {t("saved")}
            </span>
          ) : null}
          {saveState === "failed" ? <span className="text-sm text-destructive">{t("saveFailed")}</span> : null}
        </div>
      </div>

      {/* remote archive inspection */}
      <div>
        {contents === null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={contentsState === "loading" || job.status === "uploading"}
            onClick={() => void loadContents()}
          >
            {contentsState === "loading" ? <Loader2Icon className="animate-spin" /> : <FolderSearchIcon />}
            {t("inspect")}
          </Button>
        ) : (
          <ContentsView jobId={job.id} contents={contents} />
        )}
        {contentsState === "failed" ? (
          <p className="mt-2 text-sm text-destructive">{t("inspectFailed")}</p>
        ) : null}
      </div>
    </div>
  );
}

function ContentsView({ jobId, contents }: { jobId: string; contents: ZipContents }) {
  const t = useTranslations("common.adminDataJobs");
  const [preview, setPreview] = useState<{ path: string; rows: string[][] } | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "failed">("idle");

  const csvEntries = contents.entries.filter((entry) => /\.(csv|tsv|txt)$/i.test(entry.path));

  async function loadPreview(path: string) {
    setPreviewState("loading");
    setPreview(null);
    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/contents?path=${encodeURIComponent(path)}`);
      const data = (await response.json().catch(() => ({}))) as { text?: string };
      if (!response.ok || typeof data.text !== "string") throw new Error();
      const parsed = Papa.parse<string[]>(data.text, { preview: 16, skipEmptyLines: true });
      setPreview({ path, rows: parsed.data.map((row) => row.slice(0, 8)) });
      setPreviewState("idle");
    } catch {
      setPreviewState("failed");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t("contentsSummary", {
          entries: contents.totalEntries,
          size: formatBytes(contents.totalUncompressedBytes),
        })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {contents.byExtension.slice(0, 8).map((bucket) => (
          <span
            key={bucket.extension}
            className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
          >
            .{bucket.extension} × {bucket.count} · {formatBytes(bucket.bytes)}
          </span>
        ))}
      </div>

      {csvEntries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {csvEntries.slice(0, 10).map((entry) => (
            <Button
              key={entry.path}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 max-w-full px-2 text-xs"
              disabled={previewState === "loading"}
              onClick={() => void loadPreview(entry.path)}
            >
              <FileSpreadsheetIcon className="size-3" />
              <span className="truncate">{entry.path.split("/").pop()}</span>
            </Button>
          ))}
        </div>
      ) : null}

      {previewState === "loading" ? (
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          {t("previewLoading")}
        </p>
      ) : null}
      {previewState === "failed" ? <p className="text-xs text-destructive">{t("previewFailed")}</p> : null}

      {preview ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-background">
          <table className="w-full text-left text-xs">
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={cn(rowIndex === 0 && "bg-muted/50 font-medium")}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="max-w-48 truncate border-b border-border/60 px-2.5 py-1.5">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">{preview.path}</p>
        </div>
      ) : null}
    </div>
  );
}
