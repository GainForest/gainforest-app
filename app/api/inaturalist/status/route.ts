import { cookies } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  INATURALIST_CONNECTION_COOKIE,
  unsealJson,
  verificationCodeForDid,
  type INaturalistConnection,
} from "@/app/_lib/inaturalist-proof";

export const runtime = "nodejs";

export async function GET() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return Response.json({ connected: false }, { status: 401 });
  const cookieStore = await cookies();
  const connection = unsealJson<INaturalistConnection>(cookieStore.get(INATURALIST_CONNECTION_COOKIE)?.value);
  const verificationCode = verificationCodeForDid(session.did);
  if (!connection || connection.ownerDid !== session.did) {
    return Response.json({ connected: false, verificationCode });
  }
  return Response.json({
    connected: true,
    verificationCode,
    account: {
      id: connection.userId,
      login: connection.login,
      name: connection.name,
      iconUrl: connection.iconUrl,
      verifiedAt: connection.verifiedAt,
    },
  });
}
