import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { BioblitzLegalDocument } from "../_components/BioblitzLegalDocument";

const SECTIONS = [
  { key: "eligibility", paragraphs: ["p1", "p2", "p3"] },
  { key: "participation", paragraphs: ["p1", "p2"] },
  { key: "submissions", paragraphs: ["p1", "p2", "p3"] },
  { key: "winners", paragraphs: ["p1", "p2"] },
  { key: "prizes", paragraphs: ["p1", "p2"] },
  { key: "conduct", paragraphs: ["p1"] },
  { key: "publicContent", paragraphs: ["p1", "p2"] },
  { key: "changes", paragraphs: ["p1"] },
  { key: "liability", paragraphs: ["p1"] },
  { key: "law", paragraphs: ["p1"] },
  { key: "contact", paragraphs: ["p1"] },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.bioblitz.legal.terms.metadata");
  return {
    title: t("title"),
    description: t("description"),
    alternates: await localizedAlternates("/bioblitz/terms"),
  };
}

export default async function BioblitzTermsPage() {
  const t = await getTranslations("marketplace.bioblitz.legal");

  return (
    <BioblitzLegalDocument
      eyebrow={t("programLabel")}
      title={t("terms.title")}
      effectiveDate={t("terms.effectiveDate")}
      intro={[t("terms.intro.p1"), t("terms.intro.p2")]}
      sections={SECTIONS.map((section) => ({
        title: t(`terms.sections.${section.key}.title`),
        paragraphs: section.paragraphs.map((paragraph) =>
          t(`terms.sections.${section.key}.paragraphs.${paragraph}`),
        ),
      }))}
      backLabel={t("back")}
      relatedLinks={[
        { href: "/bioblitz/privacy", label: t("links.privacy") },
        { href: "/privacy", label: t("links.generalPrivacy") },
      ]}
    />
  );
}
