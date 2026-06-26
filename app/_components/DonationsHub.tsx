"use client";

import { useTranslations } from "next-intl";
import { BarChart3Icon, TrophyIcon } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import { Dashboard } from "./Dashboard";
import { LeaderboardClient } from "../leaderboard/LeaderboardClient";

type DonationsView = "overview" | "leaderboard";

const DONATIONS_VIEWS: DonationsView[] = ["overview", "leaderboard"];
const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;

export function DonationsHub() {
  const [view, setView] = useQueryState(
    "view",
    parseAsStringEnum<DonationsView>(DONATIONS_VIEWS).withDefault("overview").withOptions(QUERY_STATE_OPTIONS),
  );

  return (
    <>
      <DonationsViewTabs view={view} onChange={(next) => void setView(next)} />
      {view === "leaderboard" ? <LeaderboardClient embedded /> : <Dashboard embedded />}
    </>
  );
}

function DonationsViewTabs({ view, onChange }: { view: DonationsView; onChange: (view: DonationsView) => void }) {
  const t = useTranslations("marketplace.donationsHub.tabs");
  const tabs: { id: DonationsView; label: string; Icon: typeof BarChart3Icon }[] = [
    { id: "overview", label: t("overview"), Icon: BarChart3Icon },
    { id: "leaderboard", label: t("leaderboard"), Icon: TrophyIcon },
  ];

  return (
    <div className="sticky top-14 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-center px-6 py-3">
        <div
          role="tablist"
          aria-label={t("ariaLabel")}
          className="flex items-center gap-1 rounded-full bg-muted/55 p-1 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur"
        >
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
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
