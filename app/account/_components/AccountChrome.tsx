"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Container from "@/components/ui/container";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";

function isManageRoute(pathname: string): boolean {
  return /^\/account\/[^/?#]+\/(?:manage|observations\/manage|audio\/manage)(?:[/?#]|$)/.test(stripLocaleFromPathname(pathname));
}

/**
 * Wraps the public account profile chrome (hero + tabs). The same /account/[id]
 * subtree now also hosts management surfaces — the legacy dashboard at
 * /account/[id]/manage and the observations/audio workspaces at
 * /account/[id]/{observations,audio}/manage — which stand alone: user
 * management is moving onto its own pages rather than living inside the
 * profile. On those routes we drop the public hero and tabs and just pass the
 * children through.
 */
export function AccountChrome({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (isManageRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <Container className="pt-4 pb-8">
      {hero}
      {children}
    </Container>
  );
}
