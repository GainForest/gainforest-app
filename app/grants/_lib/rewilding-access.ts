import { fetchAuthSession } from "@/app/_lib/auth-server";
import { isRewildingGrantee } from "@/app/_lib/rewilding-grantees";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";

/**
 * Who may open the Rewilding grantee dashboard (/grants/my-grant and
 * /grants/my-recorders):
 *
 * - an organization currently holding one of the program's ten slots — this
 *   is their own dashboard;
 * - a GainForest admin-group member — as a preview, marked as such.
 *
 * Enrollment wins over admin: an admin whose own account holds a slot sees
 * the page as the grantee they are, not as a preview.
 */
export type RewildingDashboardAccess = {
  allowed: boolean;
  /** True when the viewer is an admin looking at a preview rather than an
   *  enrolled grantee looking at their own grant. */
  isAdminPreview: boolean;
  viewerDid: string | null;
};

export async function getRewildingDashboardAccess(): Promise<RewildingDashboardAccess> {
  const session = await fetchAuthSession().catch(() => null);
  const viewerDid = session?.isLoggedIn ? session.did : null;

  if (viewerDid && (await isRewildingGrantee(viewerDid))) {
    return { allowed: true, isAdminPreview: false, viewerDid };
  }

  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (moderator?.isModerator) {
    return { allowed: true, isAdminPreview: true, viewerDid };
  }

  return { allowed: false, isAdminPreview: false, viewerDid };
}
