import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  archiveKey,
  hasStoredAgentKey,
  isDataJobsConfigured,
  listJobsForUser,
  mintAndStoreAgentKey,
  newJobId,
  requireS3,
  saveDataJob,
  toPublicJob,
  type StoredDataJob,
} from "@/app/_lib/data-jobs";
import {
  DATA_JOBS_MAX_BYTES,
  DATA_JOBS_MAX_NOTES_CHARS,
  DATA_JOBS_MAX_PROJECT_CHARS,
  DATA_JOBS_PART_BYTES,
} from "@/app/_lib/data-jobs-shared";
import { createMultipartUpload } from "@/app/_lib/s3-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs — the signed-in user's data batches, newest first.
 * The DID always comes from the session, never the client.
 */
export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!isDataJobsConfigured()) {
    return NextResponse.json({ configured: false, jobs: [], hasAgentKey: false });
  }

  try {
    const [jobs, hasKey] = await Promise.all([
      listJobsForUser(session.did),
      hasStoredAgentKey(session.did),
    ]);
    return NextResponse.json({
      configured: true,
      hasAgentKey: hasKey,
      jobs: jobs.map((job) => toPublicJob(job, hasKey)),
    });
  } catch (error) {
    console.error("[data-jobs] list failed", error);
    return NextResponse.json({ error: "storage_unreachable" }, { status: 502 });
  }
}

/**
 * POST /api/jobs — start a new batch upload.
 *
 * Validates the archive metadata, mints + stores the publish-on-behalf agent
 * key on first consent, opens a multipart upload in the bucket and records
 * the job as `uploading`. The browser then PUTs parts directly to storage
 * with presigned URLs (see ./[jobId]/parts) — the archive never touches this
 * server.
 */
export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!isDataJobsConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    filename?: string;
    sizeBytes?: number;
    project?: string;
    notes?: string;
    consent?: boolean;
  } | null;

  const filename = (body?.filename ?? "").trim().slice(0, 200);
  const sizeBytes = Number(body?.sizeBytes);
  if (!filename || !/\.zip$/i.test(filename)) {
    return NextResponse.json({ error: "zip_required" }, { status: 400 });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "invalid_size" }, { status: 400 });
  }
  if (sizeBytes > DATA_JOBS_MAX_BYTES) {
    return NextResponse.json({ error: "too_large", maxBytes: DATA_JOBS_MAX_BYTES }, { status: 400 });
  }

  try {
    // Publishing on the submitter's behalf needs their agent key. Minted once,
    // on explicit consent; revocable any time in Settings → AI agent keys.
    const hasKey = await hasStoredAgentKey(session.did);
    if (!hasKey) {
      if (!body?.consent) {
        return NextResponse.json({ error: "consent_required" }, { status: 400 });
      }
      await mintAndStoreAgentKey(session.did);
    }

    const jobId = newJobId();
    const storageKey = archiveKey(jobId);
    const uploadId = await createMultipartUpload(requireS3(), storageKey);
    const now = new Date().toISOString();

    const job: StoredDataJob = {
      id: jobId,
      did: session.did,
      handle: session.handle,
      filename,
      sizeBytes,
      project: (body?.project ?? "").trim().slice(0, DATA_JOBS_MAX_PROJECT_CHARS),
      notes: (body?.notes ?? "").trim().slice(0, DATA_JOBS_MAX_NOTES_CHARS),
      status: "uploading",
      createdAt: now,
      updatedAt: now,
      publishedCount: null,
      reviewNote: null,
      uploadId,
      storageKey,
    };
    await saveDataJob(job);

    const partCount = Math.max(1, Math.ceil(sizeBytes / DATA_JOBS_PART_BYTES));
    return NextResponse.json({ jobId, partSizeBytes: DATA_JOBS_PART_BYTES, partCount });
  } catch (error) {
    console.error("[data-jobs] create failed", error);
    return NextResponse.json({ error: "create_failed" }, { status: 502 });
  }
}
