"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, CheckCircle2Icon, Loader2Icon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildLoginUrl } from "@/app/_lib/auth-client";
import type { AuthSession } from "@/app/_lib/auth";
import type { GroupInvitation } from "@/app/_lib/cgs-invitations";

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
      <InviteCard
        eyebrow={t("eyebrow")}
        title={t("signedOutTitle")}
        description={t("signedOutDescription", { organization: invitation.groupName || t("organizationFallback") })}
        organization={invitation.groupName || invitation.groupHandle || invitation.repo}
      >
        <Button type="button" onClick={signIn} className="w-full sm:w-auto">
          {t("signIn")}
          <ArrowRightIcon />
        </Button>
      </InviteCard>
    );
  }

  if (status === "accepted") {
    return (
      <InviteCard
        icon={<CheckCircle2Icon className="size-8 text-emerald-600" />}
        eyebrow={t("eyebrow")}
        title={t("acceptedTitle")}
        description={t("acceptedDescription", { organization: invitation.groupName || t("organizationFallback") })}
        organization={invitation.groupName || invitation.groupHandle || invitation.repo}
      >
        <Button asChild className="w-full sm:w-auto">
          <Link href={manageHref}>{t("goToOrganization")}</Link>
        </Button>
      </InviteCard>
    );
  }

  if (status === "error") {
    return (
      <InviteCard
        icon={<XCircleIcon className="size-8 text-destructive" />}
        eyebrow={t("eyebrow")}
        title={t("errorTitle")}
        description={error || t("acceptError")}
        organization={invitation.groupName || invitation.groupHandle || invitation.repo}
      >
        <Button type="button" onClick={() => { setError(null); setStatus("accepting"); }} className="w-full sm:w-auto">
          {t("tryAgain")}
        </Button>
      </InviteCard>
    );
  }

  return (
    <InviteCard
      icon={<Loader2Icon className="size-8 animate-spin text-primary" />}
      eyebrow={t("eyebrow")}
      title={t("acceptingTitle")}
      description={t("acceptingDescription", { organization: invitation.groupName || t("organizationFallback") })}
      organization={invitation.groupName || invitation.groupHandle || invitation.repo}
    />
  );
}

function InviteCard({
  icon,
  eyebrow,
  title,
  description,
  organization,
  children,
}: {
  icon?: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  organization: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-[70vh] px-6 py-16">
      <section className="mx-auto flex max-w-xl flex-col items-center rounded-[2rem] border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          {icon ?? <ArrowRightIcon className="size-8 text-primary" />}
        </div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h1 className="font-instrument text-4xl italic leading-tight text-foreground">{title}</h1>
        <span className="mt-4 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{organization}</span>
        <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        {children ? <div className="mt-8 flex justify-center">{children}</div> : null}
      </section>
    </main>
  );
}
