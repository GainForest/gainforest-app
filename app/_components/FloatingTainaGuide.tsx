"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { ACTIVE_MANAGE_CONTEXT_KEY, accountManageBasePath } from "@/lib/links";
import { renderPetAnimated, type CodexPetState } from "../_lib/codex-pet";
import { TAINA_GUIDES, getTainaGuide, type TainaGuide } from "../_lib/taina-guides";
import { TAINA_SIM } from "../_lib/taina-sim";

// FloatingTainaGuide — Tainá as a site-wide tutorial companion.
//
// Ported from data-soil's FloatingTaina (itself a port of the original
// gainforest-app widget) and extended into an onboarding guide:
//
//   - The chat panel opens on an FAQ home view: the most common "how do I…"
//     questions (wallet for donations, projects, observations, BioBlitz),
//     each backed by a step-by-step visual guide with real screenshots
//     (public/taina-guides/*, captured from the live app).
//   - Every guide can also run as a live tour: Tainá closes the panel,
//     navigates to the right page, hops next to the actual button and
//     spotlights it with a speech bubble — advancing as the user clicks.
//     Targets are resolved through stable `[data-taina="…"]` attributes.
//   - Free-form questions still stream from /api/sim-chat (guide mode), so
//     she can answer anything the FAQ doesn't cover, in the UI language.
//
// She hides inside iframes and on the Cert creation page (which has its own
// docked Tainá writing companion).

const SPRITE_W = 72;
const SPRITE_H = 78;
const BADGE_RESERVE = 24;
const PANEL_W = 348;
const PANEL_H = 500;
const PANEL_GAP = 12;
const VIEWPORT_PADDING = 12;
const DRAG_THRESHOLD_PX = 4;
const STORAGE_KEY = "gainforest.floatingTaina.position.v1";
const MINIMIZED_STORAGE_KEY = "gainforest.floatingTaina.minimized.v1";
// Active tour survives full page loads (locale redirects, hard navigations)
// via sessionStorage — the widget rehydrates it on mount.
const TOUR_STORAGE_KEY = "gainforest.floatingTaina.tour.v1";
const OPEN_WAVE_MS = 1600;
const TOUR_BUBBLE_W = 300;
const TOUR_FIND_TIMEOUT_MS = 8000;
const Z_SPOTLIGHT = 68;
const Z_SPRITE = 70;
const Z_BUBBLE = 71;

interface Position {
  x: number;
  y: number;
}
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
type PanelView = { kind: "home" } | { kind: "guide"; guideId: string };
interface TourState {
  guideId: string;
  index: number;
}

