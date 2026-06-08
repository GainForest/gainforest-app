function extractGoogleDriveFileId(url: string): string | null {
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch?.[1]) return fileMatch[1];

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("id");
  } catch {
    return null;
  }
}

function transformGoogleDriveUrl(url: string): string | null {
  const fileId = extractGoogleDriveFileId(url);
  return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : null;
}

function transformDropboxUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("dropbox.com") && !parsed.hostname.includes("dl.dropboxusercontent.com")) {
      return null;
    }

    parsed.searchParams.set("dl", "1");
    return parsed.toString();
  } catch {
    return null;
  }
}

export function transformPhotoUrl(url: string): string {
  const trimmed = url.trim();

  if (trimmed.includes("drive.google.com") || trimmed.includes("docs.google.com")) {
    const transformed = transformGoogleDriveUrl(trimmed);
    if (transformed) return transformed;
  }

  if (trimmed.includes("dropbox.com")) {
    const transformed = transformDropboxUrl(trimmed);
    if (transformed) return transformed;
  }

  return trimmed;
}

export function extractFileName(url: string): string {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment && /\.\w{2,5}$/.test(lastSegment)) return decodeURIComponent(lastSegment);
  } catch {
    // Keep the plain fallback below.
  }

  return "photo.jpg";
}
