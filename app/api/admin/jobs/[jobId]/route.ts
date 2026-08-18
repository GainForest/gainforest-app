import { NextResponse } from "next/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { getDataJob, hasStoredAgentKey, isAdminSettableStatus, toPublicJob, updateDataJob } from "@/app/_lib/data-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/jobs/[jobId] — the review team moves a batch through its
 * lifecycle (received → in review → published / needs attention) and leaves a
 * plain-language note for the submitter. Moderator-gated (GainForest admin
 * group), same as the rest of /admin.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!access.isModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { jobId } = await params;
  const body = (await request.json().catch(() => null)) as {
    status?: string;
    reviewNote?: string;
    publishedCount?: number;
  } | null;

  const patch: Parameters<typeof updateDataJob>[1] = {};
  if (typeof body?.status === "string") {
    if (!isAdminSettableStatus(body.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (typeof body?.reviewNote === "string") {
    patch.reviewNote = body.reviewNote.trim().slice(0, 2000) || null;
  }
  if (body?.publishedCount !== undefined) {
    const count = Number(body.publishedCount);
    patch.publishedCount = Number.isInteger(count) && count >= 0 ? count : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "empty_patch" }, { status: 400 });
  }

  try {
    const existing = await getDataJob(jobId);
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // An admin can't touch a job that is still streaming from the browser.
    if (existing.status === "uploading") {
      return NextResponse.json({ error: "still_uploading" }, { status: 409 });
    }

    const updated = await updateDataJob(jobId, patch);
    const hasKey = updated ? await hasStoredAgentKey(updated.did).catch(() => false) : false;
    return NextResponse.json({ job: updated ? toPublicJob(updated, hasKey) : null });
  } catch (error) {
    console.error("[data-jobs] admin patch failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 502 });
  }
}
