"use client";

/**
 * In-feed preview for a shared soundscape: the 24-hour clock itself, playable
 * in place.
 *
 * The post carries a permalink; this card reads that soundscape record from
 * the owner's PDS (public, no session needed) and hands it to the same viewer
 * the permalink page uses. Like the bioacoustic clip card, the fetch is lazy —
 * a feed can hold many rows, and nothing is loaded until the card is near the
 * viewport.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRightIcon, Loader2Icon, WavesIcon } from "lucide-react";
import { fetchPublishedSoundscape } from "@/app/_lib/soundscape-record";
import { soundscapeHref, type PublishedSoundscape } from "@/lib/soundscape/record";
import { PublishedSoundscapeView } from "@/app/soundscape/_components/PublishedSoundscapeView";

export function FeedSoundscapeCard({ did, rkey }: { did: string; rkey: string }) {
  const t = useTranslations("common.soundscape.published");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [soundscape, setSoundscape] = useState<PublishedSoundscape | null | undefined>(undefined);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const controller = new AbortController();
    setSoundscape(undefined);
    fetchPublishedSoundscape(did, rkey, controller.signal)
      .then((next) => setSoundscape(next))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setSoundscape(null);
      });
    return () => controller.abort();
  }, [did, inView, rkey]);

  // A soundscape that can't be read (deleted, or its PDS unreachable) leaves
  // the post as it was — a caption with nothing bolted underneath.
  if (soundscape === null) return null;

  return (
    <div ref={containerRef} className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
          <WavesIcon className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{soundscape?.title || t("inFeedTitle")}</span>
        </p>
        <Link
          href={soundscapeHref(did, rkey)}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t("openFull")}
          <ArrowUpRightIcon className="size-3" />
        </Link>
      </div>
      {soundscape === undefined ? (
        <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
        </div>
      ) : (
        <div
          className="p-3"
          // The dial is an interactive control of its own (click a time to
          // listen); a click inside it must not also toggle the post row.
          onClick={(event) => event.stopPropagation()}
        >
          <PublishedSoundscapeView soundscape={soundscape} />
        </div>
      )}
    </div>
  );
}
