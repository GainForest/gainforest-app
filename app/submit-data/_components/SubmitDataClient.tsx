"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArchiveIcon,
  CheckIcon,
  CloudUploadIcon,
  Loader2Icon,
  LockIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import { AuthModal } from "@/app/_components/AuthFlow";
import { formatBytes, formatRelative } from "@/app/_lib/format";
import {
  DATA_JOBS_MAX_BYTES,
  DATA_JOBS_MAX_NOTES_CHARS,
  DATA_JOBS_MAX_PROJECT_CHARS,
  type DataJob,
  type DataJobStatus,
} from "@/app/_lib/data-jobs-shared";

const PART_CONCURRENCY = 4;
const PART_RETRIES = 3;

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-border bg-card/90 p-6 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SubmitDataClient({ signedIn, configured }: { signedIn: boolean; configured: boolean }) {
  const t = useTranslations("common.dataJobs");
  if (!signedIn) return <SignInCard />;
  if (!configured) {
    return (
      <Card>
        <p className="text-sm leading-6 text-muted-foreground">{t("notConfigured")}</p>
      </Card>
    );
  }
  return <SubmitFlow />;
}

/* -------------------------------- signed out ------------------------------- */

// Rides on the normal sign-in — no separate login for batch submissions.
function SignInCard() {
  const t = useTranslations("common.dataJobs.signIn");
  const { pushModal, show } = useModal();

  return (
    <Card className="self-start">
      <div className="flex size-10 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
        <LockIcon className="size-4.5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t("description")}</p>
      <Button
        type="button"
        size="lg"
        className="mt-5 w-full"
        onClick={() => {
          pushModal({ id: "auth-modal", content: <AuthModal /> });
          show();
        }}
      >
        {t("button")}
      </Button>
    </Card>
  );
}

/* --------------------------------- signed in -------------------------------- */

type Phase =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "uploading"; jobId: string; uploadedBytes: number; totalBytes: number }
  | { kind: "finishing"; jobId: string }
  | { kind: "done" };

