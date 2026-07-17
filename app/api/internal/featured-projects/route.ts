import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { GAINFOREST_MODERATION_REPO_DID } from "@/app/_lib/indexer";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  FeaturedProjectMutationError,
  featureProject,
  fetchFeaturedProjectUris,
  isProjectRecordUri,
  unfeatureProject,
} from "@/app/internal/badges/_lib/featured-projects";

export const runtime = "nodejs";

function readUri(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const uri = typeof (value as { uri?: unknown }).uri === "string" ? (value as { uri: string }).uri.trim() : "";
  return isProjectRecordUri(uri) ? uri : null;
}

function canManageFeaturedProjects(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

async function loadMutationAccess() {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  if (!access.repoDid || !canManageFeaturedProjects(access.role)) {
    return { error: Response.json({ error: "You do not have access to feature projects." }, { status: 403 }) } as const;
  }
  return { repoDid: access.repoDid } as const;
}

export async function GET() {
  const [uris, access] = await Promise.all([
    fetchFeaturedProjectUris(GAINFOREST_MODERATION_REPO_DID).catch(() => []),
    getGainForestModeratorAccess().catch(() => null),
  ]);
  return Response.json(
    { uris, canManage: canManageFeaturedProjects(access?.role) },
    { headers: { "cache-control": "no-store" } },
  );
}

async function mutate(request: Request, action: "feature" | "unfeature") {
  const loaded = await loadMutationAccess();
  if ("error" in loaded) return loaded.error;
  const uri = readUri(await request.json().catch(() => null));
  if (!uri) return Response.json({ error: "A valid project is required." }, { status: 400 });

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  try {
    if (action === "feature") await featureProject(loaded.repoDid, cookie, uri);
    else await unfeatureProject(loaded.repoDid, cookie, uri);
    const savedUris = await fetchFeaturedProjectUris(loaded.repoDid).catch(() => []);
    // The public index can trail a successful group write briefly. Reflect the
    // confirmed mutation immediately so the admin sees the carousel update,
    // while the revalidated cache catches up for other visitors.
    const uris = action === "feature"
      ? [uri, ...savedUris.filter((savedUri) => savedUri !== uri)]
      : savedUris.filter((savedUri) => savedUri !== uri);
    return Response.json({ featured: action === "feature", uris }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof FeaturedProjectMutationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not update the featured projects.";
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  return mutate(request, "feature");
}

export async function DELETE(request: Request) {
  return mutate(request, "unfeature");
}
