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
    name: "Sharfina \"Sharfy\" Adamantine",
    role: "Co-founder & Hypercerts Lead",
    location: "Paris, France",
    bio: "Ethereum Next Billion Fellow (Cohort 4). Connects climate finance to local conservation through hypercerts and on-chain data systems.",
    href: "https://x.com/sharfyae",
  },
];

export const CORE_TEAM: ReadonlyArray<TeamMember> = [
  {
    name: "Nurfatin \"Fatin\" Hamzah",
    role: "Community Lead",
    location: "Malaysia",
    bio: "Holds GainForest's global community programme together. Has spent months in the field with Bumicerts partners in Surigao del Sur and across the network.",
    photo: "/nature-guild/nurfatin-hamzah.jpg",
  },
  {
    name: "Niña Cerilla",
    role: "Operations Lead",
    location: "Philippines",
    bio: "Runs operations across the global network and coordinates Bumicerts rollouts with the Oceanus Conservation mangrove team and other Philippine partners.",
  },
  {
    name: "Diego Rivera Buendia",
    role: "Engineering & AI",
    location: "Mexico",
    bio: "Builds the open-source GainForest stack and the AI tooling on top of it; ATProto integrations, Bumicerts pipelines, and the models that turn community-collected data into actionable insight.",
  },
  {
    name: "Satyam Mishra",
    role: "Engineering",
    location: "India",
    bio: "Works on Taina, the community AI assistant, and the bioacoustics + remote-sensing tooling that the field teams rely on.",
  },
  {
    name: "Karma Yoezer",
    role: "Engineering",
    location: "Thimphu, Bhutan",
    bio: "Software engineer building the ATProto + Hypercerts layer that anchors every Bumicert. Contributes across the Hypercerts Foundation, GainForest, and the wider Hypersphere ecosystem.",
    href: "https://github.com/Kzoeps",
  },
  {
    name: "Donald Nwokoro",
    role: "Engineering",
    location: "Nigeria",
    bio: "Web3 and back-end engineer working on Green Globe; the live planet view that surfaces community-led nature projects, plus the ATProto packages and lexicons behind it.",
    href: "https://github.com/DonGuillotine",
  },
];
// Marina Mura is already credited on the landing's <NatureGuild />
// (Inhaã-bé, Brazil) and the <TainaFeature /> caption, so we don't
// duplicate her on the About core team. The Nature Guild block is
// the canonical surface for Indigenous Data Council leads.

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
    body: "The entire $250,000 XPRIZE prize is donated to a new endowment fund to train Indigenous and grassroots scientists in the Amazon.",
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
  // Current foundational essay; David's piece on Regenerative
  // Intelligence as the theory of change behind GainForest.
  essay: "https://www.daviddao.org/posts/regenerative-intelligence/",
  email: "team@gainforest.net",
  substackOrigin: "https://gainforest.substack.com",
  homepage: "https://www.gainforest.earth",
} as const;
