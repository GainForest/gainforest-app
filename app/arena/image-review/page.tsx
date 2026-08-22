import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@/app/_lib/format";
import { featuredRound } from "@/app/_lib/bioblitz";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { ArenaFlagsList } from "../_components/ArenaFlagsList";
import { loadReport, resolveAgentNames, type ArenaAgentNameEntry } from "../_lib/load-report";

export const metadata: Metadata = {
  title: "Image review · Agent Arena · Admin",
  robots: { index: false, follow: false },
};

/**
 * BioBlitz image-review sub-page (moderator-only; the gate lives in the
 * layout): the featured round's window, how many round images are still
 * unreviewed, and every flag agents have filed — pending ones first-class, so
 * a moderator can act from here via the duplicates dashboard link.
 */
export default async function ArenaImageReviewPage() {
  // Defense-in-depth parity with app/admin pages — the layout already gates.
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) return null;

  const t = await getTranslations("common.arena");
  const report = await loadReport();
  const names = new Map<string, ArenaAgentNameEntry>(
    report ? await resolveAgentNames(report) : [],
  );

  const openCount =
    report?.queues.find((queue) => queue.category === "image-review")?.openCount ?? 0;
  // The round context is static configuration, so it renders even while the
  // scoring lib is unavailable.
  const round = featuredRound();

  return (
    <>
      <section aria-labelledby="arena-image-review-heading">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="arena-image-review-heading" className="text-base font-semibold text-foreground">
            {t("imageReview.title")}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {t("imageReview.open", { count: openCount })}
          </span>
        </div>

        {/* Round context. */}
        <p className="mb-4 max-w-prose text-sm leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">{round.label}</span>
          {" · "}
          {formatDate(round.start)} – {formatDate(round.end)}
        </p>

        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">{t("flags.heading")}</h3>
          <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">
            {t("flags.subtitle")}
          </p>
        </div>

        {report ? (
          <ArenaFlagsList
            flags={report.flags}
            names={names}
            dashboardHref="/admin/grants?tab=bioblitz"
          />
        ) : (
          <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
            {t("leaderboard.unavailable")}
          </div>
        )}
      </section>
    </>
  );
}
