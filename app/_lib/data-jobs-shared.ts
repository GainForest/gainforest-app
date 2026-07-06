/**
 * Data batch jobs — shared client/server constants.
 *
 * Field partners submit very large archives (photos + KoboToolbox exports,
 * 5–10GB) as "jobs": the file goes straight to object storage, the GainForest
 * team reviews it remotely, and — with the submitter's consent — publishes the
 * observations to their account using a regular GainForest agent key.
 */

/**
 * Canonical name of the agent key minted when a partner consents to the team
 * publishing on their behalf. Settings → AI agent keys shows keys by name, so
 * the partner can recognise and revoke it at any time.
 */
export const DATA_JOBS_AGENT_KEY_NAME = "Batch uploads — GainForest team";

export function isDataJobsAgentKeyName(name: string | null | undefined): boolean {
  return (name ?? "").trim() === DATA_JOBS_AGENT_KEY_NAME;
}

/** Upload constraints. 64MB parts × 160 parts covers a 10GB archive. */
export const DATA_JOBS_MAX_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
export const DATA_JOBS_PART_BYTES = 64 * 1024 * 1024; // 64MB
export const DATA_JOBS_MAX_NOTES_CHARS = 2000;
export const DATA_JOBS_MAX_PROJECT_CHARS = 200;

/**
 * Job lifecycle. `uploading` jobs still stream parts from the browser;
 * `received` means the archive is complete in the bucket; the team moves jobs
 * through `inReview` to `published` (or `needsAttention` when something needs
 * the submitter's input).
 */
export const DATA_JOB_STATUSES = [
  "uploading",
  "received",
  "inReview",
  "published",
  "needsAttention",
] as const;

export type DataJobStatus = (typeof DATA_JOB_STATUSES)[number];

/** Statuses an admin can set from the dashboard (uploading is machine-set). */
export const DATA_JOB_ADMIN_STATUSES: DataJobStatus[] = ["received", "inReview", "published", "needsAttention"];

/** The job record as returned to clients (owner or admin). */
export type DataJob = {
  id: string;
  did: string;
  handle: string;
  filename: string;
  sizeBytes: number;
  project: string;
  notes: string;
  status: DataJobStatus;
  createdAt: string;
  updatedAt: string;
  /** Set once the team published data on the submitter's behalf. */
  publishedCount: number | null;
  /** Plain-language note from the review team, shown to the submitter. */
  reviewNote: string | null;
  /** Whether a publish-on-behalf agent key is stored for this submitter. */
  hasAgentKey: boolean;
};
