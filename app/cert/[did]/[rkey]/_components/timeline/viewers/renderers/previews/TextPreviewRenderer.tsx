"use client";

import type { TimelinePreviewPayload } from "../../../shared/timelineFeedViewModel";

export function TextPreviewRenderer({ preview }: { preview: TimelinePreviewPayload }) {
  if (preview.kind !== "text") return null;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <p className="text-sm font-medium text-foreground">{preview.title}</p>
      {preview.body ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{preview.body}</p>
      ) : null}
    </div>
  );
}
