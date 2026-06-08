import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Observations — Bumicerts",
  description: "View your public observations.",
  robots: { index: false, follow: false },
};

export default function ManageTimelinePage() {
  redirect("/manage?tab=observations");
}
