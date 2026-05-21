"use client";

import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale } from "../../_components/LocaleProvider";
import { getAboutT } from "../_messages";
import { ADVISORS, COFOUNDERS, CORE_TEAM, type TeamMember } from "../_data";

// "A small global team, building in the open." — three stacked
// groups of cards: Co-founders, Core team, Advisors. Each card is a
// text-first editorial cell with optional headshot circle on the
// left. We deliberately don't fabricate photos for anyone — when a
// headshot isn't available, the cell renders cleanly as text-only
// with a Cormorant Garamond initial monogram in a sage circle, the
// same recipe the Nature Guild block uses.
export function AboutTeam() {
  const { locale } = useLocale();
  const t = getAboutT(locale);

  const before = t("about.team.heading.before").trim();
  const italic = t("about.team.heading.italic").trim();
  const after = t("about.team.heading.after").trim();

  return (
    <section
      id="team"
      className="scroll-mt-20 border-t border-border-soft bg-background lg:scroll-mt-24"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        {/* Section header */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("about.team.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[32px] sm:text-[42px] lg:text-[54px] font-normal leading-[1.06] tracking-[-0.01em] text-foreground">
              {before && (
                <Fragment>
                  <span>{before}</span>{" "}
                </Fragment>
              )}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && (after === "." ? after : <span> {after}</span>)}
            </h2>
          </div>
          <p className="text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/70 lg:col-span-5">
            {t("about.team.subheading")}
          </p>
        </div>

        {/* Co-founders — featured cards (wider, with bios). */}
        <TeamGroup label={t("about.team.cofounders")} members={COFOUNDERS} featured />

        {/* Core team — 3-column grid. */}
        <TeamGroup label={t("about.team.core")} members={CORE_TEAM} />

        {/* Advisors — compact text-only list. */}
        <TeamGroup label={t("about.team.advisors")} members={ADVISORS} compact />
      </div>
    </section>
  );
}

function TeamGroup({
  label,
  members,
  featured,
  compact,
}: {
  label: string;
  members: ReadonlyArray<TeamMember>;
  featured?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="mt-14 first:mt-12 lg:mt-20 lg:first:mt-16">
      <div className="flex items-center gap-4">
        <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
          {label}
        </span>
        <span aria-hidden className="h-px flex-1 bg-border-soft" />
      </div>
      <ul
        role="list"
        className={
          compact
            ? "mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:mt-8 lg:grid-cols-3"
            : featured
              ? "mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:mt-10 lg:gap-10"
              : "mt-8 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3"
        }
      >
        {members.map((m) => (
          <TeamCard
            key={m.name}
            member={m}
            featured={featured}
            compact={compact}
          />
        ))}
      </ul>
    </div>
  );
}

function TeamCard({
  member,
  featured,
  compact,
}: {
  member: TeamMember;
  featured?: boolean;
  compact?: boolean;
}) {
  const inner = (
    <div
      className={
        compact
          ? "flex items-center gap-3"
          : featured
            ? "flex items-start gap-5"
            : "flex items-start gap-4"
      }
    >
      <Avatar member={member} size={compact ? 40 : featured ? 64 : 52} />
      <div className="min-w-0 flex-1">
        <div
          className={
            compact
              ? "font-garamond text-[18px] font-normal leading-[1.15] text-foreground"
              : "font-garamond text-[22px] lg:text-[24px] font-normal leading-[1.15] tracking-[-0.005em] text-foreground"
          }
        >
          {member.name}
        </div>
        <div className="mt-1 text-[13px] text-foreground/65">
          {member.role}
          {member.location && (
            <span className="text-foreground/40"> · {member.location}</span>
          )}
        </div>
        {!compact && member.bio && (
          <p className="mt-3 text-[14px] leading-[1.55] text-foreground/72">
            {member.bio}
          </p>
        )}
      </div>
    </div>
  );

  // Whole card becomes a Link when a profile URL exists, otherwise
  // it renders inert. Keeps the hover affordance honest — no fake
  // pointer cursor on cards that go nowhere.
  if (member.href) {
    return (
      <li>
        <Link
          href={member.href}
          target="_blank"
          rel="noreferrer"
          className="group block rounded-[10px] -mx-3 px-3 py-2 transition-colors hover:bg-foreground/[0.03]"
        >
          {inner}
        </Link>
      </li>
    );
  }
  return <li>{inner}</li>;
}

function Avatar({ member, size }: { member: TeamMember; size: number }) {
  // Use the real photo if one was registered in _data.ts; otherwise
  // fall back to a monogram circle. The monogram uses the first
  // initial in Cormorant Garamond on a sage circle, matching the
  // Nature Guild fallback recipe.
  if (member.photo) {
    return (
      <span
        className="relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-border-soft"
        style={{ width: size, height: size }}
      >
        <Image
          src={member.photo}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      </span>
    );
  }
  const initial = member.name.trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full bg-primary/12 font-garamond text-primary"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initial}
    </span>
  );
}
