import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import Container from "@/components/ui/container";
import { EventFormClient } from "../_components/EventFormClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("create.title") };
}

export default async function CreateEventPage() {
  const session = await fetchAuthSession();
  return (
    <Container className="py-8">
      <EventFormClient session={session} />
    </Container>
  );
}
