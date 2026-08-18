"use client";

import type { ComponentType } from "react";
import type { TimelinePreviewPayload } from "../../shared/timelineFeedViewModel";
import { DocumentPreviewRenderer } from "../renderers/previews/DocumentPreviewRenderer";
import { ExternalLinkPreviewRenderer } from "../renderers/previews/ExternalLinkPreviewRenderer";
import { MediaPreviewRenderer } from "../renderers/previews/MediaPreviewRenderer";
import { SitePreviewRenderer } from "../renderers/previews/SitePreviewRenderer";
import { SoundscapePreviewRenderer } from "../renderers/previews/SoundscapePreviewRenderer";
import { TextPreviewRenderer } from "../renderers/previews/TextPreviewRenderer";

type PreviewRendererProps = { preview: TimelinePreviewPayload };

const PREVIEW_RENDERER_REGISTRY = {
  site: SitePreviewRenderer,
  image: MediaPreviewRenderer,
  video: MediaPreviewRenderer,
  audio: MediaPreviewRenderer,
  soundscape: SoundscapePreviewRenderer,
  pdf: DocumentPreviewRenderer,
  document: DocumentPreviewRenderer,
  link: ExternalLinkPreviewRenderer,
  text: TextPreviewRenderer,
} satisfies Record<TimelinePreviewPayload["kind"], ComponentType<PreviewRendererProps>>;

export function TimelinePreviewRenderer({ preview }: PreviewRendererProps) {
  const Renderer = PREVIEW_RENDERER_REGISTRY[preview.kind];
  // Keep a single renderer instance across same-kind switches for images and
  // soundscapes, so the previous picture/dial stays on screen until the next
  // one is ready (no blank flash between an entry's tiles). The soundscape
  // renderer handles the href change internally, holding the old dial while
  // the new record loads. Other kinds (audio/video/document/pdf) keep a
  // href-based key so their element and internal state reset with the source.
  const key =
    preview.kind === "image" || preview.kind === "soundscape"
      ? preview.kind
      : `${preview.kind}:${preview.href}:${preview.fileName ?? ""}`;
  return <Renderer key={key} preview={preview} />;
}
