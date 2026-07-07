import { invalidatePublicExploreCache } from "@/app/_lib/public-explore-cache";
import { PublishOrgError, isPublished, publishAccount, publishingConfigured } from "@/app/_lib/publish-org";
import { isResponse, resolveManageApiTarget } from "../_lib/target";
import type { ManageTarget } from "@/lib/links";

export const runtime = "nodejs";

/** Publishing puts the whole account on the public explore pages, so for
 *  organizations it needs an owner/admin — a plain member can't do it.
 *  Personal accounts publish themselves. */
function canPublish(target: ManageTarget): boolean {
  if (target.kind !== "group") return true;
  return target.role === "owner" || target.role === "admin";
}

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  if (!publishingConfigured()) {
    return Response.json({ available: false, published: false, allowed: canPublish(target) });
  }
  try {
    const published = await isPublished(target.did);
    return Response.json({ available: true, published, allowed: canPublish(target) });
  } catch (error) {
    const status = error instanceof PublishOrgError ? error.status : 500;
    // Status lookups should degrade quietly: the card simply hides.
    return Response.json({ available: false, published: false, allowed: canPublish(target) }, { status: status >= 500 ? 200 : status });
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
