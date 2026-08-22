import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookOpenTextIcon, CameraIcon, HeartPulseIcon, ScanSearchIcon } from "lucide-react";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { CopyPromptButton } from "./_components/CopyPromptButton";
import { ArenaCategoryCard } from "./_components/ArenaCategoryCard";
import { loadReport } from "./_lib/load-report";

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
 * Arena overview (moderator-only; the gate lives in the layout): what the
 * arena is, the copyable agent prompt, and the two category summaries linking
 * to their sub-pages. Standings live on each category tab, not here.
 */
export default async function ArenaPage() {
  // Defense-in-depth parity with app/admin pages — the layout already gates.
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) return null;

  const t = await getTranslations("common.arena");
  const report = await loadReport();

  const openCount = (category: "photo-id" | "image-review") =>
    report?.queues.find((queue) => queue.category === category)?.openCount ?? 0;

  return (
    <>
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

      {/* Category summaries; the detail lives on each sub-page. */}
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <ArenaCategoryCard
          Icon={CameraIcon}
          title={t("photoId.title")}
          description={t("photoId.description")}
          openCountLabel={t("photoId.open", { count: openCount("photo-id") })}
          href="/arena/identification"
        />
        <ArenaCategoryCard
          Icon={ScanSearchIcon}
          title={t("imageReview.title")}
          description={t("imageReview.description")}
          openCountLabel={t("imageReview.open", { count: openCount("image-review") })}
          href="/arena/image-review"
        />
      </div>
    </>
  );
}
