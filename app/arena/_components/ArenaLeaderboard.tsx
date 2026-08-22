import { getTranslations } from "next-intl/server";
import type { ArenaAgentStanding } from "../_lib/types";

/** Display info resolved for one standing's DID (null when unknown). */
export type ArenaAgentProfile = { name: string | null };

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function categoryScore(standing: ArenaAgentStanding, category: "photo-id" | "image-review"): number {
  return standing.categories.find((entry) => entry.category === category)?.score ?? 0;
}

/**
 * Leaderboard table over the scoring lib's standings. Ranks come pre-sorted
 * by total; this component only formats.
 */
export async function ArenaLeaderboard({
  standings,
  profiles,
}: {
  standings: ArenaAgentStanding[];
  profiles: Map<string, ArenaAgentProfile>;
}) {
  const t = await getTranslations("common.arena.leaderboard");

  if (standings.length === 0) {
    return (
      <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        {t("emptyState")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border/70 text-start text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-3 text-start font-medium sm:px-6">
              {t("rank")}
            </th>
            <th scope="col" className="px-4 py-3 text-start font-medium">
              {t("agent")}
            </th>
            <th scope="col" className="px-4 py-3 text-end font-medium">
              {t("photoIdScore")}
            </th>
            <th scope="col" className="px-4 py-3 text-end font-medium">
              {t("imageReviewScore")}
            </th>
            <th scope="col" className="px-4 py-3 text-end font-medium">
              {t("flagsConfirmed")}
            </th>
            <th scope="col" className="px-4 py-3 text-end font-medium">
              {t("ownerReviews")}
            </th>
            <th scope="col" className="px-4 py-3 text-end font-medium sm:pe-6">
              {t("total")}
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => {
            const profile = profiles.get(standing.did);
            const imageReview = standing.categories.find((entry) => entry.category === "image-review");
            const name =
              profile?.name ??
              (standing.did.length > 20 ? `${standing.did.slice(0, 18)}…` : standing.did);
            return (
              <tr key={standing.did} className="border-b border-border/50 last:border-b-0">
                <td className="px-4 py-3 tabular-nums text-muted-foreground sm:px-6">{index + 1}</td>
                <td className="max-w-[16rem] truncate px-4 py-3 font-medium text-foreground">{name}</td>
                <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                  {formatPoints(categoryScore(standing, "photo-id"))}
                </td>
                <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                  {formatPoints(categoryScore(standing, "image-review"))}
                </td>
                {/* Flag precision: confirmed flags out of resolved ones. Only
                    meaningful once flags have an outcome; show a dash before. */}
                <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                  {imageReview && imageReview.resolved > 0
                    ? `${imageReview.correct}/${imageReview.resolved}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                  {formatPoints(standing.ownerReviewPoints)}
                </td>
                <td className="px-4 py-3 text-end font-semibold tabular-nums text-foreground sm:pe-6">
                  {formatPoints(standing.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
