"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  CalendarIcon,
  CalendarPlusIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  MapPinIcon,
  VideoIcon,
} from "lucide-react";
import { accountHref } from "@/app/_lib/urls";
import {
  buildIcs,
  bucketForEvent,
  profileLabel,
  type CommunityEvent,
  type ProfileLite,
} from "@/app/_lib/events";
import { modeLabels } from "../../_lib/format";
import { RsvpControls } from "./RsvpControls";
import { RsvpSummary } from "./RsvpSummary";
import { EventHeroActions } from "./EventHeroActions";

const chipClass =
  "inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm text-white backdrop-blur";

function fmt(iso: string | null, tz: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz ?? undefined,
  }).format(d);
}

export function EventDetailView({
  event,
  host,
  sessionDid,
}: {
  event: CommunityEvent;
  host: ProfileLite;
  sessionDid: string | null;
}) {
  const t = useTranslations("events");
  const reduce = useReducedMotion();
  const modes = modeLabels();
  const bucket = bucketForEvent(event);
  const ics = buildIcs(event);
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  const icsFile = `${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}.ics`;

  const container: Variants = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.06 } } };
  const item: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Hero card */}
      <motion.div variants={item} className="relative aspect-[5/2] min-h-[200px] w-full overflow-hidden rounded-3xl">
        {event.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/50 to-primary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/40" />

        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-3">
            <Link href="/events" className="inline-flex items-center gap-1 text-white/90 transition-colors hover:text-white">
              <ChevronLeftIcon className="size-5" />
              <span className="text-sm font-medium">{t("nav.label")}</span>
            </Link>
            <EventHeroActions eventDid={event.did} rkey={event.rkey} eventName={event.name} sessionDid={sessionDid} />
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-instrument text-3xl font-light italic leading-[1.1] tracking-[-0.02em] text-white md:text-4xl">
              {event.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className={chipClass}>
                {event.mode === "virtual" ? <VideoIcon className="size-3.5" /> : <MapPinIcon className="size-3.5" />}
                {modes[event.mode]}
              </span>
              {event.startsAt ? (
                <span className={chipClass}>
                  <CalendarIcon className="size-3.5" />
                  <span className="text-white/70">{t("form.starts")}</span>
                  {fmt(event.startsAt, event.timezone)}
                </span>
              ) : null}
              {event.endsAt ? (
                <span className={chipClass}>
                  <span className="text-white/70">{t("form.ends")}</span>
                  {fmt(event.endsAt, event.timezone)}
                </span>
              ) : null}
              {bucket === "live" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
                  <span className="size-1.5 rounded-full bg-current" /> {t("detail.live")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </motion.div>

      {event.location && event.mode !== "virtual" ? (
        <motion.p variants={item} className="flex items-center gap-1.5 text-muted-foreground">
          <MapPinIcon className="size-4" /> {event.location}
        </motion.p>
      ) : null}

      <motion.div variants={item} className="flex flex-col gap-3">
        <RsvpControls event={{ uri: event.uri, cid: event.cid, name: event.name }} sessionDid={sessionDid} />
        <RsvpSummary eventUri={event.uri} hostDid={event.did} sessionDid={sessionDid} />
      </motion.div>

      <motion.a
        variants={item}
        href={icsHref}
        download={icsFile}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <CalendarPlusIcon className="size-4" /> {t("detail.addToCalendar")}
      </motion.a>

      {event.description ? (
        <motion.div variants={item} className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("detail.about")}</h2>
          <p className="whitespace-pre-wrap text-foreground">{event.description}</p>
        </motion.div>
      ) : null}

      <motion.div variants={item} className="flex flex-col gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("detail.hostedBy")}</h2>
        <Link href={accountHref(host.handle ?? host.did)} className="flex w-fit items-center gap-2 hover:underline">
          {host.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={host.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span className="size-8 rounded-full bg-muted" />
          )}
          <span className="font-medium">{profileLabel(host)}</span>
        </Link>
      </motion.div>

      {event.links.length ? (
        <motion.div variants={item} className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("detail.links")}</h2>
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
        </motion.div>
      ) : null}
    </motion.div>
  );
}
