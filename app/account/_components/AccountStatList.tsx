"use client";

/**
 * A compact account footprint for the Overview rail. The tiles keep the
 * published work legible at a glance, while the fourth count gives the same
 * amount of space to funding activity. Audience counts stay beside Follow in
 * the hero, where they describe the account rather than its work.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BadgeCheckIcon,
  BinocularsIcon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  type LucideIcon,
} from "lucide-react";
import { formatCompact } from "@/app/_lib/format";
import {
  accountBumicertsPath,
  accountDonationsPath,
  accountObservationsPath,
  accountProjectsPath,
} from "../_lib/account-route";
import { AccountSectionHeading } from "./AccountSectionHeading";

export type AccountStatCounts = {
  projects: number;
  observations: number;
  bumicerts: number;
  /** Donations made by a person or received by an organization. */
  donations: number;
};

type AccountStatKind = "organization" | "user";
export type AccountStatTileId = "observations" | "projects" | "bumicerts" | "donations";

type AccountStatTile = {
  id: AccountStatTileId;
  count: number;
  href: string | null;
};

/**
 * The donation count is still useful on organization profiles, but organizations
 * do not have a public donation-history tab yet. Leave that tile informational
 * rather than linking visitors to a route that deliberately returns not found.
 */
export function accountStatTiles(
  identifier: string,
  accountKind: AccountStatKind,
  counts: AccountStatCounts,
): AccountStatTile[] {
  return [
    { id: "observations", count: counts.observations, href: accountObservationsPath(identifier) },
    { id: "projects", count: counts.projects, href: accountProjectsPath(identifier) },
    { id: "bumicerts", count: counts.bumicerts, href: accountBumicertsPath(identifier) },
    {
      id: "donations",
      count: counts.donations,
      href: accountKind === "user" ? accountDonationsPath(identifier) : null,
    },
  ];
}

const STAT_ICONS: Record<AccountStatTileId, LucideIcon> = {
  observations: BinocularsIcon,
  projects: FolderKanbanIcon,
  bumicerts: BadgeCheckIcon,
  donations: HeartHandshakeIcon,
};

// These are small field-note marks rather than the tile's main content. Their
// changing corners keep the group from reading like a rigid dashboard table.
const STAT_ICON_POSITIONS: Record<AccountStatTileId, string> = {
  observations: "right-4 top-3 -rotate-12",
  projects: "left-4 top-3 rotate-6",
  bumicerts: "right-6 top-5 rotate-12",
  donations: "left-6 top-5 -rotate-6",
};

function StatTile({ stat, label }: { stat: AccountStatTile; label: string }) {
  const Icon = STAT_ICONS[stat.id];
  const content = (
    <>
      <Icon
        aria-hidden
        className={`pointer-events-none absolute size-5 text-primary/45 ${STAT_ICON_POSITIONS[stat.id]}`}
      />
      <span className="relative z-10 block">
        <span className="block font-instrument text-3xl font-light italic leading-none tabular-nums text-foreground">
          {formatCompact(stat.count)}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
      </span>
    </>
  );
  const className = "relative flex min-h-28 flex-col items-center justify-center overflow-hidden rounded-2xl bg-muted p-4 text-center";

  if (stat.href) {
    return (
      <Link
        href={stat.href}
        data-account-stat-tile={stat.id}
        className={`${className} transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div data-account-stat-tile={stat.id} className={className}>
      {content}
    </div>
  );
}

export function AccountStatList({
  identifier,
  accountKind,
  counts,
}: {
  identifier: string;
  accountKind: AccountStatKind;
  counts: AccountStatCounts;
}) {
  const t = useTranslations("common.accountTabs");
  const overviewT = useTranslations("common.accountOverview");
  const labels: Record<AccountStatTileId, string> = {
    observations: t("observations"),
    projects: t("projects"),
    bumicerts: t("bumicerts"),
    donations: accountKind === "organization" ? overviewT("donationsReceived") : t("donations"),
  };

  return (
    <section data-account-stat-tiles>
      <AccountSectionHeading>{overviewT("atAGlance")}</AccountSectionHeading>
      <nav aria-label={overviewT("atAGlance")} className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-2">
        {accountStatTiles(identifier, accountKind, counts).map((stat) => (
          <StatTile key={stat.id} stat={stat} label={labels[stat.id]} />
        ))}
      </nav>
    </section>
  );
}
