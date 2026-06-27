import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  fetchTimelineAttachmentsByDid,
  type TimelineAttachmentItem,
} from "@/app/_lib/indexer";
import { fetchUserCgsGroups } from "@/app/_lib/manage-server";
import { OrgTimelineTab } from "../../_components/OrgTimelineTab";
import {
  accountTimelinePath,
  getAccountRouteData,
  readAccountRouteParams,
} from "../../_lib/account-route";
import { resolveTimelineReferences } from "@/app/cert/[did]/[rkey]/_components/timeline/timelineReferenceResolver";
import type { TimelineReference } from "@/app/cert/[did]/[rkey]/_components/timeline/timelineReferences";
import { canDeleteRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";

type TimelineDeleteAccess = {
  canDeleteEvidence: boolean;
  mutationRepo?: string;
};

async function resolveOrganizationTimelineDeleteAccess(
  organizationDid: string,
  authSession: Awaited<ReturnType<typeof fetchAuthSession>>,
): Promise<TimelineDeleteAccess> {
  if (!authSession.isLoggedIn) {
    return { canDeleteEvidence: false };
  }

  if (authSession.did === organizationDid) {
    return { canDeleteEvidence: true };
  }

  const groups = await fetchUserCgsGroups();
  const membership = groups.find((group) => group.groupDid === organizationDid);
  if (!membership) {
    return { canDeleteEvidence: false };
  }

  const permission = canDeleteRecord({ kind: "group", role: membership.role });
  return permission.allowed
    ? { canDeleteEvidence: true, mutationRepo: organizationDid }
    : { canDeleteEvidence: false };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ did: string }>;
}): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, timelineT] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    getTranslations("bumicert.detail.timeline"),
  ]);

  return {
    title: `${account.displayName} — ${timelineT("title")}`,
    description: timelineT("linkedDescription"),
    alternates: {
      canonical: accountTimelinePath(account.urlIdentifier),
    },
  };
}

export default async function AccountTimelinePage({
  params,
}: {
  params: Promise<{ did: string }>;
}) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, authSession] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    fetchAuthSession(),
  ]);

  if (urlIdentifier !== account.urlIdentifier) {
    redirect(accountTimelinePath(account.urlIdentifier));
  }

  const [timelineT, timelineEntryT, referenceT, entries] = await Promise.all([
    getTranslations("bumicert.detail.timeline"),
    getTranslations("bumicert.detail.timelineEntry"),
    getTranslations("bumicert.detail.reference"),
    fetchTimelineAttachmentsByDid(account.did).catch((error) => {
      console.warn("[AccountTimelinePage] Unable to load timeline", account.did, error);
      return [] as TimelineAttachmentItem[];
    }),
  ]);

  const [references, deleteAccess]: [TimelineReference[], TimelineDeleteAccess] = await Promise.all([
    resolveTimelineReferences({
      entries,
      copy: {
        linkedRecord: referenceT("linkedRecord"),
        linkedAudioRecord: referenceT("linkedAudioRecord"),
        audioEvidence: referenceT("audioEvidence"),
        linkedDataset: referenceT("linkedDataset"),
        linkedTreeRecord: referenceT("linkedTreeRecord"),
        linkedSiteRecord: referenceT("linkedSiteRecord"),
        siteEvidence: referenceT("siteEvidence"),
        linkedNatureData: timelineT("fallbacks.linkedNatureData"),
        treeCount: (count: number) => timelineEntryT("treeCount", { count }),
        speciesCount: (count: number) => timelineEntryT("speciesCount", { count }),
        observationCount: (count: number) => timelineEntryT("observationCount", { count }),
        individualCount: (count: number) => referenceT("individualCount", { count }),
      },
    }).catch((error) => {
      console.warn("[AccountTimelinePage] Unable to resolve timeline references", account.did, error);
      return [];
    }),
    resolveOrganizationTimelineDeleteAccess(account.did, authSession),
  ]);

  return (
    <OrgTimelineTab
      organizationDid={account.did}
      initialEntries={entries}
      references={references}
      canDeleteEvidence={deleteAccess.canDeleteEvidence}
      mutationRepo={deleteAccess.mutationRepo}
    />
  );
}
