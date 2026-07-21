import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, FlaskConicalIcon, HeartHandshakeIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function TestRegistryPage() {
  const t = await getTranslations("cart.testRegistry");

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-primary">
            <FlaskConicalIcon className="size-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">{t("eyebrow")}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{t("title")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{t("description")}</p>
        </div>

        {/* This reminder is intentionally prominent for both developers and AI agents. */}
        <aside className="mt-7 rounded-3xl border border-primary/20 bg-primary/[0.06] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{t("parityTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-foreground/75">{t("parityBody")}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("indexingNote")}</p>
            </div>
          </div>
        </aside>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-foreground">{t("availableTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("availableDescription")}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/_test/donation-flow"
              className="group flex min-h-60 flex-col rounded-[2rem] border border-border-soft bg-surface p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <HeartHandshakeIcon className="size-6" aria-hidden />
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {t("mockBadge")}
                </span>
              </div>
              <h3 className="mt-8 text-xl font-semibold text-foreground">{t("experienceTitle")}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("experienceDescription")}</p>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary">
                {t("openExperience")}
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>

            <Link
              href="/_test/my-cards"
              className="group flex min-h-60 flex-col rounded-[2rem] border border-border-soft bg-surface p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <SparklesIcon className="size-6" aria-hidden />
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {t("mockBadge")}
                </span>
              </div>
              <h3 className="mt-8 text-xl font-semibold text-foreground">{t("myCardsTitle")}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("myCardsDescription")}</p>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary">
                {t("openExperience")}
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
