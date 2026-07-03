"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useT } from "./LocaleProvider";
import { resolveDidAvatar } from "./partners-globe/did-avatars";
import type { PartnerOrg } from "../_lib/partner-orgs";

// Client child of <Partners />. This section intentionally stays quiet:
// it renders the full Ma Earth + GainForest organization roster on the
// ported merged-app globe (see `partners-globe/PartnersGlobe.tsx`), then
// overlays a spotlight for one real org at a time, picked at random.
// Avatars come from the merged app's Certified profile cards resolved
// through `/api/partner-cards`; no generated or invented partner
// imagery here.
const SPOTLIGHT_ROTATION_MS = 11000;

// maplibre-gl touches window during map construction and ships a large
// bundle; load the globe client-side only, same as the hero globe.
const PartnersGlobe = dynamic(
  () => import("./partners-globe/PartnersGlobe").then((m) => m.PartnersGlobe),
  { ssr: false },
);

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Random org that differs from `excludeDid` when the pool allows it. */
function pickRandom(
  pool: ReadonlyArray<PartnerOrg>,
  excludeDid: string | null,
): PartnerOrg | null {
  if (pool.length === 0) return null;
  const candidates =
    pool.length > 1 && excludeDid
      ? pool.filter((org) => org.did !== excludeDid)
      : pool;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

function SpotlightCard({
  org,
  avatarUrl,
  label,
}: {
  org: PartnerOrg | null;
  avatarUrl: string | null;
  label: string;
}) {
  if (!org) return null;
  return (
    <div className="absolute inset-x-4 bottom-4 z-10 rounded-[22px] border border-border-soft bg-background/92 p-3 shadow-[0_18px_45px_-28px_rgba(28,28,26,0.45)] backdrop-blur-md sm:left-auto sm:right-5 sm:w-[340px]">
      <div className="flex items-center gap-3">
        <div className="relative h-[74px] w-[92px] shrink-0 overflow-hidden rounded-[16px] bg-surface-sunken">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={avatarUrl}
              src={avatarUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-garamond text-[28px] text-foreground/35">
              {initials(org.name)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.18em] text-foreground/42">
            {label}
          </p>
          <p className="mt-1 truncate font-garamond text-[22px] leading-[1.03] text-foreground">
            {org.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {org.country ? (
              <p className="inline-flex rounded-full border border-border-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/52">
                {org.country}
              </p>
            ) : null}
            {org.maEarth ? (
              // Brand name, deliberately untranslated across locales.
              <p className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                <span className="h-1 w-1 rounded-full bg-brand" aria-hidden />
                Ma Earth
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// Small ledger-style card used for community channels under the
// partners stat (YouTube calls + Telegram group). Same chrome as the
// existing monthly-calls card: hairline top border, eyebrow / title /
// body, arrow that nudges on hover.
function CommunityChannelCard({
  href,
  eyebrow,
  title,
  body,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-start gap-4 border-t border-border-soft pt-5 transition-colors hover:border-foreground/25"
    >
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-[0.16em] text-foreground/45">
          {eyebrow}
        </span>
        <span className="mt-1 block font-garamond text-[22px] leading-[1.08] text-foreground sm:text-[24px]">
          {title}
        </span>
        <span className="mt-2 block text-[13px] leading-[1.45] text-foreground/62">
          {body}
        </span>
      </span>
      <span
        aria-hidden
        className="mt-5 shrink-0 text-[20px] text-primary transition-transform group-hover:translate-x-1"
      >
        →
      </span>
    </Link>
  );
}

export function ClientPartners({ orgs }: { orgs: PartnerOrg[] }) {
  const t = useT();
  const before = t("partners.heading.before").trim();
  const italic = t("partners.heading.italic").trim();
  const after = t("partners.heading.after").trim();

  // Spotlight pool: only orgs that actually have a marker on the globe,
  // so the card always describes something the visitor can see.
  const pinnedOrgs = useMemo(
    () =>
      orgs.filter(
        (org) => typeof org.lat === "number" && typeof org.lon === "number",
      ),
    [orgs],
  );
  const total = orgs.length;

  const [spotlight, setSpotlight] = useState<PartnerOrg | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const pinnedOrgsRef = useRef(pinnedOrgs);
  pinnedOrgsRef.current = pinnedOrgs;

  // Initial pick happens in an effect (not a lazy state initializer) so
  // the server-rendered HTML stays deterministic; the card fades in
  // client-side with the first random org.
  useEffect(() => {
    setSpotlight((current) => current ?? pickRandom(pinnedOrgsRef.current, null));
  }, [pinnedOrgs]);

  // Random rotation. Clicking a marker (below) also retargets the
  // spotlight, and the interval simply continues from there.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSpotlight((current) =>
        pickRandom(pinnedOrgsRef.current, current?.did ?? null) ?? current,
      );
    }, SPOTLIGHT_ROTATION_MS);
    return () => window.clearInterval(id);
  }, []);

  // Resolve the spotlighted org's avatar (session-cached by the shared
  // resolver, so revisits are instant).
  useEffect(() => {
    const did = spotlight?.did;
    if (!did || did.startsWith("fallback-")) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    setAvatarUrl(null);
    void resolveDidAvatar(did).then((avatar) => {
      if (!cancelled) setAvatarUrl(avatar);
    });
    return () => {
      cancelled = true;
    };
  }, [spotlight?.did]);

  return (
    <section id="partners" className="scroll-mt-20 border-t border-border-soft lg:scroll-mt-24">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 gap-10 px-6 py-16 sm:gap-12 sm:px-10 sm:py-20 lg:grid-cols-12 lg:items-center lg:gap-16 lg:px-16 lg:py-28">
        <div className="lg:col-span-5">
          <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
            {t("partners.eyebrow")}
          </span>
          <h2 className="mt-4 font-garamond text-[32px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground sm:text-[40px] lg:text-[52px]">
            {before && <span>{before} </span>}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && <span>{after}</span>}
          </h2>
          <p className="mt-6 max-w-[560px] text-[15px] leading-[1.58] text-foreground/70 lg:text-[16px]">
            {t("partners.body")}
          </p>

          <p className="mt-7 flex items-baseline gap-3 text-[14px] text-foreground/55">
            <span className="font-garamond text-[42px] font-normal leading-none tracking-[-0.02em] text-foreground/85">
              {total}
            </span>
            <span className="font-instrument italic text-[14.5px] text-foreground/65">
              {t("partners.statLabel")}
            </span>
          </p>

          {/* Two community-channel cards stacked vertically: async
              (YouTube monthly calls) + sync (Telegram chat group).
              Together they cover the two ways a visitor can plug into
              the steward community without bumping into a paywall. */}
          <div className="mt-8 flex max-w-[520px] flex-col gap-6">
            <CommunityChannelCard
              href="https://www.youtube.com/@gainforest/videos"
              eyebrow={t("partners.callsEyebrow")}
              title={t("partners.callsTitle")}
              body={t("partners.callsBody")}
            />
            <CommunityChannelCard
              href="https://t.me/+g9KzmLsZh882YWE1"
              eyebrow={t("partners.telegramEyebrow")}
              title={t("partners.telegramTitle")}
              body={t("partners.telegramBody")}
            />
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="relative mx-auto max-w-[720px] overflow-hidden rounded-[34px] border border-border-soft bg-[#0b0b19] shadow-[0_30px_70px_-40px_rgba(11,11,25,0.7)] lg:ml-auto">
            <div className="absolute left-5 top-5 z-10 flex items-center gap-3 rounded-full border border-border-soft bg-background/75 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-foreground/50 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              {t("partners.bannerLabel")}
            </div>
            <div className="absolute right-5 top-5 z-10 rounded-full border border-border-soft bg-background/75 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/50 backdrop-blur-sm">
              {total} {t("partners.bannerCountLabel")}
            </div>

            {/* The ported merged-app globe (MapLibre): satellite sphere,
                idle spin, one circular logo badge per organization.
                Clicking a badge retargets the spotlight card. */}
            <div className="h-[430px] w-full sm:h-[470px]">
              <PartnersGlobe
                organizations={pinnedOrgs}
                onSelectOrganization={(did) => {
                  const next = pinnedOrgsRef.current.find(
                    (org) => org.did === did,
                  );
                  if (next) setSpotlight(next);
                }}
              />
            </div>

            <SpotlightCard
              org={spotlight}
              avatarUrl={avatarUrl}
              label={t("partners.recordLabel")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
