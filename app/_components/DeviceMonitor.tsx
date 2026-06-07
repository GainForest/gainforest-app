"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LeafIcon } from "lucide-react";
import {
  deviceLabel,
  deviceTone,
  devicesSummary,
  formatUptime,
  type Device,
  type DevicesSnapshot,
} from "../_lib/devices";
import { TONE_DOT, TONE_TEXT } from "./StatusPill";
import { formatRelative, formatNumber } from "../_lib/format";
import { PictureHero } from "./PictureHero";

// Field-Pi liveness board — a port of GainForest/pi-taina-monitor re-skinned
// in the gainforest.earth editorial system. Seeds from the server snapshot
// (instant paint), then re-polls /api/devices every 60s (the Pi heartbeat
// cadence) so "is Pi X up?" stays current without a reload.
//
// The signal we lead with is liveness: a status dot + "last seen Xm ago",
// then the system vitals the agent embeds (CPU temp, RAM, disk, load, uptime)
// and the local Taina draft queue.

const POLL_MS = 60_000;
const MONITOR_URL = "https://github.com/GainForest/pi-taina-monitor";

const EMPTY_SNAPSHOT: DevicesSnapshot = {
  configured: true,
  devices: [],
  fetchedAt: new Date(0).toISOString(),
};

export function DeviceMonitor({ initial }: { initial?: DevicesSnapshot }) {
  const [snapshot, setSnapshot] = useState<DevicesSnapshot>(initial ?? EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial && !initial.configured) return; // nothing to poll
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/devices", { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as DevicesSnapshot;
        if (!cancelled && next.configured) setSnapshot(next);
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

  const { healthy, total } = devicesSummary(snapshot.devices);

  const statusAction = snapshot.configured && total > 0 ? (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-background/65 px-4 py-2 shadow-sm shadow-primary/5 backdrop-blur-xl">
        <span className={`relative inline-flex h-2.5 w-2.5 ${healthy === total ? "text-ok" : healthy === 0 ? "text-down" : "text-warn"}`}>
          <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-current" />
        </span>
        <span className="text-[14px] font-medium text-foreground">
          {healthy} of {total} online
        </span>
      </div>
      <span className="text-[12.5px] text-muted-foreground">
        updated {timeAgo(snapshot.fetchedAt)}
      </span>
    </div>
  ) : null;

  return (
    <section className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        lightSrc="/assets/media/images/devices/devices-hero-light.png"
        darkSrc="/assets/media/images/devices/devices-hero-dark.png"
        imageAlt="Misty regenerative landscape for GainForest field devices"
        eyebrow="Field updates"
        icon={<LeafGlyph />}
        title="Tainá"
        accent="field devices"
        lede="Field devices running Tainá send regular updates so teams can see which tools are active and ready."
        actions={statusAction}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-6">
        {!snapshot.configured ? (
          <NotConfigured />
        ) : snapshot.error && snapshot.devices.length === 0 ? (
          <Notice
            title="Could not load field updates"
            body="The devices may still be working; this page just cannot read them right now."
          />
        ) : loading ? (
          <DeviceCardsSkeleton />
        ) : snapshot.devices.length === 0 ? (
          <Notice
            title="No field devices yet"
            body="Once a field device sends its first update, it will appear here."
          />
        ) : (
          <ul role="list" className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.devices.map((d) => (
              <li key={d.id}>
                <DeviceCard device={d} />
              </li>
            ))}
          </ul>
        )}

      </div>
    </section>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────

function DeviceCardsSkeleton() {
  return (
    <ul role="list" className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading field updates">
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="rounded-2xl border border-border-soft bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-4 w-32 rounded-full bg-muted" />
              <div className="h-3 w-24 rounded-full bg-muted/70" />
            </div>
            <div className="h-7 w-20 rounded-full bg-muted" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="h-12 rounded-lg bg-muted/60" />
            <div className="h-12 rounded-lg bg-muted/60" />
          </div>
          <div className="mt-4 h-20 rounded-lg bg-muted/40" />
        </li>
      ))}
    </ul>
  );
}

