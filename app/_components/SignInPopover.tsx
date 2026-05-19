"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "./LocaleProvider";

// Tiny popover that hosts the ATProto OAuth handle form. Matches the
// behaviour of simocracy's sign-in flow: user types a handle (or PDS
// URL), submitting POSTs/GETs to /api/oauth/login, the server kicks off
// PAR, and the browser is redirected to the upstream PDS.
//
// We render it inside the navbar via a portal-free dropdown so the rest
// of the landing stays a server component.
export function SignInPopover({
  signedIn,
  handle,
}: {
  signedIn: boolean;
  handle: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (signedIn) {
    return (
      <div className="relative" ref={popRef}>
        {/* Signed-in chip uses the brand mint as a subtle live-data
            accent — the visual rhyme with the LIVE badges on the hero
            cards is intentional. Both say "this surface is hooked up
            to live ATProto data right now". */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-brand/40 bg-background/40 pl-2 pr-3 text-[13px] font-medium text-brand-dark transition-colors hover:border-brand-dark"
          title={handle ?? undefined}
        >
          <span
            aria-hidden
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] text-primary-foreground"
          >
            ✓
          </span>
          <span className="max-w-[160px] truncate">
            {handle ?? t("nav.signedIn")}
          </span>
        </button>
        {open && (
          <div className="absolute right-0 top-[44px] z-50 w-56 rounded-md border border-border-soft bg-background p-2 shadow-lg">
            <p className="px-2 pb-2 pt-1 text-[12px] text-foreground/55">
              Signed in via ATProto
            </p>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="w-full rounded-md px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-foreground/[0.06]"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[14px] font-normal text-foreground/70 transition-colors hover:text-primary"
      >
        {t("nav.signIn")}
      </button>
      {open && (
        <div className="absolute right-0 top-[44px] z-50 w-72 rounded-md border border-border-soft bg-background p-3 shadow-lg">
          <p className="px-1 pb-2 text-[12px] leading-relaxed text-foreground/65">
            Sign in with ATProto. Enter your{" "}
            <span className="font-medium">handle</span> (e.g.{" "}
            <code className="font-mono">alice.bsky.social</code>) or your{" "}
            <span className="font-medium">PDS URL</span>.
          </p>
          <form
            action="/api/oauth/login"
            method="get"
            className="flex flex-col gap-2"
          >
            <input
              autoFocus
              required
              name="handle"
              placeholder="handle.bsky.social"
              autoComplete="username"
              spellCheck={false}
              className="w-full rounded-md border border-border-soft bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary/60"
            />
            <button
              type="submit"
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
            >
              Continue
            </button>
          </form>
          <p className="px-1 pt-2 text-[11px] leading-snug text-foreground/45">
            We never see your password — the upstream PDS handles the
            sign-in.
          </p>
        </div>
      )}
    </div>
  );
}
