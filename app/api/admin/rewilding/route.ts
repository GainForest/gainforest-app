import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { resolveBlobUrl } from "@/app/_lib/pds";
import { GAINFOREST_MODERATION_REPO_DID } from "@/app/_lib/indexer";
import {
  addRewildingDocument,
  removeRewildingDocument,
  RewildingMutationError,
  setRewildingMilestone,
} from "@/app/admin/_lib/rewilding-mutations";

export const runtime = "nodejs";

/**
 * Admin mutations for the "Rewilding the Web" panel. Gated to GainForest
 * admin-group members; every write lands in the moderation repo through CGS
 * with the acting admin's own session, so the audit trail names them.
 *
 * POST body is a tagged union:
 *   { action: "setMilestone", subjectDid, milestoneId, done }
 *   { action: "addDocument", subjectDid, title, fileName, mimeType, dataBase64 }
 *   { action: "deleteDocument", rkey }
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) return Response.json({ error: "not_signed_in" }, { status: 401 });
  if (!access.isModerator || !access.repoDid) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return Response.json({ error: "invalid_request" }, { status: 400 });

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));

  try {
    if (body.action === "setMilestone") {
      const milestone = await setRewildingMilestone(
        access.repoDid,
        cookie,
        str(body.subjectDid),
        str(body.milestoneId),
        body.done === true,
      );
      return Response.json({ milestone }, { headers: { "cache-control": "no-store" } });
    }

    if (body.action === "addDocument") {
      const document = await addRewildingDocument(access.repoDid, cookie, {
        subjectDid: str(body.subjectDid),
        title: str(body.title),
        fileName: str(body.fileName),
        mimeType: str(body.mimeType),
        dataBase64: str(body.dataBase64),
      });
      const url = await resolveBlobUrl(GAINFOREST_MODERATION_REPO_DID, document.fileCid).catch(
        () => null,
      );
      // Shape matches RewildingAdminDocument, what the panel renders.
      return Response.json(
        {
          document: {
            rkey: document.rkey,
            title: document.title,
            fileName: document.fileName,
            url,
            mimeType: document.fileMimeType,
            createdAt: document.createdAt,
          },
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (body.action === "deleteDocument") {
      await removeRewildingDocument(access.repoDid, cookie, str(body.rkey));
      return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }

    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch (error) {
    const status = error instanceof RewildingMutationError ? error.status : 500;
    const code = error instanceof RewildingMutationError ? error.code : "save_failed";
    return Response.json({ error: code }, { status });
  }
}
