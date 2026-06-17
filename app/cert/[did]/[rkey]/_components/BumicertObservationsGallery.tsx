"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { RecordDrawer } from "@/app/_components/RecordDrawer";
import type { OccurrenceRecord } from "@/app/_lib/indexer";
import { isPdsBlobUrl } from "@/app/_lib/pds";

export function BumicertObservationsGallery({ observations }: { observations: OccurrenceRecord[] }) {
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
        Observations
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((observation) => (
          <button
            key={observation.id}
            type="button"
            onClick={() => setDrawer(observation)}
            className="group relative aspect-square overflow-hidden rounded-xl bg-muted transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Open observation details"
          >
            {observation.imageUrl ? (
              <Image
                src={observation.imageUrl}
                alt={observation.scientificName || observation.vernacularName || "Observation"}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 180px"
                unoptimized={!isPdsBlobUrl(observation.imageUrl)}
                className="scale-105 object-cover transition-transform duration-500 group-hover:scale-100"
              />
            ) : null}
          </button>
        ))}
      </div>
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
