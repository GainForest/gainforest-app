"use client";

/**
 * BioBlitz registration button.
 *
 * Taking part is opt-in and lives entirely on the commons: instead of an
 * external sign-up form, clicking "Register" publishes a short feed post
 * (app.gainforest.feed.post) announcing the viewer is joining the round, tagged
 * so the page can recognise it. The button then flips to a "registered" state
 * and a burst of confetti celebrates the join. On a later visit the page detects
 * that join post and shows the registered state automatically.
 *
 * The viewer's account is resolved client-side via /api/session, so the page
 * itself stays a cacheable static shell.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { CalendarCheckIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { redirectToLogin } from "../_lib/auth-client";
import { createFeedPost } from "@/app/(manage)/manage/_lib/mutations";
import {
  bioblitzJoinTags,
  fetchBioblitzRegistration,
  type BioblitzRound,
  type RoundStatus,
} from "../_lib/bioblitz";

type SessionState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "signedIn"; did: string };

/** Resolve the signed-in viewer's account id from the shell session endpoint. */
function useViewerDid(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { session?: { isLoggedIn?: boolean; did?: string } } | null) => {
        if (cancelled) return;
        const session = data?.session;
        if (session?.isLoggedIn && typeof session.did === "string") {
          setState({ status: "signedIn", did: session.did });
        } else {
          setState({ status: "anon" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "anon" });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function RegisterButton({ round, status }: { round: BioblitzRound; status: RoundStatus }) {
  const t = useTranslations("marketplace.bioblitz.rsvp");
  const locale = useLocale();
  const session = useViewerDid();

  // null = not yet known, false = not registered, true = registered.
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  // Detect an existing join post for the active account + round.
  useEffect(() => {
    if (session.status !== "signedIn") {
      setRegistered(session.status === "anon" ? false : null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setRegistered(null);
    fetchBioblitzRegistration(round, session.did, controller.signal)
      .then((uri) => {
        if (!cancelled) setRegistered(Boolean(uri));
      })
      .catch(() => {
        if (!cancelled) setRegistered(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [session, round]);

  const register = useCallback(async () => {
    if (session.status !== "signedIn") {
      redirectToLogin();
      return;
    }
    if (busy || registered) return;
    setBusy(true);
    setError(false);
    try {
      await createFeedPost({
        text: t("postText", { label: round.label }),
        tags: bioblitzJoinTags(round),
        langs: [locale],
      });
      // Indexer ingestion lags the write, so trust the successful publish.
      setRegistered(true);
      setCelebrate(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [session, busy, registered, t, round, locale]);

  // The round has closed — registration is no longer offered.
  if (status === "ended") return null;

  if (registered) {
    return (
      <div className="mt-1 flex flex-col items-start gap-1.5 md:items-end">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-5 py-2 text-sm font-semibold text-primary">
          <CheckCircle2Icon className="size-4" aria-hidden />
          {t("registered")}
        </span>
        <span className="max-w-xs text-[11px] leading-snug text-muted-foreground md:text-right">
          {t("registeredNote")}
        </span>
        {celebrate ? <Confetti onDone={() => setCelebrate(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col items-start gap-1.5 md:items-end">
      <button
        type="button"
        onClick={() => void register()}
        disabled={busy || session.status === "loading"}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark disabled:opacity-70"
      >
        {busy ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        ) : (
          <CalendarCheckIcon className="size-4" aria-hidden />
        )}
        {busy ? t("registering") : t("button")}
      </button>
      <span className="max-w-xs text-[11px] leading-snug text-muted-foreground md:text-right">
        {error ? <span className="text-destructive">{t("error")}</span> : t("note")}
      </span>
    </div>
  );
}

// ── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  "#16a34a",
  "#22c55e",
  "#84cc16",
  "#fde047",
  "#f97316",
  "#38bdf8",
  "#ec4899",
];

type Piece = {
  id: number;
  left: number;
  drift: number;
  rot: number;
  duration: number;
  delay: number;
  size: number;
  color: string;
  circle: boolean;
};

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: Math.random() * 100,
    drift: (Math.random() * 2 - 1) * 180,
    rot: Math.random() * 960 - 480,
    duration: 1.9 + Math.random() * 1.3,
    delay: Math.random() * 0.35,
    size: 7 + Math.random() * 9,
    color: CONFETTI_COLORS[id % CONFETTI_COLORS.length],
    circle: Math.random() > 0.55,
  }));
}

const CONFETTI_CSS = `
@keyframes bioblitz-confetti-fall {
  0% { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
  85% { opacity: 1; }
  100% { transform: translate3d(var(--bb-drift), 110vh, 0) rotate(var(--bb-rot)); opacity: 0; }
}
.bioblitz-confetti-piece {
  position: absolute;
  top: 0;
  will-change: transform, opacity;
  animation-name: bioblitz-confetti-fall;
  animation-timing-function: cubic-bezier(0.18, 0.7, 0.35, 1);
  animation-fill-mode: forwards;
}
@media (prefers-reduced-motion: reduce) {
  .bioblitz-confetti-piece { display: none; }
}
`;

/** A one-shot celebratory confetti burst rendered into a body-level portal so it
 *  rains over the whole viewport. Self-removes after the animation completes;
 *  fully hidden under prefers-reduced-motion. */
function Confetti({ onDone }: { onDone: () => void }) {
  const pieces = useMemo(() => makePieces(110), []);
  const [mounted, setMounted] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setMounted(true);
    const id = window.setTimeout(() => doneRef.current(), 3400);
    return () => window.clearTimeout(id);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      <style>{CONFETTI_CSS}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="bioblitz-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.circle ? p.size : p.size * 0.6,
            height: p.size,
            background: p.color,
            borderRadius: p.circle ? "9999px" : "2px",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            ["--bb-drift" as string]: `${p.drift}px`,
            ["--bb-rot" as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
