"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ExternalLinkIcon, Globe2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { greenGlobeTreePreviewHref } from "@/app/_lib/urls";

const GREEN_GLOBE_PREVIEW_FOCUS_MESSAGE_TYPE = "gainforest.greenGlobePreview.focusTree";
const GREEN_GLOBE_PREVIEW_READY_MESSAGE_TYPE = "gainforest.greenGlobePreview.v1.ready";

type GreenGlobeTreePreviewCardProps = {
  did: string;
  datasetRef: string;
  treeGroupName?: string | null;
  treeCount?: number | null;
  treeUri?: string | null;
  treeName?: string | null;
  siteRef?: string | null;
  focusedSiteRef?: string | null;
};

function GreenGlobeTreePreviewCard({
  did,
  datasetRef,
  treeGroupName,
  treeCount,
  treeUri,
  treeName,
  siteRef,
  focusedSiteRef,
}: GreenGlobeTreePreviewCardProps) {
  const treeGroupPreviewUrl = greenGlobeTreePreviewHref(did, { datasetRef, siteRef });
  const focusedTreePreviewUrl = treeUri
    ? greenGlobeTreePreviewHref(did, {
        treeUri,
        datasetRef,
        siteRef: focusedSiteRef ?? siteRef,
      })
    : treeGroupPreviewUrl;
  const treeGroupLabel = treeGroupName?.trim() || "selected tree group";
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const targetOrigin = useMemo(() => {
    try {
      return new URL(treeGroupPreviewUrl).origin;
    } catch {
      return "*";
    }
  }, [treeGroupPreviewUrl]);

  const postPreviewFocusMessage = useCallback(() => {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) return;

    targetWindow.postMessage(
      {
        type: GREEN_GLOBE_PREVIEW_FOCUS_MESSAGE_TYPE,
        datasetRef,
        treeUri: treeUri ?? null,
        siteRef: focusedSiteRef ?? siteRef ?? null,
      },
      targetOrigin,
    );
  }, [datasetRef, focusedSiteRef, siteRef, targetOrigin, treeUri]);

  useEffect(() => {
    function handlePreviewReadyMessage(event: MessageEvent) {
      if (
        (targetOrigin !== "*" && event.origin !== targetOrigin) ||
        event.source !== iframeRef.current?.contentWindow ||
        typeof event.data !== "object" ||
        event.data === null
      ) {
        return;
      }

      const message = event.data as { type?: unknown; version?: unknown; projectDid?: unknown };
      if (
        message.type !== GREEN_GLOBE_PREVIEW_READY_MESSAGE_TYPE ||
        message.version !== 1 ||
        message.projectDid !== did
      ) {
        return;
      }

      postPreviewFocusMessage();
    }

    window.addEventListener("message", handlePreviewReadyMessage);
    return () => window.removeEventListener("message", handlePreviewReadyMessage);
  }, [did, postPreviewFocusMessage, targetOrigin]);

  useEffect(() => {
    postPreviewFocusMessage();
  }, [postPreviewFocusMessage]);

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-background p-4 shadow-sm md:p-5 lg:sticky lg:top-4 lg:z-20" aria-label="Green Globe tree group preview">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold font-garamond text-foreground">
            <Globe2Icon className="size-4 shrink-0 text-primary" />
            <span className="truncate">Green Globe — {treeGroupLabel}</span>
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Preview this tree group on the Green Globe map. Select a tree below to focus it in the preview.
          </p>
          {typeof treeCount === "number" || treeName ? (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {typeof treeCount === "number" ? <span>{treeCount} tree{treeCount === 1 ? "" : "s"}</span> : null}
              {treeName ? <span>Focused tree: <span className="text-foreground">{treeName}</span></span> : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={treeGroupPreviewUrl} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="size-3" />
              Open tree group
            </Link>
          </Button>
          {treeUri ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={focusedTreePreviewUrl} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="size-3" />
                Open selected tree
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/40 bg-muted/10">
        <iframe
          ref={iframeRef}
          title="Green Globe tree group preview"
          src={treeGroupPreviewUrl}
          className="h-[280px] w-full border-0 md:h-[360px] xl:h-[420px]"
          loading="lazy"
          onLoad={postPreviewFocusMessage}
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}

export default GreenGlobeTreePreviewCard;
