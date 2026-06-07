/**
 * Small, dependency-free formatting helpers shared across the explorer.
 */

const numberFmt = new Intl.NumberFormat("en-US");

export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return numberFmt.format(n);
}

/** USD amount: 26938.82 → "$26,938.82". */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Compact USD total: 26938.82 → "$26.9K", 1250000 → "$1.3M". */
export function formatCompactUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    compactDisplay: "short",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
}

/** Compact count: 416106 → "416K", 1765 → "1.8K". */
export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1000) return String(n);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Full human-readable timestamp in UTC: "May 23, 2026, 08:09 AM UTC".
 *  Records store ISO instants; the date-only `formatDate` hides the time, so
 *  the drawer uses this where the exact creation moment matters. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(d);
}

/** "3 hours ago" / "5 days ago" — relative time for record freshness. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 30) return `${day}d ago`;
  return formatDate(iso);
}

/** Compact elapsed duration: 26000 → "26s", 445000 → "7m", 25500000 → "7h 5m". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 24) return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
  const day = Math.floor(hr / 24);
  const remHr = hr % 24;
  return remHr ? `${day}d ${remHr}h` : `${day}d`;
}

export function formatCoord(
  lat: number | string | null | undefined,
  lon: number | string | null | undefined,
): string {
  const la = asNumber(lat);
  const lo = asNumber(lon);
  if (la == null || lo == null) return "";
  return `${la.toFixed(3)}°, ${lo.toFixed(3)}°`;
}

export function asNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** at://did:plc:abcdef…/coll/rkey → readable short form for chips. */
export function shortAtUri(uri: string): string {
  const m = uri.match(/^at:\/\/(did:[a-z0-9]+:)([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) return uri;
  const [, prefix, id, , rkey] = m;
  return `at://${prefix}${id.slice(0, 4)}…${id.slice(-4)}/…/${rkey.slice(-7)}`;
}

/** did:plc:abcdefghij… → "did:plc:abcd…ghij" */
export function shortDid(did: string): string {
  if (!did.startsWith("did:")) return did;
  const tail = did.split(":").pop() ?? did;
  if (tail.length <= 12) return did;
  const prefix = did.slice(0, did.length - tail.length);
  return `${prefix}${tail.slice(0, 4)}…${tail.slice(-4)}`;
}

/** 0x12ab…cd34 wallet shortener (already-short values pass through). */
export function shortWallet(addr: string): string {
  if (!addr.startsWith("0x") || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** ISO country code → flag emoji (best effort; falls back to the code). */
export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
