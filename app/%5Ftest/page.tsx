import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, HeartHandshakeIcon, MailCheckIcon, SparklesIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TestBadge } from "./_components/TestBadge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function TestRegistryPage() {
  const t = await getTranslations("cart.testRegistry");
  const invitationDelivery = await getTranslations("cart.testRegistry.invitationDelivery");

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-4 mt-4 flex h-10 items-center rounded-xl bg-muted px-4 sm:mx-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <h1 className="text-sm font-medium text-foreground">{t("title")}</h1>
          <TestBadge label={t("testBadge")} description={t("parityBody")} />
        </div>
      </div>
      <div className="mx-auto mt-4 grid max-w-6xl gap-4 px-4 pb-4 sm:grid-cols-2 sm:px-6 sm:pb-6 lg:grid-cols-3">
        <Link
          href="/_test/donation-flow"
          className="group flex min-h-60 flex-col rounded-[2rem] bg-muted p-6 transition-colors hover:bg-muted/70"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <HeartHandshakeIcon className="size-6" aria-hidden />
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {t("mockBadge")}
            </span>
          </div>
          <h2 className="mt-8 text-xl font-semibold text-foreground">{t("experienceTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("experienceDescription")}</p>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary">
            {t("openExperience")}
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>

        <Link
          href="/_test/my-cards"
          className="group flex min-h-60 flex-col rounded-[2rem] bg-muted p-6 transition-colors hover:bg-muted/70"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <SparklesIcon className="size-6" aria-hidden />
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {t("mockBadge")}
            </span>
          </div>
          <h2 className="mt-8 text-xl font-semibold text-foreground">{t("myCardsTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("myCardsDescription")}</p>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary">
            {t("openExperience")}
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>

        <Link
          href="/_test/invitation-delivery"
          className="group flex min-h-60 flex-col rounded-[2rem] bg-muted p-6 transition-colors hover:bg-muted/70"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <MailCheckIcon className="size-6" aria-hidden />
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {invitationDelivery("mockBadge")}
            </span>
          </div>
          <h2 className="mt-8 text-xl font-semibold text-foreground">{invitationDelivery("cardTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{invitationDelivery("cardDescription")}</p>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary">
            {t("openExperience")}
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>
      </div>
    </main>
  );
}
