"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TimelinePreviewPayload } from "../../../shared/timelineFeedViewModel";

export function getSafeLinkHref(href: string): string | null {
  try {
    const parsed = new URL(href);
    return ["http:", "https:", "blob:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function ExternalLinkPreviewRenderer({ preview }: { preview: TimelinePreviewPayload }) {
  const t = useTranslations("bumicert.detail.timelineEntry");

  if (preview.kind !== "link") return null;

  const safeHref = getSafeLinkHref(preview.href);
  if (!safeHref) return null;

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm text-foreground hover:bg-muted/30"
    >
      {t("openLinkedFile")}
      <ExternalLinkIcon className="h-4 w-4" />
    </a>
  );
}
