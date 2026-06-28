import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buildActivityFeed } from "../_lib/feed";
import { FeedClient } from "./FeedClient";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.feed");

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: { canonical: "/feed" },
  };
}

export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedContent />
    </Suspense>
  );
}

async function FeedContent() {
  // Prefetch the first page server-side so the feed shell renders instantly;
  // the client hydrates with it and can refetch to pick up live activity.
  const items = await buildActivityFeed().catch(() => []);
  return <FeedClient initialItems={items} />;
}
