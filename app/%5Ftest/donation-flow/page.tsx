import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DonationFlowExperienceClient } from "./_components/DonationFlowExperienceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry");
  return {
    title: t("experienceTitle"),
    description: t("experienceDescription"),
  };
}

export default function DonationFlowExperiencePage() {
  return <DonationFlowExperienceClient />;
}
