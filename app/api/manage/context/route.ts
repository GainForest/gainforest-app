import { resolveGroupManageTarget, resolvePersonalManageTarget } from "@/app/_lib/manage-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const group = url.searchParams.get("group");
  const target = group
    ? await resolveGroupManageTarget(group)
    : await resolvePersonalManageTarget();

  if (!target) {
    return Response.json({ error: "Not authorized for this manage account." }, { status: 401 });
  }

  return Response.json(target, { headers: { "cache-control": "no-store" } });
}
