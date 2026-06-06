import JSZip from "jszip";

export type KoboMediaZipEntry = {
  entryPath: string;
  fileName: string;
  normalizedFileName: string;
  submissionUuid: string;
  mimeType: string;
};

export type KoboMediaZipIndex = {
  fileName: string;
  entries: KoboMediaZipEntry[];
  submissionCount: number;
};

export type KoboMediaZipArchive = JSZip;

const IMAGE_MIME_BY_EXTENSION = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["heic", "image/heic"],
]);

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function normalizeFileName(fileName: string): string {
  return fileName.toLowerCase().trim();
}

function getMimeType(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? (IMAGE_MIME_BY_EXTENSION.get(ext) ?? null) : null;
}

function extractSubmissionUuid(entryPath: string): string {
  const parts = entryPath.split("/");
  return parts[0] ?? "";
}

export async function buildKoboMediaZipIndex(file: File): Promise<KoboMediaZipIndex> {
  const zip = await JSZip.loadAsync(file);
  const entries: KoboMediaZipEntry[] = [];
  const submissionUuids = new Set<string>();

  for (const [entryPath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const fileName = entryPath.split("/").pop() ?? entryPath;
    const mimeType = getMimeType(fileName);
    if (!mimeType) continue;
    const submissionUuid = extractSubmissionUuid(entryPath);
    if (submissionUuid) submissionUuids.add(submissionUuid);
    entries.push({
      entryPath,
      fileName,
      normalizedFileName: normalizeFileName(fileName),
      submissionUuid,
      mimeType,
    });
  }

  return { fileName: file.name, entries, submissionCount: submissionUuids.size };
}

export function resolveKoboMediaZipEntry(
  index: KoboMediaZipIndex,
  rawRow: Record<string, string>,
  value: string,
): KoboMediaZipEntry | null {
  const normalizedValue = normalizeFileName(value.split("/").pop() ?? value);
  return index.entries.find((e) => e.normalizedFileName === normalizedValue) ?? null;
}

export type SerializableFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: ArrayBuffer;
};

export async function loadKoboMediaZipArchive(file: File): Promise<KoboMediaZipArchive> {
  return JSZip.loadAsync(file);
}

export async function readKoboMediaZipEntryAsSerializableFile(options: {
  archive: KoboMediaZipArchive;
  entryPath: string;
  fileName: string;
  mimeType: string;
}): Promise<SerializableFile> {
  const entry = options.archive.file(options.entryPath);
  if (!entry) throw new Error(`Entry not found in ZIP: ${options.entryPath}`);
  const arrayBuffer = await entry.async("arraybuffer");
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large: ${(arrayBuffer.byteLength / (1024 * 1024)).toFixed(1)} MB (max 3 MB).`);
  }
  return { name: options.fileName, type: options.mimeType, size: arrayBuffer.byteLength, arrayBuffer };
}
