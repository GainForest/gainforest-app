"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon, CalendarRangeIcon, CheckIcon, HeartIcon, ImageOffIcon, MapPinIcon, Share2Icon, UsersIcon, XIcon } from "lucide-react";
import {
  fetchRecordDetail,
  type ExplorerRecord,
  type RecordDetail,
  type DetailSection,
  type DetailBadge,
} from "../_lib/indexer";
import { formatCompact, formatDate, formatNumber, countryFlag } from "../_lib/format";
import { AuthorChip } from "./AuthorChip";
import { RecordLocationMap } from "./RecordLocationMap";
import { RichText } from "./RichText";
import { SocialGlyph, socialLabel } from "./SocialIcon";
import { isPdsBlobUrl, resolveBlobUrl } from "../_lib/pds";
import { pauseOtherAudio } from "../_lib/audio-coordinator";
import {
  INDEXER_URL,
  accountHref,
  localBumicertHref,
} from "../_lib/urls";

// Right-side detail sheet for any explorer record. Slides in over a dimmed
// scrim; Escape or a scrim click closes it. A full-bleed hero image fades into
// the title (Instrument Serif italic, matching the explore cards), followed by
// the owner identity, structured field set for that record kind, and links to
// in-app Bumicerts pages plus external reference surfaces (Green Globe / the
// PDS sync endpoint / Bluesky).

