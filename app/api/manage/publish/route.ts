import { invalidatePublicExploreCache } from "@/app/_lib/public-explore-cache";
import { PublishOrgError, isPublished, publishAccount, publishingConfigured } from "@/app/_lib/publish-org";
import { isResponse, resolveManageApiTarget } from "../_lib/target";
import type { ManageTarget } from "@/lib/links";

export const runtime = "nodejs";

/** Listing the account on the public explore pages is an account-wide change,
 *  so for organizations it needs an owner/admin — a plain member can't do it.
 *  Personal accounts list themselves. */
function canPublish(target: ManageTarget): boolean {
  if (target.kind !== "group") return true;
  return target.role === "owner" || target.role === "admin";
}

/** `published` (is this account in the explore lists?) is a plain read of the
 *  public badge repo, so it is answered even when this server can't perform the
 *  change — `available` covers that separately. Otherwise an unconfigured
 *  server would leave people unable to see where they stand. */
export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  const available = publishingConfigured();
  try {
    const published = await isPublished(target.did);
    return Response.json({ available, published, allowed: canPublish(target) });
  } catch (error) {
    const status = error instanceof PublishOrgError ? error.status : 500;
    // A failed lookup must not be reported as "not listed": say nothing is known.
    return Response.json({ error: "status-unavailable" }, { status: status >= 500 ? 502 : status });
  }
}

export async function POST(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  if (!canPublish(target)) {
    return Response.json({ error: "Only organization owners and admins can publish." }, { status: 403 });
  }

  try {
    await publishAccount(target.did);
    // The explore pages derive everything from cached indexes; rebuild them so
    // the freshly published account shows up without waiting out the TTL.
    invalidatePublicExploreCache();
    return Response.json({ published: true });
  } catch (error) {
    if (error instanceof PublishOrgError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Publishing didn’t go through. Please try again later." }, { status: 500 });
  }
}
