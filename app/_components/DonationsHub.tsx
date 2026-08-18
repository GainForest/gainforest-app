"use client";

import { useTranslations } from "next-intl";
import { BarChart3Icon, TrophyIcon } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { AdminOnlyIndicator } from "./AdminOnlyIndicator";
import { cn } from "@/lib/utils";
import { DashboardBody } from "./Dashboard";
import { LeaderboardBody } from "../leaderboard/LeaderboardClient";
import { PictureHero } from "./PictureHero";

type DonationsView = "overview" | "leaderboard";
type Period = "all" | "month" | "week";

const DONATIONS_VIEWS: DonationsView[] = ["overview", "leaderboard"];
const PERIODS: Period[] = ["all", "month", "week"];
const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;

const PILL_GROUP =
  "flex items-center gap-1 rounded-full bg-muted/55 p-1 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur";

// Single donations surface: one hero shared by both views, with the view
// switcher and period filter sitting in the hero's action slot (the same place
// the period control already lived) instead of a separate sticky tab bar above
// it. Only the body below the hero swaps, so toggling feels like changing a
// view rather than navigating to a different page.
export function DonationsHub() {
  const heroT = useTranslations("marketplace.dashboard.hero");
  const leaderboardT = useTranslations("marketplace.leaderboard.hero");
  const tabsT = useTranslations("marketplace.donationsHub.tabs");

  const [view, setView] = useQueryState(
    "view",
    parseAsStringEnum<DonationsView>(DONATIONS_VIEWS).withDefault("overview").withOptions(QUERY_STATE_OPTIONS),
  );
  const [period, setPeriod] = useQueryState(
    "period",
    parseAsStringEnum<Period>(PERIODS).withDefault("all").withOptions(QUERY_STATE_OPTIONS),
  );

  const isLeaderboard = view === "leaderboard";

  return (
    <section className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        lightSrc="/assets/media/images/donations/donations-hero-light@2x.webp"
        darkSrc="/assets/media/images/donations/donations-hero-dark@2x.webp"
        imageAlt={heroT("imageAlt")}
        eyebrow={heroT("eyebrow")}
        icon={<BarChart3Icon />}
        title={heroT("title")}
        accent={tabsT(view)}
        lede={isLeaderboard ? leaderboardT("description") : heroT("lede")}
        actions={
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <DonationsViewToggle view={view} onChange={(next) => void setView(next)} />
            <PeriodFilter period={period} onChange={(next) => void setPeriod(next)} />
          </div>
        }
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-6">
        {isLeaderboard ? <LeaderboardBody period={period} /> : <DashboardBody period={period} />}
      </div>
    </section>
  );
}

function DonationsViewToggle({ view, onChange }: { view: DonationsView; onChange: (view: DonationsView) => void }) {
  const t = useTranslations("marketplace.donationsHub.tabs");
  const tabs: { id: DonationsView; label: string; Icon: typeof BarChart3Icon }[] = [
    { id: "overview", label: t("overview"), Icon: BarChart3Icon },
    { id: "leaderboard", label: t("leaderboard"), Icon: TrophyIcon },
  ];

  return (
    <div role="tablist" aria-label={t("ariaLabel")} className={PILL_GROUP}>
      {tabs.map((tab) => {
        const active = tab.id === view;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <tab.Icon className="size-4" />
            {tab.label}
            <AdminOnlyIndicator />
          </button>
        );
      })}
    </div>
  );
}

function PeriodFilter({ period, onChange }: { period: Period; onChange: (period: Period) => void }) {
  const t = useTranslations("marketplace.dashboard.periods");
  return (
    <div className={PILL_GROUP}>
      {PERIODS.map((item) => {
        const active = period === item;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {t(item)}
          </button>
        );
      })}
    </div>
  );
}
