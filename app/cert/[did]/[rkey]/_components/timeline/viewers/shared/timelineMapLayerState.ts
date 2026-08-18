import type { TimelineMapLayer } from "./timelineMapLayers";

export type ActiveMapLayerByDatasetUri = Record<string, true>;

export type TimelineMapLayerState = {
  activeLayers: TimelineMapLayer[];
  hiddenLayers: TimelineMapLayer[];
  activeCount: number;
  hiddenCount: number;
};

export function getTimelineMapLayerState(
  layers: TimelineMapLayer[],
  activeMapLayerByDatasetUri: ActiveMapLayerByDatasetUri,
): TimelineMapLayerState {
  const activeLayers: TimelineMapLayer[] = [];
  const hiddenLayers: TimelineMapLayer[] = [];

  for (const layer of layers) {
    if (activeMapLayerByDatasetUri[layer.datasetUri]) {
      activeLayers.push(layer);
    } else {
      hiddenLayers.push(layer);
    }
  }

  return {
    activeLayers,
    hiddenLayers,
    activeCount: activeLayers.length,
    hiddenCount: hiddenLayers.length,
  };
}
