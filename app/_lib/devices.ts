/**
 * Field Raspberry Pi liveness — a port of GainForest/pi-taina-monitor's
 * `dashboard/lib/healthchecks.ts`, narrowed to the liveness signals.
 *
 * Each field Pi running Taina pings healthchecks.io every 60s via a systemd
 * timer. Healthchecks.io stores last-ping + status; the heartbeat body embeds
 * two JSON blocks the agent emits — `== system-stats-json ==` (temp / RAM /
 * disk / load / uptime) and `== taina-stats-json ==` (the atproto handle +
 * local draft queue). We read the Healthchecks read-only API and join them
 * into one device snapshot.
 *
 * Secret handling: the Healthchecks API key is read from the
 * `HEALTHCHECKS_API_KEY` env var (set in Vercel, never committed). When it is
 * absent the snapshot returns `configured: false` so the page can show a
 * "monitoring not configured" state instead of failing.
 *
 * Server-only (the API key must not reach the browser). The `/devices` page
 * fetches this server-side and a client poller re-reads `/api/devices`.
 */

const API_BASE = "https://healthchecks.io/api/v3";
const REVALIDATE = 30;

export type DeviceStatus = "up" | "down" | "grace" | "new" | "paused" | "started";

export type DeviceSystem = {
  tempC: number | null;
  memUsedPct: number | null;
  diskUsedPct: number | null;
  load1m: number | null;
  cpus: number | null;
  uptimeS: number | null;
  throttled: boolean;
};

export type DeviceTaina = {
  handle: string | null;
  drafts: number | null;
  draftsWithImages: number | null;
  draftUsers: number | null;
  whitelist: number | null;
  oldestDraftIso: string | null;
  version: string | null;
};

export type Device = {
  id: string;
  name: string;
  status: DeviceStatus;
  lastPing: string | null;
  nextPing: string | null;
  nPings: number;
  tags: string[];
  system: DeviceSystem | null;
  taina: DeviceTaina | null;
};

export type DevicesSnapshot = {
  /** False when no HEALTHCHECKS_API_KEY is configured. */
  configured: boolean;
  devices: Device[];
  fetchedAt: string;
  /** Present when configured but the upstream fetch failed. */
  error?: string;
};

// ── Raw Healthchecks shapes ────────────────────────────────────────────────

type RawCheck = {
  name?: string;
  slug?: string;
  tags?: string;
  n_pings?: number;
  status?: string;
  last_ping?: string | null;
  next_ping?: string | null;
  unique_key?: string;
  ping_url?: string;
  update_url?: string;
};

function checkUuid(check: RawCheck): string | null {
  const url = check.ping_url || check.update_url || "";
  const match = url.match(/([0-9a-f-]{32,40})\/?$/i);
  return match?.[1] ?? check.unique_key ?? null;
}

function normaliseStatus(raw: string | undefined): DeviceStatus {
  const s = (raw ?? "").toLowerCase();
  if (s === "up" || s === "down" || s === "grace" || s === "new" || s === "paused" || s === "started") {
    return s;
  }
  return "new";
}

// ── Embedded heartbeat-body JSON ───────────────────────────────────────────

function parseEmbeddedJson<T>(body: string | null, marker: string): T | null {
  if (!body) return null;
  const idx = body.indexOf(marker);
  if (idx === -1) return null;
  const firstLine = body.slice(idx + marker.length).trim().split("\n")[0];
  if (!firstLine) return null;
  try {
    return JSON.parse(firstLine) as T;
  } catch {
    return null;
  }
}

type RawSystemStats = {
  uptime_s?: number | null;
  cpus?: number | null;
  memory?: { total_b?: number | null; used_b?: number | null };
  load?: { load_1m?: number | null };
  temp_c?: number | null;
  throttled_hex?: string | null;
  disk?: { total_b?: number | null; used_b?: number | null } | null;
};

type RawTainaStats = {
  version?: string | null;
  atproto?: { handle?: string | null };
  drafts?: { total?: number; with_images?: number; users?: number; oldest_iso?: string | null };
  whitelist?: { total?: number };
};

function mapSystem(raw: RawSystemStats | null): DeviceSystem | null {
  if (!raw) return null;
  const memTotal = raw.memory?.total_b ?? null;
  const memUsed = raw.memory?.used_b ?? null;
  const diskTotal = raw.disk?.total_b ?? null;
  const diskUsed = raw.disk?.used_b ?? null;
  return {
    tempC: raw.temp_c ?? null,
    memUsedPct: memTotal && memUsed ? Math.round((memUsed / memTotal) * 100) : null,
    diskUsedPct: diskTotal && diskUsed ? Math.round((diskUsed / diskTotal) * 100) : null,
    load1m: raw.load?.load_1m ?? null,
    cpus: raw.cpus ?? null,
    uptimeS: raw.uptime_s ?? null,
    throttled: Boolean(raw.throttled_hex && raw.throttled_hex !== "0x0"),
  };
}

function mapTaina(raw: RawTainaStats | null): DeviceTaina | null {
  if (!raw) return null;
  return {
    handle: raw.atproto?.handle ?? null,
    drafts: raw.drafts?.total ?? null,
    draftsWithImages: raw.drafts?.with_images ?? null,
    draftUsers: raw.drafts?.users ?? null,
    whitelist: raw.whitelist?.total ?? null,
    oldestDraftIso: raw.drafts?.oldest_iso ?? null,
    version: raw.version ?? null,
  };
}

