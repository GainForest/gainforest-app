"use client";

import { motion } from "framer-motion";
import { BadgeIcon } from "lucide-react";
import Link from "next/link";
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

function objectivesFor(bumicert: BumicertRecord): string[] {
  return [
    bumicert.locationCount > 0 ? "Certified site" : null,
    bumicert.contributorCount > 0 ? "Contributors" : null,
  ].filter((value): value is string => Boolean(value));
}

export function AccountBumicertsGrid({ bumicerts, organizationIdentifier, organizationName, logoUrl }: OrgBumicertsGridProps) {
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
          <BadgeIcon className="h-4 w-4 text-primary" />
          <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-medium">
            No public Bumicerts
          </span>
        </div>
        <p
          className="text-lg text-foreground/60 max-w-sm"
          style={{
            fontFamily: "var(--font-instrument-serif-var)",
            fontStyle: "italic",
          }}
        >
          This account has not published any public Bumicerts yet.
        </p>
      </div>
    );
  }

  return (
    <section className="py-6">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-stretch gap-5"
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
    </section>
  );
}
