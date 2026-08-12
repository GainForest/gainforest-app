import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Container from "@/components/ui/container";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Every admin area is a page of its own, reached from the sidebar's ADMIN
 * section (see app/_components/shell/nav-config.ts). The gate lives here so a
 * new admin page can never ship without it; each page re-checks access anyway
 * because it needs the moderator's repo DID to load its data.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  return <Container className="pt-4 pb-8">{children}</Container>;
}
