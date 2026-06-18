import { getInternalBadgeAccess } from "@/app/internal/badges/_lib/access";
import { resolveBadgeRecipient } from "@/app/internal/badges/_lib/badge-records";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await getInternalBadgeAccess();
  if (!access.isLoggedIn) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  if (!access.allowed) return Response.json({ error: "You do not have access to this dashboard." }, { status: 403 });

  const identifier = new URL(request.url).searchParams.get("identifier") ?? "";
  const result = await resolveBadgeRecipient(identifier);
  if (result.kind === "empty") return Response.json({ error: "Enter a handle, DID, or email." }, { status: 400 });
  if (result.kind === "notFound") return Response.json({ error: "We could not find that account." }, { status: 404 });
  return Response.json(result, { headers: { "cache-control": "private, max-age=300" } });
}
