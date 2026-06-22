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
  return <Renderer key={`${preview.kind}:${preview.href}:${preview.fileName ?? ""}`} preview={preview} />;
}
