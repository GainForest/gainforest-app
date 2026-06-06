import {
  classifyPointAgainstGeoJsonBoundary,
  validateGeojsonOrThrow,
  type SiteBoundaryGeoJson,
} from "./geojson";
import { getSiteLocationUrl, type UploadSiteSelection } from "./site-selection";
import type { ValidatedRow } from "./types";

export { type SiteBoundaryGeoJson };

export const TREE_SITE_NEAR_BOUNDARY_METERS = 15;

export type TreeBoundaryCoordinate = {
  index: number;
  scientificName: string | null;
  decimalLatitude: number;
  decimalLongitude: number;
};

export type TreeBoundaryFailure = {
  tree: TreeBoundaryCoordinate;
  kind: "near-boundary" | "out-of-site" | "invalid-boundary";
  distanceMeters: number;
  reason?: string;
};

export type UploadableBoundaryRow = { row: ValidatedRow; rowIndex: number };
export type SkippedBoundaryRow = { row: ValidatedRow; rowIndex: number; message: string };

export type UploadRowsSiteBoundaryCheck = {
  rowsToUpload: UploadableBoundaryRow[];
  skippedRows: SkippedBoundaryRow[];
  fatalError: string | null;
};

export function uploadSiteBoundaryQueryKey(siteUri: string | null | undefined) {
  return ["upload", "trees", "site-boundary", siteUri ?? null] as const;
}

function assertUsableSiteBoundary(boundary: SiteBoundaryGeoJson): SiteBoundaryGeoJson {
  const classification = classifyPointAgainstGeoJsonBoundary({
    geoJson: boundary,
    point: { lat: 0, lon: 0 },
    nearBoundaryMeters: 0,
  });
  if (classification.kind === "invalid-boundary") {
    throw new Error(
      `Selected site boundary must contain valid polygon GeoJSON. ${classification.reason}`,
    );
  }
  return boundary;
}

export async function fetchUploadSiteBoundary(site: UploadSiteSelection): Promise<SiteBoundaryGeoJson> {
  const boundaryUrl = getSiteLocationUrl(site);
  if (!boundaryUrl) {
    throw new Error(
      "Selected site does not include a GeoJSON boundary. Select another site or create a site boundary before uploading tree data.",
    );
  }

  const response = await fetch(boundaryUrl);
  if (!response.ok) {
    throw new Error(`Failed to load selected site boundary: HTTP ${response.status}.`);
  }

  const payload: unknown = await response.json();
  return assertUsableSiteBoundary(validateGeojsonOrThrow(payload));
}

export function getTreeBoundaryFailure(options: {
  tree: TreeBoundaryCoordinate;
  boundary: SiteBoundaryGeoJson;
  nearBoundaryMeters?: number;
}): TreeBoundaryFailure | null {
  const classification = classifyPointAgainstGeoJsonBoundary({
    geoJson: options.boundary,
    point: { lat: options.tree.decimalLatitude, lon: options.tree.decimalLongitude },
    nearBoundaryMeters: options.nearBoundaryMeters ?? TREE_SITE_NEAR_BOUNDARY_METERS,
  });

  if (classification.kind === "inside") return null;
  if (classification.kind === "near-boundary") {
    return { tree: options.tree, kind: "near-boundary", distanceMeters: classification.distanceMeters };
  }
  if (classification.kind === "outside") {
    return { tree: options.tree, kind: "out-of-site", distanceMeters: classification.distanceMeters };
  }
  return { tree: options.tree, kind: "invalid-boundary", distanceMeters: Infinity, reason: classification.reason };
}

export function checkUploadRowsAgainstSelectedSite(options: {
  rows: ValidatedRow[];
  siteSelection: UploadSiteSelection;
  boundary: SiteBoundaryGeoJson;
}): UploadRowsSiteBoundaryCheck {
  const rowsToUpload: UploadableBoundaryRow[] = [];
  const skippedRows: SkippedBoundaryRow[] = [];

  for (let rowIndex = 0; rowIndex < options.rows.length; rowIndex++) {
    const row = options.rows[rowIndex];
    if (!row) continue;

    if (row.occurrence.siteRef !== options.siteSelection.uri) {
      skippedRows.push({ row, rowIndex, message: "This row no longer matches the selected site boundary." });
      continue;
    }

    const failure = getTreeBoundaryFailure({
      tree: {
        index: row.index,
        scientificName: row.occurrence.scientificName,
        decimalLatitude: row.occurrence.decimalLatitude,
        decimalLongitude: row.occurrence.decimalLongitude,
      },
      boundary: options.boundary,
      nearBoundaryMeters: TREE_SITE_NEAR_BOUNDARY_METERS,
    });

    if (!failure) {
      rowsToUpload.push({ row, rowIndex });
      continue;
    }

    if (failure.kind === "invalid-boundary") {
      return {
        rowsToUpload: [],
        skippedRows: [],
        fatalError: "The selected site boundary is not valid polygon GeoJSON. Redraw or re-upload a valid boundary before uploading trees.",
      };
    }

    skippedRows.push({
      row,
      rowIndex,
      message:
        failure.kind === "near-boundary"
          ? `Near boundary: this tree is ${formatBoundaryDistance(failure.distanceMeters)} outside the selected site polygon.`
          : "Out of site: this tree is outside the selected site polygon.",
    });
  }

  return { rowsToUpload, skippedRows, fatalError: null };
}

export function formatBoundaryDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters)) return "unknown distance";
  if (distanceMeters < 1) return `${Math.round(distanceMeters * 100)} cm`;
  return `${distanceMeters.toFixed(1)} m`;
}
