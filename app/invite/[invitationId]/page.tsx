import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getGroupInvitation } from "@/app/_lib/cgs-invitations";
import { InvitationAcceptClient } from "./_components/InvitationAcceptClient";
import { XCircleIcon, ClockIcon, CheckCircle2Icon } from "lucide-react";

export const dynamic = "force-dynamic";

type InvitePageProps = { params: Promise<{ invitationId: string }> };

export default async function InvitePage({ params }: InvitePageProps) {
  const { invitationId } = await params;
  const [session, invitation, t] = await Promise.all([
    fetchAuthSession(),
    getGroupInvitation(invitationId).catch(() => null),
    getTranslations("common.groupInvitations.invitePage"),
  ]);

  if (!invitation) {
    return <StateCard icon={<XCircleIcon className="size-8 text-destructive" />} title={t("notFoundTitle")} description={t("notFoundDescription")} />;
  }

  if (invitation.status === "accepted") {
    return <StateCard icon={<CheckCircle2Icon className="size-8 text-emerald-600" />} title={t("alreadyAcceptedTitle")} description={t("alreadyAcceptedDescription")} />;
  }

  if (invitation.status === "expired" || new Date(invitation.expiresAt).getTime() < Date.now()) {
    return <StateCard icon={<ClockIcon className="size-8 text-muted-foreground" />} title={t("expiredTitle")} description={t("expiredDescription")} />;
  }

  if (invitation.status === "canceled") {
    return <StateCard icon={<XCircleIcon className="size-8 text-destructive" />} title={t("canceledTitle")} description={t("canceledDescription")} />;
  }

  return <InvitationAcceptClient invitation={invitation} session={session} />;
}

function StateCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <main className="min-h-[70vh] px-6 py-16">
      <section className="mx-auto flex max-w-xl flex-col items-center rounded-[2rem] border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-muted/60">{icon}</div>
        <h1 className="font-instrument text-4xl italic leading-tight text-foreground">{title}</h1>
        <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      </section>
    </main>
  );
}
