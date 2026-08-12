"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  invitationDeliveryState,
  PendingInvitationRow,
} from "@/app/(manage)/manage/groups/_components/GroupMembers";
import type { CgsPendingInvitation } from "@/app/(manage)/manage/_lib/cgs";
import { TestBadge } from "../../_components/TestBadge";

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
    <p role="status" className="mx-auto max-w-4xl px-4 pt-4 text-sm text-emerald-700 dark:text-emerald-300 sm:px-6">
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
    <main className="min-h-screen bg-background">
      <div className="mx-4 mt-4 flex h-10 items-center gap-3 rounded-xl bg-muted px-4 sm:mx-6">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <Link href="/_test" className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeftIcon className="size-4" aria-hidden />
            <span className="sr-only">{registry("backToRegistry")}</span>
          </Link>
          <h1 className="text-sm font-medium text-foreground">{scenario("title")}</h1>
          <div className="ml-auto">
            <TestBadge label={registry("testBadge")} description={registry("parityBody")} />
          </div>
        </div>
      </div>

      <InvitationActionNotice notice={notice} />

      <section className="mx-auto max-w-4xl space-y-3 px-4 py-6 sm:px-6">
        {fixtures.map(({ key, invitation, canManage }) => (
          <PendingInvitationRow
            key={key}
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
        ))}
      </section>
    </main>
  );
}
