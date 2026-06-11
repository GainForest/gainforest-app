import Link from "next/link";
import {
  BadgeIcon,
  ChevronRightIcon,
  HeartIcon,
  LeafIcon,
  MicIcon,
  SettingsIcon,
  TreesIcon,
  UsersIcon,
  MapPinIcon,
  FolderKanbanIcon,
} from "lucide-react";
import BumicertIcon from "@/icons/BumicertIcon";
import type { AccountRouteData } from "@/app/account/_lib/account-route";
import type { ComponentType } from "react";

type OverviewStats = {
  bumicerts: number;
  donations: number;
  observations: number;
  projects?: number | null;
  sites?: number | null;
  trees?: number | null;
  audio?: number | null;
};

type DashboardCard = {
  id: string;
  title: string;
  description: string;
  href: string;
  count?: number | null;
  countLabel?: string;
  Icon: ComponentType<{ className?: string }>;
};

function formatCount(value: number | null | undefined): string {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("en").format(value);
}

function buildCards(account: AccountRouteData, stats: OverviewStats): DashboardCard[] {
  const common: DashboardCard[] = [
    {
      id: "bumicerts",
      title: "Bumicerts",
      description: "Create, edit, and review verified impact stories.",
      href: "/manage/bumicerts",
      count: stats.bumicerts,
      countLabel: "published",
      Icon: BumicertIcon,
    },
    {
      id: "groups",
      title: "Groups",
      description: "Open CGS group accounts and manage roles.",
      href: "/manage/groups",
      countLabel: "memberships",
      Icon: UsersIcon,
    },
    {
      id: "settings",
      title: "Settings",
      description: "Manage account settings, links, and export tools.",
      href: "/manage/settings",
      Icon: SettingsIcon,
    },
  ];

  if (account.kind === "user") {
    return [
      ...common.slice(0, 1),
      {
        id: "donations",
        title: "Donations",
        description: "Review public donation receipts from this account.",
        href: "/manage/donations",
        count: stats.donations,
        countLabel: "receipts",
        Icon: HeartIcon,
      },
      ...common.slice(1),
    ];
  }

  return [
    ...common.slice(0, 1),
    {
      id: "projects",
      title: "Projects",
      description: "Manage project collections used by Bumicerts.",
      href: "/manage/projects",
      count: stats.projects,
      countLabel: "collections",
      Icon: FolderKanbanIcon,
    },
    {
      id: "observations",
      title: "Observations",
      description: "Browse biodiversity and field occurrence records.",
      href: "/manage/observations",
      count: stats.observations,
      countLabel: "records",
      Icon: LeafIcon,
    },
    {
      id: "sites",
      title: "Sites",
      description: "Manage certified field locations and boundaries.",
      href: "/manage/sites",
      count: stats.sites,
      countLabel: "locations",
      Icon: MapPinIcon,
    },
    {
      id: "trees",
      title: "Trees",
      description: "Upload and maintain tree datasets.",
      href: "/manage/trees",
      count: stats.trees,
      countLabel: "datasets",
      Icon: TreesIcon,
    },
    {
      id: "audio",
      title: "Audio",
      description: "Manage field recordings and acoustic metadata.",
      href: "/manage/audio",
      count: stats.audio,
      countLabel: "recordings",
      Icon: MicIcon,
    },
    ...common.slice(1),
  ];
}

export function ManageOverview({
  account,
  stats,
}: {
  account: AccountRouteData;
  stats: OverviewStats;
}) {
  const cards = buildCards(account, stats);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-medium">Manage your {account.kind === "organization" ? "organization" : "account"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quick access to the records, groups, and settings connected to this profile.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.Icon;
          return (
            <Link
              key={card.id}
              href={card.href}
              className="group flex min-h-40 flex-col justify-between rounded-3xl border border-border bg-muted/40 p-4 transition-colors hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-3">
                <Icon className="size-6 text-muted-foreground transition-colors group-hover:text-primary" />
                <ChevronRightIcon className="size-5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div>
                <p className="text-lg font-medium text-foreground transition-colors group-hover:text-primary">{card.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{card.description}</p>
                {card.countLabel ? (
                  <p className="mt-3 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatCount(card.count)}</span> {card.countLabel}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
