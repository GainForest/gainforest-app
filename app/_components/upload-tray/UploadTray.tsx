"use client";

/**
 * The background upload tray: a small docked panel (a bottom sheet on phones)
 * that shows every recording still on its way to the account. It appears the
 * moment an upload starts and can be collapsed to a single line, so people
 * can keep using the app while a whole SD card transfers.
 *
 * The queue itself lives in `upload-tray-context` — this file is only the
 * presentation of it.
 */

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ChevronDownIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadTray, type UploadTrayItem } from "./upload-tray-context";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function UploadTray() {
  const t = useTranslations("common.uploadTray");
  const {
    items,
    busy,
    expanded,
    setExpanded,
    pauseItem,
    resumeItem,
    retryItem,
    cancelItem,
    cancelAll,
    dismiss,
  } = useUploadTray();

  // Other floating chrome (the Tainá guide) reads this to step out of the
  // tray's way instead of ending up underneath it.
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const panel = panelRef.current;
    if (!panel) {
      root.style.removeProperty("--upload-tray-height");
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty("--upload-tray-height", `${Math.round(entry.contentRect.height)}px`);
    });
    observer.observe(panel);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--upload-tray-height");
    };
  }, [items.length > 0]);

  const total = items.length;
  const done = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "error").length;
  const remaining = total - done;
  const active = items.find(
    (item) => item.status === "uploading" || item.status === "retrying" || item.status === "saving",
  );
  const paused = items.some((item) => item.status === "paused");

  // Files carry their share of the bar; the one in flight adds its own progress.
  const overall = total > 0 ? ((done + (active ? active.progress : 0)) / total) * 100 : 0;
  const remainingBytes = items
    .filter((item) => item.status !== "done")
    .reduce((sum, item) => sum + item.sizeBytes, 0);
  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);

  const headline = active
    ? t("headlineUploading")
    : failed > 0
      ? t("headlineFailed")
      : paused
        ? t("headlinePaused")
        : remaining > 0
          ? t("headlineWaiting")
          : t("headlineDone");

  return (
    <AnimatePresence>
      {total > 0 ? (
        <motion.section
          key="upload-tray"
          ref={panelRef}
          aria-label={t("label")}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[75] overflow-hidden border-t border-border bg-background",
            "shadow-[0_-14px_34px_-18px_rgba(20,20,19,0.3)] rounded-t-2xl",
            "sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[372px] sm:rounded-2xl sm:border",
            "sm:shadow-[0_18px_40px_-12px_rgba(20,20,19,0.22),0_2px_6px_rgba(20,20,19,0.06)]",
          )}
        >
          {/* Sheet grabber — phones only */}
          <div className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-9 rounded-full bg-border" />
          </div>

          <header className="flex items-center gap-2.5 px-4 py-3 sm:px-4 sm:py-3">
            <h2 className="text-sm font-semibold text-foreground">{headline}</h2>
            <span className="flex-1" />
            <span className="font-mono text-xs text-muted-foreground">
              {done}/{total}
            </span>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-label={expanded ? t("collapse") : t("expand")}
              className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDownIcon
                className={cn("size-4 transition-transform", expanded ? "" : "rotate-180")}
              />
            </button>
          </header>

          {/* Overall progress — the batch as a whole; a single failed file is
              called out on its own row rather than reddening everything. */}
          <div className="h-0.5 bg-muted">
            <div
              className="h-0.5 bg-primary transition-[width] duration-300"
              style={{ width: `${overall}%` }}
            />
          </div>

          {expanded ? (
            <>
              <ul className="max-h-[296px] overflow-y-auto overscroll-contain">
                {items.map((item) => (
                  <TrayRow
                    key={item.id}
                    item={item}
                    onPause={() => pauseItem(item.id)}
                    onResume={() => resumeItem(item.id)}
                    onRetry={() => retryItem(item.id)}
                    onCancel={() => cancelItem(item.id)}
                  />
                ))}
              </ul>

              <footer className="flex items-center gap-2 border-t border-border/60 bg-muted/30 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-2.5">
                <p className="font-mono text-[11px] text-muted-foreground">
                  {remaining > 0
                    ? t("remaining", { count: remaining, total, size: formatBytes(remainingBytes) })
                    : t("allUploaded", { count: total, size: formatBytes(totalBytes) })}
                </p>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={busy ? cancelAll : dismiss}
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-1 text-xs transition-colors",
                    busy
                      ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {busy ? t("cancelAll") : t("hide")}
                </button>
              </footer>
            </>
          ) : null}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

function TrayRow({
  item,
  onPause,
  onResume,
  onRetry,
  onCancel,
}: {
  item: UploadTrayItem;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common.uploadTray");
  const percent = Math.round(item.progress * 100);
  const isDone = item.status === "done";
  const isError = item.status === "error";
  const isPaused = item.status === "paused";
  const showBar =
    item.status === "uploading" || item.status === "retrying" || isPaused || isError;

  const label = (() => {
    switch (item.status) {
      case "done":
        return t("statusDone");
      case "error":
        return t("statusFailed");
      case "paused":
        return t("statusPaused", { percent });
      case "saving":
        return t("statusSaving");
      case "retrying":
        return t("statusRetrying", { attempt: item.retryAttempt ?? 2, max: item.retryMax ?? 4 });
      case "uploading":
        return `${percent}%`;
      default:
        return t("statusQueued");
    }
  })();

  return (
    <li className="flex items-center gap-2.5 border-t border-border/60 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              isDone ? "text-muted-foreground" : "text-foreground",
            )}
            title={item.name}
          >
            {item.name}
          </p>
          <span
            className={cn(
              "shrink-0 font-mono text-[11px]",
              isError ? "text-destructive" : isDone ? "text-primary" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
        </div>
        {showBar ? (
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                isError ? "bg-destructive" : isPaused ? "bg-muted-foreground/50" : "bg-primary",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
        {isError && item.error ? (
          <p className="mt-1 text-[11px] leading-snug text-destructive">{item.error}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {item.status === "uploading" || item.status === "retrying" ? (
          <IconButton label={t("pause")} onClick={onPause} bordered>
            <PauseIcon className="size-3.5 fill-current" />
          </IconButton>
        ) : null}
        {isPaused ? (
          <IconButton label={t("resume")} onClick={onResume} bordered>
            <PlayIcon className="size-3.5 fill-current" />
          </IconButton>
        ) : null}
        {isError ? (
          <button
            type="button"
            onClick={onRetry}
            className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted sm:h-7"
          >
            {t("retry")}
          </button>
        ) : null}
        {!isDone ? (
          <IconButton label={t("cancel")} onClick={onCancel}>
            <XIcon className="size-3.5" />
          </IconButton>
        ) : (
          <span className="grid size-8 place-items-center text-primary sm:size-7">
            <CheckIcon className="size-4" />
          </span>
        )}
      </div>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  bordered,
  children,
}: {
  label: string;
  onClick: () => void;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-lg transition-colors sm:size-7",
        bordered
          ? "border border-border text-foreground hover:bg-muted"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
