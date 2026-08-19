"use client";

import { useMemo } from "react";
import { BarChart3Icon, CrosshairIcon, EyeIcon, MapPinIcon, TrendingUpIcon } from "lucide-react";
import type { TrapKill, TrapObservation } from "../_lib/trap-records";

type Props = {
  kills: TrapKill[];
  observations: TrapObservation[];
};

type SpeciesStats = {
  species: string;
  killCount: number;
  observationCount: number;
  total: number;
};

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: typeof CrosshairIcon;
  iconColor: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Icon className={`size-4 ${iconColor}`} />
      </div>
      <div className="mt-2 text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ListCard({
  title,
  icon,
  emptyText,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h3>
      </div>
      <div className="p-4">{children || <p className="text-sm text-muted-foreground">{emptyText}</p>}</div>
    </div>
  );
}

export function TrapsAnalytics({ kills, observations }: Props) {
  const stats = useMemo(() => {
    // Total counts
    const totalKills = kills.reduce((sum, k) => sum + k.record.count, 0);
    const totalObservations = observations.length;

    // Species breakdown
    const speciesMap = new Map<string, SpeciesStats>();

    for (const kill of kills) {
      const species = kill.record.species.toLowerCase();
      const existing = speciesMap.get(species) ?? {
        species: kill.record.species,
        killCount: 0,
        observationCount: 0,
        total: 0,
      };
      existing.killCount += kill.record.count;
      existing.total += kill.record.count;
      speciesMap.set(species, existing);
    }

    for (const obs of observations) {
      const species = obs.record.species.toLowerCase();
      const existing = speciesMap.get(species) ?? {
        species: obs.record.species,
        killCount: 0,
        observationCount: 0,
        total: 0,
      };
      existing.observationCount += obs.record.count ?? 1;
      existing.total += obs.record.count ?? 1;
      speciesMap.set(species, existing);
    }

    const topSpecies = Array.from(speciesMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Control methods breakdown
    const methodCounts = new Map<string, number>();
    for (const kill of kills) {
      const method = kill.record.controlMeans;
      methodCounts.set(method, (methodCounts.get(method) ?? 0) + kill.record.count);
    }
    const controlMethods = Array.from(methodCounts.entries())
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count);

    // Areas
    const areaCounts = new Map<string, number>();
    for (const kill of kills) {
      const area = kill.record.areaName ?? "Unknown";
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + kill.record.count);
    }
    for (const obs of observations) {
      const area = obs.record.areaName ?? "Unknown";
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + (obs.record.count ?? 1));
    }
    const topAreas = Array.from(areaCounts.entries())
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Unique reporters
    const uniqueReporters = new Set([...kills.map((k) => k.did), ...observations.map((o) => o.did)]).size;

    return {
      totalKills,
      totalObservations,
      totalRecords: kills.length + observations.length,
      topSpecies,
      controlMethods,
      topAreas,
      uniqueReporters,
    };
  }, [kills, observations]);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Kills"
          value={stats.totalKills}
          subtitle={`from ${kills.length} records`}
          icon={CrosshairIcon}
          iconColor="text-red-500"
        />
        <StatCard
          title="Observations"
          value={stats.totalObservations}
          subtitle="field observations"
          icon={EyeIcon}
          iconColor="text-blue-500"
        />
        <StatCard
          title="Total Records"
          value={stats.totalRecords}
          subtitle={`${stats.topSpecies.length} species tracked`}
          icon={BarChart3Icon}
          iconColor="text-primary"
        />
        <StatCard
          title="Contributors"
          value={stats.uniqueReporters}
          subtitle="unique reporters"
          icon={TrendingUpIcon}
          iconColor="text-green-500"
        />
      </div>

      {/* Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top species */}
        <ListCard title="Top Species" emptyText="No data yet">
          {stats.topSpecies.length > 0 && (
            <ul className="space-y-3">
              {stats.topSpecies.map((s) => (
                <li key={s.species} className="flex items-center justify-between">
                  <span className="font-medium">{s.species}</span>
                  <div className="flex gap-3 text-sm">
                    {s.killCount > 0 && <span className="text-red-600 dark:text-red-400">{s.killCount} kills</span>}
                    {s.observationCount > 0 && (
                      <span className="text-blue-600 dark:text-blue-400">{s.observationCount} obs</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ListCard>

        {/* Control methods */}
        <ListCard title="Control Methods" emptyText="No kills recorded">
          {stats.controlMethods.length > 0 && (
            <ul className="space-y-3">
              {stats.controlMethods.map((m) => (
                <li key={m.method} className="flex items-center justify-between">
                  <span className="font-medium">{m.method}</span>
                  <span className="text-sm text-muted-foreground">{m.count.toLocaleString()} kills</span>
                </li>
              ))}
            </ul>
          )}
        </ListCard>

        {/* Top areas */}
        <ListCard title="Top Areas" icon={<MapPinIcon className="size-4" />} emptyText="No location data">
          {stats.topAreas.length > 0 && (
            <ul className="space-y-3">
              {stats.topAreas.map((a) => (
                <li key={a.area} className="flex items-center justify-between">
                  <span className="truncate font-medium">{a.area}</span>
                  <span className="text-sm text-muted-foreground">{a.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </ListCard>
      </div>
    </div>
  );
}
