import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getGroupInvitation, type GroupInvitation } from "@/app/_lib/cgs-invitations";
import { InvitationAcceptClient } from "./_components/InvitationAcceptClient";
import { InviteScene, type InviteOrg } from "./_components/InviteScene";
import { ClockIcon, CheckIcon, XIcon } from "lucide-react";

export const dynamic = "force-dynamic";

type InvitePageProps = { params: Promise<{ invitationId: string }> };

function orgFromInvitation(invitation: GroupInvitation): InviteOrg {
  return {
    name: invitation.groupName || invitation.groupHandle || invitation.repo,
    handle: invitation.groupHandle,
    did: invitation.repo,
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { invitationId } = await params;
  const [session, invitation, t] = await Promise.all([
    fetchAuthSession(),
    getGroupInvitation(invitationId).catch(() => null),
    getTranslations("common.groupInvitations.invitePage"),
  ]);

  if (!invitation) {
    return <InviteScene tone="danger" icon={<XIcon className="size-8" />} title={t("notFoundTitle")} description={t("notFoundDescription")} />;
  }

  const org = orgFromInvitation(invitation);

  if (invitation.status === "accepted") {
    return <InviteScene tone="success" icon={<CheckIcon className="size-7" />} title={t("alreadyAcceptedTitle")} description={t("alreadyAcceptedDescription")} org={org} />;
  }

  if (invitation.status === "expired" || new Date(invitation.expiresAt).getTime() < Date.now()) {
    return <InviteScene tone="neutral" icon={<ClockIcon className="size-7" />} title={t("expiredTitle")} description={t("expiredDescription")} org={org} />;
  }

  if (invitation.status === "canceled") {
    return <InviteScene tone="danger" icon={<XIcon className="size-7" />} title={t("canceledTitle")} description={t("canceledDescription")} org={org} />;
  }

  return <InvitationAcceptClient invitation={invitation} session={session} />;
}
