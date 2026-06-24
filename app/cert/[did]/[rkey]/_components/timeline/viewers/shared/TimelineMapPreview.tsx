"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { TimelineReference } from "../../timelineReferences";

export function TimelineMapPreview({ refs }: { refs: TimelineReference[] }) {
  const entryT = useTranslations("bumicert.detail.timelineEntry");
  const [activeId, setActiveId] = useState(refs[0]?.id ?? "");
  const active = refs.find((ref) => ref.id === activeId) ?? refs[0];

  if (!active?.mapHref) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-background p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-medium text-foreground">
            {entryT("mapPreviewTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {entryT("mapPreviewDescription")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {refs.map((ref) => (
            <button
              key={ref.id}
              type="button"
              onClick={() => setActiveId(ref.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active.id === ref.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {ref.title}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border-soft bg-muted/30">
        <iframe
          src={active.mapHref}
          className="h-[420px] w-full border-0"
          loading="lazy"
          title={entryT("treeGroupMapPreview")}
        />
      </div>
      <Link
        href={active.mapHref}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        {entryT("openMap")}
        <ExternalLinkIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function TimelineTreeMapCards({ refs }: { refs: TimelineReference[] }) {
  const entryT = useTranslations("bumicert.detail.timelineEntry");

  return (
    <div className="rounded-xl bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{entryT("treeDatasetMapLayers")}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {refs.map((ref) => (
          <Link
            key={ref.id}
            href={ref.mapHref ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border/60 bg-background p-3 text-sm transition-colors hover:border-primary/40 hover:text-primary"
          >
            <span className="font-medium">{ref.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {ref.description ?? entryT("openMapLayer")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
