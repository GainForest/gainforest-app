"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildLoginUrl } from "@/app/_lib/auth-client";
import type { AuthSession } from "@/app/_lib/auth";
import type { GroupInvitation, GroupInvitationErrorCode } from "@/app/_lib/cgs-invitations";
import { InviteScene, type InviteOrg } from "./InviteScene";

type AcceptStatus = "idle" | "accepting" | "accepted" | "error";

export function InvitationAcceptErrorScene({
  invitation,
  error,
  errorCode,
  onRetry,
}: {
  invitation: GroupInvitation;
  error: string | null;
  errorCode: GroupInvitationErrorCode | null;
  onRetry: () => void;
}) {
  const t = useTranslations("common.groupInvitations.invitePage");
  const org: InviteOrg = {
    name: invitation.groupName || invitation.groupHandle || invitation.repo,
    handle: invitation.groupHandle,
    did: invitation.repo,
  };
  const description = errorCode === "membership_outcome_unknown"
    ? t("membershipOutcomeUnknown")
    : error || t("acceptError");

  return (
    <InviteScene
      tone="danger"
      icon={<XIcon className="size-7" />}
      title={t("errorTitle")}
      description={description}
      org={org}
    >
      <Button type="button" onClick={onRetry} className="w-full shadow-none sm:w-auto">
        {t("tryAgain")}
      </Button>
    </InviteScene>
  );
}

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
  const [errorCode, setErrorCode] = useState<GroupInvitationErrorCode | null>(null);
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
        const data = await response.json().catch(() => null) as {
          error?: string;
          code?: GroupInvitationErrorCode;
        } | null;
        if (!response.ok || data?.error) {
          if (!active) return;
          setError(data?.error ?? t("acceptError"));
          setErrorCode(data?.code ?? null);
          setStatus("error");
          return;
        }
        if (active) setStatus("accepted");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : t("acceptError"));
        setErrorCode(null);
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
      <InvitationAcceptErrorScene
        invitation={invitation}
        error={error}
        errorCode={errorCode}
        onRetry={() => {
          setError(null);
          setErrorCode(null);
          setStatus("accepting");
        }}
      />
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
