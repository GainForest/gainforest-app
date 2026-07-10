import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { DeviceMonitor } from "../_components/DeviceMonitor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.devices.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: localizedAlternates("/devices"),
  };
}

export default function DevicesPage() {
  return <DeviceMonitor />;
}
