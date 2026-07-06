import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { deleteDataJob, getDataJob, requireS3 } from "@/app/_lib/data-jobs";
import { abortMultipartUpload } from "@/app/_lib/s3-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/jobs/[jobId] — cancel a batch that is still uploading: abort
 * the multipart upload and drop the job record. Only the owner can cancel,
 * and only while the job is `uploading` — once received, the review team owns
 * the lifecycle. Never touches anything already published.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { jobId } = await params;
  try {
    const job = await getDataJob(jobId);
    if (!job || job.did !== session.did) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (job.status !== "uploading") {
      return NextResponse.json({ error: "not_cancellable" }, { status: 409 });
    }

    if (job.uploadId) {
      await abortMultipartUpload(requireS3(), job.storageKey, job.uploadId).catch(() => {});
    }
    await deleteDataJob(job);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[data-jobs] cancel failed", error);
    return NextResponse.json({ error: "cancel_failed" }, { status: 502 });
  }
}
