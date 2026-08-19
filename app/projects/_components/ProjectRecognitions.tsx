import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { RibbonIcon } from "lucide-react";
import { fetchAccountMaEarthRounds } from "@/app/_lib/indexer";
import { fetchRewildingProjectUris } from "@/app/_lib/rewilding-projects";
import { TrustedByBadges } from "@/app/_components/TrustedByBadges";

/**
 * The recognitions a project carries, shown as a pill row on the project page.
 *
 * Three families, from two subjects:
 *   - Rewilding the Web — awarded to the *project record* itself
 *     (`rewilding-projects.ts`). Shown only while the project is an active
 *     grant project.
 *   - Ma Earth funding rounds — awarded to the *owner account*
 *     (`fetchAccountMaEarthRounds`). Same badges the account Overview shows.
 *   - Trusted by (GainForest + admin endorsers) — also the *owner account*,
 *     via the shared `TrustedByBadges` (self-fetching client component). Ma
 *     Earth is deliberately not a "Trusted by" brand, so the two never
 *     overlap.
 *
 * Renders nothing when the project holds no recognitions.
 */
export async function ProjectRecognitions({
  projectUri,
  ownerDid,
}: {
  /** The project's collection URI (`at://…/org.hypercerts.collection/…`). */
  projectUri: string;
  /** The owner account DID — Ma Earth and Trusted-by are keyed to the owner. */
  ownerDid: string;
}) {
  const [t, isRewilding, maEarthRounds] = await Promise.all([
    getTranslations("marketplace.projectPage.rewilding"),
    fetchRewildingProjectUris()
      .then((uris) => uris.includes(projectUri))
      .catch(() => false),
    fetchAccountMaEarthRounds(ownerDid).catch(() => [] as number[]),
  ]);
  const maEarthT = await getTranslations("common.maEarthRounds");

  return (
    <>
      {isRewilding ? (
        <span
          aria-label={t("indicator")}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[12px] font-medium text-primary-dark"
        >
          <RibbonIcon className="h-3.5 w-3.5" aria-hidden />
          {t("label")}
        </span>
      ) : null}
      {maEarthRounds.map((round) => (
        <span
          key={`maearth-${round}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[12px] font-medium text-foreground"
        >
          <Image
            src="/assets/media/images/badges/ma-earth-logo.webp"
            width={16}
            height={16}
            alt=""
            className="h-3.5 w-3.5 object-contain"
          />
          {maEarthT("round", { round })}
        </span>
      ))}
      {/* Owner's GainForest / admin-endorser trust signals. Self-fetching and
          renders nothing when there are none, so it adds no row on its own. */}
      <TrustedByBadges did={ownerDid} variant="compact" />
    </>
  );
}