// How many projects a manage endpoint reports. `null` means "unknown"
// (signed out, no access, or a transport error) — callers must not treat
// that as zero.
async function fetchManagedProjectCount(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

// Tour step routes are written against the legacy /manage/... shim, which
// always server-redirects to the *personal* account's manage pages. When the
// user is currently working as an organization (the account switcher context
// persisted in localStorage), that redirect would yank them out of the org
// mid-tour — so rewrite /manage routes to the active org's manage path and
// skip the shim (and its full-page redirect) entirely.
function resolveTourRoute(route: string): string {
  if (route !== "/manage" && !route.startsWith("/manage/")) return route;
  try {
    const raw = window.localStorage.getItem(ACTIVE_MANAGE_CONTEXT_KEY);
    if (!raw) return route;
    const parsed = JSON.parse(raw) as { type?: unknown; did?: unknown; identifier?: unknown };
    if (parsed?.type !== "group") return route;
    const identifier =
      typeof parsed.identifier === "string" && parsed.identifier.trim()
        ? parsed.identifier.trim()
        : typeof parsed.did === "string" && parsed.did.startsWith("did:")
          ? parsed.did
          : null;
    if (!identifier) return route;
    return `${accountManageBasePath(identifier)}${route.slice("/manage".length)}`;
  } catch {
    return route;
  }
}

// Some tour targets are rendered twice for responsive layouts (e.g. the
// desktop Support card and a hidden mobile bar both carry
// data-taina="enable-donations"). `querySelector` would happily return the
// hidden one and the spotlight would land on a 0×0 rect at the top-left
// corner — so always pick the first *visible* match.
function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function findVisibleTarget(selector: string): Element | null {
  const matches = Array.from(document.querySelectorAll(selector));
  return matches.find(isElementVisible) ?? null;
}

function clampToViewport(pos: Position): Position {
  if (typeof window === "undefined") return pos;
  const maxX = window.innerWidth - SPRITE_W - VIEWPORT_PADDING;
  const maxY = window.innerHeight - SPRITE_H - BADGE_RESERVE - VIEWPORT_PADDING;
  return {
    x: clamp(pos.x, VIEWPORT_PADDING, maxX),
    y: clamp(pos.y, VIEWPORT_PADDING, maxY),
  };
}

function defaultPosition(): Position {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const edgeInset = window.innerWidth >= 768 ? 32 : 18;
  return {
    x: window.innerWidth - SPRITE_W - edgeInset,
    y: window.innerHeight - SPRITE_H - BADGE_RESERVE - edgeInset,
  };
}

function computePanelPosition(spritePos: Position): Position {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = spritePos.x + SPRITE_W - PANEL_W;
  let y = spritePos.y - PANEL_H - PANEL_GAP;
  if (y < VIEWPORT_PADDING) y = spritePos.y + SPRITE_H + PANEL_GAP;
  if (x < VIEWPORT_PADDING) x = spritePos.x;
  x = clamp(x, VIEWPORT_PADDING, vw - PANEL_W - VIEWPORT_PADDING);
  y = clamp(y, VIEWPORT_PADDING, vh - PANEL_H - VIEWPORT_PADDING);
  return { x, y };
}

// Where the speech bubble goes relative to a spotlighted element.
function computeBubblePosition(rect: Rect): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = rect.y + rect.h + 14;
  const above = rect.y - 14;
  let x = clamp(rect.x, VIEWPORT_PADDING, vw - TOUR_BUBBLE_W - VIEWPORT_PADDING);
  // Prefer below the element; flip above when there's no room.
  let y = below;
  if (below + 170 > vh && above - 170 > 0) y = above - 170;
  y = clamp(y, VIEWPORT_PADDING, vh - 170 - VIEWPORT_PADDING);
  return { x, y };
}

// Tainá hops to the side of the spotlighted element.
function computeTourSpritePosition(rect: Rect): Position {
  const vw = window.innerWidth;
  const leftX = rect.x - SPRITE_W - 20;
  const rightX = rect.x + rect.w + 20;
  const x = leftX >= VIEWPORT_PADDING ? leftX : Math.min(rightX, vw - SPRITE_W - VIEWPORT_PADDING);
  const y = rect.y + rect.h / 2 - SPRITE_H / 2;
  return clampToViewport({ x, y });
}

