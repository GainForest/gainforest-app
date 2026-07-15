"use client";

/**
 * Pure, browser-only helpers for preparing observation photos: a tidy display
 * name, a fallback capture date, EXIF date/GPS extraction (JPEG plus HEIC /
 * HEIF / AVIF), and downscaling oversized images so they fit within the PDS
 * blob limit.
 *
 * Shared by the full bulk-add panel (ObservationsClient) and the quick
 * "Add observations" modal so the two stay byte-for-byte consistent.
 */

// Photos larger than this are downscaled before upload. The binding limit is
// Vercel's ~4.5 MB request-body cap on the mutation proxy: blobs travel as
// base64 inside JSON (×4/3 inflation), so a 3 MB image is ~4 MB on the wire.
// Anything between ~3.4 MB and 4 MB used to slip past the old 4 MB threshold
// uncompressed and then die server-side with FUNCTION_PAYLOAD_TOO_LARGE.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

// AI identification and on-screen previews don't need the full-resolution
// photo: a ~1024px JPEG (usually 100–300 KB) is plenty for both. Big batches
// then stop pushing hundreds of megabytes through the identify endpoint, and
// the browser stops decoding dozens of full-size photos just to draw 80px
// thumbnails.
const THUMBNAIL_MAX_DIM = 1024;
const THUMBNAIL_QUALITY = 0.78;

/** The slice of metadata we can recover from a photo's EXIF block. */
export type ImageMetadata = {
  eventDate?: string;
  decimalLatitude?: string;
  decimalLongitude?: string;
};

export function cleanFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

export function dateFromFile(file: File): string {
  const date = file.lastModified ? new Date(file.lastModified) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function parseExifDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function formatCoordinate(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(7)).toString();
}

function rationalAt(view: DataView, offset: number, littleEndian: boolean): number | null {
  if (offset < 0 || offset + 8 > view.byteLength) return null;
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  if (denominator === 0) return null;
  return numerator / denominator;
}

function gpsCoordinate(parts: Array<number | null>, ref: string | null): string | null {
  if (parts.some((part) => part === null)) return null;
  const [degrees, minutes, seconds] = parts as [number, number, number];
  let value = degrees + minutes / 60 + seconds / 3600;
  if (ref === "S" || ref === "W") value *= -1;
  return formatCoordinate(value);
}

type TiffEntry = { tag: number; type: number; count: number; valueOffset: number; inlineOffset: number; size: number };

/**
 * Pull the date + GPS we care about out of a TIFF/EXIF block. `tiffStart` is the
 * byte offset of the TIFF header ("II"/"MM" + 42) within `buffer`. Shared by the
 * JPEG (APP1) and HEIF (Exif item) readers, since both wrap the very same TIFF.
 */
