import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchAccountSummary } from "@/app/_lib/indexer";

export const dynamic = "force-dynamic";

type ManageAccountKind = "organization" | "user";

export async function GET() {
  const session = await fetchAuthSession();
  let manageAccountKind: ManageAccountKind = "user";

  if (session.isLoggedIn) {
    manageAccountKind = await fetchAccountSummary(session.did)
      .then((summary) => (summary.hasCertifiedOrg || summary.hasGainforestOrg ? "organization" : "user"))
      .catch(() => "user");
  }

  return NextResponse.json({ session, manageAccountKind });
}
