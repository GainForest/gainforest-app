import { fetchVerifiedRecipientAddress } from "@/lib/facilitator/recipient";
import { CHAIN_ID } from "@/lib/facilitator/usdc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const did = new URL(request.url).searchParams.get("did")?.trim();
  if (!did) {
    return Response.json({ hasAttestation: false }, { status: 400 });
  }

  const address = await fetchVerifiedRecipientAddress(did).catch(() => null);
  if (!address) {
    return Response.json({ hasAttestation: false });
  }

  return Response.json({ hasAttestation: true, address, chainId: CHAIN_ID });
}
