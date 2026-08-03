"use client";

/**
 * The at-a-glance numbers beside the record stream: how much of each kind of
 * record this account has published. Every row links to the tab that holds the
 * full list.
 *
 * Followers and following deliberately live in the profile header instead, next
 * to the Follow button: they describe the account's audience, not its work, and
 * reading "Followers" as the row after "Projects" made this list look like one
 * undifferentiated pile of numbers.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCompact } from "@/app/_lib/format";
import {
  accountDonationsPath,
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
      className="flex items-baseline justify-between gap-3 py-1 text-sm transition-colors hover:text-foreground"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </Link>
  );
}

export function AccountStatList({ identifier, counts }: { identifier: string; counts: AccountStatCounts }) {
  const t = useTranslations("common.accountTabs");
  const overviewT = useTranslations("common.accountOverview");

  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">{overviewT("atAGlance")}</h2>
      {/* No rules between rows: in the rail a hairline means "new section", so
          ruling every row here made one small list look like three sections. */}
      <nav className="mt-2 space-y-1">
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
      </nav>
    </section>
  );
}
