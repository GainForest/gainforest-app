import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Create Cert",
  description: "Create and publish a Cert impact story from GainForest.",
  robots: { index: false, follow: false },
};

export default function CreateBumicertPage() {
  redirect("/manage/certs/new");
}
