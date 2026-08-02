import { fetchReceipts } from "@/app/_lib/dashboard";
import { fetchAuthSession } from "@/app/_lib/auth-server";

export const runtime = "nodejs";

/**
 * Capability signals for the signed-in account, used by the sidebar to decide
 * which personal nav groups ("Your funding") to show. Donation receipts are
 * only ever revealed to the account they belong to, so this is session-gated
 * and ignores any did supplied by the caller.
 */
export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) {
    return Response.json({ error: "not_signed_in" }, { status: 401 });
  }

  const receipts = await fetchReceipts().catch(() => []);
  const donationCount = receipts.filter(
    (receipt) => receipt.from?.type === "did" && receipt.from.id === session.did,
  ).length;

  return Response.json(
    { donationCount },
    { headers: { "cache-control": "private, max-age=120" } },
  );
}
