import type { TimelineMapLayer } from "./timelineMapLayers";

export const GREEN_GLOBE_PREVIEW_SET_DATASET_LAYERS_MESSAGE_TYPE =
  "gainforest.greenGlobePreview.v1.setDatasetLayers";
export const GREEN_GLOBE_PREVIEW_READY_MESSAGE_TYPE =
  "gainforest.greenGlobePreview.v1.ready";

export type GreenGlobePreviewDatasetLayer = {
  datasetRef: string;
  title: string;
  siteRef: TimelineMapLayer["siteRef"];
};

export type GreenGlobePreviewSetDatasetLayersMessage = {
  type: typeof GREEN_GLOBE_PREVIEW_SET_DATASET_LAYERS_MESSAGE_TYPE;
  version: 1;
  source: "bumicerts";
  requestId: string;
  projectDid: string;
  datasetLayers: GreenGlobePreviewDatasetLayer[];
  activeDatasetRefs: string[];
  focusedDatasetRef: string | null;
  emptySelection: "clear";
  view: {
    fit: "active-dataset-bounds" | "preserve";
    animate: boolean;
  };
};

type GreenGlobePreviewReadyMessage = {
  type: typeof GREEN_GLOBE_PREVIEW_READY_MESSAGE_TYPE;
  version: 1;
  projectDid: string;
};

function uniqueNonEmpty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

export function buildTimelineGreenGlobeIframeSrc(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.set("preview-mode", "none");
    return url.toString();
  } catch {
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}preview-mode=none`;
  }
}

export function getGreenGlobePreviewTargetOrigin(href: string): string | null {
  try {
    return new URL(href).origin;
  } catch {
    return null;
  }
}

export function buildTimelineGreenGlobeDatasetLayersMessage(args: {
  projectDid: string;
  layers: TimelineMapLayer[];
  activeDatasetRefs: string[];
  focusedDatasetRef: string | null;
  requestId: string;
}): GreenGlobePreviewSetDatasetLayersMessage {
  const layerRefs = new Set(args.layers.map((layer) => layer.datasetUri));
  const activeDatasetRefs = uniqueNonEmpty(args.activeDatasetRefs).filter((ref) =>
    layerRefs.has(ref),
  );
  const focusedDatasetRef =
    args.focusedDatasetRef && activeDatasetRefs.includes(args.focusedDatasetRef)
      ? args.focusedDatasetRef
      : (activeDatasetRefs[0] ?? null);

  return {
    type: GREEN_GLOBE_PREVIEW_SET_DATASET_LAYERS_MESSAGE_TYPE,
    version: 1,
    source: "bumicerts",
    requestId: args.requestId,
    projectDid: args.projectDid,
    datasetLayers: args.layers.map((layer) => ({
      datasetRef: layer.datasetUri,
      title: layer.title,
      siteRef: layer.siteRef,
    })),
    activeDatasetRefs,
    focusedDatasetRef,
    emptySelection: "clear",
    view: {
      fit: activeDatasetRefs.length > 0 ? "active-dataset-bounds" : "preserve",
      animate: true,
    },
  };
}

export function isGreenGlobePreviewReadyMessage(
  value: unknown,
  projectDid: string,
): value is GreenGlobePreviewReadyMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeMessage = value as Partial<GreenGlobePreviewReadyMessage>;
  return (
    maybeMessage.type === GREEN_GLOBE_PREVIEW_READY_MESSAGE_TYPE &&
    maybeMessage.version === 1 &&
    maybeMessage.projectDid === projectDid
  );
}
