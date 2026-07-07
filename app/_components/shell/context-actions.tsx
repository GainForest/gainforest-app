"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2Icon } from "lucide-react";
import { useEffect, useId, useState, type MouseEvent } from "react";
import { ModalContent } from "@/components/ui/modal/modal";
import { ModalPortal, useModal } from "@/components/ui/modal/context";
import {
  groupManageBasePath,
  groupManageTarget,
  manageApiHref,
  manageHref,
  personalManageTarget,
  type ManageTarget,
} from "@/lib/links";
import { PROJECTS_CHANGED_EVENT, notifyProjectsChanged } from "../../_lib/projects-events";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
} from "../../_lib/account-switcher";
import { useAddObservations } from "../useAddObservations";

// Signed-out fallback only: the bare /manage shim resolves to the signed-in
// account (or shows sign-in). Signed-in links target the profile directly via
// the did-based builders below.
const PERSONAL_PROJECT_NEW_HREF = manageHref({ basePath: "/manage" }, "projects", { mode: "new" });

export type ContextLinkProps = {
  sessionDid: string | null;
  className?: string;
  children: React.ReactNode;
};

// The create-project wizard is heavy (framer-motion, the site editor, etc.), so
// it's code-split and only fetched when the popup is actually opened.
const CreateProjectModalLazy = dynamic(
  () =>
    import("@/app/(manage)/manage/projects/_components/ManageProjectsClient").then((mod) => ({
      default: mod.CreateProjectModal,
    })),
  {
    ssr: false,
    loading: () => (
      <ModalContent dismissible={false} className="w-full">
        <div className="flex h-48 items-center justify-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      </ModalContent>
    ),
  },
);

