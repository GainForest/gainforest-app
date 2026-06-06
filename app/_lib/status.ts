/**
 * Live system status, mirrored from the GainForest instatus page
 * (https://gainforest-status.instatus.com). Instatus exposes two cheap JSON
 * documents, both CORS-open:
 *
 *   /summary.json          → { page: { status: "UP" | "HASISSUES" | ... } }
 *   /v2/components.json     → { components: [{ id, name, description, status }] }
 *
 * We join them into one snapshot. `status.ts` is used both server-side (hero
 * pill prefetch) and client-side (the live status board re-polls it).
 */

import { STATUS_URL } from "./urls";

export type ComponentStatus =
  | "OPERATIONAL"
  | "UNDERMAINTENANCE"
  | "DEGRADEDPERFORMANCE"
  | "PARTIALOUTAGE"
  | "MAJOROUTAGE"
  | "UNKNOWN";

export type PageStatus = "UP" | "HASISSUES" | "UNDERMAINTENANCE" | "DOWN";

export type StatusComponent = {
  id: string;
  name: string;
  description: string;
  status: ComponentStatus;
  /** Rolling uptime percentage (0–100) from the status page, or null. */
  uptime: number | null;
};

/** A past or ongoing incident, mirrored from the status page timeline. */
export type Incident = {
  id: string;
  name: string;
  /** Worst impact level recorded for the incident. */
  impact: ComponentStatus;
  /** Lifecycle: INVESTIGATING / IDENTIFIED / MONITORING / RESOLVED … */
  status: string;
  ongoing: boolean;
  started: string | null;
  resolved: string | null;
  durationMs: number | null;
};

export type StatusSnapshot = {
  page: PageStatus;
  components: StatusComponent[];
  /** Recent incidents (newest first), both ongoing and resolved. */
  incidents: Incident[];
  /** Mean uptime across components that report it (0–100), or null. */
  overallUptime: number | null;
  /** ISO timestamp of when this snapshot was fetched. */
  fetchedAt: string;
  /** True when both upstream documents failed and we served a neutral fallback. */
  degraded: boolean;
};

type SummaryDoc = { page?: { status?: string } };
type ComponentsDoc = {
  components?: Array<{
    id?: string;
    name?: string;
    description?: string;
    status?: string;
  }>;
};

function normaliseComponentStatus(raw: string | undefined): ComponentStatus {
  const s = (raw ?? "").toUpperCase();
  if (
    s === "OPERATIONAL" ||
    s === "UNDERMAINTENANCE" ||
    s === "DEGRADEDPERFORMANCE" ||
    s === "PARTIALOUTAGE" ||
    s === "MAJOROUTAGE"
  ) {
    return s;
  }
  return "UNKNOWN";
}

function normalisePageStatus(raw: string | undefined): PageStatus {
  const s = (raw ?? "").toUpperCase();
  if (s === "UP" || s === "HASISSUES" || s === "UNDERMAINTENANCE" || s === "DOWN") {
    return s;
  }
  return "UP";
}

// ── Status-page enrichment (uptime % + incident history) ───────────────────
//
// Instatus's stable JSON only exposes current statuses. The rolling uptime
// percentages + incident timeline live in the rendered page's React Server
// Components payload (`self.__next_f.push([1,"…"])` chunks). We reassemble that
// stream server-side (no CORS in the browser anyway) and pull out two objects:
//   componentsUptime  → { <componentId>: { uptime: "99.98", outages, notices } }
//   dailyGroupedNotices → [{ notices: [{ name, impact, status, started, … }] }]
// Everything here is best-effort: any parse failure degrades to JSON-only.

type RawNotice = {
  id?: string;
  name?: { default?: string; en?: string } | null;
  impact?: string;
  status?: string;
  started?: string | null;
  resolved?: string | null;
};

/** Reassemble the Next.js RSC flight stream embedded in the page HTML. */
function reassembleRsc(html: string): string {
  const re = /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out += JSON.parse(`"${m[1]}"`);
    } catch {
      /* skip malformed chunk */
    }
  }
  return out;
}

