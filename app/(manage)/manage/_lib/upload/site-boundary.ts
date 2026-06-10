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
      `The selected site boundary must contain a valid drawn map area. ${classification.reason}`,
    );
  }
  return boundary;
}

export async function fetchUploadSiteBoundary(site: UploadSiteSelection): Promise<SiteBoundaryGeoJson> {
  const boundaryUrl = getSiteLocationUrl(site);
  if (!boundaryUrl) {
    throw new Error(
      "The selected site does not include a drawn map area. Choose another site boundary or draw one before adding tree information.",
    );
  }

  const response = await fetch(boundaryUrl, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error("Could not load the selected drawn map area. Try again or choose another site boundary.");
  }

  const payload: unknown = await response.json();
  return assertUsableSiteBoundary(validateGeojsonOrThrow(payload));
}

export async function readGeoJsonFile(file: File): Promise<SiteBoundaryGeoJson> {
  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("Choose a valid map file.");
  }

  try {
    return assertUsableSiteBoundary(validateGeojsonOrThrow(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The map file must include a valid drawn map area.";
    throw new Error(message.replace(/GeoJSON/gi, "map file"));
  }
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

export function findTreeBoundaryFailures(options: {
  trees: TreeBoundaryCoordinate[];
  boundary: SiteBoundaryGeoJson;
  nearBoundaryMeters?: number;
}): TreeBoundaryFailure[] {
  return options.trees.flatMap((tree) => {
    const failure = getTreeBoundaryFailure({
      tree,
      boundary: options.boundary,
      nearBoundaryMeters: options.nearBoundaryMeters,
    });

    return failure ? [failure] : [];
  });
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
      skippedRows.push({ row, rowIndex, message: "This row was prepared for a different site boundary. Go back and review the selected site boundary." });
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
        fatalError: "The selected drawn map area cannot be used. Go back and redraw it before saving trees.",
      };
    }

    skippedRows.push({
      row,
      rowIndex,
      message: `This tree is ${formatBoundaryDistance(failure.distanceMeters)} outside the selected drawn map area. Check the coordinates, choose a different site boundary, or remove this row.`,
    });
  }

  return { rowsToUpload, skippedRows, fatalError: null };
}

export function formatBoundaryDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters)) return "unknown distance";
  if (distanceMeters < 1) return `${Math.round(distanceMeters * 100)} cm`;
  return `${distanceMeters.toFixed(1)} m`;
}
