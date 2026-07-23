"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { SectionSurface } from "@/components/ui/section-surface";
import { Skeleton } from "@/components/ui/skeleton";
import { DisplayHeading } from "@/components/ui/typography";
import {
  deviceTone,
  devicesSummary,
  type Device,
  type DevicesSnapshot,
} from "../_lib/devices";
import { TONE_DOT, TONE_TEXT } from "./StatusPill";
import { PictureHero } from "./PictureHero";

const POLL_MS = 60_000;
const MONITOR_URL = "https://github.com/GainForest/pi-taina-monitor";

const EMPTY_SNAPSHOT: DevicesSnapshot = {
  configured: true,
  devices: [],
  fetchedAt: new Date(0).toISOString(),
};

export function DeviceMonitor({ initial }: { initial?: DevicesSnapshot }) {
  const locale = useLocale();
  const t = useTranslations("common.devices");
  const [snapshot, setSnapshot] = useState<DevicesSnapshot>(initial ?? EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(!initial);
  const hasSuccessfulSnapshot = useRef(Boolean(initial));

  useEffect(() => {
    if (initial && !initial.configured) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/devices", { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as DevicesSnapshot;
        if (!cancelled) {
          // A valid unconfigured response is also authoritative. Without
          // storing it, the route mistakes "not connected" for a true empty
          // device list because /devices mounts without a server snapshot.
          hasSuccessfulSnapshot.current = true;
          setSnapshot(next);
        }
      } catch {
        if (!cancelled && !hasSuccessfulSnapshot.current) {
          setSnapshot((current) => ({ ...current, error: "unavailable" }));
        }
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
      <div className="inline-flex items-center gap-2.5 rounded-full bg-background/80 px-4 py-2 backdrop-blur-xl">
        <span className={`relative inline-flex size-2.5 ${healthy === total ? "text-ok" : healthy === 0 ? "text-down" : "text-warn"}`}>
          <span className="pulse-dot inline-block size-2.5 rounded-full bg-current" />
        </span>
        <span className="text-sm font-medium text-foreground">
          {t("summary.online", { healthy, total })}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {t("summary.updated", { time: relativeTime(snapshot.fetchedAt, locale) })}
      </span>
    </div>
  ) : null;

  return (
    <section className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        lightSrc="/assets/media/images/devices/devices-hero-light@2x.webp"
        darkSrc="/assets/media/images/devices/devices-hero-dark@2x.webp"
        imageAlt={t("hero.imageAlt")}
        title={t("hero.title")}
        accent={t("hero.accent")}
        lede={t("hero.lede")}
        actions={statusAction}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-6">
        {!snapshot.configured ? (
          <NotConfigured />
        ) : snapshot.error && snapshot.devices.length === 0 ? (
          <Notice tone="error" title={t("error.title")} body={t("error.body")} />
        ) : loading ? (
          <DeviceCardsSkeleton />
        ) : snapshot.devices.length === 0 ? (
          <Notice tone="empty" title={t("empty.title")} body={t("empty.body")} />
        ) : (
          <ul role="list" className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.devices.map((device) => (
              <li key={device.id}>
                <DeviceCard device={device} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DeviceCardsSkeleton() {
  const t = useTranslations("common.devices");
  return (
    <ul role="list" className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t("loadingAria")}>
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="flex h-full flex-col gap-5 rounded-2xl bg-muted/60 p-5">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-32 rounded-full" />
            <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
          <div>
            <Skeleton className="mb-2.5 h-3 w-24 rounded-full" />
            <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((__, readingIndex) => (
                <div key={readingIndex} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-12 rounded-full" />
                  <Skeleton className="h-3.5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Skeleton className="mb-2.5 h-3 w-24 rounded-full" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((__, statIndex) => (
                <div key={statIndex} className="space-y-1.5 rounded-lg bg-background/70 px-2.5 py-2">
                  <Skeleton className="h-2.5 w-full rounded-full" />
                  <Skeleton className="h-4 w-8 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeviceCard({ device }: { device: Device }) {
  const locale = useLocale();
  const t = useTranslations("common.devices");
  const tone = deviceTone(device.status);
  const sys = device.system;
  const taina = device.taina;
  const cpuPct = cpuPercent(sys);
  const hasHealth =
    sys != null &&
    (sys.tempC != null || sys.memUsedPct != null || sys.diskUsedPct != null || cpuPct != null || sys.uptimeS != null);
  const hasActivity = taina != null && (taina.drafts != null || taina.draftsWithImages != null || taina.whitelist != null);

  const uptime = (seconds: number) => {
    const minutes = Math.max(1, Math.round(seconds / 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return t("duration.daysHours", { days, hours: hours % 24 });
    if (hours > 0) return t("duration.hoursMinutes", { hours, minutes: minutes % 60 });
    return t("duration.minutes", { minutes });
  };

  return (
    <article className="flex h-full flex-col gap-5 rounded-2xl bg-muted/60 p-5">
      <header className="flex items-start justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-foreground">{device.name}</h2>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium ${TONE_TEXT[tone]}`}>
          <span className={`relative inline-flex size-2 ${TONE_DOT[tone]}`}>
            <span className={`inline-block size-2 rounded-full bg-current ${tone === "ok" ? "pulse-dot" : ""}`} />
          </span>
          {t(`status.${device.status}` as never)}
        </span>
      </header>

      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{t("card.lastReported")}</span>
        <span className="font-medium text-foreground">
          {device.lastPing ? relativeTime(device.lastPing, locale) : t("card.never")}
        </span>
      </div>

      {hasHealth && sys ? (
        <CardSection title={t("card.health")}>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-3">
            {sys.tempC != null ? <Reading label={t("card.temperature")} value={`${sys.tempC.toFixed(1)}°C`} tone={tempTone(sys.tempC)} /> : null}
            {sys.memUsedPct != null ? <Gauge label={t("card.memory")} pct={sys.memUsedPct} /> : null}
            {sys.diskUsedPct != null ? <Gauge label={t("card.storage")} pct={sys.diskUsedPct} /> : null}
            {cpuPct != null ? <Gauge label={t("card.processor")} pct={cpuPct} /> : null}
            {sys.uptimeS != null ? <Reading label={t("card.uptime")} value={uptime(sys.uptimeS)} /> : null}
          </div>
          {sys.throttled ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-down/10 px-2 py-1 text-xs font-medium text-down">
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-current" />
              {t("card.slow")}
            </p>
          ) : null}
        </CardSection>
      ) : null}

      {hasActivity && taina ? (
        <CardSection title={t("activity.title")}>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label={t("activity.saved")}
              value={taina.drafts}
              sub={taina.oldestDraftIso ? t("activity.oldest", { time: relativeTime(taina.oldestDraftIso, locale) }) : undefined}
            />
            <Stat label={t("activity.withPhotos")} value={taina.draftsWithImages} />
            <Stat label={t("activity.allowedUsers")} value={taina.whitelist} />
          </div>
        </CardSection>
      ) : null}

      {device.tags.length > 0 ? (
        <footer className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {device.tags.map((tag) => (
            <span key={tag} className="rounded-md bg-background/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {tag}
            </span>
          ))}
        </footer>
      ) : null}
    </article>
  );
}

function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Reading({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold tabular-nums ${tone ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function Gauge({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const bar = clamped >= 90 ? "bg-down" : clamped >= 75 ? "bg-warn" : "bg-primary/60";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground/70">{clamped}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/80">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(3, clamped)}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | null; sub?: string }) {
  const locale = useLocale();
  return (
    <div className="rounded-lg bg-background/70 px-2.5 py-2">
      <div className="text-xs font-medium leading-tight text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">
        {value == null ? "—" : new Intl.NumberFormat(locale).format(value)}
      </div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function NotConfigured() {
  const t = useTranslations("common.devices");
  return (
    <SectionSurface variant="muted" className="mt-8 flex flex-col items-center justify-center py-16 text-center">
      <DisplayHeading as="h2" className="text-2xl text-foreground">{t("notConfigured.title")}</DisplayHeading>
      <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{t("notConfigured.body")}</p>
      <Link
        href={MONITOR_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-dark motion-reduce:transition-none"
      >
        {t("notConfigured.action")}
        <ArrowUpRightIcon className="size-4" aria-hidden />
      </Link>
    </SectionSurface>
  );
}

function Notice({ title, body, tone }: { title: string; body: string; tone: "error" | "empty" }) {
  return (
    <SectionSurface
      variant={tone === "error" ? "danger" : "muted"}
      className="mt-8 flex flex-col items-center justify-center py-16 text-center"
      role={tone === "error" ? "alert" : "status"}
    >
      <DisplayHeading as="h2" className="text-2xl text-foreground">{title}</DisplayHeading>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
    </SectionSurface>
  );
}

function tempTone(celsius: number): string {
  if (celsius >= 75) return "text-down";
  if (celsius >= 65) return "text-warn";
  return "text-ok";
}

function cpuPercent(sys: Device["system"]): number | null {
  if (!sys || sys.load1m == null || !sys.cpus || sys.cpus <= 0) return null;
  return Math.min(100, Math.round((sys.load1m / sys.cpus) * 100));
}

function relativeTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "long" });
  if (absoluteSeconds < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, "day");
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
