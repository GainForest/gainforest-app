import type { Metadata } from "next";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { DeviceMonitor } from "../_components/DeviceMonitor";

export const metadata: Metadata = {
  title: "Tainá devices",
  description:
    "Field updates from GainForest devices running Tainá, including whether each device is active and ready.",
  alternates: localizedAlternates("/devices"),
};

export default function DevicesPage() {
  return <DeviceMonitor />;
}
