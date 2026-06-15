import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Dashboard } from "../_components/Dashboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.dashboard.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/donations" },
  };
}

export default function DonationsPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
