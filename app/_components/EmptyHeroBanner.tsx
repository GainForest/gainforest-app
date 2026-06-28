"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Shared "nothing here yet" banner — the same seedling hero the projects view
// uses for its empty state. Presentational only: callers pass already-translated
// copy and an optional call-to-action so it can be reused across tabs.
export function EmptyHeroBanner({
  description,
  ctaLabel,
  ctaHref,
  onCtaClick,
  ctaIcon,
  ctaDisabled = false,
  ctaDisabledReason,
  className,
}: {
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Render the CTA as a button with this handler instead of a link. */
  onCtaClick?: () => void;
  ctaIcon?: ReactNode;
  ctaDisabled?: boolean;
  ctaDisabledReason?: string | null;
  className?: string;
}) {
  const showCta = Boolean(ctaLabel) && (ctaDisabled || Boolean(ctaHref) || Boolean(onCtaClick));

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn("relative overflow-visible rounded-[1.6rem] border border-border/80 bg-card shadow-sm", className)}
    >
      <div className="relative min-h-[6rem] overflow-hidden rounded-[1.55rem]">
        <Image
          src="/assets/media/images/create-bumicert/hero-light@2x.webp"
          alt=""
          fill
          quality={95}
          sizes="100vw"
          className="object-cover object-center dark:hidden"
        />
        <Image
          src="/assets/media/images/create-bumicert/hero-dark@2x.webp"
          alt=""
          fill
          quality={95}
          sizes="100vw"
          className="hidden object-cover object-center dark:block"
        />
        <div className="absolute inset-0 bg-linear-to-r from-background/95 via-background/72 to-background/5 dark:from-background/90 dark:via-background/58 dark:to-background/10" />
        <div className="absolute -top-8 right-[7%] h-28 w-52 rounded-full bg-background/50 blur-2xl dark:bg-primary/10" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-foreground/20 via-foreground/5 to-transparent dark:from-black/55" />

        <div className="relative z-30 flex min-h-[6rem] flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 lg:px-9">
          <p className="w-full text-sm leading-5 text-muted-foreground sm:max-w-[30rem]">{description}</p>
          {showCta ? (
            ctaDisabled ? (
              <Button type="button" size="sm" disabled title={ctaDisabledReason ?? undefined} className="shrink-0 self-start sm:self-auto">
                {ctaIcon}
                {ctaLabel}
              </Button>
            ) : onCtaClick ? (
              <Button type="button" size="sm" onClick={onCtaClick} className="shrink-0 self-start sm:self-auto">
                {ctaIcon}
                {ctaLabel}
              </Button>
            ) : (
              <Button asChild size="sm" className="shrink-0 self-start sm:self-auto">
                <Link href={ctaHref!}>
                  {ctaIcon}
                  {ctaLabel}
                </Link>
              </Button>
            )
          ) : null}
        </div>
      </div>
      <Image
        src="/assets/media/images/create-bumicert/plant-light.png"
        alt=""
        width={1002}
        height={1146}
        className="pointer-events-none absolute bottom-0 right-[4%] z-20 hidden h-[9rem] w-auto max-w-[50%] object-contain dark:hidden md:block"
      />
      <Image
        src="/assets/media/images/create-bumicert/plant-dark.png"
        alt=""
        width={964}
        height={1129}
        className="pointer-events-none absolute bottom-0 right-[4%] z-20 hidden h-[9rem] w-auto max-w-[50%] object-contain dark:md:block"
      />
    </motion.section>
  );
}
