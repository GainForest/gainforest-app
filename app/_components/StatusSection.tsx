"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_URL } from "../_lib/urls";
import {
  componentLabel,
  componentTone,
  fetchStatus,
  pageLabel,
  pageTone,
  parseComponentName,
  type StatusSnapshot,
} from "../_lib/status";
import { TONE_DOT, TONE_TEXT } from "./StatusPill";

// Live system-status board, mirroring https://gainforest-status.instatus.com.
//
// Seeded with the server-prefetched snapshot (instant paint), then re-polls
// the instatus JSON every 60s from the browser so the board reflects reality
// without a page reload. Both instatus documents are CORS-open, so no proxy
// is needed. The "Updated …" stamp shows the freshness of the last poll.

const POLL_MS = 60_000;

export function StatusSection({ initial }: { initial: StatusSnapshot }) {
  const [snapshot, setSnapshot] = useState<StatusSnapshot>(initial);
  const [updatedAt, setUpdatedAt] = useState<string>(initial.fetchedAt);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function poll() {
      try {
        const next = await fetchStatus({ signal: controller.signal });
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

  return (
    <section id="status" className="scroll-mt-20 bg-surface">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="flex flex-col gap-6 border-b border-border-soft pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="font-instrument text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              Infrastructure
            </span>
            <h2 className="mt-3 font-garamond text-[34px] font-normal leading-[1.05] tracking-[-0.015em] text-foreground sm:text-[42px] lg:text-[50px]">
              System <span className="font-instrument italic">status</span>
            </h2>
            <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-foreground/70 lg:text-[16px]">
              The PDS instances, indexer, labeller, and apps that the data
              commons runs on. Mirrored live from the GainForest status page and
              re-checked every minute.
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
                {operational} of {total} services operational · updated{" "}
                {timeAgo(updatedAt)}
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
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border-soft bg-background px-4 py-3.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`relative inline-flex h-2.5 w-2.5 shrink-0 ${TONE_DOT[t]}`}>
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full bg-current ${
                          t === "ok" ? "pulse-dot" : ""
                        }`}
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[13px] text-foreground">
                        {host}
                      </div>
                      {role && (
                        <div className="truncate text-[12px] text-foreground/55">
                          {role}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[12.5px] font-medium ${TONE_TEXT[t]}`}>
                    {componentLabel(c.status)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href={STATUS_URL}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1.5 text-[13.5px] font-medium text-foreground/65 transition-colors hover:text-primary"
          >
            View incident history on the status page
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
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
