import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { DisplayHeading } from "@/components/ui/typography";

const INTRO_PARAGRAPH_KEYS = ["p1", "p2"] as const;

const POLICY_SECTIONS = [
  { key: "whoWeAre", paragraphs: ["p1", "p2"] },
  { key: "scope", paragraphs: ["p1", "p2", "p3", "p4"] },
  { key: "informationWeCollect", paragraphs: ["p1", "p2", "p3", "p4", "p5", "p6"] },
  { key: "howWeUse", paragraphs: ["p1"] },
  { key: "atProtocolDeletion", paragraphs: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"] },
  { key: "openDataSharing", paragraphs: ["p1", "p2", "p3"] },
  { key: "communitySensitiveData", paragraphs: ["p1"] },
  { key: "legalBases", paragraphs: ["p1"] },
  { key: "retention", paragraphs: ["p1"] },
  { key: "rights", paragraphs: ["p1"] },
  { key: "thirdParties", paragraphs: ["p1"] },
  { key: "children", paragraphs: ["p1"] },
  { key: "security", paragraphs: ["p1"] },
  { key: "internationalTransfers", paragraphs: ["p1"] },
  { key: "changes", paragraphs: ["p1"] },
  { key: "contact", paragraphs: ["p1"] },
] as const;

const LINKABLE_TEXT_PATTERN = /(https:\/\/atproto\.com\/|gainforest\.app|team@gainforest\.net)/g;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: await localizedAlternates("/privacy"),
  };
}

function renderPolicyText(text: string): ReactNode {
  return text.split(LINKABLE_TEXT_PATTERN).map((part, index) => {
    if (part === "team@gainforest.net") {
      return (
        <Link key={`${part}-${index}`} href={`mailto:${part}`} className="text-primary underline-offset-4 hover:underline">
          {part}
        </Link>
      );
    }

    if (part === "gainforest.app") {
      return (
        <Link
          key={`${part}-${index}`}
          href="https://gainforest.app"
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          {part}
        </Link>
      );
    }

    if (part === "https://atproto.com/") {
      return (
        <Link
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          {part}
        </Link>
      );
    }

    return <Fragment key={index}>{part}</Fragment>;
  });
}

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  return (
    <main className="px-6 py-12 md:py-16">
      <article className="mx-auto max-w-3xl">
        <header>
          <DisplayHeading as="h1" className="text-4xl font-medium tracking-tight text-foreground md:text-5xl">
            {t("title")}
          </DisplayHeading>
          <div className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-5">
            <span>{t("effectiveDate")}</span>
            <span>{t("lastUpdated")}</span>
          </div>
        </header>

        <div className="mt-10 space-y-5 rounded-2xl bg-muted p-5 text-[15px] leading-7 text-muted-foreground sm:p-6">
          {INTRO_PARAGRAPH_KEYS.map((key) => (
            <p key={key}>{renderPolicyText(t(`intro.${key}`))}</p>
          ))}
        </div>

        <div className="mt-12 space-y-12">
          {POLICY_SECTIONS.map((section) => (
            <section key={section.key} className="scroll-mt-24">
              <DisplayHeading as="h2" className="text-2xl font-medium tracking-tight text-foreground">
                {t(`sections.${section.key}.title`)}
              </DisplayHeading>
              <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted-foreground">
                {section.paragraphs.map((paragraphKey) => (
                  <p key={paragraphKey}>
                    {renderPolicyText(t(`sections.${section.key}.paragraphs.${paragraphKey}`))}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
