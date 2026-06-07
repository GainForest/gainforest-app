import { headers } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAuthBaseUrl } from "@/app/_lib/auth";

export const runtime = "nodejs";

type MutationBody =
  | { operation: "createRecord"; collection: string; rkey?: string; record: Record<string, unknown> }
  | { operation: "putRecord"; collection: string; rkey: string; record: Record<string, unknown> }
  | { operation: "deleteRecord"; collection: string; rkey: string }
  | { operation: "uploadBlob"; blobData: string; blobMimeType: string };

type PdsSession = { did: string; accessJwt: string };

function isMutationBody(value: unknown): value is MutationBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<MutationBody>;
  if (body.operation === "uploadBlob") return typeof body.blobData === "string" && typeof body.blobMimeType === "string";
  if (body.operation === "createRecord") return typeof body.collection === "string" && typeof body.record === "object" && body.record !== null;
  if (body.operation === "putRecord") return typeof body.collection === "string" && typeof body.rkey === "string" && typeof body.record === "object" && body.record !== null;
  if (body.operation === "deleteRecord") return typeof body.collection === "string" && typeof body.rkey === "string";
  return false;
}

function getConfiguredPdsUrl(): string | null {
  const domain = process.env.E2E_TEST_PDS_DOMAIN?.trim();
  if (!domain) return null;
  return domain.startsWith("http://") || domain.startsWith("https://") ? domain.replace(/\/$/, "") : `https://${domain}`;
}

async function createConfiguredPdsSession(expectedDid: string): Promise<{ pdsUrl: string; session: PdsSession } | null> {
  const pdsUrl = getConfiguredPdsUrl();
  const identifier = process.env.E2E_TEST_HANDLE?.trim();
  const password = process.env.E2E_TEST_PASSWORD?.trim();
  if (!pdsUrl || !identifier || !password) return null;

  const response = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as Partial<PdsSession> | null;
  if (!response.ok || !json || typeof json.did !== "string" || typeof json.accessJwt !== "string") {
    throw new Error("Could not create a publishing session for the configured test account.");
  }
  if (json.did !== expectedDid) {
    throw new Error("Configured publishing account does not match the signed-in account.");
  }
  return { pdsUrl, session: { did: json.did, accessJwt: json.accessJwt } };
}

async function callPdsXrpc<T>(pdsUrl: string, session: PdsSession, method: "POST", path: string, body: unknown, contentType = "application/json"): Promise<T> {
  const response = await fetch(`${pdsUrl}/xrpc/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${session.accessJwt}`,
      "content-type": contentType,
    },
    body: contentType === "application/json" ? JSON.stringify(body) : (body as BodyInit),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as T & { error?: string; message?: string } | null;
  if (!response.ok || !json) {
    throw new Error(json?.message ?? json?.error ?? `Publishing request failed (${response.status}).`);
  }
  return json;
}

async function runConfiguredPdsMutation(body: MutationBody, did: string): Promise<Response | null> {
  const configured = await createConfiguredPdsSession(did);
  if (!configured) return null;
  const { pdsUrl, session } = configured;

  if (body.operation === "uploadBlob") {
    const bytes = Buffer.from(body.blobData, "base64");
    const result = await callPdsXrpc(pdsUrl, session, "POST", "com.atproto.repo.uploadBlob", bytes, body.blobMimeType);
    return Response.json(result);
  }

  if (body.operation === "createRecord") {
    const result = await callPdsXrpc<{ uri: string; cid: string }>(pdsUrl, session, "POST", "com.atproto.repo.createRecord", {
      repo: did,
      collection: body.collection,
      ...(body.rkey ? { rkey: body.rkey } : {}),
      record: body.record,
    });
    return Response.json({ uri: result.uri, cid: result.cid });
  }

  if (body.operation === "putRecord") {
    const result = await callPdsXrpc<{ uri: string; cid: string }>(pdsUrl, session, "POST", "com.atproto.repo.putRecord", {
      repo: did,
      collection: body.collection,
      rkey: body.rkey,
      record: body.record,
    });
    return Response.json({ uri: result.uri, cid: result.cid });
  }

  await callPdsXrpc(pdsUrl, session, "POST", "com.atproto.repo.deleteRecord", {
    repo: did,
    collection: body.collection,
    rkey: body.rkey,
  });
  return Response.json({ success: true });
}

/**
 * Thin proxy from gainforest-explorer API routes → auth.gainforest.app/api/atproto/mutation.
 *
 * The client sends mutation payloads to this route; the route validates the
 * local session and forwards the request to the auth server with the same
 * session cookie so the auth server can restore the ATProto OAuth agent and
 * execute the PDS operation on behalf of the user.
 */
export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const headerList = await headers();
  const cookie = headerList.get("cookie");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!isMutationBody(body)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const authUrl = `${getAuthBaseUrl()}/api/atproto/mutation`;
  let upstream: Response;
  try {
    upstream = await fetch(authUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const fallback = await runConfiguredPdsMutation(body, session.did).catch((error) => Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }));
    if (fallback) return fallback;
    const message = err instanceof Error ? err.message : "Auth server unreachable";
    return Response.json({ error: message }, { status: 502 });
  }

  const result = await upstream.json().catch(() => null);
  if (result) return Response.json(result, { status: upstream.status });

  const fallback = await runConfiguredPdsMutation(body, session.did).catch((error) => Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }));
  if (fallback) return fallback;

  return Response.json({ error: "Saving is unavailable right now. Please try again later." }, { status: upstream.ok ? 502 : upstream.status });
}
