import "server-only";
import { getAuthBaseUrl } from "@/app/_lib/auth";
import { ENDORSER_COLLECTION, fetchEndorserRecords, type EndorserRecord } from "@/app/_lib/endorsers";
import { resolveBadgeRecipient } from "./badge-records";

export class EndorserMutationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EndorserMutationError";
    this.status = status;
  }
}

type CgsMutationResult = { uri?: string; cid?: string; error?: string; message?: string };

type CgsCreatePayload = {
  operation: "createRecord";
  collection: string;
  record: Record<string, unknown>;
};

type CgsDeletePayload = {
  operation: "deleteRecord";
  collection: string;
  rkey: string;
};

async function cgsMutate(
  repo: string,
  cookie: string | null,
  payload: CgsCreatePayload | CgsDeletePayload,
): Promise<CgsMutationResult> {
  const upstream = await fetch(new URL("/api/cgs/mutation", getAuthBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ ...payload, repo }),
    cache: "no-store",
  });
  const data = (await upstream.json().catch(() => null)) as CgsMutationResult | null;
  if (!upstream.ok || !data || data.error) {
    throw new EndorserMutationError(
      data?.message ?? data?.error ?? "Could not update the endorser list.",
      upstream.status || 502,
    );
  }
  return data;
}

/** List the admin-managed endorsers (newest first). */
export async function listEndorsers(repoDid: string): Promise<EndorserRecord[]> {
  return fetchEndorserRecords(repoDid).catch(() => []);
}

export type AddEndorserResult = { record: EndorserRecord };

/**
 * Add an organization to the endorser allow-list. Resolves the given
 * handle/DID to a certified account and writes one `app.gainforest.endorser`
 * record into the moderation repo. Idempotent: re-adding an existing endorser
 * returns the existing record.
 */
export async function addEndorser(
  repoDid: string,
  cookie: string | null,
  identifier: string,
  labelOverride?: string | null,
): Promise<AddEndorserResult> {
  const trimmed = identifier.trim();
  if (!trimmed) throw new EndorserMutationError("Enter an organization handle or account id.", 400);

  const resolved = await resolveBadgeRecipient(trimmed);
  if (resolved.kind !== "did") {
    throw new EndorserMutationError("We couldn't find that account. Check the handle or account id.", 404);
  }

  const existing = await listEndorsers(repoDid);
  const already = existing.find((entry) => entry.subjectDid === resolved.did);
  if (already) return { record: already };

  const label = labelOverride?.trim() || resolved.displayName?.trim() || resolved.handle || resolved.did;
  const record: Record<string, unknown> = {
    $type: ENDORSER_COLLECTION,
    subject: resolved.did,
    label,
    createdAt: new Date().toISOString(),
  };
  if (resolved.handle) record.handle = resolved.handle;

  const created = await cgsMutate(repoDid, cookie, {
    operation: "createRecord",
    collection: ENDORSER_COLLECTION,
    record,
  });
  if (!created.uri) throw new EndorserMutationError("Could not save the endorser.", 502);

  return {
    record: {
      rkey: created.uri.split("/").pop() ?? "",
      uri: created.uri,
      subjectDid: resolved.did,
      handle: resolved.handle,
      label,
      note: null,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    },
  };
}

/** Remove an endorser by its record key. */
export async function removeEndorser(repoDid: string, cookie: string | null, rkey: string): Promise<void> {
  const trimmed = rkey.trim();
  if (!trimmed) throw new EndorserMutationError("A record id is required.", 400);
  await cgsMutate(repoDid, cookie, {
    operation: "deleteRecord",
    collection: ENDORSER_COLLECTION,
    rkey: trimmed,
  });
}
