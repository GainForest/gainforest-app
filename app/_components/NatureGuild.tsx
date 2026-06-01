"use client";

import { useT } from "./LocaleProvider";

// "We listen to our Nature Guild." — port of gainforest.earth's Nature
// Guild member grid.
//
// Each member ships with the real headshot used on gainforest.earth.
// The portraits live under `public/nature-guild/` (sourced from the
// gainforest.earth asset pipeline) and are rendered in a circular crop
// with a thin sage-forest ring to echo the same design system used by
// the IWantTo / HowItWorks number chips.
//
// Names + affiliations come verbatim from gainforest.earth (these are
// real Guild members; proper nouns aren't translated). The surrounding
// labels are localised.
type GuildMember = {
  name: string;
  affiliation: string; // org, country
  photo: string; // /nature-guild/<slug>.(png|jpg) — square headshot
};

const MEMBERS: ReadonlyArray<GuildMember> = [
  {
    name: "Stephen Bright Sakwa",
    affiliation: "Bees & Trees, Uganda",
    photo: "/nature-guild/stephen-bright-sakwa.png",
  },
  {
    name: "Jaya Kandir",
    affiliation: "Darukaa Earth, India",
    photo: "/nature-guild/jaya-kandir.png",
  },
  {
    name: "Esayu Daniel",
    affiliation: "YLEC, Uganda",
    photo: "/nature-guild/esayu-daniel.png",
  },
  {
    name: "Njambi Njoroge",
    affiliation: "Grassroots Economics, Kenya",
    photo: "/nature-guild/njambi-njoroge.png",
  },
  {
    name: "Simon Peter Okoth",
    affiliation: "Climatica Foundation, Uganda",
    photo: "/nature-guild/simon-peter-okoth.png",
  },
  {
    name: "Marina Mura",
    affiliation: "Inhaã-bé, Brazil",
    photo: "/nature-guild/marina-mura.jpg",
  },
  {
    name: "Nurfatin Hamzah",
    affiliation: "GainForest, Malaysia",
    photo: "/nature-guild/nurfatin-hamzah.jpg",
  },
  {
    name: "Tin Dalida",
    affiliation: "WOVOKA, the Philippines",
    photo: "/nature-guild/tin-dalida.jpg",
  },
];

export function NatureGuild() {
  const t = useT();
  const before = t("natureGuild.heading.before").trim();
  const italic = t("natureGuild.heading.italic").trim();
  const after = t("natureGuild.heading.after").trim();
  return (
    <section id="guild" className="scroll-mt-20 border-t border-border-soft lg:scroll-mt-24">
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

        {/* Portrait grid. 8 members fall into a clean 2 × 4 / 4 × 2
            arrangement. Photos are intentionally large (~120px) so
            the Guild reads as a portrait wall rather than a credit
            list — the editorial weight matches the rest of the
            cream sections. */}
        <ul className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3 sm:gap-x-10 lg:mt-24 lg:grid-cols-4 lg:gap-x-14 lg:gap-y-16">
          {MEMBERS.map((m) => (
            <li
              key={m.name}
              className="group flex flex-col items-center text-center"
            >
              {/* Circular headshot. Single hairline sage ring sits
                  flush with the photo edge; a wider, paler
                  `ring-offset` ring floats one cream-coloured gap
                  out from it — the same double-stroke recipe the
                  gainforest.earth portraits use. A very soft drop
                  shadow adds the merest hint of lift so the photos
                  don't read as flat stickers on the cream
                  background. Hover slowly bumps the inner ring to
                  full primary and nudges the photo up 1px. */}
              <div className="relative">
                <img
                  src={m.photo}
                  alt={m.name}
                  loading="lazy"
                  decoding="async"
                  className="h-24 w-24 rounded-full border border-primary/30 bg-surface object-cover shadow-[0_4px_18px_-10px_rgba(20,30,15,0.35)] ring-1 ring-offset-2 ring-offset-background ring-border-soft transition-all duration-300 ease-out group-hover:-translate-y-0.5 group-hover:border-primary/70 sm:h-28 sm:w-28 lg:h-32 lg:w-32"
                />
              </div>
              <p className="mt-5 font-garamond text-[19px] lg:text-[21px] leading-[1.15] tracking-[-0.005em] text-foreground">
                {m.name}
              </p>
              <p className="mt-1.5 font-instrument italic text-[13.5px] lg:text-[14.5px] leading-[1.35] text-foreground/55">
                {m.affiliation}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
