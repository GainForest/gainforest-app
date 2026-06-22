"use client";

import type { TimelinePreviewPayload } from "../../../shared/timelineFeedViewModel";

export function MediaPreviewRenderer({ preview }: { preview: TimelinePreviewPayload }) {
  if (preview.kind === "image") {
    return (
      <a
        href={preview.href}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-xl border border-border/60 bg-muted/30"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview.href}
          alt={preview.title}
          className="max-h-[420px] w-full object-contain"
          loading="lazy"
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