function parseTiffExif(buffer: ArrayBuffer, view: DataView, tiffStart: number): ImageMetadata {
  if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return {};
  const littleEndian = view.getUint16(tiffStart, false) === 0x4949;
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return {};

  const typeSize = (type: number) => {
    if (type === 1 || type === 2 || type === 7) return 1;
    if (type === 3) return 2;
    if (type === 4 || type === 9) return 4;
    if (type === 5 || type === 10) return 8;
    return 0;
  };
  const readEntries = (ifdOffset: number): TiffEntry[] => {
    const start = tiffStart + ifdOffset;
    if (start < 0 || start + 2 > view.byteLength) return [];
    const count = view.getUint16(start, littleEndian);
    const entries: TiffEntry[] = [];
    for (let index = 0; index < count; index += 1) {
      const entryOffset = start + 2 + index * 12;
      if (entryOffset + 12 > view.byteLength) break;
      const type = view.getUint16(entryOffset + 2, littleEndian);
      const itemCount = view.getUint32(entryOffset + 4, littleEndian);
      const size = typeSize(type) * itemCount;
      entries.push({
        tag: view.getUint16(entryOffset, littleEndian),
        type,
        count: itemCount,
        valueOffset: view.getUint32(entryOffset + 8, littleEndian),
        inlineOffset: entryOffset + 8,
        size,
      });
    }
    return entries;
  };
  const valueOffset = (entry: TiffEntry) => entry.size <= 4 ? entry.inlineOffset : tiffStart + entry.valueOffset;
  const readAscii = (entry: TiffEntry | undefined): string | null => {
    if (!entry) return null;
    const start = valueOffset(entry);
    if (start < 0 || start + entry.count > view.byteLength) return null;
    return String.fromCharCode(...new Uint8Array(buffer, start, entry.count)).replace(/\0+$/, "").trim() || null;
  };
  const readRationals = (entry: TiffEntry | undefined): Array<number | null> => {
    if (!entry) return [];
    const start = valueOffset(entry);
    return Array.from({ length: entry.count }, (_, index) => rationalAt(view, start + index * 8, littleEndian));
  };
  const readLong = (entry: TiffEntry | undefined): number | null => {
    if (!entry) return null;
    const start = valueOffset(entry);
    if (start < 0 || start + 4 > view.byteLength) return null;
    return view.getUint32(start, littleEndian);
  };

  const ifd0 = readEntries(view.getUint32(tiffStart + 4, littleEndian));
  const byTag = (entries: TiffEntry[], tag: number) => entries.find((entry) => entry.tag === tag);
  const exifIfd = readLong(byTag(ifd0, 0x8769));
  const gpsIfd = readLong(byTag(ifd0, 0x8825));
  const exifEntries = exifIfd !== null ? readEntries(exifIfd) : [];
  const gpsEntries = gpsIfd !== null ? readEntries(gpsIfd) : [];

  const date = parseExifDate(readAscii(byTag(exifEntries, 0x9003)) ?? readAscii(byTag(ifd0, 0x0132)));
  const latitude = gpsCoordinate(readRationals(byTag(gpsEntries, 0x0002)), readAscii(byTag(gpsEntries, 0x0001)));
  const longitude = gpsCoordinate(readRationals(byTag(gpsEntries, 0x0004)), readAscii(byTag(gpsEntries, 0x0003)));

  return {
    ...(date ? { eventDate: date } : {}),
    ...(latitude ? { decimalLatitude: latitude } : {}),
    ...(longitude ? { decimalLongitude: longitude } : {}),
  };
}

/** Read EXIF date/GPS from a JPEG's APP1 segment. */
function parseJpegExif(buffer: ArrayBuffer, view: DataView): ImageMetadata {
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2, false);
    if (length < 2) break;
    if (marker === 0xe1 && length >= 8) {
      const exifStart = offset + 4;
      const header = String.fromCharCode(...new Uint8Array(buffer, exifStart, Math.min(6, view.byteLength - exifStart)));
      if (header === "Exif\0\0") return parseTiffExif(buffer, view, exifStart + 6);
    }
    offset += 2 + length;
  }
  return {};
}

