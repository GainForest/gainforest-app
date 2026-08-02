"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BinocularsIcon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  LeafIcon,
  LibraryIcon,
  UploadIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { groupManageBasePath, manageApiHref, manageHref, type ManageSectionId } from "@/lib/links";
import { PROJECTS_CHANGED_EVENT } from "../../_lib/projects-events";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
} from "../../_lib/account-switcher";
import { AddObservationsButton, ManageContextLink } from "./context-actions";
import { useCanonicalPathname } from "./paths";
import { SidebarTooltip, useSidebarCollapsed } from "./sidebar-context";

/**
 * Capability groups for the sidebar, following the "commons + capability
 * groups" navigation model: "The commons" is permanent for everyone, while
 * "Your work" and "Your funding" appear only when the account actually has
 * that capability. Both groups stack for someone who is both — there is never
 * a role switcher — and an account with neither gets a small "Get started"
 * offer instead of empty sections.
 */

export type AccountCapabilities = {
  /** The active account context (user or org) owns projects or observations. */
  hasWork: boolean;
  /** The signed-in user has made at least one donation. */
  hasFunding: boolean;
  /** Both checks have resolved at least once for the current context. */
  ready: boolean;
};

export function useAccountCapabilities(sessionDid: string | null): AccountCapabilities {
  const [activeContext] = useActiveAccountContext(sessionDid ?? "");
  const contextKind = activeContext.type === "group" ? ("group" as const) : ("personal" as const);
  const contextDid = activeContext.type === "group" ? activeContext.did : sessionDid;

  const [work, setWork] = useState<{ resolved: boolean; hasWork: boolean }>({ resolved: false, hasWork: false });
  const [funding, setFunding] = useState<{ resolved: boolean; hasFunding: boolean }>({
    resolved: false,
    hasFunding: false,
  });

  // "Your work" follows the active account context (personal or organization):
  // any owned project or published observation counts as work.
  useEffect(() => {
    if (!sessionDid || !contextDid) {
      setWork({ resolved: true, hasWork: false });
      return;
    }

    let cancelled = false;
    const load = async () => {
      const [projects, summary] = await Promise.all([
        fetch(manageApiHref("/api/manage/projects", { kind: contextKind, did: contextDid }), { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
        fetch(`/api/account/summary?did=${encodeURIComponent(contextDid)}`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);
      if (cancelled) return;
      const projectCount = Array.isArray(projects) ? projects.length : 0;
      const observationCount = typeof summary?.observationCount === "number" ? summary.observationCount : 0;
      const bumicertCount = typeof summary?.bumicertCount === "number" ? summary.bumicertCount : 0;
      setWork({ resolved: true, hasWork: projectCount + observationCount + bumicertCount > 0 });
    };

    setWork({ resolved: false, hasWork: false });
    void load();
    const reload = () => void load();
    window.addEventListener(PROJECTS_CHANGED_EVENT, reload);
    return () => {
      cancelled = true;
      window.removeEventListener(PROJECTS_CHANGED_EVENT, reload);
    };
  }, [sessionDid, contextKind, contextDid]);

  // "Your funding" is personal — donations always belong to the signed-in
  // user, regardless of which organization context is active.
  useEffect(() => {
    if (!sessionDid) {
      setFunding({ resolved: true, hasFunding: false });
      return;
    }

    let cancelled = false;
    setFunding({ resolved: false, hasFunding: false });
    void fetch("/api/account/capabilities")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        const donationCount = typeof data?.donationCount === "number" ? data.donationCount : 0;
        setFunding({ resolved: true, hasFunding: donationCount > 0 });
      })
      .catch(() => {
        if (!cancelled) setFunding({ resolved: true, hasFunding: false });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionDid]);

  return {
    hasWork: work.hasWork,
    hasFunding: funding.hasFunding,
    ready: work.resolved && funding.resolved,
  };
}

function capabilityRowClassName(collapsed: boolean, isActive: boolean): string {
  return cn(
    buttonVariants({ variant: isActive ? "default" : "ghost" }),
    "relative h-8 w-full",
    collapsed ? "justify-center px-0" : "justify-start gap-2.5 px-2.5",
    !isActive && "text-muted-foreground hover:text-primary",
  );
}

function CapabilitySectionLabel({ children }: { children: React.ReactNode }) {
  const collapsed = useSidebarCollapsed();
  if (collapsed) {
    return <div aria-hidden className="mx-auto my-1 h-px w-6 rounded-full bg-border" />;
  }
  return (
    <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
}

/** The account tab paths the manage sections resolve to (see lib/links.ts). */
const SECTION_TAB_PATHS: Partial<Record<ManageSectionId, string>> = {
  observations: "observations",
  projects: "projects",
  bumicerts: "certs",
};

/**
 * Active when the pathname is the active account's own tab for this section
 * (`/account/<identifier>/<tab>`), matched against every identifier the
 * account is reachable under (handle, DID, org identifier) so browsing someone
 * else's tabs never lights up the personal rows.
 */
function useIsOwnSectionActive(sessionDid: string, sessionHandle: string | null, tabPath: string | undefined): boolean {
  const pathname = useCanonicalPathname();
  const { personal, groups } = useAccountList(sessionDid);
  const [activeContext] = useActiveAccountContext(sessionDid);

  if (!tabPath) return false;
  const activeGroup = activeContext.type === "group"
    ? groups.find((group) => group.groupDid === activeContext.did) ?? null
    : null;
  const identifiers = activeContext.type === "group"
    ? [activeContext.did, activeContext.identifier, activeGroup ? switcherGroupIdentifier(activeGroup) : null]
    : [sessionDid, sessionHandle, personal?.handle];

  return identifiers.some((identifier) => {
    const id = identifier?.trim();
    if (!id) return false;
    for (const candidate of [id, encodeURIComponent(id)]) {
      const base = `/account/${candidate}/${tabPath}`;
      if (pathname === base || pathname.startsWith(`${base}/`)) return true;
    }
    return false;
  });
}

function ManageCapabilityRow({
  sessionDid,
  sessionHandle,
  section,
  label,
  Icon,
}: {
  sessionDid: string;
  sessionHandle: string | null;
  section: ManageSectionId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const collapsed = useSidebarCollapsed();
  const isActive = useIsOwnSectionActive(sessionDid, sessionHandle, SECTION_TAB_PATHS[section]);

  return (
    <li>
      <SidebarTooltip label={label}>
        <ManageContextLink
          sessionDid={sessionDid}
          personalHref={manageHref({ basePath: "/manage" }, section)}
          personalHrefForDid={(did) => manageHref({ basePath: groupManageBasePath(did) }, section)}
          hrefForGroup={(identifier) => manageHref({ basePath: groupManageBasePath(identifier) }, section)}
          className={capabilityRowClassName(collapsed, isActive)}
        >
          <span className="flex size-6 shrink-0 items-center justify-center">
            <Icon className="h-4 w-4 shrink-0" />
          </span>
          {collapsed ? null : <span className="flex-1 text-left">{label}</span>}
        </ManageContextLink>
      </SidebarTooltip>
    </li>
  );
}

/** "Your work" — context-aware manage links plus the primary Upload action. */
export function WorkNavSection({
  sessionDid,
  sessionHandle = null,
}: {
  sessionDid: string;
  sessionHandle?: string | null;
}) {
  const t = useTranslations("common.sidebar");
  const collapsed = useSidebarCollapsed();

  return (
    <div className="flex flex-col gap-0.5">
      <CapabilitySectionLabel>{t("sections.work")}</CapabilitySectionLabel>
      <ul className="flex flex-col gap-0.5">
        <ManageCapabilityRow sessionDid={sessionDid} sessionHandle={sessionHandle} section="observations" label={t("items.library")} Icon={LibraryIcon} />
        <ManageCapabilityRow sessionDid={sessionDid} sessionHandle={sessionHandle} section="projects" label={t("items.projects")} Icon={FolderKanbanIcon} />
        <ManageCapabilityRow sessionDid={sessionDid} sessionHandle={sessionHandle} section="bumicerts" label={t("items.bumicerts")} Icon={LeafIcon} />
      </ul>
      <SidebarTooltip label={t("headerActions.upload")}>
        <span className={cn("mt-1 flex", collapsed && "mx-auto w-fit")}>
          <AddObservationsButton
            sessionDid={sessionDid}
            dataTaina="add-observations"
            className={cn(
              buttonVariants({ variant: "default", size: collapsed ? "icon" : "sm" }),
              !collapsed && "w-full flex-1",
            )}
          >
            <UploadIcon className="size-4" />
            {collapsed ? <span className="sr-only">{t("headerActions.upload")}</span> : t("headerActions.upload")}
          </AddObservationsButton>
        </span>
      </SidebarTooltip>
    </div>
  );
}

/** "Your funding" — the personal funding record; only shown once it exists. */
export function FundingNavSection({
  sessionDid,
  sessionHandle = null,
}: {
  sessionDid: string;
  sessionHandle?: string | null;
}) {
  const t = useTranslations("common.sidebar");
  const collapsed = useSidebarCollapsed();
  const pathname = useCanonicalPathname();
  const { personal } = useAccountList(sessionDid);
  const identifier = personal?.handle?.trim() || sessionHandle?.trim() || sessionDid;
  const href = `/account/${encodeURIComponent(identifier)}/donations`;
  const isActive = [sessionDid, sessionHandle, personal?.handle].some((candidate) => {
    const id = candidate?.trim();
    if (!id) return false;
    return pathname === `/account/${id}/donations` || pathname === `/account/${encodeURIComponent(id)}/donations`;
  });

  return (
    <div className="flex flex-col gap-0.5">
      <CapabilitySectionLabel>{t("sections.yourFunding")}</CapabilitySectionLabel>
      <ul className="flex flex-col gap-0.5">
        <li>
          <SidebarTooltip label={t("items.portfolio")}>
            <Link
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={capabilityRowClassName(collapsed, isActive)}
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                <HeartHandshakeIcon className="h-4 w-4 shrink-0" />
              </span>
              {collapsed ? null : <span className="flex-1 text-left">{t("items.portfolio")}</span>}
            </Link>
          </SidebarTooltip>
        </li>
      </ul>
    </div>
  );
}

/**
 * Shown instead of empty capability groups: a signed-in account with no work
 * and no funding yet gets both paths offered, not blank sections.
 */
export function GetStartedCard({ sessionDid }: { sessionDid: string }) {
  const t = useTranslations("common.sidebar.getStarted");
  const collapsed = useSidebarCollapsed();

  if (collapsed) {
    return (
      <SidebarTooltip label={t("startUploading")}>
        <span className="mx-auto flex w-fit">
          <AddObservationsButton
            sessionDid={sessionDid}
            dataTaina="add-observations"
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "bg-background hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <BinocularsIcon />
            <span className="sr-only">{t("startUploading")}</span>
          </AddObservationsButton>
        </span>
      </SidebarTooltip>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("title")}</p>
      <p className="text-xs text-muted-foreground">{t("description")}</p>
      <AddObservationsButton
        sessionDid={sessionDid}
        dataTaina="add-observations"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full bg-background hover:bg-primary hover:text-primary-foreground",
        )}
      >
        <UploadIcon className="size-4" /> {t("startUploading")}
      </AddObservationsButton>
      <Link
        href="/projects"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-full bg-background hover:bg-primary hover:text-primary-foreground",
        )}
      >
        <HeartHandshakeIcon className="size-4" /> {t("fundProject")}
      </Link>
    </div>
  );
}
