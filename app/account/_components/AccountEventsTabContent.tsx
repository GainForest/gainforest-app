import { getTranslations } from "next-intl/server";
import type { AccountRouteData } from "../_lib/account-route";
import { listEventsForDid, bucketForEvent, sortByStartAsc } from "@/app/_lib/events";
import { EventCard } from "@/app/events/EventCard";

/** The community events hosted by this account (personal or organization). */
export async function AccountEventsTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  const [t, events] = await Promise.all([getTranslations("events"), listEventsForDid(did).catch(() => [])]);

  const now = Date.now();
  const upcoming = events.filter((e) => bucketForEvent(e, now) !== "past").sort(sortByStartAsc);
  const past = events.filter((e) => bucketForEvent(e, now) === "past").sort((a, b) => -sortByStartAsc(a, b));

  return (
    <section className="flex flex-col gap-6 py-6">
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border px-8 py-16 text-center">
          <p
            className="max-w-sm text-lg text-foreground/60"
            style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
          >
            {t("discovery.empty")}
          </p>
        </div>
      ) : (
        <>
          {upcoming.length ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("discovery.upcoming")}
              </h2>
              {upcoming.map((e) => (
                <EventCard key={e.uri} event={e} live={bucketForEvent(e, now) === "live"} liveLabel={t("detail.live")} />
              ))}
            </div>
          ) : null}
          {past.length ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("discovery.past")}
              </h2>
              {past.map((e) => (
                <EventCard key={e.uri} event={e} />
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
