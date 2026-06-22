"use client";

import { DownloadIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TimelinePreviewPayload } from "../../../shared/timelineFeedViewModel";

function getSafeHref(href: string): string | null {
  try {
    const base = typeof window === "undefined" ? "https://local.invalid" : window.location.href;
    const parsed = new URL(href, base);
    return ["http:", "https:", "blob:", "data:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function DocumentActions({
  preview,
  safeHref,
}: {
  preview: TimelinePreviewPayload;
  safeHref: string | null;
}) {
  const t = useTranslations("bumicert.detail.timelineEntry");
  const fileLabel = preview.fileName?.trim() || preview.title;
  const actionClassName =
    "inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/40";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-xs">
          <FileTextIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{preview.title}</p>
          <p className="truncate text-xs text-muted-foreground">{fileLabel}</p>
        </div>
      </div>

      {safeHref ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={safeHref} target="_blank" rel="noreferrer" className={actionClassName}>
            {t("openFile")}
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
          <a href={safeHref} download={fileLabel} className={actionClassName}>
            {t("downloadFile")}
            <DownloadIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function DocumentPreviewRenderer({ preview }: { preview: TimelinePreviewPayload }) {
  const t = useTranslations("bumicert.detail.timelineEntry");

  if (preview.kind !== "pdf" && preview.kind !== "document") return null;

  const safeHref = getSafeHref(preview.href);
  if (!safeHref) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
        {t("previewUnavailable")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DocumentActions preview={preview} safeHref={safeHref} />
      {preview.kind === "pdf" ? (
        <iframe
          src={safeHref}
          className="h-[420px] w-full rounded-xl border border-border/60"
          title={preview.fileName ?? preview.title}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
    </div>
  );
}
