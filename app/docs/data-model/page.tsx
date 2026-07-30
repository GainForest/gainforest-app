import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon, ArrowUpToLineIcon, FolderTreeIcon, InboxIcon } from "lucide-react";
import { LogoMark } from "@/app/_components/Logo";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { DataJourney } from "./_components/DataJourney";
import { LinkMap } from "./_components/LinkMap";
import { PieceExplorer } from "./_components/PieceExplorer";
import { PublishAs } from "./_components/PublishAs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.dataModel");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: await localizedAlternates("/docs/data-model"),
  };
}

// A plain-language explainer for the shape of GainForest data: what an
// observation, a dataset, a project and an organization actually are, and the
// three different ways they get linked to one another. Prose alternates with
// small self-contained client components (piece explorer, link map, journey
// player, publish-as toy) so the page reads like a guided tour.
export default async function DataModelDocsPage() {
  const t = await getTranslations("common.dataModel");

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-12 text-center">
        <div className="mb-5 flex justify-center text-primary">
          <LogoMark className="h-7 w-7" title="GainForest" />
        </div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {t("kicker")}
        </div>
        <h1 className="m-0 font-serif text-4xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mx-auto mt-4 max-w-prose text-[15px] leading-relaxed text-muted-foreground">{t("lead")}</p>
      </header>

      <Section heading={t("bigIdea.heading")}>
        <p className="max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("bigIdea.p1")}</p>
        <p className="mt-4 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("bigIdea.p2")}</p>
      </Section>

      <Section heading={t("pieces.heading")} intro={t("pieces.intro")}>
        <PieceExplorer />
      </Section>

      <Section heading={t("map.heading")} intro={t("map.intro")}>
        <LinkMap />
      </Section>

      <Section heading={t("kinds.heading")} intro={t("kinds.intro")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <KindCard
            icon={<ArrowUpToLineIcon className="h-4 w-4" />}
            title={t("kinds.pointer.title")}
            text={t("kinds.pointer.text")}
            fields="datasetRef · projectRef · siteRef"
          />
          <KindCard
            icon={<FolderTreeIcon className="h-4 w-4" />}
            title={t("kinds.list.title")}
            text={t("kinds.list.text")}
            fields="items[] · locations[]"
          />
          <KindCard
            icon={<InboxIcon className="h-4 w-4" />}
            title={t("kinds.home.title")}
            text={t("kinds.home.text")}
            fields="at://…"
          />
        </div>
      </Section>

      <Section heading={t("journey.heading")} intro={t("journey.intro")}>
        <DataJourney />
      </Section>

      <Section heading={t("publishAs.heading")} intro={t("publishAs.intro")}>
        <PublishAs />
      </Section>

      <Section heading={t("faq.heading")}>
        <div className="space-y-4">
          <FaqItem question={t("faq.q1.question")} answer={t("faq.q1.answer")} />
          <FaqItem question={t("faq.q2.question")} answer={t("faq.q2.answer")} />
          <FaqItem question={t("faq.q3.question")} answer={t("faq.q3.answer")} />
          <FaqItem question={t("faq.q4.question")} answer={t("faq.q4.answer")} />
          <FaqItem question={t("faq.q5.question")} answer={t("faq.q5.answer")} />
        </div>
      </Section>

      <section className="mt-16 border-t border-border/60 pt-10">
        <h2 className="m-0 mb-5 font-serif text-xl font-semibold tracking-tight text-foreground">
          {t("more.heading")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <MoreCard href="/docs/lexicons" title={t("more.lexiconsTitle")} desc={t("more.lexiconsDesc")} />
          <MoreCard href="/docs/cgs" title={t("more.cgsTitle")} desc={t("more.cgsDesc")} />
          <MoreCard href="/docs/atproto" title={t("more.atprotoTitle")} desc={t("more.atprotoDesc")} />
          <MoreCard href="/docs/ePDS" title={t("more.epdsTitle")} desc={t("more.epdsDesc")} />
        </div>
      </section>
    </div>
  );
}

function Section({
  heading,
  intro,
  children,
}: {
  heading: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 first:mt-0">
      <h2 className="m-0 font-serif text-xl font-semibold tracking-tight text-foreground">{heading}</h2>
      {intro && <p className="mt-2 mb-6 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{intro}</p>}
      {!intro && <div className="mb-6" />}
      {children}
    </section>
  );
}

function KindCard({
  icon,
  title,
  text,
  fields,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  fields: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 px-5 py-4">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <div className="mt-2 text-[13.5px] font-medium text-foreground">{title}</div>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{text}</p>
      <div className="mt-2.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground/60">{fields}</div>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-5 py-4">
      <div className="text-[13.5px] font-medium text-foreground">{question}</div>
      <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{answer}</p>
    </div>
  );
}

function MoreCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
    >
      <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
        {title}
        <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
      </div>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
    </Link>
  );
}
