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

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Confetti } from "../_components/Confetti";
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
