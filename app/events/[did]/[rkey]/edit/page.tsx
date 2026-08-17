import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Container from "@/components/ui/container";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getEvent, resolveEventActorDid } from "@/app/_lib/events";
import { getTranslations } from "next-intl/server";
import { EventFormClient } from "../../../_components/EventFormClient";

type Params = { did: string; rkey: string };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("form.editTitle") };
}

export default async function EditEventPage({ params }: { params: Promise<Params> }) {
  const { did, rkey } = await params;
  const resolvedDid = await resolveEventActorDid(did);
  if (!resolvedDid) notFound();
  const [event, session] = await Promise.all([getEvent(resolvedDid, rkey), fetchAuthSession()]);
  if (!event) notFound();
  return (
    <Container className="py-8">
      <EventFormClient session={session} existing={event} />
    </Container>
  );
}
