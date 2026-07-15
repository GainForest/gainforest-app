import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon } from "lucide-react";
import { LogoMark } from "@/app/_components/Logo";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { SchemaGraph } from "./_components/SchemaGraph";
import { GROUPS } from "./_lib/registry";
import { lexiconDescription, lexiconHref } from "./_lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.docs");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: await localizedAlternates("/docs/lexicons"),
  };
}

export default async function LexiconsOverviewPage() {
  const t = await getTranslations("common.docs");

  return (
    <>
      <header className="mb-10">
        <div className="mb-5 text-primary">
          <LogoMark className="h-7 w-7" title="GainForest" />
        </div>
        <h1 className="m-0 font-serif text-4xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-muted-foreground">{t("lead")}</p>
      </header>

      <nav className="mb-12 flex flex-wrap gap-x-5 gap-y-2 border-y border-border/60 py-3 text-[13px] lg:hidden">
        {GROUPS.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            className="text-muted-foreground no-underline transition-colors hover:text-primary"
          >
            {g.title}
          </a>
        ))}
      </nav>

      <figure className="mb-14">
        <SchemaGraph
          labels={{
            samplingContext: t("graph.samplingContext"),
            measurementOrFact: t("graph.measurementOrFact"),
            audiovisualEvidence: t("graph.audiovisualEvidence"),
          }}
        />
        <figcaption className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/60">
          {t("starSchemaCaption")}
        </figcaption>
      </figure>

      <div className="space-y-12">
        {GROUPS.map((g) => (
          <section key={g.id} id={g.id} className="scroll-mt-24">
            <h2 className="m-0 font-serif text-xl font-semibold tracking-tight text-foreground">{g.title}</h2>
            <p className="mt-1 mb-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
              {t(`sections.${g.id}`)}
            </p>

            <ul className="m-0 list-none border-t border-border/60 p-0">
              {g.lexicons.map((lex) => (
                <li key={lex.id} className="border-b border-border/60">
                  <Link
                    href={lexiconHref(lex.id)}
                    className="group flex flex-col gap-1 py-3 no-underline sm:flex-row sm:items-baseline sm:gap-4"
                  >
                    <span className="font-mono text-[12.5px] text-primary [overflow-wrap:anywhere] group-hover:underline sm:w-64 sm:shrink-0">
                      {lex.id}
                    </span>
                    <span className="flex-1 text-sm leading-relaxed text-muted-foreground">
                      {lexiconDescription(lex)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-14 grid gap-3 sm:grid-cols-2">
        <Link
          href="/docs/cgs"
          className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
        >
          <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
            {t("cgsLinkTitle")}
            <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
          </div>
          <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("cgsLinkDesc")}</p>
        </Link>
        <Link
          href="/docs/ePDS"
          className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
        >
          <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
            {t("epdsLinkTitle")}
            <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
          </div>
          <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("epdsLinkDesc")}</p>
        </Link>
      </div>
    </>
  );
}
