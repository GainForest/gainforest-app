"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BrushedText } from "../../_components/BrushedText";
import { useLocale } from "../../_components/LocaleProvider";
import type { PartnerOrg } from "../../_lib/partner-orgs";
import { getAboutT } from "../_messages";

// "We are tech support for nature." — editorial hero for the /about
// page. Mirrors the landing hero's typography rhythm (Cormorant
// Garamond display + Instrument Serif italic emphasis on a single
// word) so the two surfaces feel like one site, AND uses the same
// curved brush stroke under an emphasis phrase — the equivalent of
// "tech support" in the active locale, marked with `{...}` in the
// i18n string. See <BrushedText /> for the rendering helper shared
// with the landing hero.
//
// Right column: the SAME MapLibre globe the landing's Partners
// section runs (the port of the merged app's /globe view, with one
// circular logo badge per organization), inside a dark rounded panel.
// July 2026: this replaced the earlier react-globe.gl dotted sphere
// when the whole site moved to the full Ma Earth + GainForest roster
// ("update also the globe on /about" — team ask).
//
// Orgs come from `fetchPartnerOrgs()` on the server (passed down by
// `app/about/page.tsx`) so this component does no fetching of its
// own; the spotlight rotation is the only client-side state.

// maplibre-gl touches window during map construction; client-only.
const PartnersGlobe = dynamic(
  () =>
    import("../../_components/partners-globe/PartnersGlobe").then(
      (m) => m.PartnersGlobe,
    ),
  { ssr: false },
);

// How often we rotate the spotlight target. Matches the cadence
// PartnersClient uses so the two surfaces feel in sync if they're
// both visible in the same scroll.
const SPOTLIGHT_ROTATION_MS = 9_000;

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

export function AboutHero({
  orgs,
  // True count of the partner network (roster length, floored against
  // the indexed-communities total by `app/about/page.tsx`). The globe
  // plots only the orgs with coordinates, but the LIVE badge reports
  // the honest network total so it agrees with the AboutStats
  // "frontline communities" number rather than the smaller mappable
  // subset.
  communitiesTotal,
}: {
  orgs: PartnerOrg[];
  communitiesTotal: number;
}) {
  const { locale } = useLocale();
  const t = getAboutT(locale);

  const before = t("about.hero.heading.before").trim();
  const italic = t("about.hero.heading.italic").trim();
  const after = t("about.hero.heading.after").trim();

  // Spotlight pool: only orgs that actually have a marker on the
  // globe, so the caption always describes something visible. Random
  // pick on mount + every tick, same behaviour as the Partners
  // section; clicking a marker retargets it.
  const pinnedOrgs = useMemo(
    () =>
      orgs.filter(
        (org) => typeof org.lat === "number" && typeof org.lon === "number",
      ),
    [orgs],
  );
  const pinnedOrgsRef = useRef(pinnedOrgs);
  pinnedOrgsRef.current = pinnedOrgs;

  const [spotlight, setSpotlight] = useState<PartnerOrg | null>(null);

  // Initial pick happens in an effect (not a lazy state initializer)
  // so the server-rendered HTML stays deterministic.
  useEffect(() => {
    setSpotlight((current) => current ?? pickRandom(pinnedOrgsRef.current, null));
  }, [pinnedOrgs]);

  // Rotation tick.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSpotlight((current) =>
        pickRandom(pinnedOrgsRef.current, current?.did ?? null) ?? current,
      );
    }, SPOTLIGHT_ROTATION_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-12 gap-6 px-6 pt-12 pb-14 sm:px-10 lg:gap-12 lg:px-16 lg:pt-20 lg:pb-24">
        {/* LEFT: copy */}
        <div className="col-span-12 lg:col-span-7">
          <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
            {t("about.eyebrow")}
          </span>
          <h1 className="mt-5 font-garamond text-[44px] sm:text-[64px] lg:text-[88px] font-normal leading-[1.04] tracking-[-0.015em] text-foreground">
            {/* `before` carries a `{...}` marker around the emphasis
                phrase ("tech support" in EN, equivalent phrase in
                every other locale). <BrushedText /> renders the
                curved hand-drawn paintbrush stroke underneath. */}
            {before && (
              <>
                <BrushedText text={before} />{" "}
              </>
            )}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && (after === "." ? after : <span> {after}</span>)}
          </h1>
          <p className="mt-6 max-w-[560px] text-[16px] lg:text-[18.5px] leading-[1.55] text-foreground/80">
            {t("about.hero.lede")}
          </p>
        </div>

        {/* RIGHT: the live partner globe in a dark rounded panel —
            same visual system as the landing's Partners section so
            the two surfaces read as one site. A small LIVE pill
            anchors the top-right corner; a quiet rotating caption
            underneath identifies the current spotlighted org. */}
        <div className="col-span-12 lg:col-span-5">
          <div className="relative mx-auto flex w-full max-w-[480px] flex-col items-center">
            <div className="relative w-full overflow-hidden rounded-[28px] border border-border-soft bg-[#0b0b19] shadow-[0_30px_70px_-40px_rgba(11,11,25,0.7)]">
              {/* LIVE indicator pill, top-right of the globe panel.
                  Matches the per-page "LIVE" chip used in AboutStats so
                  the page has a single live-data visual vocabulary. */}
              <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-background/75 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark backdrop-blur-sm">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-brand animate-pulse"
                />
                {t("about.live.label")} · {communitiesTotal || orgs.length}
              </div>

              <div className="h-[320px] w-full sm:h-[380px] lg:h-[430px]">
                <PartnersGlobe
                  organizations={pinnedOrgs}
                  initialZoom={1.15}
                  onSelectOrganization={(did) => {
                    const next = pinnedOrgsRef.current.find(
                      (org) => org.did === did,
                    );
                    if (next) setSpotlight(next);
                  }}
                />
              </div>
            </div>

            {/* Spotlight caption — italic, museum-style, sits below
                the globe at the centre. Smooth in/out so the text
                doesn't jolt when the spotlight rotates. */}
            <div className="mt-5 min-h-[44px] w-full text-center">
              {spotlight ? (
                <div
                  key={spotlight.did}
                  className="animate-[heroCaptionIn_360ms_ease-out]"
                >
                  <p className="font-garamond text-[18px] leading-[1.2] text-foreground">
                    {spotlight.name}
                  </p>
                  <p className="mt-1 font-instrument italic text-[13px] tracking-[0.04em] text-foreground/55">
                    {spotlight.country
                      ? `${spotlight.country} · ${t("about.hero.spotlightLabel")}`
                      : t("about.hero.spotlightLabel")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Caption fade-in keyframe — local to this section so it
          doesn't leak into globals.css. */}
      <style jsx>{`
        @keyframes heroCaptionIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
