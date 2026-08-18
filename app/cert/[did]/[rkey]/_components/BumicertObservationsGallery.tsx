"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RecordDrawer } from "@/app/_components/RecordDrawer";
import { ObservationGrid } from "@/app/_components/ObservationGrid";
import type { OccurrenceRecord } from "@/app/_lib/indexer";

export function BumicertObservationsGallery({ observations }: { observations: OccurrenceRecord[] }) {
  const t = useTranslations("marketplace.observationGrid");
  const [items, setItems] = useState(observations);
  const [drawer, setDrawer] = useState<OccurrenceRecord | null>(null);

  useEffect(() => {
    setItems(observations);
    setDrawer((current) => current ? observations.find((item) => item.atUri === current.atUri) ?? null : null);
  }, [observations]);

  if (items.length === 0) return null;

  return (
    <section className="mt-10 border-t border-border-soft pt-6">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {t("sectionTitle")}
      </h2>
      <ObservationGrid
        records={items}
        onOpen={(record) => {
          if (record.kind === "occurrence") setDrawer(record);
        }}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      />
      <RecordDrawer
        record={drawer}
        onClose={() => setDrawer(null)}
        onRecordUpdated={(record) => {
          if (record.kind !== "occurrence") return;
          setDrawer(record);
          setItems((current) => current.map((item) => (item.atUri === record.atUri ? record : item)));
        }}
        onRecordDeleted={(record) => {
          setDrawer(null);
          setItems((current) => current.filter((item) => item.atUri !== record.atUri));
        }}
      />
    </section>
  );
}
