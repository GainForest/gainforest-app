import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon } from "lucide-react";
import { LogoMark } from "@/app/_components/Logo";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { ArchitectureMap } from "./_components/ArchitectureMap";
import { CompareLogin } from "./_components/CompareLogin";
import { LoginJourney } from "./_components/LoginJourney";

const GITHUB_URL = "https://github.com/hypercerts-org/ePDS";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.epds");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: await localizedAlternates("/docs/ePDS"),
  };
}

// An interactive explainer for ePDS, the extended Personal Data Server behind
// GainForest logins. Prose sections alternate with small self-contained
// client components (comparison demo, step-through journey, service map,
// TEE key-safe toy) so the page reads like a guided tour.
export default async function EpdsDocsPage() {
  const t = await getTranslations("common.epds");

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

      <Section heading={t("whatIs.heading")}>
        <p className="max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("whatIs.p1")}</p>
        <p className="mt-4 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("whatIs.p2")}</p>
      </Section>

      <Section heading={t("compare.heading")} intro={t("compare.intro")}>
        <CompareLogin />
      </Section>

      <Section heading={t("journey.heading")} intro={t("journey.intro")}>
        <LoginJourney />
      </Section>

      <Section heading={t("map.heading")} intro={t("map.intro")}>
        <ArchitectureMap />
      </Section>

      <section className="mt-16 border-t border-border/60 pt-10">
        <h2 className="m-0 mb-5 font-serif text-xl font-semibold tracking-tight text-foreground">
          {t("more.heading")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/docs/atproto"
            className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
              {t("more.atprotoTitle")}
              <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
            </div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("more.atprotoDesc")}</p>
          </Link>
          <Link
            href="/docs/cgs"
            className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
              {t("more.cgsTitle")}
              <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
            </div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("more.cgsDesc")}</p>
          </Link>
          <Link
            href="/docs/lexicons"
            className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
              {t("more.lexiconsTitle")}
              <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
            </div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("more.lexiconsDesc")}</p>
          </Link>
          <Link
            href="/docs/ePDS-router"
            className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
              {t("more.routerTitle")}
              <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
            </div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("more.routerDesc")}</p>
          </Link>
          <Link
            href="/docs/wallet-service"
            className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
              {t("more.walletTitle")}
              <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
            </div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("more.walletDesc")}</p>
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
              {t("more.githubTitle")}
              <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
            </div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t("more.githubDesc")}</p>
          </a>
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
