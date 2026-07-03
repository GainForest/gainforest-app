"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { EndorsedOrganization } from "../../_lib/endorsements-given";
import { accountPath } from "../_lib/account-route";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export function EndorsementsGivenGrid({ organizations }: { organizations: EndorsedOrganization[] }) {
  const t = useTranslations("common.accountEndorsementsGiven");

  if (organizations.length === 0) {
    return (
      <p className="mt-4 rounded-2xl bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">{t("empty")}</p>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-stretch gap-4"
    >
      {organizations.map((organization) => (
        <motion.div key={organization.did} variants={cardVariants} className="h-full">
          <EndorsedCard organization={organization} fallbackName={t("fallbackName")} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function EndorsedCard({
  organization,
  fallbackName,
}: {
  organization: EndorsedOrganization;
  fallbackName: string;
}) {
  const [imgError, setImgError] = useState(false);
  const name = organization.displayName?.trim() || fallbackName;
  const hasImage = Boolean(organization.avatarUrl) && !imgError;
  const initial = name.charAt(0).toUpperCase() || "?";

  return (
    <Link
      href={accountPath(organization.did)}
      className="group flex h-full w-full items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
    >
      <span className="relative size-12 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted">
        {hasImage ? (
          <Image
            src={organization.avatarUrl!}
            alt=""
            fill
            unoptimized
            onError={() => setImgError(true)}
            className="object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-base font-bold text-muted-foreground">
            {initial}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-instrument text-xl italic leading-tight text-foreground">
          {name}
        </span>
      </span>
    </Link>
  );
}
