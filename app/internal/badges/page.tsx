import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlertIcon } from "lucide-react";
import { getAuthBaseUrl, getAuthProvider } from "@/app/_lib/auth";
import { SITE_URL } from "@/app/_lib/urls";
import { getInternalBadgeAccess } from "./_lib/access";
import { fetchInternalBadgeData } from "./_lib/badge-records";
import { InternalBadgesDashboard } from "./_components/InternalBadgesDashboard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.internalBadges.meta");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function InternalBadgesPage() {
  const t = await getTranslations("common.internalBadges.access");
  const access = await getInternalBadgeAccess();

  if (!access.isLoggedIn) {
    return <AccessNotice title={t("signedOutTitle")} description={t("signedOutDescription")} actionHref={internalBadgeLoginUrl()} actionLabel={t("signIn")} />;
  }

  if (!access.configured) {
    return <AccessNotice title={t("notConfiguredTitle")} description={t("notConfiguredDescription")} />;
  }

  if (!access.allowed || !access.repoDid) {
    return <AccessNotice title={t("deniedTitle")} description={t("deniedDescription")} />;
  }

  const data = await fetchInternalBadgeData(access.repoDid);
  return <InternalBadgesDashboard initialData={data} writeRepo={access.writeRepo} />;
}

function internalBadgeLoginUrl(): string {
  const complete = new URL("/auth/complete", SITE_URL);
  complete.searchParams.set("redirect", "/internal/badges");
  const url = new URL("/login", getAuthBaseUrl());
  url.searchParams.set("returnTo", complete.toString());
  const provider = getAuthProvider();
  if (provider) url.searchParams.set("provider", provider);
  return url.toString();
}

function AccessNotice({ title, description, actionHref, actionLabel }: { title: string; description: string; actionHref?: string; actionLabel?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <section className="max-w-lg rounded-[2rem] border border-border bg-card p-8 text-center shadow-xl shadow-black/10">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldAlertIcon className="size-6" />
        </div>
        <h1 className="mt-5 font-instrument text-4xl font-light italic tracking-[-0.04em]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="mt-6 inline-flex rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background">
            {actionLabel}
          </Link>
        ) : null}
      </section>
    </main>
  );
}
