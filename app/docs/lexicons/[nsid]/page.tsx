import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon } from "lucide-react";
import { DefBlock } from "../_components/DefBlock";
import { byId, groupOf, KNOWN_IDS, LEXICONS } from "../_lib/registry";
import { lexiconDescription, lexiconHref, mainDefName, shortName } from "../_lib/types";
import type { DocsLabels } from "../_lib/labels";

type Params = { nsid: string };

export function generateStaticParams(): Params[] {
  return LEXICONS.map((l) => ({ nsid: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { nsid } = await params;
  const doc = byId.get(decodeURIComponent(nsid));
  if (!doc) return {};
  return {
    title: doc.id,
    description: lexiconDescription(doc),
    alternates: { canonical: lexiconHref(doc.id) },
  };
}

export default async function LexiconPage({ params }: { params: Promise<Params> }) {
  const { nsid } = await params;
  const doc = byId.get(decodeURIComponent(nsid));
  if (!doc) notFound();

  const t = await getTranslations("common.docs");
  const labels: DocsLabels = {
    values: t("values"),
    members: t("members"),
    output: t("output"),
    key: t("key"),
    required: t("required"),
  };

  const lexId = doc.id;
  const lastDot = lexId.lastIndexOf(".");
  const nsidPrefix = lexId.slice(0, lastDot + 1);
  const nsidName = lexId.slice(lastDot + 1);

  const mainName = mainDefName(doc);
  const otherDefs = Object.entries(doc.defs).filter(([name]) => name !== mainName);

  const group = groupOf(lexId);
  const siblings = group?.lexicons ?? [];
  const idx = siblings.findIndex((l) => l.id === lexId);
  const prev = idx > 0 ? siblings[idx - 1] : undefined;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;

  const rawSchema = JSON.stringify(doc, null, 2);

  return (
    <>
      <div className="mb-8 flex items-center gap-2 text-[12.5px]">
        <Link
          href="/docs/lexicons"
          className="inline-flex items-center gap-1.5 text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          {t("overview")}
        </Link>
        {group && (
          <>
            <span className="text-muted-foreground/40">/</span>
            <Link
              href={`/docs/lexicons#${group.id}`}
              className="text-muted-foreground no-underline transition-colors hover:text-foreground"
            >
              {group.title}
            </Link>
          </>
        )}
      </div>

      <h1 className="m-0 mb-2 font-serif text-3xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere]">
        <span className="font-mono text-base font-normal text-muted-foreground/50">{nsidPrefix}</span>
        <span className="font-mono">{nsidName}</span>
      </h1>

      <p className="m-0 mb-10 max-w-prose text-[14.5px] leading-relaxed text-muted-foreground">
        {lexiconDescription(doc)}
      </p>

      {lexId === "app.gainforest.dwc.occurrence" && (
        <section className="mb-10 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5" aria-labelledby="audiomoth-occurrence-guide">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <BookOpenIcon className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[11px] font-medium uppercase tracking-[0.12em] text-primary">{t("guides.usageGuide")}</p>
              <h2 id="audiomoth-occurrence-guide" className="mb-1 mt-1 font-serif text-lg font-semibold tracking-tight text-foreground">
                {t("guides.audiomothTitle")}
              </h2>
              <p className="m-0 max-w-[680px] text-[13.5px] leading-6 text-muted-foreground">{t("guides.audiomothDescription")}</p>
              <Link
                href="/docs/lexicons/guides/audiomoth-spectrogram-occurrences"
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary no-underline hover:underline"
              >
                {t("guides.openGuide")}
                <ArrowRightIcon className="size-3.5" />
              </Link>
            </div>
          </div>
        </section>
      )}

      <DefBlock name={mainName} def={doc.defs[mainName]} lexiconId={lexId} known={KNOWN_IDS} labels={labels} primary />

      {otherDefs.length > 0 && (
        <h2 className="mb-4 mt-2 border-t border-border/60 pt-6 font-serif text-base font-semibold text-muted-foreground">
          {t("definitions")}
        </h2>
      )}
      {otherDefs.map(([name, def]) => (
        <DefBlock key={name} name={name} def={def} lexiconId={lexId} known={KNOWN_IDS} labels={labels} />
      ))}

      <details className="group mb-10 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:border-t [&>summary]:border-border/60 [&>summary]:py-2.5 [&>summary]:font-mono [&>summary]:text-[12px] [&>summary]:text-muted-foreground [&>summary]:transition-colors hover:[&>summary]:text-foreground [&>summary::-webkit-details-marker]:hidden">
        <summary>
          <span className="inline-block transition-transform group-open:rotate-90">▸</span> {t("rawSchema")}
        </summary>
        <pre className="m-0 mt-2 overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-[11.5px] leading-relaxed text-foreground">
          {rawSchema}
        </pre>
      </details>

      {(prev || next) && (
        <nav className="grid grid-cols-2 gap-3 border-t border-border/60 pt-6">
          {prev ? (
            <Link
              href={lexiconHref(prev.id)}
              className="group rounded-xl border border-border/60 p-3 no-underline transition-colors hover:border-border hover:bg-muted/40"
            >
              <div className="text-[11px] text-muted-foreground/60">← {t("previous")}</div>
              <div className="mt-0.5 font-mono text-[13px] text-primary group-hover:underline">{shortName(prev.id)}</div>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={lexiconHref(next.id)}
              className="group rounded-xl border border-border/60 p-3 text-right no-underline transition-colors hover:border-border hover:bg-muted/40"
            >
              <div className="text-[11px] text-muted-foreground/60">{t("next")} →</div>
              <div className="mt-0.5 font-mono text-[13px] text-primary group-hover:underline">{shortName(next.id)}</div>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
