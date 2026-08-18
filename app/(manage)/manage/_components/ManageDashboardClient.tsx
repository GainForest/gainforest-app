"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { ManageAccountSetup } from "./ManageAccountSetup";
import {
  parseManageMode,
  resolveDashboardMode,
  shouldClearDashboardMode,
  type ManageMode,
} from "./manageDashboardMode";
import Container from "@/components/ui/container";
import { EditableAccountHeader } from "./EditableAccountHeader";
import { GroupMembers } from "../groups/_components/GroupMembers";
import { ManageGroupsClient } from "../groups/_components/ManageGroupsClient";
import type { CgsRole } from "../_lib/cgs";

const SECTION_EASE = [0.25, 0.1, 0.25, 1] as const;

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function publicAccountHref(identifier: string): string {
  return `/account/${encodeURIComponent(identifier)}`;
}

function DashboardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: SECTION_EASE }}
      className="space-y-4"
    >
      <h2 className="font-instrument text-2xl italic leading-none text-foreground">{title}</h2>
      {children}
    </motion.section>
  );
}

export function ManageDashboardClient({
  account,
  mode,
  basePath = "/manage",
  writeRepoDid,
  groupRole,
  currentUserDid,
  recoveryEmail,
  children,
}: {
  account: AccountRouteData;
  mode?: ManageMode | null;
  basePath?: string;
  writeRepoDid?: string;
  /** When scoped into an organization, the current user's role — enables the members list. */
  groupRole?: CgsRole;
  currentUserDid?: string | null;
  recoveryEmail?: string | null;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/manage";
  const canonicalPathname = stripLocaleFromPathname(pathname);
  const searchParams = useSearchParams();
  const navT = useTranslations("common.sidebar.items");
  const rawMode = mode === undefined ? searchParams.get("mode") ?? undefined : mode ?? undefined;
  const parsedMode = mode === undefined ? parseManageMode(rawMode) : mode;
  const hasCompletedSetup = account.summary.hasCertifiedProfile || account.summary.hasCertifiedOrg;
  const resolvedMode = hasCompletedSetup
    ? resolveDashboardMode({ currentKind: account.kind, mode: parsedMode })
    : parsedMode ?? "onboard-user";
  const isAccountManageRoute = canonicalPathname === basePath || decodePath(canonicalPathname) === decodePath(basePath);

  useEffect(() => {
    if (!isAccountManageRoute || mode !== undefined) return;
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (!hasCompletedSetup) {
      if (rawMode === "onboard-user") return;
      nextSearchParams.set("mode", "onboard-user");
      router.replace(`${pathname}?${nextSearchParams.toString()}`);
      return;
    }

    if (!shouldClearDashboardMode({ currentKind: account.kind, rawMode })) return;
    nextSearchParams.delete("mode");
    const query = nextSearchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [account.kind, hasCompletedSetup, isAccountManageRoute, mode, pathname, rawMode, router, searchParams]);

  const isOnboarding = resolvedMode === "onboard-user" || resolvedMode === "onboard-org" || !hasCompletedSetup;

  if (!isAccountManageRoute) {
    return <>{children}</>;
  }

  if (isOnboarding) {
    return (
      <Container className="pt-4 pb-8">
        <ManageAccountSetup did={account.did} mode={resolvedMode} recoveryEmail={recoveryEmail} />
      </Container>
    );
  }

  return (
    <Container className="space-y-6 pt-4 pb-12">
      <EditableAccountHeader
        account={account}
        writeRepoDid={writeRepoDid}
        groupRole={groupRole}
        settingsHref={`${basePath}/settings`}
        viewPublicHref={publicAccountHref(account.urlIdentifier)}
      />
      {account.kind === "organization" ? (
        <>
          {children}
          {writeRepoDid && groupRole ? (
            <GroupMembers
              groupDid={writeRepoDid}
              currentRole={groupRole}
              currentUserDid={currentUserDid}
              variant="section"
              showDataCouncil
            />
          ) : null}
        </>
      ) : (
        <>
          <DashboardSection title={navT("myProjects")}>{children}</DashboardSection>
          <DashboardSection title={navT("myOrganizations")}>
            <ManageGroupsClient sessionDid={account.did} />
          </DashboardSection>
        </>
      )}
    </Container>
  );
}
