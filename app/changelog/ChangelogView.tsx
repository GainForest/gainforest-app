"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Commit = {
  hash: string;
  date: string;
  author: string;
  subject: string;
  category: string;
  categoryLabel: string;
};

type Month = {
  month: string;
  count: number;
  counts: Record<string, number>;
  commits: Commit[];
};

export type ChangelogData = {
  generatedAt: string;
  version: string;
  total: number;
  firstDate: string | null;
  lastDate: string | null;
  categories: { key: string; label: string }[];
  months: Month[];
};

// Per-category colour tokens (dot + soft chip background). Falls back to muted.
const CATEGORY_STYLES: Record<string, { dot: string; chip: string }> = {
  taina: { dot: "bg-fuchsia-500", chip: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20" },
  dataJobs: { dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  donations: { dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  observations: { dot: "bg-lime-500", chip: "bg-lime-500/10 text-lime-700 dark:text-lime-300 border-lime-500/20" },
  projects: { dot: "bg-sky-500", chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20" },
  auth: { dot: "bg-violet-500", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20" },
  admin: { dot: "bg-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20" },
  i18n: { dot: "bg-teal-500", chip: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20" },
  ui: { dot: "bg-indigo-500", chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20" },
  fix: { dot: "bg-orange-500", chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20" },
  core: { dot: "bg-slate-500", chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20" },
};

function styleFor(key: string) {
  return CATEGORY_STYLES[key] ?? CATEGORY_STYLES.core;
}

function formatMonth(month: string, locale: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

function formatDay(date: string, locale: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function ChangelogView({ data, locale }: { data: ChangelogData; locale: string }) {
  const t = useTranslations("changelog");
  const [active, setActive] = useState<string | null>(null);

  const label = (key: string, fallback: string) => {
    const path = `categories.${key}`;
    return t.has(path as never) ? t(path as never) : fallback;
  };

  const visibleMonths = useMemo(() => {
    if (!active) return data.months;
    return data.months
      .map((month) => ({ ...month, commits: month.commits.filter((c) => c.category === active) }))
      .filter((month) => month.commits.length > 0);
  }, [active, data.months]);

  return (
    <div className="space-y-10">
      {/* Category filter legend with live counts */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterLabel")}>
        <button
          type="button"
          onClick={() => setActive(null)}
          aria-pressed={active === null}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            active === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
          )}
        >
          {t("all")} · {data.total}
        </button>
        {data.categories.map((cat) => {
          const total = data.months.reduce((sum, m) => sum + (m.counts[cat.key] ?? 0), 0);
          if (total === 0) return null;
          const st = styleFor(cat.key);
          const isActive = active === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActive(isActive ? null : cat.key)}
              aria-pressed={isActive}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
              )}
            >
              <span className={cn("size-2 rounded-full", st.dot)} aria-hidden />
              {label(cat.key, cat.label)}
              <span className={cn("tabular-nums", isActive ? "opacity-80" : "text-muted-foreground")}>{total}</span>
            </button>
          );
        })}
      </div>

      {/* Timeline of months */}
      <ol className="relative space-y-12 border-l border-border pl-6">
        {visibleMonths.map((month) => (
          <li key={month.month} className="relative">
            <span className="absolute -left-[31px] top-1.5 size-3 rounded-full border-2 border-background bg-primary" aria-hidden />
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold tracking-tight">{formatMonth(month.month, locale)}</h2>
              <span className="text-sm text-muted-foreground">{t("shipped", { count: month.commits.length })}</span>
            </div>

            {/* Distribution bar for the month */}
            {!active ? (
              <div className="mb-4 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                {data.categories.map((cat) => {
                  const n = month.counts[cat.key] ?? 0;
                  if (n === 0) return null;
                  return (
                    <span
                      key={cat.key}
                      className={cn("h-full", styleFor(cat.key).dot)}
                      style={{ width: `${(n / month.count) * 100}%` }}
                      title={`${label(cat.key, cat.label)}: ${n}`}
                    />
                  );
                })}
              </div>
            ) : null}

            <ul className="space-y-2">
              {month.commits.map((commit) => {
                const st = styleFor(commit.category);
                return (
                  <li key={commit.hash} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                    <span className="mt-1.5 w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDay(commit.date, locale)}
                    </span>
                    <span className="flex-1 text-sm leading-relaxed">{commit.subject}</span>
                    <span
                      className={cn(
                        "mt-0.5 hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline-block",
                        st.chip,
                      )}
                    >
                      {label(commit.category, commit.categoryLabel)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
