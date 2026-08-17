import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import Container from "@/components/ui/container";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { EventsDiscoveryClient } from "./EventsDiscoveryClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("discovery.title"), description: t("discovery.subtitle") };
}

export default async function EventsPage() {
  const [t, session] = await Promise.all([getTranslations("events"), fetchAuthSession()]);
  return (
    <Container className="py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t("discovery.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("discovery.subtitle")}</p>
          </div>
          {session.isLoggedIn ? (
            <Link
              href="/events/new"
              className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              <PlusIcon className="size-4" /> {t("discovery.create")}
            </Link>
          ) : null}
        </div>
        <EventsDiscoveryClient sessionDid={session.isLoggedIn ? session.did : null} />
      </div>
    </Container>
  );
}
