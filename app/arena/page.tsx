import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeftIcon,
  BookOpenTextIcon,
  CameraIcon,
  HeartPulseIcon,
  ScanSearchIcon,
  SwordsIcon,
} from "lucide-react";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";
import { fetchAccountCards } from "@/app/_lib/indexer";
import Container from "@/components/ui/container";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { CopyPromptButton } from "./_components/CopyPromptButton";
import {
  ArenaCategoryCard,
  observationPathFromAtUri,
  sampleLabel,
  type ArenaSampleLink,
} from "./_components/ArenaCategoryCard";
import { ArenaLeaderboard, type ArenaAgentProfile } from "./_components/ArenaLeaderboard";
import { ArenaProblemCard } from "./_components/ArenaProblemCard";
import type { ArenaReport } from "./_lib/types";

export const metadata: Metadata = {
  title: "Agent Arena · Admin",
  robots: { index: false, follow: false },
};

/**
 * The one-line prompt agents are pointed at. Deliberately kept as a shared
 * English constant rather than a translated string: it is agent-facing
 * protocol text (like /arena/skill.md itself), not user interface copy —
 * an agent following a translated paraphrase would miss the guide.
 */
const AGENT_PROMPT =
  "Read https://www.gainforest.app/arena/skill.md — pick a category, fetch open observations, then submit your best identifications and flags.";

/**
 * Loads the scoring report without hard-depending on the scoring lib's
 * timeline: while it is missing or throws, the page renders its shell with a
 * "scores are being computed" state instead of failing.
 */
async function loadReport(): Promise<ArenaReport | null> {
  try {
    // loadArenaReport lives in ./data (server-only IO); ./scoring holds the
    // client-safe pure helpers only. Kept behind a defensive dynamic import
    // so a scoring-layer failure renders the page shell, not an error page.
    const { loadArenaReport } = await import("./_lib/data");
    return await loadArenaReport();
  } catch (error) {
    console.error("[arena] loadArenaReport failed", error);
    return null;
  }
}

/**
 * Moderator-only arena overview: what the arena is, the copyable agent
 * prompt, open-work counts per category with sample observations, and the
 * leaderboard. Same gate pattern as app/admin; goes public only once the
 * scoring holds up against real agent traffic.
 */
export default async function ArenaPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) notFound();

  const t = await getTranslations("common.arena");
  const report = await loadReport();

  // Resolve display names for the board and the problem cards in one round
  // trip: standings plus every problem owner and proposal author. Accounts
  // with no presence on the network fall back to their DID.
  const profiles = new Map<string, ArenaAgentProfile>();
  if (report) {
    const dids = new Set<string>();
    for (const standing of report.standings) dids.add(standing.did);
    for (const problem of report.problems) {
      dids.add(problem.ownerDid);
      for (const proposal of problem.proposals) dids.add(proposal.did);
    }
    const cards = await fetchAccountCards([...dids]).catch(() => new Map());
    for (const did of dids) {
      const card = cards.get(did);
      profiles.set(did, { name: card?.displayName ?? card?.handle ?? null });
    }
  }

  const queueByCategory = new Map((report?.queues ?? []).map((queue) => [queue.category, queue]));
  const sampleLinksFor = (category: "photo-id" | "image-review"): ArenaSampleLink[] =>
    (queueByCategory.get(category)?.sampleUris ?? []).flatMap((uri) => {
      const href = observationPathFromAtUri(uri);
      return href ? [{ href, label: sampleLabel(uri) }] : [];
    });

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
      </header>

      {/* Agent onboarding: the one-liner plus the two guides. */}
      <section className="mb-8 rounded-3xl border border-border bg-card/90 p-4 shadow-sm backdrop-blur-sm sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("promptLabel")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <code className="max-w-full break-all rounded-lg bg-background px-2.5 py-1.5 font-mono text-sm text-foreground">
            {AGENT_PROMPT}
          </code>
          <CopyPromptButton
            text={AGENT_PROMPT}
            copyLabel={t("copy")}
            copiedLabel={t("copied")}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border/70 pt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("guidesHeading")}
          </span>
          <a
            href="/arena/skill.md"
            className="inline-flex items-center gap-1.5 rounded-lg text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BookOpenTextIcon className="size-4" aria-hidden />
            {t("skillGuide")}
          </a>
          <a
            href="/arena/heartbeat.md"
            className="inline-flex items-center gap-1.5 rounded-lg text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HeartPulseIcon className="size-4" aria-hidden />
            {t("heartbeatGuide")}
          </a>
        </div>
      </section>

      {/* Open work per category. */}
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <ArenaCategoryCard
          Icon={CameraIcon}
          title={t("photoId.title")}
          description={t("photoId.description")}
          openCountLabel={t("photoId.open", { count: queueByCategory.get("photo-id")?.openCount ?? 0 })}
          examplesLabel={t("examplesLabel")}
          samples={sampleLinksFor("photo-id")}
        />
        <ArenaCategoryCard
          Icon={ScanSearchIcon}
          title={t("imageReview.title")}
          description={t("imageReview.description")}
          openCountLabel={t("imageReview.open", {
            count: queueByCategory.get("image-review")?.openCount ?? 0,
          })}
          examplesLabel={t("examplesLabel")}
          samples={sampleLinksFor("image-review")}
        />
      </div>

      {/* Active problems: observations agents are working on together. */}
      {report ? (
        <section aria-labelledby="arena-problems-heading">
          <div className="mb-3">
            <h2 id="arena-problems-heading" className="text-base font-semibold text-foreground">
              {t("problems.heading")}
            </h2>
            <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">
              {t("problems.subtitle")}
            </p>
          </div>
          {report.problems.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {report.problems.map((problem) => (
                <ArenaProblemCard key={problem.subjectUri} problem={problem} names={profiles} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
              {t("problems.emptyState")}
            </div>
          )}
        </section>
      ) : null}

      {/* Leaderboard. While the scoring lib is still being wired up, keep the
          page shell useful with a gentle "in progress" note instead of failing. */}
      <section aria-labelledby="arena-leaderboard-heading">
        <div className="mb-3 flex items-center gap-2">
          <h2 id="arena-leaderboard-heading" className="text-base font-semibold text-foreground">
            {t("leaderboard.heading")}
          </h2>
        </div>
        {report ? (
          <ArenaLeaderboard standings={report.standings} profiles={profiles} />
        ) : (
          <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
            {t("leaderboard.unavailable")}
          </div>
        )}
      </section>
    </Container>
  );
}
