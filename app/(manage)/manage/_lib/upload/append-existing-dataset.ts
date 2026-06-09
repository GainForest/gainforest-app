import { occurrenceInputToAppendInput } from "./occurrence-adapter";
import type { ValidatedRow } from "./types";

export const APPEND_EXISTING_DWC_DATASET_MAX_ROWS = 10;
export const APPEND_EXISTING_DWC_DATASET_CLIENT_ROWS = 1;

export type AppendExistingDatasetFloraMeasurementInput = {
  dbh?: string;
  totalHeight?: string;
  diameter?: string;
  canopyCoverPercent?: string;
};

export type AppendExistingDatasetRowInput = {
  occurrence: ReturnType<typeof occurrenceInputToAppendInput>;
  floraMeasurement: AppendExistingDatasetFloraMeasurementInput | null;
};

export type AppendExistingDatasetRowResult =
  | { index: number; state: "success"; occurrenceUri: string; photoCount: number }
  | { index: number; state: "partial"; occurrenceUri: string; photoCount: number; error: string }
  | { index: number; state: "error"; error: string };

export type AppendExistingDatasetResponse = {
  datasetUri: string;
  datasetRkey: string;
  datasetBecameUnavailable: boolean;
  results: AppendExistingDatasetRowResult[];
};

export function toAppendExistingDatasetRows(
  validRows: ValidatedRow[],
  siteRef: string,
): AppendExistingDatasetRowInput[] {
  return validRows.map((row) => ({
    occurrence: occurrenceInputToAppendInput({
      ...row.occurrence,
      siteRef,
    }),
    floraMeasurement: row.floraMeasurement
      ? {
          dbh: row.floraMeasurement.dbh,
          totalHeight: row.floraMeasurement.totalHeight,
          diameter: row.floraMeasurement.diameter,
          canopyCoverPercent: row.floraMeasurement.canopyCoverPercent,
        }
      : null,
  }));
}