export function RecordDrawer({
  record,
  onClose,
}: {
  record: ExplorerRecord | null;
  onClose: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [resolvedOccurrenceImageUrl, setResolvedOccurrenceImageUrl] = useState<string | null>(null);
  const [resolvedOccurrenceAudioUrl, setResolvedOccurrenceAudioUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  // Whether this Bumicert is currently accepting donations — drives the Donate
  // button. `null` while we don't yet know (loading / non-bumicert).
  const [donatable, setDonatable] = useState<boolean | null>(null);
  useEffect(() => {
    setImgError(false);
    setResolvedOccurrenceImageUrl(null);
    if (!record || record.kind !== "occurrence" || record.imageUrl || !record.imageRef) return;

    const ctrl = new AbortController();
    resolveBlobUrl(record.did, record.imageRef, ctrl.signal)
      .then((url) => setResolvedOccurrenceImageUrl(url))
      .catch(() => {});
    return () => ctrl.abort();
  }, [record]);

  useEffect(() => {
    setResolvedOccurrenceAudioUrl(null);
    if (!record || record.kind !== "occurrence") return;
    if (record.audioUrl) {
      setResolvedOccurrenceAudioUrl(record.audioUrl);
      return;
    }
    if (!record.audioRef) return;

    const ctrl = new AbortController();
    resolveBlobUrl(record.did, record.audioRef, ctrl.signal)
      .then((url) => setResolvedOccurrenceAudioUrl(url))
      .catch(() => {});
    return () => ctrl.abort();
  }, [record]);

  useEffect(() => {
    setDonatable(null);
    if (!record || record.kind !== "bumicert") return;
    const ctrl = new AbortController();
    fetchDonationsOpen(record.did, record.rkey, ctrl.signal)
      .then((open) => setDonatable(open))
      .catch(() => {});
    return () => ctrl.abort();
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

  const siteBannerUrl = record.kind === "site" ? record.bannerUrl ?? (record.coverRef ? record.imageUrl : null) : null;
  const heroUrl = record.kind === "site" ? siteBannerUrl : record.kind === "occurrence" ? record.imageUrl ?? resolvedOccurrenceImageUrl : record.imageUrl;
  const occurrenceAudioUrl = record.kind === "occurrence" ? record.audioUrl ?? resolvedOccurrenceAudioUrl : null;
  const hasOccurrenceAudio = record.kind === "occurrence" && Boolean(record.audioRef || record.audioUrl);
  const ownerAvatarOverride = record.kind === "site" ? record.avatarUrl ?? (!record.coverRef && record.logoRef ? record.imageUrl : null) : undefined;
  const ownerAvatarRefOverride = record.kind === "bumicert" || record.kind === "occurrence" ? record.creatorAvatarRef : record.kind === "site" ? record.logoRef : null;
  const ownerNameOverride = record.kind === "bumicert" || record.kind === "occurrence" ? record.creatorName : record.kind === "site" ? record.name : null;
  const hasHeroImage = Boolean(heroUrl) && !imgError;
  const showAudioHero = hasOccurrenceAudio && !hasHeroImage;
  const showHero = record.kind === "site" || hasHeroImage || showAudioHero;

  // For bumicerts the headline numbers (contributors / places / period) live in
  // the stat strip, the scope tags in the pill row, and the created date in the
  // author chip — so the server's "Claim" section and scope-tag badges would
  // only repeat them. Suppress both for that kind.
  const sections: DetailSection[] =
    record.kind === "bumicert"
      ? []
      : detail
        ? detail.sections
        : [{ title: null, fields: buildFields(record) }];
  const mediaBadges: DetailBadge[] =
    record.kind === "occurrence"
      ? record.media.map((m) => ({ label: mediaLabel(m), tone: "info" }))
      : [];
  const badges = record.kind === "bumicert" ? [] : [...(detail?.badges ?? []), ...mediaBadges];
  const detailHref = record.kind === "bumicert" ? localBumicertHref(record.did, record.rkey) : null;
  const ownerHref = accountHref(record.did);

  // A Bumicert's short description is the single description shown in the
  // drawer; when present, suppress the long-form body so it isn't shown twice.
  const bumicertLead = record.kind === "bumicert" ? record.shortDescription : null;
  const blurb = detail?.blurb ?? "";
  const showLongBody = !bumicertLead;

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="drawer-scrim absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="drawer-sheet thin-scroll relative flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-background shadow-[-24px_0_60px_-30px_rgba(20,30,15,0.5)]">
        {showHero ? (
          <div className="relative">
            <div className="relative aspect-[5/4] w-full overflow-hidden bg-surface-sunken">
              {hasHeroImage ? (
                <Image
                  src={heroUrl!}
                  alt={title}
                  fill
                  priority
                  sizes="480px"
                  unoptimized={!isPdsBlobUrl(heroUrl!)}
                  onError={() => setImgError(true)}
                  className="object-cover"
                />
              ) : showAudioHero ? (
                <AudioHero src={occurrenceAudioUrl} title={title} />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_28%_20%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_58%),linear-gradient(135deg,var(--muted),var(--background))]">
                  <ImageOffIcon className="size-24 text-muted-foreground opacity-50" aria-hidden="true" strokeWidth={1.25} />
                </div>
              )}
              {/* Top scrim keeps the floating controls legible; bottom fade
                  blends the image into the title that overlaps it. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-foreground/35 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/40 to-transparent" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
              <div className="pointer-events-auto">
                <KindBadge record={record} floating />
              </div>
              <div className="pointer-events-auto">
                <CloseButton onClose={onClose} floating />
              </div>
            </div>
          </div>
        ) : (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border-soft bg-background/90 px-5 py-4 backdrop-blur-xl">
            <KindBadge record={record} />
            <CloseButton onClose={onClose} />
          </div>
        )}

        <div className={`px-6 pb-12 ${showHero ? "-mt-10" : "pt-5"}`}>
          <h2 className="relative font-instrument text-[30px] italic leading-[1.08] tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {record.kind === "bumicert" && record.scopeTags && record.scopeTags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {record.scopeTags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="inline-flex h-7 items-center rounded-full bg-muted px-3 text-[13px] font-medium text-muted-foreground"
                >
                  {formatScopeTag(tag)}
                </span>
              ))}
            </div>
          )}
          {record.kind === "occurrence" && record.vernacularName && record.scientificName && (
            <p className="mt-1.5 text-[14px] italic text-foreground/65">{record.vernacularName}</p>
          )}
          {record.kind === "bumicert" && record.shortDescription && (
            <p className="mt-2.5 text-[14.5px] leading-[1.55] text-foreground/72">
              {record.shortDescription}
            </p>
          )}

          {/* Primary actions — donate (only when accepting), open the full
              page, share */}
          {detailHref && (
            <div className="mt-5 flex items-center gap-2.5">
              {donatable && (
                <Link
                  href={detailHref}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-[14px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                >
                  <HeartIcon className="h-4 w-4" />
                  Donate
                </Link>
              )}
              <Link
                href={detailHref}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-border-soft bg-background px-4 text-[14px] font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <ArrowUpRightIcon className="h-4 w-4" />
                View
              </Link>
              <ShareIconButton path={detailHref} />
            </div>
          )}

          {/* Owner identity + created date */}
          <div className="mt-5 rounded-2xl bg-foreground/[0.04] p-3.5">
            <AuthorChip
              did={record.did}
              createdAt={record.createdAt}
              avatarOverride={ownerAvatarOverride}
              avatarRefOverride={ownerAvatarRefOverride}
              nameOverride={ownerNameOverride}
            />
            <Link
              href={ownerHref}
              className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-full border border-border-soft bg-background text-[13px] font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
            >
              View profile
              <ArrowUpRightIcon className="h-3.5 w-3.5" />
            </Link>
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
                    className="grid h-9 w-9 place-items-center rounded-full border border-border-soft bg-background text-foreground/60 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    <SocialGlyph platform={s.platform} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Headline numbers for a Bumicert */}
          {record.kind === "bumicert" && <BumicertStatStrip record={record} />}

          {/* Full description — rich Leaflet document, else plain text. For a
              Bumicert the short description above already covers this. */}
          {showLongBody &&
            (detail?.richBody && detail.richBody.length > 0 ? (
              <div className="mt-5">
                <RichText blocks={detail.richBody} />
              </div>
            ) : (
              blurb.trim().length > 0 && (
                <p className="mt-5 whitespace-pre-line text-[14px] leading-[1.6] text-foreground/75">
                  {blurb}
                </p>
              )
            ))}

          {/* Status + media badges */}
          {badges.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {badges.map((b, i) => (
                <Badge key={`${b.label}-${i}`} badge={b} />
              ))}
            </div>
          )}

          <RecordLocationMap record={record} />

          {/* Grouped detail sections — rich once loaded, base fields meanwhile */}
          {sections.map((s, i) =>
            s.fields.length === 0 ? null : (
              <div key={s.title ?? i} className="mt-6 border-t border-border-soft pt-5">
                {s.title && (
                  <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">
                    {s.title}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                  {s.fields.map((f) => (
                    <div key={f.label} className={f.wide ? "col-span-2" : ""}>
                      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
                        {f.label}
                      </dt>
                      <dd className="mt-1 text-[14px] leading-[1.45] text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ),
          )}

        </div>
      </div>
    </div>
  );
}

function AudioHero({ src, title }: { src: string | null; title: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current?.pause();
  }, [src]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  function handlePlay() {
    pauseOtherAudio(audioRef.current);
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(110%_95%_at_50%_10%,color-mix(in_oklab,var(--primary)_64%,#092014),#07170f)] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-55 [background-image:linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="relative z-[1] flex h-full flex-col justify-end px-7 pb-12 pt-16">
        {src ? (
          <audio
            ref={audioRef}
            controls
            preload="metadata"
            src={src}
            aria-label={`Play sound for ${title}`}
            onPlay={handlePlay}
            className="relative z-[2] h-10 w-full accent-primary"
          />
        ) : null}
      </div>
    </div>
  );
}

function CloseButton({ onClose, floating = false }: { onClose: () => void; floating?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className={
        floating
          ? "inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground/70 shadow-sm backdrop-blur-md transition-colors hover:bg-background hover:text-foreground"
          : "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-soft text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground"
      }
    >
      <XIcon className="h-[15px] w-[15px]" aria-hidden />
    </button>
  );
}

function ShareIconButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  function handleShare() {
    const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Copy link"
      title={copied ? "Copied!" : "Copy link"}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-soft bg-background text-foreground/60 transition-colors hover:border-primary/40 hover:text-primary"
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-primary" />
      ) : (
        <Share2Icon className="h-4 w-4" />
      )}
    </button>
  );
}

function BumicertStatStrip({ record }: { record: Extract<ExplorerRecord, { kind: "bumicert" }> }) {
  const period = useMemo(() => {
    if (!record.startDate && !record.endDate) return null;
    const start = record.startDate ? formatDate(record.startDate) : "—";
    const end = record.endDate ? formatDate(record.endDate) : "—";
    return `${start} → ${end}`;
  }, [record.startDate, record.endDate]);

  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5">
      <StatTile
        icon={<UsersIcon />}
        value={formatCompact(record.contributorCount)}
        label={record.contributorCount === 1 ? "Contributor" : "Contributors"}
      />
      <StatTile
        icon={<MapPinIcon />}
        value={formatCompact(record.locationCount)}
        label={record.locationCount === 1 ? "Site" : "Sites"}
      />
      {period && (
        <StatTile
          className="col-span-2"
          icon={<CalendarRangeIcon />}
          value={period}
          label="Activity period"
          valueClassName="text-[15px] font-medium"
        />
      )}
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
  className = "",
  valueClassName = "text-2xl font-semibold tabular-nums",
}: {
  icon: ReactNode;
  value: string;
  label: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-foreground/5 px-4 py-3 ${className}`}>
      <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
      <span className="flex items-center text-primary [&_svg]:size-4">{icon}</span>
      <div className={`mt-1.5 tracking-[-0.02em] text-foreground ${valueClassName}`}>{value}</div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
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

function formatScopeTag(tag: string): string {
  const clean = tag.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : tag;
}

function KindBadge({ record, floating = false }: { record: ExplorerRecord; floating?: boolean }) {
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
  const cls = floating
    ? "bg-background/80 text-foreground shadow-sm backdrop-blur-md"
    : m.cls;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium ${cls}`}>
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

// Query the Bumicert's funding config to learn whether it is actively
// accepting donations. Donations are "applicable" only when a receiving wallet
// is linked and the status is open (a null status defaults to open). The
// indexer serves `access-control-allow-origin: *`, so the browser can hit it
// directly. Resolves false on any error so the Donate button stays hidden.
async function fetchDonationsOpen(did: string, rkey: string, signal: AbortSignal): Promise<boolean> {
  const uri = `at://${did}/app.gainforest.funding.config/${rkey}`;
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      query: `
        query RecordDrawerFundingConfig($uri: String!) {
          appGainforestFundingConfigByUri(uri: $uri) {
            certifiedProfileData { displayName }
            receivingWallet { ... on AppGainforestFundingConfigEvmLinkRef { uri } }
            status
          }
        }
      `,
      variables: { uri },
    }),
  });

  const json = (await response.json()) as {
    data?: {
      appGainforestFundingConfigByUri?: {
        certifiedProfileData?: { displayName?: string | null } | null;
        receivingWallet?: { uri?: string | null } | null;
        status?: string | null;
      } | null;
    };
  };

  const node = json.data?.appGainforestFundingConfigByUri;
  if (!node?.receivingWallet?.uri) return false;
  const status = node.status ?? "open";
  return status === "open";
}
