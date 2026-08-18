import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/audiomoth/firmware — list official AudioMoth-Firmware-Basic
 * releases from GitHub (proxied server-side so the browser needs no GitHub
 * access and we can cache the roster).
 *
 * GET /api/audiomoth/firmware?download=<asset id> — stream one release
 * asset (.bin) to the browser. Only assets we listed ourselves are allowed,
 * which pins downloads to the official OpenAcousticDevices repository.
 *
 * GitHub's unauthenticated API allows only 60 requests/hour per IP, which is
 * quickly exhausted behind shared serverless egress. To stay resilient we:
 *   - send an Authorization header when GITHUB_TOKEN is configured (5000/hr),
 *   - serve the last good roster if a refresh is rate-limited or fails,
 *   - download assets via their browser_download_url, which does not count
 *     against the API rate limit at all.
 */

const RELEASES_URL = "https://api.github.com/repos/OpenAcousticDevices/AudioMoth-Firmware-Basic/releases";

const CACHE_TTL_MS = 30 * 60 * 1000;

export interface FirmwareRelease {
  version: string;
  publishedAt: string;
  assetId: number;
  assetName: string;
  sizeBytes: number;
  downloadUrl: string;
}

interface GitHubReleaseAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
}

interface GitHubRelease {
  name: string;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: GitHubReleaseAsset[];
}

/** Last good roster, kept indefinitely so we can serve it when GitHub fails. */
let cachedReleases: { fetchedAt: number; releases: FirmwareRelease[] } | null = null;

function githubHeaders(accept: string): HeadersInit {
  const headers: Record<string, string> = { Accept: accept, "User-Agent": "gainforest-app" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchReleases(): Promise<FirmwareRelease[]> {
  if (cachedReleases && Date.now() - cachedReleases.fetchedAt < CACHE_TTL_MS) {
    return cachedReleases.releases;
  }

  let response: Response;
  try {
    response = await fetch(RELEASES_URL, { headers: githubHeaders("application/vnd.github+json"), cache: "no-store" });
  } catch (error) {
    if (cachedReleases) return cachedReleases.releases;
    throw error;
  }

  if (!response.ok) {
    // Rate limited or transient failure — fall back to the last good roster.
    if (cachedReleases) return cachedReleases.releases;
    throw new Error(`GitHub responded ${response.status}`);
  }

  const data = (await response.json()) as GitHubRelease[];

  const releases: FirmwareRelease[] = [];

  for (const release of data) {
    if (release.draft || release.prerelease) continue;
    const asset = release.assets.find((candidate) => candidate.name.toLowerCase().endsWith(".bin"));
    if (!asset) continue;
    releases.push({
      version: release.name || release.tag_name,
      publishedAt: release.published_at,
      assetId: asset.id,
      assetName: asset.name,
      sizeBytes: asset.size,
      downloadUrl: asset.browser_download_url,
    });
  }

  cachedReleases = { fetchedAt: Date.now(), releases };

  return releases;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const download = url.searchParams.get("download");

  try {
    const releases = await fetchReleases();

    if (!download) {
      // Do not leak the asset download URLs to the browser payload.
      const roster = releases.map(({ downloadUrl: _downloadUrl, ...rest }) => rest);
      return NextResponse.json({ releases: roster });
    }

    const assetId = Number.parseInt(download, 10);
    const release = releases.find((candidate) => candidate.assetId === assetId);

    if (!release) {
      return NextResponse.json({ error: "unknown_asset" }, { status: 404 });
    }

    // browser_download_url redirects to objects.githubusercontent.com and is
    // not subject to the API rate limit.
    const assetResponse = await fetch(release.downloadUrl, {
      headers: { Accept: "application/octet-stream", "User-Agent": "gainforest-app" },
      redirect: "follow",
      cache: "no-store",
    });

    if (!assetResponse.ok || !assetResponse.body) {
      return NextResponse.json({ error: "download_failed" }, { status: 502 });
    }

    return new NextResponse(assetResponse.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${release.assetName}"`,
      },
    });
  } catch (error) {
    console.error("[audiomoth] firmware roster failed", error);
    return NextResponse.json({ error: "github_unreachable" }, { status: 502 });
  }
}
