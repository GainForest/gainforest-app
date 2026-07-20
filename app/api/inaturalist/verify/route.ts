import { cookies } from "next/headers";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import {
  INATURALIST_CONNECTION_COOKIE,
  cookieOptions,
  fetchINaturalistPublicUser,
  sealJson,
  verificationCodeForDid,
  type INaturalistConnection,
} from "@/app/_lib/inaturalist-proof";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return Response.json({ error: "Please sign in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { profile?: unknown } | null;
  const profile = typeof body?.profile === "string" ? body.profile.trim() : "";
  if (!profile) return Response.json({ error: "Enter an iNaturalist handle or profile link." }, { status: 400 });

  try {
    const code = verificationCodeForDid(session.did).toLowerCase();
    const user = await fetchINaturalistPublicUser(profile);
    if (!user.verificationText.includes(code)) {
      return Response.json({
        error: "We could not find your GainForest DID link in that iNaturalist profile bio.",
        code,
      }, { status: 400 });
    }

    const connection: INaturalistConnection = {
      ownerDid: session.did,
      userId: user.userId,
      login: user.login,
      name: user.name,
      iconUrl: user.iconUrl,
      verifiedAt: Date.now(),
    };
    const cookieStore = await cookies();
    cookieStore.set(INATURALIST_CONNECTION_COOKIE, sealJson(connection), cookieOptions(60 * 60 * 24 * 365));
    return Response.json({
      connected: true,
      account: {
        id: connection.userId,
        login: connection.login,
        name: connection.name,
        iconUrl: connection.iconUrl,
        verifiedAt: connection.verifiedAt,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not verify iNaturalist account." }, { status: 400 });
  }
}
