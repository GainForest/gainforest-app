"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  fetchRecordDetail,
  type ExplorerRecord,
  type RecordDetail,
  type DetailSection,
  type DetailBadge,
} from "../_lib/indexer";
import { formatDate, formatNumber, countryFlag } from "../_lib/format";
import { AuthorChip } from "./AuthorChip";
import { RichText } from "./RichText";
import { SocialGlyph, socialLabel } from "./SocialIcon";
import { isPdsBlobUrl } from "../_lib/pds";
import {
  GLOBE_URL,
  accountHref,
  localBumicertHref,
} from "../_lib/urls";

// Right-side detail sheet for any explorer record. Slides in over a dimmed
// scrim; Escape or a scrim click closes it. Shows the record image, the
// structured field set for that record kind, the canonical at:// URI (with a
// copy button), and links to in-app Bumicerts pages plus external reference
// surfaces (Green Globe / the PDS sync endpoint / Bluesky).

export function RecordDrawer({
  record,
  onClose,
}: {
  record: ExplorerRecord | null;
  onClose: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  useEffect(() => {
    setImgError(false);
  }, [record]);
  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [record, onClose]);

  // Fetch the full, drawer-ready detail for the opened record. The list query
  // stays lean (1000 records); the deep field set is pulled per record here.
  useEffect(() => {
    setDetail(null);
    if (!record) return;
    const ctrl = new AbortController();
    fetchRecordDetail(record.atUri, ctrl.signal)
      .then((d) => setDetail(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [record]);

  if (!record) return null;

  const title =
    record.kind === "occurrence"
      ? record.scientificName || record.vernacularName || "Unidentified specimen"
      : record.kind === "bumicert"
        ? record.title
        : record.name;

  const sections: DetailSection[] = detail
    ? detail.sections
    : [{ title: null, fields: buildFields(record) }];
  const mediaBadges: DetailBadge[] =
    record.kind === "occurrence"
      ? record.media.map((m) => ({ label: mediaLabel(m), tone: "info" }))
      : [];
  const badges = [...(detail?.badges ?? []), ...mediaBadges];
  const links = dedupeLinks([...buildLinks(record), ...(detail?.links ?? [])]);

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="drawer-scrim absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="drawer-sheet thin-scroll relative flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-background shadow-[-24px_0_60px_-30px_rgba(20,30,15,0.5)]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-soft bg-background/95 px-5 py-4 backdrop-blur-xl">
          <KindBadge record={record} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-10 pt-5">
          {record.imageUrl && !imgError && (
            <div className="relative mb-5 aspect-[4/3] w-full overflow-hidden rounded-xl border border-border-soft bg-surface-sunken">
              <Image
                src={record.imageUrl}
                alt={title}
                fill
                sizes="480px"
                unoptimized={!isPdsBlobUrl(record.imageUrl)}
                onError={() => setImgError(true)}
                className="object-cover"
              />
            </div>
          )}

          <h2 className="font-garamond text-[26px] font-normal leading-[1.12] tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {record.kind === "occurrence" && record.vernacularName && record.scientificName && (
            <p className="mt-1 text-[14px] italic text-foreground/65">{record.vernacularName}</p>
          )}
          {record.kind === "bumicert" && record.shortDescription && (
            <p className="mt-2 text-[14.5px] leading-[1.5] text-foreground/72">
              {record.shortDescription}
            </p>
          )}

          {/* Owner identity + created date — did:plc resolved to handle/avatar */}
          <div className="mt-5 rounded-xl border border-border-soft bg-surface px-3.5 py-3">
            <AuthorChip
              did={record.did}
              createdAt={record.createdAt}
              avatarOverride={record.kind === "site" ? record.imageUrl : undefined}
            />
          </div>

          {/* Social / website links as minimalist icon buttons */}
          {detail?.socials && detail.socials.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {detail.socials.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  title={socialLabel(s.platform)}
                  aria-label={socialLabel(s.platform)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border-soft text-foreground/60 transition-colors hover:border-primary/40 hover:bg-surface hover:text-primary"
                >
                  <SocialGlyph platform={s.platform} />
                </Link>
              ))}
            </div>
          )}

          {/* Full description — rich Leaflet document, else plain text */}
          {detail?.richBody && detail.richBody.length > 0 ? (
            <RichText blocks={detail.richBody} />
          ) : (
            detail?.blurb && (
              <p className="mt-5 whitespace-pre-line text-[14px] leading-[1.6] text-foreground/75">
                {detail.blurb}
              </p>
            )
          )}

          {/* Status + media badges */}
          {badges.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {badges.map((b, i) => (
                <Badge key={`${b.label}-${i}`} badge={b} />
              ))}
            </div>
          )}

          {/* Grouped detail sections — rich once loaded, base fields meanwhile */}
          {sections.map((s, i) =>
            s.fields.length === 0 ? null : (
              <div key={s.title ?? i} className="mt-5 border-t border-border-soft pt-4">
                {s.title && (
                  <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">
                    {s.title}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                  {s.fields.map((f) => (
                    <div key={f.label} className={f.wide ? "col-span-2" : ""}>
                      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
                        {f.label}
                      </dt>
                      <dd className="mt-0.5 text-[14px] leading-[1.45] text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ),
          )}

          {/* Links */}
          <div className="mt-6 flex flex-col gap-2">
            {record.kind === "bumicert" && (
              <Link
                href={localBumicertHref(record.did, record.rkey)}
                className="group flex items-center justify-between rounded-xl border border-primary/30 bg-primary px-4 py-3 text-[14px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <span>Open Bumicerts detail page</span>
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            )}
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                target={l.href.startsWith("http") ? "_blank" : undefined}
                rel={l.href.startsWith("http") ? "noreferrer" : undefined}
                className="group flex items-center justify-between rounded-xl border border-border-soft bg-surface px-4 py-3 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken"
              >
                <span>{l.label}</span>
                <span aria-hidden className="text-foreground/35 transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
                  {l.href.startsWith("http") ? "↗" : "→"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const BADGE_TONE: Record<DetailBadge["tone"], string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  down: "bg-down/15 text-down",
  info: "bg-foreground/[0.06] text-foreground/70",
};

function Badge({ badge }: { badge: DetailBadge }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${BADGE_TONE[badge.tone]}`}
    >
      {badge.label}
    </span>
  );
}

function mediaLabel(kind: string): string {
  switch (kind) {
    case "image":
      return "Photo";
    case "audio":
      return "Audio";
    case "video":
      return "Video";
    case "spectrogram":
      return "Sound view";
    default:
      return kind;
  }
}

function dedupeLinks<T extends { href: string }>(links: T[]): T[] {
  const seen = new Set<string>();
  return links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)));
}

function KindBadge({ record }: { record: ExplorerRecord }) {
  const map = {
    occurrence: { label: "Nature sighting", cls: "text-primary-dark bg-primary/10" },
    bumicert: { label: "Bumicert", cls: "text-brand-dark bg-brand/12" },
    site: { label: "Project site", cls: "text-foreground/70 bg-foreground/[0.06]" },
  } as const;
  const m = map[record.kind];
  const label =
    record.kind === "site"
      ? record.source === "certified"
        ? "Reviewed organization"
        : "GainForest organization"
      : m.label;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${m.cls}`}>
      {label}
    </span>
  );
}

type Field = { label: string; value: string; wide?: boolean };

function buildFields(r: ExplorerRecord): Field[] {
  const fields: Field[] = [];
  if (r.kind === "occurrence") {
    if (r.family) fields.push({ label: "Family", value: r.family });
    if (r.genus) fields.push({ label: "Genus", value: r.genus });
    if (r.kingdom) fields.push({ label: "Kingdom", value: r.kingdom });
    if (r.basisOfRecord) fields.push({ label: "What was seen", value: r.basisOfRecord });
    if (r.individualCount != null)
      fields.push({ label: "Count", value: formatNumber(r.individualCount) });
    if (r.recordedBy) fields.push({ label: "Shared by", value: r.recordedBy });
    const place = [r.locality, r.country].filter(Boolean).join(", ");
    if (place)
      fields.push({
        label: "Location",
        value: `${countryFlag(r.countryCode)} ${place}`.trim(),
        wide: true,
      });
    if (r.lat != null && r.lon != null)
      fields.push({ label: "Map location", value: `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`, wide: true });
    if (r.eventDate) fields.push({ label: "Observed", value: formatDate(r.eventDate) });
    if (r.media.length)
      fields.push({ label: "Photos or sounds", value: r.media.map(mediaLabel).join(", "), wide: true });
    if (r.remarks) fields.push({ label: "Remarks", value: r.remarks, wide: true });
  } else if (r.kind === "bumicert") {
    fields.push({ label: "Contributors", value: formatNumber(r.contributorCount) });
    fields.push({ label: "Sites", value: formatNumber(r.locationCount) });
    if (r.startDate) fields.push({ label: "Start", value: formatDate(r.startDate) });
    if (r.endDate) fields.push({ label: "End", value: formatDate(r.endDate) });
  } else {
    if (r.country) fields.push({ label: "Country", value: `${countryFlag(r.country)} ${r.country}`.trim() });
    if (r.orgType) fields.push({ label: "Type", value: r.orgType });
  }
  return fields;
}

type LinkItem = { href: string; label: string };

function buildLinks(r: ExplorerRecord): LinkItem[] {
  const links: LinkItem[] = [];
  if (r.kind === "bumicert") {
    links.push({ href: localBumicertHref(r.did, r.rkey), label: "View on Bumicerts" });
  }
  if (r.kind === "site") {
    links.push({ href: accountHref(r.did), label: "View organization on Bumicerts" });
    links.push({ href: GLOBE_URL, label: "Open the Green Globe map" });
  }
  if (r.kind === "occurrence") {
    links.push({ href: accountHref(r.did), label: "View the person who shared this" });
  }
  // Bluesky profile of the record owner is always meaningful.
  links.push({ href: `https://bsky.app/profile/${r.did}`, label: "View public social profile" });
  return links;
}
