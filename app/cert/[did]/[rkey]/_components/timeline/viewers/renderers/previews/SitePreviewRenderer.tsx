"use client";

import type { TimelinePreviewPayload } from "../../../shared/timelineFeedViewModel";

export function SitePreviewRenderer({ preview }: { preview: TimelinePreviewPayload }) {
  if (preview.kind !== "site") return null;

  return (
    <iframe
      title={preview.title}
      src={preview.href}
      className="h-[420px] w-full rounded-xl border border-border/60 bg-muted/20"
      loading="lazy"
      sandbox="allow-scripts allow-forms allow-popups"
      referrerPolicy="no-referrer"
    />
  );
}
