import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { DroneSection } from "../_sections";

export const metadata: Metadata = {
  title: "Manage Drone — GainForest",
  description: "Explore drone and raster evidence for your organization.",
  robots: { index: false, follow: false },
};

export default async function DronePage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <DroneSection target={target} />;
}
