"use client";

/**
 * The at-a-glance numbers beside the record stream: what this account has
 * published, and who follows it. Every row links to the tab that holds the
 * full list. Follower counts come from the live follow state (shared with the
 * Follow button in the header), so following someone updates the row instantly.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCompact } from "@/app/_lib/format";
import { useFollowState } from "@/app/_components/FollowButton";
import {
  accountDonationsPath,
  accountFollowersPath,
  accountFollowingPath,
  accountObservationsPath,
  accountProjectsPath,
} from "../_lib/account-route";

export type AccountStatCounts = {
  projects: number;
  observations: number;
  /** Personal profiles only: how many donations this person has made. */
  donations: number | null;
};

function StatRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2.5 text-sm transition-colors hover:text-foreground"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </Link>
  );
}

export function AccountStatList({
  did,
  identifier,
  counts,
}: {
  did: string;
  identifier: string;
  counts: AccountStatCounts;
}) {
  const t = useTranslations("common.accountTabs");
  const followT = useTranslations("common.follow");
  const follow = useFollowState(did);

  return (
    <nav className="border-t border-border/60">
      <StatRow
        label={t("observations")}
        value={formatCompact(counts.observations)}
        href={accountObservationsPath(identifier)}
      />
      <StatRow label={t("projects")} value={formatCompact(counts.projects)} href={accountProjectsPath(identifier)} />
      {counts.donations !== null ? (
        <StatRow
          label={t("donations")}
          value={formatCompact(counts.donations)}
          href={accountDonationsPath(identifier)}
        />
      ) : null}
      <StatRow
        label={followT("followersTab")}
        value={formatCompact(follow.followers)}
        href={accountFollowersPath(identifier)}
      />
      <StatRow
        label={followT("followingTab")}
        value={formatCompact(follow.following)}
        href={accountFollowingPath(identifier)}
      />
    </nav>
  );
}
