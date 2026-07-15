import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon, LockIcon, ScrollTextIcon, TimerIcon } from "lucide-react";
import { LogoMark } from "@/app/_components/Logo";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { RequestJourney } from "./_components/RequestJourney";
import { RolePlayground } from "./_components/RolePlayground";
import { ServiceMap } from "./_components/ServiceMap";
import { SharedRepo } from "./_components/SharedRepo";


const GITHUB_URL = "https://github.com/hypercerts-org/certified-group-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.cgs");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: await localizedAlternates("/docs/cgs"),
  };
}

// An interactive explainer for the Certified Group Service, the layer that
// lets a whole team share one AT Protocol account. Prose sections alternate
// with small self-contained client components (shared repo toy, request
// journey, role playground with live audit log, service map) so the page
// reads like a guided tour.
export default async function CgsDocsPage() {
  const t = await getTranslations("common.cgs");

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

      <Section heading={t("repo.heading")} intro={t("repo.intro")}>
        <SharedRepo />
      </Section>

      <Section heading={t("journey.heading")} intro={t("journey.intro")}>
        <RequestJourney />
      </Section>

      <Section heading={t("roles.heading")} intro={t("roles.intro")}>
        <RolePlayground />
      </Section>

      <Section heading={t("map.heading")} intro={t("map.intro")}>
        <ServiceMap />
      </Section>

      <Section heading={t("safety.heading")} intro={t("safety.intro")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <SafetyCard icon={<TimerIcon className="h-4 w-4" />} title={t("safety.pass.title")} text={t("safety.pass.text")} />
          <SafetyCard icon={<LockIcon className="h-4 w-4" />} title={t("safety.vault.title")} text={t("safety.vault.text")} />
          <SafetyCard icon={<ScrollTextIcon className="h-4 w-4" />} title={t("safety.log.title")} text={t("safety.log.text")} />
        </div>
      </Section>

      <section className="mt-16 border-t border-border/60 pt-10">
        <h2 className="m-0 mb-5 font-serif text-xl font-semibold tracking-tight text-foreground">
          {t("more.heading")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <MoreCard href="/docs/lexicons" title={t("more.lexiconsTitle")} desc={t("more.lexiconsDesc")} />
          <MoreCard href="/docs/ePDS" title={t("more.epdsTitle")} desc={t("more.epdsDesc")} />
          <MoreCard href={GITHUB_URL} external title={t("more.githubTitle")} desc={t("more.githubDesc")} />
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

function SafetyCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-5 py-4">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <div className="mt-2 text-[13.5px] font-medium text-foreground">{title}</div>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{text}</p>
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
