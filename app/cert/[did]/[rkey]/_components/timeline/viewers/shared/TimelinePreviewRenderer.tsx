"use client";

import type { ComponentType } from "react";
import type { TimelinePreviewPayload } from "../../shared/timelineFeedViewModel";
import { DocumentPreviewRenderer } from "../renderers/previews/DocumentPreviewRenderer";
import { ExternalLinkPreviewRenderer } from "../renderers/previews/ExternalLinkPreviewRenderer";
import { MediaPreviewRenderer } from "../renderers/previews/MediaPreviewRenderer";
import { SitePreviewRenderer } from "../renderers/previews/SitePreviewRenderer";
import { TextPreviewRenderer } from "../renderers/previews/TextPreviewRenderer";

type PreviewRendererProps = { preview: TimelinePreviewPayload };

const PREVIEW_RENDERER_REGISTRY = {
  site: SitePreviewRenderer,
  image: MediaPreviewRenderer,
  video: MediaPreviewRenderer,
  audio: MediaPreviewRenderer,
  pdf: DocumentPreviewRenderer,
  document: DocumentPreviewRenderer,
  link: ExternalLinkPreviewRenderer,
  text: TextPreviewRenderer,
} satisfies Record<TimelinePreviewPayload["kind"], ComponentType<PreviewRendererProps>>;

export function TimelinePreviewRenderer({ preview }: PreviewRendererProps) {
  const Renderer = PREVIEW_RENDERER_REGISTRY[preview.kind];
  // Keep a single <img> element across image-to-image switches so the browser
  // holds the previous picture until the next one decodes (no blank flash). Other
  // kinds (audio/video/document/pdf) keep a href-based key so their element and
  // any internal state are reset when the source changes.
  const key =
    preview.kind === "image"
      ? "image"
      : `${preview.kind}:${preview.href}:${preview.fileName ?? ""}`;
  return <Renderer key={key} preview={preview} />;
}
