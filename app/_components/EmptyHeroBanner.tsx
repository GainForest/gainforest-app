"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SectionSurface } from "@/components/ui/section-surface";
import { DisplayHeading } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

// Shared "nothing here yet" banner — the same seedling hero the projects view
// uses for its empty state. Presentational only: callers pass already-translated
// copy and an optional call-to-action so it can be reused across tabs.
export function EmptyHeroBanner({
  title,
  description,
  ctaLabel,
  ctaHref,
  onCtaClick,
  ctaIcon,
  ctaDisabled = false,
  ctaDisabledReason,
  className,
}: {
  title?: string;
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
  const disabledReasonId = useId();

  return (
    <SectionSurface
      variant="muted"
      className={cn("animate-in relative isolate overflow-visible rounded-[1.6rem] p-0 motion-reduce:animate-none", className)}
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
          <div className="w-full sm:max-w-[30rem]">
            {title ? (
              <DisplayHeading as="h2" className="text-2xl leading-tight text-foreground">
                {title}
              </DisplayHeading>
            ) : null}
            <p className={cn("text-sm leading-5 text-muted-foreground", title && "mt-1.5")}>{description}</p>
            {ctaDisabled && ctaDisabledReason ? (
              <p id={disabledReasonId} className="mt-2 text-xs leading-5 text-muted-foreground">
                {ctaDisabledReason}
              </p>
            ) : null}
          </div>
          {showCta ? (
            ctaDisabled ? (
              <Button type="button" size="sm" disabled aria-describedby={ctaDisabledReason ? disabledReasonId : undefined} className="shrink-0 self-start sm:self-auto">
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
    </SectionSurface>
  );
}
