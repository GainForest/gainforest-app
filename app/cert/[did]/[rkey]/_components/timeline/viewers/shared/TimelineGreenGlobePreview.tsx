"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { ExternalLinkIcon, Globe2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { greenGlobeTreePreviewHref } from "@/app/_lib/urls";
import { Button } from "@/components/ui/button";
import type { TimelineMapLayer } from "./timelineMapLayers";
import { getTimelineMapLayerState } from "./timelineMapLayerState";
import {
  buildTimelineGreenGlobeDatasetLayersMessage,
  buildTimelineGreenGlobeIframeSrc,
  getGreenGlobePreviewTargetOrigin,
  isGreenGlobePreviewReadyMessage,
} from "./timelineGreenGlobeProtocol";
import { useTimelineViewerStore } from "./timelineViewerStore";

interface TimelineGreenGlobePreviewProps {
  organizationDid: string;
  layers: TimelineMapLayer[];
  isLoading: boolean;
}

function CountBadge({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          : "rounded-full border border-border/70 px-2.5 py-1 text-xs font-medium text-muted-foreground"
      }
    >
      {children}
    </span>
  );
}

export function TimelineGreenGlobePreview({
  organizationDid,
  layers,
  isLoading,
}: TimelineGreenGlobePreviewProps) {
  const t = useTranslations("bumicert.detail.timelineEntry");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const requestSequenceRef = useRef(0);
  const activeMapLayerByDatasetUri = useTimelineViewerStore(
    (state) => state.activeMapLayerByDatasetUri,
  );
  const focusedMapLayerDatasetUri = useTimelineViewerStore(
    (state) => state.focusedMapLayerDatasetUri,
  );
  const hasMountedGreenGlobePreview = useTimelineViewerStore(
    (state) => state.hasMountedGreenGlobePreview,
  );
  const { activeLayers, hiddenLayers, activeCount, hiddenCount } =
    getTimelineMapLayerState(layers, activeMapLayerByDatasetUri);
  const activeDatasetRefs = activeLayers.map((layer) => layer.datasetUri);
  const iframeSrc = buildTimelineGreenGlobeIframeSrc(
    greenGlobeTreePreviewHref(organizationDid),
  );
  const targetOrigin = getGreenGlobePreviewTargetOrigin(iframeSrc);
  const href =
    activeLayers.length > 0
      ? greenGlobeTreePreviewHref(organizationDid, {
          datasetRefs: activeDatasetRefs,
        })
      : null;

  const postDatasetLayers = useCallback(() => {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow || !targetOrigin || layers.length === 0) {
      return;
    }

    const nextActiveDatasetRefs = layers
      .filter((layer) => activeMapLayerByDatasetUri[layer.datasetUri])
      .map((layer) => layer.datasetUri);
    const nextFocusedDatasetRef =
      focusedMapLayerDatasetUri &&
      nextActiveDatasetRefs.includes(focusedMapLayerDatasetUri)
        ? focusedMapLayerDatasetUri
        : (nextActiveDatasetRefs[0] ?? null);

    requestSequenceRef.current += 1;
    targetWindow.postMessage(
      buildTimelineGreenGlobeDatasetLayersMessage({
        projectDid: organizationDid,
        layers,
        activeDatasetRefs: nextActiveDatasetRefs,
        focusedDatasetRef: nextFocusedDatasetRef,
        requestId: `timeline-map-${requestSequenceRef.current}`,
      }),
      targetOrigin,
    );
  }, [
    activeMapLayerByDatasetUri,
    focusedMapLayerDatasetUri,
    layers,
    organizationDid,
    targetOrigin,
  ]);

  useEffect(() => {
    postDatasetLayers();
  }, [postDatasetLayers]);

  useEffect(() => {
    if (!targetOrigin) {
      return;
    }

    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== targetOrigin ||
        event.source !== iframeRef.current?.contentWindow
      ) {
        return;
      }

      if (!isGreenGlobePreviewReadyMessage(event.data, organizationDid)) {
        return;
      }

      postDatasetLayers();
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [organizationDid, postDatasetLayers, targetOrigin]);

  const shouldMountPreview = hasMountedGreenGlobePreview || activeLayers.length > 0;

  if ((!isLoading && layers.length === 0) || !shouldMountPreview) {
    return null;
  }

  return (
    <section
      hidden={activeLayers.length === 0}
      className="sticky top-4 z-10 overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm"
    >
      <div className="flex flex-col gap-3 border-b border-border/50 p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-medium text-foreground">
            <Globe2Icon className="size-4 text-primary" />
            {t("greenGlobeMapTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading
              ? t("resolvingSpatialLayers")
              : layers.length > 0
                ? t(
                    activeLayers.length === 0
                      ? "activeHiddenLayerSummaryWithHint"
                      : "activeHiddenLayerSummary",
                    { activeCount, hiddenCount },
                  )
                : t("showLayerHint")}
          </p>
          {!isLoading && layers.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <CountBadge active={activeCount > 0}>
                {t("activeLayerBadge", { count: activeCount })}
              </CountBadge>
              <CountBadge>{t("hiddenLayerBadge", { count: hiddenCount })}</CountBadge>
            </div>
          ) : null}
        </div>
        {href ? (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="size-3" />
              {t("openGreenGlobe")}
            </a>
          </Button>
        ) : null}
      </div>

      {layers.length > 0 ? (
        <div className="space-y-3 p-3 md:p-4">
          <div className="space-y-2">
            {activeLayers.length > 0 ? (
              <>
                <p className="text-xs font-medium text-muted-foreground">
                  {t("activeLayersInPreview")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeLayers.map((layer) => (
                    <span
                      key={layer.datasetUri}
                      className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                    >
                      {layer.title}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("showLayerHint")}
              </p>
            )}
            {hiddenLayers.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {hiddenLayers.map((layer) => (
                  <span
                    key={layer.datasetUri}
                    className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {t("hiddenLayerPrefix", { title: layer.title })}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-xl border border-border/40 bg-muted/10">
            <iframe
              ref={iframeRef}
              title={t("greenGlobeIframeTitle")}
              src={iframeSrc}
              className="h-[240px] w-full border-0 md:h-[360px]"
              loading="lazy"
              onLoad={postDatasetLayers}
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