/** String-aware balanced-delimiter slice (so braces inside strings are safe). */
function sliceBalanced(s: string, start: number, open: string, close: string): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

function extractJson<T>(blob: string, key: string): T | null {
  const i = blob.indexOf(`"${key}":`);
  if (i < 0) return null;
  let j = i + key.length + 3;
  while (j < blob.length && blob[j] !== "{" && blob[j] !== "[") j++;
  if (j >= blob.length) return null;
  const open = blob[j];
  const slice = sliceBalanced(blob, j, open, open === "{" ? "}" : "]");
  if (!slice) return null;
  try {
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}

function parseInstatusPage(html: string): {
  uptime: Record<string, number>;
  incidents: Incident[];
} {
  const blob = reassembleRsc(html);
  const uptime: Record<string, number> = {};
  const cu = extractJson<Record<string, { uptime?: string }>>(blob, "componentsUptime");
  if (cu) {
    for (const [id, v] of Object.entries(cu)) {
      const n = Number(v?.uptime);
      if (Number.isFinite(n)) uptime[id] = n;
    }
  }

  const incidents: Incident[] = [];
  const seen = new Set<string>();
  const days = extractJson<Array<{ notices?: RawNotice[] }>>(blob, "dailyGroupedNotices");
  for (const day of days ?? []) {
    for (const n of day.notices ?? []) {
      const id = n.id ?? "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const started = n.started ?? null;
      const resolved = n.resolved ?? null;
      incidents.push({
        id,
        name: (n.name?.default ?? n.name?.en ?? "Incident").trim(),
        impact: normaliseComponentStatus(n.impact),
        status: (n.status ?? "").toUpperCase(),
        ongoing: !resolved,
        started,
        resolved,
        durationMs:
          started && resolved ? Math.max(0, Date.parse(resolved) - Date.parse(started)) : null,
      });
    }
  }
  incidents.sort((a, b) => (Date.parse(b.started ?? "") || 0) - (Date.parse(a.started ?? "") || 0));
  return { uptime, incidents: incidents.slice(0, 12) };
}

function degradedSnapshot(): StatusSnapshot {
  return {
    page: "UP",
    components: [],
    incidents: [],
    overallUptime: null,
    fetchedAt: new Date().toISOString(),
    degraded: true,
  };
}

/**
 * Lightweight snapshot from the two CORS-open JSON documents only (page status
 * + component statuses). Used by the nav/hero pill on every page, so it stays
 * cheap — no uptime % or incident history. Use {@link fetchStatusDetailed} for
 * the full status board.
 */
export async function fetchStatus(opts?: {
  revalidate?: number;
  signal?: AbortSignal;
}): Promise<StatusSnapshot> {
  const next =
    opts?.revalidate != null ? { next: { revalidate: opts.revalidate } } : {};
  try {
    const [summaryRes, componentsRes] = await Promise.all([
      fetch(`${STATUS_URL}/summary.json`, { signal: opts?.signal, ...next }),
      fetch(`${STATUS_URL}/v2/components.json`, { signal: opts?.signal, ...next }),
    ]);
    const summary = (await summaryRes.json()) as SummaryDoc;
    const componentsDoc = (await componentsRes.json()) as ComponentsDoc;
    const components: StatusComponent[] = (componentsDoc.components ?? []).map((c) => ({
      id: c.id ?? crypto.randomUUID(),
      name: c.name ?? "Unnamed service",
      description: c.description ?? "",
      status: normaliseComponentStatus(c.status),
      uptime: null,
    }));
    return {
      page: normalisePageStatus(summary.page?.status),
      components,
      incidents: [],
      overallUptime: null,
      fetchedAt: new Date().toISOString(),
      degraded: false,
    };
  } catch {
    return degradedSnapshot();
  }
}

/**
 * Full status board: the JSON statuses plus rolling uptime % and incident
 * history scraped from the rendered status page. Heavier (fetches the page
 * HTML), so it's used only by the /status page + /api/status route, never the
 * per-page nav pill. Degrades to the JSON-only data if the scrape fails.
 */
export async function fetchStatusDetailed(opts?: {
  revalidate?: number;
  signal?: AbortSignal;
}): Promise<StatusSnapshot> {
  const next =
    opts?.revalidate != null ? { next: { revalidate: opts.revalidate } } : {};
  try {
    const [summaryRes, componentsRes, pageRes] = await Promise.all([
      fetch(`${STATUS_URL}/summary.json`, { signal: opts?.signal, ...next }),
      fetch(`${STATUS_URL}/v2/components.json`, { signal: opts?.signal, ...next }),
      // Rendered page carries uptime % + incident history; best-effort only.
      fetch(`${STATUS_URL}/`, { signal: opts?.signal, ...next }).catch(() => null),
    ]);
    const summary = (await summaryRes.json()) as SummaryDoc;
    const componentsDoc = (await componentsRes.json()) as ComponentsDoc;

    let enrich: { uptime: Record<string, number>; incidents: Incident[] } = {
      uptime: {},
      incidents: [],
    };
    if (pageRes?.ok) {
      try {
        enrich = parseInstatusPage(await pageRes.text());
      } catch {
        /* keep JSON-only snapshot */
      }
    }

    const components: StatusComponent[] = (componentsDoc.components ?? []).map((c) => ({
      id: c.id ?? crypto.randomUUID(),
      name: c.name ?? "Unnamed service",
      description: c.description ?? "",
      status: normaliseComponentStatus(c.status),
      uptime: c.id != null && c.id in enrich.uptime ? enrich.uptime[c.id] : null,
    }));
    const ups = components.map((c) => c.uptime).filter((n): n is number => n != null);
    const overallUptime = ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length : null;

    return {
      page: normalisePageStatus(summary.page?.status),
      components,
      incidents: enrich.incidents,
      overallUptime,
      fetchedAt: new Date().toISOString(),
      degraded: false,
    };
  } catch {
    return degradedSnapshot();
  }
}

// ── Display helpers ────────────────────────────────────────────────────────

export type StatusTone = "ok" | "warn" | "down" | "neutral";

export function componentTone(status: ComponentStatus): StatusTone {
  switch (status) {
    case "OPERATIONAL":
      return "ok";
    case "DEGRADEDPERFORMANCE":
    case "UNDERMAINTENANCE":
    case "PARTIALOUTAGE":
      return "warn";
    case "MAJOROUTAGE":
      return "down";
    default:
      return "neutral";
  }
}

export function componentLabel(status: ComponentStatus): string {
  switch (status) {
    case "OPERATIONAL":
      return "Working";
    case "DEGRADEDPERFORMANCE":
      return "Slow";
    case "UNDERMAINTENANCE":
      return "Planned work";
    case "PARTIALOUTAGE":
      return "Partly down";
    case "MAJOROUTAGE":
      return "Not working";
    default:
      return "Checking";
  }
}

export function pageTone(page: PageStatus, degraded: boolean): StatusTone {
  if (degraded) return "neutral";
  switch (page) {
    case "UP":
      return "ok";
    case "HASISSUES":
    case "UNDERMAINTENANCE":
      return "warn";
    case "DOWN":
      return "down";
    default:
      return "neutral";
  }
}

export function pageLabel(page: PageStatus, degraded: boolean): string {
  if (degraded) return "Health unavailable";
  switch (page) {
    case "UP":
      return "Everything is working";
    case "HASISSUES":
      return "Some services are slow";
    case "UNDERMAINTENANCE":
      return "Planned work happening";
    case "DOWN":
      return "A service is not working";
    default:
      return "Checking health";
  }
}

/** Split a component name like "api.hi.gainforest.app ( indexer )" into a
 *  host + a parenthetical role so the board can show both cleanly. */
export function parseComponentName(name: string): { host: string; role: string | null } {
  const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) return { host: m[1].trim(), role: m[2].trim() || null };
  return { host: name.trim(), role: null };
}
