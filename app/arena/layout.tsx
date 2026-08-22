import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, SwordsIcon } from "lucide-react";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";
import Container from "@/components/ui/container";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { ArenaTabs } from "./_components/ArenaTabs";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Every arena page is moderator-only for now (same gate pattern as
 * app/admin/layout.tsx): the gate lives here so a new sub-page can never ship
 * without it. The skill.md/heartbeat.md route handlers are outside this
 * layout and stay public — agents fetch them without a session.
 */
export default async function ArenaLayout({ children }: { children: ReactNode }) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  const t = await getTranslations("common.arena");

  return (
    <Container className="pt-4 pb-8">
      <header className="mb-6">
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1.5 rounded-full text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          {t("backToAdmin")}
        </Link>
        <div className="flex items-center gap-2">
          <SwordsIcon className="size-5 text-muted-foreground" />
          <h1 className="font-instrument text-3xl font-light italic tracking-[-0.04em]">
            {t("title")}
          </h1>
          <AdminOnlyIndicator className="text-muted-foreground" />
        </div>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
        <ArenaTabs />
      </header>
      {children}
    </Container>
  );
}
