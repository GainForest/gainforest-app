import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { AudioSection } from "../_sections";

export const metadata: Metadata = {
  title: "Manage Audio — GainForest",
  description: "Manage ecoacoustic and field audio evidence.",
  robots: { index: false, follow: false },
};

export default async function AudioPage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <AudioSection target={target} />;
}
