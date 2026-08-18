import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { BioblitzLegalDocument } from "../_components/BioblitzLegalDocument";

const SECTIONS = [
  { key: "data", paragraphs: ["p1", "p2", "p3"] },
  { key: "use", paragraphs: ["p1"] },
  { key: "public", paragraphs: ["p1", "p2"] },
  { key: "location", paragraphs: ["p1"] },
  { key: "prizes", paragraphs: ["p1", "p2"] },
  { key: "legalBases", paragraphs: ["p1"] },
  { key: "retention", paragraphs: ["p1"] },
  { key: "rights", paragraphs: ["p1"] },
  { key: "children", paragraphs: ["p1"] },
  { key: "changes", paragraphs: ["p1"] },
  { key: "contact", paragraphs: ["p1"] },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.bioblitz.legal.privacy.metadata");
  return {
    title: t("title"),
    description: t("description"),
    alternates: await localizedAlternates("/bioblitz/privacy"),
  };
}

export default async function BioblitzPrivacyPage() {
  const t = await getTranslations("marketplace.bioblitz.legal");

  return (
    <BioblitzLegalDocument
      eyebrow={t("programLabel")}
      title={t("privacy.title")}
      effectiveDate={t("privacy.effectiveDate")}
      intro={[t("privacy.intro.p1"), t("privacy.intro.p2")]}
      sections={SECTIONS.map((section) => ({
        title: t(`privacy.sections.${section.key}.title`),
        paragraphs: section.paragraphs.map((paragraph) =>
          t(`privacy.sections.${section.key}.paragraphs.${paragraph}`),
        ),
      }))}
      backLabel={t("back")}
      relatedLinks={[
        { href: "/bioblitz/terms", label: t("links.terms") },
        { href: "/privacy", label: t("links.generalPrivacy") },
      ]}
    />
  );
}
