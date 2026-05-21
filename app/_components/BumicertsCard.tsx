"use client";

import Image from "next/image";
import Link from "next/link";
import type { LiveBumicertsSnapshot, LiveBumicert } from "../_lib/bumicerts";
import { BUMICERTS_URL } from "../_lib/urls";
import { LivePill } from "./LivePill";
import { LogoMark } from "./Logo";
import { useT } from "./LocaleProvider";

/**
 * Faux Bumicerts UI card used in the hero composition.
 *
 * Wired to the live indexer — the three rows shown are the most recent
 * curated Bumicerts coming through the same `orgHypercertsClaimActivity`
 * GraphQL feed that powers certs.gainforest.app/explore.
 *
 * Rail items (Projects / Organizations / Leaderboard) are real links to
 * the matching Bumicerts pages so the card behaves like a miniature
 * navigation widget rather than a static mockup.
 *
 * Two render modes:
 *
 *   - `inline` (mobile): natural document flow under the hero copy.
 *   - default (desktop): `position: absolute` inside the Hero's right
 *     column — positioned via the `position` prop (top/left/width).
 *
 * The previous implementation used document-coordinate absolute
 * positioning so the card could be dragged anywhere on the page. That
 * broke at non-100% browser zoom (the saved doc coords no longer matched
 * the placeholder div's reflowed position; the card drifted to the
 * page's left edge at 50% zoom). The dragging was a nice-to-have; the
 * stable layout matters more.
 */

const CARD_WIDTH = 400;

