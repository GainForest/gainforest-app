import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { walkOccurrences, type OccurrenceWalkResult } from "@/app/_lib/indexer";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { LabelerClient } from "./_components/LabelerClient";

export const dynamic = "force-dynamic";

const EMPTY_PAGE: OccurrenceWalkResult = { records: [], cursor: null, hasMore: false };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.labeler.meta");
  const title = t("title");
  const description = t("description");
  return {
    title,
    description,
    alternates: await localizedAlternates("/labeler"),
    ...socialPreviewMetadata("/labeler", title, description),
  };
}

export default async function LabelerPage() {
  const [session, initialPage] = await Promise.all([
    fetchAuthSession().catch(() => ({ isLoggedIn: false as const })),
    walkOccurrences({
      media: "all",
      target: 72,
      after: null,
      resolveMedia: false,
    }).catch(() => EMPTY_PAGE),
  ]);

  return (
    <LabelerClient
      initialPage={initialPage}
      viewerDid={session.isLoggedIn ? session.did : null}
    />
  );
}
