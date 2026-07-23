import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { SectionSurface } from "@/components/ui/section-surface";
import { DisplayHeading } from "@/components/ui/typography";

const STEP_KEYS = ["s1", "s2", "s3", "s4", "s5"] as const;

const INFO_SECTIONS = [
  { key: "whatIsDeleted", paragraphs: ["p1"] },
  { key: "whatIsNotDeleted", paragraphs: ["p1", "p2", "p3", "p4"] },
  { key: "help", paragraphs: ["p1"] },
] as const;

const LINKABLE_TEXT_PATTERN = /(team@gainforest\.net|gainforest\.app\/settings|gainforest\.app\/privacy|gainforest\.app)/g;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("deleteAccount.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: await localizedAlternates("/delete-account"),
  };
}

function renderText(text: string): ReactNode {
  return text.split(LINKABLE_TEXT_PATTERN).map((part, index) => {
    if (part === "team@gainforest.net") {
      return (
        <Link key={`${part}-${index}`} href={`mailto:${part}`} className="text-primary underline-offset-4 hover:underline">
          {part}
        </Link>
      );
    }

    if (part === "gainforest.app/settings" || part === "gainforest.app/privacy") {
      return (
        <Link
          key={`${part}-${index}`}
          href={part.slice("gainforest.app".length)}
          className="text-primary underline-offset-4 hover:underline"
        >
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

    return <Fragment key={index}>{part}</Fragment>;
  });
}

export default async function DeleteAccountPage() {
  const t = await getTranslations("deleteAccount");

  return (
    <main className="px-6 py-12 md:py-16">
      <article className="mx-auto max-w-3xl">
        <header>
          <DisplayHeading as="h1" className="text-4xl font-medium tracking-tight text-foreground md:text-5xl">
            {t("title")}
          </DisplayHeading>
          <p className="mt-5 text-sm text-muted-foreground">{t("lastUpdated")}</p>
        </header>

        <p className="mt-10 text-[15px] leading-7 text-muted-foreground">
          {renderText(t("intro.p1"))}
        </p>

        <div className="mt-12 space-y-12">
          <SectionSurface variant="muted" className="scroll-mt-24">
            <DisplayHeading as="h2" className="text-2xl font-medium tracking-tight text-foreground">
              {t("sections.howTo.title")}
            </DisplayHeading>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
              {STEP_KEYS.map((stepKey) => (
                <li key={stepKey}>{renderText(t(`sections.howTo.steps.${stepKey}`))}</li>
              ))}
            </ol>
            <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
              {renderText(t("sections.howTo.p1"))}
            </p>
          </SectionSurface>

          {INFO_SECTIONS.map((section) => (
            <section key={section.key} className="scroll-mt-24">
              <DisplayHeading as="h2" className="text-2xl font-medium tracking-tight text-foreground">
                {t(`sections.${section.key}.title`)}
              </DisplayHeading>
              <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted-foreground">
                {section.paragraphs.map((paragraphKey) => (
                  <p key={paragraphKey}>
                    {renderText(t(`sections.${section.key}.paragraphs.${paragraphKey}`))}
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