export function BumicertsCard({
  snapshot,
  inline = false,
  position,
}: {
  snapshot: LiveBumicertsSnapshot;
  /** When true, render inline (no absolute positioning) so the card
   *  flows naturally in the mobile composition. */
  inline?: boolean;
  /** When set, render `position: absolute` with these coordinates
   *  relative to the parent (which must be `position: relative`). */
  position?: { top?: number | string; left?: number | string; right?: number | string; width?: number };
}) {
  const t = useT();
  // Prefer Bumicerts with real thumbnails for the card — an empty thumbnail
  // tile looks broken in the hero composition. Fall back to the head of the
  // feed only if we don't have three image-bearing rows.
  const withImage = snapshot.bumicerts.filter((b) => b.imageUrl);
  const rows = (
    withImage.length >= 3
      ? withImage
      : [...withImage, ...snapshot.bumicerts.filter((b) => !b.imageUrl)]
  ).slice(0, 3);

  const containerStyle: React.CSSProperties = inline
    ? { width: "100%", maxWidth: 420 }
    : {
        position: "absolute",
        top: position?.top,
        left: position?.left,
        right: position?.right,
        width: position?.width ?? CARD_WIDTH,
        zIndex: 40,
      };

  return (
    <div
      style={containerStyle}
      className={
        "overflow-hidden rounded-[18px] border border-[#e6dfd0] bg-[#fbf8f0] " +
        (inline
          ? "mx-auto shadow-[0_18px_40px_-22px_rgba(40,50,30,0.28)]"
          : "shadow-[0_30px_70px_-25px_rgba(40,50,30,0.35)]")
      }
    >
      {/* header — same GainForest mark Bumicerts uses for its app icon. */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-3 select-none">
        <LogoMark className="h-[22px] w-[22px] text-brand" title="GainForest" />
        <span className="font-garamond text-[20px] font-medium text-foreground">
          Bumicerts
        </span>
        {/* Unified <LivePill /> — same component the ChoosePath cards
            use, with a hover tooltip explaining what's being streamed.
            The pill stays visible in both live and fallback states so
            the badge is honest about the data source. */}
        <LivePill
          isLive={!snapshot.fromFallback}
          tooltipKey={
            snapshot.fromFallback
              ? "choosePath.bumicerts.fallbackTooltip"
              : "choosePath.bumicerts.liveTooltip"
          }
          className="ml-auto"
        />
      </div>

      {/* `minmax(0, 1fr)` (not bare `1fr`, which is
          `minmax(auto, 1fr)`) on the right column is load-bearing on
          mobile: without it the column grows beyond the card to fit
          its min-content (the search row's `whitespace-nowrap`
          dropdown + the 64 px row thumbnails), and the project row
          titles + the search bar overflow the rounded card border at
          phone widths in every locale. */}
      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3 pb-3">
        {/* left rail — real links to the matching Bumicerts pages */}
        <div className="flex flex-col gap-1 pt-9 text-[12px]">
          <RailLink
            icon={<HomeIcon />}
            label={t("card.projects")}
            href={`${BUMICERTS_URL}/explore`}
            active
          />
          <RailLink
            icon={<BuildingIcon />}
            label={t("card.organizations")}
            href={`${BUMICERTS_URL}/organizations`}
          />
          <RailLink
            icon={<TrophyIcon />}
            label={t("card.leaderboard")}
            href={`${BUMICERTS_URL}/leaderboard`}
          />
        </div>

        {/* right column: search + list */}
        <div className="flex flex-col gap-2 pr-2">
          {/* search.
              `min-w-0` + `truncate` on the placeholder span keeps the
              text on a single line when the card lives inside the
              narrow mobile inline composition (where the right-hand
              column ends up <220 px and the search placeholder used
              to wrap to two lines). `whitespace-nowrap` on the "All
              projects" dropdown label keeps it from wrapping too. */}
          <div className="flex items-center gap-2 rounded-md border border-[#e6dfd0] bg-white px-2.5 py-1.5 text-[11px] text-foreground/50">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="shrink-0"
            >
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M20 20l-3.5-3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="min-w-0 flex-1 truncate">
              {t("card.searchProjects")}
            </span>
            {/* The "All projects" dropdown is decorative chrome. On
                the desktop card (400 px wide) the right column has
                room for both the placeholder and the dropdown. On the
                inline mobile card the right column is ~180–215 px and
                "Todos los proyectos" / "Todos os projetos" /
                "Semua proyek" with `whitespace-nowrap` crushes the
                truncated placeholder down to a single letter ("B…"),
                which reads as broken. Hide the dropdown on the inline
                variant — visitors get a cleaner search affordance,
                and the row no longer fights for space. */}
            {!inline && (
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-foreground/70">
                {t("choosePath.allProjects")}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
          </div>

          {/* project rows */}
          {rows.map((row) => (
            <ProjectRow key={row.id} row={row} />
          ))}
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between border-t border-[#ece5d4] px-4 py-2.5 text-[11px]">
        <span className="text-foreground/55">
          {t("card.projectsFound").replace(
            "{n}",
            formatCount(snapshot.total),
          )}
        </span>
        <Link
          href={`${BUMICERTS_URL}/explore`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-foreground/70 transition-colors hover:text-foreground"
        >
          {t("card.viewAll")}
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function ProjectRow({ row }: { row: LiveBumicert }) {
  const t = useT();
  const country = deriveCountry(row);

  return (
    <Link
      href={row.href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-black/[0.03]"
    >
      <div className="relative h-[44px] w-[64px] shrink-0 overflow-hidden rounded-[6px] bg-[#cfd9c4]">
        {row.imageUrl ? (
          // Live PDS-resolved thumbnail.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[10px] text-brand-dark/60">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <path d="M5 19c0-7 6-13 14-13 0 8-6 14-14 14z" />
              <path d="M5 19c4-3 7-6 9-10" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="font-garamond text-[13px] leading-[1.1] text-foreground overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
          }}
        >
          {row.title}
        </div>
        <div className="mt-1 truncate text-[10px] text-foreground/55">
          {country === "Worldwide" ? t("card.worldwide") : country}
        </div>
      </div>
    </Link>
  );
}

function RailLink({
  icon,
  label,
  href,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors " +
        (active
          ? "bg-[#ece5d2] text-foreground"
          : "text-foreground/55 hover:bg-black/[0.03] hover:text-foreground")
      }
    >
      <span className={active ? "text-foreground" : "text-foreground/55"}>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Best-effort country derivation from the bumicert's text. The full record
 * exposes a country via creatorInfo on the org but we don't fetch that here
 * to keep the landing query cheap. As a heuristic we look for "in <Country>"
 * or known country names in the short description / title.
 */
function deriveCountry(row: LiveBumicert): string {
  const text = `${row.title} ${row.shortDescription}`;
  const explicit = COUNTRIES.find((c) =>
    new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text),
  );
  if (explicit) return explicit;
  for (const [city, country] of CITY_TO_COUNTRY) {
    if (new RegExp(`\\b${city}\\b`).test(text)) return country;
  }
  const m = text.match(/\bin\s+([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)?)/);
  if (m && m[1]) {
    return m[1];
  }
  // English fallback — BumicertsCard's project rows render this through
  // the t(card.worldwide) key at the call site, so the literal here only
  // matters for code that reads the LiveBumicert directly outside the UI.
  return "Worldwide";
}

const COUNTRIES = [
  "Kenya",
  "Uganda",
  "Tanzania",
  "Haiti",
  "Ghana",
  "Brazil",
  "Singapore",
  "Bhutan",
  "Pakistan",
  "Colombia",
  "Peru",
  "Argentina",
  "DRC",
  "Congo",
  "Cameroon",
  "Nigeria",
  "Malawi",
  "Philippines",
  "Indonesia",
  "India",
  "Texas",
  "Costa Rica",
  "Paraguay",
  "South Africa",
  "Ecuador",
  "Mexico",
  "Madagascar",
  "Italy",
  "Germany",
  "United States",
];

const CITY_TO_COUNTRY: ReadonlyArray<readonly [string, string]> = [
  ["Manaus", "Brazil"],
  ["Cap Rouge", "Haiti"],
  ["Kaabong", "Uganda"],
  ["Marina Gardens", "Singapore"],
  ["Madi", "Uganda"],
  ["Lahore", "Pakistan"],
  ["South Kivu", "DRC"],
  ["Buzi-Bulenga", "DRC"],
  ["Mount Elgon", "Uganda"],
  ["Texas Hill Country", "United States"],
  ["Richmond", "United States"],
  ["Magnolios", "Colombia"],
];

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function HomeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1v-9z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="3"
        width="16"
        height="18"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8 7h2M8 11h2M8 15h2M14 7h2M14 11h2M14 15h2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 4h10v5a5 5 0 01-10 0V4zM5 6H3a2 2 0 002 2M19 6h2a2 2 0 01-2 2M10 20h4M12 14v6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// (Image kept imported in case we switch back to next/image with remotePatterns)
void Image;
