import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InvitationDeliveryExperienceClient } from "./_components/InvitationDeliveryExperienceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry.invitationDelivery");
  return { title: t("title"), description: t("description") };
}

export default function InvitationDeliveryExperiencePage() {
  return <InvitationDeliveryExperienceClient />;
}