/** Read a 4-character box type / brand identifier (e.g. "ftyp", "meta", "Exif"). */
function fourCC(view: DataView, offset: number): string {
  if (offset < 0 || offset + 4 > view.byteLength) return "";
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

type IsoBox = { type: string; contentStart: number; end: number };

/** Walk the ISO base-media (MP4 / HEIF) boxes within [start, end). */
function readIsoBoxes(view: DataView, start: number, end: number): IsoBox[] {
  const boxes: IsoBox[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset, false);
    const type = fourCC(view, offset + 4);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      // 64-bit largesize; stays well below 2^53 for any real photo.
      size = view.getUint32(offset + 8, false) * 0x100000000 + view.getUint32(offset + 12, false);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset; // box runs to the end of its container
    }
    if (size < headerSize || offset + size > end) break;
    boxes.push({ type, contentStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  return boxes;
}

/** Read an unsigned big-endian integer of `size` bytes (0 → 0). */
function readUint(view: DataView, offset: number, size: number): number {
  let value = 0;
  for (let index = 0; index < size; index += 1) value = value * 256 + view.getUint8(offset + index);
  return value;
}

/** Find the item_ID of the "Exif" item declared in an `iinf` box, if any. */
function exifItemId(view: DataView, iinf: IsoBox): number | null {
  let p = iinf.contentStart;
  const version = view.getUint8(p);
  p += 4; // version (1) + flags (3)
  p += version === 0 ? 2 : 4; // entry_count — skipped; we iterate the child boxes
  for (const entry of readIsoBoxes(view, p, iinf.end)) {
    if (entry.type !== "infe") continue;
    let q = entry.contentStart;
    const infeVersion = view.getUint8(q);
    q += 4; // version + flags
    let id: number;
    if (infeVersion >= 3) {
      id = view.getUint32(q, false);
      q += 4;
    } else if (infeVersion === 2) {
      id = view.getUint16(q, false);
      q += 2;
    } else {
      continue; // versions 0/1 use a different layout and never carry Exif in practice
    }
    q += 2; // item_protection_index
    if (fourCC(view, q) === "Exif") return id;
  }
  return null;
}

type ItemExtent = { offset: number; method: number };

/** Resolve an item's first extent (offset + construction method) from an `iloc` box. */
function itemExtent(view: DataView, iloc: IsoBox, itemId: number): ItemExtent | null {
  let p = iloc.contentStart;
  const version = view.getUint8(p);
  p += 4; // version + flags
  const sizeByte = view.getUint8(p);
  const offsetSize = sizeByte >> 4;
  const lengthSize = sizeByte & 0x0f;
  p += 1;
  const baseByte = view.getUint8(p);
  const baseOffsetSize = baseByte >> 4;
  const indexSize = version === 1 || version === 2 ? baseByte & 0x0f : 0;
  p += 1;
  let itemCount: number;
  if (version < 2) {
    itemCount = view.getUint16(p, false);
    p += 2;
  } else {
    itemCount = view.getUint32(p, false);
    p += 4;
  }
  for (let i = 0; i < itemCount; i += 1) {
    let id: number;
    if (version < 2) {
      id = view.getUint16(p, false);
      p += 2;
    } else {
      id = view.getUint32(p, false);
      p += 4;
    }
    let method = 0;
    if (version === 1 || version === 2) {
      method = view.getUint16(p, false) & 0x0f;
      p += 2;
    }
    p += 2; // data_reference_index
    const baseOffset = readUint(view, p, baseOffsetSize);
    p += baseOffsetSize;
    const extentCount = view.getUint16(p, false);
    p += 2;
    let firstOffset: number | null = null;
    for (let j = 0; j < extentCount; j += 1) {
      if (indexSize > 0) p += indexSize; // extent_index
      const extentOffset = readUint(view, p, offsetSize);
      p += offsetSize + lengthSize; // skip extent_length
      if (firstOffset === null) firstOffset = extentOffset;
    }
    if (id === itemId && firstOffset !== null) return { offset: baseOffset + firstOffset, method };
  }
  return null;
}

/**
 * Read EXIF date/GPS from an ISO base-media image (HEIC / HEIF / AVIF). These
 * store EXIF as a named item inside the top-level `meta` box: `iinf` declares an
 * "Exif" item, `iloc` says where its bytes live, and that payload is a 4-byte
 * offset followed by the same TIFF block a JPEG would carry in its APP1 segment.
 */
function parseHeifExif(buffer: ArrayBuffer, view: DataView): ImageMetadata {
  const meta = readIsoBoxes(view, 0, view.byteLength).find((box) => box.type === "meta");
  if (!meta) return {};
  // `meta` is a FullBox: step over its 4-byte version/flags before its children.
  const metaBoxes = readIsoBoxes(view, meta.contentStart + 4, meta.end);
  const iinf = metaBoxes.find((box) => box.type === "iinf");
  const iloc = metaBoxes.find((box) => box.type === "iloc");
  if (!iinf || !iloc) return {};

  const itemId = exifItemId(view, iinf);
  if (itemId === null) return {};
  const extent = itemExtent(view, iloc, itemId);
  if (!extent) return {};

  // method 0 = absolute file offset; method 1 = offset into the `idat` box.
  let itemOffset = extent.offset;
  if (extent.method === 1) {
    const idat = metaBoxes.find((box) => box.type === "idat");
    if (!idat) return {};
    itemOffset = idat.contentStart + extent.offset;
  } else if (extent.method !== 0) {
    return {};
  }

  if (itemOffset < 0 || itemOffset + 4 > view.byteLength) return {};
  // ExifDataBlock: a 4-byte offset to the TIFF header, then the EXIF payload.
  let tiffStart = itemOffset + 4 + view.getUint32(itemOffset, false);
  // Some encoders prepend an "Exif\0\0" marker; step over it when present.
  if (fourCC(view, tiffStart) === "Exif") tiffStart += 6;
  return parseTiffExif(buffer, view, tiffStart);
}

function parseImageExif(buffer: ArrayBuffer): ImageMetadata {
  const view = new DataView(buffer);
  if (view.byteLength < 16) return {};
  // JPEG opens with the SOI marker; HEIC / HEIF / AVIF are ISO base-media files
  // whose first box is `ftyp`.
  if (view.getUint16(0) === 0xffd8) return parseJpegExif(buffer, view);
  if (fourCC(view, 4) === "ftyp") return parseHeifExif(buffer, view);
  return {};
}

export async function imageMetadata(file: File): Promise<ImageMetadata> {
  try {
    return parseImageExif(await file.arrayBuffer());
  } catch {
    return {};
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not prepare image."));
    }, mimeType, quality);
  });
}

