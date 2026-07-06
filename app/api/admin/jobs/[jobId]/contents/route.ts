import { NextResponse } from "next/server";
import { HttpRangeReader, TextWriter, ZipReader, configure, type Entry } from "@zip.js/zip.js";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { getDataJob, requireS3 } from "@/app/_lib/data-jobs";
import { presignDownload } from "@/app/_lib/s3-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LISTED_ENTRIES = 500;
const MAX_PREVIEW_SOURCE_BYTES = 20 * 1024 * 1024; // only extract CSVs up to 20MB
const MAX_PREVIEW_CHARS = 40_000;

/**
 * GET /api/admin/jobs/[jobId]/contents — inspect a 5–10GB archive remotely
 * without downloading it. Zip central directories live at the end of the
 * file, so `HttpRangeReader` lists everything with a few small range reads
 * against a presigned URL. `?path=<entry>` additionally extracts the first
 * lines of one CSV/text entry for preview. Moderator-gated.
 */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (!access.isModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { jobId } = await params;
  const previewPath = new URL(request.url).searchParams.get("path");

  let zipReader: ZipReader<unknown> | null = null;
  try {
    const job = await getDataJob(jobId);
    if (!job || job.status === "uploading") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Web workers don't exist in the serverless runtime; inflate inline.
    configure({ useWebWorkers: false });
    const url = presignDownload(requireS3(), job.storageKey, 600);
    zipReader = new ZipReader(new HttpRangeReader(url));
    const entries = (await zipReader.getEntries()).filter((entry) => !entry.directory);

    if (previewPath) {
      const entry = entries.find((candidate) => candidate.filename === previewPath);
      if (!entry) {
        return NextResponse.json({ error: "entry_not_found" }, { status: 404 });
      }
      if (entry.uncompressedSize > MAX_PREVIEW_SOURCE_BYTES || !entry.getData) {
        return NextResponse.json({ error: "entry_too_large" }, { status: 413 });
      }
      const text = await entry.getData(new TextWriter());
      return NextResponse.json({
        path: entry.filename,
        sizeBytes: entry.uncompressedSize,
        truncated: text.length > MAX_PREVIEW_CHARS,
        text: text.slice(0, MAX_PREVIEW_CHARS),
      });
    }

    return NextResponse.json({
      totalEntries: entries.length,
      totalUncompressedBytes: entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
      byExtension: summarizeExtensions(entries),
      entries: entries.slice(0, MAX_LISTED_ENTRIES).map((entry) => ({
        path: entry.filename,
        sizeBytes: entry.uncompressedSize,
      })),
      listedEntries: Math.min(entries.length, MAX_LISTED_ENTRIES),
    });
  } catch (error) {
    console.error("[data-jobs] contents failed", error);
    return NextResponse.json({ error: "contents_failed" }, { status: 502 });
  } finally {
    await zipReader?.close().catch(() => {});
  }
}

function summarizeExtensions(entries: Entry[]): { extension: string; count: number; bytes: number }[] {
  const byExt = new Map<string, { count: number; bytes: number }>();
  for (const entry of entries) {
    const ext = /\.([a-z0-9]{1,8})$/i.exec(entry.filename)?.[1]?.toLowerCase() ?? "other";
    const bucket = byExt.get(ext) ?? { count: 0, bytes: 0 };
    bucket.count += 1;
    bucket.bytes += entry.uncompressedSize;
    byExt.set(ext, bucket);
  }
  return [...byExt.entries()]
    .map(([extension, { count, bytes }]) => ({ extension, count, bytes }))
    .sort((a, b) => b.count - a.count);
}
