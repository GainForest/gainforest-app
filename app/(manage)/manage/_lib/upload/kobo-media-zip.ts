import { BlobReader, ZipReader, type FileEntry } from "@zip.js/zip.js";

export type KoboMediaZipEntry = {
  entryPath: string;
  fileName: string;
  normalizedFileName: string;
  submissionUuid: string;
  mimeType: string;
  uncompressedSize: number | null;
};

export type KoboMediaZipIndex = {
  fileName: string;
  entries: KoboMediaZipEntry[];
  submissionCount: number;
};

export type KoboMediaZipArchive = {
  fileName: string;
  entriesByPath: Map<string, FileEntry>;
  close: () => Promise<void>;
};

const IMAGE_MIME_BY_EXTENSION = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["heic", "image/heic"],
]);

export const MAX_KOBO_MEDIA_IMAGE_BYTES = 3 * 1024 * 1024;

const ZIP_READER_OPTIONS = { useWebWorkers: false } as const;

function normalizeZipEntryPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function normalizeFileName(fileName: string): string {
  return fileName.trim().toLowerCase();
}

function getPathSegments(path: string): string[] {
  return normalizeZipEntryPath(path).split("/").filter((segment) => segment.length > 0);
}

function getFileNameFromPath(path: string): string | null {
  const segments = getPathSegments(path);
  const fileName = segments[segments.length - 1];
  return fileName && fileName.length > 0 ? fileName : null;
}

function normalizeSubmissionUuid(value: string): string {
  return value.trim().replace(/^uuid:/i, "").toLowerCase();
}

function getSubmissionUuidFromPath(path: string): string | null {
  const segments = getPathSegments(path);
  const parentDirectoryIndex = segments.length - 2;

  if (parentDirectoryIndex < 1) return null;

  const hasAttachmentsAncestor = segments.some(
    (segment, index) => index < parentDirectoryIndex && segment.toLowerCase() === "attachments",
  );
  if (!hasAttachmentsAncestor) return null;

  const submissionUuid = segments[parentDirectoryIndex];
  return submissionUuid && submissionUuid.length > 0 ? normalizeSubmissionUuid(submissionUuid) : null;
}

function getEntryUncompressedSize(entry: FileEntry): number | null {
  const size = Number(entry.uncompressedSize);
  return Number.isFinite(size) && size >= 0 ? size : null;
}

function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}

function validateImageByteLength(byteLength: number, fileName: string): void {
  if (byteLength === 0) throw new Error(`The photo "${fileName}" is empty and was not saved.`);
  if (byteLength > MAX_KOBO_MEDIA_IMAGE_BYTES) {
    throw new Error(
      `The photo "${fileName}" is too large (${formatMegabytes(byteLength)} MB). Photos must be 3 MB or smaller.`,
    );
  }
}

async function closeZipReader(reader: ZipReader<Blob>): Promise<void> {
  try {
    await reader.close();
  } catch {
    // The browser may already have released the underlying Blob reader. There is nothing actionable for the user.
  }
}

function createZipReader(file: File): ZipReader<Blob> {
  return new ZipReader(new BlobReader(file), ZIP_READER_OPTIONS);
}

function addArchiveEntry(entriesByPath: Map<string, FileEntry>, entry: FileEntry): void {
  entriesByPath.set(normalizeZipEntryPath(entry.filename), entry);
}

function getImageMimeTypeFromFileName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension) return "application/octet-stream";
  return IMAGE_MIME_BY_EXTENSION.get(extension) ?? "application/octet-stream";
}

function isAcceptedKoboMediaImage(fileName: string): boolean {
  return IMAGE_MIME_BY_EXTENSION.has(fileName.split(".").pop()?.toLowerCase() ?? "");
}

export async function loadKoboMediaZipArchive(file: File): Promise<KoboMediaZipArchive> {
  const reader = createZipReader(file);
  const entriesByPath = new Map<string, FileEntry>();

  try {
    for await (const entry of reader.getEntriesGenerator()) {
      if (entry.directory) continue;
      addArchiveEntry(entriesByPath, entry);
    }

    return {
      fileName: file.name,
      entriesByPath,
      close: () => closeZipReader(reader),
    };
  } catch {
    await closeZipReader(reader);
    throw new Error(
      "The selected photo folder could not be opened. Start over, choose the matching photo folder, and try again.",
    );
  }
}

export async function buildKoboMediaZipIndex(file: File): Promise<KoboMediaZipIndex> {
  const reader = createZipReader(file);
  const entries: KoboMediaZipEntry[] = [];
  const submissionUuids = new Set<string>();

  try {
    for await (const entry of reader.getEntriesGenerator()) {
      if (entry.directory) continue;

      const entryPath = normalizeZipEntryPath(entry.filename);
      const fileName = getFileNameFromPath(entryPath);
      const submissionUuid = getSubmissionUuidFromPath(entryPath);
      if (!fileName || !submissionUuid || !isAcceptedKoboMediaImage(fileName)) continue;

      submissionUuids.add(submissionUuid);
      entries.push({
        entryPath,
        fileName,
        normalizedFileName: normalizeFileName(fileName),
        submissionUuid,
        mimeType: getImageMimeTypeFromFileName(fileName),
        uncompressedSize: getEntryUncompressedSize(entry),
      });
    }
  } catch {
    throw new Error(
      "This photo folder could not be opened. Make sure you selected the photo folder downloaded from your field form app.",
    );
  } finally {
    await closeZipReader(reader);
  }

  return { fileName: file.name, entries, submissionCount: submissionUuids.size };
}

function getKoboSubmissionUuid(row: Record<string, string>): string | null {
  const candidates = [row._uuid, row["meta/rootUuid"]];

  for (const candidate of candidates) {
    const normalized = candidate ? normalizeSubmissionUuid(candidate) : "";
    if (normalized.length > 0) return normalized;
  }

  return null;
}

export function resolveKoboMediaZipEntry(
  index: KoboMediaZipIndex,
  row: Record<string, string>,
  fileName: string,
): KoboMediaZipEntry | null {
  const submissionUuid = getKoboSubmissionUuid(row);
  if (!submissionUuid) return null;

  const normalizedFileName = normalizeFileName(fileName);
  return (
    index.entries.find(
      (entry) => entry.submissionUuid === submissionUuid && entry.normalizedFileName === normalizedFileName,
    ) ?? null
  );
}

export type SerializableFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: ArrayBuffer;
};

export async function readKoboMediaZipEntryAsSerializableFile(options: {
  archive: KoboMediaZipArchive;
  entryPath: string;
  fileName: string;
  mimeType: string;
}): Promise<SerializableFile> {
  const entry = options.archive.entriesByPath.get(normalizeZipEntryPath(options.entryPath));
  if (!entry) {
    throw new Error(
      `The photo "${options.fileName}" could not be found in the selected photo folder. Start over and choose the matching photo folder.`,
    );
  }

  if (entry.encrypted) {
    throw new Error(`The photo "${options.fileName}" is password-protected and was not saved.`);
  }

  const declaredSize = getEntryUncompressedSize(entry);
  if (declaredSize !== null) validateImageByteLength(declaredSize, options.fileName);

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await entry.arrayBuffer(ZIP_READER_OPTIONS);
  } catch {
    throw new Error(
      `The photo "${options.fileName}" could not be read from the photo folder. Choose the matching photo folder and try again.`,
    );
  }

  validateImageByteLength(arrayBuffer.byteLength, options.fileName);

  return {
    name: options.fileName,
    type: options.mimeType,
    size: arrayBuffer.byteLength,
    arrayBuffer,
  };
}
