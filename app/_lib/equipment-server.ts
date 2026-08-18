/**
 * Server-side helpers for the equipment registry.
 *
 * - `listGroupMemberDids` resolves an organization's full team so the org
 *   profile's Equipment tab can aggregate every member's gear. It reads
 *   through the group service with the viewer's session cookie, so it only
 *   works for people who belong to the organization.
 */

import { headers } from "next/headers";
import { fetchCgsMembersWithCookie } from "./cgs-server";

/** Every member DID of a group, paging the group service until exhausted.
 *  Throws when the viewer's session may not read the member list. */
export async function listGroupMemberDids(groupDid: string): Promise<string[]> {
  const headerList = await headers();
  const cookie = headerList.get("cookie");

  const dids: string[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  do {
    const page = await fetchCgsMembersWithCookie({ repo: groupDid, cookie, cursor, limit: 100 });
    for (const member of page.members) dids.push(member.did);
    const next = page.cursor ?? null;
    // Guard against a service echoing the same cursor forever.
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
  } while (cursor);
  return [...new Set(dids)];
}
