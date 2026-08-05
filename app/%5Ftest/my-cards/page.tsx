import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MyCardsExperienceClient } from "./_components/MyCardsExperienceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry");
  return {
    title: t("myCardsTitle"),
    description: t("myCardsDescription"),
  };
}

export default function TestMyCardsPage() {
  return <MyCardsExperienceClient />;
}
