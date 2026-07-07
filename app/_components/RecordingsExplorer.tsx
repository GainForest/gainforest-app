"use client";

/**
 * Calendar-first explorer for AudioMoth recording sets.
 *
 * Scheduled recorders capture ~1 minute every 5 minutes for weeks, so an
 * SD-card upload easily lands thousands of `ac.audio` records. A flat
 * infinite list makes those impossible to navigate, so above a small
 * threshold this component switches to a browse-by-time UI:
 *
 *   • a month calendar where each day is shaded by recording density —
 *     pick a day to load just that day's recordings;
 *   • a 24-hour histogram for the selected day — click an hour bar to
 *     narrow further (a day can still hold ~288 one-minute clips);
 *   • prev/next-day arrows that skip straight to days that have data.
 *
 * Small sets (short tests, a single afternoon) keep the plain player list.
 * All dates/hours use the viewer's local clock, matching the timestamps
 * already shown on each player row.
 */

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AcAudioListItem } from "@/app/_lib/ac-audio";
import { RecordingsPlayerList } from "./RecordingsPlayerList";

/** Below this many recordings the calendar is overkill — show the flat list. */
const FLAT_THRESHOLD = 30;

function itemInstant(item: AcAudioListItem): string {
  return item.recordedAt ?? item.createdAt;
}

/** Local-time day key, e.g. "2026-07-04". */
function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Density bucket → cell styling, relative to the busiest day in the set. */
function densityClass(count: number, max: number): string {
  if (count <= 0) return "";
  const ratio = count / Math.max(1, max);
  if (ratio >= 0.75) return "bg-primary/80 text-primary-foreground";
  if (ratio >= 0.5) return "bg-primary/55 text-primary-foreground";
  if (ratio >= 0.25) return "bg-primary/30 text-foreground";
  return "bg-primary/15 text-foreground";
}

