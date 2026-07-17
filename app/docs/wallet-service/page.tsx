import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon, FingerprintIcon, ShieldCheckIcon, SigmaIcon } from "lucide-react";
import { LogoMark } from "@/app/_components/Logo";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { AddressMath } from "./_components/AddressMath";
import { EnrollJourney } from "./_components/EnrollJourney";
import { Lifecycle } from "./_components/Lifecycle";
import { SpendGate } from "./_components/SpendGate";

const GITHUB_URL = "https://github.com/0xSplits/splits-contracts-monorepo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.walletService");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: await localizedAlternates("/docs/wallet-service"),
  };
}

// An interactive plain-language guide to the passkey donation wallets.
// Each graph reveals one idea: how you get a wallet, where the address
// comes from, who can spend, and what changes once the wallet goes live
// on the blockchain.
export default async function WalletServiceDocsPage() {
  const t = await getTranslations("common.walletService");

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
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{t("lead")}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <FactCard icon={<FingerprintIcon className="h-4 w-4" />} title={t("facts.noSeed.title")} text={t("facts.noSeed.text")} />
        <FactCard
          icon={<SigmaIcon className="h-4 w-4" />}
          title={t("facts.fromAccount.title")}
          text={t("facts.fromAccount.text")}
        />
        <FactCard
          icon={<ShieldCheckIcon className="h-4 w-4" />}
          title={t("facts.noCustodian.title")}
          text={t("facts.noCustodian.text")}
        />
      </section>

      <Section heading={t("what.heading")} intro={t("what.intro")}>
        <p className="max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("what.p1")}</p>
        <p className="mt-4 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("what.p2")}</p>
        <p className="mt-4 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{t("what.p3")}</p>
      </Section>

      <Section heading={t("enroll.heading")} intro={t("enroll.intro")}>
        <EnrollJourney />
      </Section>

      <Section heading={t("address.heading")} intro={t("address.intro")}>
        <AddressMath />
      </Section>

      <Section heading={t("gate.heading")} intro={t("gate.intro")}>
        <SpendGate />
      </Section>

      <Section heading={t("lifecycle.heading")} intro={t("lifecycle.intro")}>
        <Lifecycle />
      </Section>

      <Section heading={t("proof.heading")} intro={t("proof.intro")}>
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-5 sm:px-6">
          <div className="mb-3 flex items-center gap-2 text-primary">
            <ShieldCheckIcon className="h-4 w-4" />
            <span className="font-mono text-[11px] uppercase tracking-[0.1em]">{t("proof.cardLabel")}</span>
          </div>
          <p className="m-0 text-[14px] leading-relaxed text-muted-foreground">{t("proof.text")}</p>
        </div>
      </Section>

      <Section heading={t("limits.heading")} intro={t("limits.intro")}>
        <div className="divide-y divide-border/60 border-y border-border/60">
          <LimitRow title={t("limits.passkeys.title")} text={t("limits.passkeys.text")} />
          <LimitRow title={t("limits.frozen.title")} text={t("limits.frozen.text")} />
          <LimitRow title={t("limits.fees.title")} text={t("limits.fees.text")} />
          <LimitRow title={t("limits.single.title")} text={t("limits.single.text")} />
        </div>
      </Section>

      <section className="mt-16 border-t border-border/60 pt-10">
        <h2 className="m-0 mb-5 font-serif text-xl font-semibold tracking-tight text-foreground">
          {t("more.heading")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <MoreCard href="/docs/ePDS" title={t("more.epdsTitle")} text={t("more.epdsDesc")} />
          <MoreCard href="/docs/lexicons" title={t("more.lexiconsTitle")} text={t("more.lexiconsDesc")} />
          <MoreCard href="/docs/atproto" title={t("more.atprotoTitle")} text={t("more.atprotoDesc")} />
          <MoreCard href={GITHUB_URL} title={t("more.githubTitle")} text={t("more.githubDesc")} external />
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
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16">
      <h2 className="m-0 font-serif text-xl font-semibold tracking-tight text-foreground">{heading}</h2>
      <p className="mt-2 mb-6 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">{intro}</p>
      {children}
    </section>
  );
}

function FactCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border/60 px-4 py-4">
      <div className="mb-2 text-primary">{icon}</div>
      <h2 className="m-0 text-[13px] font-medium text-foreground">{title}</h2>
      <p className="m-0 mt-1 text-[12px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function LimitRow({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-5">
      <h3 className="m-0 text-[13px] font-medium text-foreground">{title}</h3>
      <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function MoreCard({
  href,
  title,
  text,
  external = false,
}: {
  href: string;
  title: string;
  text: string;
  external?: boolean;
}) {
  const className =
    "group rounded-xl border border-border/60 px-5 py-4 no-underline transition-colors hover:border-primary/50";
  const content = (
    <>
      <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-foreground group-hover:text-primary">
        {title}
        <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-50" />
      </div>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{text}</p>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
