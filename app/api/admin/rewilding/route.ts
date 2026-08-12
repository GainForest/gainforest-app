import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  RewildingMutationError,
  setRewildingMilestone,
} from "@/app/admin/_lib/rewilding-mutations";
import {
  addRewildingDocument,
  removeRewildingDocument,
  RewildingDocumentError,
} from "@/app/admin/_lib/rewilding-documents";

export const runtime = "nodejs";

/**
 * Admin mutations for the "Rewilding the Web" panel. Gated to GainForest
 * admin-group members.
 *
 * Milestone confirmations are public records in the moderation repo, written
 * through CGS with the acting admin's own session so the audit trail names
 * them. Grant documents are private and go to object storage instead — they
 * are contracts, and nothing about them is world-readable.
 *
 * POST body is a tagged union:
 *   { action: "setMilestone", subjectDid, milestoneId, done }
 *   { action: "addDocument", subjectDid, title, fileName, mimeType, dataBase64 }
 *   { action: "deleteDocument", id }
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

  try {
    if (body.action === "setMilestone") {
      const headerList = await headers();
      const cookie = getAuthForwardCookie(headerList.get("cookie"));
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
      const document = await addRewildingDocument({
        subjectDid: str(body.subjectDid),
        title: str(body.title),
        fileName: str(body.fileName),
        mimeType: str(body.mimeType),
        dataBase64: str(body.dataBase64),
        uploadedByDid: access.session.isLoggedIn ? access.session.did : null,
      });
      // Shape matches RewildingAdminDocument, what the panel renders.
      return Response.json(
        {
          document: {
            id: document.id,
            title: document.title,
            fileName: document.fileName,
            sizeBytes: document.sizeBytes,
            uploadedAt: document.uploadedAt,
          },
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    if (body.action === "deleteDocument") {
      await removeRewildingDocument(str(body.id));
      return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }

    return Response.json({ error: "invalid_request" }, { status: 400 });
  } catch (error) {
    const known = error instanceof RewildingMutationError || error instanceof RewildingDocumentError;
    if (!known) console.error("[rewilding] admin mutation failed", error);
    return Response.json(
      { error: known ? error.code : "save_failed" },
      { status: known ? error.status : 500 },
    );
  }
}
