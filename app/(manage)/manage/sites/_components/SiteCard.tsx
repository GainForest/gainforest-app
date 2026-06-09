"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheckIcon,
  CrosshairIcon,
  Loader2Icon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ManagedLocation } from "@/app/_lib/indexer";

export type SiteMetrics = { area: number; lat: number; lon: number } | "Invalid" | null;

type SiteCardProps = {
  site: ManagedLocation;
  defaultSiteUri: string | null;
  onPreview: () => void;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  isPreviewing: boolean;
  isSettingDefault: boolean;
  isDeleting: boolean;
  error?: string | null;
  variant?: "card" | "list";
};

export function SiteCard({
  site,
  defaultSiteUri,
  onPreview,
  onEdit,
  onSetDefault,
  onDelete,
  isPreviewing,
  isSettingDefault,
  isDeleting,
  error,
  variant = "card",
}: SiteCardProps) {
  const locationUrl = useMemo(() => getSiteLocationUrl(site), [site]);
  const inlineCoord = useMemo(() => getInlineSiteCoordinate(site), [site]);
  const isPreviewable = hasMapPreview(site);
  const isDefault = Boolean(site.metadata.uri && site.metadata.uri === defaultSiteUri);
  const disableActions = isSettingDefault || isDeleting;

  const [metrics, setMetrics] = useState<SiteMetrics>(inlineCoord ? { area: 0, ...inlineCoord } : null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

  useEffect(() => {
    if (inlineCoord) {
      setMetrics({ area: 0, ...inlineCoord });
      setIsLoadingMetrics(false);
      return;
    }
    if (!locationUrl) {
      setMetrics(null);
      setIsLoadingMetrics(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingMetrics(true);
    setMetrics(null);
    fetch(locationUrl, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Map details unavailable");
        return (await res.json()) as GeoJSON.GeoJSON;
      })
      .then((geoJson) => setMetrics(computeSimpleMetrics(geoJson)))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMetrics("Invalid");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMetrics(false);
      });

    return () => controller.abort();
  }, [inlineCoord, locationUrl]);

  const numberFormat = useMemo(
    () => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }),
    [],
  );
  const areaFormat = useMemo(
    () => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }),
    [],
  );

  const handleCardClick = () => {
    if (!isPreviewable || isPreviewing) return;
    onPreview();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "relative overflow-hidden bg-background transition-all duration-300",
        variant === "card" ? "rounded-xl border" : "rounded-2xl border-0",
        isPreviewable && variant === "card" &&
          "hover:border-primary/30 hover:shadow-md focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        isPreviewable && variant === "list" && "hover:bg-surface-sunken focus-within:ring-2 focus-within:ring-primary/60",
        isPreviewing && variant === "card" ? "border-primary" : variant === "card" ? "border-border" : "",
      )}
    >
      <button
        type="button"
        onClick={handleCardClick}
        className={cn(
          "flex w-full flex-col text-left",
          variant === "card" ? "rounded-xl" : "py-1",
          isPreviewable ? "cursor-pointer focus-visible:outline-none" : "cursor-default",
        )}
      >
        <div className="flex h-10 items-center justify-between gap-2 border-b border-border px-3 pr-11">
          {isPreviewing ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
              Viewing
            </span>
          ) : isPreviewable ? (
            <span className="text-xs text-muted-foreground">Click to view map</span>
          ) : (
            <span className="text-xs text-muted-foreground">No map preview</span>
          )}

          {isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
              <BadgeCheckIcon className="h-3 w-3" />
              Default
            </span>
          )}
        </div>

        <div className="flex w-full flex-1 flex-col items-start justify-between px-3 py-2.5">
          <h3 className="line-clamp-3 text-base font-medium leading-snug">
            {site.record.name ?? "Unnamed site"}
          </h3>

          {isLoadingMetrics ? (
            <Loader2Icon className="mt-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : metrics === "Invalid" ? (
            <p className="mt-1 text-xs text-destructive">Map details unavailable</p>
          ) : metrics ? (
            <div className="mt-1.5 flex w-full items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <CrosshairIcon className="h-3 w-3 shrink-0" />
                {numberFormat.format(metrics.lat)}°, {numberFormat.format(metrics.lon)}°
              </span>
              {metrics.area > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {areaFormat.format(metrics.area)} ha
                </span>
              )}
            </div>
          ) : null}

          {site.record.description && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {site.record.description}
            </p>
          )}

          {error && (
            <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 p-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>
      </button>

      <div className="absolute right-1.5 top-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={disableActions}
              aria-label="Site actions"
            >
              {disableActions ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MoreVerticalIcon className="h-3.5 w-3.5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit} disabled={disableActions}>
              <PencilIcon className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onSetDefault}
              disabled={isDefault || disableActions}
            >
              <BadgeCheckIcon className="mr-2 h-3.5 w-3.5" />
              {isDefault ? "Already default" : "Make default"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={onDelete}
              disabled={isDefault || disableActions}
            >
              <Trash2Icon className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

function hasMapPreview(site: ManagedLocation): boolean {
  return site.record.location?.kind === "uri";
}

function getSiteLocationUrl(site: ManagedLocation): string | null {
  const location = site.record.location;
  if (location?.kind !== "uri") return null;
  if (location.uri.startsWith("at://")) return null;
  return location.uri;
}

function getInlineSiteCoordinate(site: ManagedLocation): { lat: number; lon: number } | null {
  const location = site.record.location;
  if (location?.kind === "point") return { lat: location.lat, lon: location.lon };
  return null;
}

function computeSimpleMetrics(
  geoJson: GeoJSON.GeoJSON,
): { area: number; lat: number; lon: number } | "Invalid" | null {
  try {
    const features: GeoJSON.Feature[] = (() => {
      if (geoJson.type === "FeatureCollection") return geoJson.features;
      if (geoJson.type === "Feature") return [geoJson];
      return [{ type: "Feature", geometry: geoJson as GeoJSON.Geometry, properties: {} }];
    })();

    let totalArea = 0;
    let sumLat = 0;
    let sumLon = 0;
    let count = 0;

    const processRings = (coords: number[][][]) => {
      for (const ring of coords) {
        let area = 0;
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i];
          const b = ring[i + 1];
          if (a && b) area += (a[0] ?? 0) * (b[1] ?? 0) - (b[0] ?? 0) * (a[1] ?? 0);
        }
        totalArea += Math.abs(area / 2) * 111320 * 111320 * 0.0001;

        for (const pt of ring) {
          sumLon += pt[0] ?? 0;
          sumLat += pt[1] ?? 0;
          count++;
        }
      }
    };

    for (const feature of features) {
      const geom = feature.geometry;
      if (!geom) continue;
      if (geom.type === "Polygon") {
        processRings(geom.coordinates);
      } else if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates) processRings(poly);
      } else if (geom.type === "Point") {
        sumLon += geom.coordinates[0] ?? 0;
        sumLat += geom.coordinates[1] ?? 0;
        count++;
      } else if (geom.type === "MultiPoint") {
        for (const pt of geom.coordinates) {
          sumLon += pt[0] ?? 0;
          sumLat += pt[1] ?? 0;
          count++;
        }
      }
    }

    if (count === 0) return "Invalid";
    return { area: totalArea, lat: sumLat / count, lon: sumLon / count };
  } catch {
    return "Invalid";
  }
}
