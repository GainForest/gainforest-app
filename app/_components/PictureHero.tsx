import Image from "next/image";
import type { ReactNode } from "react";

type PictureHeroProps = {
  lightSrc: string;
  darkSrc: string;
  imageAlt?: string;
  eyebrow: string;
  icon?: ReactNode;
  title: string;
  accent?: string;
  lede: string;
  actions?: ReactNode;
  priority?: boolean;
  compact?: boolean;
};

export function PictureHero({
  lightSrc,
  darkSrc,
  imageAlt = "",
  eyebrow,
  title,
  accent,
  lede,
  actions,
  priority = true,
  compact = false,
}: PictureHeroProps) {
  return (
    <div className={compact ? "relative isolate min-h-[240px] overflow-hidden bg-card" : "relative isolate min-h-[330px] overflow-hidden bg-card"}>
      <div className="absolute inset-0" aria-hidden={!imageAlt}>
        <Image
          src={lightSrc}
          alt={imageAlt}
          fill
          priority={priority}
          quality={95}
          sizes="(min-width: 768px) calc(100vw - 15rem), 100vw"
          className="object-cover object-center dark:hidden"
        />
        <Image
          src={darkSrc}
          alt={imageAlt}
          fill
          priority={priority}
          quality={95}
          sizes="(min-width: 768px) calc(100vw - 15rem), 100vw"
          className="hidden object-cover object-center dark:block"
        />
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_36%,color-mix(in_oklab,var(--primary)_16%,transparent)_0%,transparent_28%),linear-gradient(90deg,color-mix(in_oklab,var(--background)_76%,transparent)_0%,color-mix(in_oklab,var(--background)_48%,transparent)_34%,transparent_64%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_50%,transparent)_0%,transparent_43%,var(--background)_100%)] dark:bg-[radial-gradient(circle_at_76%_36%,color-mix(in_oklab,var(--primary)_12%,transparent)_0%,transparent_30%),linear-gradient(90deg,color-mix(in_oklab,var(--background)_82%,transparent)_0%,color-mix(in_oklab,var(--background)_48%,transparent)_36%,transparent_66%),linear-gradient(180deg,color-mix(in_oklab,var(--background)_62%,transparent)_0%,transparent_42%,var(--background)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/70 to-transparent" />

      <div className={compact ? "relative z-10 mx-auto flex max-w-6xl flex-col px-8 pt-[64px] pb-8 sm:px-10 lg:px-9" : "relative z-10 mx-auto flex max-w-6xl flex-col px-8 pt-[86px] pb-14 sm:px-10 lg:px-9"}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <h1
              className={compact ? "max-w-4xl text-4xl leading-[0.98] font-light tracking-[-0.035em] text-foreground drop-shadow-sm dark:text-white sm:text-5xl md:text-5xl lg:text-6xl" : "max-w-4xl text-4xl leading-[0.98] font-light tracking-[-0.035em] text-foreground drop-shadow-sm dark:text-white sm:text-5xl md:text-6xl lg:text-7xl"}
              style={{ fontFamily: "var(--font-garamond-var)" }}
            >
              {title}{" "}
              {accent ? (
                <span
                  className="text-foreground/90 dark:text-white/90"
                  style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}
                >
                  {accent}
                </span>
              ) : null}
            </h1>
            <p className={compact ? "mt-4 max-w-2xl text-base leading-7 text-muted-foreground dark:text-white/70 md:text-base" : "mt-7 max-w-2xl text-base leading-8 text-muted-foreground dark:text-white/70 md:text-lg"}>
              {lede}
            </p>
          </div>
          {actions ? <div className={compact ? "shrink-0" : "shrink-0 lg:pb-2"}>{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