// The sidebar "Create a project" button opens the wizard as a popup over the
// current page instead of routing to /projects first. Signed-out users still
// follow the link (which routes them through sign-in).
export function CreateProjectButton({ sessionDid, className, children }: ContextLinkProps) {
  if (!sessionDid) {
    return (
      <Link href={PERSONAL_PROJECT_NEW_HREF} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <AuthenticatedCreateProjectButton sessionDid={sessionDid} className={className}>
      {children}
    </AuthenticatedCreateProjectButton>
  );
}

function AuthenticatedCreateProjectButton({
  sessionDid,
  className,
  children,
}: {
  sessionDid: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const modal = useModal();
  const { personal, groups } = useAccountList(sessionDid);
  const [activeContext, setActiveContext] = useActiveAccountContext(sessionDid);
  // Unique per instance so several create-project buttons (sidebar card,
  // headers) never portal into each other's modal container.
  const modalId = `create-project-${useId()}`;
  const [wizard, setWizard] = useState<{ target: ManageTarget; projectsHref: string } | null>(null);

  const open = () => {
    let target: ManageTarget;
    if (activeContext.type === "group") {
      const activeGroup = groups.find((group) => group.groupDid === activeContext.did) ?? null;
      const identifier = activeGroup
        ? switcherGroupIdentifier(activeGroup)
        : activeContext.identifier?.trim() || activeContext.did;
      if (activeGroup) {
        setActiveContext({ type: "group", did: activeGroup.groupDid, identifier, role: activeGroup.role });
      }
      target = groupManageTarget({
        did: activeContext.did,
        accountKind: "organization",
        identifier,
        role: activeGroup?.role ?? null,
        displayName: activeGroup?.displayName ?? null,
        avatarUrl: activeGroup?.avatarUrl ?? null,
        currentUserDid: sessionDid,
      });
    } else {
      target = personalManageTarget({
        did: sessionDid,
        accountKind: "user",
        identifier: sessionDid,
        displayName: personal?.displayName ?? null,
        avatarUrl: personal?.avatarUrl ?? null,
      });
    }

    setWizard({
      target,
      projectsHref: manageHref({ basePath: groupManageBasePath(target.identifier) }, "projects"),
    });
    modal.pushModal({ id: modalId, dialogWidth: "max-w-3xl w-[calc(100%-2rem)]", forceDialog: true }, true);
    void modal.show();
  };

  const closeModal = () => {
    void modal.hide().then(() => modal.clear());
  };

  // The wizard's in-modal "Publishing as" switcher re-targets the create flow;
  // keep the post-save redirect pointing at the same account's project list.
  const handleChangeTarget = (nextTarget: ManageTarget) => {
    setWizard({
      target: nextTarget,
      projectsHref: manageHref({ basePath: groupManageBasePath(nextTarget.identifier) }, "projects"),
    });
  };

  // The wizard renders at this call site (via ModalPortal), so it keeps this
  // component's React context instead of being teleported to the root host.
  return (
    <>
      <button type="button" onClick={open} className={className}>
        {children}
      </button>
      <ModalPortal id={modalId}>
        {wizard ? (
          <CreateProjectModalLazy
            target={wizard.target}
            sessionDid={sessionDid}
            onChangeTarget={handleChangeTarget}
            onClose={closeModal}
            onSaved={() => {
              closeModal();
              notifyProjectsChanged();
              router.push(wizard.projectsHref);
            }}
          />
        ) : null}
      </ModalPortal>
    </>
  );
}

// Opens the quick "Add observations" modal over the current page, honoring the
// active account context (the org's repo for a group context, the signed-in
// user otherwise) so new observations land in the right place.
export function AddObservationsButton({
  sessionDid,
  className,
  children,
  dataTaina,
}: {
  sessionDid: string;
  className?: string;
  children: React.ReactNode;
  /** Optional `data-taina` marker so Tainá's guided tours can spotlight it. */
  dataTaina?: string;
}) {
  const { open, modal } = useAddObservations(sessionDid);

  return (
    <>
      <button type="button" onClick={open} className={className} data-taina={dataTaina}>
        {children}
      </button>
      {modal}
    </>
  );
}

export function ManageContextLink({
  sessionDid,
  personalHref,
  personalHrefForDid,
  hrefForGroup,
  className,
  children,
}: ContextLinkProps & {
  personalHref: string;
  personalHrefForDid: (did: string) => string;
  hrefForGroup: (identifier: string) => string;
}) {
  if (!sessionDid) {
    return (
      <Link href={personalHref} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <AuthenticatedManageContextLink
      sessionDid={sessionDid}
      personalHref={personalHrefForDid(sessionDid)}
      hrefForGroup={hrefForGroup}
      className={className}
    >
      {children}
    </AuthenticatedManageContextLink>
  );
}

function AuthenticatedManageContextLink({
  sessionDid,
  personalHref,
  hrefForGroup,
  className,
  children,
}: {
  sessionDid: string;
  personalHref: string;
  hrefForGroup: (identifier: string) => string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { groups } = useAccountList(sessionDid);
  const [activeContext, setActiveContext] = useActiveAccountContext(sessionDid);

  const activeGroup = activeContext.type === "group" ? groups.find((group) => group.groupDid === activeContext.did) ?? null : null;
  // Honor the active account context: an organization context targets that
  // organization's repo, a personal context targets the signed-in user's own
  // account — no organization required.
  const href = activeContext.type === "group"
    ? hrefForGroup(activeGroup ? switcherGroupIdentifier(activeGroup) : activeContext.identifier?.trim() || activeContext.did)
    : personalHref;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    // Personal context: let the Link navigate to the personal route without any
    // organization detour.
    if (activeContext.type !== "group") return;

    event.preventDefault();
    const identifier = activeGroup ? switcherGroupIdentifier(activeGroup) : activeContext.identifier?.trim() || activeContext.did;
    if (activeGroup) {
      setActiveContext({ type: "group", did: activeGroup.groupDid, identifier, role: activeGroup.role });
    }
    router.push(hrefForGroup(identifier));
  };

  return (
    <Link href={href} onClick={handleClick} className={className}>
      {children}
    </Link>
  );
}

// Once the active account (the signed-in user or the selected organization)
// already has at least one project, the sidebar "Create a project" card is
// redundant — the Projects nav item and the in-page "Add" button cover further
// creation — so we hide it. Until the check resolves we keep showing the card
// so a first-time account never loses its obvious path to a first project.
export function useActiveContextHasProjects(sessionDid: string): boolean {
  const [activeContext] = useActiveAccountContext(sessionDid);
  const [hasProjects, setHasProjects] = useState(false);

  const contextKind = activeContext.type === "group" ? "group" : "personal";
  const contextDid = activeContext.did;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const href = manageApiHref("/api/manage/projects", { kind: contextKind, did: contextDid });
      void fetch(href, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!cancelled) setHasProjects(Array.isArray(data) && data.length > 0);
        })
        .catch(() => {
          if (!cancelled) setHasProjects(false);
        });
    };

    // Re-show while we recheck a freshly selected account context.
    setHasProjects(false);
    load();
    window.addEventListener(PROJECTS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PROJECTS_CHANGED_EVENT, load);
    };
  }, [contextKind, contextDid]);

  return hasProjects;
}
