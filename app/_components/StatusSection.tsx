"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_URL } from "../_lib/urls";
import { formatDuration, formatRelative } from "../_lib/format";
import {
  componentLabel,
  componentTone,
  pageLabel,
  pageTone,
  parseComponentName,
  type Incident,
  type StatusSnapshot,
  type StatusTone,
} from "../_lib/status";
import { TONE_DOT, TONE_TEXT } from "./StatusPill";

// Live system-status board, mirroring https://gainforest-status.instatus.com.
//
// Seeded with the server-prefetched snapshot (instant paint), then re-polls a
// same-origin /api/status route every 60s. That route enriches the instatus
// JSON with rolling uptime % + incident history (scraped server-side), so the
// board shows uptime bars and an incident timeline, not just status dots.

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

export function StatusSection({ initial }: { initial: StatusSnapshot }) {
  const [snapshot, setSnapshot] = useState<StatusSnapshot>(initial);
  const [updatedAt, setUpdatedAt] = useState<string>(initial.fetchedAt);

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
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    }

    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const tone = pageTone(snapshot.page, snapshot.degraded);
  const operational = snapshot.components.filter((c) => c.status === "OPERATIONAL").length;
  const total = snapshot.components.length;
  const incidents = snapshot.incidents ?? [];

  return (
    <section id="status" className="scroll-mt-20 bg-surface">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="flex flex-col gap-6 border-b border-border-soft pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="font-instrument text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              instatus
            </span>
            <h2 className="mt-3 font-garamond text-[34px] font-normal leading-[1.05] tracking-[-0.015em] text-foreground sm:text-[42px] lg:text-[50px]">
              System <span className="font-instrument italic">status</span>
            </h2>
            <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-foreground/70 lg:text-[16px]">
              PDS instances, indexer, labeller, and apps. Mirrored from the
              GainForest instatus page with rolling uptime and incident history,
              re-polled every 60s.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-border-soft bg-background px-4 py-2">
              <span className={`relative inline-flex h-2.5 w-2.5 ${TONE_DOT[tone]}`}>
                <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-current" />
              </span>
              <span className={`text-[14px] font-medium ${TONE_TEXT[tone]}`}>
                {pageLabel(snapshot.page, snapshot.degraded)}
              </span>
            </div>
            {total > 0 && (
              <span className="text-[12.5px] text-foreground/55">
                {operational} of {total} operational
                {snapshot.overallUptime != null && (
                  <> · {snapshot.overallUptime.toFixed(2)}% avg uptime</>
                )}{" "}
                · updated {timeAgo(updatedAt)}
              </span>
            )}
          </div>
        </div>

        {snapshot.components.length === 0 ? (
          <p className="py-12 text-center text-[14px] italic text-foreground/55">
            Status board is unavailable right now. Check the{" "}
            <Link
              href={STATUS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              full status page
            </Link>
            .
          </p>
        ) : (
          <ul role="list" className="mt-8 grid gap-3 sm:grid-cols-2">
            {snapshot.components.map((c) => {
              const t = componentTone(c.status);
              const { host, role } = parseComponentName(c.name);
              const up = c.uptime;
              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-border-soft bg-background px-4 py-3.5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`relative inline-flex h-2.5 w-2.5 shrink-0 ${TONE_DOT[t]}`}>
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full bg-current ${
                            t === "ok" ? "pulse-dot" : ""
                          }`}
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[13px] text-foreground">{host}</div>
                        {role && <div className="truncate text-[12px] text-foreground/55">{role}</div>}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[12.5px] font-medium ${TONE_TEXT[t]}`}>
                      {componentLabel(c.status)}
                    </span>
                  </div>
                  {up != null && (
                    <div className="mt-3 flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                        <div
                          className={`h-full rounded-full ${TONE_BAR[uptimeTone(up)]}`}
                          style={{ width: `${Math.max(2, Math.min(100, up))}%` }}
                        />
                      </div>
                      <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-foreground/55">
                        {up.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Incident history */}
        {snapshot.components.length > 0 && (
          <div className="mt-12">
            <div className="flex items-baseline justify-between gap-4 border-b border-border-soft pb-3">
              <h3 className="font-garamond text-[22px] font-normal text-foreground">
                Recent incidents
              </h3>
              <span className="text-[12px] text-foreground/45">
                {incidents.length > 0 ? `last ${incidents.length}` : "90-day window"}
              </span>
            </div>
            {incidents.length === 0 ? (
              <p className="py-8 text-center text-[14px] italic text-foreground/55">
                No incidents recorded in the last 90 days.
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
            className="group inline-flex items-center gap-1.5 text-[13.5px] font-medium text-foreground/65 transition-colors hover:text-primary"
          >
            View full incident history on the status page
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  const t = componentTone(incident.impact);
  // Auto-generated names end with " is back up" / " is down"; trim for clarity.
  const title = incident.name.replace(/\s+is (back up|down)$/i, "").trim() || incident.name;
  const when = incident.started ? formatRelative(incident.started) : "";
  const dur = incident.durationMs != null ? formatDuration(incident.durationMs) : null;
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border-soft bg-background px-4 py-3.5">
      <span className={`mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full ${TONE_BAR[t]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[13px] text-foreground">{title}</span>
          {incident.ongoing ? (
            <span className="rounded-full bg-down/15 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-down">
              Ongoing
            </span>
          ) : (
            <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-ok">
              Resolved
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-foreground/55">
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
