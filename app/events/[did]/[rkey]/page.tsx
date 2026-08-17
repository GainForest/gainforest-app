import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarPlusIcon, MapPinIcon, VideoIcon, ExternalLinkIcon } from "lucide-react";
import Container from "@/components/ui/container";
import { accountHref } from "@/app/_lib/urls";
import {
  buildIcs,
  bucketForEvent,
  getEvent,
  resolveEventActorDid,
  resolveProfile,
  profileLabel,
  type CommunityEvent,
} from "@/app/_lib/events";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { formatEventWhen, modeLabels } from "../../_lib/format";
import { RsvpControls } from "./RsvpControls";

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
  const [t, session, host] = await Promise.all([
    getTranslations("events"),
    fetchAuthSession(),
    resolveProfile(event.did),
  ]);
  const when = formatEventWhen(event);
  const modes = modeLabels();
  const bucket = bucketForEvent(event);
  const ics = buildIcs(event);
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  const icsFile = `${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}.ics`;

  return (
    <Container className="py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10">
          {event.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.thumbnailUrl} alt="" className="size-full object-cover" />
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              {event.mode === "virtual" ? <VideoIcon className="size-3.5" /> : <MapPinIcon className="size-3.5" />}
              {modes[event.mode]}
            </span>
            {bucket === "live" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                <span className="size-1.5 rounded-full bg-primary" /> {t("detail.live")}
              </span>
            ) : null}
            {event.status === "cancelled" ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                {t("detail.cancelled")}
              </span>
            ) : null}
          </div>
          <h1 className="font-instrument text-3xl font-light italic leading-[1.1] tracking-[-0.02em] text-foreground md:text-4xl">
            {event.name}
          </h1>
          <p className="text-muted-foreground">
            {when.dateLabel}
            {when.timeLabel ? ` · ${when.timeLabel}` : ""}
            {event.timezone ? ` · ${event.timezone}` : ""}
          </p>
          {event.location && event.mode !== "virtual" ? (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <MapPinIcon className="size-4" /> {event.location}
            </p>
          ) : null}
        </div>

        <RsvpControls
          event={{ uri: event.uri, cid: event.cid, name: event.name }}
          sessionDid={session.isLoggedIn ? session.did : null}
        />

        <a
          href={icsHref}
          download={icsFile}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <CalendarPlusIcon className="size-4" /> {t("detail.addToCalendar")}
        </a>

        {event.description ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("detail.about")}
            </h2>
            <p className="whitespace-pre-wrap text-foreground">{event.description}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("detail.hostedBy")}
          </h2>
          <Link href={accountHref(host.handle ?? host.did)} className="flex w-fit items-center gap-2 hover:underline">
            {host.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={host.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
            ) : (
              <span className="size-8 rounded-full bg-muted" />
            )}
            <span className="font-medium">{profileLabel(host)}</span>
          </Link>
        </div>

        {event.links.length ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("detail.links")}
            </h2>
            <ul className="flex flex-col gap-1">
              {event.links.map((link) => (
                <li key={link.uri}>
                  <a
                    href={link.uri}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    {link.name ?? link.uri}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Container>
  );
}
