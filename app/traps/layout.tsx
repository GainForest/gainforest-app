import type { Metadata } from "next";
import Container from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Traps — Trap.NZ Field Records",
  description: "View and manage Trap.NZ field kill and observation records.",
  robots: { index: false, follow: false },
};

export default function TrapsLayout({ children }: { children: React.ReactNode }) {
  return <Container className="pb-8 pt-4">{children}</Container>;
}
