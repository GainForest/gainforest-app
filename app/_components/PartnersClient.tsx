"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LiveGlobe } from "./LiveGlobe";
import { useT } from "./LocaleProvider";
import type { ProjectPin } from "../_lib/projects";

// Client child of <Partners />. This section intentionally stays quiet:
// it uses the same live Green Globe pins as the rest of the page, then
// overlays a rotating spotlight for one real community/org at a time.
// Images come from Hyperindex organization cover/logo blobs resolved in
// `_lib/projects.ts`; no generated or invented partner imagery here.
const SPOTLIGHT_ROTATION_MS = 11000;

type Community = {
  did: string;
  name: string;
  country: string;
  atUri: string | null;
  imageUrl: string | null;
};

function uniqueCommunities(pins: ProjectPin[]): Community[] {
  const seen = new Set<string>();
  const communities: Community[] = [];
  for (const pin of pins) {
    const name = pin.name.trim();
    if (!name) continue;
    const country = pin.country.trim();
    const key = `${name.toLocaleLowerCase()}|${country.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    communities.push({
      did: pin.did,
      name,
      country,
      atUri: pin.atUri,
      imageUrl: pin.imageUrl,
    });
  }
  return communities.sort((a, b) => a.name.localeCompare(b.name));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function SpotlightCard({
  community,
  label,
  showRecord,
}: {
  community: Community | undefined;
  label: string;
  showRecord: boolean;
}) {
  if (!community) return null;
  return (
    <div className="absolute inset-x-4 bottom-4 z-10 rounded-[22px] border border-border-soft bg-background/92 p-3 shadow-[0_18px_45px_-28px_rgba(28,28,26,0.45)] backdrop-blur-md sm:left-auto sm:right-5 sm:w-[340px]">
      <div className="flex items-center gap-3">
        <div className="relative h-[74px] w-[92px] shrink-0 overflow-hidden rounded-[16px] bg-[#e1dccf]">
          {community.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={community.imageUrl}
              src={community.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-garamond text-[28px] text-foreground/35">
              {initials(community.name)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.18em] text-foreground/42">
            {label}
          </p>
          <p className="mt-1 truncate font-garamond text-[22px] leading-[1.03] text-foreground">
            {community.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {community.country ? (
              <p className="inline-flex rounded-full border border-border-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/52">
                {community.country}
              </p>
            ) : null}
            {showRecord && community.atUri ? (
              <Link
                href={hyperscanRecordHref(community.atUri)}
                target="_blank"
                rel="noreferrer"
                title={community.atUri}
                aria-label={`Open ${community.name} live ATProto record on Hyperscan`}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-[9.5px] leading-none text-primary transition-colors hover:border-primary/45 hover:bg-primary/10"
              >
                <span className="h-1 w-1 rounded-full bg-brand" aria-hidden />
                <span className="truncate">
                  {minimalAtUri(community.atUri)}
                </span>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function minimalAtUri(atUri: string): string {
  const match = atUri.match(/^at:\/\/(did:plc:)([^/]+)\/(.+)$/);
  if (!match) return atUri;
  const [, prefix, didBody, rest] = match;
  return `at://${prefix}${didBody.slice(0, 6)}…${didBody.slice(-4)}/${rest}`;
}

function hyperscanRecordHref(atUri: string): string {
  const match = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return "https://www.hyperscan.dev/data";
  const [, did, collection, rkey] = match;
  // Hyperscan's Data Explorer accepts AT-URIs via the search box, but its
  // durable record route uses the same params its agent docs/source expose:
  // /data?did=...&collection=...&rkey=...
  return `https://www.hyperscan.dev/data?did=${encodeURIComponent(
    did,
  )}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(
    rkey,
  )}`;
}

export function ClientPartners({ pins }: { pins: ProjectPin[] }) {
  const t = useT();
  const before = t("partners.heading.before").trim();
  const italic = t("partners.heading.italic").trim();
  const after = t("partners.heading.after").trim();

  const communities = useMemo(() => uniqueCommunities(pins), [pins]);
  const spotlightPool = useMemo(() => {
    const withImages = communities.filter((community) => community.imageUrl);
    return withImages.length > 0 ? withImages : communities;
  }, [communities]);
  const total = communities.length || pins.length;

  const [spotlightDid, setSpotlightDid] = useState<string | null>(null);
  const [diameter, setDiameter] = useState<number>(380);
  const [visiblePinDids, setVisiblePinDids] = useState<string[]>([]);
  const spotlightPoolRef = useRef<Community[]>([]);
  const visibleSpotlightPoolRef = useRef<Community[]>([]);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1280) setDiameter(410);
      else if (w >= 1024) setDiameter(370);
      else if (w >= 640) setDiameter(340);
      else setDiameter(Math.min(310, w - 72));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const visiblePinDidSet = useMemo(
    () => new Set(visiblePinDids),
    [visiblePinDids],
  );
  const visibleSpotlightPool = useMemo(
    () =>
      spotlightPool.filter(
        (community) => community.atUri && visiblePinDidSet.has(community.did),
      ),
    [spotlightPool, visiblePinDidSet],
  );

  useEffect(() => {
    spotlightPoolRef.current = spotlightPool;
  }, [spotlightPool]);

  useEffect(() => {
    visibleSpotlightPoolRef.current = visibleSpotlightPool;
  }, [visibleSpotlightPool]);

  useEffect(() => {
    const preferred = visibleSpotlightPool[0] ?? spotlightPool[0];
    if (!preferred) {
      setSpotlightDid(null);
      return;
    }
    const currentIsKnown = spotlightPool.some(
      (community) => community.did === spotlightDid,
    );
    const currentIsVisible = spotlightDid
      ? visiblePinDidSet.has(spotlightDid)
      : false;
    if (
      !currentIsKnown ||
      (visibleSpotlightPool.length > 0 && !currentIsVisible)
    ) {
      setSpotlightDid(preferred.did);
    }
  }, [spotlightDid, spotlightPool, visiblePinDidSet, visibleSpotlightPool]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSpotlightDid((current) => {
        const pool =
          visibleSpotlightPoolRef.current.length > 0
            ? visibleSpotlightPoolRef.current
            : spotlightPoolRef.current.filter((community) => community.atUri);
        if (pool.length === 0) return current;
        const currentIndex = pool.findIndex(
          (community) => community.did === current,
        );
        return pool[(currentIndex + 1) % pool.length]?.did ?? current;
      });
    }, SPOTLIGHT_ROTATION_MS);
    return () => window.clearInterval(id);
  }, []);

  const spotlight =
    spotlightPool.find((community) => community.did === spotlightDid) ??
    visibleSpotlightPool[0] ??
    spotlightPool[0];
  const handleVisiblePinsChange = useCallback((visibleDids: string[]) => {
    setVisiblePinDids(visibleDids);
  }, []);

  return (
    <section className="border-t border-border-soft">
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

          <Link
            href="https://www.youtube.com/@gainforest/videos"
            target="_blank"
            rel="noreferrer"
            className="group mt-8 inline-flex max-w-[520px] items-start gap-4 border-t border-border-soft pt-5 transition-colors hover:border-foreground/25"
          >
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-foreground/45">
                {t("partners.callsEyebrow")}
              </span>
              <span className="mt-1 block font-garamond text-[22px] leading-[1.08] text-foreground sm:text-[24px]">
                {t("partners.callsTitle")}
              </span>
              <span className="mt-2 block text-[13px] leading-[1.45] text-foreground/62">
                {t("partners.callsBody")}
              </span>
            </span>
            <span
              aria-hidden
              className="mt-5 shrink-0 text-[20px] text-primary transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </div>

        <div className="lg:col-span-7">
          <div className="relative mx-auto min-h-[430px] max-w-[720px] overflow-hidden rounded-[34px] border border-border-soft bg-[#efe8d8]/55 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] sm:min-h-[470px] lg:ml-auto">
            <div className="absolute left-5 top-5 z-10 flex items-center gap-3 rounded-full border border-border-soft bg-background/75 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-foreground/50 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              {t("partners.bannerLabel")}
            </div>
            <div className="absolute right-5 top-5 z-10 rounded-full border border-border-soft bg-background/75 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/50 backdrop-blur-sm">
              {total} {t("partners.bannerCountLabel")}
            </div>

            <div className="flex min-h-[390px] items-center justify-center pt-4 sm:min-h-[430px]">
              <LiveGlobe
                pins={pins}
                diameter={diameter}
                highlightedDid={spotlight?.did ?? null}
                onVisiblePinsChange={handleVisiblePinsChange}
              />
            </div>

            <SpotlightCard
              community={spotlight}
              label={t("partners.recordLabel")}
              showRecord={Boolean(
                spotlight?.atUri && visiblePinDidSet.has(spotlight.did),
              )}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
