"use client";

import { useEffect, useState } from "react";
import { FeedActionBar, useFeedInteractions } from "@/app/feed/FeedActions";
import { cn } from "@/lib/utils";

/**
 * Standalone like + comment bar for a single record (a sighting, project, …),
 * reusing the feed's engagement layer (app.gainforest.feed.like + reply-posts)
 * so the interaction looks and behaves exactly like it does in /feed.
 *
 * The viewer is resolved client-side via /api/session so the host page can stay
 * statically cached (the sighting detail page is ISR). Public like and comment
 * counts load regardless of auth; the viewer's own like state fills in once the
 * session resolves, and the write actions gate on being signed in (an
 * unauthenticated tap routes through sign-in).
 */
export function RecordEngagement({
  subjectUri,
  className,
}: {
  subjectUri: string;
  className?: string;
}) {
  const [viewerDid, setViewerDid] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { session?: { isLoggedIn?: boolean; did?: string } } | null) => {
        if (!active) return;
        setViewerDid(data?.session?.isLoggedIn ? data.session.did ?? null : null);
      })
      .catch(() => {
        /* counts still render; the viewer just stays anonymous */
      });
    return () => {
      active = false;
    };
  }, []);

  // useFeedInteractions resets its caches when the viewer changes, so the first
  // (anonymous) load fetches public counts and a later sign-in resolve refetches
  // to fill in the viewer's own like state.
  const interactions = useFeedInteractions(viewerDid);
  const { loadEngagement } = interactions;
  useEffect(() => {
    loadEngagement([subjectUri]);
  }, [subjectUri, loadEngagement]);

  return (
    <div className={cn(className)}>
      <FeedActionBar subjectUri={subjectUri} signedIn={Boolean(viewerDid)} interactions={interactions} />
    </div>
  );
}