function SubmitFlow() {
  const t = useTranslations("common.dataJobs");
  const [file, setFile] = useState<File | null>(null);
  const [project, setProject] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<DataJob[] | null>(null);
  const [hasAgentKey, setHasAgentKey] = useState(false);
  const [dragging, setDragging] = useState(false);
  const cancelRef = useRef<{ cancelled: boolean; xhrs: Set<XMLHttpRequest> }>({
    cancelled: false,
    xhrs: new Set(),
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshJobs = useCallback(() => {
    fetch("/api/jobs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { jobs?: DataJob[]; hasAgentKey?: boolean } | null) => {
        if (data?.jobs) setJobs(data.jobs);
        if (data) setHasAgentKey(Boolean(data.hasAgentKey));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  // Leaving the page kills an in-flight multi-GB upload — warn first.
  const uploading = phase.kind === "creating" || phase.kind === "uploading" || phase.kind === "finishing";
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  function acceptFile(candidate: File | null | undefined) {
    setError(null);
    if (!candidate) return;
    if (!/\.zip$/i.test(candidate.name)) {
      setError(t("errors.zipOnly"));
      return;
    }
    if (candidate.size > DATA_JOBS_MAX_BYTES) {
      setError(t("errors.tooLarge", { max: formatBytes(DATA_JOBS_MAX_BYTES) }));
      return;
    }
    setFile(candidate);
  }

  async function submit() {
    if (!file || uploading) return;
    setError(null);
    cancelRef.current = { cancelled: false, xhrs: new Set() };
    setPhase({ kind: "creating" });

    let jobId: string | null = null;
    try {
      // 1. Register the job (mints the publish-on-behalf key on first consent)
      //    and open the multipart upload.
      const createResponse = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          sizeBytes: file.size,
          project,
          notes,
          consent: consent || hasAgentKey,
        }),
      });
      const created = (await createResponse.json().catch(() => ({}))) as {
        jobId?: string;
        partSizeBytes?: number;
        partCount?: number;
        error?: string;
      };
      if (!createResponse.ok || !created.jobId || !created.partSizeBytes) {
        throw new Error(created.error ?? "create_failed");
      }
      jobId = created.jobId;
      const partSize = created.partSizeBytes;
      const partCount = Math.max(1, Math.ceil(file.size / partSize));

      // 2. Stream parts straight to storage with presigned URLs.
      setPhase({ kind: "uploading", jobId, uploadedBytes: 0, totalBytes: file.size });
      const partProgress = new Map<number, number>();
      const reportProgress = () => {
        let sum = 0;
        for (const bytes of partProgress.values()) sum += bytes;
        setPhase((current) =>
          current.kind === "uploading" ? { ...current, uploadedBytes: Math.min(sum, file.size) } : current,
        );
      };

      const etags = new Array<{ partNumber: number; etag: string }>(partCount);
      let nextPart = 1;
      const worker = async () => {
        while (!cancelRef.current.cancelled) {
          const partNumber = nextPart++;
          if (partNumber > partCount) return;
          const blob = file.slice((partNumber - 1) * partSize, Math.min(partNumber * partSize, file.size));
          const etag = await uploadPartWithRetry(jobId!, partNumber, blob, cancelRef.current, (loaded) => {
            partProgress.set(partNumber, loaded);
            reportProgress();
          });
          etags[partNumber - 1] = { partNumber, etag };
          partProgress.set(partNumber, blob.size);
          reportProgress();
        }
      };
      await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, worker));
      if (cancelRef.current.cancelled) return;

      // 3. Assemble the archive and hand the job to the review team.
      setPhase({ kind: "finishing", jobId });
      const completeResponse = await fetch(`/api/jobs/${jobId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts: etags.filter(Boolean) }),
      });
      if (!completeResponse.ok) throw new Error("complete_failed");

      setPhase({ kind: "done" });
      setFile(null);
      setProject("");
      setNotes("");
      setConsent(false);
      refreshJobs();
    } catch {
      if (!cancelRef.current.cancelled) {
        setError(t("errors.uploadFailed"));
        setPhase({ kind: "idle" });
        if (jobId) {
          fetch(`/api/jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
        }
      }
    }
  }

  function cancelUpload() {
    const jobId = phase.kind === "uploading" || phase.kind === "finishing" ? phase.jobId : null;
    cancelRef.current.cancelled = true;
    for (const xhr of cancelRef.current.xhrs) xhr.abort();
    setPhase({ kind: "idle" });
    if (jobId) {
      fetch(`/api/jobs/${jobId}`, { method: "DELETE" })
        .catch(() => {})
        .finally(refreshJobs);
    }
  }

  const percent =
    phase.kind === "uploading" && phase.totalBytes > 0
      ? Math.floor((phase.uploadedBytes / phase.totalBytes) * 100)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-lg font-semibold text-foreground">{t("form.title")}</h2>

        {/* Drop zone */}
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!uploading) acceptFile(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/[0.06]" : "border-border bg-muted/30 hover:bg-muted/50",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />
          <span className="flex size-10 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
            {file ? <ArchiveIcon className="size-4.5" /> : <CloudUploadIcon className="size-4.5" />}
          </span>
          {file ? (
            <>
              <span className="max-w-full truncate text-sm font-medium text-foreground">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatBytes(file.size)} · {t("form.replaceFile")}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-foreground">{t("form.dropHint")}</span>
              <span className="text-xs text-muted-foreground">
                {t("form.dropSubHint", { max: formatBytes(DATA_JOBS_MAX_BYTES) })}
              </span>
            </>
          )}
        </label>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="data-jobs-project">{t("form.projectLabel")}</Label>
            <Input
              id="data-jobs-project"
              value={project}
              maxLength={DATA_JOBS_MAX_PROJECT_CHARS}
              disabled={uploading}
              placeholder={t("form.projectPlaceholder")}
              onChange={(event) => setProject(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="data-jobs-notes">{t("form.notesLabel")}</Label>
            <Textarea
              id="data-jobs-notes"
              value={notes}
              rows={3}
              maxLength={DATA_JOBS_MAX_NOTES_CHARS}
              disabled={uploading}
              placeholder={t("form.notesPlaceholder")}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1.5"
            />
          </div>

          {hasAgentKey ? (
            <p className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2.5 text-sm leading-6 text-foreground">
              <ShieldCheckIcon className="mt-1 size-4 shrink-0 text-primary" />
              <span>
                {t("form.consentGranted")}{" "}
                <Link href="/settings" className="underline underline-offset-4">
                  {t("form.consentManage")}
                </Link>
              </span>
            </p>
          ) : (
            <label className="flex items-start gap-2.5 text-sm leading-6 text-foreground">
              <Checkbox
                checked={consent}
                disabled={uploading}
                onCheckedChange={(checked) => setConsent(checked === true)}
                className="mt-1"
              />
              <span>
                {t("form.consentLabel")}
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {t("form.consentHint")}
                </span>
              </span>
            </label>
          )}
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {phase.kind === "uploading" || phase.kind === "creating" || phase.kind === "finishing" ? (
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 font-medium text-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {phase.kind === "creating"
                  ? t("form.preparing")
                  : phase.kind === "finishing"
                    ? t("form.finishing")
                    : t("form.uploading")}
              </span>
              {percent !== null ? <span className="tabular-nums text-muted-foreground">{percent}%</span> : null}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${percent ?? 5}%` }}
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t("form.keepOpen")}</p>
              <Button type="button" variant="ghost" size="sm" onClick={cancelUpload}>
                <XIcon />
                {t("form.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            className="mt-5 w-full"
            disabled={!file || (!consent && !hasAgentKey)}
            onClick={() => void submit()}
          >
            <CloudUploadIcon />
            {t("form.submit")}
          </Button>
        )}

        {phase.kind === "done" ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2.5 text-sm leading-6 text-foreground">
            <CheckIcon className="mt-1 size-4 shrink-0 text-primary" />
            {t("done.description")}
          </p>
        ) : null}
      </Card>

      <JobsCard jobs={jobs} onChanged={refreshJobs} />
    </div>
  );
}

/** Presign + PUT one part directly to the bucket, with per-attempt fresh URLs. */
async function uploadPartWithRetry(
  jobId: string,
  partNumber: number,
  blob: Blob,
  cancel: { cancelled: boolean; xhrs: Set<XMLHttpRequest> },
  onProgress: (loadedBytes: number) => void,
): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= PART_RETRIES; attempt++) {
    if (cancel.cancelled) throw new Error("cancelled");
    try {
      const presignResponse = await fetch(`/api/jobs/${jobId}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partNumbers: [partNumber] }),
      });
      const presigned = (await presignResponse.json().catch(() => ({}))) as {
        urls?: { partNumber: number; url: string }[];
      };
      const url = presigned.urls?.[0]?.url;
      if (!presignResponse.ok || !url) throw new Error("presign_failed");
      return await putPart(url, blob, cancel, onProgress);
    } catch (error) {
      lastError = error;
      if (cancel.cancelled) throw error;
      onProgress(0);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError ?? new Error("part_failed");
}