export function FloatingTainaGuide() {
  const t = useTranslations("tainaGuide.widget");
  const guidesT = useTranslations("tainaGuide.guides");
  const locale = useLocale();
  const router = useRouter();
  const rawPathname = usePathname() ?? "/";
  const pathname = stripLocaleFromPathname(rawPathname);
  // "/en/feed" → "/en" so tour navigations stay inside the active locale
  // (pushing a locale-less path would bounce through the middleware redirect
  // and reload the page, losing widget state mid-tour).
  const localePrefix = rawPathname.endsWith(pathname)
    ? rawPathname.slice(0, rawPathname.length - pathname.length)
    : "";

  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PanelView>({ kind: "home" });
  const [dragging, setDragging] = useState(false);
  const [dragDirection, setDragDirection] = useState<"left" | "right">("right");
  const [waveActive, setWaveActive] = useState(false);
  const [firstFramePainted, setFirstFramePainted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [minimized, setMinimized] = useState(false);
  // Whether the signed-in user owns at least one project. `null` = unknown
  // (signed out, not yet checked, or the check failed) — in that case we
  // don't second-guess the user. Refreshed every time a project-dependent
  // guide (e.g. donation setup) is opened.
  const [hasProjects, setHasProjects] = useState<boolean | null>(null);
  // Whether the visitor is signed in. `null` = unknown. Checked whenever a
  // guide view opens: every live tour points at account surfaces (My
  // Projects, donation settings, …), so a signed-out visitor would only end
  // up staring at a sign-in wall while Tainá says "I can't find it". Instead
  // we tell them to sign in first.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  // ── Live tour state ─────────────────────────────────────────────────
  const [tour, setTour] = useState<TourState | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(TOUR_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { guideId?: unknown; index?: unknown };
      if (typeof parsed?.guideId !== "string" || typeof parsed?.index !== "number") return null;
      const guide = getTainaGuide(parsed.guideId);
      if (!guide || parsed.index < 0 || parsed.index >= guide.tour.length) return null;
      return { guideId: parsed.guideId, index: parsed.index };
    } catch {
      return null;
    }
  });
  const [spotRect, setSpotRect] = useState<Rect | null>(null);
  const [spotMissing, setSpotMissing] = useState(false);
  const [tourMoving, setTourMoving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headerCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const savedPositionRef = useRef<Position | null>(null);
  const lastSpritePosRef = useRef<Position>({ x: 0, y: 0 });
  // Which tour step we've already auto-navigated for. Guards against redirect
  // loops: shim routes like /manage/projects immediately redirect to the
  // account-specific path, so "pathname ≠ step route" alone must never
  // re-trigger a push — that ping-pongs the URL forever.
  const navigatedStepRef = useRef<string | null>(null);
  // The step the locate-effect is currently serving. advanceOnClick uses it
  // instead of the effect's own `cancelled` flag: when the click navigates
  // (project card → project page), the pathname change re-runs the effect and
  // cancels its closure *before* the delayed advance fires — which used to
  // strand the tour on the previous step. The ref survives re-runs, so the
  // advance still goes through as long as the tour is on the same step.
  const activeStepKeyRef = useRef<string | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    lastClientX: number;
    moved: boolean;
  } | null>(null);

  // Restore position from localStorage on mount.
  useLayoutEffect(() => {
    let saved: Position | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          saved = { x: parsed.x, y: parsed.y };
        }
      }
    } catch {
      // ignore storage errors
    }
    setPosition(clampToViewport(saved ?? defaultPosition()));
    try {
      setMinimized(window.localStorage.getItem(MINIMIZED_STORAGE_KEY) === "1");
    } catch {
      // ignore storage errors
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const onResize = () => setPosition((p) => clampToViewport(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mounted]);

  // Persist position (skip while a tour drives the sprite around).
  useEffect(() => {
    if (!mounted || tour) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    } catch {
      // ignore storage errors
    }
  }, [position, mounted, tour]);

  useEffect(() => {
    lastSpritePosRef.current = position;
  }, [position]);

  // Keep the active tour in sessionStorage so it survives full page loads.
  useEffect(() => {
    try {
      if (tour) window.sessionStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(tour));
      else window.sessionStorage.removeItem(TOUR_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [tour]);

  // Autoscroll chat.
  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  // Reset the panel scroll when switching views.
  useEffect(() => {
    panelBodyRef.current?.scrollTo({ top: 0 });
  }, [view, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Persist the minimized preference.
  useEffect(() => {
    if (!mounted) return;
    try {
      if (minimized) window.localStorage.setItem(MINIMIZED_STORAGE_KEY, "1");
      else window.localStorage.removeItem(MINIMIZED_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [minimized, mounted]);

  // Allow in-page CTAs to open Tainá without importing this component.
  useEffect(() => {
    const onOpen = () => {
      setMinimized(false);
      setOpen(true);
      setWaveActive(true);
    };
    window.addEventListener("taina:open", onOpen);
    return () => window.removeEventListener("taina:open", onOpen);
  }, []);

  // Opening a guide checks the visitor's session (every tour needs one) and,
  // for project-dependent guides (donation setup), whether the user actually
  // has a project — so Tainá can say "sign in first" / "create a project
  // first" instead of pointing at things that aren't there. Refreshed on
  // every open so a fresh sign-in or a freshly created project is picked up.
  useEffect(() => {
    if (view.kind !== "guide") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session");
        if (!res.ok) return; // error — leave it unknown
        const data = (await res.json()) as { session?: { isLoggedIn?: boolean } };
        if (!cancelled) setSignedIn(Boolean(data.session?.isLoggedIn));
      } catch {
        // leave it unknown
      }
    })();
    if (getTainaGuide(view.guideId)?.requiresProject) {
      (async () => {
        try {
          // A project can live in the user's personal profile OR in one of
          // their organizations (donation wallets are organization-owned, so
          // org projects absolutely count). Check the personal repo first,
          // then every organization the user belongs to.
          const personal = await fetchManagedProjectCount("/api/manage/projects");
          if (cancelled) return;
          if (personal === null) return; // signed out or error — leave it unknown
          if (personal > 0) {
            setHasProjects(true);
            return;
          }
          const groupsRes = await fetch("/api/cgs/groups");
          if (!groupsRes.ok) {
            if (!cancelled) setHasProjects(false);
            return;
          }
          const groupsData = (await groupsRes.json()) as { groups?: Array<{ groupDid?: unknown }> };
          const groupDids = (Array.isArray(groupsData.groups) ? groupsData.groups : [])
            .map((group) => (typeof group?.groupDid === "string" ? group.groupDid : null))
            .filter((did): did is string => Boolean(did?.startsWith("did:")));
          if (groupDids.length === 0) {
            if (!cancelled) setHasProjects(false);
            return;
          }
          const counts = await Promise.all(
            groupDids.map((did) => fetchManagedProjectCount(`/api/manage/projects?repo=${encodeURIComponent(did)}`)),
          );
          if (cancelled) return;
          // Unknown answers (null) for some orgs must not produce a false
          // "you have no project" — only conclude that when every org
          // answered and none had projects.
          if (counts.some((count) => (count ?? 0) > 0)) setHasProjects(true);
          else if (counts.every((count) => count !== null)) setHasProjects(false);
        } catch {
          // leave it unknown
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [view]);

  // ── Drag handling ───────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || tour) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-drag]")) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events / stale pointer ids can't be captured — dragging
        // still works through the move/up handlers.
      }
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: position.x,
        startY: position.y,
        lastClientX: e.clientX,
        moved: false,
      };
    },
    [position.x, position.y, tour],
  );
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      setDragging(true);
    }
    const stepDx = e.clientX - drag.lastClientX;
    drag.lastClientX = e.clientX;
    if (stepDx > 1) setDragDirection("right");
    else if (stepDx < -1) setDragDirection("left");
    setPosition(clampToViewport({ x: drag.startX + dx, y: drag.startY + dy }));
  }, []);
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const wasDrag = drag.moved;
      dragRef.current = null;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (!wasDrag && !tour) {
        setOpen((v) => {
          const next = !v;
          if (next) setWaveActive(true);
          return next;
        });
      }
    },
    [tour],
  );
  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // ── Sprite state machine ────────────────────────────────────────────
  const petState: CodexPetState = useMemo(() => {
    if (dragging || tourMoving) {
      return dragDirection === "left" ? "running-left" : "running-right";
    }
    if (streaming) return "review";
    if (tour) return spotRect ? "waving" : "waiting";
    if (waveActive) return "waving";
    return "idle";
  }, [dragging, dragDirection, streaming, waveActive, tour, spotRect, tourMoving]);

  const markFirstFrame = useCallback(() => setFirstFramePainted(true), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return renderPetAnimated(canvas, TAINA_SIM.sheetUrl, petState, markFirstFrame);
  }, [petState, markFirstFrame]);

  useEffect(() => {
    if (!open) return;
    const canvas = headerCanvasRef.current;
    if (!canvas) return;
    return renderPetAnimated(canvas, TAINA_SIM.sheetUrl, "idle");
  }, [open]);

  useEffect(() => {
    if (!waveActive) return;
    const timer = setTimeout(() => setWaveActive(false), OPEN_WAVE_MS);
    return () => clearTimeout(timer);
  }, [waveActive]);

  // ── Live tour engine ────────────────────────────────────────────────
  const activeGuide: TainaGuide | undefined = tour ? getTainaGuide(tour.guideId) : undefined;
  const activeTourStep = tour && activeGuide ? activeGuide.tour[tour.index] : undefined;

  const endTour = useCallback(() => {
    setTour(null);
    setSpotRect(null);
    setSpotMissing(false);
    setTourMoving(false);
    if (savedPositionRef.current) {
      setPosition(clampToViewport(savedPositionRef.current));
      savedPositionRef.current = null;
    }
  }, []);

  const startTour = useCallback(
    (guideId: string) => {
      const guide = getTainaGuide(guideId);
      if (!guide || guide.tour.length === 0) return;
      savedPositionRef.current = lastSpritePosRef.current;
      navigatedStepRef.current = null;
      setOpen(false);
      setSpotRect(null);
      setSpotMissing(false);
      setTour({ guideId, index: 0 });
    },
    [],
  );

  const advanceTour = useCallback(
    (delta: number) => {
      setTour((current) => {
        if (!current) return null;
        const guide = getTainaGuide(current.guideId);
        if (!guide) return null;
        const next = current.index + delta;
        if (next < 0) return current;
        if (next >= guide.tour.length) {
          return null; // finished
        }
        return { ...current, index: next };
      });
      setSpotRect(null);
      setSpotMissing(false);
    },
    [],
  );

  // When the tour finished (tour flipped to null), restore the sprite.
  useEffect(() => {
    if (tour) return;
    activeStepKeyRef.current = null;
    if (savedPositionRef.current) {
      setPosition(clampToViewport(savedPositionRef.current));
      savedPositionRef.current = null;
    }
    setSpotRect(null);
    setSpotMissing(false);
    setTourMoving(false);
  }, [tour]);

  // Escape ends a running tour.
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endTour();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, endTour]);

  // Navigate + locate + track the current tour step's target element.
  useEffect(() => {
    if (!tour || !activeTourStep) return;

    let cancelled = false;
    let element: Element | null = null;
    let trackTimer: ReturnType<typeof setInterval> | null = null;
    let clickHandler: (() => void) | null = null;

    const stepKey = `${tour.guideId}:${tour.index}`;
    activeStepKeyRef.current = stepKey;
    const stepRoute = activeTourStep.route ? resolveTourRoute(activeTourStep.route) : undefined;
    if (
      stepRoute &&
      pathname !== stepRoute &&
      navigatedStepRef.current !== stepKey &&
      // If the target is already on screen (shim redirects land on a page
      // that contains it), don't navigate at all.
      !(activeTourStep.selector && findVisibleTarget(activeTourStep.selector))
    ) {
      navigatedStepRef.current = stepKey;
      router.push(`${localePrefix}${stepRoute}`);
    }

    if (!activeTourStep.selector) {
      setSpotRect(null);
      setSpotMissing(false);
      return;
    }

    const startedAt = Date.now();
    const findTimer = setInterval(() => {
      if (cancelled) return;
      const found = findVisibleTarget(activeTourStep.selector!);
      if (found) {
        clearInterval(findTimer);
        element = found;
        setSpotMissing(false);
        found.scrollIntoView({ block: "center", behavior: "smooth" });
        const measure = () => {
          if (cancelled || !element || !element.isConnected) return;
          const r = element.getBoundingClientRect();
          // The element can collapse to 0×0 (breakpoint change, closing
          // dialog) — keep the last good rect instead of jumping the
          // spotlight to the top-left corner.
          if (r.width < 1 || r.height < 1) return;
          setSpotRect((prev) => {
            if (
              prev &&
              Math.abs(prev.x - r.left) < 1 &&
              Math.abs(prev.y - r.top) < 1 &&
              Math.abs(prev.w - r.width) < 1 &&
              Math.abs(prev.h - r.height) < 1
            ) {
              return prev;
            }
            return { x: r.left, y: r.top, w: r.width, h: r.height };
          });
        };
        // Give the smooth scroll a moment, then keep tracking (elements move
        // with scrolling, dialogs, layout shifts).
        setTimeout(measure, 350);
        trackTimer = setInterval(measure, 200);
        if (activeTourStep.advanceOnClick) {
          clickHandler = () => {
            // Small delay so the click's effect (dialog, navigation) starts
            // before we look for the next target. Guarded by the step-key ref
            // (not `cancelled`): a click that navigates re-runs this effect
            // and would otherwise cancel the advance it just triggered.
            setTimeout(() => {
              if (activeStepKeyRef.current === stepKey) advanceTour(1);
            }, 650);
          };
          element.addEventListener("click", clickHandler, { capture: true, once: true });
        }
      } else if (Date.now() - startedAt > TOUR_FIND_TIMEOUT_MS) {
        clearInterval(findTimer);
        if (!cancelled) {
          setSpotRect(null);
          setSpotMissing(true);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(findTimer);
      if (trackTimer) clearInterval(trackTimer);
      if (element && clickHandler) {
        element.removeEventListener("click", clickHandler, { capture: true });
      }
    };
    // Re-run when the step or the page changes — a fresh page may finally
    // contain the selector we're waiting for.
  }, [tour, activeTourStep, pathname, localePrefix, router, advanceTour]);

  // Hop the sprite next to the spotlighted element.
  useEffect(() => {
    if (!tour) return;
    const target = spotRect
      ? computeTourSpritePosition(spotRect)
      : clampToViewport(defaultPosition());
    setPosition((prev) => {
      if (Math.abs(prev.x - target.x) < 2 && Math.abs(prev.y - target.y) < 2) return prev;
      setDragDirection(target.x >= prev.x ? "right" : "left");
      setTourMoving(true);
      return target;
    });
    const timer = setTimeout(() => setTourMoving(false), 700);
    return () => clearTimeout(timer);
  }, [tour, spotRect]);

  // ── Chat ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setView({ kind: "home" });

    let assistant = "";
    try {
      const res = await fetch("/api/sim-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, mode: "guide", locale }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ ${err.error ?? "…"}` },
        ]);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const lineTrimmed = line.trim();
          if (!lineTrimmed.startsWith("data: ")) continue;
          const data = lineTrimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistant += delta;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistant };
                return updated;
              });
            }
          } catch {
            // skip unparseable chunk
          }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "⚠️" }]);
    } finally {
      setStreaming(false);
    }
  }, [input, locale, messages, streaming]);

  if (!mounted) return null;
  if (typeof window !== "undefined" && window.self !== window.top) return null;
  // The Cert creation page ships its own docked Tainá writing companion.
  if (pathname.includes("/certs/new")) return null;

  const panelPos = open ? computePanelPosition(position) : { x: 0, y: 0 };
  const bubblePos = tour && spotRect ? computeBubblePosition(spotRect) : null;
  const guideView = view.kind === "guide" ? getTainaGuide(view.guideId) : undefined;
  // Confirmed signed out → every tour would dead-end on a sign-in wall, so
  // ask the visitor to sign in first instead of offering the tour.
  const guideNeedsSignIn = signedIn === false;
  // Confirmed "no projects yet" for a guide that needs one → tell the user
  // to create a project first instead of showing an impossible tour.
  const guideNeedsProject =
    !guideNeedsSignIn && Boolean(guideView?.requiresProject) && hasProjects === false;

  // A running tour always takes precedence over the minimized state (it can
  // be rehydrated from sessionStorage after a hard navigation).
  if (minimized && !tour) {
    return (
      <button
        type="button"
        onClick={() => {
          setMinimized(false);
          setWaveActive(true);
        }}
        aria-label={t("restoreLabel")}
        title={t("restoreLabel")}
        // On /feed the phone composer bar sits at the bottom, so lift the tab
        // above it there (mobile only — the bar is sm:hidden); elsewhere and on
        // larger screens it keeps its usual bottom-6 spot.
        className={`fixed right-0 z-[70] flex items-center rounded-l-full border border-r-0 border-border bg-background/95 py-1 pl-2 pr-1.5 shadow-[0_2px_10px_-3px_rgba(40,50,30,0.3)] backdrop-blur-sm transition-transform hover:-translate-x-0.5 ${pathname === "/feed" ? "bottom-24 sm:bottom-6" : "bottom-6"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/media/images/app-icon.png"
          alt=""
          width={24}
          height={24}
          className="drop-shadow-md"
          draggable={false}
        />
      </button>
    );
  }

  return (
    <>
      {/* ── LIVE TOUR: spotlight + speech bubble ─────────────────────── */}
      {tour && activeGuide && activeTourStep ? (
        <>
          {spotRect ? (
            <div
              aria-hidden
              className="pointer-events-none fixed rounded-xl border-2 border-primary transition-all duration-300"
              style={{
                zIndex: Z_SPOTLIGHT,
                left: spotRect.x - 6,
                top: spotRect.y - 6,
                width: spotRect.w + 12,
                height: spotRect.h + 12,
                boxShadow: "0 0 0 4px color-mix(in srgb, var(--primary) 35%, transparent), 0 0 0 9999px rgba(15, 23, 15, 0.45)",
              }}
            />
          ) : null}
          <div
            role="dialog"
            aria-label={guidesT(`${tour.guideId}.title`)}
            className="fixed rounded-2xl border border-border bg-background p-3 shadow-xl transition-all duration-300"
            style={{
              zIndex: Z_BUBBLE,
              width: TOUR_BUBBLE_W,
              left: bubblePos ? bubblePos.x : undefined,
              top: bubblePos ? bubblePos.y : undefined,
              right: bubblePos ? undefined : 16,
              bottom: bubblePos ? undefined : 16 + SPRITE_H + BADGE_RESERVE,
            }}
          >
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {guidesT(`${tour.guideId}.title`)} · {t("stepOf", { current: tour.index + 1, total: activeGuide.tour.length })}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
              {spotMissing ? `${t("cantFind")} ` : null}
              {guidesT(`${tour.guideId}.tour.${activeTourStep.id}`)}
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={endTour}
                className="rounded-full px-2.5 py-1 text-[12px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              >
                {t("endTour")}
              </button>
              <div className="flex items-center gap-1.5">
                {tour.index > 0 ? (
                  <button
                    type="button"
                    onClick={() => advanceTour(-1)}
                    className="rounded-full border border-border px-3 py-1 text-[12px] text-foreground hover:bg-foreground/5"
                  >
                    {t("previous")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => advanceTour(1)}
                  className="rounded-full bg-primary px-3 py-1 text-[12px] font-medium text-primary-foreground hover:opacity-90"
                >
                  {tour.index + 1 >= activeGuide.tour.length ? t("done") : t("next")}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* ── CHAT / GUIDE PANEL ───────────────────────────────────────── */}
      {open && !tour ? (
        <div
          role="dialog"
          aria-label={`${TAINA_SIM.name} — ${t("role")}`}
          className="fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
          style={{ left: panelPos.x, top: panelPos.y, width: PANEL_W, height: PANEL_H }}
          data-no-drag
        >
          {/* header */}
          <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
            {view.kind === "guide" ? (
              <button
                type="button"
                onClick={() => setView({ kind: "home" })}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
                aria-label={t("back")}
              >
                ←
              </button>
            ) : (
              <canvas
                ref={headerCanvasRef}
                width={192}
                height={208}
                style={{ width: 36, height: 39, imageRendering: "pixelated" }}
                className="shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium text-foreground">
                {view.kind === "guide" && guideView
                  ? guidesT(`${guideView.id}.title`)
                  : TAINA_SIM.name}
              </div>
              {view.kind === "home" ? (
                <div className="truncate text-[11px] text-foreground/55">{t("role")}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMinimized(true);
              }}
              className="grid h-7 w-7 place-items-center rounded-full text-foreground/55 hover:bg-foreground/5 hover:text-foreground"
              aria-label={t("minimizeLabel")}
              title={t("minimizeLabel")}
            >
              –
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-full text-foreground/55 hover:bg-foreground/5 hover:text-foreground"
              aria-label={t("close")}
            >
              ×
            </button>
          </div>

          {/* body */}
          <div ref={panelBodyRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[13px] leading-relaxed">
            {view.kind === "home" ? (
              <>
                {messages.length === 0 ? (
                  <div className="rounded-2xl bg-foreground/5 px-3 py-2 text-foreground/70">
                    <p>
                      <span aria-hidden>🌿</span> {t("greeting")}
                    </p>
                    <p className="mt-1 text-foreground/55">{t("greetingHint")}</p>
                  </div>
                ) : null}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-8 whitespace-pre-wrap rounded-2xl bg-primary px-3 py-2 text-primary-foreground"
                        : "mr-8 whitespace-pre-wrap rounded-2xl bg-foreground/5 px-3 py-2 text-foreground"
                    }
                  >
                    {m.content || <span className="text-foreground/40">…</span>}
                  </div>
                ))}
                <div ref={messagesEndRef} />
                {/* FAQ quick questions */}
                <div>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("guidesTitle")}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {TAINA_GUIDES.map((guide) => (
                      <button
                        key={guide.id}
                        type="button"
                        onClick={() => setView({ kind: "guide", guideId: guide.id })}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                      >
                        {guidesT(`${guide.id}.question`)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : guideView ? (
              <>
                <p className="text-foreground/70">{guidesT(`${guideView.id}.intro`)}</p>
                {guideNeedsSignIn ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                    <p className="text-foreground/80">{t("signInFirst")}</p>
                  </div>
                ) : null}
                {guideNeedsProject ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                    <p className="text-foreground/80">{t("needProjectFirst")}</p>
                    <button
                      type="button"
                      onClick={() => setView({ kind: "guide", guideId: "createProject" })}
                      className="mt-2 w-full rounded-xl bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      ✨ {t("createProjectFirst")}
                    </button>
                  </div>
                ) : null}
                {guideView.tour.length > 0 && !guideNeedsProject && !guideNeedsSignIn ? (
                  <button
                    type="button"
                    onClick={() => startTour(guideView.id)}
                    className="w-full rounded-xl bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    ✨ {t("showMe")}
                  </button>
                ) : null}
                <ol className="space-y-4">
                  {guideView.steps.map((step, index) => (
                    <li key={step.id} className="space-y-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="grid h-5 w-5 shrink-0 translate-y-0.5 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {index + 1}
                        </span>
                        <span className="font-medium text-foreground">
                          {guidesT(`${guideView.id}.steps.${step.id}.title`)}
                        </span>
                      </div>
                      <p className="pl-7 text-foreground/70">
                        {guidesT(`${guideView.id}.steps.${step.id}.body`)}
                      </p>
                      {step.image ? (
                        <a
                          href={step.image}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-7 block overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-90"
                          aria-label={t("openImage")}
                        >
                          <Image
                            src={step.image}
                            alt={guidesT(`${guideView.id}.steps.${step.id}.title`)}
                            width={1280}
                            height={577}
                            className="h-auto w-full"
                            unoptimized
                            loading="lazy"
                          />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </div>

          {/* input (home view only) */}
          {view.kind === "home" ? (
            <form
              className="flex items-end gap-2 border-t border-border px-3 py-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={streaming ? t("thinking") : t("placeholder")}
                rows={1}
                disabled={streaming}
                className="max-h-24 min-h-[36px] flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary/60 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("send")}
              >
                ↑
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* ── SPRITE ───────────────────────────────────────────────────── */}
      <div
        role="button"
        aria-label={t("spriteLabel")}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
          if ((e.key === "Enter" || e.key === " ") && !tour) {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={`group fixed select-none ${tour ? "transition-all duration-500 ease-out" : ""} ${
          dragging ? "cursor-grabbing" : tour ? "cursor-default" : "cursor-grab"
        }`}
        style={{
          zIndex: Z_SPRITE,
          left: position.x,
          top: position.y,
          width: SPRITE_W,
          height: SPRITE_H,
          touchAction: "none",
        }}
      >
        {/* Soft halo behind the sprite so page content underneath doesn't
            visually collide with her (same treatment as data-soil). */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-2 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at 50% 56%, var(--background) 0%, var(--background) 52%, color-mix(in srgb, var(--background) 78%, transparent) 68%, transparent 92%)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={TAINA_SIM.posterUrl}
          alt=""
          width={SPRITE_W}
          height={SPRITE_H}
          className="absolute inset-0 transition-opacity duration-200"
          style={{ imageRendering: "pixelated", opacity: firstFramePainted ? 0 : 1 }}
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          width={192}
          height={208}
          style={{ width: SPRITE_W, height: SPRITE_H, imageRendering: "pixelated" }}
          className="absolute inset-0"
        />
        {/* Minimize — revealed on hover/focus (desktop); the panel header has
            the same control for touch users. */}
        {!tour && !dragging ? (
          <button
            type="button"
            data-no-drag
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              setMinimized(true);
            }}
            aria-label={t("minimizeLabel")}
            title={t("minimizeLabel")}
            className="absolute -right-1 -top-1 z-10 hidden h-5 w-5 place-items-center rounded-full border border-border bg-background text-[12px] leading-none text-foreground/60 shadow-sm hover:text-foreground focus-visible:grid group-hover:grid"
          >
            –
          </button>
        ) : null}
        {!open && !tour ? (
          <div
            aria-hidden
            className={
              "pointer-events-none absolute left-1/2 top-full mt-1 " +
              "-translate-x-1/2 whitespace-nowrap rounded-full " +
              "border border-border bg-background/95 " +
              "px-2.5 py-[3px] text-[11px] text-primary " +
              "shadow-[0_2px_8px_-3px_rgba(40,50,30,0.22)] " +
              "backdrop-blur-sm transition-opacity duration-150 " +
              (dragging ? "opacity-0" : "opacity-100")
            }
          >
            {t("shield")}
          </div>
        ) : null}
      </div>
    </>
  );
}
