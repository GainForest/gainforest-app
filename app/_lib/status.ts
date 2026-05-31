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
};

export type StatusSnapshot = {
  page: PageStatus;
  components: StatusComponent[];
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
    const components: StatusComponent[] = (componentsDoc.components ?? []).map(
      (c) => ({
        id: c.id ?? crypto.randomUUID(),
        name: c.name ?? "Unnamed service",
        description: c.description ?? "",
        status: normaliseComponentStatus(c.status),
      }),
    );
    return {
      page: normalisePageStatus(summary.page?.status),
      components,
      fetchedAt: new Date().toISOString(),
      degraded: false,
    };
  } catch {
    return {
      page: "UP",
      components: [],
      fetchedAt: new Date().toISOString(),
      degraded: true,
    };
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
      return "Operational";
    case "DEGRADEDPERFORMANCE":
      return "Degraded";
    case "UNDERMAINTENANCE":
      return "Maintenance";
    case "PARTIALOUTAGE":
      return "Partial outage";
    case "MAJOROUTAGE":
      return "Major outage";
    default:
      return "Unknown";
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
  if (degraded) return "Status unavailable";
  switch (page) {
    case "UP":
      return "All systems operational";
    case "HASISSUES":
      return "Some systems degraded";
    case "UNDERMAINTENANCE":
      return "Under maintenance";
    case "DOWN":
      return "Major outage";
    default:
      return "Status unknown";
  }
}

/** Split a component name like "api.hi.gainforest.app ( indexer )" into a
 *  host + a parenthetical role so the board can show both cleanly. */
export function parseComponentName(name: string): { host: string; role: string | null } {
  const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) return { host: m[1].trim(), role: m[2].trim() || null };
  return { host: name.trim(), role: null };
}
