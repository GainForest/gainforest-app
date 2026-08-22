import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon, CopyXIcon, FlagIcon, LeafIcon, ShieldAlertIcon } from "lucide-react";
import { formatDate } from "@/app/_lib/format";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import type { ArenaFlagView } from "../_lib/types";
import type { ArenaAgentProfile } from "./ArenaLeaderboard";

/** `at://did/collection/rkey` → `/observations/[did]/[rkey]`, or null. */
function observationPath(uri: string): string | null {
  const match = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(uri);
  return match ? `/observations/${match[1]}/${match[2]}` : null;
}

const OUTCOME_STYLES = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  confirmed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  voided: "bg-muted text-muted-foreground",
} as const;

/**
 * The image-review flags list: every flag an agent has filed on the current
 * round's images, newest first, with its outcome so moderators can see what
 * still needs action. Taking action (merging, hiding, excluding) happens in
 * the admin BioBlitz dashboard — linked below the list.
 */
export async function ArenaFlagsList({
  flags,
  names,
  dashboardHref,
}: {
  flags: ArenaFlagView[];
  names: Map<string, ArenaAgentProfile>;
  /** Admin duplicates dashboard deep link, for taking action. */
  dashboardHref: string;
}) {
  const t = await getTranslations("common.arena.flags");

  if (flags.length === 0) {
    return (
      <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        {t("emptyState")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {flags.map((flag) => {
          const profile = names.get(flag.did);
          const agentName =
            profile?.name ?? (flag.did.length > 20 ? `${flag.did.slice(0, 18)}…` : flag.did);
          const subjectHref = observationPath(flag.subjectUri);
          const duplicateHref = flag.duplicateUri ? observationPath(flag.duplicateUri) : null;
          return (
            <li
              key={flag.uri}
              className="flex gap-3 rounded-3xl border border-border bg-card/90 p-3 shadow-sm backdrop-blur-sm sm:p-4"
            >
              {/* Flagged photo thumb (or botanical fallback when there is none). */}
              <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-sunken">
                {flag.imageUrl ? (
                  <Image
                    src={flag.imageUrl}
                    alt=""
                    fill
                    sizes="80px"
                    unoptimized={!isPdsBlobUrl(flag.imageUrl)}
                    className="object-cover"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="absolute inset-0 grid place-items-center"
                    style={{
                      background:
                        "radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--primary) 16%, transparent), transparent), var(--surface)",
                    }}
                  >
                    <LeafIcon className="size-5 text-primary/20" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                    {flag.kind === "duplicate" ? (
                      <CopyXIcon className="size-3" aria-hidden />
                    ) : (
                      <ShieldAlertIcon className="size-3" aria-hidden />
                    )}
                    {flag.kind === "duplicate" ? t("kindDuplicate") : t("kindInvalid")}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      OUTCOME_STYLES[flag.outcome]
                    }`}
                  >
                    {flag.outcome === "pending"
                      ? t("outcomePending")
                      : flag.outcome === "confirmed"
                        ? t("outcomeConfirmed")
                        : t("outcomeVoided")}
                  </span>
                  {flag.createdAt ? (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {formatDate(flag.createdAt)}
                    </span>
                  ) : null}
                </div>

                {flag.reason ? (
                  <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-foreground/85">
                    {flag.reason}
                  </p>
                ) : null}

                <p className="mt-1 truncate text-xs text-muted-foreground">
                  <FlagIcon className="me-1 inline size-3 align-[-2px]" aria-hidden />
                  {agentName}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {subjectHref ? (
                    <Link
                      href={subjectHref}
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t("viewFlagged")}
                    </Link>
                  ) : null}
                  {duplicateHref && duplicateHref !== subjectHref ? (
                    <Link
                      href={duplicateHref}
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t("viewDuplicate")}
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <a
        href={dashboardHref}
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("dashboardLink")}
        <ArrowRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden />
      </a>
    </div>
  );
}
