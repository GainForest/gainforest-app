"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAccountList } from "@/app/_lib/account-switcher";
import {
  EVENT_DISCOVERY_SEED_DIDS,
  collectRsvpsForEvent,
  listFollowDids,
  profileLabel,
  resolveProfiles,
  type ProfileLite,
} from "@/app/_lib/events";

/**
 * "N going" summary for an event. There is no global RSVP index, so this counts
 * the RSVPs we can actually read — the viewer, their orgs, who they follow, the
 * host, and discovery seeds — i.e. the people in your network who are going.
 */
export function RsvpSummary({
  eventUri,
  hostDid,
  sessionDid,
}: {
  eventUri: string;
  hostDid: string;
  sessionDid: string | null;
}) {
  const t = useTranslations("events");
  const { groups } = useAccountList(sessionDid);
  const [goingCount, setGoingCount] = useState(0);
  const [interestedCount, setInterestedCount] = useState(0);
  const [avatars, setAvatars] = useState<ProfileLite[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function run() {
      const dids = new Set<string>(EVENT_DISCOVERY_SEED_DIDS);
      dids.add(hostDid);
      if (sessionDid) {
        dids.add(sessionDid);
        for (const g of groups) dids.add(g.groupDid);
        for (const d of await listFollowDids(sessionDid, 100, controller.signal)) dids.add(d);
      }
      const rsvps = await collectRsvpsForEvent(eventUri, Array.from(dids), controller.signal).catch(() => []);
      const goingDids = rsvps.filter((r) => r.status === "going").map((r) => r.did);
      const profs = await resolveProfiles(goingDids.slice(0, 8), controller.signal).catch(
        () => new Map<string, ProfileLite>(),
      );
      if (cancelled) return;
      setGoingCount(goingDids.length);
      setInterestedCount(rsvps.filter((r) => r.status === "interested").length);
      setAvatars(goingDids.map((d) => profs.get(d)).filter((p): p is ProfileLite => Boolean(p)));
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [eventUri, hostDid, sessionDid, groups]);

  if (goingCount === 0 && interestedCount === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {avatars.length ? (
        <div className="flex -space-x-2">
          {avatars.slice(0, 5).map((p) =>
            p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.did}
                src={p.avatarUrl}
                alt={profileLabel(p)}
                title={profileLabel(p)}
                className="size-7 rounded-full object-cover ring-2 ring-background"
              />
            ) : (
              <span key={p.did} className="size-7 rounded-full bg-muted ring-2 ring-background" title={profileLabel(p)} />
            ),
          )}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{t("rsvp.goingCount", { count: goingCount })}</span>
        {interestedCount > 0 ? <span> · {t("rsvp.interestedCount", { count: interestedCount })}</span> : null}
      </p>
    </div>
  );
}
