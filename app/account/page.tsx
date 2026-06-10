import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Account — GainForest",
  description: "Open your public GainForest account profile.",
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  redirect("/manage");
}
