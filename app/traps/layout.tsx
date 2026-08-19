import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Container from "@/components/ui/container";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";

export const metadata: Metadata = {
  title: "Traps — Trap.NZ Field Records",
  description: "View and manage Trap.NZ field kill and observation records.",
  robots: { index: false, follow: false },
};

/**
 * Admin-gated layout for the Traps section. Only GainForest moderators
 * (members of the admin group) can access these pages.
 */
export default async function TrapsLayout({ children }: { children: React.ReactNode }) {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  return <Container className="pb-8 pt-4">{children}</Container>;
}
