"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildLoginUrl } from "@/app/_lib/auth-client";
import type { AuthSession } from "@/app/_lib/auth";
import type { GroupInvitation } from "@/app/_lib/cgs-invitations";
import { InviteScene, type InviteOrg } from "./InviteScene";

type AcceptStatus = "idle" | "accepting" | "accepted" | "error";

export function InvitationAcceptClient({
  invitation,
  session,
}: {
  invitation: GroupInvitation;
  session: AuthSession;
}) {
  const t = useTranslations("common.groupInvitations.invitePage");
  const [status, setStatus] = useState<AcceptStatus>(session.isLoggedIn ? "accepting" : "idle");
  const [error, setError] = useState<string | null>(null);
  const manageHref = useMemo(() => `/manage/groups/${encodeURIComponent(invitation.groupHandle || invitation.repo)}`, [invitation.groupHandle, invitation.repo]);
  const org: InviteOrg = {
    name: invitation.groupName || invitation.groupHandle || invitation.repo,
    handle: invitation.groupHandle,
    did: invitation.repo,
  };
  const organizationName = invitation.groupName || t("organizationFallback");

  useEffect(() => {
    if (!session.isLoggedIn || status !== "accepting") return;
    let active = true;
    async function accept() {
      try {
        const response = await fetch(`/api/cgs/invitations/${encodeURIComponent(invitation.id)}/accept`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || data?.error) throw new Error(data?.error ?? t("acceptError"));
        if (active) setStatus("accepted");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : t("acceptError"));
        setStatus("error");
      }
    }
    void accept();
    return () => {
      active = false;
    };
  }, [invitation.id, session.isLoggedIn, status, t]);

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
        description={error || t("acceptError")}
        org={org}
      >
        <Button type="button" onClick={() => { setError(null); setStatus("accepting"); }} className="w-full shadow-none sm:w-auto">
          {t("tryAgain")}
        </Button>
      </InviteScene>
    );
  }

  return (
    <InviteScene
      tone="neutral"
      icon={<Loader2Icon className="size-7 animate-spin" />}
      title={t("acceptingTitle")}
      description={t("acceptingDescription", { organization: organizationName })}
      org={org}
    />
  );
}
