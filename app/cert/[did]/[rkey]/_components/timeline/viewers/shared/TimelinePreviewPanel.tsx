"use client";

import type { TimelinePreviewPayload } from "../../shared/timelineFeedViewModel";
import { TimelinePreviewRenderer } from "./TimelinePreviewRenderer";

export function TimelinePreviewPanel({ preview }: { preview: TimelinePreviewPayload | null }) {
  if (!preview) return null;
  return <TimelinePreviewRenderer preview={preview} />;
}
