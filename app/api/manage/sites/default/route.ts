import { fetchDefaultSiteByDid } from "@/app/_lib/indexer";
import { isResponse, resolveManageApiTarget } from "../../_lib/target";
import { resolvePdsHost } from "@/app/_lib/pds";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const target = await resolveManageApiTarget(request);
  if (isResponse(target)) return target;

  try {
    const indexed = await fetchDefaultSiteByDid(target.did);
    return Response.json({ siteUri: indexed ?? await fetchDirectDefaultSite(target.did) });
  } catch (err) {
    const direct = await fetchDirectDefaultSite(target.did).catch(() => null);
    if (direct) return Response.json({ siteUri: direct });
    const message = err instanceof Error ? err.message : "Failed to load the default site.";
    return Response.json({ error: message }, { status: 500 });
  }
}

type DefaultSiteRecordResponse = {
  value?: { site?: unknown };
};

async function fetchDirectDefaultSite(did: string): Promise<string | null> {
  const host = await resolvePdsHost(did);
  if (!host) return null;
  const params = new URLSearchParams({
    repo: did,
    collection: "app.gainforest.organization.defaultSite",
    rkey: "self",
  });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as DefaultSiteRecordResponse;
  return typeof data.value?.site === "string" ? data.value.site : null;
}
