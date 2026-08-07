"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, FlaskConicalIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  invitationDeliveryState,
  PendingInvitationRow,
} from "@/app/(manage)/manage/groups/_components/GroupMembers";
import type { CgsPendingInvitation } from "@/app/(manage)/manage/_lib/cgs";

const FIXTURES: Array<{ key: "sent" | "delayed" | "manual" | "admin"; invitation: CgsPendingInvitation; canManage: boolean }> = [
  {
    key: "sent",
    canManage: true,
    invitation: {
      id: "81000000-0000-4000-8000-000000000001",
      email: "sent@example.test",
      role: "member",
      status: "pending",
      notification: { outboxId: "10000000-0000-4000-8000-000000000001", status: "sent", retryable: false },
    },
  },
  {
    key: "delayed",
    canManage: true,
    invitation: {
      id: "81000000-0000-4000-8000-000000000002",
      email: "delayed@example.test",
      role: "member",
      status: "pending",
      notification: { outboxId: "10000000-0000-4000-8000-000000000002", status: "queued", retryable: true },
    },
  },
  {
    key: "manual",
    canManage: true,
    invitation: {
      id: "81000000-0000-4000-8000-000000000003",
      email: "manual@example.test",
      role: "member",
      status: "pending",
      notification: { outboxId: "10000000-0000-4000-8000-000000000003", status: "dead", retryable: false },
    },
  },
  {
    key: "admin",
    canManage: false,
    invitation: {
      id: "81000000-0000-4000-8000-000000000004",
      email: "admin@example.test",
      role: "admin",
      status: "pending",
      notification: { outboxId: "10000000-0000-4000-8000-000000000004", status: "queued", retryable: true },
    },
  },
];

export function InvitationActionNotice({ notice }: { notice: string | null }) {
  return notice ? (
    <p role="status" className="mt-6 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
      {notice}
    </p>
  ) : null;
}

export function InvitationDeliveryExperienceClient() {
  const registry = useTranslations("cart.testRegistry");
  const scenario = useTranslations("cart.testRegistry.invitationDelivery");
  const invitationT = useTranslations("common.groupInvitations.members");
  const [fixtures, setFixtures] = useState(FIXTURES);
  const [notice, setNotice] = useState<string | null>(null);

  const statusLabel = (invitation: CgsPendingInvitation) => {
    const state = invitationDeliveryState(invitation.notification?.status);
    const delivery = state === "sent"
      ? invitationT("emailSent")
      : state === "delayed"
        ? invitationT("emailDelayed")
        : invitationT("emailUnavailable");
    return invitationT("pendingStatus", { delivery });
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/_test" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden />
          {registry("backToRegistry")}
        </Link>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2 text-primary">
            <FlaskConicalIcon className="size-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">{registry("scenarioLabel")}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{scenario("title")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{scenario("description")}</p>
        </div>

        <aside className="mt-7 rounded-3xl border border-primary/20 bg-primary/[0.06] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{registry("parityTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-foreground/75">{registry("parityBody")}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{scenario("mockNote")}</p>
            </div>
          </div>
        </aside>

        <InvitationActionNotice notice={notice} />

        <section className="mt-8 space-y-6">
          {fixtures.map(({ key, invitation, canManage }) => (
            <div key={key} className="rounded-[2rem] border border-border-soft bg-surface p-5 shadow-sm sm:p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{scenario(`scenarios.${key}`)}</p>
              <PendingInvitationRow
                invitation={invitation}
                roleLabel={invitationT(invitation.role === "admin" ? "roleAdmin" : "roleMember")}
                statusLabel={statusLabel(invitation)}
                canCancel={canManage}
                canCopy={canManage}
                canRetry={canManage && Boolean(invitation.notification?.retryable)}
                isPending={false}
                retryLabel={invitationT("retry")}
                copyLabel={invitationT("copyLink")}
                cancelLabel={invitationT("cancel")}
                onRetry={item => {
                  setFixtures(current => current.map(entry => entry.invitation.id === item.id
                    ? { ...entry, invitation: { ...item, notification: item.notification ? { ...item.notification, status: "sent", retryable: false } : null } }
                    : entry));
                  setNotice(scenario("mockRetried"));
                }}
                onCopy={() => setNotice(scenario("mockCopied"))}
                onCancel={item => {
                  setFixtures(current => current.filter(entry => entry.invitation.id !== item.id));
                  setNotice(scenario("mockCanceled"));
                }}
              />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