// XMLHttpRequest instead of fetch for upload progress events. The bucket's
// CORS policy must expose the ETag header — it identifies the stored part.
function putPart(
  url: string,
  blob: Blob,
  cancel: { cancelled: boolean; xhrs: Set<XMLHttpRequest> },
  onProgress: (loadedBytes: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    cancel.xhrs.add(xhr);
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onerror = () => {
      cancel.xhrs.delete(xhr);
      reject(new Error("network_error"));
    };
    xhr.onabort = () => {
      cancel.xhrs.delete(xhr);
      reject(new Error("cancelled"));
    };
    xhr.onload = () => {
      cancel.xhrs.delete(xhr);
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) {
        resolve(etag);
      } else {
        reject(new Error(`part_status_${xhr.status}`));
      }
    };
    xhr.send(blob);
  });
}

/* --------------------------------- job list -------------------------------- */

const STATUS_STYLES: Record<DataJobStatus, string> = {
  uploading: "bg-muted text-muted-foreground",
  received: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  inReview: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  published: "bg-primary/10 text-primary",
  needsAttention: "bg-destructive/10 text-destructive",
};

function JobsCard({ jobs, onChanged }: { jobs: DataJob[] | null; onChanged: () => void }) {
  const t = useTranslations("common.dataJobs");

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground">{t("jobs.title")}</h2>
      {jobs === null ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("jobs.empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border/70">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function JobRow({ job, onChanged }: { job: DataJob; onChanged: () => void }) {
  const t = useTranslations("common.dataJobs");
  const [busy, setBusy] = useState(false);

  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium text-foreground">
          {job.filename}
        </span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[job.status])}>
          {t(`status.${job.status}`)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{formatBytes(job.sizeBytes)}</span>
        {job.project ? <span className="truncate">{job.project}</span> : null}
        <span>{t("jobs.submitted", { when: formatRelative(job.createdAt) })}</span>
        {job.status === "published" && job.publishedCount ? (
          <span className="text-primary">{t("jobs.publishedCount", { count: job.publishedCount })}</span>
        ) : null}
        {job.status === "uploading" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              fetch(`/api/jobs/${job.id}`, { method: "DELETE" })
                .catch(() => {})
                .finally(() => {
                  setBusy(false);
                  onChanged();
                });
            }}
          >
            {t("jobs.cancel")}
          </Button>
        ) : null}
      </div>
      {job.reviewNote ? (
        <p className="mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground">
          {job.reviewNote}
        </p>
      ) : null}
    </li>
  );
}
