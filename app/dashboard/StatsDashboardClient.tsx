"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Building2Icon,
  CalendarDaysIcon,
  FolderKanbanIcon,
  ImageIcon,
  Layers3Icon,
  LayoutGridIcon,
  LeafIcon,
  MapIcon,
  MapPinIcon,
  UsersIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsTileGrid, type StatsTileItem } from "../_components/StatsTile";
import {
  fetchBumicertStats,
  fetchOccurrenceStats,
  fetchOrganizationStats,
  fetchProjectStats,
  type BumicertStats,
  type OccurrenceStats,
  type OrganizationStats,
  type ProjectStats,
} from "../_lib/indexer";

type LoadState<T> =
  | { status: "loading"; data: null }
  | { status: "ready"; data: T }
  | { status: "error"; data: null };

type DashboardStats = {
  bumicerts: LoadState<BumicertStats>;
  organizations: LoadState<OrganizationStats>;
  observations: LoadState<OccurrenceStats>;
  projects: LoadState<ProjectStats>;
};

const INITIAL_STATS: DashboardStats = {
  bumicerts: { status: "loading", data: null },
  organizations: { status: "loading", data: null },
  observations: { status: "loading", data: null },
  projects: { status: "loading", data: null },
};

export function StatsDashboardClient() {
  const stats = useDashboardStats();
  const locale = useLocale();
  const explore = useTranslations("marketplace.explore");
  const organizations = useTranslations("marketplace.organizations");
  const projects = useTranslations("marketplace.projects");

  const bumicertItems = useMemo<StatsTileItem[]>(() => {
    const data = stats.bumicerts.data;
    if (!data) return [];
    return [
      tile(explore("stats.published"), data.totalBumicerts, locale, <LayoutGridIcon />, true, "/bumicerts"),
      tile(explore("stats.withLocations"), data.certifiedPlaces, locale, <MapIcon />, false, "/bumicerts"),
      tile(explore("stats.contributors"), data.contributors, locale, <UsersIcon />, true, "/bumicerts"),
      tile(explore("stats.withCover"), data.projectPhotos, locale, <ImageIcon />, false, "/bumicerts"),
    ];
  }, [explore, locale, stats.bumicerts.data]);

  const organizationItems = useMemo<StatsTileItem[]>(() => {
    const data = stats.organizations.data;
    if (!data) return [];
    return [
      tile(organizations("stats.profiles"), data.organizations, locale, <Building2Icon />, true, "/organizations"),
      tile(organizations("stats.withBumicerts"), data.withBumicerts, locale, <FolderKanbanIcon />, false, "/organizations"),
      tile(organizations("stats.withObservations"), data.withObservations, locale, <LeafIcon />, true, "/organizations"),
      tile(organizations("stats.locations"), data.mappedPlaces, locale, <MapPinIcon />, false, "/organizations"),
    ];
  }, [locale, organizations, stats.organizations.data]);

  const observationItems = useMemo<StatsTileItem[]>(() => {
    const data = stats.observations.data;
    if (!data) return [];
    return [
      tile("Nature sightings shared", data.totalSightings, locale, <LeafIcon />, true, "/observations"),
      tile("Sightings with photos", data.photoSightings, locale, <ImageIcon />, false, "/observations"),
      tile("Sightings in last 30 days", data.recentSightings, locale, <CalendarDaysIcon />, true, "/observations"),
      tile("Locations across sightings", data.mappedSightings, locale, <MapIcon />, false, "/observations"),
    ];
  }, [locale, stats.observations.data]);

  const projectItems = useMemo<StatsTileItem[]>(() => {
    const data = stats.projects.data;
    if (!data) return [];
    return [
      tile(projects("stats.projects"), data.totalProjects, locale, <FolderKanbanIcon />, true, "/projects"),
      tile(projects("stats.withBumicerts"), data.projectsWithBumicerts, locale, <Layers3Icon />, false, "/projects"),
      tile(projects("stats.bumicerts"), data.bumicerts, locale, <LayoutGridIcon />, true, "/projects"),
      tile(projects("stats.withImages"), data.projectsWithImages, locale, <ImageIcon />, false, "/projects"),
    ];
  }, [locale, projects, stats.projects.data]);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 pb-20 md:pb-28">
      <DashboardStatsSection
        title="Bumicerts"
        description="Published project stories and the evidence attached to them."
        state={stats.bumicerts}
        items={bumicertItems}
      />
      <DashboardStatsSection
        title="Organizations"
        description="Public nature steward profiles, places, and linked activity."
        state={stats.organizations}
        items={organizationItems}
      />
      <DashboardStatsSection
        title="Observations"
        description="Nature sightings, photos, recent records, and mapped locations."
        state={stats.observations}
        items={observationItems}
      />
      <DashboardStatsSection
        title="Projects"
        description="Project collections and the Bumicerts grouped inside them."
        state={stats.projects}
        items={projectItems}
      />
    </div>
  );
}

function useDashboardStats(): DashboardStats {
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    function load<K extends keyof DashboardStats>(
      key: K,
      request: Promise<NonNullable<DashboardStats[K]["data"]>>,
    ) {
      request
        .then((data) => {
          if (cancelled || controller.signal.aborted) return;
          setStats((current) => ({
            ...current,
            [key]: { status: "ready", data },
          }) as DashboardStats);
        })
        .catch((error) => {
          if (cancelled || controller.signal.aborted || (error as Error).name === "AbortError") return;
          console.warn(`[dashboard] ${String(key)} stats failed`, error);
          setStats((current) => ({
            ...current,
            [key]: { status: "error", data: null },
          }) as DashboardStats);
        });
    }

    load("bumicerts", fetchBumicertStats(controller.signal));
    load("organizations", fetchOrganizationStats("both", controller.signal));
    load("observations", fetchOccurrenceStats(controller.signal));
    load("projects", fetchProjectStats(controller.signal));

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return stats;
}

function DashboardStatsSection<T>({
  title,
  description,
  state,
  items,
}: {
  title: string;
  description: string;
  state: LoadState<T>;
  items: StatsTileItem[];
}) {
  return (
    <section className="animate-in">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            className="font-garamond text-3xl font-light tracking-[-0.03em] text-foreground sm:text-4xl"
          >
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {state.status === "ready" ? (
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Updated now</span>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <StatsSkeleton />
      ) : state.status === "error" ? (
        <div className="rounded-3xl border border-border bg-foreground/5 p-6 text-sm text-muted-foreground">
          We could not load these numbers right now.
        </div>
      ) : (
        <StatsTileGrid columns={4} items={items} />
      )}
    </section>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-2xl bg-foreground/5 p-4 sm:rounded-3xl sm:p-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-4 w-3/4 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function tile(
  label: string,
  value: number | null | undefined,
  locale: string,
  icon: ReactNode,
  accent = false,
  href?: string,
): StatsTileItem {
  return {
    label,
    value: value == null ? "—" : formatStat(value, locale),
    icon,
    accent,
    href,
  };
}

function formatStat(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: Math.abs(value) >= 1000 ? "compact" : "standard" }).format(value);
}
