"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type TimelineViewerState = {
  activeMapLayerByDatasetUri: Record<string, true>;
  focusedMapLayerDatasetUri: string | null;
  hasMountedGreenGlobePreview: boolean;
};

type TimelineViewerActions = {
  setMapLayerActive: (datasetUri: string, active: boolean) => void;
};

type TimelineViewerStore = TimelineViewerState & TimelineViewerActions;

export function createTimelineViewerState(): TimelineViewerState {
  return {
    activeMapLayerByDatasetUri: {},
    focusedMapLayerDatasetUri: null,
    hasMountedGreenGlobePreview: false,
  };
}

export function setTimelineMapLayerActive(
  state: TimelineViewerState,
  datasetUri: string,
  active: boolean,
): TimelineViewerState {
  const next = { ...state.activeMapLayerByDatasetUri };
  let focusedMapLayerDatasetUri = state.focusedMapLayerDatasetUri;
  let hasMountedGreenGlobePreview = state.hasMountedGreenGlobePreview;

  if (active) {
    next[datasetUri] = true;
    focusedMapLayerDatasetUri = datasetUri;
    hasMountedGreenGlobePreview = true;
  } else {
    delete next[datasetUri];
    if (focusedMapLayerDatasetUri === datasetUri) {
      focusedMapLayerDatasetUri = Object.keys(next)[0] ?? null;
    }
  }

  return {
    activeMapLayerByDatasetUri: next,
    focusedMapLayerDatasetUri,
    hasMountedGreenGlobePreview,
  };
}

const TimelineViewerStoreContext = createContext<TimelineViewerStore | null>(null);

export function TimelineViewerStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState(createTimelineViewerState);
  const setMapLayerActive = useCallback((datasetUri: string, active: boolean) => {
    setState((current) => setTimelineMapLayerActive(current, datasetUri, active));
  }, []);
  const value = useMemo(
    () => ({
      ...state,
      setMapLayerActive,
    }),
    [setMapLayerActive, state],
  );

  return (
    <TimelineViewerStoreContext.Provider value={value}>
      {children}
    </TimelineViewerStoreContext.Provider>
  );
}

export function useTimelineViewerStore<T>(
  selector: (state: TimelineViewerStore) => T,
): T {
  const store = useContext(TimelineViewerStoreContext);

  if (!store) {
    throw new Error(
      "useTimelineViewerStore must be used within TimelineViewerStoreProvider",
    );
  }

  return selector(store);
}
