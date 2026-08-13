import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchUserCgsGroups } from "@/app/_lib/manage-server";
import {
  effectiveRewildingGrantees,
  fetchRewildingGrantees,
} from "@/app/_lib/rewilding-grantees";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";

/**
 * Who may open the Rewilding grantee dashboard (/grants/my-grant and
 * /grants/my-recorders), and whose grant they see.
 *
 * A grant slot can be held by a person or by an organization (a CGS group
 * account). An account that is itself enrolled sees its own grant — that is
 * the whole story for an individual grantee. For an organization, people sign
 * in as themselves, so access also flows through membership: a member of an
 * enrolled organization sees that organization's grant. GainForest admins can
 * preview, marked as such. Enrollment wins over admin: an admin who is
 * enrolled, or who belongs to an enrolled organization, sees the real grant
 * rather than a preview.
 */

/** The grant the signed-in viewer belongs to, when there is one. */
export type ViewerGrant = {
  /** The enrolled account whose grant this is — the viewer's own DID when
   *  they hold the grant themselves, the organization's DID when they reach
   *  it as a member. */
  grantDid: string;
  /** The organization's name, when viewing through a membership. Null for an
   *  individual grantee, who needs no reminder whose grant it is. */
  grantLabel: string | null;
};

/**
 * Resolve the viewer's grant: their own enrollment first — covering an
 * individual grantee — then the first organization they belong to that holds
 * a slot. Null when neither applies (or nobody is signed in). Fails closed on
 * any error.
 */
export async function resolveViewerGrant(): Promise<ViewerGrant | null> {
  const session = await fetchAuthSession().catch(() => null);
  if (!session?.isLoggedIn) return null;

  const records = await fetchRewildingGrantees().catch(() => []);
  const enrolled = new Set(effectiveRewildingGrantees(records).map((record) => record.subjectDid));
  if (enrolled.size === 0) return null;

  if (enrolled.has(session.did)) return { grantDid: session.did, grantLabel: null };

  const groups = await fetchUserCgsGroups().catch(() => []);
  const membership = groups.find((group) => enrolled.has(group.groupDid));
  if (!membership) return null;
  return {
    grantDid: membership.groupDid,
    grantLabel: membership.displayName?.trim() || membership.handle?.trim() || null,
  };
}

export type RewildingDashboardAccess = {
  allowed: boolean;
  /** True when the viewer is an admin looking at a preview rather than
   *  someone looking at a grant they belong to. */
  isAdminPreview: boolean;
  /** The account whose grant state the pages should load. In an admin
   *  preview this is the admin's own DID (usually an empty grant). */
  grantDid: string | null;
  /** Organization name chip, when viewing a grant through membership. Null
   *  for an individual grantee. */
  grantLabel: string | null;
};

export async function getRewildingDashboardAccess(): Promise<RewildingDashboardAccess> {
  const grant = await resolveViewerGrant();
  if (grant) {
    return { allowed: true, isAdminPreview: false, grantDid: grant.grantDid, grantLabel: grant.grantLabel };
  }

  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (moderator?.isModerator) {
    const viewerDid = moderator.session.isLoggedIn ? moderator.session.did : null;
    return { allowed: true, isAdminPreview: true, grantDid: viewerDid, grantLabel: null };
  }

  return { allowed: false, isAdminPreview: false, grantDid: null, grantLabel: null };
}
