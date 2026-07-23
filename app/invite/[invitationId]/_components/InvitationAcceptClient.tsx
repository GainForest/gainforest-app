"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildLoginUrl } from "@/app/_lib/auth-client";
import type { AuthSession } from "@/app/_lib/auth";
import type { GroupInvitation } from "@/app/_lib/cgs-invitations";
import { InviteScene, type InviteOrg } from "./InviteScene";
import { requestInvitationAcceptance } from "./invitation-acceptance";

type AcceptStatus = "idle" | "accepting" | "accepted" | "error";

export function InvitationAcceptClient({
  invitation,
  session,
}: {
  invitation: GroupInvitation;
  session: AuthSession;
}) {
  const t = useTranslations("common.groupInvitations.invitePage");
  const membersT = useTranslations("common.groupInvitations.members");
  const menuT = useTranslations("common.groupInvitations.menu");
  const [status, setStatus] = useState<AcceptStatus>("idle");
  const manageHref = useMemo(() => `/manage/groups/${encodeURIComponent(invitation.groupHandle || invitation.repo)}`, [invitation.groupHandle, invitation.repo]);
  const organizationName = invitation.groupName || invitation.groupHandle || t("organizationFallback");
  const invitedRole = membersT(invitation.role === "admin" ? "roleAdmin" : "roleMember");
  const roleLabel = menuT("role", { role: invitedRole });
  const org: InviteOrg = {
    name: organizationName,
    handle: invitation.groupHandle,
    did: invitation.repo,
  };

  async function accept() {
    if (!session.isLoggedIn || status === "accepting") return;
    setStatus("accepting");
    try {
      const result = await requestInvitationAcceptance(invitation.id);
      setStatus(result.ok ? "accepted" : "error");
    } catch {
      setStatus("error");
    }
  }

  const signIn = () => {
    window.location.href = buildLoginUrl({ email: invitation.email });
  };

  if (!session.isLoggedIn) {
    return (
      <InviteScene
        tone="neutral"
        icon={<ArrowRightIcon className="size-7" />}
        title={t("signedOutTitle")}
        description={t("signedOutDescription", { organization: organizationName })}
        org={org}
        roleLabel={roleLabel}
      >
        <Button type="button" onClick={signIn} className="w-full shadow-none sm:w-auto">
          {t("signIn")}
          <ArrowRightIcon />
        </Button>
      </InviteScene>
    );
  }

  if (status === "accepted") {
    return (
      <InviteScene
        tone="success"
        icon={<CheckIcon className="size-7" />}
        title={t("acceptedTitle")}
        description={t("acceptedDescription", { organization: organizationName })}
        org={org}
      >
        <Button asChild className="w-full shadow-none sm:w-auto">
          <Link href={manageHref}>{t("goToOrganization")}</Link>
        </Button>
      </InviteScene>
    );
  }

  if (status === "error") {
    return (
      <InviteScene
        tone="danger"
        icon={<XIcon className="size-7" />}
        title={t("errorTitle")}
        description={t("acceptError")}
        org={org}
        roleLabel={roleLabel}
      >
        <Button type="button" onClick={() => void accept()} className="w-full shadow-none sm:w-auto">
          {t("tryAgain")}
        </Button>
      </InviteScene>
    );
  }

  if (status === "accepting") {
    return (
      <InviteScene
        tone="neutral"
        icon={<Loader2Icon className="size-7 animate-spin motion-reduce:animate-none" />}
        title={t("acceptingTitle")}
        description={t("acceptingDescription", { organization: organizationName })}
        org={org}
        roleLabel={roleLabel}
      />
    );
  }

  return (
    <InviteScene
      tone="neutral"
      icon={<ArrowRightIcon className="size-7" />}
      title={t("pendingTitle")}
      description={t("pendingDescription", { organization: organizationName })}
      org={org}
      roleLabel={roleLabel}
    >
      <Button type="button" onClick={() => void accept()} className="w-full shadow-none sm:w-auto">
        {t("accept")}
        <ArrowRightIcon />
      </Button>
    </InviteScene>
  );
}
