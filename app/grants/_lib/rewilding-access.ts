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
 * Grant slots are held by organizations (CGS group accounts), but people sign
 * in as themselves — so access flows through membership: a member of an
 * enrolled organization sees that organization's grant. An account that is
 * itself enrolled sees its own. GainForest admins can preview, marked as
 * such. Enrollment wins over admin: an admin who belongs to an enrolled
 * organization sees the real grant, not a preview.
 */

/** The grant the signed-in viewer belongs to, when there is one. */
export type ViewerGrant = {
  /** The enrolled account whose grant this is — the organization's DID when
   *  the viewer is a member, the viewer's own DID when directly enrolled. */
  grantDid: string;
  /** The organization's name, when viewing through a membership. Shown so a
   *  member knows whose grant they are looking at. */
  grantLabel: string | null;
};

/**
 * Resolve the viewer's grant: their own enrollment first, then the first
 * organization they belong to that holds a slot. Null when neither applies
 * (or nobody is signed in). Fails closed on any error.
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
  /** Organization name chip, when viewing a grant through membership. */
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
