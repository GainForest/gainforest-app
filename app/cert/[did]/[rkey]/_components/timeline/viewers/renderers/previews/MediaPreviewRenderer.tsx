"use client";

import type { TimelinePreviewPayload } from "../../../shared/timelineFeedViewModel";

export function MediaPreviewRenderer({ preview }: { preview: TimelinePreviewPayload }) {
  if (preview.kind === "image") {
    return (
      <a
        href={preview.href}
        target="_blank"
        rel="noreferrer"
        // Fixed-height letterbox frame: the box keeps a stable height regardless of
        // which image is selected or whether it has finished loading. Without this
        // the <img> collapses to 0px height while a newly selected tile loads,
        // which made the panel (and everything below it) jump — a visible flicker
        // when stepping through the evidence timeline.
        className="flex h-[300px] items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30 sm:h-[420px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview.href}
          alt={preview.title}
          className="h-full w-full object-contain"
          decoding="async"
        />
      </a>
    );
  }

  if (preview.kind === "audio") {
    return <audio src={preview.href} controls className="w-full" />;
  }

  if (preview.kind === "video") {
    return (
      <video
        src={preview.href}
        controls
        className="max-h-[420px] w-full rounded-xl border border-border/60 bg-black"
      />
    );
  }

  return null;
}
