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

import { useEffect, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { fetchPublishedSoundscape } from "@/app/_lib/soundscape-record";
import { soundscapeHref, type PublishedSoundscape } from "@/lib/soundscape/record";
import { SoundscapeCard } from "@/app/soundscape/_components/SoundscapeCard";

export function FeedSoundscapeCard({ did, rkey }: { did: string; rkey: string }) {
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
    <div
      ref={containerRef}
      className="mt-2"
      // The dial is an interactive control of its own (tap a time to listen);
      // a click inside it must not also toggle the post row.
      onClick={(event) => event.stopPropagation()}
    >
      {soundscape === undefined ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-border/60 bg-card/40 text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
        </div>
      ) : (
        <SoundscapeCard soundscape={soundscape} href={soundscapeHref(did, rkey)} />
      )}
    </div>
  );
}
