import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getDataJob, requireS3 } from "@/app/_lib/data-jobs";
import { presignUploadPart } from "@/app/_lib/s3-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PARTS_PER_CALL = 50;
const MAX_PART_NUMBER = 10_000; // S3 hard limit

/**
 * POST /api/jobs/[jobId]/parts — presign a batch of multipart part-upload
 * URLs for the job owner. The browser PUTs each part straight to the bucket
 * and keeps the returned ETags for ./complete. Owner-gated; only `uploading`
 * jobs can request URLs.
 */
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { jobId } = await params;
  const body = (await request.json().catch(() => null)) as { partNumbers?: number[] } | null;
  const partNumbers = (body?.partNumbers ?? [])
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_PART_NUMBER)
    .slice(0, MAX_PARTS_PER_CALL);
  if (partNumbers.length === 0) {
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
    const urls = partNumbers.map((partNumber) => ({
      partNumber,
      url: presignUploadPart(config, job.storageKey, job.uploadId!, partNumber),
    }));
    return NextResponse.json({ urls });
  } catch (error) {
    console.error("[data-jobs] presign parts failed", error);
    return NextResponse.json({ error: "presign_failed" }, { status: 502 });
  }
}
