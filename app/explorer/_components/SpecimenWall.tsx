"use client";

import type { LiveOccurrencesSnapshot, LiveOccurrence } from "../../_lib/occurrences-feed";
import { useLocale } from "../../_components/LocaleProvider";
import { getExplorerT } from "../_messages";

// Two-row specimen wall of Darwin Core occurrences.
//
// Direct React port of the swissnex-2026 deck's "specimen wall"
// slide (slide 9). The two rows scroll in opposite directions
// (top → left, bottom → right) so the wall reads as one editorial
// ticker rather than a single conveyor belt. Hover anywhere on the
// wall pauses both rows together (same recipe as
// `.stream-marquee`); the CSS lives in `app/globals.css`.
//
// Cards are square 1:1 with a bottom-anchored caption block over a
// soft dark wash so the scientific name stays legible against any
// photograph. An IUCN red-list category, if known, floats as a tiny
// pill in the top-right corner.

const INTL_LOCALES: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
  sw: "sw-KE",
  id: "id-ID",
};

export function SpecimenWall({ snapshot }: { snapshot: LiveOccurrencesSnapshot }) {
  const { locale } = useLocale();
  const t = getExplorerT(locale);
  const intlLocale = INTL_LOCALES[locale] ?? "en-US";
  const fmt = new Intl.NumberFormat(intlLocale);

  const records = snapshot.records;

  // Interleave records across the two rows so each is its own sample
  // of the feed (not first-half / second-half of the same list).
  // Mirrors the deck's behaviour.
  const evens = records.filter((_, i) => i % 2 === 0);
  const odds = records.filter((_, i) => i % 2 === 1);

  return (
    <section className="relative bg-[#fbf8f0]" id="specimens">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-16 sm:px-10 lg:px-16 lg:pt-24">
        <div className="grid grid-cols-12 items-end gap-6 lg:gap-10">
          <div className="col-span-12 lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("explorer.specimens.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[34px] sm:text-[42px] lg:text-[54px] font-normal leading-[1.05] tracking-[-0.015em] text-foreground">
              {t("explorer.specimens.heading.before")}{" "}
              <span className="font-instrument italic">
                {t("explorer.specimens.heading.italic")}
              </span>
              {t("explorer.specimens.heading.after")}
            </h2>
            <p className="mt-5 max-w-[640px] text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/75">
              {t("explorer.specimens.lede")}
            </p>
          </div>

          {/* Right rail ; tiny stats block matching the deck's
              spec-header.meta cluster. */}
          <div className="col-span-12 flex flex-col items-start gap-2 lg:col-span-5 lg:items-end">
            <div className="flex items-baseline gap-2">
              <span className="font-garamond text-[28px] sm:text-[32px] lg:text-[36px] font-medium leading-none text-foreground">
                {fmt.format(snapshot.taxa)}
              </span>
              <span className="font-instrument italic text-[14px] text-foreground/65 lg:text-[15px]">
                {t("explorer.specimens.taxa")}
              </span>
            </div>
            <div className="text-[13px] text-foreground/65 lg:text-right">
              {fmt.format(snapshot.communities)} {t("explorer.specimens.communities")}
              <span aria-hidden> · </span>
              {fmt.format(snapshot.total)} {t("explorer.specimens.records")}
            </div>
            <div className="font-mono text-[11px] text-primary">
              app.gainforest.dwc.occurrence
            </div>
          </div>
        </div>
      </div>

      {/* The wall itself ; two rows scrolling opposite directions. The
          parent <div> with class `spec-wall` is what owns the hover-
          pause and the edge-fade mask. */}
      {records.length > 0 ? (
        <div
          className="spec-wall mt-10 border-y border-border-soft py-3 lg:mt-14"
          aria-label={t("explorer.specimens.eyebrow")}
          style={{ height: "calc(2 * clamp(140px, 16vw, 200px) + 1.6rem)" }}
        >
          <SpecimenRow
            records={evens}
            direction="left"
            unidentifiedLabel={t("explorer.specimens.unidentified")}
          />
          <div className="h-2" />
          <SpecimenRow
            records={odds.length ? odds : evens}
            direction="right"
            unidentifiedLabel={t("explorer.specimens.unidentified")}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-[1480px] px-6 py-8 text-center font-instrument italic text-[14px] text-foreground/55 sm:px-10 lg:px-16">
          {t("explorer.specimens.empty")}
        </div>
      )}

      <p className="mx-auto max-w-[1480px] px-6 pt-4 pb-16 text-center font-instrument italic text-[13px] text-foreground/55 sm:px-10 lg:px-16 lg:pb-24">
        {t("explorer.specimens.hint")}
      </p>
    </section>
  );
}

function SpecimenRow({
  records,
  direction,
  unidentifiedLabel,
}: {
  records: LiveOccurrence[];
  direction: "left" | "right";
  unidentifiedLabel: string;
}) {
  // Empty rows guard: never render an animation if the bucket somehow
  // ended up empty (e.g. only one occurrence after filtering).
  if (records.length === 0) return null;

  return (
    <div
      className="spec-row"
      style={{ height: "clamp(140px, 16vw, 200px)" }}
    >
      <div
        className={`spec-track ${direction === "left" ? "spec-track-left" : "spec-track-right"}`}
      >
        {records.map((r) => (
          <SpecimenCard key={r.id} record={r} unidentifiedLabel={unidentifiedLabel} />
        ))}
        {records.map((r) => (
          <SpecimenCard
            key={`dup-${r.id}`}
            record={r}
            unidentifiedLabel={unidentifiedLabel}
            ariaHidden
          />
        ))}
      </div>
    </div>
  );
}

function SpecimenCard({
  record,
  unidentifiedLabel,
  ariaHidden,
}: {
  record: LiveOccurrence;
  unidentifiedLabel: string;
  ariaHidden?: boolean;
}) {
  const sci = record.scientificName || record.vernacularName || unidentifiedLabel;
  const cc =
    record.countryCode ||
    (record.country ? record.country.slice(0, 2).toUpperCase() : "");
  const coord = formatCoord(record.lat, record.lon);

  return (
    <article
      aria-hidden={ariaHidden}
      className="relative aspect-square h-full shrink-0 overflow-hidden rounded-lg border border-border-soft bg-[#e1dccf] transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-16px_rgba(20,30,15,0.4)]"
    >
      {record.iucn && (
        <span
          className="absolute right-1.5 top-1.5 z-20 rounded-full bg-background/95 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-primary-dark"
          title={`IUCN ${record.iucn}`}
        >
          {record.iucn}
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={record.imageUrl}
        alt={ariaHidden ? "" : sci}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-[1.04]"
      />
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-0.5 px-2 pb-1.5 pt-2.5"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(20,20,18,0.55) 45%, rgba(20,20,18,0.85) 100%)",
        }}
      >
        <div
          className="font-instrument italic text-[11.5px] leading-[1.15] text-[#f4efe4]"
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
          title={sci}
        >
          {sci}
        </div>
        <div className="flex items-baseline justify-between font-mono text-[9.5px] text-[#f4efe4]/80">
          <span>{coord}</span>
          {cc && <span className="text-brand">{cc}</span>}
        </div>
      </div>
    </article>
  );
}

function formatCoord(lat: number | null, lon: number | null): string {
  if (lat == null || lon == null) return "";
  return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}
