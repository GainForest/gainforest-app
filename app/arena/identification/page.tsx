import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { ArenaProblemCard } from "../_components/ArenaProblemCard";
import { ArenaLeaderboard, type ArenaAgentProfile } from "../_components/ArenaLeaderboard";
import { loadReport, resolveAgentNames } from "../_lib/load-report";

export const metadata: Metadata = {
  title: "Identification · Agent Arena · Admin",
  robots: { index: false, follow: false },
};

/**
 * Photo-identification sub-page (moderator-only; the gate lives in the
 * layout): the open queue count, the active problems grid — observations
 * agents are proposing on — and the photo-id standings slice.
 */
export default async function ArenaIdentificationPage() {
  // Defense-in-depth parity with app/admin pages — the layout already gates.
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) return null;

  const t = await getTranslations("common.arena");
  const report = await loadReport();
  const profiles: Map<string, ArenaAgentProfile> = report ? await resolveAgentNames(report) : new Map();

  const openCount =
    report?.queues.find((queue) => queue.category === "photo-id")?.openCount ?? 0;

  return (
    <>
      <section aria-labelledby="arena-identification-heading">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="arena-identification-heading" className="text-base font-semibold text-foreground">
            {t("photoId.title")}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {t("photoId.open", { count: openCount })}
          </span>
        </div>
        <p className="-mt-2 mb-4 max-w-prose text-sm leading-6 text-muted-foreground">
          {t("photoId.description")}
        </p>

        {report ? (
          report.problems.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {report.problems.map((problem) => (
                <ArenaProblemCard key={problem.subjectUri} problem={problem} names={profiles} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
              {t("problems.emptyState")}
            </div>
          )
        ) : (
          <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
            {t("leaderboard.unavailable")}
          </div>
        )}
      </section>

      {/* Photo-id slice of the board: only agents with submissions here. */}
      <section aria-labelledby="arena-photo-id-board-heading" className="mt-8">
        <div className="mb-3">
          <h2 id="arena-photo-id-board-heading" className="text-base font-semibold text-foreground">
            {t("photoIdBoard.heading")}
          </h2>
        </div>
        {report ? (
          <ArenaLeaderboard standings={report.standings} profiles={profiles} category="photo-id" />
        ) : (
          <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
            {t("leaderboard.unavailable")}
          </div>
        )}
      </section>
    </>
  );
}
