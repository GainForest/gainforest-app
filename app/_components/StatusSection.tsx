"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ActivityIcon, ArrowUpRightIcon } from "lucide-react";
import { STATUS_URL } from "../_lib/urls";
import { formatDuration, formatRelative } from "../_lib/format";
import {
  componentLabel,
  componentTone,
  pageLabel,
  pageTone,
  parseComponentName,
  type ComponentStatus,
  type Incident,
  type StatusSnapshot,
  type StatusTone,
} from "../_lib/status";
import { PictureHero } from "./PictureHero";
import { TONE_DOT, TONE_TEXT } from "./StatusPill";

// Live system-status board, mirroring https://gainforest-status.instatus.com.
//
// Seeded with the server-prefetched snapshot (instant paint), then re-polls a
// same-origin /api/status route every 60s. That route enriches the instatus
// JSON with rolling uptime % + incident history (scraped server-side), so the
// board shows uptime bars and an incident timeline, not just status dots.
//
// Reskinned in the app's editorial system (PictureHero + card grid) so it
// matches /devices, /donations and the other monitoring pages.

const POLL_MS = 60_000;

const TONE_BAR: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  down: "bg-down",
  neutral: "bg-foreground/30",
};

/** Uptime → tone: ≥99.9 ok, ≥99 warn, else down. */
function uptimeTone(pct: number): StatusTone {
  if (pct >= 99.9) return "ok";
  if (pct >= 99) return "warn";
  return "down";
}

function friendlyServiceName(name: string, description: string): { name: string; detail: string | null } {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes("index")) return { name: "Search and browsing", detail: "Finds projects and sightings" };
  if (text.includes("pds") || text.includes("personal data")) return { name: "Community data storage", detail: "Keeps public project information available" };
  if (text.includes("label")) return { name: "Review labels", detail: "Shows trust and safety information" };
  if (text.includes("app")) return { name: "Bumicerts website", detail: "Pages visitors use" };
  if (text.includes("api")) return { name: "Bumicerts services", detail: "Keeps pages up to date" };
  const { host, role } = parseComponentName(name);
  return { name: role ? titleCase(role) : "GainForest service", detail: host || null };
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const EMPTY_STATUS: StatusSnapshot = {
  page: "UP",
  components: [],
  incidents: [],
  overallUptime: null,
  fetchedAt: new Date(0).toISOString(),
  degraded: true,
};

