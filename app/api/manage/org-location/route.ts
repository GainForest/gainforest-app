import { headers } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveGroupManageTarget } from "@/app/_lib/manage-server";
import { fuzzCoordinateForDid } from "@/app/_lib/org-location-fuzz";

/**
 * Offset a coordinate for an approximate organization location.
 *
 * The browser never publishes the exact point: it sends the point here, gets
 * back the offset one, and wraps that in the published circle. The offset has
 * to be computed here because it is keyed on a server-held secret — that is
 * what stops repeated saves from averaging out to the true location.
 *
 * The offset is keyed to the repo it is for, and we only answer for a repo the
 * caller may write to, so this can't be used to probe another organization's
 * offsets. The exact coordinate is used and discarded: never stored, never
 * logged, never published.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { repo?: unknown; latitude?: unknown; longitude?: unknown };

function isValidCoordinate(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  }
  // Referenced so the route is never statically cached across sessions.
  await headers();

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !isValidCoordinate(body.latitude, body.longitude)) {
    return Response.json({ error: "Invalid coordinates." }, { status: 400 });
  }
  const latitude = body.latitude as number;
  const longitude = body.longitude as number;

  // Which repo the location belongs to — own account, or an org the caller
  // is allowed to manage. Anything else is refused, so the offsets for an
  // organization are only ever obtainable by people who can already edit it.
  const requestedRepo = typeof body.repo === "string" ? body.repo.trim() : "";
  let did = session.did;
  if (requestedRepo && requestedRepo !== session.did) {
    const target = await resolveGroupManageTarget(requestedRepo);
    if (!target) {
      return Response.json({ error: "You do not have access to manage this organization." }, { status: 403 });
    }
    did = target.did;
  }

  try {
    const fuzzed = fuzzCoordinateForDid(did, latitude, longitude);
    return Response.json(fuzzed, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[org-location] fuzzing unavailable", error);
    return Response.json(
      { error: "Approximate locations are unavailable right now. Please try again later." },
      { status: 503 },
    );
  }
}
