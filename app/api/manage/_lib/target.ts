import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveGroupManageTarget } from "@/app/_lib/manage-server";
import type { ManageTarget } from "@/lib/links";
import { personalManageTarget } from "@/lib/links";

export async function resolveManageApiTarget(request: Request): Promise<ManageTarget | Response> {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Please sign in and try again." }, { status: 401 });
  }

  const repo = new URL(request.url).searchParams.get("repo")?.trim() || null;
  if (!repo || repo === session.did) {
    return personalManageTarget({ did: session.did, accountKind: "user", identifier: session.handle || session.did });
  }

  const target = await resolveGroupManageTarget(repo);
  if (!target) {
    return Response.json({ error: "You do not have access to manage this organization." }, { status: 403 });
  }
  return target;
}

export function isResponse(value: ManageTarget | Response): value is Response {
  return value instanceof Response;
}
