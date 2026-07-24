"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import BumicertIcon from "@/icons/BumicertIcon";
import Link from "next/link";
import { useState } from "react";
import {
  BumicertCardVisual,
  cardVariants,
} from "@/components/bumicert/BumicertCard";
import type { BumicertRecord } from "../../_lib/indexer";
import { localBumicertHref } from "../../_lib/urls";
import { ManageCollectionViewToggle } from "@/app/(manage)/manage/projects/_components/ManageCollectionPrimitives";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

interface OrgBumicertsGridProps {
  bumicerts: BumicertRecord[];
  organizationIdentifier: string;
  organizationName: string;
  logoUrl: string | null;
}

type ViewMode = "cards" | "list";

function objectivesFor(
  bumicert: BumicertRecord,
  t: ReturnType<typeof useTranslations>,
): string[] {
  return [
    bumicert.locationCount > 0 ? t("projectPlaces", { count: bumicert.locationCount }) : null,
    bumicert.contributorCount > 0 ? t("peopleNamed", { count: bumicert.contributorCount }) : null,
  ].filter((value): value is string => Boolean(value));
}

export function AccountBumicertsGrid({ bumicerts, organizationIdentifier, organizationName, logoUrl }: OrgBumicertsGridProps) {
  const [view, setView] = useState<ViewMode>("cards");
  const t = useTranslations("marketplace.recordExplorer.card");
  const viewT = useTranslations("marketplace.projects.view");
  const emptyT = useTranslations("marketplace.manageProjectCerts.empty");
  const reduceMotion = useReducedMotion();

  if (bumicerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BumicertIcon className="mb-4 size-9 text-primary" aria-hidden />
        <h2 className="font-instrument text-2xl italic text-foreground">{emptyT("noCertsTitle")}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{emptyT("noCertsDescription")}</p>
      </div>
    );
  }

  return (
    <section className="py-6">
      <div className="mb-4 flex justify-end">
        <ManageCollectionViewToggle
          value={view}
          onChange={setView}
          cardsLabel={viewT("cards")}
          listLabel={viewT("list")}
          compact
        />
      </div>
      {view === "list" ? (
        <motion.ul variants={reduceMotion ? undefined : containerVariants} initial={reduceMotion ? false : "hidden"} animate={reduceMotion ? undefined : "visible"} role="list">
          {bumicerts.map((b) => (
            <motion.li key={b.id} variants={reduceMotion ? undefined : cardVariants} className="relative after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden">
              <AccountBumicertListItem bumicert={b} organizationIdentifier={organizationIdentifier} organizationName={organizationName} />
            </motion.li>
          ))}
        </motion.ul>
      ) : (
        <motion.div
          variants={reduceMotion ? undefined : containerVariants}
          initial={reduceMotion ? false : "hidden"}
          animate={reduceMotion ? undefined : "visible"}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 items-stretch gap-5"
        >
          {bumicerts.map((b) => (
            <motion.div key={b.id} variants={reduceMotion ? undefined : cardVariants} className="h-full">
              <Link href={localBumicertHref(organizationIdentifier, b.rkey)} className="block h-full">
                <BumicertCardVisual
                  className="h-full"
                  coverImage={b.imageUrl}
                  logoUrl={logoUrl}
                  logoRef={b.creatorAvatarRef}
                  ownerDid={b.did}
                  title={b.title}
                  organizationName={organizationName}
                  objectives={objectivesFor(b, t)}
                  description={b.shortDescription ?? undefined}
                />
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}

function AccountBumicertListItem({ bumicert, organizationIdentifier, organizationName }: { bumicert: BumicertRecord; organizationIdentifier: string; organizationName: string }) {
  const [imgError, setImgError] = useState(false);
  const t = useTranslations("marketplace.recordExplorer.card");
  const actionT = useTranslations("marketplace.recordDrawer.actions");
  const hasImage = Boolean(bumicert.imageUrl) && !imgError;
  const details = objectivesFor(bumicert, t);

  return (
    <Link href={localBumicertHref(organizationIdentifier, bumicert.rkey)} className="group flex w-full gap-3 rounded-2xl px-1 py-3 outline-none transition-colors duration-300 hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-primary/60 sm:gap-4 sm:px-2 sm:py-4">
      <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-36">
        {hasImage ? (
          <Image src={bumicert.imageUrl!} alt={bumicert.title} fill unoptimized sizes="144px" onError={() => setImgError(true)} className="object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100" />
        ) : (
          <span className="grid h-full place-items-center text-sm text-muted-foreground">{t("noCover")}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <span className="min-w-0">
          <span className="block truncate font-instrument text-2xl italic leading-tight text-foreground">{bumicert.title}</span>
          {bumicert.shortDescription ? <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{bumicert.shortDescription}</span> : null}
        </span>
        <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{details.length > 0 ? details.join(" · ") : organizationName}</span>
          <span className="shrink-0 text-xs font-medium text-foreground transition-colors group-hover:text-primary">{actionT("view")}</span>
        </span>
      </span>
    </Link>
  );
}
