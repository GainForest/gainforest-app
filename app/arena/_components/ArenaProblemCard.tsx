import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon, LeafIcon, UsersRoundIcon } from "lucide-react";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import type { ArenaProblemView } from "../_lib/types";
import type { ArenaAgentProfile } from "./ArenaLeaderboard";
import { BotBadge } from "./BotBadge";

/**
 * One active-problem card: photo thumb, collaboration status, and the leading
 * proposal (ordering comes from the data layer — leading taxon first). Links
 * to the labeler deep link for that observation, where anyone can read every
 * proposal and add their own.
 */
export async function ArenaProblemCard({
  problem,
  names,
}: {
  problem: ArenaProblemView;
  names: Map<string, ArenaAgentProfile>;
}) {
  const t = await getTranslations("common.arena.problems");
  const leading = problem.proposals[0] ?? null;
  const extraProposals = Math.max(0, problem.proposals.length - 1);
  const profile = leading ? names.get(leading.did) : undefined;
  const agentName = leading
    ? profile?.name ?? (leading.did.length > 20 ? `${leading.did.slice(0, 18)}…` : leading.did)
    : null;

  return (
    <Link
      href={`/labeler?uri=${encodeURIComponent(problem.subjectUri)}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Photo thumb, or a quiet botanical fallback when there is none. */}
      <div className="relative h-36 w-full shrink-0 overflow-hidden bg-surface-sunken sm:h-40">
        {problem.imageUrl ? (
          <Image
            src={problem.imageUrl}
            alt={problem.currentName ?? t("photoAlt")}
            fill
            sizes="(max-width:768px) 100vw, (max-width:1280px) 50vw, 33vw"
            unoptimized={!isPdsBlobUrl(problem.imageUrl)}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background:
                "radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--primary) 16%, transparent), transparent), var(--surface)",
            }}
          >
            <LeafIcon className="size-10 text-primary/20" />
          </div>
        )}
      </div>

      <div className="flex grow flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {problem.status.state === "open" ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {t("statusOpen", {
                count: problem.status.identifiers,
                total: problem.status.needed,
                // Disagreement past the threshold still needs a tie-breaker.
                needed: Math.max(1, problem.status.needed - problem.status.identifiers),
              })}
            </span>
          ) : (
            <span className="rounded-full bg-primary/[0.08] px-2 py-0.5 text-xs font-medium text-primary">
              {problem.status.by === "owner" ? t("statusOwner") : t("statusConvergence")}
            </span>
          )}
          {problem.status.state === "resolved" ? (
            <em className="truncate text-xs not-italic text-muted-foreground">{problem.status.taxon}</em>
          ) : null}
        </div>

        {leading ? (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UsersRoundIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{agentName}</span>
              {profile?.isBot ? (
                <span className="ms-1 inline-flex">
                  <BotBadge />
                </span>
              ) : null}
              {leading.confidence !== null ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium tabular-nums">
                  {leading.confidence}%
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-sm text-foreground">
              <em className="italic">{leading.scientificName}</em>
              {leading.vernacularName ? (
                <span className="text-muted-foreground"> · {leading.vernacularName}</span>
              ) : null}
            </p>
            {/* Remarks are clamped in this list; the full text lives on the
                labeler page the card opens. */}
            {leading.remarks ? (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {leading.remarks}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {t("proposalCount", { count: problem.proposals.length })}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg text-xs font-medium text-primary underline-offset-2 group-hover:underline">
            {t("helpIdentify")}
            <ArrowRightIcon className="size-3 rtl:-scale-x-100" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
