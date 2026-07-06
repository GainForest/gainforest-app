import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getDataJob, hasStoredAgentKey, requireS3, toPublicJob, updateDataJob } from "@/app/_lib/data-jobs";
import { completeMultipartUpload, headObject } from "@/app/_lib/s3-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/jobs/[jobId]/complete — finish the multipart upload with the
 * ETags collected in the browser, verify the assembled archive, and move the
 * job to `received` so the review team can pick it up.
 */
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { jobId } = await params;
  const body = (await request.json().catch(() => null)) as {
    parts?: { partNumber?: number; etag?: string }[];
  } | null;
  const parts = (body?.parts ?? [])
    .filter((p) => Number.isInteger(p.partNumber) && typeof p.etag === "string" && p.etag.length > 0)
    .map((p) => ({ partNumber: p.partNumber as number, etag: (p.etag as string).slice(0, 200) }));
  if (parts.length === 0 || parts.length > 10_000) {
    return NextResponse.json({ error: "invalid_parts" }, { status: 400 });
  }

  try {
    const job = await getDataJob(jobId);
    if (!job || job.did !== session.did) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (job.status !== "uploading" || !job.uploadId) {
      return NextResponse.json({ error: "not_uploading" }, { status: 409 });
    }

    const config = requireS3();
    await completeMultipartUpload(config, job.storageKey, job.uploadId, parts);
    const head = await headObject(config, job.storageKey).catch(() => null);

    const updated = await updateDataJob(jobId, {
      status: "received",
      uploadId: null,
      ...(head ? { sizeBytes: head.sizeBytes } : {}),
    });
    const hasKey = await hasStoredAgentKey(session.did).catch(() => false);
    return NextResponse.json({ job: updated ? toPublicJob(updated, hasKey) : null });
  } catch (error) {
    console.error("[data-jobs] complete failed", error);
    return NextResponse.json({ error: "complete_failed" }, { status: 502 });
  }
}
