"use client";

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { MessageKey } from "../_lib/i18n";
import { DOCS_URL, GLOBE_URL, MANAGE_URL, PROJECTS_URL } from "../_lib/urls";
import { useT } from "./LocaleProvider";

// "I want to…" — two-audience role switcher.
//
// History:
//   v1 was a flat four-card ledger (Discover / Browse / Create / Learn)
//   that only made sense from a donor's perspective.
//   v2 split into two parallel columns ("For communities" / "For
//   supporters"), each with two numbered ledger entries (01, 02).
//   Team feedback on v2: the parallel-columns-with-numbers read as a
//   single horizontal timeline rather than two distinct perspectives —
//   visitors couldn't tell that the left side was "you are a community"
//   and the right side was "you are a supporter".
//
// v3 (this file) replaces the parallel columns with a tab switcher:
//   one role active at a time, two cards beneath. The numbering is
//   gone (it was the dominant timeline signal). The active tab gets a
//   sage primary underline; the inactive tab is muted. Standard WAI-
//   ARIA tablist semantics + ArrowLeft/ArrowRight/Home/End nav.
//
// Visual pattern stays editorial: serif card titles, thin rule above
// each card, single arrow affordance. No icons, no decoration.
type Role = "community" | "supporter";

type Card = {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  href: string;
};

const ROLE_CARDS: Record<Role, ReadonlyArray<Card>> = {
  community: [
    {
      titleKey: "iwantto.card1.title",
      bodyKey: "iwantto.card1.body",
      // This landing now lives at gainforest.earth itself, so community
      // onboarding points at the docs portal instead of a self-link.
      href: DOCS_URL,
    },
    {
      titleKey: "iwantto.card2.title",
      bodyKey: "iwantto.card2.body",
      // Steward dashboard — the merged app's replacement for the
      // retired /bumicert/create flow.
      href: MANAGE_URL,
    },
  ],
  supporter: [
    {
      titleKey: "iwantto.card3.title",
      bodyKey: "iwantto.card3.body",
      href: GLOBE_URL,
    },
    {
      titleKey: "iwantto.card4.title",
      bodyKey: "iwantto.card4.body",
      href: PROJECTS_URL,
    },
  ],
};

const ROLE_LABEL: Record<Role, MessageKey> = {
  community: "iwantto.community.label",
  supporter: "iwantto.supporter.label",
};

// Default to the community role first — the page's editorial framing
// prioritizes community-led work, so the first thing a visitor sees on
// this strip should be the community routes. Supporters can toggle.
const ROLES: ReadonlyArray<Role> = ["community", "supporter"];

export function IWantTo() {
  const t = useT();
  const [role, setRole] = useState<Role>("community");
  // Stable id prefix so the tab/panel aria wiring survives StrictMode
  // double-renders without colliding with anything else on the page.
  const idPrefix = useId();
  const tabRefs = useRef<Record<Role, HTMLButtonElement | null>>({
    community: null,
    supporter: null,
  });

  function focusRole(next: Role) {
    setRole(next);
    // Defer focus so the new aria-selected state is applied first.
    requestAnimationFrame(() => tabRefs.current[next]?.focus());
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const idx = ROLES.indexOf(role);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusRole(ROLES[(idx + 1) % ROLES.length]);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusRole(ROLES[(idx - 1 + ROLES.length) % ROLES.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusRole(ROLES[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      focusRole(ROLES[ROLES.length - 1]);
    }
  }

  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-20 pb-20 sm:px-10 lg:px-16 lg:pt-24 lg:pb-24">
        {/* Heading + tab bar share a row on desktop so the role switch
            sits at eye-level with the question. On mobile they stack.
            No visible eyebrow on purpose — the heading + two tab labels
            already make the role-switcher legible, and an explicit
            "Pick your role" line reads too form-survey-y for the rest
            of the editorial page. The tablist still carries an aria
            label for screen readers. */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <h2 className="font-garamond text-[32px] sm:text-[40px] lg:text-[44px] font-normal leading-[1.1] tracking-[-0.01em] text-foreground">
            {t("iwantto.heading")}
          </h2>

          <div
            role="tablist"
            aria-label={t("iwantto.tablist.label")}
            className="flex items-center gap-8 self-start border-b border-foreground/15 lg:self-end"
          >
            {ROLES.map((r) => {
              const active = r === role;
              return (
                <button
                  key={r}
                  ref={(el) => {
                    tabRefs.current[r] = el;
                  }}
                  id={`${idPrefix}-tab-${r}`}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  aria-controls={`${idPrefix}-panel-${r}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setRole(r)}
                  onKeyDown={onTabKeyDown}
                  className={`-mb-px cursor-pointer border-b-2 pb-3 font-garamond text-[18px] tracking-[0.005em] transition-colors lg:text-[20px] ${
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-foreground/45 hover:text-foreground/80"
                  }`}
                >
                  {t(ROLE_LABEL[r])}
                </button>
              );
            })}
          </div>
        </div>

        {/* Keyed on role so React swaps the panel cleanly; the brief
            unmount also resets any hover state from the previous role's
            cards. */}
        <div
          key={role}
          id={`${idPrefix}-panel-${role}`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-${role}`}
          className="mt-14 grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2"
        >
          {ROLE_CARDS[role].map((card) => (
            <Link
              key={card.titleKey}
              href={card.href}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col border-t border-foreground/20 pt-6 transition-colors hover:border-foreground/80"
            >
              <h3 className="font-garamond text-[24px] lg:text-[28px] font-normal leading-[1.15] text-foreground">
                {t(card.titleKey)}
              </h3>
              <p className="mt-3 text-[14px] leading-[1.55] text-foreground/65">
                {t(card.bodyKey)}
              </p>
              <span
                aria-hidden
                className="mt-6 inline-flex items-center text-[18px] text-foreground/40 transition-all group-hover:translate-x-1 group-hover:text-foreground"
              >
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
