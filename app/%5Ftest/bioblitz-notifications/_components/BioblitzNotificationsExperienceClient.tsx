"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, FlaskConicalIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { BioblitzPrizeNotificationStatus, type NotificationSummary } from "@/app/bioblitz/BioblitzAwardControls";

const STATUSES: NotificationSummary[] = [
  { status: "sent", canMarkHandled: false, canRetry: false },
  { status: "delayed", canMarkHandled: true, canRetry: false },
  { status: "missing_email", canMarkHandled: true, canRetry: false },
  { status: "lookup_failed", canMarkHandled: true, canRetry: false },
  { status: "cannot_send", canMarkHandled: true, canRetry: false },
  { status: "not_prepared", canMarkHandled: true, canRetry: true },
  { status: "notification_setup_failed", canMarkHandled: true, canRetry: true },
];

export function BioblitzNotificationsExperienceClient() {
  const registry = useTranslations("cart.testRegistry");
  const page = useTranslations("cart.testRegistry.bioblitzNotifications");
  const [statuses, setStatuses] = useState(STATUSES);
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/_test" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden /> {registry("backToRegistry")}
        </Link>
        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2 text-primary"><FlaskConicalIcon className="size-5" aria-hidden /><span className="text-xs font-semibold uppercase tracking-[0.18em]">{registry("scenarioLabel")}</span></div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{page("title")}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">{page("description")}</p>
        </div>
        <aside className="mt-7 rounded-3xl border border-primary/20 bg-primary/[0.06] p-5 sm:p-6">
          <div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground"><ShieldCheckIcon className="size-5" aria-hidden /></div><div><h2 className="font-semibold">{registry("parityTitle")}</h2><p className="mt-1 text-sm leading-6 text-foreground/75">{registry("parityBody")}</p><p className="mt-2 text-xs text-muted-foreground">{page("mockNote")}</p></div></div>
        </aside>
        <section className="mt-8 space-y-3 rounded-[2rem] border border-border-soft bg-surface p-6 shadow-sm">
          {statuses.map((notification, index) => (
            <BioblitzPrizeNotificationStatus
              key={`${notification.status}-${index}`}
              label={page("fixtureLabel")}
              notification={notification}
              busy={false}
              onRetry={() => setStatuses(current => current.map((item, itemIndex) => itemIndex === index ? { status: "delayed", canMarkHandled: true, canRetry: false } : item))}
              onMarkHandled={() => setStatuses(current => current.map((item, itemIndex) => itemIndex === index ? { status: "handled_manually", canMarkHandled: false, canRetry: false } : item))}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
