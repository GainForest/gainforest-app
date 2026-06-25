import { headers } from "next/headers";
import { z } from "zod";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import {
  createGroupInvitation,
  GroupInvitationError,
  isInvitationRole,
  listPendingGroupInvitationsForEmail,
  normalizeInvitationEmail,
} from "@/app/_lib/cgs-invitations";

export const runtime = "nodejs";

const createInvitationSchema = z.object({
  repo: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["member", "admin"]).default("member"),
});

function jsonError(error: unknown, fallback: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback;
  const code = error instanceof GroupInvitationError ? error.status : status;
  return Response.json({ error: message }, { status: code, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ invitations: [] }, { headers: { "cache-control": "no-store" } });
  }
  if (!session.email) {
    return Response.json({ invitations: [] }, { headers: { "cache-control": "no-store" } });
  }

  try {
    const invitations = await listPendingGroupInvitationsForEmail(normalizeInvitationEmail(session.email));
    return Response.json({ invitations }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error, "Could not load invitations.", 502);
  }
}

export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return jsonError(new GroupInvitationError("Please sign in and try again.", 401), "Please sign in and try again.");

  const parsed = createInvitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isInvitationRole(parsed.data.role)) {
    return jsonError(new GroupInvitationError("Enter a valid invitation.", 400), "Enter a valid invitation.");
  }

  const headerList = await headers();
  const origin = new URL(request.url).origin;

  try {
    const invitation = await createGroupInvitation({
      repo: parsed.data.repo.trim(),
      email: parsed.data.email,
      role: parsed.data.role,
      session,
      cookie: getAuthForwardCookie(headerList.get("cookie")),
      origin,
      acceptLanguage: headerList.get("accept-language"),
    });
    return Response.json({ invitation }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error, "Could not create invitation.", 502);
  }
}
