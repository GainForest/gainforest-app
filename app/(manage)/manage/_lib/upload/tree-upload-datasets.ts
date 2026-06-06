import type { ExistingUploadDatasetSelection } from "./upload-dataset-selection";

export type UploadTreeDatasetItem = ExistingUploadDatasetSelection & {
  createdAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUploadTreeDatasetItem(value: unknown): value is UploadTreeDatasetItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.uri === "string" &&
    typeof value.rkey === "string" &&
    typeof value.name === "string" &&
    (typeof value.description === "string" || value.description === null) &&
    (typeof value.recordCount === "number" || value.recordCount === null) &&
    (typeof value.createdAt === "string" || value.createdAt === null)
  );
}

export async function fetchUploadTreeDatasets(): Promise<UploadTreeDatasetItem[]> {
  const response = await fetch("/api/manage/trees/datasets", { credentials: "same-origin" });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Failed to load datasets.";
    throw new Error(message);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) throw new Error("Unexpected dataset response.");
  return payload.filter(isUploadTreeDatasetItem);
}
