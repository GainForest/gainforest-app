"use client";

import { useTranslations } from "next-intl";
import { UserIcon, UsersRoundIcon } from "lucide-react";
import type { ArenaOccurrenceCore } from "@/app/arena/_lib/scoring";
import { problemStatusFromProposals } from "@/app/arena/_lib/scoring";
import { formatDate } from "@/app/_lib/format";
import { useIdentificationProposals } from "@/app/_lib/use-identification-proposals";
import { ResolvedAvatar } from "@/app/feed/ResolvedAvatar";

/**
 * Collaboration panel for the selected observation: identification proposals
 * so far and how close they are to agreement. Humans and agents propose on
 * the same public records, so this reads from exactly what the observation
 * page shows — no separate data source. Rendered for every visitor.
 */
export function IdentificationProposalsPanel({
  subjectUri,
  occurrence,
}: {
  subjectUri: string;
  occurrence: ArenaOccurrenceCore;
}) {
  const t = useTranslations("marketplace.labeler.suggestions");
  const proposals = useIdentificationProposals(subjectUri);

  // Nothing to collaborate on yet (or still loading) — stay out of the way.
  if (!proposals?.length) return null;

  const status = problemStatusFromProposals(
    occurrence,
    proposals.map((p) => ({
      did: p.comment.did,
      subjectCid: null,
      scientificName: p.scientificName,
    })),
  );

  return (
    <section className="mt-5 rounded-2xl border border-primary/20 bg-primary/[0.05] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <UsersRoundIcon className="size-4" aria-hidden />
        </span>
        <h2 className="font-semibold text-foreground">{t("title")}</h2>
        <StatusBadge status={status} labels={t} />
      </div>

      <ul className="mt-4 space-y-3">
        {proposals.map(({ comment, scientificName, vernacularName, confidence, remarks }) => (
          <li key={comment.uri} className="rounded-xl border border-border-soft bg-background/90 p-4">
            <div className="flex items-start gap-3">
              <ResolvedAvatar
                did={comment.did}
                avatarRef={comment.authorAvatarRef}
                name={comment.authorName}
                fallbackIcon={<UserIcon className="size-3.5" aria-hidden />}
                className="size-8 shrink-0"
                sizes="32px"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <span className="truncate">{comment.authorName || t("unknownAuthor")}</span>
                    {confidence !== null ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                        {confidence}%
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {comment.createdAt ? formatDate(comment.createdAt) : null}
                  </p>
                </div>
                <p className="mt-1.5 font-semibold italic text-foreground">
                  {scientificName}
                  {vernacularName ? (
                    <span className="font-normal not-italic text-muted-foreground">
                      {" "}
                      · {vernacularName}
                    </span>
                  ) : null}
                </p>
                {remarks ? (
                  <p className="mt-1.5 text-sm leading-6 text-foreground/75">{remarks}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusBadge({
  status,
  labels,
}: {
  status: ReturnType<typeof problemStatusFromProposals>;
  labels: ReturnType<typeof useTranslations>;
}) {
  if (status.state === "open") {
    // Remaining identifiers until convergence is possible. When enough have
    // proposed but they disagree (no 2/3 majority), one more tie-breaking
    // voice is still what's needed — never show "needs 0".
    const remaining = Math.max(1, status.needed - status.identifiers);
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
        {labels("needsMore", { count: remaining })}
      </span>
    );
  }
  return (
    <span
      className={
        status.by === "owner"
          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
          : "rounded-full bg-primary/[0.08] px-2 py-0.5 text-xs font-medium text-primary"
      }
    >
      {status.by === "owner" ? labels("accepted") : labels("agentsAgree")}
    </span>
  );
}
