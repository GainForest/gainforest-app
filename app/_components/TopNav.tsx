import { TopNavView } from "./TopNavView";
import { getSession } from "../_lib/auth-session";

// Server wrapper around the navbar. Resolves the OAuth session + handle
// (server-only work) and hands them to the client-side TopNavView,
// which renders the translatable UI and mounts the LanguageSwitcher.
export async function TopNav() {
  const session = await getSession();
  const did = session?.did ?? null;
  // Best-effort handle resolution — we fetch the DID document directly so
  // we don't need a logged-in agent. Failure is fine: the popover gracefully
  // falls back to "Signed in" without a handle.
  let handle: string | null = null;
  if (did) {
    try {
      const docUrl = did.startsWith("did:plc:")
        ? `https://plc.directory/${did}`
        : did.startsWith("did:web:")
          ? `https://${did.slice("did:web:".length)}/.well-known/did.json`
          : null;
      if (docUrl) {
        const res = await fetch(docUrl, {
          next: { revalidate: 300 },
        });
        if (res.ok) {
          const doc = (await res.json()) as {
            alsoKnownAs?: string[];
          };
          const aka = doc.alsoKnownAs?.find((s) => s.startsWith("at://"));
          if (aka) handle = aka.slice("at://".length);
        }
      }
    } catch {
      // ignore — popover handles null handle
    }
  }
  return <TopNavView signedIn={!!session} handle={handle} />;
}
