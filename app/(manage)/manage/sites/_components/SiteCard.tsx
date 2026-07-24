"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import { computeSiteMetrics, type SiteMetrics } from "./site-metrics";

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
  updateDisabledReason?: string | null;
  deleteDisabledReason?: string | null;
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
  updateDisabledReason = null,
  deleteDisabledReason = null,
}: SiteCardProps) {
  const t = useTranslations("upload.sites");
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
      .then((geoJson) => setMetrics(computeSiteMetrics(geoJson)))
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
    <div
      className={cn(
        "relative overflow-hidden bg-background transition-colors motion-reduce:transition-none",
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
              {t("previewing")}
            </span>
          ) : isPreviewable ? (
            <span className="text-xs text-muted-foreground">{t("clickToPreview")}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{t("noPreview")}</span>
          )}

          {isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
              <BadgeCheckIcon className="h-3 w-3" />
              {t("default")}
            </span>
          )}
        </div>

        <div className="flex w-full flex-1 flex-col items-start justify-between px-3 py-2.5">
          <h3 className="line-clamp-3 font-instrument text-lg font-light italic leading-snug">
            {site.record.name ?? t("unnamed")}
          </h3>

          {isLoadingMetrics ? (
            <Loader2Icon className="mt-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : metrics === "Invalid" ? (
            <p className="mt-1 text-xs text-destructive">{t("invalid")}</p>
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
            <DropdownMenuItem onClick={onEdit} disabled={disableActions || Boolean(updateDisabledReason)} title={updateDisabledReason ?? undefined}>
              <PencilIcon className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onSetDefault}
              disabled={isDefault || disableActions || Boolean(updateDisabledReason)}
              title={updateDisabledReason ?? undefined}
            >
              <BadgeCheckIcon className="mr-2 h-3.5 w-3.5" />
              {isDefault ? t("alreadyDefault") : t("makeDefault")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={onDelete}
              disabled={isDefault || disableActions || Boolean(deleteDisabledReason)}
              title={deleteDisabledReason ?? undefined}
            >
              <Trash2Icon className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
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
