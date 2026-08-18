import { manageApiHref, type ManageTarget } from "@/lib/links";
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

export async function fetchUploadTreeDatasets(target?: ManageTarget): Promise<UploadTreeDatasetItem[]> {
  const response = await fetch(manageApiHref("/api/manage/trees/datasets", target), { credentials: "same-origin" });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as unknown;
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Failed to load tree groups.";
    throw new Error(message);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) throw new Error("Unexpected tree group response.");
  return payload.filter(isUploadTreeDatasetItem);
}
