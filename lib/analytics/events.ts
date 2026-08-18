/**
 * Aggregate event names and payloads for tree upload tracking.
 *
 * Keep payloads free of personal details, file names, row values, coordinates,
 * species names, or raw error messages.
 */

export const TREE_UPLOAD_EVENTS = {
  FLOW_STARTED: "tree_upload_flow_started",
  STEP_VIEWED: "tree_upload_step_viewed",
  STEP_COMPLETED: "tree_upload_step_completed",
  FILE_ACCEPTED: "tree_upload_file_accepted",
  FILE_REJECTED: "tree_upload_file_rejected",
  MEDIA_ZIP_ACCEPTED: "tree_upload_media_zip_accepted",
  MEDIA_ZIP_REJECTED: "tree_upload_media_zip_rejected",
  UPLOAD_STARTED: "tree_upload_started",
  UPLOAD_COMPLETED: "tree_upload_completed",
  UPLOAD_FAILED: "tree_upload_failed",
  PHOTO_UPLOAD_STARTED: "tree_upload_photo_upload_started",
  PHOTO_UPLOAD_COMPLETED: "tree_upload_photo_upload_completed",
  PHOTO_UPLOAD_FAILED: "tree_upload_photo_upload_failed",
  FEEDBACK_PROMPT_SHOWN: "tree_upload_feedback_prompt_shown",
  FEEDBACK_FORM_OPENED: "tree_upload_feedback_form_opened",
  FEEDBACK_FORM_CLOSED: "tree_upload_feedback_form_closed",
  FEEDBACK_DISMISSED: "tree_upload_feedback_dismissed",
  VIEW_TREES_CLICKED: "tree_upload_view_trees_clicked",
  UPLOAD_MORE_CLICKED: "tree_upload_more_clicked",
} as const;

export const TREE_UPLOAD_STEP_NAMES = [
  "file",
  "mapping",
  "preview",
  "upload",
] as const;

export type TreeUploadEventName =
  (typeof TREE_UPLOAD_EVENTS)[keyof typeof TREE_UPLOAD_EVENTS];

export type TreeUploadStepName = (typeof TREE_UPLOAD_STEP_NAMES)[number];

type TreeUploadDatasetMode = "none" | "new" | "existing";

type TreeUploadSourceFormat = "kobo" | "generic";

const TREE_UPLOAD_FAILURE_REASONS = [
  "unsupported_file_type",
  "file_too_large",
  "parse_error",
  "unsupported_media_zip_type",
  "media_zip_too_large",
  "media_zip_no_supported_images",
  "media_zip_read_failed",
  "missing_kobo_media_zip",
  "site_selection_missing",
  "site_boundary_validation_failed",
  "tree_group_create_failed",
] as const;

type TreeUploadFailureReason =
  (typeof TREE_UPLOAD_FAILURE_REASONS)[number];

export type TreeUploadEventPayload = {
  uploadId?: string;
  stepIndex?: number;
  stepName?: TreeUploadStepName;
  datasetMode?: TreeUploadDatasetMode;
  sourceFormat?: TreeUploadSourceFormat;
  fileExtension?: string;
  fileSizeBucket?: string;
  mediaZipSizeBucket?: string;
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  totalColumns?: number;
  mappedColumns?: number;
  skippedColumns?: number;
  requiredMissingCount?: number;
  duplicateMappingCount?: number;
  expectedSkippedKoboColumnCount?: number;
  savedRows?: number;
  partialRows?: number;
  failedRows?: number;
  photoTotal?: number;
  photoSucceeded?: number;
  photoFailed?: number;
  hasKoboZip?: boolean;
  mediaZipImageCount?: number;
  mediaZipSubmissionCount?: number;
  durationSeconds?: number;
  failureReason?: TreeUploadFailureReason;
};
