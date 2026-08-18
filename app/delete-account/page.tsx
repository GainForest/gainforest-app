import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { localizedAlternates } from "@/app/_lib/seo-metadata";

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
        <div className="rounded-[2rem] border border-border bg-card/70 p-6 shadow-sm md:p-10">
          <header className="border-b border-border pb-8">
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              {t("title")}
            </h1>
            <div className="mt-5 text-sm text-muted-foreground">
              <span>{t("lastUpdated")}</span>
            </div>
          </header>

          <div className="mt-8 space-y-5 text-[15px] leading-7 text-muted-foreground">
            <p>{renderText(t("intro.p1"))}</p>
          </div>

          <div className="mt-10 space-y-10">
            <section className="scroll-mt-24">
              <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
                {t("sections.howTo.title")}
              </h2>
              <ol className="mt-4 list-decimal space-y-3 pl-5 text-[15px] leading-7 text-muted-foreground">
                {STEP_KEYS.map((stepKey) => (
                  <li key={stepKey}>{renderText(t(`sections.howTo.steps.${stepKey}`))}</li>
                ))}
              </ol>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                {renderText(t("sections.howTo.p1"))}
              </p>
            </section>

            {INFO_SECTIONS.map((section) => (
              <section key={section.key} className="scroll-mt-24">
                <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
                  {t(`sections.${section.key}.title`)}
                </h2>
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
        </div>
      </article>
    </main>
  );
}
