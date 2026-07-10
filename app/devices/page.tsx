import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { DeviceMonitor } from "../_components/DeviceMonitor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.devices.metadata");
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: localizedAlternates("/devices"),
    ...socialPreviewMetadata("/devices", title, description),
  };
}

export default function DevicesPage() {
  return <DeviceMonitor />;
}
