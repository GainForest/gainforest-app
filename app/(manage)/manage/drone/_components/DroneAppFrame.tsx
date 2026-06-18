"use client";

import { useState } from "react";
import Link from "next/link";
import { DroneIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

type DroneAppFrameProps = {
  src: string;
  title: string;
  organizationName?: string | null;
};

export function DroneAppFrame({ src, title, organizationName }: DroneAppFrameProps) {
  const [loaded, setLoaded] = useState(false);
  const displayName = organizationName?.trim() || "this organization";

  return (
    <section className="flex min-h-[calc(100dvh-3.5rem)] flex-col gap-3 px-3 pb-3 pt-2 sm:px-4">
      <div className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card/85 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <DroneIcon className="size-3.5" /> Drone viewer
          </p>
          <h1 className="mt-1 font-instrument text-3xl font-light italic leading-tight tracking-[-0.02em] text-foreground">
            Drone imagery
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Explore drone, satellite, and raster evidence for {displayName}. The viewer runs in an embedded GainForest drone workspace.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0 rounded-full">
          <Link href={src} target="_blank" rel="noreferrer">
            <ExternalLinkIcon className="size-4" />
            Open in new tab
          </Link>
        </Button>
      </div>

      <div className="relative h-[calc(100dvh-13rem)] min-h-[560px] overflow-hidden rounded-3xl border border-border bg-muted shadow-sm">
        {!loaded ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted text-sm text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin text-primary" />
            Loading drone viewer…
          </div>
        ) : null}
        <iframe
          src={src}
          title={title}
          className="h-full w-full border-0"
          loading="eager"
          allow="fullscreen; clipboard-read; clipboard-write; geolocation"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </section>
  );
}
