export type ExistingUploadDatasetSelection = {
  uri: string;
  rkey: string;
  name: string;
  description: string | null;
  recordCount: number | null;
};

export type UploadDatasetSelection =
  | { mode: "none" }
  | { mode: "new"; name: string; description: string }
  | { mode: "existing"; dataset: ExistingUploadDatasetSelection };

export const NO_UPLOAD_DATASET_SELECTION: UploadDatasetSelection = { mode: "none" };

function isExistingUploadDatasetSelection(value: unknown): value is ExistingUploadDatasetSelection {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.uri === "string" &&
    typeof c.rkey === "string" &&
    typeof c.name === "string" &&
    (typeof c.description === "string" || c.description === null) &&
    (typeof c.recordCount === "number" || c.recordCount === null)
  );
}

export function isUploadDatasetSelection(value: unknown): value is UploadDatasetSelection {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (c.mode === "none") return true;
  if (c.mode === "new") return typeof c.name === "string" && typeof c.description === "string";
  if (c.mode === "existing") return isExistingUploadDatasetSelection(c.dataset);
  return false;
}
