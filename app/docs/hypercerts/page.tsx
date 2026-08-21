import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon, CheckIcon, XIcon } from "lucide-react";
import { LogoMark } from "@/app/_components/Logo";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { DivergenceMatrix } from "./_components/DivergenceMatrix";
import { PublishSequence } from "./_components/PublishSequence";
import { RecordGraph } from "./_components/RecordGraph";
import { RepoPlacement } from "./_components/RepoPlacement";
import { Prose, RichText } from "./_components/RichText";

const PACKAGE_URL = "https://www.npmjs.com/package/@hypercerts-org/lexicon";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.hypercerts");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: await localizedAlternates("/docs/hypercerts"),
  };
}

// A field guide for developers building a third app on the Hypercerts
// lexicons. The schemas are permissive, so the useful documentation is not the
// schema itself but the conventions two production apps — GainForest and Ma
// Earth — actually settled on. Prose alternates with self-contained client
// components (record web, publish sequence, divergence matrix, repo placement)
// so the page can be read as a tour or used as a lookup table.
export default async function HypercertsDocsPage() {
  const t = await getTranslations("common.hypercerts");

  // Literal keys so the static i18n checker can verify every message exists.
  const readingItems = [
    { key: "unions", title: t("reading.items.unions.title"), text: t("reading.items.unions.text") },
    { key: "optional", title: t("reading.items.optional.title"), text: t("reading.items.optional.text") },
    { key: "numbers", title: t("reading.items.numbers.title"), text: t("reading.items.numbers.text") },
    { key: "cids", title: t("reading.items.cids.title"), text: t("reading.items.cids.text") },
    { key: "index", title: t("reading.items.index.title"), text: t("reading.items.index.text") },
    { key: "openStrings", title: t("reading.items.openStrings.title"), text: t("reading.items.openStrings.text") },
  ];
  const patternRules = [
    { key: "r1", title: t("pattern.r1.title"), text: t("pattern.r1.text") },
    { key: "r2", title: t("pattern.r2.title"), text: t("pattern.r2.text") },
    { key: "r3", title: t("pattern.r3.title"), text: t("pattern.r3.text") },
    { key: "r4", title: t("pattern.r4.title"), text: t("pattern.r4.text") },
  ];
  const dos = [t("checklist.do.d1"), t("checklist.do.d2"), t("checklist.do.d3"), t("checklist.do.d4"), t("checklist.do.d5"), t("checklist.do.d6")];
  const donts = [t("checklist.dont.n1"), t("checklist.dont.n2"), t("checklist.dont.n3"), t("checklist.dont.n4"), t("checklist.dont.n5"), t("checklist.dont.n6")];

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

      <Section heading={t("why.heading")}>
        <Prose text={t("why.p1")} />
        <Prose text={t("why.p2")} className="mt-4" />
        <p className="mt-5 border-s-2 border-primary/50 ps-4 text-[14.5px] leading-relaxed text-foreground">
          <RichText text={t("why.callout")} />
        </p>
      </Section>

      <Section heading={t("graph.heading")} intro={t("graph.intro")}>
        <RecordGraph />
      </Section>

      <Section heading={t("pattern.heading")} intro={t("pattern.intro")}>
        <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {patternRules.map((rule, index) => (
            <li key={rule.key} className="rounded-xl border border-border/60 px-5 py-4">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-primary">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="mt-1.5 text-[13.5px] font-medium text-foreground">
                <RichText text={rule.title} />
              </div>
              <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                <RichText text={rule.text} />
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-s-2 border-primary/50 ps-4 text-[14.5px] leading-relaxed text-foreground">
          <RichText text={t("pattern.note")} />
        </p>
      </Section>

      <Section heading={t("sequence.heading")} intro={t("sequence.intro")}>
        <PublishSequence />
      </Section>

      <Section heading={t("divergence.heading")} intro={t("divergence.intro")}>
        <DivergenceMatrix />
      </Section>

      <Section heading={t("repos.heading")} intro={t("repos.intro")}>
        <RepoPlacement />
      </Section>

      <Section heading={t("reading.heading")} intro={t("reading.intro")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {readingItems.map((item) => (
            <div key={item.key} className="rounded-xl border border-border/60 px-5 py-4">
              <div className="text-[13.5px] font-medium text-foreground">
                <RichText text={item.title} />
              </div>
              <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                <RichText text={item.text} />
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section heading={t("checklist.heading")} intro={t("checklist.intro")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChecklistCard label={t("checklist.doLabel")} items={dos} tone="do" />
          <ChecklistCard label={t("checklist.dontLabel")} items={donts} tone="dont" />
        </div>
      </Section>

      <section className="mt-16 border-t border-border/60 pt-10">
        <h2 className="m-0 mb-5 font-serif text-xl font-semibold tracking-tight text-foreground">
          {t("more.heading")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <MoreCard href="/docs/lexicons" title={t("more.lexiconsTitle")} desc={t("more.lexiconsDesc")} />
          <MoreCard href="/docs/cgs" title={t("more.cgsTitle")} desc={t("more.cgsDesc")} />
          <MoreCard href={PACKAGE_URL} external title={t("more.packageTitle")} desc={t("more.packageDesc")} />
          <MoreCard href="/skill.md" external title={t("more.skillTitle")} desc={t("more.skillDesc")} />
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
      {intro ? (
        <p className="mt-2 mb-6 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">
          <RichText text={intro} />
        </p>
      ) : (
        <div className="mb-6" />
      )}
      {children}
    </section>
  );
}

function ChecklistCard({ label, items, tone }: { label: string; items: string[]; tone: "do" | "dont" }) {
  const Icon = tone === "do" ? CheckIcon : XIcon;
  return (
    <div className="rounded-xl border border-border/60 px-5 py-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/70">{label}</div>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <Icon
              className={
                tone === "do"
                  ? "mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                  : "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
              }
            />
            <span className="text-[12.5px] leading-relaxed text-muted-foreground">
              <RichText text={item} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoreCard({
  href,
  title,
  desc,
  external,
}: {
  href: string;
  title: string;
  desc: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
        {title}
        <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
      </div>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
    </>
  );
  const className =
    "group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
