"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DisplayHeading } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { plainChangelogSubject } from "./changelog-presenter";

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
  taina: { dot: "bg-fuchsia-500", chip: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300" },
  dataJobs: { dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  donations: { dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  observations: { dot: "bg-lime-500", chip: "bg-lime-500/10 text-lime-700 dark:text-lime-300" },
  projects: { dot: "bg-sky-500", chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  auth: { dot: "bg-violet-500", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  admin: { dot: "bg-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  i18n: { dot: "bg-teal-500", chip: "bg-teal-500/10 text-teal-700 dark:text-teal-300" },
  ui: { dot: "bg-indigo-500", chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  fix: { dot: "bg-orange-500", chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  core: { dot: "bg-slate-500", chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
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
    <div className="space-y-6 md:space-y-8">
      {/* Category filter legend with live counts */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterLabel")}>
        <Button
          type="button"
          size="sm"
          variant={active === null ? "default" : "secondary"}
          onClick={() => setActive(null)}
          aria-pressed={active === null}
          className="min-h-11 px-3 text-xs sm:min-h-10"
        >
          {t("all")} · {data.total}
        </Button>
        {data.categories.map((cat) => {
          const total = data.months.reduce((sum, m) => sum + (m.counts[cat.key] ?? 0), 0);
          if (total === 0) return null;
          const st = styleFor(cat.key);
          const isActive = active === cat.key;
          return (
            <Button
              key={cat.key}
              type="button"
              size="sm"
              variant={isActive ? "default" : "secondary"}
              onClick={() => setActive(isActive ? null : cat.key)}
              aria-pressed={isActive}
              className="min-h-11 gap-2 px-3 text-xs sm:min-h-10"
            >
              <span className={cn("size-2 rounded-full", st.dot)} aria-hidden />
              {label(cat.key, cat.label)}
              <span className={cn("tabular-nums", isActive ? "opacity-80" : "text-muted-foreground")}>{total}</span>
            </Button>
          );
        })}
      </div>

      {/* Timeline of months */}
      <ol className="relative space-y-12 border-l border-border pl-6">
        {visibleMonths.map((month) => (
          <li key={month.month} className="relative">
            <span className="absolute -left-[31px] top-1.5 size-3 rounded-full border-2 border-background bg-primary" aria-hidden />
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <DisplayHeading as="h2" className="text-xl tracking-tight">{formatMonth(month.month, locale)}</DisplayHeading>
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

            <ul className="divide-y divide-border/50">
              {month.commits.map((commit) => {
                const st = styleFor(commit.category);
                return (
                  <li key={commit.hash} className="flex items-start gap-3 py-3">
                    <span className="mt-1.5 w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDay(commit.date, locale)}
                    </span>
                    <span className="flex-1 text-sm leading-relaxed">
                      {plainChangelogSubject(commit.subject, t("hiddenIdentifier"))}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-block",
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
