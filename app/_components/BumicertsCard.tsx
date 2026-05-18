"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { LogoMark } from "./Logo";
import type { LiveBumicertsSnapshot, LiveBumicert } from "../_lib/bumicerts";

/**
 * Faux Bumicerts UI card used in the hero composition.
 *
 * Wired to the live indexer — the three rows shown are the most recent
 * curated Bumicerts coming through the same `orgHypercertsClaimActivity`
 * GraphQL feed that powers alpha.fund.gainforest.app/explore.
 *
 * The card is **draggable**: grab the header (the area with the
 * GainForest mark + "Bumicerts" + Live badge) and drop the card anywhere
 * on the viewport. Position persists in localStorage. The card starts
 * in its natural-flow slot inside the hero composition and only switches
 * to `position: fixed` the first time the user starts dragging (so the
 * SSR layout is unchanged on first paint).
 *
 * Rail items (Projects / Organizations / Leaderboard) are real links to
 * the matching Bumicerts pages so the card behaves like a miniature
 * navigation widget rather than a static mockup.
 */

const BUMICERTS_URL = "https://alpha.fund.gainforest.app";
const STORAGE_KEY = "gainforest.bumicertsCard.position";
const DRAG_THRESHOLD_PX = 4;
const VIEWPORT_PADDING = 8;
const CARD_WIDTH = 400;

interface Position {
  x: number;
  y: number;
}

function clampToViewport(
  pos: Position,
  width: number,
  height: number,
): Position {
  if (typeof window === "undefined") return pos;
  const maxX = window.innerWidth - width - VIEWPORT_PADDING;
  const maxY = window.innerHeight - 60; // keep at least the header visible
  return {
    x: Math.max(VIEWPORT_PADDING, Math.min(pos.x, maxX)),
    y: Math.max(VIEWPORT_PADDING, Math.min(pos.y, maxY)),
  };
}

