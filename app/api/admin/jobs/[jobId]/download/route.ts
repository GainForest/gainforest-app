import { NextResponse } from "next/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { getDataJob, requireS3 } from "@/app/_lib/data-jobs";
import { presignDownload } from "@/app/_lib/s3-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOWNLOAD_EXPIRY_SECONDS = 3600;

/**
 * GET /api/admin/jobs/[jobId]/download — a short-lived download link for the
 * raw archive, for the review team (and their agents, who can also range-read
 * it instead of downloading all 10GB). Moderator-gated.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!access.isModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { jobId } = await params;
  try {
    const job = await getDataJob(jobId);
    if (!job || job.status === "uploading") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const url = presignDownload(requireS3(), job.storageKey, DOWNLOAD_EXPIRY_SECONDS, job.filename);
    return NextResponse.json({ url, expiresInSeconds: DOWNLOAD_EXPIRY_SECONDS });
  } catch (error) {
    console.error("[data-jobs] download link failed", error);
    return NextResponse.json({ error: "link_failed" }, { status: 502 });
  }
}
