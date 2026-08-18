import { describe, expect, it } from "vitest";

import { imageMetadata } from "./observation-image";

// 37°48'30"N → +37.8083333 ; 122°25'10"W → -122.4194444
const EXPECTED_LAT = "37.8083333";
const EXPECTED_LON = "-122.4194444";
const EXPECTED_DATE = "2021-08-15";
const DATE_STRING = "2021:08:15 12:30:45\0"; // 20 bytes incl. terminator

/**
 * Assemble a big-endian ("MM") TIFF/EXIF block carrying DateTimeOriginal plus a
 * GPS IFD (lat 37°48'30"N, lon 122°25'10"W). This is the exact payload both a
 * JPEG APP1 segment and a HEIF "Exif" item wrap, so reusing it across both tests
 * proves the shared TIFF reader is reached from either container.
 */
function buildTiffExif(): Uint8Array {
  const bytes = new Uint8Array(190);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };

  // TIFF header: byte order "MM", magic 42, IFD0 at offset 8.
  ascii(0, "MM");
  view.setUint16(2, 42, false);
  view.setUint32(4, 8, false);

  // Data area offsets.
  const DT_OFFSET = 122;
  const LAT_OFFSET = 142;
  const LON_OFFSET = 166;

  // IFD0 @ 8: DateTime, Exif IFD pointer, GPS IFD pointer.
  let p = 8;
  view.setUint16(p, 3, false);
  p += 2;
  const entry = (tag: number, type: number, count: number, write: (at: number) => void) => {
    view.setUint16(p, tag, false);
    view.setUint16(p + 2, type, false);
    view.setUint32(p + 4, count, false);
    write(p + 8);
    p += 12;
  };
  entry(0x0132, 2, 20, (at) => view.setUint32(at, DT_OFFSET, false)); // DateTime
  entry(0x8769, 4, 1, (at) => view.setUint32(at, 50, false)); // ExifIFDPointer → 50
  entry(0x8825, 4, 1, (at) => view.setUint32(at, 68, false)); // GPSInfoIFDPointer → 68
  view.setUint32(p, 0, false); // next IFD
  p += 4;

  // Exif IFD @ 50: DateTimeOriginal.
  view.setUint16(p, 1, false);
  p += 2;
  entry(0x9003, 2, 20, (at) => view.setUint32(at, DT_OFFSET, false));
  view.setUint32(p, 0, false);
  p += 4;

  // GPS IFD @ 68: refs (inline ASCII) + lat/lon rationals (out-of-line).
  view.setUint16(p, 4, false);
  p += 2;
  entry(0x0001, 2, 2, (at) => ascii(at, "N")); // GPSLatitudeRef
  entry(0x0002, 5, 3, (at) => view.setUint32(at, LAT_OFFSET, false)); // GPSLatitude
  entry(0x0003, 2, 2, (at) => ascii(at, "W")); // GPSLongitudeRef
  entry(0x0004, 5, 3, (at) => view.setUint32(at, LON_OFFSET, false)); // GPSLongitude
  view.setUint32(p, 0, false);
  p += 4;

  // Data area.
  ascii(DT_OFFSET, DATE_STRING);
  const rational = (offset: number, num: number, den: number) => {
    view.setUint32(offset, num, false);
    view.setUint32(offset + 4, den, false);
  };
  rational(LAT_OFFSET, 37, 1);
  rational(LAT_OFFSET + 8, 48, 1);
  rational(LAT_OFFSET + 16, 30, 1);
  rational(LON_OFFSET, 122, 1);
  rational(LON_OFFSET + 8, 25, 1);
  rational(LON_OFFSET + 16, 10, 1);

  return bytes;
}

/** Wrap a TIFF block in a minimal JPEG (SOI + APP1 "Exif\0\0" + EOI). */
function buildJpeg(tiff: Uint8Array): Uint8Array {
  const marker = new TextEncoder().encode("Exif\0\0");
  const app1Length = 2 + marker.length + tiff.length; // length field counts itself
  const out = new Uint8Array(2 + 2 + 2 + marker.length + tiff.length + 2);
  const view = new DataView(out.buffer);
  let p = 0;
  view.setUint16(p, 0xffd8, false); // SOI
  p += 2;
  view.setUint16(p, 0xffe1, false); // APP1
  p += 2;
  view.setUint16(p, app1Length, false);
  p += 2;
  out.set(marker, p);
  p += marker.length;
  out.set(tiff, p);
  p += tiff.length;
  view.setUint16(p, 0xffd9, false); // EOI
  return out;
}

/**
 * Wrap a TIFF block in a minimal ISO base-media (HEIC) file: ftyp + meta(iinf +
 * iloc) + mdat. `headerOffset` is the ExifDataBlock's 4-byte TIFF offset, and
 * `withMarker` optionally injects an "Exif\0\0" prefix to mirror real encoders.
 */
