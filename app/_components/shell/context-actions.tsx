"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
} from "../../_lib/account-switcher";
import { useAddObservations } from "../useAddObservations";

export type ContextLinkProps = {
  sessionDid: string | null;
  className?: string;
  children: React.ReactNode;
};

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
