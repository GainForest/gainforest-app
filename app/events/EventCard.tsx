import Link from "next/link";
import { CalendarIcon, MapPinIcon, VideoIcon } from "lucide-react";
import { eventHref } from "@/app/_lib/urls";
import { type CommunityEvent, type ProfileLite, profileLabel } from "@/app/_lib/events";
import { formatEventWhen, modeLabels } from "./_lib/format";

function LiveBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      {label}
    </span>
  );
}

/** A single, borderless event row. Parent lists separate rows with dividers
 *  (divide-y divide-border) — the golden rule: no bordered/shadowed boxes. */
export function EventCard({
  event,
  host,
  live = false,
  liveLabel = "Live",
  locale,
}: {
  event: CommunityEvent;
  host?: ProfileLite;
  live?: boolean;
  liveLabel?: string;
  locale?: string;
}) {
  const when = formatEventWhen(event, locale);
  const modes = modeLabels();
  const secondary = event.mode === "virtual" ? modes.virtual : event.location ?? modes[event.mode];

  return (
    <li>
      <Link
        href={eventHref(event.did, event.rkey)}
        className="group -mx-3 flex gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-muted/60"
      >
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary/30 to-primary/10">
          {event.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="flex size-full items-center justify-center text-primary/50">
              <CalendarIcon className="size-6" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{when.dateLabel}</span>
            {when.timeLabel ? <span>· {when.timeLabel}</span> : null}
            {live ? <LiveBadge label={liveLabel} /> : null}
          </div>
          <h3 className="truncate font-semibold text-foreground">{event.name}</h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {event.mode === "virtual" ? (
              <VideoIcon className="size-3.5 shrink-0" />
            ) : (
              <MapPinIcon className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{secondary}</span>
            {host ? <span className="truncate">· {profileLabel(host)}</span> : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
