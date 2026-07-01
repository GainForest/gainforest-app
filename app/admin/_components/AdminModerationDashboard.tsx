"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BotIcon, Building2Icon, FlaskConicalIcon, LeafIcon, SproutIcon, UserRoundIcon } from "lucide-react";
import type { GrantApplicant } from "@/app/_lib/grants";
import type { BioblitzRegistrant } from "@/app/_lib/bioblitz";
import type { FlaggedTestAccount } from "@/app/internal/badges/_lib/test-accounts";
import type { BuiltinEndorser, EndorserRecord } from "@/app/_lib/endorsers";
import { formatRelative } from "@/app/_lib/format";
import { cn } from "@/lib/utils";
import { accountPath } from "@/app/account/_lib/account-route";
import { AdminTestAccountsList } from "./AdminTestAccountsList";
import { AdminTainaPanel, type AdminTainaRow } from "./AdminTainaPanel";
import { EndorsersManager } from "./EndorsersManager";

export type AdminTab = "taina" | "grants" | "bioblitz" | "testAccounts" | "endorsers";

/**
 * The /admin control room: one tab bar, one card-shaped panel per concern
 * (Tainá agents, grant applicants, BioBlitz registrants, flagged test
 * accounts). The active tab is mirrored into the URL (?tab=…) so views are
 * linkable and survive refreshes.
 */
export function AdminModerationDashboard({
  initialTab,
  testAccounts,
  grantApplicants,
  bioblitzRegistrants,
  tainaRows,
  tainaAllowanceUsd,
  builtinEndorsers,
  endorsers,
}: {
  initialTab: AdminTab;
  testAccounts: FlaggedTestAccount[];
  grantApplicants: GrantApplicant[];
  bioblitzRegistrants: BioblitzRegistrant[];
  /** null = the Tainá runtime was unreachable (distinct from an empty roster). */
  tainaRows: AdminTainaRow[] | null;
  tainaAllowanceUsd: number;
  builtinEndorsers: BuiltinEndorser[];
  endorsers: EndorserRecord[];
}) {
  const t = useTranslations("common.adminModeration");
  const tTaina = useTranslations("common.adminTaina");
  const tTest = useTranslations("common.adminTestAccounts");
  const tEndorsers = useTranslations("common.adminEndorsers");
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<AdminTab>(initialTab);

  function selectTab(next: AdminTab) {
    setTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  const tabs: { id: AdminTab; label: string; Icon: typeof SproutIcon; count: number }[] = [
    { id: "taina", label: t("tabs.taina"), Icon: BotIcon, count: tainaRows?.length ?? 0 },
    { id: "grants", label: t("tabs.grants"), Icon: SproutIcon, count: grantApplicants.length },
    { id: "bioblitz", label: t("tabs.bioblitz"), Icon: LeafIcon, count: bioblitzRegistrants.length },
    { id: "testAccounts", label: t("tabs.testAccounts"), Icon: FlaskConicalIcon, count: testAccounts.length },
    { id: "endorsers", label: t("tabs.endorsers"), Icon: Building2Icon, count: builtinEndorsers.length + endorsers.length },
  ];

  return (
    <section>
      <div
        role="tablist"
        aria-label={t("ariaLabel")}
        className="mb-5 flex gap-1.5 overflow-x-auto rounded-full border border-border bg-muted/40 p-1.5"
      >
        {tabs.map((entry) => {
          const active = entry.id === tab;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(entry.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
              )}
            >
              <entry.Icon className="size-4" />
              {entry.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {entry.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "taina" ? (
        <AdminPanel
          Icon={BotIcon}
          title={tTaina("title")}
          description={tTaina("description")}
          count={tainaRows?.length ?? 0}
        >
          <AdminTainaPanel rows={tainaRows} allowanceUsd={tainaAllowanceUsd} />
        </AdminPanel>
      ) : tab === "grants" ? (
        <AdminPanel
          Icon={SproutIcon}
          title={t("grants.title")}
          description={t("grants.description")}
          count={grantApplicants.length}
          footer={t("awardHint")}
        >
          <GrantApplicantsList applicants={grantApplicants} />
        </AdminPanel>
      ) : tab === "bioblitz" ? (
        <AdminPanel
          Icon={LeafIcon}
          title={t("bioblitz.title")}
          description={t("bioblitz.description")}
          count={bioblitzRegistrants.length}
          footer={t("awardHint")}
        >
          <BioblitzRegistrantsList registrants={bioblitzRegistrants} />
        </AdminPanel>
      ) : tab === "testAccounts" ? (
        <AdminPanel
          Icon={FlaskConicalIcon}
          title={tTest("title")}
          description={tTest("description")}
          count={testAccounts.length}
        >
          <AdminTestAccountsList accounts={testAccounts} />
        </AdminPanel>
      ) : (
        <AdminPanel
          Icon={Building2Icon}
          title={tEndorsers("title")}
          description={tEndorsers("description")}
          count={builtinEndorsers.length + endorsers.length}
          footer={tEndorsers("propagationHint")}
        >
          <EndorsersManager builtins={builtinEndorsers} initial={endorsers} />
        </AdminPanel>
      )}
    </section>
  );
}

/** Shared card shell for every admin view: icon + heading + count + body. */
function AdminPanel({
  Icon,
  title,
  description,
  count,
  footer,
  children,
}: {
  Icon: typeof SproutIcon;
  title: string;
  description: string;
  count: number;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-sm">
      <header className="border-b border-border/70 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
            <Icon className="size-4" />
          </span>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        </div>
        <p className="mt-1.5 max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
      {footer ? (
        <p className="border-t border-border/70 px-4 py-3 text-xs text-muted-foreground sm:px-6">{footer}</p>
      ) : null}
    </section>
  );
}

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export function AdminAvatar({ url }: { url: string | null }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
      {url ? (
        <Image src={url} alt="" width={40} height={40} unoptimized className="size-full object-cover" />
      ) : (
        <UserRoundIcon className="size-5 text-muted-foreground" />
      )}
    </span>
  );
}

function GrantApplicantsList({ applicants }: { applicants: GrantApplicant[] }) {
  const t = useTranslations("common.adminModeration");
  if (applicants.length === 0) return <AdminEmptyState>{t("grants.empty")}</AdminEmptyState>;
  return (
    <ul className="divide-y divide-border/70">
      {applicants.map((applicant) => (
        <li key={applicant.did} className="py-3 first:pt-0 last:pb-0">
          <Link
            href={accountPath(applicant.did)}
            className="flex min-w-0 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AdminAvatar url={applicant.avatarUrl} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-baseline gap-2">
                <span className="truncate font-medium text-foreground">{applicant.displayName || t("unnamed")}</span>
                {applicant.createdAt ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(applicant.createdAt)}</span>
                ) : null}
              </span>
              {applicant.applicationText ? (
                <span className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{applicant.applicationText}</span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function BioblitzRegistrantsList({ registrants }: { registrants: BioblitzRegistrant[] }) {
  const t = useTranslations("common.adminModeration");
  if (registrants.length === 0) return <AdminEmptyState>{t("bioblitz.empty")}</AdminEmptyState>;
  return (
    <ul className="divide-y divide-border/70">
      {registrants.map((registrant) => (
        <li key={registrant.did} className="py-3 first:pt-0 last:pb-0">
          <Link
            href={accountPath(registrant.did)}
            className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AdminAvatar url={registrant.avatarUrl} />
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate font-medium text-foreground">{registrant.displayName || t("unnamed")}</span>
              {registrant.createdAt ? (
                <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(registrant.createdAt)}</span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