export function BumicertsCard({
  snapshot,
}: {
  snapshot: LiveBumicertsSnapshot;
}) {
  // Prefer Bumicerts with real thumbnails for the card — an empty thumbnail
  // tile looks broken in the hero composition. Fall back to the head of the
  // feed only if we don't have three image-bearing rows.
  const withImage = snapshot.bumicerts.filter((b) => b.imageUrl);
  const rows = (
    withImage.length >= 3
      ? withImage
      : [...withImage, ...snapshot.bumicerts.filter((b) => !b.imageUrl)]
  ).slice(0, 3);

  // `null` = the card is in its natural-flow slot (set by Hero). Once the
  // user drags, we switch to `position: fixed` at viewport coords and stay
  // there for the rest of the session (and across sessions, via storage).
  const [fixedPos, setFixedPos] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  // Restore a saved position from localStorage on mount. We use
  // useLayoutEffect so the card paints at the saved position on first
  // frame instead of flashing through the hero slot.
  useLayoutEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.x === "number" &&
        typeof parsed.y === "number"
      ) {
        const height = rootRef.current?.offsetHeight ?? 320;
        setFixedPos(
          clampToViewport({ x: parsed.x, y: parsed.y }, CARD_WIDTH, height),
        );
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  // Re-clamp on viewport resize so the card never escapes the screen.
  useEffect(() => {
    if (!fixedPos) return;
    const onResize = () => {
      const height = rootRef.current?.offsetHeight ?? 320;
      setFixedPos((p) =>
        p ? clampToViewport(p, CARD_WIDTH, height) : null,
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fixedPos]);

  // Persist position to localStorage whenever it changes.
  useEffect(() => {
    if (!fixedPos) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fixedPos));
    } catch {
      // localStorage may be unavailable in private mode
    }
  }, [fixedPos]);

  // Drag handlers — pointerdown is registered on the header only so the
  // body of the card (rail items, project rows) stays interactive.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("a, button, [data-no-drag]")) return;
      e.currentTarget.setPointerCapture(e.pointerId);

      // First-drag bootstrap: compute the card's current viewport coords
      // so we can switch from natural-flow to position:fixed without a
      // visual jump.
      const rect = rootRef.current?.getBoundingClientRect();
      const startX = fixedPos?.x ?? rect?.left ?? 0;
      const startY = fixedPos?.y ?? rect?.top ?? 0;

      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX,
        startY,
        moved: false,
      };
    },
    [fixedPos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        setDragging(true);
      }
      const height = rootRef.current?.offsetHeight ?? 320;
      setFixedPos(
        clampToViewport(
          { x: drag.startX + dx, y: drag.startY + dy },
          CARD_WIDTH,
          height,
        ),
      );
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [],
  );

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // When fixedPos is set, we float above the page. When null, we sit in
  // the natural flow slot Hero placed us in.
  const floating = fixedPos !== null;
  const containerStyle: React.CSSProperties = floating
    ? {
        position: "fixed",
        left: fixedPos.x,
        top: fixedPos.y,
        width: CARD_WIDTH,
        zIndex: 40,
      }
    : { width: CARD_WIDTH };

  return (
    <div
      ref={rootRef}
      style={containerStyle}
      className="overflow-hidden rounded-[18px] border border-[#e6dfd0] bg-[#fbf8f0] shadow-[0_30px_70px_-25px_rgba(40,50,30,0.35)]"
    >
      {/* header — same GainForest mark Bumicerts uses for its app icon.
          Doubles as the DRAG HANDLE. Cursor changes to grab/grabbing so
          it's discoverable. Clicking links inside the header still works
          because we bail out of the drag start when the target is an
          anchor or [data-no-drag]. */}
      <div
        className={
          "flex items-center gap-2 px-5 pt-5 pb-3 select-none " +
          (dragging ? "cursor-grabbing" : "cursor-grab")
        }
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        aria-label="Drag handle"
      >
        <LogoMark className="h-[22px] w-[22px] text-primary" title="GainForest" />
        <span className="font-garamond text-[20px] font-medium text-foreground">
          Bumicerts
        </span>
        {!snapshot.fromFallback && (
          <span
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-primary"
            title="Pulled from the GainForest indexer in real time"
            data-no-drag
          >
            <span className="relative grid h-1.5 w-1.5 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Live
          </span>
        )}
      </div>

      <div className="grid grid-cols-[120px_1fr] gap-3 px-3 pb-3">
        {/* left rail — real links to the matching Bumicerts pages */}
        <div className="flex flex-col gap-1 pt-9 text-[12px]">
          <RailLink
            icon={<HomeIcon />}
            label="Projects"
            href={`${BUMICERTS_URL}/explore`}
            active
          />
          <RailLink
            icon={<BuildingIcon />}
            label="Organizations"
            href={`${BUMICERTS_URL}/organizations`}
          />
          <RailLink
            icon={<TrophyIcon />}
            label="Leaderboard"
            href={`${BUMICERTS_URL}/leaderboard`}
          />
        </div>

        {/* right column: search + list */}
        <div className="flex flex-col gap-2 pr-2">
          {/* search */}
          <div className="flex items-center gap-2 rounded-md border border-[#e6dfd0] bg-white px-2.5 py-1.5 text-[11px] text-foreground/50">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
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
            <span className="flex-1">Search projects…</span>
            <span className="flex items-center gap-1 text-foreground/70">
              All projects
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
          {formatCount(snapshot.total)} projects found
        </span>
        <Link
          href={`${BUMICERTS_URL}/explore`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-foreground/70 transition-colors hover:text-primary"
        >
          View all
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
          <div className="absolute inset-0 grid place-items-center text-[10px] text-primary/60">
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
          {country}
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
      data-no-drag
      className={
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors " +
        (active
          ? "bg-[#ece5d2] text-foreground"
          : "text-foreground/55 hover:bg-black/[0.03] hover:text-foreground")
      }
    >
      <span className={active ? "text-primary" : "text-foreground/55"}>
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
