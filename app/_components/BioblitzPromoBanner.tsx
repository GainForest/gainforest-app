"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BinocularsIcon, CameraIcon, ChevronRightIcon, TrophyIcon, XIcon } from "lucide-react";
import { BIOBLITZ_PRIZES } from "../_lib/bioblitz";

const EASE = [0.22, 1, 0.36, 1] as const;
const SESSION_KEY = "bioblitz-banner-dismissed";
const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea';

/**
 * Full-width promo strip pinned above the sidebar and main content. Tapping it
 * grows a bespoke top-down drawer straight out of the banner: a backdrop panel
 * expands its height to the viewport, blurs the page behind it, and reveals the
 * challenge details. Hand-rolled focus trap + scroll lock keep it modal while
 * open. The close control dismisses the drawer; the banner's own close dismisses
 * the strip for the session.
 */
export function BioblitzPromoBanner() {
  const t = useTranslations("marketplace.bioblitz");
  const locale = useLocale();
  const reduceMotion = useReducedMotion();

  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState({ bannerH: 44, vh: 0 });

  const bannerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Restore the session dismissal (state alone survives client navigation; this
  // covers a full reload within the same tab session).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") setDismissed(true);
    } catch {
      // Private windows can block storage; fall back to in-memory state.
    }
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const openDrawer = useCallback(() => {
    setDims({ bannerH: bannerRef.current?.offsetHeight ?? 44, vh: window.innerHeight });
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
  }, []);

  // Keep the drawer the full height of the viewport as it resizes while open.
  useEffect(() => {
    if (!open) return;
    const onResize = () => setDims((d) => ({ ...d, vh: window.innerHeight }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Modal behaviour while open: trap focus, lock background scroll, close on
  // Escape, and restore focus to the trigger on exit.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const mainEl = document.querySelector("main");
    const prevMainOverflow = mainEl?.style.overflow ?? "";
    const prevBodyOverflow = document.body.style.overflow;
    if (mainEl) mainEl.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.getClientRects().length > 0,
      );

    const raf = requestAnimationFrame(() => (focusables()[0] ?? panelRef.current)?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panelRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      if (mainEl) mainEl.style.overflow = prevMainOverflow;
      document.body.style.overflow = prevBodyOverflow;
      (previouslyFocused ?? triggerRef.current)?.focus?.();
    };
  }, [open, close]);

  if (dismissed) return null;

  const title = `${t("hero.titlePrefix")} ${t("hero.titleEmphasis")}`;

  return (
    <div ref={bannerRef} className="relative shrink-0">
      {/* The strip itself — a button. The whole thing opens the drawer. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openDrawer}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-x-3 gap-y-1 bg-primary px-4 py-2.5 text-center text-primary-foreground transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/40"
      >
        <BinocularsIcon className="hidden size-4 shrink-0 sm:block" aria-hidden />
        <span className="text-sm font-medium leading-snug">{t("banner.message")}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
          {t("banner.cta")}
          <ChevronRightIcon className="size-3.5" aria-hidden />
        </span>
      </button>

      {/* Session dismissal — sits above the trigger, never opens the drawer. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("banner.dismiss")}
        className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-primary-foreground/80 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/40"
      >
        <XIcon className="size-4" aria-hidden />
      </button>

      {/* The drawer: grows out of the banner to fill the viewport. */}
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className="fixed inset-x-0 top-0 z-[70] overflow-hidden bg-background/80 backdrop-blur-xl outline-none"
            initial={{ height: dims.bannerH }}
            animate={{ height: dims.vh }}
            exit={{ height: dims.bannerH }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: EASE }}
          >
            {/* Fixed-height inner panel so content never squishes mid-grow. */}
            <div style={{ height: dims.vh }} className="relative flex flex-col">
              {/* Close — pinned to the panel corner, above the scrolling content. */}
              <button
                type="button"
                onClick={close}
                aria-label={t("banner.close")}
                className="absolute right-5 top-5 z-20 flex size-10 items-center justify-center rounded-full bg-background/50 text-foreground backdrop-blur transition-colors hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon className="size-5" aria-hidden />
              </button>

              {/* One scroll flow holds the image and the copy, so the title can
                  rise over the image fade instead of being clipped by a boundary. */}
              <div
                className="flex-1 overflow-y-auto"
                onClick={(event) => {
                  if (event.target === event.currentTarget) close();
                }}
              >
                {/* Full-bleed nature header — reveals immediately as the drawer
                    grows. A masking gradient fades the image pixels to transparent
                    toward the bottom, letting the blurred page show through. */}
                <div
                  className="relative h-[40vh] max-h-[440px] min-h-[240px] w-full overflow-hidden"
                  style={{
                    maskImage: "linear-gradient(to bottom, #000 45%, transparent 100%)",
                    WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent 100%)",
                  }}
                >
                  <Image
                    src="/assets/media/images/observations/observations-hero-light@2x.webp"
                    alt=""
                    fill
                    priority
                    sizes="100vw"
                    aria-hidden
                    className="object-cover object-center dark:hidden"
                  />
                  <Image
                    src="/assets/media/images/observations/observations-hero-dark@2x.webp"
                    alt=""
                    fill
                    priority
                    sizes="100vw"
                    aria-hidden
                    className="hidden object-cover object-center dark:block"
                  />
                </div>

                {/* Copy rises out of the fade. Only this fades in; the image is
                    part of the reveal itself. */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={
                    reduceMotion ? { duration: 0 } : { duration: 0.45, delay: 0.2, ease: EASE }
                  }
                  className="relative z-10 mx-auto -mt-28 max-w-lg px-6 pb-20 text-center sm:-mt-32"
                >
                  <h2 className="font-instrument text-6xl font-light italic leading-[0.92] tracking-[-0.035em] text-foreground sm:text-7xl">
                    {t("hero.titlePrefix")} <span className="text-primary">{t("hero.titleEmphasis")}</span>
                  </h2>
                  <p className="mx-auto mt-5 max-w-sm text-[15px] leading-7 text-muted-foreground">
                    {t("hero.description")}
                  </p>

                  <div className="mt-9 grid grid-cols-2 gap-3">
                    <PrizeMini
                      featured
                      amount={formatPrize(BIOBLITZ_PRIZES.mostObservations, locale)}
                      icon={<TrophyIcon />}
                      title={t("prizes.mostObservations.title")}
                    />
                    <PrizeMini
                      amount={formatPrize(BIOBLITZ_PRIZES.bestPicture, locale)}
                      icon={<CameraIcon />}
                      title={t("prizes.bestPicture.title")}
                    />
                  </div>

                  <Link
                    href="/bioblitz"
                    onClick={close}
                    className="group mt-9 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-dark"
                  >
                    {t("banner.cta")}
                    <ChevronRightIcon
                      className="size-5 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PrizeMini({
  amount,
  icon,
  title,
  featured = false,
}: {
  amount: string;
  icon: ReactNode;
  title: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2.5 rounded-3xl px-4 py-7 text-center backdrop-blur ${
        featured ? "bg-gradient-to-b from-primary/[0.16] via-primary/[0.06] to-transparent" : "bg-foreground/5"
      }`}
    >
      <span
        className={`flex size-9 items-center justify-center rounded-full text-primary [&_svg]:size-[18px] ${
          featured ? "bg-primary/15" : "bg-primary/10"
        }`}
      >
        {icon}
      </span>
      <span className="font-instrument text-5xl italic leading-none tracking-tight text-primary">{amount}</span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  );
}

function formatPrize(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
