"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  Loader2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { TimelinePreviewPayload } from "../../../shared/timelineFeedViewModel";
import {
  getTimelineDocumentDefaultExtension,
  getTimelineDocumentFallbackMimeType,
  getTimelineDocumentFormatExtensions,
  type TimelineDocumentFormat,
} from "../../../shared/timelineDocumentFormats";

interface DocumentPreviewRendererProps {
  preview: TimelinePreviewPayload;
}

type DocumentLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      objectUrl?: string;
      text?: string;
      truncated?: boolean;
      contentType?: string | null;
    }
  | { status: "error" };

const TEXT_PREVIEW_LIMIT = 150_000;
const FETCHABLE_FORMATS = new Set<TimelineDocumentFormat>([
  "pdf",
  "text",
  "markdown",
  "html",
  "rtf",
]);
const TEXT_FORMATS = new Set<TimelineDocumentFormat>([
  "text",
  "markdown",
  "rtf",
]);

function getDocumentFormat(preview: TimelinePreviewPayload): TimelineDocumentFormat {
  if (preview.documentFormat) return preview.documentFormat;
  return preview.kind === "pdf" ? "pdf" : "document";
}

function getSafeHref(href: string): string | null {
  try {
    const base = typeof window === "undefined" ? "https://local.invalid" : window.location.href;
    const parsed = new URL(href, base);
    return ["http:", "https:", "blob:", "data:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function getFetchableHref(href: string | null): string | null {
  if (!href) return null;
  return href.startsWith("http:") || href.startsWith("https:") || href.startsWith("blob:") || href.startsWith("data:")
    ? href
    : null;
}

function getExistingExtension(fileName: string): string | null {
  const match = fileName.match(/\.([a-z0-9]{1,12})$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function normalizeContentType(
  contentType: string | null,
  format: TimelineDocumentFormat,
): string {
  const fallback = getTimelineDocumentFallbackMimeType(format);
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (!normalized || normalized === "application/octet-stream") {
    return fallback;
  }

  return contentType ?? fallback;
}

function isPdfContentType(contentType: string): boolean {
  return contentType.split(";")[0]?.trim().toLowerCase() === "application/pdf";
}

async function hasPdfHeader(blob: Blob): Promise<boolean> {
  const header = await blob.slice(0, 1024).text();
  return header.includes("%PDF-");
}

async function getSafePdfBlob(
  blob: Blob,
  contentType: string,
): Promise<Blob> {
  if (!isPdfContentType(contentType) && !(await hasPdfHeader(blob))) {
    throw new Error("not-pdf");
  }

  return new Blob([blob], { type: "application/pdf" });
}

function getDownloadFileName(
  preview: TimelinePreviewPayload,
  format: TimelineDocumentFormat,
): string {
  const rawName = preview.fileName?.trim() || preview.title.trim() || "document";
  const safeName = rawName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document";
  const existingExtension = getExistingExtension(safeName);
  const formatExtensions = getTimelineDocumentFormatExtensions(format);

  if (existingExtension && formatExtensions.includes(existingExtension)) {
    return safeName;
  }

  const extension = formatExtensions.includes(preview.extension ?? "")
    ? preview.extension
    : getTimelineDocumentDefaultExtension(format);

  if (!extension) {
    return safeName;
  }

  const baseName = existingExtension
    ? safeName.slice(0, -(existingExtension.length + 1))
    : safeName;
  return `${baseName || "document"}.${extension}`;
}

function canOpenObjectUrl(format: TimelineDocumentFormat): boolean {
  return format !== "html";
}

function LoadingPreview() {
  const t = useTranslations("bumicert.detail.timelineEntry");
  return (
    <div className="flex h-[420px] w-full items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-sm text-muted-foreground">
      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
      {t("documentPreviewLoading")}
    </div>
  );
}

function PreviewFallback({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
      <div className="flex items-start gap-2">
        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{message}</p>
      </div>
    </div>
  );
}

function DocumentToolbar({
  preview,
  format,
  safeHref,
  state,
  canFetchPreview,
}: {
  preview: TimelinePreviewPayload;
  format: TimelineDocumentFormat;
  safeHref: string | null;
  state: DocumentLoadState;
  canFetchPreview: boolean;
}) {
  const t = useTranslations("bumicert.detail.timelineEntry");
  const fileLabel = getDownloadFileName(preview, format);
  const formatLabels: Record<TimelineDocumentFormat, string> = {
    pdf: t("documentFormats.pdf"),
    text: t("documentFormats.text"),
    markdown: t("documentFormats.markdown"),
    html: t("documentFormats.html"),
    rtf: t("documentFormats.rtf"),
    word: t("documentFormats.word"),
    spreadsheet: t("documentFormats.spreadsheet"),
    presentation: t("documentFormats.presentation"),
    document: t("documentFormats.document"),
  };
  const objectUrl = state.status === "ready" ? state.objectUrl : null;
  const sourceFallbackHref =
    !canFetchPreview || state.status === "error" || format === "html"
      ? safeHref
      : null;
  const openHref = objectUrl && canOpenObjectUrl(format) ? objectUrl : sourceFallbackHref;
  const downloadHref = objectUrl ?? sourceFallbackHref;
  const isPreparingActions = canFetchPreview && state.status === "loading";
  const buttonClassName =
    "inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/40";
  const disabledButtonClassName =
    "inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-xs font-medium text-muted-foreground";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-xs">
          <FileTextIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{preview.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {fileLabel} · {formatLabels[format]}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {openHref ? (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClassName}
          >
            {t("openFile")}
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        ) : (
          <button type="button" disabled className={disabledButtonClassName}>
            {isPreparingActions ? t("preparingFile") : t("openFile")}
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {downloadHref ? (
          <a
            href={downloadHref}
            download={fileLabel}
            className={buttonClassName}
          >
            {t("downloadFile")}
            <DownloadIcon className="h-3.5 w-3.5" />
          </a>
        ) : (
          <button type="button" disabled className={disabledButtonClassName}>
            {isPreparingActions ? t("preparingFile") : t("downloadFile")}
            <DownloadIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function PdfPreview({
  state,
  title,
}: {
  state: DocumentLoadState;
  title: string;
}) {
  const t = useTranslations("bumicert.detail.timelineEntry");
  if (state.status === "loading") {
    return <LoadingPreview />;
  }

  if (state.status === "ready" && state.objectUrl) {
    return (
      <iframe
        title={title}
        src={state.objectUrl}
        className="h-[420px] w-full rounded-xl border border-border/40 bg-muted/20"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  if (state.status === "error") {
    return <PreviewFallback message={t("documentPreviewPdfError")} />;
  }

  return <PreviewFallback message={t("documentPreviewPdfUnavailable")} />;
}

function TextDocumentPreview({
  state,
  title,
}: {
  state: DocumentLoadState;
  title: string;
}) {
  const t = useTranslations("bumicert.detail.timelineEntry");
  if (state.status === "loading") {
    return <LoadingPreview />;
  }

  if (state.status === "ready" && typeof state.text === "string") {
    return (
      <div className="rounded-xl border border-border/40 bg-background">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-foreground">
          {state.text || t("documentPreviewEmpty", { title })}
        </pre>
        {state.truncated ? (
          <p className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
            {t("documentPreviewTruncated")}
          </p>
        ) : null}
      </div>
    );
  }

  if (state.status === "error") {
    return <PreviewFallback message={t("documentPreviewTextError")} />;
  }

  return <PreviewFallback message={t("documentPreviewTextUnavailable")} />;
}

function HtmlDocumentPreview({
  state,
  title,
}: {
  state: DocumentLoadState;
  title: string;
}) {
  const t = useTranslations("bumicert.detail.timelineEntry");
  if (state.status === "loading") {
    return <LoadingPreview />;
  }

  if (state.status === "ready" && typeof state.text === "string") {
    return (
      <iframe
        title={title}
        srcDoc={state.text}
        className="h-[420px] w-full rounded-xl border border-border/40 bg-background"
        loading="lazy"
        sandbox=""
        referrerPolicy="no-referrer"
      />
    );
  }

  if (state.status === "error") {
    return <PreviewFallback message={t("documentPreviewHtmlError")} />;
  }

  return <PreviewFallback message={t("documentPreviewHtmlUnavailable")} />;
}

export function DocumentPreviewRenderer({ preview }: DocumentPreviewRendererProps) {
  const t = useTranslations("bumicert.detail.timelineEntry");
  const isDocumentPreview = preview.kind === "pdf" || preview.kind === "document";
  const format = getDocumentFormat(preview);
  const safeHref = useMemo(() => getSafeHref(preview.href), [preview.href]);
  const fetchableHref = useMemo(() => getFetchableHref(safeHref), [safeHref]);
  const canFetchPreview = Boolean(fetchableHref && FETCHABLE_FORMATS.has(format));
  const [state, setState] = useState<DocumentLoadState>(() =>
    canFetchPreview ? { status: "loading" } : { status: "idle" },
  );

  useEffect(() => {
    if (!canFetchPreview || !fetchableHref) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });
    const previewHref = fetchableHref;
    let createdObjectUrl: string | null = null;
    let cancelled = false;
    const controller = new AbortController();

    async function loadPreview() {
      try {
        const response = await fetch(previewHref, {
          credentials: "same-origin",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("not-ok");
        }

        const contentType = normalizeContentType(
          response.headers.get("content-type") ?? preview.mimeType ?? null,
          format,
        );
        const responseBlob = await response.blob();
        const blob =
          format === "pdf"
            ? await getSafePdfBlob(responseBlob, contentType)
            : new Blob([responseBlob], { type: contentType });
        createdObjectUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(createdObjectUrl);
          return;
        }

        if (format === "pdf") {
          setState({
            status: "ready",
            objectUrl: createdObjectUrl,
            contentType: blob.type,
          });
          return;
        }

        const text = await blob.text();
        if (cancelled) return;

        setState({
          status: "ready",
          objectUrl: createdObjectUrl,
          text: text.slice(0, TEXT_PREVIEW_LIMIT),
          truncated: text.length > TEXT_PREVIEW_LIMIT,
          contentType,
        });
      } catch {
        if (controller.signal.aborted || cancelled) return;
        setState({ status: "error" });
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
      controller.abort();
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [canFetchPreview, fetchableHref, format, preview.mimeType]);

  if (!isDocumentPreview) {
    return null;
  }

  if (!safeHref) {
    return <PreviewFallback message={t("previewUnavailable")} />;
  }

  return (
    <div className="space-y-3">
      <DocumentToolbar
        preview={preview}
        format={format}
        safeHref={safeHref}
        state={state}
        canFetchPreview={canFetchPreview}
      />

      {format === "pdf" ? <PdfPreview state={state} title={preview.title} /> : null}
      {format === "html" ? <HtmlDocumentPreview state={state} title={preview.title} /> : null}
      {TEXT_FORMATS.has(format) ? <TextDocumentPreview state={state} title={preview.title} /> : null}
      {format !== "pdf" && format !== "html" && !TEXT_FORMATS.has(format) ? (
        <PreviewFallback message={t("documentPreviewUnsupported")} />
      ) : null}
    </div>
  );
}
