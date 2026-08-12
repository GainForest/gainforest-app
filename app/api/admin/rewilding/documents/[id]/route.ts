import { NextResponse } from "next/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import {
  getRewildingDocument,
  presignRewildingDocument,
  REWILDING_DOCUMENT_LINK_SECONDS,
} from "@/app/admin/_lib/rewilding-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/rewilding/documents/[id] — a short-lived link to one grant
 * document. Grant contracts are private, so the file has no public URL at
 * all: it lives in object storage and is only reachable through this
 * moderator-gated route, which mints a link that expires in minutes.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getGainForestModeratorAccess().catch(() => null);
  if (!access?.isLoggedIn) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (!access.isModerator) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const document = await getRewildingDocument(id);
    if (!document) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(
      { url: presignRewildingDocument(document), expiresInSeconds: REWILDING_DOCUMENT_LINK_SECONDS },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[rewilding] document link failed", error);
    return NextResponse.json({ error: "link_failed" }, { status: 502 });
  }
}
