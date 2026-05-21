// Static, hand-curated content for the /about page.
//
// Team data: collected from public sources (LinkedIn, daviddao.org,
// gainforest.earth, Ethereum Next Billion Fellowship announcement,
// Global Landscapes Forum speaker page, GainForest Substack). Roles
// reflect what each person publicly attributes to themselves; if you
// see something out of date, update here in the same PR.
//
// Timeline data: distilled from the 3rd Annual Impact Report (24/25)
// and David's "Governing the Commons in the Intelligent Age" essay
// (Jan 2025). Keep this terse; the body copy of each item is a single
// sentence per editorial rule.

export type TeamMember = {
  name: string;
  role: string;
  /** "Switzerland", "Brazil", "Malaysia", "Philippines"… */
  location?: string;
  /** Optional one-line bio. Kept English-only — heavy on proper nouns. */
  bio?: string;
  /** Public profile link (LinkedIn, personal site, etc.). Optional. */
  href?: string;
  /** Optional headshot path under /public. We deliberately don't
   *  fabricate photos — the text-only card design is the default and
   *  remains crisp when no photo is provided. */
  photo?: string;
};

export const COFOUNDERS: ReadonlyArray<TeamMember> = [
  {
    name: "David Dao",
    role: "Co-founder & Chief Scientist",
    location: "Zurich, Switzerland",
    bio: "PhD in AI Systems from ETH Zurich. Pioneer in data valuation for machine learning, World Economic Forum Global Shaper, and XPRIZE Rainforest winner.",
    href: "https://www.daviddao.org/",
  },
  {
    name: "Sharfah \"Sharfy\" Adamantine",
    role: "Co-founder & Hypercerts Lead",
    location: "Selangor, Malaysia",
    bio: "Ethereum Next Billion Fellow (Cohort 4). Connects climate finance to local conservation through hypercerts and on-chain data systems.",
    href: "https://x.com/sharfyae",
  },
];

export const CORE_TEAM: ReadonlyArray<TeamMember> = [
  {
    name: "Gabriel Nunes",
    role: "Science Lead",
    location: "Amazon, Brazil",
    bio: "Biologist with master's degrees in invertebrate taxonomy and biodiversity conservation. Born in the Brazilian Amazon; leads the Indigenous Science Endowment Fund.",
    // Headshot deliberately omitted — we don't ship a photo for Gabriel
    // on disk, and the monogram avatar fallback reads cleanly. Add a
    // real photo here only when one is published with consent.
  },
  {
    name: "Nurfatin \"Fatin\" Hamzah",
    role: "Community Manager",
    location: "Malaysia",
    bio: "Holds GainForest's global community programme together. Has spent months in the field with Bumicerts partners in Surigao del Sur and across the network.",
    photo: "/nature-guild/nurfatin-hamzah.jpg",
  },
  {
    name: "Niña Cerilla",
    role: "Founder's Associate",
    location: "Philippines",
    bio: "Coordinates Conservation Data Income rollouts with the Oceanus Conservation mangrove team and other Philippine partners.",
  },
  {
    name: "Diego Rivera Buendia",
    role: "Engineering",
    location: "Latin America",
    bio: "Builds the open-source GainForest stack; ATProto integrations, Bumicerts tooling, and the Hyperindex pipelines behind every live count on this site.",
  },
  {
    name: "Satyam Mishra",
    role: "Engineering & AI",
    location: "India",
    bio: "Works on Taina, the community AI assistant, and the bioacoustics + remote-sensing models that turn community-collected data into actionable insight.",
  },
  {
    name: "Marina Mura",
    role: "Indigenous Science Lead",
    location: "Inhaã-bé, Brazil",
    bio: "Indigenous scientist from the Inhaã-bé community in Greater Manaus; co-leads Taina's design and the Indigenous Data Council.",
    photo: "/nature-guild/marina-mura.jpg",
  },
];

export const ADVISORS: ReadonlyArray<TeamMember> = [
  {
    name: "Sejal Rekhan",
    role: "Advisor",
  },
  {
    name: "Marie-Claire Graf",
    role: "Advisor",
    bio: "Climate-policy expert; previous COP youth lead and World Economic Forum Young Global Leader.",
  },
];

// Story timeline. Each entry is one editorial moment — keep it terse.
// Year first; the year column doubles as a visual rhythm element.
export type TimelineEntry = {
  year: string;
  title: string;
  body: string;
};

export const TIMELINE: ReadonlyArray<TimelineEntry> = [
  {
    year: "2017",
    title: "A hackathon at the United Nations",
    body: "David Dao prototypes a small idea at the UN: pay forest stewards directly for protecting their land, using blockchain to make the payments transparent.",
  },
  {
    year: "2018",
    title: "Decentralized Sustainability",
    body: "The founding essay publishes on Medium; the concept finds its first community partners across Brazil, Bhutan, Kenya, Paraguay, and the Philippines.",
  },
  {
    year: "2022",
    title: "Registered as a Swiss non-profit",
    body: "GainForest e.V. is registered in Zurich, with two years of operational runway and direct support from the Ethereum Foundation.",
  },
  {
    year: "2023",
    title: "Co-designing Taina with Indigenous communities",
    body: "Taina; the community-owned AI assistant co-designed with four Indigenous and local communities around Manaus, ships its first version on Telegram.",
  },
  {
    year: "2024",
    title: "Winning the XPRIZE Rainforest finals",
    body: "After five years of competing, GainForest and ETH BiodivX win the XPRIZE Rainforest Bonus Prize in the Amazon, beating 298 teams worldwide.",
  },
  {
    year: "2024",
    title: "Founding the Indigenous Science Endowment Fund",
    body: "The entire $250,000 XPRIZE prize is donated to a new endowment fund, led by Gabriel Nunes, to train Indigenous and grassroots scientists in the Amazon.",
  },
  {
    year: "2025",
    title: "Launching the Nature Guild",
    body: "A rotating circle of stewards from Brazil, India, Uganda, Kenya, Malaysia, and the Philippines is formalised to steer GainForest's research priorities.",
  },
];

// External destinations linked from the about page.
export const EXTERNAL = {
  donate: "https://donorbox.org/gainforest",
  impactReport:
    "https://www.canva.com/design/DAGqnTWl-gw/K4V6DWYyqtZW0NK2_0Dpag/view",
  essay:
    "https://gainforest.substack.com/p/governing-the-commons-in-the-intelligent",
  email: "team@gainforest.net",
  substackOrigin: "https://gainforest.substack.com",
  homepage: "https://www.gainforest.earth",
} as const;
