"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import BumicertIcon from "@/icons/BumicertIcon";
import Link from "next/link";
import { useState } from "react";
import {
  BumicertCardVisual,
  cardVariants,
} from "@/components/bumicert/BumicertCard";
import type { BumicertRecord } from "../../_lib/indexer";
import { localBumicertHref } from "../../_lib/urls";

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

function objectivesFor(bumicert: BumicertRecord): string[] {
  return [
    bumicert.locationCount > 0 ? "Project place" : null,
    bumicert.contributorCount > 0 ? "People named" : null,
  ].filter((value): value is string => Boolean(value));
}

export function AccountBumicertsGrid({ bumicerts, organizationIdentifier, organizationName, logoUrl }: OrgBumicertsGridProps) {
  const [view, setView] = useState<ViewMode>("cards");

  if (bumicerts.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center">
        <span
          className="text-7xl font-light text-primary/[0.12] tracking-tight mb-4 block"
          style={{ fontFamily: "var(--font-garamond-var)" }}
        >
          0
        </span>
        <div className="flex items-center gap-2 mb-3">
          <BumicertIcon className="h-4 w-4 text-primary" />
          <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-medium">
            No public Certs
          </span>
        </div>
        <p
          className="text-lg text-foreground/60 max-w-sm"
          style={{
            fontFamily: "var(--font-instrument-serif-var)",
            fontStyle: "italic",
          }}
        >
          This account has not published any public Certs yet.
        </p>
      </div>
    );
  }

  return (
    <section className="py-6">
      <div className="mb-4 flex justify-end">
        <ViewToggle view={view} setView={setView} />
      </div>
      {view === "list" ? (
        <motion.ul variants={containerVariants} initial="hidden" animate="visible" role="list">
          {bumicerts.map((b) => (
            <motion.li key={b.id} variants={cardVariants} className="relative after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden">
              <AccountBumicertListItem bumicert={b} organizationIdentifier={organizationIdentifier} organizationName={organizationName} />
            </motion.li>
          ))}
        </motion.ul>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 items-stretch gap-5"
        >
          {bumicerts.map((b) => (
            <motion.div key={b.id} variants={cardVariants} className="h-full">
              <Link href={localBumicertHref(organizationIdentifier, b.rkey)} className="block h-full">
                <BumicertCardVisual
                  className="h-full"
                  coverImage={b.imageUrl}
                  logoUrl={logoUrl}
                  logoRef={b.creatorAvatarRef}
                  ownerDid={b.did}
                  title={b.title}
                  organizationName={organizationName}
                  objectives={objectivesFor(b)}
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

function ViewToggle({ view, setView }: { view: ViewMode; setView: (view: ViewMode) => void }) {
  return (
    <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/70 p-0.5 backdrop-blur">
      {([
        { id: "cards", label: "Cards", Icon: LayoutGridIcon },
        { id: "list", label: "List", Icon: ListIcon },
      ] as const).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          aria-label={label}
          title={label}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full p-0 text-sm font-medium transition-colors sm:w-auto sm:gap-1.5 sm:px-3 ${
            view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function AccountBumicertListItem({ bumicert, organizationIdentifier, organizationName }: { bumicert: BumicertRecord; organizationIdentifier: string; organizationName: string }) {
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(bumicert.imageUrl) && !imgError;
  const details = objectivesFor(bumicert);

  return (
    <Link href={localBumicertHref(organizationIdentifier, bumicert.rkey)} className="group flex w-full gap-3 rounded-2xl px-1 py-3 outline-none transition-colors duration-300 hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-primary/60 sm:gap-4 sm:px-2 sm:py-4">
      <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-36">
        {hasImage ? (
          <Image src={bumicert.imageUrl!} alt={bumicert.title} fill unoptimized sizes="144px" onError={() => setImgError(true)} className="object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <span className="grid h-full place-items-center font-garamond text-sm italic text-muted-foreground">No cover image</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
        <span className="min-w-0">
          <span className="block truncate font-instrument text-2xl italic leading-tight text-foreground">{bumicert.title}</span>
          {bumicert.shortDescription ? <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{bumicert.shortDescription}</span> : null}
        </span>
        <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{details.length > 0 ? details.join(" · ") : organizationName}</span>
          <span className="shrink-0 text-xs font-medium text-foreground transition-colors group-hover:text-primary">Open</span>
        </span>
      </span>
    </Link>
  );
}
