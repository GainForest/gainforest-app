"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Silently corrects the address bar so the account segment shows the
 * canonical identifier (handle when known, DID otherwise), keeping the
 * sub-route, query and hash. Rendered once in the account layout, so it
 * covers every profile tab.
 *
 * Profiles are reachable by DID, by old handles and by differently-cased
 * handles; all of them render fine, but the address people copy and share
 * should be the canonical one. The previous approach — each tab page
 * rendering nothing and issuing `router.replace` to the canonical URL —
 * re-ran the entire server render, so every profile opened through a DID
 * link loaded twice with a skeleton flash in between. `history.replaceState`
 * is router-synced in Next (usePathname and friends pick the new URL up),
 * so this swaps the URL with no navigation and no server work.
 *
 * Manage routes are deliberately left untouched: the manage dashboard
 * anchors itself to the exact segment that was requested, and rewriting it
 * can break its basePath detection (see resolveAccountManageAccess).
 */
export function AccountCanonicalPath({ identifier }: { identifier: string }) {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    const match = pathname.match(/^(.*\/account\/)([^/?#]+)(\/.*)?$/);
    if (!match) return;
    const [, prefix, rawSegment, rest = ""] = match;
    if (rest === "/manage" || rest.startsWith("/manage/")) return;
    if (safeDecode(rawSegment) === identifier) return;
    const target =
      `${prefix}${encodeURIComponent(identifier)}${rest}` +
      window.location.search +
      window.location.hash;
    window.history.replaceState(null, "", target);
  }, [pathname, identifier]);

  return null;
}
