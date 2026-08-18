import "server-only";
import crypto from "crypto";

import { APPROXIMATE_FUZZ_DEGREES } from "./org-location-geometry";

/**
 * Deterministic coordinate fuzzing for approximate organization locations —
 * the same construction Ma Earth uses for approximate sites (HMAC-SHA256 over
 * a server-held secret), for the same reason: a random offset re-rolled on
 * every save leaks the true point to anyone who averages the published
 * circles. Keying the offset means re-publishing the same location always
 * yields the same circle, so repeated saves reveal nothing extra.
 *
 * Server-only: the secret is the entire protection. Two deliberate
 * differences from Ma Earth's version:
 *
 *  - Both axes are derived from ONE digest keyed on `did:lat,lon` rather than
 *    a digest per axis. Ma Earth fuzzes inside its own publish path with no
 *    endpoint attached; ours is reachable (by people who may already edit the
 *    org), and per-axis keying would let such a caller brute-force each axis
 *    independently — ~2·10^5 guesses instead of ~4·10^10 for the pair.
 *  - The key includes the target repo DID, and the route only fuzzes for a
 *    repo the caller may write to, so nobody can probe another org's offsets.
 */

const SECRET_ENV = "COORDINATE_FUZZING_SECRET";
const DEV_FALLBACK_SECRET = "dev-only-fuzzing-secret-do-not-use-in-prod";

function fuzzingSecret(): string {
  const secret = process.env[SECRET_ENV];
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    // Fail loud: fuzzing with a known constant would silently publish
    // recoverable coordinates for everyone who asked us not to.
    throw new Error(
      `${SECRET_ENV} is not set — refusing to fuzz coordinates with a known fallback. This would defeat the privacy protection for approximate locations.`,
    );
  }
  console.warn(
    `[org-location-fuzz] ${SECRET_ENV} is not set. Using a development-only fallback. This must NEVER reach production.`,
  );
  return DEV_FALLBACK_SECRET;
}

/** Map 4 digest bytes to a float in [-precision, +precision]. */
function offsetFromDigest(digest: Buffer, byteOffset: number, precision: number): number {
  const normalized = digest.readUInt32BE(byteOffset) / 0xffffffff;
  return (normalized - 0.5) * precision * 2;
}

/**
 * Offset a coordinate deterministically for `did`. The same DID + coordinate
 * always yields the same fuzzed point; a different DID or a different
 * coordinate yields an unrelated one.
 */
export function fuzzCoordinateForDid(
  did: string,
  latitude: number,
  longitude: number,
  precision: number = APPROXIMATE_FUZZ_DEGREES,
): { latitude: number; longitude: number } {
  const hmac = crypto.createHmac("sha256", fuzzingSecret());
  // Full published precision (6 dp) in the key: a coarse guess of the true
  // point produces a completely unrelated offset, so an attacker has to hit
  // the exact coordinate pair rather than search a coarse grid.
  hmac.update(`${did}:${latitude.toFixed(6)},${longitude.toFixed(6)}`);
  const digest = hmac.digest();

  const lat = Math.max(-90, Math.min(90, latitude + offsetFromDigest(digest, 0, precision)));
  let lon = longitude + offsetFromDigest(digest, 4, precision);
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { latitude: lat, longitude: lon };
}