export function StatusSection({ initial }: { initial?: StatusSnapshot }) {
  const [snapshot, setSnapshot] = useState<StatusSnapshot>(initial ?? EMPTY_STATUS);
  const [updatedAt, setUpdatedAt] = useState<string>(initial?.fetchedAt ?? EMPTY_STATUS.fetchedAt);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/status", { signal: controller.signal });
        const next = (await res.json()) as StatusSnapshot;
        if (cancelled) return;
        if (!next.degraded) {
          setSnapshot(next);
          setUpdatedAt(next.fetchedAt);
        }
      } catch {
        /* keep last good snapshot */
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(poll, POLL_MS);
        }
      }
    }

    timer = setTimeout(poll, initial ? POLL_MS : 0);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [initial]);

  const tone = pageTone(snapshot.page, snapshot.degraded);
  const operational = snapshot.components.filter((c) => c.status === "OPERATIONAL").length;
  const total = snapshot.components.length;
  const incidents = snapshot.incidents ?? [];

  const statusAction = (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-background/65 px-4 py-2 shadow-sm shadow-primary/5 backdrop-blur-xl">
        <span className={`relative inline-flex h-2.5 w-2.5 ${TONE_DOT[tone]}`}>
          <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-current" />
        </span>
        <span className={`text-[14px] font-medium ${TONE_TEXT[tone]}`}>
          {pageLabel(snapshot.page, snapshot.degraded)}
        </span>
      </div>
      {total > 0 && (
        <span className="text-[12.5px] text-muted-foreground">
          {operational} of {total} working
          {snapshot.overallUptime != null && <> · {snapshot.overallUptime.toFixed(2)}% healthy</>}{" "}
          · updated {timeAgo(updatedAt)}
        </span>
      )}
    </div>
  );

  return (
    <section className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        lightSrc="/assets/media/images/status/status-hero-light@2x.webp"
        darkSrc="/assets/media/images/status/status-hero-dark@2x.webp"
        imageAlt="Calm regenerative landscape representing the services behind Bumicerts"
        eyebrow="Live health"
        icon={<ActivityIcon aria-hidden />}
        title="Site"
        accent="health"
        lede="A simple view of whether the services behind Bumicerts and GainForest are working. This page refreshes every minute."
        actions={total > 0 ? statusAction : null}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-6">
        {loading ? (
          <StatusSkeleton />
        ) : snapshot.components.length === 0 ? (
          <Notice
            title="This health page is unavailable right now"
            body={
              <>
                The services may still be working; this page just cannot read them right now. Visit the{" "}
                <Link
                  href={STATUS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  full health page
                </Link>
                .
              </>
            }
          />
        ) : (
          <ul role="list" className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.components.map((c) => (
              <li key={c.id}>
                <ServiceCard
                  status={c.status}
                  service={friendlyServiceName(c.name, c.description)}
                  uptime={c.uptime}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Incident history */}
        {snapshot.components.length > 0 && (
          <div className="mt-14">
            <div className="flex items-baseline justify-between gap-4 border-b border-border-soft pb-3">
              <h2 className="font-garamond text-[24px] font-normal text-foreground">Recent issues</h2>
              <span className="text-[12px] text-muted-foreground">
                {incidents.length > 0 ? `last ${incidents.length}` : "90-day window"}
              </span>
            </div>
            {incidents.length === 0 ? (
              <p className="py-10 text-center text-[14px] italic text-muted-foreground">
                No issues in the last 90 days.
              </p>
            ) : (
              <ol role="list" className="mt-5 space-y-3">
                {incidents.map((inc) => (
                  <IncidentRow key={inc.id} incident={inc} />
                ))}
              </ol>
            )}
          </div>
        )}

        <div className="mt-10 flex justify-center">
          <Link
            href={STATUS_URL}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-surface px-4 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-primary"
          >
            View full issue history on the health page
            <ArrowUpRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Service card ─────────────────────────────────────────────────────────────

function ServiceCard({
  status,
  service,
  uptime,
}: {
  status: ComponentStatus;
  service: { name: string; detail: string | null };
  uptime: number | null;
}) {
  const tone = componentTone(status);
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-border-soft bg-surface p-5 shadow-[0_8px_26px_-20px_rgba(20,30,15,0.3)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-foreground">{service.name}</h2>
          {service.detail && (
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{service.detail}</p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-soft bg-background px-2.5 py-1 text-[12px] font-medium ${TONE_TEXT[tone]}`}
        >
          <span className={`relative inline-flex h-2 w-2 ${TONE_DOT[tone]}`}>
            <span className={`inline-block h-2 w-2 rounded-full bg-current ${tone === "ok" ? "pulse-dot" : ""}`} />
          </span>
          {componentLabel(status)}
        </span>
      </header>

      {uptime != null && (
        <div className="mt-auto">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
              90-day health
            </span>
            <span className="font-mono text-[12.5px] font-semibold tabular-nums text-foreground/70">
              {uptime.toFixed(2)}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={`h-full rounded-full ${TONE_BAR[uptimeTone(uptime)]}`}
              style={{ width: `${Math.max(3, Math.min(100, uptime))}%` }}
            />
          </div>
        </div>
      )}
    </article>
  );
}

function StatusSkeleton() {
  return (
    <ul
      role="list"
      className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-label="Loading site health"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="rounded-2xl border border-border-soft bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-4 w-32 rounded-full bg-muted" />
              <div className="h-3 w-44 rounded-full bg-muted/70" />
            </div>
            <div className="h-7 w-20 rounded-full bg-muted" />
          </div>
          <div className="mt-6 space-y-2">
            <div className="h-3 w-24 rounded-full bg-muted/60" />
            <div className="h-1.5 rounded-full bg-muted/50" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Notice({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div className="font-garamond text-[22px] text-foreground">{title}</div>
      <p className="mt-2 max-w-[460px] text-[14px] leading-[1.5] text-muted-foreground">{body}</p>
    </div>
  );
}

function friendlyIncidentTitle(name: string): string {
  // Auto-generated names end with " is back up" / " is down"; trim for clarity.
  const rawTitle = name.replace(/\s+is (back up|down)$/i, "").trim() || name;
  const service = friendlyServiceName(rawTitle, "");
  if (service.name !== "GainForest service") return service.name;
  return rawTitle.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
}

function IncidentRow({ incident }: { incident: Incident }) {
  const t = componentTone(incident.impact);
  const title = friendlyIncidentTitle(incident.name);
  const when = incident.started ? formatRelative(incident.started) : "";
  const dur = incident.durationMs != null ? formatDuration(incident.durationMs) : null;
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-3.5 shadow-[0_8px_26px_-20px_rgba(20,30,15,0.3)]">
      <span className={`mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full ${TONE_BAR[t]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[13px] text-foreground">{title}</span>
          {incident.ongoing ? (
            <span className="rounded-full bg-down/15 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-down">
              Happening now
            </span>
          ) : (
            <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-ok">
              Fixed
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          <span className={TONE_TEXT[t]}>{componentLabel(incident.impact)}</span>
          {when && <span aria-hidden>·</span>}
          {when && <span>{when}</span>}
          {dur && <span aria-hidden>·</span>}
          {dur && <span>down {dur}</span>}
        </div>
      </div>
    </li>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "just now";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}
