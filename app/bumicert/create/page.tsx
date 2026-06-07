import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Create Bumicert",
  description: "Create and publish a Bumicert impact story from GainForest.",
  robots: { index: false, follow: false },
};

export default function CreateBumicertPage() {
  redirect("/manage/bumicerts/new");
}
