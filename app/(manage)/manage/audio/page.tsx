import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { AudioClient } from "./_components/AudioClient";

export const metadata: Metadata = {
  title: "Manage Audio — Bumicerts",
  description: "Manage ecoacoustic and field audio evidence.",
  robots: { index: false, follow: false },
};

export default async function AudioPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;
  return <AudioClient did={session.did} />;
}
