import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { buildActivityFeed } from "../_lib/feed";
import { fetchAuthSession } from "../_lib/auth-server";
import { getGainForestModeratorAccess } from "../internal/badges/_lib/access";
import { FeedPageSkeleton } from "../_components/PageLoadingSkeletons";
import { FeedClient } from "./FeedClient";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.feed");
  const title = t("meta.title");
  const description = t("meta.description");

  return {
    title,
    description,
    alternates: localizedAlternates("/feed"),
    ...socialPreviewMetadata("/feed", title, description),
  };
}

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedPageSkeleton />}>
      <FeedContent />
    </Suspense>
  );
}

async function FeedContent() {
  // Prefetch the first page server-side so the feed shell renders instantly;
  // the client hydrates with it, can load more, and can refetch live activity.
  // The session decides whether the like / comment / post affordances are live.
  const [page, session, moderator] = await Promise.all([
    buildActivityFeed().catch(() => ({ items: [], nextCursor: null, hasMore: false })),
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
    // Donations is being wound down for the general public — the filter is only
    // surfaced to admin-group members for now.
    getGainForestModeratorAccess().catch(() => null),
  ]);
  const viewerDid = session.isLoggedIn ? session.did : null;
  return (
    <FeedClient
      initialItems={page.items}
      initialCursor={page.nextCursor}
      initialHasMore={page.hasMore}
      signedIn={Boolean(viewerDid)}
      viewerDid={viewerDid}
      isAdmin={Boolean(moderator?.isModerator)}
    />
  );
}