function DeviceCard({ device }: { device: Device }) {
  const tone = deviceTone(device.status);
  const sys = device.system;
  const taina = device.taina;

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-border-soft bg-surface p-5 shadow-[0_8px_26px_-20px_rgba(20,30,15,0.3)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-mono text-[15px] font-semibold text-foreground">
            {device.name}
          </h2>
          {taina?.handle && (
            <Link
              href={`https://bsky.app/profile/${taina.handle}`}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[12px] text-foreground/55 underline-offset-2 hover:text-primary hover:underline"
            >
              <LeafGlyph /> {taina.handle}
            </Link>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-soft bg-background px-2.5 py-1 text-[12px] font-medium ${TONE_TEXT[tone]}`}
        >
          <span className={`relative inline-flex h-2 w-2 ${TONE_DOT[tone]}`}>
            <span className={`inline-block h-2 w-2 rounded-full bg-current ${tone === "ok" ? "pulse-dot" : ""}`} />
          </span>
          {deviceLabel(device.status)}
        </span>
      </header>

      {/* Liveness row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        <Row label="Last seen" value={device.lastPing ? formatRelative(device.lastPing) : "never"} />
        <Row label="Updates sent" value={formatNumber(device.nPings)} align="right" />
      </div>

      {/* System vitals */}
      {sys && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-surface-sunken/70 px-3 py-2 font-mono text-[12px]">
          {sys.tempC != null && <Vital label="Device temperature" value={`${sys.tempC.toFixed(1)}°C`} tone={tempTone(sys.tempC)} />}
          {sys.memUsedPct != null && <Vital label="Memory used" value={`${sys.memUsedPct}%`} tone={pctTone(sys.memUsedPct)} />}
          {sys.diskUsedPct != null && <Vital label="Storage used" value={`${sys.diskUsedPct}%`} tone={pctTone(sys.diskUsedPct)} />}
          {sys.load1m != null && <Vital label="Current workload" value={sys.load1m.toFixed(2)} />}
          {sys.uptimeS != null && <Vital label="Time running" value={formatUptime(sys.uptimeS)} />}
          {sys.throttled && <Vital label="Needs attention" value="slow" tone="text-down" />}
        </div>
      )}

      {/* Local Taina queue */}
      {taina && (taina.drafts != null || taina.whitelist != null) && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Saved items" value={taina.drafts} sub={taina.oldestDraftIso ? `oldest ${formatRelative(taina.oldestDraftIso)}` : undefined} />
          <Stat label="With photo" value={taina.draftsWithImages} />
          <Stat label="Allowed users" value={taina.whitelist} />
        </div>
      )}

      {device.tags.length > 0 && (
        <footer className="mt-auto flex flex-wrap gap-1.5 border-t border-border-soft pt-3">
          {device.tags.map((t) => (
            <span key={t} className="rounded-md bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-foreground/55">
              {t}
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}

function Row({ label, value, align }: { label: string; value: string; align?: "right" }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${align === "right" ? "" : ""}`}>
      <span className="text-foreground/55">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function Vital({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span title={label} className={`inline-flex items-center gap-1 ${tone ?? "text-foreground/80"}`}>
      <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${tone ? "bg-current" : "bg-foreground/30"}`} />
      {value}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | null; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-sunken/60 px-2.5 py-2">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-foreground/45">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-foreground">
        {value == null ? "—" : formatNumber(value)}
      </div>
      {sub && <div className="font-mono text-[9.5px] text-foreground/45">{sub}</div>}
    </div>
  );
}

// ── States ─────────────────────────────────────────────────────────────────

function NotConfigured() {
  return (
    <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div className="font-garamond text-[24px] text-foreground">Field updates are not connected here</div>
      <p className="mt-3 max-w-[520px] text-[14.5px] leading-[1.55] text-foreground/65">
        Field updates are available in the standalone Tainá monitor.
      </p>
      <Link
        href={MONITOR_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
      >
        Open Tainá monitor ↗
      </Link>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div className="font-garamond text-[22px] text-foreground">{title}</div>
      <p className="mt-2 max-w-[460px] text-[14px] leading-[1.5] text-foreground/60">{body}</p>
    </div>
  );
}

function LeafGlyph() {
  return <LeafIcon width={11} height={11} aria-hidden />;
}

function tempTone(c: number): string {
  if (c >= 75) return "text-down";
  if (c >= 65) return "text-warn";
  return "text-ok";
}

function pctTone(pct: number): string {
  if (pct >= 90) return "text-down";
  if (pct >= 75) return "text-warn";
  return "text-foreground/80";
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "just now";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}