function buildHeif(tiff: Uint8Array, opts: { headerOffset: number; withMarker: boolean }): Uint8Array {
  const enc = new TextEncoder();
  const marker = opts.withMarker ? enc.encode("Exif\0\0") : new Uint8Array(0);
  // ExifDataBlock = 4-byte header offset, [optional marker], TIFF.
  const payload = new Uint8Array(4 + marker.length + tiff.length);
  new DataView(payload.buffer).setUint32(0, opts.headerOffset, false);
  payload.set(marker, 4);
  payload.set(tiff, 4 + marker.length);

  const box = (type: string, content: Uint8Array): Uint8Array => {
    const out = new Uint8Array(8 + content.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, out.length, false);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(content, 8);
    return out;
  };
  const u16 = (n: number) => {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n, false);
    return b;
  };
  const u32 = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, false);
    return b;
  };
  const concat = (...parts: Uint8Array[]) => {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  };

  // ftyp: major brand "heic" + minor 0 + compatible ["heic","mif1"].
  const ftyp = box("ftyp", concat(enc.encode("heic"), u32(0), enc.encode("heic"), enc.encode("mif1")));

  // infe (version 2): item_ID 1, protection 0, type "Exif", empty name.
  const infe = box(
    "infe",
    concat(new Uint8Array([2, 0, 0, 0]), u16(1), u16(0), enc.encode("Exif"), new Uint8Array([0])),
  );
  // iinf (version 0): entry_count 1 + the infe.
  const iinf = box("iinf", concat(new Uint8Array([0, 0, 0, 0]), u16(1), infe));

  // iloc (version 0, offset_size 4 / length_size 4 / base_offset_size 0).
  // extent_offset is the absolute file offset of the payload, patched below.
  const ilocContent = concat(
    new Uint8Array([0, 0, 0, 0]), // version + flags
    new Uint8Array([0x44]), // offset_size=4, length_size=4
    new Uint8Array([0x00]), // base_offset_size=0
    u16(1), // item_count
    u16(1), // item_ID
    u16(0), // data_reference_index
    u16(1), // extent_count
    u32(0), // extent_offset (placeholder)
    u32(payload.length), // extent_length
  );
  const iloc = box("iloc", ilocContent);

  const meta = box("meta", concat(new Uint8Array([0, 0, 0, 0]), iinf, iloc));
  const mdat = box("mdat", payload);

  // Payload sits 8 bytes (mdat header) into the mdat box.
  const payloadFileOffset = ftyp.length + meta.length + 8;
  const file = concat(ftyp, meta, mdat);
  // Patch the extent_offset inside iloc now that the layout is known.
  const ilocExtentOffsetPos = ftyp.length + 8 /* meta hdr */ + 4 /* meta ver/flags */ + iinf.length + 8 /* iloc hdr */ + ilocContent.length - 8 /* before offset+length */;
  new DataView(file.buffer).setUint32(ilocExtentOffsetPos, payloadFileOffset, false);
  return file;
}

async function read(bytes: Uint8Array, name: string, type: string) {
  return imageMetadata(new File([bytes as unknown as BlobPart], name, { type }));
}

describe("imageMetadata", () => {
  it("reads date + GPS from a JPEG APP1 EXIF segment", async () => {
    const meta = await read(buildJpeg(buildTiffExif()), "photo.jpg", "image/jpeg");
    expect(meta).toEqual({
      eventDate: EXPECTED_DATE,
      decimalLatitude: EXPECTED_LAT,
      decimalLongitude: EXPECTED_LON,
    });
  });

  it("reads date + GPS from a HEIC Exif item (offset 6 + Exif marker)", async () => {
    const heic = buildHeif(buildTiffExif(), { headerOffset: 6, withMarker: true });
    const meta = await read(heic, "photo.heic", "image/heic");
    expect(meta).toEqual({
      eventDate: EXPECTED_DATE,
      decimalLatitude: EXPECTED_LAT,
      decimalLongitude: EXPECTED_LON,
    });
  });

  it("reads HEIC with a zero header offset but a stray Exif marker", async () => {
    const heic = buildHeif(buildTiffExif(), { headerOffset: 0, withMarker: true });
    const meta = await read(heic, "photo.heic", "image/heic");
    expect(meta).toMatchObject({ decimalLatitude: EXPECTED_LAT, decimalLongitude: EXPECTED_LON });
  });

  it("reads HEIC with the TIFF header immediately after the offset", async () => {
    const heic = buildHeif(buildTiffExif(), { headerOffset: 0, withMarker: false });
    const meta = await read(heic, "photo.heif", "image/heif");
    expect(meta).toMatchObject({ decimalLatitude: EXPECTED_LAT, decimalLongitude: EXPECTED_LON });
  });

  it("returns empty metadata for a non-image / unrecognized buffer", async () => {
    const meta = await read(new Uint8Array(32), "junk.bin", "application/octet-stream");
    expect(meta).toEqual({});
  });
});
