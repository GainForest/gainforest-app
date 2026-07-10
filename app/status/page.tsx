import type { Metadata } from "next";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { StatusSection } from "../_components/StatusSection";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Site health",
  description:
    "Live health of the services behind GainForest.",
  alternates: localizedAlternates("/status"),
};

export default function StatusPage() {
  return <StatusSection />;
}
