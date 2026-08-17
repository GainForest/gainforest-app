import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { HostEventClient } from "../_components/HostEventClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events.host");
  return {
    title: t("title"),
    // The form is personal (draft, edit): keep it out of search results.
    robots: { index: false, follow: false },
  };
}

export default function HostEventPage() {
  return (
    // useSearchParams (the ?edit= mode) requires a Suspense boundary.
    <Suspense fallback={null}>
      <HostEventClient />
    </Suspense>
  );
}
