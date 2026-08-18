/**
 * File-type detection for the unified "Add data" drop zone.
 *
 * Maps a dropped/picked file to the data flow that knows how to handle it, by
 * looking at both its MIME type and filename extension. The mapping mirrors what
 * each existing flow already accepts:
 *   - observation → image/* (jpg, png, webp, heic) — see ObservationBulkAddPanel
 *   - tree        → .csv / .tsv spreadsheet exports  — see FileDropStep
 *   - audio       → audio/* (wav, mp3, m4a, flac…)   — see AudioForms
 *   - site        → GeoJSON boundary files           — see SiteEditorModal
 *
 * Anything we cannot confidently place (a .zip that could be Kobo media or a
 * shapefile, a GeoTIFF that belongs in the drone viewer, mixed selections) is
 * reported as ambiguous so the caller can fall back to the manual chooser.
 */

export type UploadKind = "observation" | "tree" | "audio" | "site";
export type DetectedKind = UploadKind | "unknown";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp"]);
const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg", "oga", "opus", "aiff", "aif"]);
const TREE_EXTENSIONS = new Set(["csv", "tsv"]);
const SITE_EXTENSIONS = new Set(["geojson", "json", "kml"]);

function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** Map a single file to the flow that can ingest it, or "unknown". */
function detectUploadKind(file: { name: string; type: string }): DetectedKind {
  const mime = (file.type || "").toLowerCase();
  const ext = fileExtension(file.name);

  // Audio is checked before generic image/* so an "audio/webm" never reads as
  // an image, and so extensionless audio still resolves via its MIME type.
  if (mime.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext)) return "audio";

  // GeoTIFF rasters belong in the drone viewer, which has no in-app upload, so
  // they stay "unknown" rather than being mistaken for an observation image.
  if (ext === "tif" || ext === "tiff") return "unknown";
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) return "observation";

  if (mime === "text/csv" || mime === "text/tab-separated-values" || mime === "application/csv" || TREE_EXTENSIONS.has(ext)) {
    return "tree";
  }

  if (mime === "application/geo+json" || mime === "application/vnd.google-earth.kml+xml" || SITE_EXTENSIONS.has(ext)) {
    return "site";
  }

  return "unknown";
}

export type FileClassification = {
  /** The single kind every file resolved to, or null when mixed/empty/unknown. */
  kind: UploadKind | null;
  /** Files that resolved to `kind`. Empty when ambiguous. */
  files: File[];
  /** True when the drop can't be auto-routed (mixed, unknown, or empty). */
  ambiguous: boolean;
  /** Per-kind counts, useful for showing a "looks like…" hint in the chooser. */
  counts: Record<DetectedKind, number>;
};

/**
 * Classify a batch of files. Auto-routing only happens when every file maps to
 * the same known kind; any unknown file or a mix of kinds is ambiguous, so the
 * caller shows the chooser instead of guessing wrong.
 */
export function classifyFiles(fileList: FileList | File[] | null | undefined): FileClassification {
  const files = Array.from(fileList ?? []);
  const counts: Record<DetectedKind, number> = { observation: 0, tree: 0, audio: 0, site: 0, unknown: 0 };
  for (const file of files) counts[detectUploadKind(file)] += 1;

  const knownKinds = (["observation", "tree", "audio", "site"] as const).filter((kind) => counts[kind] > 0);
  const ambiguous = files.length === 0 || counts.unknown > 0 || knownKinds.length !== 1;

  if (ambiguous) {
    return { kind: null, files: [], ambiguous: true, counts };
  }

  const kind = knownKinds[0];
  return {
    kind,
    files: files.filter((file) => detectUploadKind(file) === kind),
    ambiguous: false,
    counts,
  };
}

/** The kind with the most files in an ambiguous drop, for a "looks like…" hint. */
export function dominantKind(counts: Record<DetectedKind, number>): UploadKind | null {
  let best: UploadKind | null = null;
  let bestCount = 0;
  for (const kind of ["observation", "tree", "audio", "site"] as const) {
    if (counts[kind] > bestCount) {
      best = kind;
      bestCount = counts[kind];
    }
  }
  return best;
}
