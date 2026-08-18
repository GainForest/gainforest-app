"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { accountPath } from "../_lib/account-route";
import type { AccountOrganization } from "./AccountOrganizationsGrid";

/**
 * "Member of …" row shown in the profile hero, replacing the old Organizations
 * tab. Each organization is a logo + name chip linking to its profile. Renders
 * nothing when the viewer isn't a member of anything (or can't see it — the
 * group service only exposes the signed-in viewer's own memberships).
 */
export function AccountMemberships({
  organizations,
  className,
}: {
  organizations: AccountOrganization[];
  className?: string;
}) {
  const t = useTranslations("common.accountOrganizations");
  if (organizations.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{t("memberOf")}</span>
      {organizations.map((organization) => {
        const initial = organization.displayName.trim().charAt(0).toUpperCase() || "?";
        return (
          <Link
            key={organization.did}
            href={accountPath(organization.identifier)}
            title={organization.displayName}
            className="group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 py-0.5 pl-0.5 pr-2.5 transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <span className="relative size-6 shrink-0 overflow-hidden rounded-full border border-border/50 bg-muted">
              {organization.avatarUrl ? (
                <Image src={organization.avatarUrl} alt="" fill unoptimized className="object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-[10px] font-semibold text-muted-foreground">
                  {initial}
                </span>
              )}
            </span>
            <span className="max-w-[12rem] truncate text-sm font-medium text-foreground/80 transition-colors group-hover:text-foreground">
              {organization.displayName}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
