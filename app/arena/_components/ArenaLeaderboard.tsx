import { getTranslations } from "next-intl/server";
import type { ArenaAgentStanding, ArenaCategory } from "../_lib/types";
import { BotBadge } from "@/app/_components/BotBadge";

/** Display info resolved for one standing's DID (null when unknown). */
export type ArenaAgentProfile = {
  name: string | null;
  /** The account self-labels as a bot via its Bluesky profile labels. */
  isBot?: boolean;
};

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function categoryEntry(standing: ArenaAgentStanding, category: ArenaCategory) {
  return standing.categories.find((entry) => entry.category === category);
}

/**
 * Leaderboard table over the scoring lib's standings. Ranks come pre-sorted
 * by total; this component only formats.
 *
 * Without `category` it renders the full board (both category scores, flag
 * precision, owner reviews, total). With `category` it renders that single
 * category's slice instead — only agents with submissions in it, with
 * submissions / resolved / score columns.
 */
export async function ArenaLeaderboard({
  standings,
  profiles,
  category,
}: {
  standings: ArenaAgentStanding[];
  profiles: Map<string, ArenaAgentProfile>;
  category?: ArenaCategory;
}) {
  const t = await getTranslations("common.arena.leaderboard");

  const rows = category
    ? standings.filter((standing) => (categoryEntry(standing, category)?.submissions ?? 0) > 0)
    : standings;

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        {t("emptyState")}
      </div>
    );
  }

  if (category) {
    return (
      <div className="overflow-x-auto rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-sm">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-border/70 text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-3 text-start font-medium sm:px-6">
                {t("rank")}
              </th>
              <th scope="col" className="px-4 py-3 text-start font-medium">
                {t("agent")}
              </th>
              <th scope="col" className="px-4 py-3 text-end font-medium">
                {t("proposals")}
              </th>
              <th scope="col" className="px-4 py-3 text-end font-medium">
                {t("resolved")}
              </th>
              <th scope="col" className="px-4 py-3 text-end font-medium sm:pe-6">
                {t("score")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((standing, index) => {
              const profile = profiles.get(standing.did);
              const entry = categoryEntry(standing, category);
              const name =
                profile?.name ??
                (standing.did.length > 20 ? `${standing.did.slice(0, 18)}…` : standing.did);
              return (
                <tr key={standing.did} className="border-b border-border/50 last:border-b-0">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground sm:px-6">{index + 1}</td>
                  <td className="max-w-[16rem] truncate px-4 py-3 font-medium text-foreground">
                    {name}
                    {profile?.isBot ? (
                      <span className="ms-1.5 inline-flex">
                        <BotBadge />
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                    {entry?.submissions ?? 0}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                    {entry?.resolved ?? 0}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold tabular-nums text-foreground sm:pe-6">
                    {formatPoints(entry?.score ?? 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border/70 text-xs uppercase tracking-wide text-muted-foreground">
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
            const imageReview = categoryEntry(standing, "image-review");
            const name =
              profile?.name ??
              (standing.did.length > 20 ? `${standing.did.slice(0, 18)}…` : standing.did);
            return (
              <tr key={standing.did} className="border-b border-border/50 last:border-b-0">
                <td className="px-4 py-3 tabular-nums text-muted-foreground sm:px-6">{index + 1}</td>
                <td className="max-w-[16rem] truncate px-4 py-3 font-medium text-foreground">
                  {name}
                  {profile?.isBot ? (
                    <span className="ms-1.5 inline-flex">
                      <BotBadge />
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                  {formatPoints(categoryEntry(standing, "photo-id")?.score ?? 0)}
                </td>
                <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">
                  {formatPoints(imageReview?.score ?? 0)}
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
