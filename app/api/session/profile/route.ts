import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { INDEXER_URL } from "@/app/_lib/urls";

export const dynamic = "force-dynamic";

type ManageAccountKind = "organization" | "user";

type GqlResponse<T> = {
  data?: T | null;
};

type ShellProfileData = {
  certOrg?: {
    certifiedProfileData?: { displayName?: string | null } | null;
  } | null;
  certProfile?: {
    displayName?: string | null;
    certifiedProfileData?: { displayName?: string | null } | null;
  } | null;
};

const SHELL_PROFILE_QUERY = `
  query ShellProfile($org: String!, $profile: String!) {
    certOrg: appCertifiedActorOrganizationByUri(uri: $org) {
      certifiedProfileData { displayName }
    }
    certProfile: appCertifiedActorProfileByUri(uri: $profile) {
      displayName
      certifiedProfileData { displayName }
    }
  }
`;

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function fetchShellProfile(did: string): Promise<{
  manageAccountKind: ManageAccountKind;
  profileName: string | null;
  hasCertifiedProfile: boolean;
  hasCertifiedOrg: boolean;
}> {
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: SHELL_PROFILE_QUERY,
      variables: {
        org: `at://${did}/app.certified.actor.organization/self`,
        profile: `at://${did}/app.certified.actor.profile/self`,
      },
    }),
    cache: "no-store",
  });

  let json: GqlResponse<ShellProfileData>;
  try {
    json = (await response.json()) as GqlResponse<ShellProfileData>;
  } catch {
    if (!response.ok) throw new Error(`Profile request failed: ${response.status}`);
    json = {};
  }

  if (!response.ok && !json.data) throw new Error(`Profile request failed: ${response.status}`);

  const certOrg = json.data?.certOrg ?? null;
  const certProfile = json.data?.certProfile ?? null;
  const profileName =
    cleanText(certProfile?.displayName) ??
    cleanText(certProfile?.certifiedProfileData?.displayName) ??
    cleanText(certOrg?.certifiedProfileData?.displayName);

  return {
    manageAccountKind: certOrg ? "organization" : "user",
    profileName,
    hasCertifiedProfile: Boolean(certProfile),
    hasCertifiedOrg: Boolean(certOrg),
  };
}

export async function GET() {
  const session = await fetchAuthSession();

  if (!session.isLoggedIn) {
    return NextResponse.json({
      manageAccountKind: "user",
      profileName: null,
      hasCertifiedProfile: false,
      hasCertifiedOrg: false,
    });
  }

  const profile = await fetchShellProfile(session.did).catch(() => ({
    manageAccountKind: "user" as ManageAccountKind,
    profileName: null,
    hasCertifiedProfile: true,
    hasCertifiedOrg: false,
  }));

  return NextResponse.json(profile);
}
