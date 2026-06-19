import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShieldAlertIcon } from "lucide-react";
import { AuthButton } from "@/app/_components/AuthFlow";
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
    return <AccessNotice title={t("signedOutTitle")} description={t("signedOutDescription")} showAuthButton />;
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

function AccessNotice({ title, description, showAuthButton = false }: { title: string; description: string; showAuthButton?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <section className="max-w-lg rounded-[2rem] bg-card p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldAlertIcon className="size-6" />
        </div>
        <h1 className="mt-5 font-instrument text-4xl font-light italic tracking-[-0.04em]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        {showAuthButton ? (
          <div className="mt-6 flex justify-center">
            <AuthButton session={{ isLoggedIn: false }} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
