import { treeDetail, type TreeDetail } from "./trees";

export type SheetSnap = "collapsed" | "peek" | "half" | "full";

/** The keyboard/click action for the sheet handle: expand toward full, or collapse to peek. */
export function nextSheetButtonSnap(snap: SheetSnap): SheetSnap {
  return snap === "full" ? "peek" : "full";
}

/** `aria-expanded` describes the current sheet state, not the button's next action. */
export function isSheetExpanded(snap: SheetSnap): boolean {
  return snap === "half" || snap === "full";
}

export type GlobeMotionSettings = {
  cameraDuration: number;
  layerFadeDuration: number;
  idleSpin: boolean;
};

export function globeMotionSettings(reducedMotion: boolean, spinRequested: boolean): GlobeMotionSettings {
  return {
    cameraDuration: reducedMotion ? 0 : 2200,
    layerFadeDuration: reducedMotion ? 0 : 250,
    idleSpin: spinRequested && !reducedMotion,
  };
}

export type TreeListEntry = {
  detail: TreeDetail;
  coordinates: [number, number];
};

/** Build the keyboard tree list from the exact same features rendered by the map. */
export function treeListEntries(collection: GeoJSON.FeatureCollection | null): TreeListEntry[] {
  if (!collection) return [];
  return collection.features.flatMap((feature, index) => {
    if (feature.geometry?.type !== "Point") return [];
    const [lon, lat] = feature.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    const id = feature.id ?? index;
    return [{ detail: treeDetail(id, feature.properties ?? null), coordinates: [lon, lat] }];
  });
}