// ── Fetch ──────────────────────────────────────────────────────────────────

async function getLastPingBody(uuid: string, apiKey: string): Promise<string | null> {
  try {
    const list = await fetch(`${API_BASE}/checks/${uuid}/pings/?limit=1`, {
      headers: { "X-Api-Key": apiKey },
      next: { revalidate: REVALIDATE },
    });
    if (!list.ok) return null;
    const data = (await list.json()) as { pings?: Array<{ n: number }> };
    const latest = data.pings?.[0];
    if (!latest) return null;
    const body = await fetch(`${API_BASE}/checks/${uuid}/pings/${latest.n}/body`, {
      headers: { "X-Api-Key": apiKey },
      next: { revalidate: REVALIDATE },
    });
    if (!body.ok) return null;
    return await body.text();
  } catch {
    return null;
  }
}

export async function fetchDevices(): Promise<DevicesSnapshot> {
  const apiKey = process.env.HEALTHCHECKS_API_KEY?.trim();
  const fetchedAt = new Date().toISOString();
  if (!apiKey) {
    return { configured: false, devices: [], fetchedAt };
  }

  try {
    const res = await fetch(`${API_BASE}/checks/`, {
      headers: { "X-Api-Key": apiKey },
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) {
      return { configured: true, devices: [], fetchedAt, error: `Healthchecks ${res.status}` };
    }
    const data = (await res.json()) as { checks?: RawCheck[] };
    const checks = data.checks ?? [];

    const devices = await Promise.all(
      checks.map(async (check): Promise<Device> => {
        const uuid = checkUuid(check);
        const body = uuid ? await getLastPingBody(uuid, apiKey) : null;
        const system = mapSystem(parseEmbeddedJson<RawSystemStats>(body, "== system-stats-json =="));
        const taina = mapTaina(parseEmbeddedJson<RawTainaStats>(body, "== taina-stats-json =="));
        return {
          id: uuid ?? check.slug ?? check.name ?? crypto.randomUUID(),
          name: check.name || check.slug || "unnamed",
          status: normaliseStatus(check.status),
          lastPing: check.last_ping ?? null,
          nextPing: check.next_ping ?? null,
          nPings: check.n_pings ?? 0,
          tags: (check.tags ?? "").split(/\s+/).filter(Boolean),
          system,
          taina,
        };
      }),
    );

    // Sort: live devices first, then by most-recent ping.
    devices.sort((a, b) => {
      const rank = (s: DeviceStatus) => (s === "up" || s === "started" ? 0 : s === "grace" ? 1 : s === "down" ? 2 : 3);
      const dr = rank(a.status) - rank(b.status);
      if (dr !== 0) return dr;
      return (b.lastPing ?? "").localeCompare(a.lastPing ?? "");
    });

    return { configured: true, devices, fetchedAt };
  } catch (err) {
    return {
      configured: true,
      devices: [],
      fetchedAt,
      error: (err as Error).message || "fetch failed",
    };
  }
}

// ── Display helpers ────────────────────────────────────────────────────────

export type DeviceTone = "ok" | "warn" | "down" | "neutral";

export function deviceTone(status: DeviceStatus): DeviceTone {
  switch (status) {
    case "up":
    case "started":
      return "ok";
    case "grace":
      return "warn";
    case "down":
      return "down";
    default:
      return "neutral";
  }
}

export function deviceLabel(status: DeviceStatus): string {
  switch (status) {
    case "up":
      return "Healthy";
    case "started":
      return "Running";
    case "grace":
      return "Late";
    case "down":
      return "Down";
    case "paused":
      return "Paused";
    default:
      return "Awaiting ping";
  }
}

export function formatUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function devicesSummary(devices: Device[]): { healthy: number; total: number } {
  const healthy = devices.filter((d) => d.status === "up" || d.status === "started").length;
  return { healthy, total: devices.length };
}

// ── Lightweight liveness summary ───────────────────────────────────────────
//
// The home page only needs "how many Tainás are live right now", so it skips
// the per-device ping-body fetches that fetchDevices() does and just counts
// statuses off the single /checks/ listing.

export type DevicesLiveSummary = {
  /** False when no HEALTHCHECKS_API_KEY is configured. */
  configured: boolean;
  /** Devices currently reporting up. */
  healthy: number;
  /** Total registered field devices. */
  total: number;
  fetchedAt: string;
};

export async function fetchDevicesSummary(): Promise<DevicesLiveSummary> {
  const apiKey = process.env.HEALTHCHECKS_API_KEY?.trim();
  const fetchedAt = new Date().toISOString();
  if (!apiKey) return { configured: false, healthy: 0, total: 0, fetchedAt };
  try {
    const res = await fetch(`${API_BASE}/checks/`, {
      headers: { "X-Api-Key": apiKey },
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return { configured: true, healthy: 0, total: 0, fetchedAt };
    const checks = ((await res.json()) as { checks?: RawCheck[] }).checks ?? [];
    const healthy = checks.filter((c) => {
      const s = normaliseStatus(c.status);
      return s === "up" || s === "started";
    }).length;
    return { configured: true, healthy, total: checks.length, fetchedAt };
  } catch {
    return { configured: true, healthy: 0, total: 0, fetchedAt };
  }
}
