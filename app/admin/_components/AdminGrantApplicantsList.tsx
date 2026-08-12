"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { GrantApplicant } from "@/app/_lib/grants";
import { formatRelative } from "@/app/_lib/format";
import { accountPath } from "@/app/account/_lib/account-route";
import { AdminAvatar, AdminEmptyState } from "./AdminPanel";

export function AdminGrantApplicantsList({ applicants }: { applicants: GrantApplicant[] }) {
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
