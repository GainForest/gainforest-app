import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Account — Bumicerts",
  description: "Open your public GainForest/Bumicerts account profile.",
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  redirect("/manage");
}
