import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  BioblitzExclusionMutationError,
  removeBioblitzExclusion,
} from "@/app/internal/badges/_lib/bioblitz-exclusion-mutations";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ rkey: string }> },
) {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return Response.json({ error: "not_signed_in" }, { status: 401 });
  }
  if (
    !access.configured ||
    !access.isModerator ||
    !access.repoDid ||
    (access.role !== "owner" && access.role !== "admin")
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { rkey } = await params;
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  try {
    await removeBioblitzExclusion(access.repoDid, cookie, rkey);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof BioblitzExclusionMutationError ? error.status : 500;
    const code = error instanceof BioblitzExclusionMutationError ? error.code : "delete_failed";
    return Response.json({ error: code }, { status });
  }
}
