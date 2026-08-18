import type { ReactNode } from "react";
import Container from "@/components/ui/container";

/**
 * Wraps the public account profile chrome (hero + tabs). Standalone management
 * pages live in a sibling root route group, so they never enter this profile
 * layout or its loading boundaries.
 */
export function AccountChrome({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  return (
    <Container className="pt-4 pb-8">
      {hero}
      {children}
    </Container>
  );
}
