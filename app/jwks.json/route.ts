import { NextResponse } from "next/server";

// JWKS endpoint — strips `d` (private component) from the JWKs in
// ATPROTO_JWK_PRIVATE so ATProto authorization servers can verify our
// client assertion signatures. Identical shape to simocracy-v2's
// /jwks.json so the same generate-jwk.mjs script works.
export async function GET() {
  const raw = process.env.ATPROTO_JWK_PRIVATE;
  if (!raw) {
    return NextResponse.json(
      { error: "ATPROTO_JWK_PRIVATE not configured" },
      { status: 500 },
    );
  }
  let privateKey: { keys?: Record<string, unknown>[] };
  try {
    privateKey = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "ATPROTO_JWK_PRIVATE is not valid JSON" },
      { status: 500 },
    );
  }
  const keys = (privateKey.keys ?? []).map((jwk) => {
    const cleaned: Record<string, unknown> = { ...jwk };
    delete cleaned.d;
    delete cleaned.use;
    delete cleaned.key_ops;
    return { ...cleaned, key_ops: ["verify"] };
  });
  return NextResponse.json(
    { keys },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
