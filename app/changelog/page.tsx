import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ChangelogView, type ChangelogData } from "./ChangelogView";
import data from "./changelog-data.json";

const changelog = data as ChangelogData;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("changelog.metadata");
  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/changelog" },
  };
}

export default async function ChangelogPage() {
  const locale = await getLocale();
  const t = await getTranslations("changelog");

  const range =
    changelog.firstDate && changelog.lastDate
      ? `${new Date(changelog.firstDate).toLocaleDateString(locale, { month: "short", year: "numeric" })} – ${new Date(
          changelog.lastDate,
        ).toLocaleDateString(locale, { month: "short", year: "numeric" })}`
      : "";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t("eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {t("heading", { version: changelog.version })}
        </h1>
        <p className="mt-3 max-w-prose text-muted-foreground">{t("intro")}</p>
        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("stats.commits")}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{changelog.total.toLocaleString(locale)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("stats.months")}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{changelog.months.length}</dd>
          </div>
          {range ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("stats.range")}</dt>
              <dd className="text-2xl font-semibold">{range}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <ChangelogView data={changelog} locale={locale} />
    </div>
  );
}