export async function compressImageIfNeeded(file: File): Promise<{ file: File; compressed: boolean; originalSize: number }> {
  if (file.size <= MAX_IMAGE_BYTES) return { file, compressed: false, originalSize: file.size };
  const bitmap = await createImageBitmap(file);
  try {
    return await compressBitmap(bitmap, file);
  } finally {
    bitmap.close();
  }
}

async function compressBitmap(
  bitmap: ImageBitmap,
  file: File,
): Promise<{ file: File; compressed: boolean; originalSize: number }> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image.");

  const width = bitmap.width;
  const height = bitmap.height;
  const mimeType = "image/jpeg";
  const extensionless = file.name.replace(/\.[^.]+$/, "") || "observation";

  for (const scale of [1, 0.86, 0.72, 0.6, 0.5, 0.42]) {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46]) {
      const blob = await canvasToBlob(canvas, mimeType, quality);
      if (blob.size <= MAX_IMAGE_BYTES) {
        return {
          file: new File([blob], `${extensionless}.jpg`, { type: mimeType, lastModified: file.lastModified }),
          compressed: true,
          originalSize: file.size,
        };
      }
    }
  }

  throw new Error("Could not prepare image.");
}

async function thumbnailFromBitmap(bitmap: ImageBitmap, file: File): Promise<File> {
  const scale = Math.min(1, THUMBNAIL_MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, "image/jpeg", THUMBNAIL_QUALITY);
  const extensionless = file.name.replace(/\.[^.]+$/, "") || "observation";
  return new File([blob], `${extensionless}-thumb.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}

export type PreparedObservationImage = {
  /** The photo to publish — downscaled only when the original is oversized. */
  file: File;
  /**
   * Small JPEG stand-in for previews and AI identification. Null when the
   * browser can't decode the source at all (e.g. HEIC on Chrome), in which
   * case callers should fall back to the original file.
   */
  thumbnail: File | null;
};

/**
 * One-decode preparation for an observation photo: compress it when it exceeds
 * the blob limit AND derive the small preview/analysis thumbnail from the same
 * bitmap. Decoding a large photo is the expensive part, so sharing the bitmap
 * roughly halves the work compared to running the two steps separately.
 */
export async function prepareObservationImage(source: File): Promise<PreparedObservationImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    // Undecodable in this browser — publish the original untouched, no thumbnail.
    return { file: source, thumbnail: null };
  }
  try {
    const thumbnail = await thumbnailFromBitmap(bitmap, source).catch(() => null);
    const file = source.size <= MAX_IMAGE_BYTES ? source : (await compressBitmap(bitmap, source)).file;
    return { file, thumbnail };
  } finally {
    bitmap.close();
  }
}
