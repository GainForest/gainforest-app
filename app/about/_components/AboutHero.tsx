"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrushedText } from "../../_components/BrushedText";
import { useLocale } from "../../_components/LocaleProvider";
import { LiveGlobe } from "../../_components/LiveGlobe";
import type { ProjectPin } from "../../_lib/projects";
import { getAboutT } from "../_messages";

// "We are tech support for nature." — editorial hero for the /about
// page. Mirrors the landing hero's typography rhythm (Cormorant
// Garamond display + Instrument Serif italic emphasis on a single
// word) so the two surfaces feel like one site, AND now uses the
// same curved brush stroke under an emphasis phrase — the
// equivalent of "tech support" in the active locale, marked with
// `{...}` in the i18n string. See <BrushedText /> for the rendering
// helper shared with the landing hero.
//
// Right column: the SAME LiveGlobe the landing's Partners section
// uses, but stripped of its cream tile and chunky rounded card. Here
// the globe floats on the cream page with no border / no fill — only
// a soft drop shadow under the sphere — and rotates through real
// partner spotlights below. The intent is "elegant + transparent"
// per team feedback; the static documentary photo this replaced
// felt like a stock illustration next to the editorial copy.
//
// Pins come from `fetchProjectPins()` on the server (passed down by
// `app/about/page.tsx`) so this component does no fetching of its
// own; the spotlight rotation is the only client-side state.

// How often we rotate the spotlight target. Matches the cadence
// PartnersClient uses so the two surfaces feel in sync if they're
// both visible in the same scroll.
const SPOTLIGHT_ROTATION_MS = 9_000;

type Community = {
  did: string;
  name: string;
  country: string;
  imageUrl: string | null;
};

function uniqueCommunities(pins: ProjectPin[]): Community[] {
  const seen = new Set<string>();
  const list: Community[] = [];
  for (const pin of pins) {
    const name = pin.name.trim();
    if (!name) continue;
    const country = pin.country.trim();
    const key = `${name.toLocaleLowerCase()}|${country.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      did: pin.did,
      name,
      country,
      imageUrl: pin.imageUrl,
    });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function AboutHero({
  pins,
  // True count of indexed GainForest communities (from the server's
  // fetchCommunitiesTotal). The globe still plots only the mappable
  // `pins`, but the LIVE badge reports the honest community total so it
  // agrees with the AboutStats "frontline communities" number rather than
  // the smaller mappable-pin subset.
  communitiesTotal,
}: {
  pins: ProjectPin[];
  communitiesTotal: number;
}) {
  const { locale } = useLocale();
  const t = getAboutT(locale);

  const before = t("about.hero.heading.before").trim();
  const italic = t("about.hero.heading.italic").trim();
  const after = t("about.hero.heading.after").trim();

  // Globe sizing matches PartnersClient's breakpoint table so the
  // about hero's sphere reads at the same optical weight as the one
  // visitors meet again further down the landing.
  const [diameter, setDiameter] = useState<number>(360);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1280) setDiameter(440);
      else if (w >= 1024) setDiameter(380);
      else if (w >= 640) setDiameter(340);
      else setDiameter(Math.min(300, w - 72));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Spotlight rotation. Prefer pins currently on the front hemisphere
  // so the highlighted dot is visible when the caption changes; fall
  // back to the full pool when the camera hasn't reported visibility
  // yet (initial paint).
  const communities = useMemo(() => uniqueCommunities(pins), [pins]);
  const spotlightPool = useMemo(() => {
    const withImages = communities.filter((c) => c.imageUrl);
    return withImages.length > 0 ? withImages : communities;
  }, [communities]);

  const [spotlightDid, setSpotlightDid] = useState<string | null>(null);
  const [visibleDids, setVisibleDids] = useState<string[]>([]);
  const visibleDidSet = useMemo(() => new Set(visibleDids), [visibleDids]);
  const visiblePool = useMemo(
    () => spotlightPool.filter((c) => visibleDidSet.has(c.did)),
    [spotlightPool, visibleDidSet],
  );

  const visiblePoolRef = useRef<Community[]>([]);
  const spotlightPoolRef = useRef<Community[]>([]);
  useEffect(() => {
    visiblePoolRef.current = visiblePool;
  }, [visiblePool]);
  useEffect(() => {
    spotlightPoolRef.current = spotlightPool;
  }, [spotlightPool]);

  // Initial pick + reset when the current spotlight scrolls off-globe.
  useEffect(() => {
    if (spotlightPool.length === 0) {
      setSpotlightDid(null);
      return;
    }
    const currentIsKnown = spotlightPool.some((c) => c.did === spotlightDid);
    const currentIsVisible = spotlightDid
      ? visibleDidSet.has(spotlightDid)
      : false;
    if (
      !currentIsKnown ||
      (visiblePool.length > 0 && !currentIsVisible)
    ) {
      setSpotlightDid((visiblePool[0] ?? spotlightPool[0]).did);
    }
  }, [spotlightDid, spotlightPool, visiblePool, visibleDidSet]);

  // Rotation tick.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSpotlightDid((current) => {
        const pool =
          visiblePoolRef.current.length > 0
            ? visiblePoolRef.current
            : spotlightPoolRef.current;
        if (pool.length === 0) return current;
        const i = pool.findIndex((c) => c.did === current);
        return pool[(i + 1) % pool.length]?.did ?? current;
      });
    }, SPOTLIGHT_ROTATION_MS);
    return () => window.clearInterval(id);
  }, []);

  const spotlight =
    spotlightPool.find((c) => c.did === spotlightDid) ??
    visiblePool[0] ??
    spotlightPool[0] ??
    null;

  const handleVisiblePinsChange = useCallback((dids: string[]) => {
    setVisibleDids(dids);
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

        {/* RIGHT: live globe — transparent canvas on the cream page,
            no card chrome. A small LIVE pill anchors the top-right
            corner; a quiet rotating caption underneath identifies the
            current spotlighted community. The globe itself drops a
            soft shadow on the cream so it reads as floating volume
            rather than a flat sticker. */}
        <div className="col-span-12 lg:col-span-5">
          <div className="relative mx-auto flex w-full max-w-[480px] flex-col items-center">
            {/* LIVE indicator pill, top-right of the globe column.
                Matches the per-page "LIVE" chip used in AboutStats so
                the page has a single live-data visual vocabulary. */}
            <div className="absolute right-0 top-0 z-10 inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-background/75 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark backdrop-blur-sm">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-brand animate-pulse"
              />
              {t("about.live.label")} · {communitiesTotal || communities.length || pins.length}
            </div>

            <div
              className="relative grid place-items-center"
              style={{ width: diameter, height: diameter }}
            >
              {/* Soft radial shadow under the sphere — gives the
                  globe lift without a hard ring or card border. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(40,50,30,0.16), rgba(40,50,30,0.04) 60%, transparent 75%)",
                  transform: "translateY(8%) scaleY(0.55)",
                }}
              />
              <LiveGlobe
                pins={pins}
                diameter={diameter}
                interactive
                highlightedDid={spotlight?.did ?? null}
                onVisiblePinsChange={handleVisiblePinsChange}
              />
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
