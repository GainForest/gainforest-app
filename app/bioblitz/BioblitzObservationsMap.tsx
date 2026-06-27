"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPinnedIcon } from "lucide-react";
import { RecordMap } from "../_components/RecordMap";
import { RecordDrawer } from "../_components/RecordDrawer";
import { fetchRoundObservations, type BioblitzRound } from "../_lib/bioblitz";
import type { ExplorerRecord, OccurrenceRecord } from "../_lib/indexer";

// "Observations of the week" — a map of every photo sighting uploaded inside the
// featured round's window. Reuses the shared stream map (clustered markers, rich
// hover cards, and the date/time timeline scrubber), so a click opens the same
// sighting preview drawer used across the app.

type Phase = "loading" | "ready" | "error";

export function BioblitzObservationsMap({ round }: { round: BioblitzRound }) {
  const t = useTranslations("marketplace.bioblitz.map");
  const [records, setRecords] = useState<OccurrenceRecord[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [drawer, setDrawer] = useState<ExplorerRecord | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setPhase("loading");
    setRecords([]);
    fetchRoundObservations(round, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRecords(result);
        setPhase("ready");
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setPhase("error");
      });
    return () => controller.abort();
  }, [round]);

  const hasMappable = records.some((record) => record.lat != null && record.lon != null);

  return (
    <section>
      <div aria-hidden className="mx-auto h-px w-full max-w-6xl bg-border/60" />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex items-start gap-2">
          <span className="mt-1 flex size-5 items-center justify-center text-primary [&_svg]:size-4">
            <MapPinnedIcon aria-hidden />
          </span>
          <h2 className="font-instrument text-2xl font-light italic leading-tight text-foreground">
            {t("heading")}
          </h2>
        </div>
        <p className="mt-1 max-w-xl text-sm leading-snug text-muted-foreground">{t("subtitle")}</p>

        <div className="mt-5">
          {phase === "error" ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-foreground/5 px-6 py-16 text-center">
              <p className="font-instrument text-2xl font-light italic text-foreground">{t("error")}</p>
            </div>
          ) : phase === "ready" && !hasMappable ? (
            <div className="rounded-2xl bg-foreground/5 px-6 py-14 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : phase === "loading" ? (
            <div className="flex h-[68vh] min-h-[440px] w-full items-center justify-center rounded-2xl bg-surface-sunken">
              <span className="inline-flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm font-medium text-muted-foreground">
                <Spinner /> {t("loading")}
              </span>
            </div>
          ) : (
            <RecordMap records={records} kind="occurrence" onOpen={setDrawer} />
          )}
        </div>
      </div>

      <RecordDrawer record={drawer} onClose={() => setDrawer(null)} />
    </section>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
