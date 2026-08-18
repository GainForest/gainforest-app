import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon } from "lucide-react";
import { LogoMark } from "@/app/_components/Logo";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { AddressForge } from "./_components/AddressForge";
import { ContractReader } from "./_components/ContractReader";
import { DonationLedger } from "./_components/DonationLedger";
import { KeyForge } from "./_components/KeyForge";
import { WalletLabProvider } from "./_components/WalletLab";

const CONTRACT_URL =
  "https://github.com/0xSplits/splits-contracts-monorepo/tree/main/packages/smart-vaults";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.walletExplainer");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: await localizedAlternates("/docs/wallet-service"),
  };
}

// An interactive essay on the donation wallet. Instead of describing the
// system, the page lets the reader run it: grow a real P-256 key with
// WebCrypto, derive a real vault address with the factory's own math, read
// the contract lines that make it work, and play through the life of a
// donation. Everything computes locally in the reader's browser.
export default async function WalletServiceDocsPage() {
  const t = await getTranslations("common.walletExplainer");

  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="mb-10">
        <div className="mb-6 flex items-center gap-2.5 text-primary">
          <LogoMark className="h-5 w-5" title="GainForest" />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
            {t("kicker")}
          </span>
        </div>
        <h1 className="m-0 font-serif text-[2.6rem] font-semibold leading-[1.1] tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground">{t("standfirst")}</p>
      </header>

      <WalletLabProvider>
        <Prose>{t("intro.p1")}</Prose>
        <Prose>{t("intro.p2")}</Prose>

        {/* ── Part I ─────────────────────────────────────────────────── */}
        <PartHeading index="I" label={t("part1.label")} heading={t("part1.heading")} />
        <Prose>{t("part1.p1")}</Prose>
        <Prose>{t("part1.p2")}</Prose>
        <KeyForge />
        <Prose>{t("part1.p3")}</Prose>

        {/* ── Part II ────────────────────────────────────────────────── */}
        <PartHeading index="II" label={t("part2.label")} heading={t("part2.heading")} />
        <Prose>{t("part2.p1")}</Prose>
        <Prose>{t("part2.p2")}</Prose>
        <AddressForge />
        <Prose>{t("part2.p3")}</Prose>
      </WalletLabProvider>

      {/* ── Part III ─────────────────────────────────────────────────── */}
      <PartHeading index="III" label={t("part3.label")} heading={t("part3.heading")} />
      <Prose>{t("part3.p1")}</Prose>
      <ContractReader />
      <Prose>{t("part3.p2")}</Prose>

      {/* ── Part IV ──────────────────────────────────────────────────── */}
      <PartHeading index="IV" label={t("part4.label")} heading={t("part4.heading")} />
      <Prose>{t("part4.p1")}</Prose>
      <DonationLedger />
      <Prose>{t("part4.p2")}</Prose>

      {/* ── Epilogue ─────────────────────────────────────────────────── */}
      <div className="mt-14 border-t border-border pt-10">
        <h2 className="m-0 font-serif text-2xl font-semibold tracking-tight text-foreground">
          {t("epilogue.heading")}
        </h2>
        <Prose>{t("epilogue.p1")}</Prose>
        <Prose>{t("epilogue.p2")}</Prose>

        <div className="mt-8 flex flex-col gap-2">
          <ReadingLink href={CONTRACT_URL} external label={t("epilogue.contractLink")} />
          <ReadingLink href="/docs/lexicons" label={t("epilogue.lexiconLink")} />
          <ReadingLink href="/docs/atproto" label={t("epilogue.atprotoLink")} />
        </div>
      </div>
    </article>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="my-5 text-[15px] leading-[1.75] text-foreground/85">{children}</p>;
}

function PartHeading({ index, label, heading }: { index: string; label: string; heading: string }) {
  return (
    <div className="mt-14 mb-6">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-serif text-lg italic text-primary">{index}</span>
        <span className="h-px flex-1 bg-border" aria-hidden />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">{label}</span>
      </div>
      <h2 className="m-0 font-serif text-[1.65rem] font-semibold leading-snug tracking-tight text-foreground">
        {heading}
      </h2>
    </div>
  );
}

function ReadingLink({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
  const className =
    "group inline-flex items-center gap-1.5 text-[14px] text-foreground/85 no-underline hover:text-primary";
  const content = (
    <>
      <span className="border-b border-border pb-0.5 group-hover:border-primary/50">{label}</span>
      <ArrowUpRightIcon className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
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
