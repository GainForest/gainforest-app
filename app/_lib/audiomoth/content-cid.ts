/**
 * Content CIDs for uploaded recordings — computed client-side so the
 * uploader can recognise files that are already in the user's account
 * before sending a single byte.
 *
 * The format matches what atproto uses for blobs: CIDv1, raw codec,
 * SHA-256 multihash, base32 multibase (the familiar `bafkrei…` shape).
 * The original WAV lives in object storage rather than on the PDS, but
 * using the same convention keeps the identifier interoperable.
 */

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC 4648 base32, lowercase, no padding — the multibase `b` encoding. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** CIDv1 (raw codec, SHA-256) of the given bytes, base32-multibase encoded. */
export async function cidForBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = bytes instanceof Uint8Array ? (bytes.slice().buffer as ArrayBuffer) : bytes;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  // 0x01 CIDv1 · 0x55 raw codec · 0x12 sha2-256 · 0x20 digest length (32)
  const cid = new Uint8Array(4 + digest.length);
  cid.set([0x01, 0x55, 0x12, 0x20]);
  cid.set(digest, 4);
  return `b${base32Encode(cid)}`;
}

/** Files larger than this are not hashed (kept out of memory); dedup falls back to name+size. */
const MAX_HASH_BYTES = 1024 ** 3; // 1 GB

/**
 * Content CID of a picked file, or null when the file is too large to
 * hash in memory or reading fails. Never throws.
 */
export async function computeFileCid(file: File): Promise<string | null> {
  if (file.size > MAX_HASH_BYTES) return null;
  try {
    return await cidForBytes(await file.arrayBuffer());
  } catch {
    return null;
  }
}
