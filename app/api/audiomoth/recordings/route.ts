import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { deleteObject, getS3Config, presignDownload, presignUrl } from "@/app/_lib/s3-storage";
import { AUDIOMOTH_KEY_PATTERN, isDeletableAudiomothKey } from "@/app/_lib/audiomoth/storage-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AudioMoth SD-card recordings — archival storage in the same S3-compatible
 * bucket the data-jobs pipeline uses (Cloudflare R2 in production).
 *
 * POST  presigns direct browser→bucket PUT URLs for a batch of WAV files
 *       (session-gated; keys are namespaced under the caller's DID so nobody
 *       can write into someone else's space). Uploads never flow through
 *       this server — Vercel's body limit makes that a non-starter.
 * GET   ?key=… redirects to a short-lived presigned download for the
 *       archival original. This is the stable target of `ac.audio.accessUri`;
 *       recordings are public biodiversity data (their records and preview
 *       blobs are public on the PDS already).
 * DELETE ?key=… removes the archival original from the bucket (session-gated;
 *       only keys inside the caller's own DID namespace can be deleted). Used
 *       by the profile's recording deletion so the object storage doesn't
 *       accumulate orphaned WAVs after their ac.audio records are gone.
 */

const MAX_FILES_PER_CALL = 50;
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // single-PUT S3 limit is 5GB; cap well below
const PUT_EXPIRES_SECONDS = 3600;
const GET_EXPIRES_SECONDS = 3600;

const KEY_PATTERN = AUDIOMOTH_KEY_PATTERN;

function sanitizeFilename(name: string): string | null {
  const base = name.split("/").pop()?.split("\\").pop()?.trim() ?? "";
  const safe = base.replace(/[^A-Za-z0-9._\-]/g, "_").slice(0, 200);
  return safe && /\.wav$/i.test(safe) ? safe : null;
}

export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const config = getS3Config();
  if (!config) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    deploymentId?: string;
    files?: Array<{ name?: string; sizeBytes?: number }>;
  } | null;

  const deploymentId = (body?.deploymentId ?? "").trim().toLowerCase();
  const folder = /^[0-9a-f]{16}$/.test(deploymentId) ? deploymentId : "unassigned";

  const files = Array.isArray(body?.files) ? body!.files!.slice(0, MAX_FILES_PER_CALL) : [];
  if (files.length === 0) {
    return NextResponse.json({ error: "no_files" }, { status: 400 });
  }

  const uploads: Array<{ name: string; key: string; url: string } | { name: string; error: string }> = [];
  for (const file of files) {
    const name = typeof file.name === "string" ? file.name : "";
    const safe = sanitizeFilename(name);
    const size = Number(file.sizeBytes);
    if (!safe) {
      uploads.push({ name, error: "invalid_name" });
      continue;
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
      uploads.push({ name, error: "invalid_size" });
      continue;
    }
    const key = `audiomoth/${session.did}/${folder}/${safe}`;
    uploads.push({ name, key, url: presignUrl(config, "PUT", key, {}, PUT_EXPIRES_SECONDS) });
  }

  return NextResponse.json({ uploads });
}

export async function GET(request: Request) {
  const config = getS3Config();
  if (!config) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const filename = key.split("/").pop();
  return NextResponse.redirect(presignDownload(config, key, GET_EXPIRES_SECONDS, filename), 302);
}

export async function DELETE(request: Request) {
  // CSRF defense-in-depth: our own client fetches are always same-origin.
  // Browsers attach Sec-Fetch-Site automatically and it can't be spoofed
  // cross-site, so reject anything a foreign page tries to trigger — even
  // if the session cookie were ever configured to travel cross-site.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const config = getS3Config();
  if (!config) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const key = new URL(request.url).searchParams.get("key") ?? "";
  // Only keys the PUT presign can actually create, inside the caller's own
  // DID namespace, may be deleted. (Org-repo records whose file was uploaded
  // by someone else keep the object — the caller's record delete still works.)
  const verdict = isDeletableAudiomothKey(key, session.did);
  if (verdict === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (verdict === "forbidden") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    await deleteObject(config, key);
  } catch {
    return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
