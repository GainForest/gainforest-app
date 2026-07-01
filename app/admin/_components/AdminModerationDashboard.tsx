"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FlaskConicalIcon, LeafIcon, SproutIcon, UserRoundIcon } from "lucide-react";
import type { GrantApplicant } from "@/app/_lib/grants";
import type { BioblitzRegistrant } from "@/app/_lib/bioblitz";
import type { FlaggedTestAccount } from "@/app/internal/badges/_lib/test-accounts";
import { formatRelative } from "@/app/_lib/format";
import { cn } from "@/lib/utils";
import { accountPath } from "@/app/account/_lib/account-route";
import { AdminTestAccountsList } from "./AdminTestAccountsList";

type Tab = "testAccounts" | "grants" | "bioblitz";

export function AdminModerationDashboard({
  testAccounts,
  grantApplicants,
  bioblitzRegistrants,
}: {
  testAccounts: FlaggedTestAccount[];
  grantApplicants: GrantApplicant[];
  bioblitzRegistrants: BioblitzRegistrant[];
}) {
  const t = useTranslations("common.adminModeration");
  const [tab, setTab] = useState<Tab>("grants");

  const tabs: { id: Tab; label: string; Icon: typeof SproutIcon; count: number }[] = [
    { id: "grants", label: t("tabs.grants"), Icon: SproutIcon, count: grantApplicants.length },
    { id: "bioblitz", label: t("tabs.bioblitz"), Icon: LeafIcon, count: bioblitzRegistrants.length },
    { id: "testAccounts", label: t("tabs.testAccounts"), Icon: FlaskConicalIcon, count: testAccounts.length },
  ];

  return (
    <section className="py-2">
      <div role="tablist" aria-label={t("ariaLabel")} className="mb-6 flex flex-wrap gap-1.5">
        {tabs.map((entry) => {
          const active = entry.id === tab;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <entry.Icon className="size-4" />
              {entry.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-primary-foreground/20" : "bg-background/70",
                )}
              >
                {entry.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "testAccounts" ? (
        <AdminTestAccountsList accounts={testAccounts} />
      ) : tab === "grants" ? (
        <GrantApplicantsPanel applicants={grantApplicants} />
      ) : (
        <BioblitzRegistrantsPanel registrants={bioblitzRegistrants} />
      )}
    </section>
  );
}

function PanelHeader({ Icon, title, description, count }: { Icon: typeof SproutIcon; title: string; description: string; count: number }) {
  return (
    <header className="mb-5">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-muted-foreground" />
        <h1 className="font-instrument text-3xl font-light italic tracking-[-0.04em]">{title}</h1>
        <span className="ml-1 rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium text-muted-foreground">{count}</span>
      </div>
      <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>
    </header>
  );
}

function Avatar({ url }: { url: string | null }) {
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

function GrantApplicantsPanel({ applicants }: { applicants: GrantApplicant[] }) {
  const t = useTranslations("common.adminModeration");
  return (
    <>
      <PanelHeader Icon={SproutIcon} title={t("grants.title")} description={t("grants.description")} count={applicants.length} />
      {applicants.length === 0 ? (
        <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">{t("grants.empty")}</div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {applicants.map((applicant) => (
            <li key={applicant.did} className="bg-card p-3 sm:p-4">
              <Link
                href={accountPath(applicant.did)}
                className="flex min-w-0 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar url={applicant.avatarUrl} />
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
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("awardHint")}</p>
    </>
  );
}

function BioblitzRegistrantsPanel({ registrants }: { registrants: BioblitzRegistrant[] }) {
  const t = useTranslations("common.adminModeration");
  return (
    <>
      <PanelHeader Icon={LeafIcon} title={t("bioblitz.title")} description={t("bioblitz.description")} count={registrants.length} />
      {registrants.length === 0 ? (
        <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">{t("bioblitz.empty")}</div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {registrants.map((registrant) => (
            <li key={registrant.did} className="bg-card p-3 sm:p-4">
              <Link
                href={accountPath(registrant.did)}
                className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar url={registrant.avatarUrl} />
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
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("awardHint")}</p>
    </>
  );
}
