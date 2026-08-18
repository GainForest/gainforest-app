import { headers } from "next/headers";
import { getAuthBaseUrl, getAuthForwardCookie } from "@/app/_lib/auth";
import { scheduleOrganizationRosterSync } from "@/app/_lib/organization-memberships";

const ROSTER_MUTATION_OPERATIONS = new Set(["addMember", "removeMember", "setRole"]);

function rosterOrganizationDid(requestBody: string, responseBody: string): string | null {
  const request = JSON.parse(requestBody) as { operation?: unknown; repo?: unknown };
  if (ROSTER_MUTATION_OPERATIONS.has(request.operation as string)) {
    return typeof request.repo === "string" && request.repo.startsWith("did:") ? request.repo : null;
  }
  if (request.operation !== "registerGroup") return null;

  const response = JSON.parse(responseBody) as { groupDid?: unknown; error?: unknown };
  if (response.error || typeof response.groupDid !== "string" || !response.groupDid.startsWith("did:")) return null;
  return response.groupDid;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  const requestBody = await request.text();
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: requestBody,
    cache: "no-store",
  });
  const body = await upstream.text();

  if (upstream.ok) {
    try {
      const organizationDid = rosterOrganizationDid(requestBody, body);
      if (organizationDid) scheduleOrganizationRosterSync(organizationDid, headerList.get("cookie"));
    } catch {
      // Preserve the authoritative CGS response even if a malformed successful
      // payload cannot identify a roster that needs refreshing.
    }
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
