import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { MarkdownDocument } from "../../_components/MarkdownDocument";
import { lexiconHref } from "../../_lib/types";

export const dynamic = "force-static";

const OCCURRENCE_ID = "app.gainforest.dwc.occurrence";
const GUIDE_PATH = path.join(process.cwd(), "docs", "audiomoth-spectrogram-occurrences.md");

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.docs.guides");
  return {
    title: t("audiomothTitle"),
    description: t("audiomothDescription"),
    robots: { index: true, follow: true },
  };
}

export default async function AudioMothSpectrogramOccurrenceGuidePage() {
  const t = await getTranslations("common.docs.guides");
  const source = readFileSync(GUIDE_PATH, "utf8");

  return (
    <>
      <nav className="mb-8 flex flex-wrap items-center gap-2 text-[12.5px]" aria-label={t("breadcrumbAria")}>
        <Link
          href="/docs/lexicons"
          className="inline-flex items-center gap-1.5 text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          {t("schemas")}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <Link href={lexiconHref(OCCURRENCE_ID)} className="font-mono text-primary no-underline hover:underline">
          {OCCURRENCE_ID}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-muted-foreground">{t("usageGuide")}</span>
      </nav>

      <div className="mb-8 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
        <p className="m-0 text-[13.5px] leading-6 text-muted-foreground">{t("guideIntro")}</p>
      </div>

      <MarkdownDocument source={source} />
    </>
  );
}
