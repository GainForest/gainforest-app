import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Container from "@/components/ui/container";
import { getEvent, resolveEventActorDid, resolveProfile, type CommunityEvent } from "@/app/_lib/events";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { EventDetailView } from "./EventDetailView";

type Params = { did: string; rkey: string };

async function loadEvent(params: Params): Promise<{ event: CommunityEvent; did: string } | null> {
  const did = await resolveEventActorDid(params.did);
  if (!did) return null;
  const event = await getEvent(did, params.rkey);
  if (!event) return null;
  return { event, did };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const resolved = await loadEvent(await params);
  if (!resolved) return { title: "Event" };
  return { title: resolved.event.name, description: resolved.event.description ?? undefined };
}

export default async function EventDetailPage({ params }: { params: Promise<Params> }) {
  const resolved = await loadEvent(await params);
  if (!resolved) notFound();
  const { event } = resolved;
  const [session, host] = await Promise.all([fetchAuthSession(), resolveProfile(event.did)]);

  return (
    <Container className="py-8">
      <EventDetailView event={event} host={host} sessionDid={session.isLoggedIn ? session.did : null} />
    </Container>
  );
}
