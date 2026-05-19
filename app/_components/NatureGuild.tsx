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
              {/* Circular headshot crop with a thin sage-forest ring
                  so the photos sit inside the same design system as
                  the IWantTo / HowItWorks number chips. `object-cover`
                  on a square aspect handles the few non-square source
                  files (most are already square). */}
              <img
                src={m.photo}
                alt={m.name}
                loading="lazy"
                decoding="async"
                className="h-16 w-16 rounded-full border border-primary/35 bg-[#fbf8f0] object-cover lg:h-[68px] lg:w-[68px]"
              />
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
