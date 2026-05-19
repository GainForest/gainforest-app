"use client";

import { useT } from "./LocaleProvider";

// "We listen to our Nature Guild." — port of gainforest.earth's Nature
// Guild member grid.
//
// Each member is rendered with an INITIAL-BASED AVATAR (no photograph)
// — we don't have permission to ship real headshots and the editorial
// tone the team locked down stays cleaner without portrait raster art
// anyway. The avatars use the warm cream `#fbf8f0` card chrome from the
// Bumicerts hero card and a sage forest stroke ring to feel like part
// of the same design system.
//
// Names + affiliations come verbatim from gainforest.earth (these are
// real Guild members; proper nouns aren't translated). The surrounding
// labels are localised.
type GuildMember = {
  name: string;
  affiliation: string; // org, country
  // 1-2 char initial used for the avatar. Computed at module load
  // because translating initials would be wrong.
};

const MEMBERS: ReadonlyArray<GuildMember> = [
  { name: "Stephen Bright Sakwa", affiliation: "Bees & Trees, Uganda" },
  { name: "Jaya Kandir", affiliation: "Darukaa Earth, India" },
  { name: "Esau Daniel", affiliation: "YLEC, Uganda" },
  { name: "Njambi Njoroge", affiliation: "Grassroots Economics, Kenya" },
  {
    name: "Simon Peter Okoth",
    affiliation: "Climatica Foundation, Uganda",
  },
  { name: "Marina Mura", affiliation: "Inhaã-bé, Brazil" },
  { name: "Gabriel Nunes", affiliation: "GainForest, Brazil" },
  { name: "Nurfatin Hamzah", affiliation: "GainForest, Malaysia" },
  { name: "Tin Dalida", affiliation: "WOVOKA, the Philippines" },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function NatureGuild() {
  const t = useT();
  const before = t("natureGuild.heading.before").trim();
  const italic = t("natureGuild.heading.italic").trim();
  const after = t("natureGuild.heading.after").trim();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-16">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
              {t("natureGuild.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[32px] sm:text-[40px] lg:text-[52px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {before && <span>{before} </span>}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && <span>{after}</span>}
            </h2>
          </div>
          <p className="text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/70 lg:col-span-5">
            {t("natureGuild.body")}
          </p>
        </div>

        <ul className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:mt-20 lg:grid-cols-3 lg:gap-x-12 lg:gap-y-12 xl:grid-cols-5">
          {MEMBERS.map((m) => (
            <li
              key={m.name}
              className="flex flex-col items-start gap-3"
            >
              {/* Initial avatar. Sage-ring on cream — same colourway
                  as the IWantTo / HowItWorks number chips so the page
                  reads as a single design system. */}
              <span
                aria-hidden
                className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/35 bg-[#fbf8f0] font-garamond text-[22px] text-primary lg:h-[68px] lg:w-[68px] lg:text-[24px]"
              >
                {initials(m.name)}
              </span>
              <div>
                <p className="font-garamond text-[18px] lg:text-[20px] leading-[1.15] tracking-[-0.005em] text-foreground">
                  {m.name}
                </p>
                <p className="mt-1 text-[13px] lg:text-[13.5px] leading-[1.4] text-foreground/65">
                  {m.affiliation}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
