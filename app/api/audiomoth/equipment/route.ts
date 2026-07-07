import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchUserCgsGroups } from "@/app/_lib/manage-server";
import { listGroupMemberDids } from "@/app/_lib/equipment-server";
import { listEquipmentAcross, type EquipmentItem } from "@/app/_lib/equipment";

export const dynamic = "force-dynamic";

/**
 * GET /api/audiomoth/equipment — the signed-in user's registered AudioMoths,
 * aggregated across every organization they belong to.
 *
 * The deployment dialog uses this to let a user link a field deployment to a
 * unit that may be registered under a teammate's or the organization's own
 * repo, not just their personal one. The roster of each organization's
 * members is read with the viewer's session cookie, so this only ever
 * surfaces gear from teams the viewer is actually part of.
 */
export async function GET() {
  const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false as const }));
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // The organizations the viewer belongs to (private to them — the group
  // service only exposes the signed-in viewer's own memberships).
  const groups = await fetchUserCgsGroups().catch(() => []);
  const groupDids = [...new Set(groups.map((group) => group.groupDid).filter((did): did is string => Boolean(did)))];

  // Each organization's full team, resolved with the viewer's cookie. A group
  // whose roster we may not read is simply skipped.
  const memberDidLists = await Promise.all(
    groupDids.map((groupDid) => listGroupMemberDids(groupDid).catch(() => [] as string[])),
  );

  // Read from: the viewer, each org's own repo, and every teammate's repo.
  const repos = [...new Set([session.did, ...groupDids, ...memberDidLists.flat()])];

  let items: EquipmentItem[] = [];
  try {
    items = await listEquipmentAcross(repos);
  } catch {
    return NextResponse.json({ error: "Could not load equipment." }, { status: 502 });
  }

  const audiomoths = items.filter((item) => item.category === "audiomoth");
  return NextResponse.json({ equipment: audiomoths });
}