export function RecordingsExplorer({
  did,
  host,
  items,
}: {
  did: string;
  host: string | null;
  items: AcAudioListItem[];
}) {
  const t = useTranslations("common.audiomoth.recordings");
  const locale = useLocale();

  /* ── Group recordings by local day (items arrive oldest-first) ─────────── */
  const dayMap = useMemo(() => {
    const map = new Map<string, AcAudioListItem[]>();
    for (const item of items) {
      const date = new Date(itemInstant(item));
      if (Number.isNaN(date.getTime())) continue;
      const key = dayKeyOf(date);
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [items]);

  const dayKeys = useMemo(() => [...dayMap.keys()].sort(), [dayMap]);
  const maxDayCount = useMemo(
    () => Math.max(1, ...[...dayMap.values()].map((list) => list.length)),
    [dayMap],
  );

  /* ── Selection state (defaults: latest day with recordings) ────────────── */
  const [selectedDayState, setSelectedDayState] = useState<string | null>(null);
  const [monthState, setMonthState] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const selectedDay =
    selectedDayState && dayMap.has(selectedDayState) ? selectedDayState : (dayKeys[dayKeys.length - 1] ?? null);
  const month = monthState ?? (selectedDay ? monthKeyOf(selectedDay) : null);

  const selectDay = (key: string) => {
    setSelectedDayState(key);
    setMonthState(monthKeyOf(key));
    setSelectedHour(null);
  };

  /* ── Localized formatters ──────────────────────────────────────────────── */
  const monthFormat = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }), [locale]);
  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    [locale],
  );
  const shortDayFormat = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);
  const hourFormat = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "numeric" }), [locale]);
  const weekdayLetters = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    // 2024-01-01 is a Monday; the calendar grid starts weeks on Monday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [locale]);
  const formatHour = (hour: number) => hourFormat.format(new Date(2024, 0, 1, hour));

  /* ── Small sets keep the plain list ────────────────────────────────────── */
  if (items.length <= FLAT_THRESHOLD || !selectedDay || !month) {
    return <RecordingsPlayerList did={did} host={host} items={items} />;
  }

  /* ── Calendar grid for the visible month ───────────────────────────────── */
  const [yearNum, monthNum] = month.split("-").map(Number);
  const firstOfMonth = new Date(yearNum, (monthNum ?? 1) - 1, 1);
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // Monday-start
  const daysInMonth = new Date(yearNum, monthNum ?? 1, 0).getDate();
  const minMonth = monthKeyOf(dayKeys[0]);
  const maxMonth = monthKeyOf(dayKeys[dayKeys.length - 1]);

  /* ── Selected day: hour histogram + visible items ──────────────────────── */
  const dayItems = dayMap.get(selectedDay) ?? [];
  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const item of dayItems) {
    const date = new Date(itemInstant(item));
    if (!Number.isNaN(date.getTime())) hourCounts[date.getHours()] += 1;
  }
  const maxHourCount = Math.max(1, ...hourCounts);
  const shownItems =
    selectedHour === null
      ? dayItems
      : dayItems.filter((item) => {
          const date = new Date(itemInstant(item));
          return !Number.isNaN(date.getTime()) && date.getHours() === selectedHour;
        });

  const dayIndex = dayKeys.indexOf(selectedDay);
  const prevDay = dayIndex > 0 ? dayKeys[dayIndex - 1] : null;
  const nextDay = dayIndex >= 0 && dayIndex < dayKeys.length - 1 ? dayKeys[dayIndex + 1] : null;

  const firstDate = parseDayKey(dayKeys[0]);
  const lastDate = parseDayKey(dayKeys[dayKeys.length - 1]);

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {t("groupCount", { count: items.length })} · {t("daySpan", { count: dayKeys.length })} ·{" "}
        {shortDayFormat.format(firstDate)} – {shortDayFormat.format(lastDate)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t("explorerHint")}</p>

      <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-start">
        {/* ── Calendar ─────────────────────────────────────────────────── */}
        <div className="w-full shrink-0 rounded-xl border border-border/70 p-3 md:w-[264px]">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              disabled={month <= minMonth}
              onClick={() => setMonthState(shiftMonth(month, -1))}
              aria-label={t("prevMonth")}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <p className="text-sm font-medium capitalize text-foreground">{monthFormat.format(firstOfMonth)}</p>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              disabled={month >= maxMonth}
              onClick={() => setMonthState(shiftMonth(month, 1))}
              aria-label={t("nextMonth")}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {weekdayLetters.map((letter, i) => (
              <span key={i} className="grid h-6 place-items-center text-[10px] font-medium uppercase text-muted-foreground">
                {letter}
              </span>
            ))}
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const key = `${month}-${String(i + 1).padStart(2, "0")}`;
              const count = dayMap.get(key)?.length ?? 0;
              const selected = key === selectedDay;
              if (count === 0) {
                return (
                  <span
                    key={key}
                    className="grid aspect-square place-items-center rounded-md text-xs text-muted-foreground/40"
                  >
                    {i + 1}
                  </span>
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDay(key)}
                  className={cn(
                    "grid aspect-square place-items-center rounded-md text-xs font-medium transition-shadow",
                    densityClass(count, maxDayCount),
                    selected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "hover:ring-1 hover:ring-primary/50",
                  )}
                  aria-label={`${dayFormat.format(parseDayKey(key))} · ${t("groupCount", { count })}`}
                  aria-pressed={selected}
                  title={t("groupCount", { count })}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Selected day ─────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-foreground">{dayFormat.format(parseDayKey(selectedDay))}</h3>
              <p className="text-xs text-muted-foreground">
                {t("groupCount", { count: selectedHour === null ? dayItems.length : shownItems.length })}
                {selectedHour !== null ? ` · ${formatHour(selectedHour)}` : null}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {selectedHour !== null ? (
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  onClick={() => setSelectedHour(null)}
                >
                  {t("allHours")}
                </button>
              ) : null}
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                disabled={!prevDay}
                onClick={() => prevDay && selectDay(prevDay)}
                aria-label={t("prevDay")}
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <button
                type="button"
                className="grid h-7 w-7 place-items-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                disabled={!nextDay}
                onClick={() => nextDay && selectDay(nextDay)}
                aria-label={t("nextDay")}
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          </div>

          {/* Hour-of-day histogram: click a bar to narrow to that hour */}
          <div className="mt-3">
            <div className="flex h-12 items-end gap-px">
              {hourCounts.map((count, hour) => {
                const active = selectedHour === hour;
                return (
                  <button
                    key={hour}
                    type="button"
                    disabled={count === 0}
                    onClick={() => setSelectedHour(active ? null : hour)}
                    className={cn(
                      "group relative flex-1 rounded-t-sm",
                      count === 0 ? "cursor-default" : "cursor-pointer",
                    )}
                    aria-label={`${formatHour(hour)} · ${t("groupCount", { count })}`}
                    aria-pressed={active}
                    title={count > 0 ? `${formatHour(hour)} · ${t("groupCount", { count })}` : undefined}
                  >
                    <span
                      className={cn(
                        "block w-full rounded-t-sm transition-colors",
                        count === 0
                          ? "bg-muted"
                          : active
                            ? "bg-primary"
                            : "bg-primary/35 group-hover:bg-primary/60",
                      )}
                      style={{ height: count === 0 ? 2 : `${Math.max(15, (count / maxHourCount) * 100)}%` }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
              {[0, 6, 12, 18].map((hour) => (
                <span key={hour}>{formatHour(hour)}</span>
              ))}
              <span aria-hidden />
            </div>
          </div>

          {/* Keyed so switching day/hour remounts the list and pauses playback */}
          <div className="mt-3">
            <RecordingsPlayerList key={`${selectedDay}:${selectedHour ?? "all"}`} did={did} host={host} items={shownItems} />
          </div>
        </div>
      </div>
    </div>
  );
}
