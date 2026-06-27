"use client";

import { useTranslations } from "next-intl";
import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { OverviewFolders, type OverviewFolderTile } from "@/app/account/_components/OverviewFolders";
import { manageHref, type ManageTarget } from "@/lib/links";

type OverviewStats = {
  bumicerts: number;
  donations: number;
  observations: number;
  projects?: number | null;
  sites?: number | null;
  trees?: number | null;
  audio?: number | null;
};

// Personal accounts and organizations own the same data, so both surface the
// same folders on their manage home. Titles come from translations.
function buildTiles(stats: OverviewStats, target: ManageTarget): OverviewFolderTile[] {
  return [
    { id: "projects", title: "Projects", href: manageHref(target, "projects"), count: stats.projects },
    { id: "observations", title: "Observations", href: manageHref(target, "observations"), count: stats.observations },
    { id: "sites", title: "Sites", href: manageHref(target, "sites"), count: stats.sites },
    { id: "trees", title: "Trees", href: manageHref(target, "trees"), count: stats.trees },
    { id: "audio", title: "Audio", href: manageHref(target, "audio"), count: stats.audio },
  ];
}

export function ManageOverview({
  target,
  stats,
}: {
  target: ManageTarget;
  account: AccountRouteData;
  stats: OverviewStats;
}) {
  const t = useTranslations("common.sidebar.items");
  const tiles = buildTiles(stats, target);

  const titleOverrides: Record<string, string> = {
    observations: t("myObservations"),
    projects: t("projects"),
    sites: t("sites"),
    trees: t("trees"),
    audio: t("audio"),
  };

  return (
    <OverviewFolders
      tiles={tiles.map((tile) => (titleOverrides[tile.id] ? { ...tile, title: titleOverrides[tile.id] } : tile))}
    />
  );
}
