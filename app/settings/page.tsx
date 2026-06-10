import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchAuthSession } from "@/app/_lib/auth-server";

export const metadata: Metadata = {
  title: "Settings — GainForest",
  description: "Manage your GainForest account settings.",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) redirect("/");
  redirect("/manage?tab=settings");
}
