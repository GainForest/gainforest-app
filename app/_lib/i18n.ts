// Tiny home-rolled i18n for the GainForest landing.
//
// Five languages × ~40 strings — small enough that pulling in `next-intl`
// or `react-intl` would be overkill. Strings live in MESSAGES below;
// components consume them via the `useT()` hook from `LocaleProvider`.
//
// Defaults to English. Locale is client-side only (React Context +
// localStorage persistence); switching does NOT round-trip through the
// server — the page just re-renders with the new strings. Taina
// receives the active locale through `/api/sim-chat` so her replies
// match the visitor's chosen language. (Taina speaks the same five
// locales by constitution — EN/PT/ES/Bahasa/Swahili — so the locale
// hint maps 1:1 to a language she's already fluent in.)

export const LOCALES = ["en", "es", "pt", "sw", "id"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// Display metadata for the language switcher.
export const LOCALE_LABELS: Record<
  Locale,
  { native: string; short: string; english: string }
> = {
  en: { native: "English", short: "EN", english: "English" },
  es: { native: "Español", short: "ES", english: "Spanish" },
  pt: { native: "Português", short: "PT", english: "Portuguese" },
  sw: { native: "Kiswahili", short: "SW", english: "Swahili" },
  id: { native: "Bahasa Indonesia", short: "ID", english: "Indonesian" },
};

// Canonical message keys. Adding a key here forces every locale to
// translate it (the Record<Locale, ...> type below complains otherwise).
type Messages = {
  // ── Top navigation ───────────────────────────────────────────────
  "nav.globe": string;
  "nav.forCommunities": string;
  "nav.forSupporters": string;
  "nav.about": string;
  "nav.signIn": string;
  "nav.signedIn": string;
  "nav.getStarted": string;
  "nav.donate": string;
  "nav.language": string;

  // ── Hero ─────────────────────────────────────────────────────────
  // The title is composed as: `before` + italic(`italic`) + `after`.
  // Each locale chooses *one* word to italicise; word order varies, so
  // the slots `before` and `after` can be empty strings.
  "hero.title.before": string;
  "hero.title.italic": string;
  "hero.title.after": string;
  "hero.subtitle": string;
  "hero.cta.bumicerts": string;
  "hero.cta.globe": string;
  "hero.footnote": string;

  // ── Choose path ──────────────────────────────────────────────────
  "choosePath.heading": string;
  "choosePath.globe.title": string;
  "choosePath.globe.body": string;
  "choosePath.bumicerts.title": string;
  "choosePath.bumicerts.body": string;
  "choosePath.or": string;
  "choosePath.allProjects": string;
  // Eyebrows / explainer cards / preview chrome / hints / CTAs.
  // The two ChoosePath cards (Globe + Bumicert) mirror each other,
  // so the key set is paired.
  "choosePath.globe.eyebrow": string;     // "01 · Explore the map"
  "choosePath.bumicerts.eyebrow": string; // "02 · Meet the certificate"
  "choosePath.globe.heading": string;     // "What's Green Globe?"
  "choosePath.bumicerts.heading": string; // "What's a Bumicert?"
  "choosePath.globe.dragHint": string;    // "drag to spin"
  "choosePath.globe.previewTitle": string; // "Green Globe"
  "choosePath.globe.previewLive": string; // "live"
  "choosePath.globe.previewBody": string;
  "choosePath.globe.pins": string;        // template: "{n}+ live pins"
  "choosePath.globe.caption.projects": string; // template: "{n}+ projects"
  "choosePath.globe.cta": string;         // "Open Green Globe"
  "choosePath.bumicerts.cta": string;     // "Explore Bumicerts"
  "choosePath.bumicerts.live": string;    // "Live · 3 most recent"
  "choosePath.bumicerts.fallback": string; // "Recent · 3 most recent"
  "choosePath.bumicerts.verified": string;
  "choosePath.bumicerts.signed": string;
  "choosePath.liveBadge": string;         // generic "Live"

  // ── I want to… cards ────────────────────────────────────────────
  "iwantto.heading": string;
  "iwantto.card1.title": string;
  "iwantto.card1.body": string;
  "iwantto.card2.title": string;
  "iwantto.card2.body": string;
  "iwantto.card3.title": string;
  "iwantto.card3.body": string;
  "iwantto.card4.title": string;
  "iwantto.card4.body": string;

  // ── How it works ─────────────────────────────────────────────────
  "howitworks.heading": string;
  "howitworks.step1.title": string;
  "howitworks.step1.body": string;
  "howitworks.step2.title": string;
  "howitworks.step2.body": string;
  "howitworks.step3.title": string;
  "howitworks.step3.body": string;
  "howitworks.step4.title": string;
  "howitworks.step4.body": string;

  // ── Nature CTA ───────────────────────────────────────────────────
  // Closing CTA heading splits the same way as the hero title so we can
  // italicise a single word per locale.
  "natureCta.heading.before": string;
  "natureCta.heading.italic": string;
  "natureCta.heading.after": string;
  "natureCta.body": string;
  "natureCta.donate": string;
  "natureCta.exploreProjects": string;
  "natureCta.createBumicert": string;

  // ── Footer ───────────────────────────────────────────────────────
  "footer.rights": string;
  "footer.contact": string;

  // ── Card chrome (Bumicerts + Globe windows in the hero) ────────
  "card.projects": string;
  "card.organizations": string;
  "card.leaderboard": string;
  "card.searchProjects": string;
  "card.viewAll": string;
  "card.projectsFound": string; // template: "{n} projects found"
  "card.projectsWorldwide": string; // template: "{n} projects worldwide"
  "card.worldwide": string;
  "card.openTheGlobe": string;

  // ── Taina companion (floating sim in the corner) ───────────────
  "taina.shield": string;
  "taina.role": string;
  "taina.greetingHello": string;
  "taina.greetingHint": string;
  "taina.placeholder": string;
  "taina.thinking": string;

  // ── Awards strip (XPRIZE / NetZero / Web3 Foundation) ───────────
  // Editorial "Winners of …" line that mirrors gainforest.earth's
  // award badge band directly below the hero. We render the award
  // names verbatim — they're proper nouns and don't translate — but
  // the surrounding label is localised.
  "awards.label": string; // e.g. "Winners of"
  "awards.alsoLabel": string; // e.g. "and recognised by"

  // ── Data commons section (the editorial dark band) ─────────────
  "dataCommons.eyebrow": string;
  "dataCommons.heading.before": string;
  "dataCommons.heading.italic": string;
  "dataCommons.heading.after": string;
  "dataCommons.body": string;
  "dataCommons.stat.value": string; // visible big-number
  "dataCommons.stat.label": string;

  // ── Local-first AI pillars (3-up: AI Assistants, Bioacoustics, Remote Sensing) ─
  // Key prefix is `equitableAI.*` for historical reasons — the section
  // was renamed from "Equitable AI" to "Local-first AI" in the copy,
  // but renaming the keys would churn every translation file.
  "equitableAI.eyebrow": string;
  "equitableAI.heading.before": string;
  "equitableAI.heading.italic": string;
  "equitableAI.heading.after": string;
  "equitableAI.subheading": string;
  "equitableAI.pillar1.title": string; // AI Assistants
  "equitableAI.pillar1.body": string;
  "equitableAI.pillar2.title": string; // Bioacoustics
  "equitableAI.pillar2.body": string;
  "equitableAI.pillar3.title": string; // Remote Sensing
  "equitableAI.pillar3.body": string;

  // ── Taina feature card (Indigenous AI Assistant explainer) ─────
  "tainaFeature.eyebrow": string;
  "tainaFeature.heading.before": string;
  "tainaFeature.heading.italic": string;
  "tainaFeature.heading.after": string;
  "tainaFeature.body": string;
  "tainaFeature.cta": string; // "Say hi to Taina"

  // ── Research + hackathons section ──────────────────────────────
  "research.eyebrow": string;
  "research.heading.before": string;
  "research.heading.italic": string;
  "research.heading.after": string;
  "research.body": string;
  "research.cta": string;

  // ── Nature Guild ───────────────────────────────────────────────
  "natureGuild.eyebrow": string;
  "natureGuild.heading.before": string;
  "natureGuild.heading.italic": string;
  "natureGuild.heading.after": string;
  "natureGuild.body": string;

  // ── Partners stat ─────────────────────────────────────────────
  "partners.eyebrow": string;
  "partners.heading.before": string;
  "partners.heading.italic": string;
  "partners.heading.after": string;
  "partners.body": string;
  "partners.stat": string; // legacy fallback label
  "partners.statLabel": string; // "nature partners globally"
  "partners.bannerLabel": string;
  "partners.bannerCountLabel": string;
  "partners.recordLabel": string;
  "partners.callsEyebrow": string;
  "partners.callsTitle": string;
  "partners.callsBody": string;

  // ── Impact Report ──────────────────────────────────────────────
  "impact.eyebrow": string;
  "impact.heading": string;
  "impact.body": string;
  "impact.cta": string;

  // ── Selected media ────────────────────────────────────────────
  "media.eyebrow": string;
  "media.heading": string;
  "media.scroll": string;
  // Per-item kind labels rendered in the eyebrow of every card.
  "media.kind.award": string;
  "media.kind.press": string;
  "media.kind.documentary": string;
  "media.kind.launch": string;
  "media.kind.grant": string;
  "media.kind.hackathon": string;
  "media.kind.talk": string;
  "media.kind.podcast": string;
  "media.kind.feature": string;
  "media.kind.blog": string;
  // Per-item headlines + summaries. Curated press items are
  // localisable so the carousel reads as native in every locale; blog
  // posts (Substack) intentionally stay in the source language and
  // arrive through fetchSubstackPosts() at runtime.
  "media.items.simocracy.headline": string;
  "media.items.simocracy.summary": string;
  "media.items.klarna.headline": string;
  "media.items.klarna.summary": string;
  "media.items.bhutan.headline": string;
  "media.items.bhutan.summary": string;
  "media.items.changenow.headline": string;
  "media.items.changenow.summary": string;
  "media.items.cna.headline": string;
  "media.items.cna.summary": string;
  "media.items.atmos.headline": string;
  "media.items.atmos.summary": string;
  "media.items.ftc.headline": string;
  "media.items.ftc.summary": string;
  "media.items.maearth.headline": string;
  "media.items.maearth.summary": string;
  "media.items.xprize.headline": string;
  "media.items.xprize.summary": string;
  "media.items.swissnex.headline": string;
  "media.items.swissnex.summary": string;
  "media.items.bcg.headline": string;
  "media.items.bcg.summary": string;
  "media.items.mades.headline": string;
  "media.items.mades.summary": string;
  "media.items.ethalumni.headline": string;
  "media.items.ethalumni.summary": string;
  "media.items.weforum.headline": string;
  "media.items.weforum.summary": string;
  "media.items.ted.headline": string;
  "media.items.ted.summary": string;
  "media.items.folha.headline": string;
  "media.items.folha.summary": string;
  "media.items.edge.headline": string;
  "media.items.edge.summary": string;
  "media.items.goethe.headline": string;
  "media.items.goethe.summary": string;
  "media.items.ssir.headline": string;
  "media.items.ssir.summary": string;
  "media.items.microsoft.headline": string;
  "media.items.microsoft.summary": string;
  "media.items.swissre.headline": string;
  "media.items.swissre.summary": string;
  "media.items.ata.headline": string;
  "media.items.ata.summary": string;

  // ── Supporters / Merci ────────────────────────────────────────
  "supporters.heading.before": string;
  "supporters.heading.italic": string;
  "supporters.heading.after": string;
  "supporters.body": string;

  // ── Footer (legal / contact) ──────────────────────────────────
  "footer.legal.entity": string;
  "footer.legal.address": string;
  "footer.legal.email": string;
  "footer.legal.tax": string;
  "footer.legal.uid": string;
  "footer.legal.work": string;
  "footer.legal.support": string;
  "footer.legal.bank": string;
};

export const MESSAGES: Record<Locale, Messages> = {
  // ── English ──────────────────────────────────────────────────────
  en: {
    "nav.globe": "Globe",
    "nav.forCommunities": "For Communities",
    "nav.forSupporters": "For Supporters",
    "nav.about": "About",
    "nav.signIn": "Sign in",
    "nav.signedIn": "Signed in",
    "nav.getStarted": "Get started",
    "nav.donate": "Donate",
    "nav.language": "Language",
    // The `{word}` marker picks which word gets the painted brush
    // stroke. Position varies per locale (English puts it first,
    // Romance languages mid-phrase), so we encode it inline.
    "hero.title.before": "{Open} tools for",
    "hero.title.italic": "regenerative intelligence",
    "hero.title.after": "",
    "hero.subtitle":
      "Explore nature projects around the world, support community-led restoration, and create Bumicerts that make ecological stewardship visible and verifiable.",
    "hero.cta.bumicerts": "Explore Bumicerts",
    "hero.cta.globe": "Open the Globe",
    "hero.footnote":
      "Bumicerts are signed on AT Protocol; every record lives on a community-owned PDS and the live count to the right is pulled straight from the GainForest indexer.",
    "choosePath.heading": "Choose how you want to use GainForest",
    "choosePath.globe.eyebrow": "01 · Explore the map",
    "choosePath.bumicerts.eyebrow": "02 · Meet the certificate",
    "choosePath.globe.heading": "What's Green Globe?",
    "choosePath.bumicerts.heading": "What's a Bumicert?",
    "choosePath.globe.dragHint": "drag to spin",
    "choosePath.globe.previewTitle": "Green Globe",
    "choosePath.globe.previewLive": "live",
    "choosePath.globe.previewBody":
      "Spin and pin community-led nature projects across the planet; every pin is an organization on ATProto.",
    "choosePath.globe.pins": "{n}+ live pins",
    "choosePath.globe.caption.projects": "{n}+ projects",
    "choosePath.globe.cta": "Open Green Globe",
    "choosePath.bumicerts.cta": "Explore Bumicerts",
    "choosePath.bumicerts.live": "Live · 3 most recent",
    "choosePath.bumicerts.fallback": "Recent · 3 most recent",
    "choosePath.bumicerts.verified": "Verified",
    "choosePath.bumicerts.signed": "ATProto signed",
    "choosePath.liveBadge": "Live",
    "choosePath.globe.title": "Open the Globe",
    "choosePath.globe.body":
      "Discover projects and ecosystems across the world. Explore, learn, and get inspired.",
    "choosePath.bumicerts.title": "Explore Bumicerts",
    "choosePath.bumicerts.body":
      "Browse projects, create and manage Bumicerts, and support verified community impact.",
    "choosePath.or": "or",
    "choosePath.allProjects": "All projects",
    "iwantto.heading": "I want to…",
    "iwantto.card1.title": "Discover projects visually",
    "iwantto.card1.body":
      "Explore regeneration projects around the world.",
    "iwantto.card2.title": "Browse projects to support",
    "iwantto.card2.body":
      "Find trusted initiatives and back what matters.",
    "iwantto.card3.title": "Create a Bumicert",
    "iwantto.card3.body":
      "Document and verify your regenerative impact.",
    "iwantto.card4.title": "Learn about GainForest",
    "iwantto.card4.body":
      "Understand our mission, approach, and community.",
    "howitworks.heading": "How it works",
    "howitworks.step1.title": "Discover",
    "howitworks.step1.body":
      "Explore projects and communities worldwide using our visual map.",
    "howitworks.step2.title": "Understand",
    "howitworks.step2.body":
      "Learn about the impact, methods, and people behind each project.",
    "howitworks.step3.title": "Support",
    "howitworks.step3.body":
      "Contribute funding, resources, or skills to drive impact.",
    "howitworks.step4.title": "Grow impact",
    "howitworks.step4.body":
      "Track outcomes, earn Bumicerts, and help nature thrive.",
    "natureCta.heading.before": "Nature thrives when we act",
    "natureCta.heading.italic": "together",
    "natureCta.heading.after": ".",
    "natureCta.body":
      "Join a global community creating a fair future for nature and people.",
    "natureCta.donate": "Donate",
    "natureCta.exploreProjects": "Explore projects",
    "natureCta.createBumicert": "Create a Bumicert",
    "footer.rights": "All rights reserved.",
    "footer.contact": "Contact",
    "card.projects": "Projects",
    "card.organizations": "Organizations",
    "card.leaderboard": "Leaderboard",
    "card.searchProjects": "Search projects…",
    "card.viewAll": "View all",
    "card.projectsFound": "{n} projects found",
    "card.projectsWorldwide": "{n} projects worldwide",
    "card.worldwide": "Worldwide",
    "card.openTheGlobe": "Open the Globe",
    "taina.shield": "Ask me anything",
    "taina.role": "Co-designed with Indigenous communities of Manaus",
    "taina.greetingHello":
      "Hi; I'm Taina. Sit a moment and explore GainForest with me.",
    "taina.greetingHint":
      "Ask me about the Globe, Bumicerts, community-led nature work, or Indigenous data sovereignty; or just say hi.",
    "taina.placeholder": "Say hi…",
    "taina.thinking": "Taina is thinking…",
    "awards.label": "Winners of",
    "awards.alsoLabel": "Recognised by",
    "dataCommons.eyebrow": "Open data commons",
    "dataCommons.heading.before": "The world's first community-owned data commons for",
    "dataCommons.heading.italic": "biodiversity",
    "dataCommons.heading.after": ".",
    "dataCommons.body":
      "Only 1% of global biodiversity data comes from the world's largest rainforests. We're changing this by turning local communities into Indigenous scientists; and helping organisations build equitable data products that can preserve nature.",
    "dataCommons.stat.value": "1%",
    "dataCommons.stat.label": "of biodiversity data comes from the largest rainforests",
    "equitableAI.eyebrow": "Local-first AI",
    "equitableAI.heading.before": "We build local-first",
    "equitableAI.heading.italic": "technology",
    "equitableAI.heading.after": "and AI",
    "equitableAI.subheading":
      "Three open research pillars that turn community-collected data into tools the community keeps.",
    "equitableAI.pillar1.title": "AI Assistants",
    "equitableAI.pillar1.body":
      "Storyteller AI companions that help communities archive and share knowledge in their own language; starting with Taina, co-designed in Greater Manaus.",
    "equitableAI.pillar2.title": "Bioacoustics",
    "equitableAI.pillar2.body":
      "Passive listening stations in the canopy. Open species classifiers turn dawn choruses into living, queryable biodiversity records.",
    "equitableAI.pillar3.title": "Remote Sensing",
    "equitableAI.pillar3.body":
      "Satellite + drone analysis that lets nature stewards prove canopy gain, carbon stock, and habitat continuity over time.",
    "tainaFeature.eyebrow": "Indigenous AI Assistant",
    "tainaFeature.heading.before": "Meet",
    "tainaFeature.heading.italic": "Taina",
    "tainaFeature.heading.after": ", our community AI.",
    "tainaFeature.body":
      "Taina guides local and Indigenous communities through storytelling on how to archive and share knowledge. The data she collects is self-hosted or governed through a community-elected GainForest Data Council; never extracted.",
    "tainaFeature.cta": "Say hi to Taina",
    "research.eyebrow": "Research",
    "research.heading.before": "We research and",
    "research.heading.italic": "innovate",
    "research.heading.after": "together.",
    "research.body":
      "Based on community-collected high-quality data, our non-profit hosts annual hackathons in Switzerland and globally to innovate together on AI and data visualisations for nature.",
    "research.cta": "Join the next hackathon",
    "natureGuild.eyebrow": "Nature Guild",
    "natureGuild.heading.before": "We listen to our",
    "natureGuild.heading.italic": "Nature Guild",
    "natureGuild.heading.after": ".",
    "natureGuild.body":
      "Learning together and shaping new ways to govern nature stewardship; the Guild is a rotating circle of community scientists, ecologists, and field leads who steer GainForest's research priorities.",
    "partners.eyebrow": "Partners",
    "partners.heading.before": "Working with nature stewards",
    "partners.heading.italic": "globally",
    "partners.heading.after": ".",
    "partners.body":
      "Our non-profit collaborates with grassroots cooperatives, Indigenous councils, ecological labs, and protected-area managers across four continents.",
    "partners.stat": "50+",
    "partners.statLabel": "nature partners worldwide",
    "partners.bannerLabel": "Live from Green Globe",
    "partners.bannerCountLabel": "names",
    "partners.recordLabel": "Green Globe live record",
    "partners.callsEyebrow": "Monthly community calls",
    "partners.callsTitle": "Hear the stewards behind the pins.",
    "partners.callsBody":
      "Watch recent GainForest sessions where communities share field updates, restoration lessons, and open tools.",
    "impact.eyebrow": "Impact report",
    "impact.heading": "Read our 3rd {annual} impact report.",
    "impact.body":
      "The 24/25 report unpacks our global mission, the year's grants, community-led research highlights, and the financials; audited and open.",
    "impact.cta": "Read the report",
    "media.eyebrow": "Selected media",
    "media.heading": "Awards & press.",
    "media.scroll": "Scroll →",
    "media.kind.award": "Award",
    "media.kind.press": "Press",
    "media.kind.documentary": "Documentary",
    "media.kind.launch": "Launch",
    "media.kind.grant": "Grant",
    "media.kind.hackathon": "Hackathon",
    "media.kind.talk": "Talk",
    "media.kind.podcast": "Podcast",
    "media.kind.feature": "Feature",
    "media.kind.blog": "Blog",
    "media.items.ata.headline":
      "After The Algorithm exhibits Tainá with GainForest",
    "media.items.ata.summary":
      "The Zürich festival presents Tainá as a work co-developed with Indigenous communities, showing how local knowledge, languages, and data stay community-governed.",
    "media.items.simocracy.headline":
      "Simocracy launches with AI digital twins allocating a community treasury",
    "media.items.simocracy.summary":
      "A mini-documentary follows the Frontier Tower experiment with GainForest, Hypercerts, Funding the Commons, and community sims deliberating over shared funding.",
    "media.items.klarna.headline":
      "GainForest selected for Klarna's AI for Climate Resilience Program",
    "media.items.klarna.summary":
      "Klarna names GainForest e.V. among six selected innovators using AI to support communities on the climate frontlines.",
    "media.items.bhutan.headline":
      "GainForest DeepGov team wins the Bhutan NDI-powered international hackathon",
    "media.items.bhutan.summary":
      "Kuensel reports that Team DeepGov and Team Cyberchain emerged as winners of Bhutan's three-day hackathon for decentralised applications powered by National Digital Identity.",
    "media.items.changenow.headline":
      "GainForest at ChangeNOW: nature as an economic choice",
    "media.items.changenow.summary":
      "ChangeNOW's mainstage conversation features GainForest's approach to AI, remote sensing, blockchain, and ecosystem monitoring for nature finance.",
    "media.items.cna.headline":
      "CNA documents how GainForest helps locals conserve mangroves in the Philippines",
    "media.items.cna.summary":
      "Tech To Save The World visits the Philippines to show how data collection and AI-backed tools can support mangrove conservation with local communities.",
    "media.items.atmos.headline":
      "Atmos features Taina as Indigenous communities safeguard culture with their own ChatGPT",
    "media.items.atmos.summary":
      "The Atmos feature follows Tainá, GainForest's community-owned AI assistant for storing local knowledge, stories, and biodiversity observations on community terms.",
    "media.items.ftc.headline":
      "GainForest bridges nature, data, and human opportunity",
    "media.items.ftc.summary":
      "Funding the Commons features GainForest's model for conservation data income and regenerative funding for rainforest communities.",
    "media.items.maearth.headline":
      "Conservation Data Income with GainForest",
    "media.items.maearth.summary":
      "Ma Earth hosts the GainForest team for a long-form conversation on the origin story, current initiatives, retro funding, AI, Web3, and XPRIZE.",
    "media.items.xprize.headline":
      "GainForest is an XPRIZE Rainforest Winner",
    "media.items.xprize.summary":
      "GainForest and partners are recognised through the XPRIZE Rainforest competition for technology that can reveal and protect biodiversity.",
    "media.items.swissnex.headline":
      "GainForest and ETH BiodivX in Amazonia",
    "media.items.swissnex.summary":
      "Swissnex reports on Switzerland–Amazonia collaboration, including the ETH BiodivX and GainForest work around biodiversity data and AI.",
    "media.items.bcg.headline": "BCG & Handelsblatt Vordenker:innen 2022",
    "media.items.bcg.summary":
      "GainForest is featured among forward-thinking initiatives connecting food systems, climate, and nature-positive innovation.",
    "media.items.mades.headline": "Paraguay announces partnership with GainForest",
    "media.items.mades.summary":
      "The Ministerio del Ambiente y Desarrollo Sostenible announces support to strengthen protected areas in the Chaco.",
    "media.items.ethalumni.headline":
      "ETH Alumni spotlights GainForest's climate AI journey",
    "media.items.ethalumni.summary":
      "The ETH Alumni interview traces GainForest's path from climate activism to XPRIZE-winning AI tools that support Indigenous and local communities.",
    "media.items.weforum.headline":
      "World Economic Forum: A Wake-Up Call from Nature",
    "media.items.weforum.summary":
      "At the 2022 Open Forum in Davos, the discussion connects deforestation, lifestyle choices, pandemic risk, and the urgent need to protect nature.",
    "media.items.ted.headline":
      "TEDx: learning from nature's stewards",
    "media.items.ted.summary":
      "The TEDx talk introduces GainForest's early vision for cryptocurrency, community incentives, and reversing deforestation with forest stewards.",
    "media.items.folha.headline":
      "Folha: international competition accelerates Amazon biodiversity research",
    "media.items.folha.summary":
      "Folha reports from the XPRIZE Rainforest finals in Manaus, where Tainá and field technologies help communities document Amazon biodiversity.",
    "media.items.edge.headline":
      "The Edge Malaysia: climate tech and the way forward",
    "media.items.edge.summary":
      "The Edge Malaysia profiles climate-tech pathways and includes GainForest's AI approach to conservation finance and transparent forest protection.",
    "media.items.goethe.headline":
      "Goethe-Institut: A Renaissance of Nature",
    "media.items.goethe.summary":
      "Goethe-Institut interviews GainForest on how modern technologies can restore trust, support conservation, and value nature more fairly.",
    "media.items.ssir.headline":
      "SSIR Brasil: the virtual guardian of forests",
    "media.items.ssir.summary":
      "Stanford Social Innovation Review Brasil features Taina, GainForest's chatbot for safeguarding knowledge, rights, and biodiversity in Amazon communities.",
    "media.items.microsoft.headline":
      "Microsoft: incentivizing sustainability with GainForest and the UN",
    "media.items.microsoft.summary":
      "Microsoft News highlights GainForest's early use of Azure, AI, blockchain, and UN collaboration to reward measurable forest protection in the Amazon.",
    "media.items.swissre.headline":
      "Swiss Re: using artificial intelligence for hope",
    "media.items.swissre.summary":
      "Swiss Re's Algorithms for Hope programme presents GainForest's AI and data-systems approach to monitoring ecosystems and financing restoration.",
    "supporters.heading.before": "Merci to our",
    "supporters.heading.italic": "supporters",
    "supporters.heading.after": ".",
    "supporters.body":
      "Foundations, labs, and partners who fund the open infrastructure behind every project on this page.",
    "footer.legal.entity": "GainForest e.V.",
    "footer.legal.address": "Schwandenacker 35, 8052 Zurich, Switzerland",
    "footer.legal.email": "team@gainforest.net",
    "footer.legal.tax": "GainForest e.V. is a tax-exempt non-profit.",
    "footer.legal.uid": "UID: CHE-181.901.605",
    "footer.legal.work": "Work with us",
    "footer.legal.support": "Support us",
    "footer.legal.bank":
      "Bank: UBS · IBAN (CHF): CH34 0023 0230 7349 7401 C · IBAN (EUR): CH88 0023 0230 7349 7460 R · BIC: UBSWCHZH80A",
  },

  // ── Spanish ──────────────────────────────────────────────────────
  es: {
    "nav.globe": "Globo",
    "nav.forCommunities": "Para comunidades",
    "nav.forSupporters": "Para colaboradores",
    "nav.about": "Acerca de",
    "nav.signIn": "Iniciar sesión",
    "nav.signedIn": "Sesión iniciada",
    "nav.getStarted": "Comenzar",
    "nav.donate": "Donar",
    "nav.language": "Idioma",
    "hero.title.before": "Herramientas {abiertas} para la",
    "hero.title.italic": "inteligencia regenerativa",
    "hero.title.after": "",
    "hero.subtitle":
      "Explora proyectos de naturaleza en todo el mundo, apoya la restauración liderada por comunidades y crea Bumicerts que hagan visible y verificable la custodia ecológica.",
    "hero.cta.bumicerts": "Explorar Bumicerts",
    "hero.cta.globe": "Abrir el Globo",
    "hero.footnote":
      "Los Bumicerts se firman en el AT Protocol; cada registro vive en un PDS comunitario y el contador en vivo a la derecha proviene directamente del indexador de GainForest.",
    "choosePath.heading": "Elige cómo quieres usar GainForest",
    "choosePath.globe.eyebrow": "01 · Explora el mapa",
    "choosePath.bumicerts.eyebrow": "02 · Conoce el certificado",
    "choosePath.globe.heading": "¿Qué es Green Globe?",
    "choosePath.bumicerts.heading": "¿Qué es un Bumicert?",
    "choosePath.globe.dragHint": "arrastra para girar",
    "choosePath.globe.previewTitle": "Green Globe",
    "choosePath.globe.previewLive": "en vivo",
    "choosePath.globe.previewBody":
      "Gira el mundo y descubre proyectos liderados por comunidades; cada pin es una organización en ATProto.",
    "choosePath.globe.pins": "{n}+ pines en vivo",
    "choosePath.globe.caption.projects": "{n}+ proyectos",
    "choosePath.globe.cta": "Abrir Green Globe",
    "choosePath.bumicerts.cta": "Explorar Bumicerts",
    "choosePath.bumicerts.live": "En vivo · 3 más recientes",
    "choosePath.bumicerts.fallback": "Recientes · 3 más recientes",
    "choosePath.bumicerts.verified": "Verificado",
    "choosePath.bumicerts.signed": "Firmado en ATProto",
    "choosePath.liveBadge": "En vivo",
    "choosePath.globe.title": "Abrir el Globo",
    "choosePath.globe.body":
      "Descubre proyectos y ecosistemas en todo el mundo. Explora, aprende e inspírate.",
    "choosePath.bumicerts.title": "Explorar Bumicerts",
    "choosePath.bumicerts.body":
      "Navega proyectos, crea y administra Bumicerts y apoya el impacto comunitario verificado.",
    "choosePath.or": "o",
    "choosePath.allProjects": "Todos los proyectos",
    "iwantto.heading": "Quiero…",
    "iwantto.card1.title": "Descubrir proyectos visualmente",
    "iwantto.card1.body":
      "Explora proyectos de regeneración en todo el mundo.",
    "iwantto.card2.title": "Explorar proyectos para apoyar",
    "iwantto.card2.body":
      "Encuentra iniciativas confiables y respalda lo que importa.",
    "iwantto.card3.title": "Crear un Bumicert",
    "iwantto.card3.body":
      "Documenta y verifica tu impacto regenerativo.",
    "iwantto.card4.title": "Conocer GainForest",
    "iwantto.card4.body":
      "Comprende nuestra misión, enfoque y comunidad.",
    "howitworks.heading": "Cómo funciona",
    "howitworks.step1.title": "Descubre",
    "howitworks.step1.body":
      "Explora proyectos y comunidades en todo el mundo con nuestro mapa visual.",
    "howitworks.step2.title": "Comprende",
    "howitworks.step2.body":
      "Aprende sobre el impacto, los métodos y las personas detrás de cada proyecto.",
    "howitworks.step3.title": "Apoya",
    "howitworks.step3.body":
      "Aporta financiamiento, recursos o habilidades para impulsar el impacto.",
    "howitworks.step4.title": "Haz crecer el impacto",
    "howitworks.step4.body":
      "Sigue los resultados, gana Bumicerts y ayuda a que la naturaleza prospere.",
    "natureCta.heading.before": "La naturaleza prospera cuando actuamos",
    "natureCta.heading.italic": "juntos",
    "natureCta.heading.after": ".",
    "natureCta.body":
      "Únete a una comunidad global que construye un futuro justo para la naturaleza y las personas.",
    "natureCta.donate": "Donar",
    "natureCta.exploreProjects": "Explorar proyectos",
    "natureCta.createBumicert": "Crear un Bumicert",
    "footer.rights": "Todos los derechos reservados.",
    "footer.contact": "Contacto",
    "card.projects": "Proyectos",
    "card.organizations": "Organizaciones",
    "card.leaderboard": "Clasificación",
    "card.searchProjects": "Buscar proyectos…",
    "card.viewAll": "Ver todo",
    "card.projectsFound": "{n} proyectos encontrados",
    "card.projectsWorldwide": "{n} proyectos en el mundo",
    "card.worldwide": "En el mundo",
    "card.openTheGlobe": "Abrir el Globo",
    "taina.shield": "Pregúntame lo que quieras",
    "taina.role": "Co-diseñada con comunidades indígenas de Manaus",
    "taina.greetingHello":
      "Hola; soy Taina. Siéntate un momento y exploremos GainForest juntos.",
    "taina.greetingHint":
      "Pregúntame por el Globo, los Bumicerts, el trabajo de las comunidades en la naturaleza o la soberanía de datos indígenas; o solo saluda.",
    "taina.placeholder": "Saluda…",
    "taina.thinking": "Taina está pensando…",
    "awards.label": "Ganadores de",
    "awards.alsoLabel": "Reconocidos por",
    "dataCommons.eyebrow": "Bienes comunes de datos abiertos",
    "dataCommons.heading.before": "El primer bien común de datos sobre",
    "dataCommons.heading.italic": "biodiversidad",
    "dataCommons.heading.after": "de propiedad comunitaria.",
    "dataCommons.body":
      "Solo el 1% de los datos globales de biodiversidad proviene de las mayores selvas del mundo. Estamos cambiando esto convirtiendo a las comunidades locales en científicas indígenas, y ayudando a las organizaciones a construir productos de datos equitativos que preserven la naturaleza.",
    "dataCommons.stat.value": "1%",
    "dataCommons.stat.label": "de los datos de biodiversidad viene de las mayores selvas",
    "equitableAI.eyebrow": "IA local-first",
    "equitableAI.heading.before": "Construimos",
    "equitableAI.heading.italic": "tecnología",
    "equitableAI.heading.after": "e IA local-first",
    "equitableAI.subheading":
      "Tres pilares de investigación abierta que convierten los datos comunitarios en herramientas que la comunidad conserva.",
    "equitableAI.pillar1.title": "Asistentes de IA",
    "equitableAI.pillar1.body":
      "Compañeras de IA narradoras que ayudan a las comunidades a archivar y compartir conocimiento en su propio idioma; empezando por Taina, co-diseñada en el Gran Manaus.",
    "equitableAI.pillar2.title": "Bioacústica",
    "equitableAI.pillar2.body":
      "Estaciones de escucha pasiva en el dosel. Clasificadores de especies abiertos transforman los coros del amanecer en registros vivos de biodiversidad.",
    "equitableAI.pillar3.title": "Teledetección",
    "equitableAI.pillar3.body":
      "Análisis satelital y con drones para que los guardianes de la naturaleza puedan demostrar la ganancia de dosel, el carbono almacenado y la continuidad del hábitat en el tiempo.",
    "tainaFeature.eyebrow": "Asistente de IA indígena",
    "tainaFeature.heading.before": "Conoce a",
    "tainaFeature.heading.italic": "Taina",
    "tainaFeature.heading.after": ", nuestra IA comunitaria.",
    "tainaFeature.body":
      "Taina acompaña a comunidades locales e indígenas a archivar y compartir conocimiento a través del relato. Los datos que recoge se autoalojan o se gobiernan vía un Consejo de Datos GainForest elegido por la comunidad; nunca se extraen.",
    "tainaFeature.cta": "Saluda a Taina",
    "research.eyebrow": "Investigación",
    "research.heading.before": "Investigamos e",
    "research.heading.italic": "innovamos",
    "research.heading.after": "juntas.",
    "research.body":
      "A partir de datos comunitarios de alta calidad, nuestra ONG organiza hackathons anuales en Suiza y a nivel global para innovar en IA y visualizaciones para la naturaleza.",
    "research.cta": "Súmate al próximo hackathon",
    "natureGuild.eyebrow": "Gremio de la Naturaleza",
    "natureGuild.heading.before": "Escuchamos a nuestro",
    "natureGuild.heading.italic": "Gremio de la Naturaleza",
    "natureGuild.heading.after": ".",
    "natureGuild.body":
      "Aprendiendo juntas y dando forma a nuevas maneras de gobernar la custodia de la naturaleza; el Gremio es un círculo rotativo de científicas comunitarias, ecólogas y referentes de campo que orientan nuestras prioridades de investigación.",
    "partners.eyebrow": "Aliados",
    "partners.heading.before": "Trabajando con guardianes de la naturaleza",
    "partners.heading.italic": "a nivel global",
    "partners.heading.after": ".",
    "partners.body":
      "Colaboramos con cooperativas de base, consejos indígenas, laboratorios ecológicos y administraciones de áreas protegidas en cuatro continentes.",
    "partners.stat": "50+",
    "partners.statLabel": "aliados de naturaleza en el mundo",
    "partners.bannerLabel": "En vivo desde Green Globe",
    "partners.bannerCountLabel": "nombres",
    "partners.recordLabel": "Registro en vivo de Green Globe",
    "partners.callsEyebrow": "Llamadas comunitarias mensuales",
    "partners.callsTitle": "Escucha a los guardianes detrás de los puntos.",
    "partners.callsBody":
      "Mira sesiones recientes de GainForest donde las comunidades comparten avances de campo, aprendizajes de restauración y herramientas abiertas.",
    "impact.eyebrow": "Reporte de impacto",
    "impact.heading": "Lee nuestro 3er reporte {anual} de impacto.",
    "impact.body":
      "El reporte 24/25 abre nuestra misión global, los aportes del año, los hitos de investigación comunitaria y los números; auditados y abiertos.",
    "impact.cta": "Leer el reporte",
    "media.eyebrow": "Medios seleccionados",
    "media.heading": "Premios y prensa.",
    "media.scroll": "Desplaza →",
    "media.kind.award": "Premio",
    "media.kind.press": "Prensa",
    "media.kind.documentary": "Documental",
    "media.kind.launch": "Lanzamiento",
    "media.kind.grant": "Beca",
    "media.kind.hackathon": "Hackathon",
    "media.kind.talk": "Charla",
    "media.kind.podcast": "Podcast",
    "media.kind.feature": "Reportaje",
    "media.kind.blog": "Blog",
    "media.items.ata.headline":
      "After The Algorithm exhibe Tainá con GainForest",
    "media.items.ata.summary":
      "El festival de Zúrich presenta Tainá como una obra co-desarrollada con comunidades indígenas, mostrando cómo saberes, lenguas y datos quedan bajo gobernanza comunitaria.",
    "media.items.simocracy.headline":
      "Lanzamiento de Simocracy: gemelos digitales con IA reparten un tesoro comunitario",
    "media.items.simocracy.summary":
      "Un mini documental sigue el experimento en Frontier Tower con GainForest, Hypercerts, Funding the Commons y sims comunitarios deliberando sobre fondos compartidos.",
    "media.items.klarna.headline":
      "GainForest, seleccionada para el AI for Climate Resilience Program de Klarna",
    "media.items.klarna.summary":
      "Klarna nombra a GainForest e.V. entre seis innovadores seleccionados que usan IA para apoyar a las comunidades en la primera línea climática.",
    "media.items.bhutan.headline":
      "El equipo GainForest DeepGov gana el hackathon internacional impulsado por la NDI de Bután",
    "media.items.bhutan.summary":
      "Kuensel informa que Team DeepGov y Team Cyberchain ganan el hackathon de tres días de Bután para aplicaciones descentralizadas basadas en la Identidad Digital Nacional.",
    "media.items.changenow.headline":
      "GainForest en ChangeNOW: la naturaleza como elección económica",
    "media.items.changenow.summary":
      "La charla principal de ChangeNOW presenta el enfoque de GainForest sobre IA, teledetección, blockchain y monitoreo de ecosistemas para financiar la naturaleza.",
    "media.items.cna.headline":
      "CNA documenta cómo GainForest ayuda a conservar manglares en Filipinas",
    "media.items.cna.summary":
      "Tech To Save The World visita Filipinas para mostrar cómo la recolección de datos y la IA apoyan la conservación de manglares junto a las comunidades locales.",
    "media.items.atmos.headline":
      "Atmos cuenta cómo comunidades indígenas protegen su cultura con su propio ChatGPT",
    "media.items.atmos.summary":
      "El reportaje sigue a Tainá, la asistente de IA comunitaria de GainForest, que guarda conocimientos locales, historias y observaciones de biodiversidad bajo gobernanza propia.",
    "media.items.ftc.headline":
      "GainForest conecta naturaleza, datos y oportunidad humana",
    "media.items.ftc.summary":
      "Funding the Commons presenta el modelo de GainForest de renta por datos de conservación y financiamiento regenerativo para comunidades de selva.",
    "media.items.maearth.headline":
      "Renta por datos de conservación con GainForest",
    "media.items.maearth.summary":
      "Ma Earth conversa con el equipo de GainForest sobre origen, iniciativas actuales, financiamiento retro, IA, Web3 y el XPRIZE.",
    "media.items.xprize.headline":
      "GainForest, ganadora del XPRIZE Rainforest",
    "media.items.xprize.summary":
      "GainForest y socios son reconocidos por el XPRIZE Rainforest por tecnología que revela y protege la biodiversidad.",
    "media.items.swissnex.headline":
      "GainForest y ETH BiodivX en la Amazonía",
    "media.items.swissnex.summary":
      "Swissnex relata la colaboración entre Suiza y la Amazonía, incluyendo el trabajo de ETH BiodivX y GainForest en datos de biodiversidad e IA.",
    "media.items.bcg.headline": "BCG & Handelsblatt Vordenker:innen 2022",
    "media.items.bcg.summary":
      "GainForest aparece entre iniciativas pioneras que conectan sistemas alimentarios, clima e innovación a favor de la naturaleza.",
    "media.items.mades.headline":
      "Paraguay anuncia su alianza con GainForest",
    "media.items.mades.summary":
      "El Ministerio del Ambiente y Desarrollo Sostenible anuncia apoyo para fortalecer las áreas protegidas del Chaco.",
    "media.items.ethalumni.headline":
      "ETH Alumni destaca el recorrido de IA climática de GainForest",
    "media.items.ethalumni.summary":
      "La entrevista de ETH Alumni sigue el camino de GainForest desde el activismo climático hasta herramientas de IA premiadas por XPRIZE que apoyan a comunidades indígenas y locales.",
    "media.items.weforum.headline":
      "Foro Económico Mundial: una llamada de atención de la naturaleza",
    "media.items.weforum.summary":
      "En el Open Forum 2022 de Davos, la conversación conecta deforestación, estilos de vida, riesgo pandémico y la urgencia de proteger la naturaleza.",
    "media.items.ted.headline":
      "TEDx: aprender de los guardianes de la naturaleza",
    "media.items.ted.summary":
      "La charla TEDx presenta la visión inicial de GainForest para usar criptomonedas, incentivos comunitarios y guardianes del bosque contra la deforestación.",
    "media.items.folha.headline":
      "Folha: competición internacional acelera la investigación amazónica",
    "media.items.folha.summary":
      "Folha informa desde la final de XPRIZE Rainforest en Manaus, donde Tainá y tecnologías de campo ayudan a comunidades a documentar la biodiversidad amazónica.",
    "media.items.edge.headline":
      "The Edge Malaysia: tecnología climática y el camino a seguir",
    "media.items.edge.summary":
      "The Edge Malaysia perfila rutas de tecnología climática e incluye el enfoque de IA de GainForest para financiamiento de conservación y protección forestal transparente.",
    "media.items.goethe.headline":
      "Goethe-Institut: un renacimiento de la naturaleza",
    "media.items.goethe.summary":
      "Goethe-Institut entrevista a GainForest sobre cómo las tecnologías modernas pueden restaurar confianza, apoyar la conservación y valorar la naturaleza con más justicia.",
    "media.items.ssir.headline":
      "SSIR Brasil: la guardiana virtual de los bosques",
    "media.items.ssir.summary":
      "Stanford Social Innovation Review Brasil presenta a Taina, el chatbot de GainForest para salvaguardar saberes, derechos y biodiversidad en comunidades amazónicas.",
    "media.items.microsoft.headline":
      "Microsoft: incentivar sostenibilidad con GainForest y la ONU",
    "media.items.microsoft.summary":
      "Microsoft News destaca el uso temprano de Azure, IA, blockchain y colaboración con la ONU para recompensar la protección forestal medible en la Amazonía.",
    "media.items.swissre.headline":
      "Swiss Re: usar inteligencia artificial para la esperanza",
    "media.items.swissre.summary":
      "El programa Algorithms for Hope de Swiss Re presenta el enfoque de IA y sistemas de datos de GainForest para monitorear ecosistemas y financiar restauración.",
    "supporters.heading.before": "Merci a quienes nos",
    "supporters.heading.italic": "apoyan",
    "supporters.heading.after": ".",
    "supporters.body":
      "Fundaciones, laboratorios y aliados que financian la infraestructura abierta detrás de cada proyecto en esta página.",
    "footer.legal.entity": "GainForest e.V.",
    "footer.legal.address": "Schwandenacker 35, 8052 Zurich, Suiza",
    "footer.legal.email": "team@gainforest.net",
    "footer.legal.tax": "GainForest e.V. es una organización sin fines de lucro exenta de impuestos.",
    "footer.legal.uid": "UID: CHE-181.901.605",
    "footer.legal.work": "Trabaja con nosotras",
    "footer.legal.support": "Apoyanos",
    "footer.legal.bank":
      "Banco: UBS · IBAN (CHF): CH34 0023 0230 7349 7401 C · IBAN (EUR): CH88 0023 0230 7349 7460 R · BIC: UBSWCHZH80A",
  },

  // ── Portuguese ───────────────────────────────────────────────────
  pt: {
    "nav.globe": "Globo",
    "nav.forCommunities": "Para comunidades",
    "nav.forSupporters": "Para apoiadores",
    "nav.about": "Sobre",
    "nav.signIn": "Entrar",
    "nav.signedIn": "Conectado",
    "nav.getStarted": "Começar",
    "nav.donate": "Doar",
    "nav.language": "Idioma",
    "hero.title.before": "Ferramentas {abertas} para a",
    "hero.title.italic": "inteligência regenerativa",
    "hero.title.after": "",
    "hero.subtitle":
      "Explore projetos de natureza ao redor do mundo, apoie a restauração liderada por comunidades e crie Bumicerts que tornem o cuidado ecológico visível e verificável.",
    "hero.cta.bumicerts": "Explorar Bumicerts",
    "hero.cta.globe": "Abrir o Globo",
    "hero.footnote":
      "Os Bumicerts são assinados no AT Protocol; cada registro vive em um PDS de propriedade comunitária e o contador ao vivo à direita vem direto do indexador da GainForest.",
    "choosePath.heading": "Escolha como você quer usar a GainForest",
    "choosePath.globe.eyebrow": "01 · Explorar o mapa",
    "choosePath.bumicerts.eyebrow": "02 · Conhecer o certificado",
    "choosePath.globe.heading": "O que é o Green Globe?",
    "choosePath.bumicerts.heading": "O que é um Bumicert?",
    "choosePath.globe.dragHint": "arraste para girar",
    "choosePath.globe.previewTitle": "Green Globe",
    "choosePath.globe.previewLive": "ao vivo",
    "choosePath.globe.previewBody":
      "Gire e descubra projetos de natureza liderados por comunidades; cada pin é uma organização no ATProto.",
    "choosePath.globe.pins": "{n}+ pins ao vivo",
    "choosePath.globe.caption.projects": "{n}+ projetos",
    "choosePath.globe.cta": "Abrir o Green Globe",
    "choosePath.bumicerts.cta": "Explorar Bumicerts",
    "choosePath.bumicerts.live": "Ao vivo · 3 mais recentes",
    "choosePath.bumicerts.fallback": "Recentes · 3 mais recentes",
    "choosePath.bumicerts.verified": "Verificado",
    "choosePath.bumicerts.signed": "Assinado em ATProto",
    "choosePath.liveBadge": "Ao vivo",
    "choosePath.globe.title": "Abrir o Globo",
    "choosePath.globe.body":
      "Descubra projetos e ecossistemas pelo mundo. Explore, aprenda e inspire-se.",
    "choosePath.bumicerts.title": "Explorar Bumicerts",
    "choosePath.bumicerts.body":
      "Navegue por projetos, crie e gerencie Bumicerts e apoie o impacto comunitário verificado.",
    "choosePath.or": "ou",
    "choosePath.allProjects": "Todos os projetos",
    "iwantto.heading": "Quero…",
    "iwantto.card1.title": "Descobrir projetos visualmente",
    "iwantto.card1.body":
      "Explore projetos de regeneração ao redor do mundo.",
    "iwantto.card2.title": "Explorar projetos para apoiar",
    "iwantto.card2.body":
      "Encontre iniciativas confiáveis e apoie o que importa.",
    "iwantto.card3.title": "Criar um Bumicert",
    "iwantto.card3.body":
      "Documente e verifique seu impacto regenerativo.",
    "iwantto.card4.title": "Conhecer a GainForest",
    "iwantto.card4.body":
      "Entenda nossa missão, abordagem e comunidade.",
    "howitworks.heading": "Como funciona",
    "howitworks.step1.title": "Descobrir",
    "howitworks.step1.body":
      "Explore projetos e comunidades pelo mundo com nosso mapa visual.",
    "howitworks.step2.title": "Entender",
    "howitworks.step2.body":
      "Conheça o impacto, os métodos e as pessoas por trás de cada projeto.",
    "howitworks.step3.title": "Apoiar",
    "howitworks.step3.body":
      "Contribua com recursos, conhecimento ou financiamento para impulsionar o impacto.",
    "howitworks.step4.title": "Cultivar impacto",
    "howitworks.step4.body":
      "Acompanhe resultados, conquiste Bumicerts e ajude a natureza a prosperar.",
    "natureCta.heading.before": "A natureza prospera quando agimos",
    "natureCta.heading.italic": "juntos",
    "natureCta.heading.after": ".",
    "natureCta.body":
      "Junte-se a uma comunidade global construindo um futuro justo para a natureza e as pessoas.",
    "natureCta.donate": "Doar",
    "natureCta.exploreProjects": "Explorar projetos",
    "natureCta.createBumicert": "Criar um Bumicert",
    "footer.rights": "Todos os direitos reservados.",
    "footer.contact": "Contato",
    "card.projects": "Projetos",
    "card.organizations": "Organizações",
    "card.leaderboard": "Classificação",
    "card.searchProjects": "Buscar projetos…",
    "card.viewAll": "Ver tudo",
    "card.projectsFound": "{n} projetos encontrados",
    "card.projectsWorldwide": "{n} projetos pelo mundo",
    "card.worldwide": "Pelo mundo",
    "card.openTheGlobe": "Abrir o Globo",
    "taina.shield": "Me pergunte qualquer coisa",
    "taina.role": "Co-criada com comunidades indígenas de Manaus",
    "taina.greetingHello":
      "Oi; sou a Taina. Sente um pouco e vamos explorar a GainForest juntas.",
    "taina.greetingHint":
      "Pergunte sobre o Globo, os Bumicerts, o trabalho das comunidades na natureza ou a soberania de dados indígenas; ou só venha dizer oi.",
    "taina.placeholder": "Diga oi…",
    "taina.thinking": "Taina está pensando…",
    "awards.label": "Vencedores de",
    "awards.alsoLabel": "Reconhecidos por",
    "dataCommons.eyebrow": "Bens comuns de dados abertos",
    "dataCommons.heading.before": "O primeiro bem comum de dados sobre",
    "dataCommons.heading.italic": "biodiversidade",
    "dataCommons.heading.after": "de propriedade comunitária.",
    "dataCommons.body":
      "Apenas 1% dos dados globais de biodiversidade vem das maiores florestas tropicais do mundo. Estamos mudando isso transformando comunidades locais em cientistas indígenas, e apoiando organizações a construir produtos de dados equitativos que preservam a natureza.",
    "dataCommons.stat.value": "1%",
    "dataCommons.stat.label": "dos dados de biodiversidade vem das maiores florestas",
    "equitableAI.eyebrow": "IA local-first",
    "equitableAI.heading.before": "Construímos",
    "equitableAI.heading.italic": "tecnologia",
    "equitableAI.heading.after": "e IA local-first",
    "equitableAI.subheading":
      "Três pilares de pesquisa aberta que transformam dados comunitários em ferramentas que a comunidade mantém.",
    "equitableAI.pillar1.title": "Assistentes de IA",
    "equitableAI.pillar1.body":
      "Companheiras de IA contadoras de histórias que ajudam comunidades a arquivar e compartilhar conhecimento na própria língua; começando pela Taina, co-criada na Grande Manaus.",
    "equitableAI.pillar2.title": "Bioacústica",
    "equitableAI.pillar2.body":
      "Estações de escuta passiva no dossel. Classificadores de espécies abertos transformam os coros do amanhecer em registros vivos de biodiversidade.",
    "equitableAI.pillar3.title": "Sensoriamento remoto",
    "equitableAI.pillar3.body":
      "Análise por satélite e drones que permite às comunidades comprovar ganho de dossel, estoque de carbono e continuidade de habitat ao longo do tempo.",
    "tainaFeature.eyebrow": "Assistente de IA Indígena",
    "tainaFeature.heading.before": "Conheça a",
    "tainaFeature.heading.italic": "Taina",
    "tainaFeature.heading.after": ", nossa IA comunitária.",
    "tainaFeature.body":
      "A Taina acompanha comunidades locais e indígenas a arquivar e compartilhar conhecimento através do storytelling. Os dados que ela coleta são auto-hospedados ou governados por um Conselho de Dados GainForest eleito pela comunidade; nunca extraídos.",
    "tainaFeature.cta": "Diga oi para a Taina",
    "research.eyebrow": "Pesquisa",
    "research.heading.before": "Pesquisamos e",
    "research.heading.italic": "inovamos",
    "research.heading.after": "juntas.",
    "research.body":
      "A partir de dados comunitários de alta qualidade, nossa ONG organiza hackathons anuais na Suíça e em todo o mundo para inovar em IA e visualizações para a natureza.",
    "research.cta": "Participe do próximo hackathon",
    "natureGuild.eyebrow": "Conselho da Natureza",
    "natureGuild.heading.before": "Escutamos nosso",
    "natureGuild.heading.italic": "Conselho da Natureza",
    "natureGuild.heading.after": ".",
    "natureGuild.body":
      "Aprendendo juntas e desenhando novas formas de governar a guarda da natureza; o Conselho é um círculo rotativo de cientistas comunitárias, ecólogas e líderes de campo que orientam nossas prioridades de pesquisa.",
    "partners.eyebrow": "Parceiros",
    "partners.heading.before": "Trabalhando com guardiães da natureza",
    "partners.heading.italic": "pelo mundo",
    "partners.heading.after": ".",
    "partners.body":
      "Colaboramos com cooperativas de base, conselhos indígenas, laboratórios ecológicos e gestores de áreas protegidas em quatro continentes.",
    "partners.stat": "50+",
    "partners.statLabel": "parceiros pela natureza no mundo",
    "partners.bannerLabel": "Ao vivo do Green Globe",
    "partners.bannerCountLabel": "nomes",
    "partners.recordLabel": "Registro ao vivo do Green Globe",
    "partners.callsEyebrow": "Chamadas comunitárias mensais",
    "partners.callsTitle": "Ouça os guardiões por trás dos pontos.",
    "partners.callsBody":
      "Assista a sessões recentes da GainForest em que comunidades compartilham atualizações de campo, aprendizados de restauração e ferramentas abertas.",
    "impact.eyebrow": "Relatório de impacto",
    "impact.heading": "Leia nosso 3º relatório {anual} de impacto.",
    "impact.body":
      "O relatório 24/25 abre nossa missão global, os aportes do ano, os destaques de pesquisa comunitária e os números; auditados e abertos.",
    "impact.cta": "Ler o relatório",
    "media.eyebrow": "Mídia selecionada",
    "media.heading": "Prêmios e imprensa.",
    "media.scroll": "Rolar →",
    "media.kind.award": "Prêmio",
    "media.kind.press": "Imprensa",
    "media.kind.documentary": "Documentário",
    "media.kind.launch": "Lançamento",
    "media.kind.grant": "Bolsa",
    "media.kind.hackathon": "Hackathon",
    "media.kind.talk": "Palestra",
    "media.kind.podcast": "Podcast",
    "media.kind.feature": "Matéria",
    "media.kind.blog": "Blog",
    "media.items.ata.headline":
      "After The Algorithm exibe Tainá com a GainForest",
    "media.items.ata.summary":
      "O festival de Zurique apresenta Tainá como uma obra co-desenvolvida com comunidades indígenas, mostrando como saberes, línguas e dados seguem governados pela comunidade.",
    "media.items.simocracy.headline":
      "Simocracy estreia com gêmeos digitais de IA distribuindo um tesouro comunitário",
    "media.items.simocracy.summary":
      "Um mini-documentário acompanha o experimento da Frontier Tower com GainForest, Hypercerts, Funding the Commons e sims comunitários deliberando sobre recursos compartilhados.",
    "media.items.klarna.headline":
      "GainForest é selecionada para o AI for Climate Resilience Program da Klarna",
    "media.items.klarna.summary":
      "A Klarna inclui a GainForest e.V. entre seis inovadoras selecionadas que usam IA para apoiar comunidades na linha de frente do clima.",
    "media.items.bhutan.headline":
      "Equipe GainForest DeepGov vence o hackathon internacional do NDI do Butão",
    "media.items.bhutan.summary":
      "O Kuensel relata que Team DeepGov e Team Cyberchain vencem o hackathon de três dias do Butão para aplicações descentralizadas baseadas na Identidade Digital Nacional.",
    "media.items.changenow.headline":
      "GainForest no ChangeNOW: a natureza como escolha econômica",
    "media.items.changenow.summary":
      "A conversa principal do ChangeNOW apresenta a abordagem da GainForest com IA, sensoriamento remoto, blockchain e monitoramento de ecossistemas para financiar a natureza.",
    "media.items.cna.headline":
      "CNA mostra como a GainForest ajuda a conservar manguezais nas Filipinas",
    "media.items.cna.summary":
      "Tech To Save The World vai às Filipinas para mostrar como a coleta de dados e ferramentas de IA apoiam a conservação de manguezais com comunidades locais.",
    "media.items.atmos.headline":
      "Atmos mostra como grupos indígenas protegem sua cultura com seu próprio ChatGPT",
    "media.items.atmos.summary":
      "A matéria acompanha a Tainá, a IA comunitária da GainForest que guarda saberes locais, histórias e observações de biodiversidade segundo regras da comunidade.",
    "media.items.ftc.headline":
      "GainForest conecta natureza, dados e oportunidade humana",
    "media.items.ftc.summary":
      "Funding the Commons apresenta o modelo da GainForest de renda por dados de conservação e financiamento regenerativo para comunidades de floresta.",
    "media.items.maearth.headline":
      "Renda por dados de conservação com a GainForest",
    "media.items.maearth.summary":
      "Ma Earth conversa com a equipe da GainForest sobre origem, iniciativas atuais, financiamento retro, IA, Web3 e o XPRIZE.",
    "media.items.xprize.headline": "GainForest, vencedora do XPRIZE Rainforest",
    "media.items.xprize.summary":
      "GainForest e parceiros são reconhecidos pelo XPRIZE Rainforest por tecnologia que revela e protege a biodiversidade.",
    "media.items.swissnex.headline": "GainForest e ETH BiodivX na Amazônia",
    "media.items.swissnex.summary":
      "A Swissnex relata a colaboração entre Suíça e Amazônia, incluindo o trabalho da ETH BiodivX e da GainForest com dados de biodiversidade e IA.",
    "media.items.bcg.headline": "BCG & Handelsblatt Vordenker:innen 2022",
    "media.items.bcg.summary":
      "GainForest é destaque entre iniciativas pioneiras que conectam alimentação, clima e inovação a favor da natureza.",
    "media.items.mades.headline":
      "Paraguai anuncia parceria com a GainForest",
    "media.items.mades.summary":
      "O Ministerio del Ambiente y Desarrollo Sostenible anuncia apoio para fortalecer as áreas protegidas do Chaco.",
    "media.items.ethalumni.headline":
      "ETH Alumni destaca a jornada de IA climática da GainForest",
    "media.items.ethalumni.summary":
      "A entrevista da ETH Alumni acompanha o caminho da GainForest do ativismo climático a ferramentas de IA premiadas pelo XPRIZE que apoiam comunidades indígenas e locais.",
    "media.items.weforum.headline":
      "Fórum Econômico Mundial: um alerta da natureza",
    "media.items.weforum.summary":
      "No Open Forum 2022 em Davos, a conversa conecta desmatamento, estilos de vida, risco de pandemias e a urgência de proteger a natureza.",
    "media.items.ted.headline":
      "TEDx: aprender com os guardiões da natureza",
    "media.items.ted.summary":
      "A palestra TEDx apresenta a visão inicial da GainForest para usar criptomoedas, incentivos comunitários e guardiões da floresta contra o desmatamento.",
    "media.items.folha.headline":
      "Folha: competição internacional acelera pesquisa da biodiversidade na Amazônia",
    "media.items.folha.summary":
      "A Folha relata a final do XPRIZE Rainforest em Manaus, onde Tainá e tecnologias de campo ajudam comunidades a documentar a biodiversidade amazônica.",
    "media.items.edge.headline":
      "The Edge Malaysia: tecnologia climática e o caminho adiante",
    "media.items.edge.summary":
      "The Edge Malaysia apresenta caminhos de tecnologia climática e inclui a abordagem de IA da GainForest para finanças de conservação e proteção florestal transparente.",
    "media.items.goethe.headline":
      "Goethe-Institut: um renascimento da natureza",
    "media.items.goethe.summary":
      "O Goethe-Institut entrevista a GainForest sobre como tecnologias modernas podem restaurar confiança, apoiar conservação e valorar a natureza de forma mais justa.",
    "media.items.ssir.headline":
      "SSIR Brasil: a guardiã virtual das florestas",
    "media.items.ssir.summary":
      "A Stanford Social Innovation Review Brasil apresenta Taina, o chatbot da GainForest para salvaguardar saberes, direitos e biodiversidade em comunidades amazônicas.",
    "media.items.microsoft.headline":
      "Microsoft: incentivar sustentabilidade com GainForest e ONU",
    "media.items.microsoft.summary":
      "A Microsoft News destaca o uso inicial de Azure, IA, blockchain e colaboração com a ONU para recompensar proteção florestal mensurável na Amazônia.",
    "media.items.swissre.headline":
      "Swiss Re: usar inteligência artificial para esperança",
    "media.items.swissre.summary":
      "O programa Algorithms for Hope da Swiss Re apresenta a abordagem de IA e sistemas de dados da GainForest para monitorar ecossistemas e financiar restauração.",
    "supporters.heading.before": "Merci a quem",
    "supporters.heading.italic": "nos apoia",
    "supporters.heading.after": ".",
    "supporters.body":
      "Fundações, laboratórios e parceiros que financiam a infraestrutura aberta por trás de cada projeto desta página.",
    "footer.legal.entity": "GainForest e.V.",
    "footer.legal.address": "Schwandenacker 35, 8052 Zurique, Suíça",
    "footer.legal.email": "team@gainforest.net",
    "footer.legal.tax": "GainForest e.V. é uma organização sem fins lucrativos isenta de impostos.",
    "footer.legal.uid": "UID: CHE-181.901.605",
    "footer.legal.work": "Trabalhe com a gente",
    "footer.legal.support": "Apoie",
    "footer.legal.bank":
      "Banco: UBS · IBAN (CHF): CH34 0023 0230 7349 7401 C · IBAN (EUR): CH88 0023 0230 7349 7460 R · BIC: UBSWCHZH80A",
  },

  // ── Swahili ──────────────────────────────────────────────────────
  sw: {
    "nav.globe": "Dunia",
    "nav.forCommunities": "Kwa jamii",
    "nav.forSupporters": "Kwa wafadhili",
    "nav.about": "Kuhusu",
    "nav.signIn": "Ingia",
    "nav.signedIn": "Umeingia",
    "nav.getStarted": "Anza",
    "nav.donate": "Toa",
    "nav.language": "Lugha",
    "hero.title.before": "Zana {huria} kwa",
    "hero.title.italic": "akili ya kuzaa upya",
    "hero.title.after": "",
    "hero.subtitle":
      "Vinjari miradi ya asili kote duniani, saidia urejeshaji unaoongozwa na jamii, na tengeneza Bumicerts zinazofanya utunzaji wa ikolojia uonekane na kuthibitishwa.",
    "hero.cta.bumicerts": "Vinjari Bumicerts",
    "hero.cta.globe": "Fungua Dunia",
    "hero.footnote":
      "Bumicerts husainiwa kwenye AT Protocol; kila rekodi inaishi kwenye PDS inayomilikiwa na jamii na hesabu ya moja kwa moja upande wa kulia inatoka moja kwa moja kwa kiashiria cha GainForest.",
    "choosePath.heading": "Chagua jinsi unavyotaka kutumia GainForest",
    "choosePath.globe.eyebrow": "01 · Chunguza ramani",
    "choosePath.bumicerts.eyebrow": "02 · Tambua cheti",
    "choosePath.globe.heading": "Green Globe ni nini?",
    "choosePath.bumicerts.heading": "Bumicert ni nini?",
    "choosePath.globe.dragHint": "vuta kuzungusha",
    "choosePath.globe.previewTitle": "Green Globe",
    "choosePath.globe.previewLive": "moja kwa moja",
    "choosePath.globe.previewBody":
      "Zungusha tufe na uone miradi ya jamii ya hifadhi ya asili; kila kilele ni shirika kwenye ATProto.",
    "choosePath.globe.pins": "{n}+ vilele vya moja kwa moja",
    "choosePath.globe.caption.projects": "{n}+ miradi",
    "choosePath.globe.cta": "Fungua Green Globe",
    "choosePath.bumicerts.cta": "Chunguza Bumicerts",
    "choosePath.bumicerts.live": "Moja kwa moja · 3 za hivi karibuni",
    "choosePath.bumicerts.fallback": "Za hivi karibuni · 3",
    "choosePath.bumicerts.verified": "Imethibitishwa",
    "choosePath.bumicerts.signed": "Imesainiwa kwa ATProto",
    "choosePath.liveBadge": "Moja kwa moja",
    "choosePath.globe.title": "Fungua Dunia",
    "choosePath.globe.body":
      "Gundua miradi na mifumo ya ikolojia duniani kote. Vinjari, jifunze, na pata msukumo.",
    "choosePath.bumicerts.title": "Vinjari Bumicerts",
    "choosePath.bumicerts.body":
      "Vinjari miradi, tengeneza na simamia Bumicerts, na saidia athari ya jamii iliyothibitishwa.",
    "choosePath.or": "au",
    "choosePath.allProjects": "Miradi yote",
    "iwantto.heading": "Nataka…",
    "iwantto.card1.title": "Kugundua miradi kwa picha",
    "iwantto.card1.body":
      "Vinjari miradi ya uhuishaji kote duniani.",
    "iwantto.card2.title": "Kuvinjari miradi ya kusaidia",
    "iwantto.card2.body":
      "Pata mipango ya kuaminika na uunge mkono kile kinacholeta tofauti.",
    "iwantto.card3.title": "Kutengeneza Bumicert",
    "iwantto.card3.body":
      "Andika na thibitisha athari yako ya kuzaa upya.",
    "iwantto.card4.title": "Kujifunza kuhusu GainForest",
    "iwantto.card4.body":
      "Elewa dhamira, mbinu, na jumuiya yetu.",
    "howitworks.heading": "Inavyofanya kazi",
    "howitworks.step1.title": "Gundua",
    "howitworks.step1.body":
      "Vinjari miradi na jumuiya duniani kote kwa kutumia ramani yetu ya picha.",
    "howitworks.step2.title": "Elewa",
    "howitworks.step2.body":
      "Jifunze kuhusu athari, mbinu na watu nyuma ya kila mradi.",
    "howitworks.step3.title": "Saidia",
    "howitworks.step3.body":
      "Changia ufadhili, rasilimali au ujuzi ili kuendesha athari.",
    "howitworks.step4.title": "Kuza athari",
    "howitworks.step4.body":
      "Fuatilia matokeo, pata Bumicerts, na saidia asili kustawi.",
    "natureCta.heading.before": "Maumbile hustawi tunapotenda",
    "natureCta.heading.italic": "pamoja",
    "natureCta.heading.after": ".",
    "natureCta.body":
      "Jiunge na jumuiya ya kimataifa inayojenga mustakabali wa haki kwa maumbile na watu.",
    "natureCta.donate": "Toa",
    "natureCta.exploreProjects": "Vinjari miradi",
    "natureCta.createBumicert": "Tengeneza Bumicert",
    "footer.rights": "Haki zote zimehifadhiwa.",
    "footer.contact": "Wasiliana",
    "card.projects": "Miradi",
    "card.organizations": "Mashirika",
    "card.leaderboard": "Orodha ya wakuu",
    "card.searchProjects": "Tafuta miradi…",
    "card.viewAll": "Ona vyote",
    "card.projectsFound": "Miradi {n} imepatikana",
    "card.projectsWorldwide": "Miradi {n} duniani kote",
    "card.worldwide": "Duniani kote",
    "card.openTheGlobe": "Fungua Dunia",
    "taina.shield": "Niulize lolote",
    "taina.role": "Iliyoundwa pamoja na jamii za Kiasili za Manaus",
    "taina.greetingHello":
      "Habari; mimi ni Taina. Kaa kidogo, tuvinjari GainForest pamoja.",
    "taina.greetingHint":
      "Niulize kuhusu Dunia, Bumicerts, kazi za kijamii za asili au mamlaka ya data ya Kiasili; au tu sema habari.",
    "taina.placeholder": "Sema habari…",
    "taina.thinking": "Taina anafikiria…",
    "awards.label": "Washindi wa",
    "awards.alsoLabel": "Wametambuliwa na",
    "dataCommons.eyebrow": "Hifadhi ya data huria",
    "dataCommons.heading.before": "Hifadhi ya kwanza ya kijamii ya data ya",
    "dataCommons.heading.italic": "bioanuwai",
    "dataCommons.heading.after": "duniani.",
    "dataCommons.body":
      "Asilimia 1 tu ya data ya bioanuwai duniani inatoka kwenye misitu mikubwa zaidi ya mvua. Tunabadilisha hili kwa kuwafanya wanajamii kuwa wanasayansi wa Kiasili, na kusaidia mashirika kujenga bidhaa za data zenye usawa zinazohifadhi asili.",
    "dataCommons.stat.value": "1%",
    "dataCommons.stat.label": "ya data ya bioanuwai inatoka kwenye misitu mikubwa",
    "equitableAI.eyebrow": "AI ya local-first",
    "equitableAI.heading.before": "Tunajenga",
    "equitableAI.heading.italic": "teknolojia",
    "equitableAI.heading.after": "na AI ya local-first",
    "equitableAI.subheading":
      "Nguzo tatu za utafiti wazi zinazogeuza data ya jamii kuwa zana ambazo jamii inazimiliki.",
    "equitableAI.pillar1.title": "Wasaidizi wa AI",
    "equitableAI.pillar1.body":
      "Wasaidizi wa AI wanaosimulia hadithi wanaowasaidia jamii kuhifadhi na kushiriki maarifa katika lugha yao; kuanzia na Taina, aliyebuniwa pamoja huko Manaus.",
    "equitableAI.pillar2.title": "Bioakustiki",
    "equitableAI.pillar2.body":
      "Vituo vya kusikiliza vya kimya mlimani. Visajili huria vya spishi vinabadilisha kwaya za alfajiri kuwa rekodi hai za bioanuwai.",
    "equitableAI.pillar3.title": "Utambuzi wa mbali",
    "equitableAI.pillar3.body":
      "Uchanganuzi wa satelaiti na drone unaowezesha wasimamizi wa asili kuthibitisha ongezeko la mwavuli, hifadhi ya kaboni, na muendelezo wa makazi kwa wakati.",
    "tainaFeature.eyebrow": "Msaidizi wa AI wa Kiasili",
    "tainaFeature.heading.before": "Kutana na",
    "tainaFeature.heading.italic": "Taina",
    "tainaFeature.heading.after": ", AI wetu wa kijamii.",
    "tainaFeature.body":
      "Taina anaongoza jamii za kienyeji na za Kiasili kuhifadhi na kushiriki maarifa kwa kusimulia hadithi. Data anayoikusanya inahifadhiwa nyumbani au kusimamiwa na Baraza la Data la GainForest lililochaguliwa na jamii; haitolewi kamwe.",
    "tainaFeature.cta": "Mkaribishe Taina",
    "research.eyebrow": "Utafiti",
    "research.heading.before": "Tunafanya utafiti na",
    "research.heading.italic": "kubuni",
    "research.heading.after": "pamoja.",
    "research.body":
      "Kwa kutegemea data ya hali ya juu ya jamii, shirika letu lisilo la faida huandaa hackathon ya kila mwaka nchini Uswisi na duniani kote kubuni kwa pamoja AI na taswira za asili.",
    "research.cta": "Jiunge na hackathon ijayo",
    "natureGuild.eyebrow": "Baraza la Asili",
    "natureGuild.heading.before": "Tunasikiliza",
    "natureGuild.heading.italic": "Baraza la Asili",
    "natureGuild.heading.after": ".",
    "natureGuild.body":
      "Tukijifunza pamoja na kuunda njia mpya za kusimamia utunzaji wa asili; Baraza ni mzunguko wa wanasayansi wa jamii, wanaikolojia na viongozi wa eneo wanaoongoza vipaumbele vyetu vya utafiti.",
    "partners.eyebrow": "Washirika",
    "partners.heading.before": "Tunafanya kazi na walinzi wa asili",
    "partners.heading.italic": "duniani kote",
    "partners.heading.after": ".",
    "partners.body":
      "Tunashirikiana na vyama vya msingi, mabaraza ya Kiasili, maabara za kiikolojia, na wasimamizi wa hifadhi katika mabara manne.",
    "partners.stat": "50+",
    "partners.statLabel": "washirika wa asili duniani",
    "partners.bannerLabel": "Moja kwa moja kutoka Green Globe",
    "partners.bannerCountLabel": "majina",
    "partners.recordLabel": "Rekodi hai ya Green Globe",
    "partners.callsEyebrow": "Mikutano ya kila mwezi ya jamii",
    "partners.callsTitle": "Sikiliza walinzi walio nyuma ya alama hizi.",
    "partners.callsBody":
      "Tazama vipindi vya hivi karibuni vya GainForest ambapo jamii hushiriki taarifa za uwandani, masomo ya urejeshaji na zana huria.",
    "impact.eyebrow": "Ripoti ya athari",
    "impact.heading": "Soma ripoti yetu ya 3 ya {kila mwaka} ya athari.",
    "impact.body":
      "Ripoti ya 24/25 inafichua dhamira yetu ya kimataifa, ruzuku za mwaka, vidokezo vya utafiti wa kijamii na takwimu; zilizokaguliwa na za wazi.",
    "impact.cta": "Soma ripoti",
    "media.eyebrow": "Vyombo vya habari",
    "media.heading": "Tuzo na vyombo vya habari.",
    "media.scroll": "Sogeza →",
    "media.kind.award": "Tuzo",
    "media.kind.press": "Habari",
    "media.kind.documentary": "Filamu",
    "media.kind.launch": "Uzinduzi",
    "media.kind.grant": "Ufadhili",
    "media.kind.hackathon": "Hackathon",
    "media.kind.talk": "Mhadhara",
    "media.kind.podcast": "Podikasti",
    "media.kind.feature": "Kipengele",
    "media.kind.blog": "Blogu",
    "media.items.ata.headline":
      "After The Algorithm yaonyesha Tainá pamoja na GainForest",
    "media.items.ata.summary":
      "Tamasha la Zürich linaonyesha Tainá kama kazi iliyoundwa pamoja na jamii za asili, ikionyesha jinsi maarifa, lugha na data hubaki chini ya utawala wa jamii.",
    "media.items.simocracy.headline":
      "Simocracy yazinduliwa, mapacha ya kidijitali ya AI yagawanya hazina ya jamii",
    "media.items.simocracy.summary":
      "Filamu fupi inafuata jaribio la Frontier Tower likiwajumuisha GainForest, Hypercerts, Funding the Commons na sims za jamii zikijadili rasilimali za pamoja.",
    "media.items.klarna.headline":
      "GainForest yachaguliwa na Klarna kwa AI for Climate Resilience Program",
    "media.items.klarna.summary":
      "Klarna inaitaja GainForest e.V. miongoni mwa wabunifu sita waliochaguliwa wanaotumia AI kusaidia jamii zilizo mstari wa mbele wa hali ya hewa.",
    "media.items.bhutan.headline":
      "Timu ya GainForest DeepGov yashinda hackathon ya kimataifa ya NDI ya Bhutan",
    "media.items.bhutan.summary":
      "Kuensel yaripoti Team DeepGov na Team Cyberchain washinda hackathon ya siku tatu ya Bhutan kwa programu zilizoegemea kwenye Utambulisho wa Kitaifa wa Kidijitali.",
    "media.items.changenow.headline":
      "GainForest katika ChangeNOW: asili kama chaguo la kiuchumi",
    "media.items.changenow.summary":
      "Mhadhara mkuu wa ChangeNOW unaonyesha njia ya GainForest kupitia AI, hisia za mbali, blockchain na ufuatiliaji wa mifumo ikolojia kwa fedha za asili.",
    "media.items.cna.headline":
      "CNA inaonyesha jinsi GainForest inavyosaidia kuhifadhi mikoko nchini Ufilipino",
    "media.items.cna.summary":
      "Tech To Save The World inatembelea Ufilipino kuonyesha jinsi ukusanyaji wa data na zana za AI vinavyosaidia uhifadhi wa mikoko pamoja na jamii za eneo.",
    "media.items.atmos.headline":
      "Atmos yaonyesha Taina, jinsi jamii za asili zinavyolinda utamaduni na ChatGPT yao wenyewe",
    "media.items.atmos.summary":
      "Makala ya Atmos inafuata Tainá, msaidizi wa AI wa GainForest unaomilikiwa na jamii kuhifadhi maarifa, hadithi na uchunguzi wa bayoanuwai kwa masharti ya jamii.",
    "media.items.ftc.headline":
      "GainForest yaunganisha asili, data na fursa za kibinadamu",
    "media.items.ftc.summary":
      "Funding the Commons inaonyesha mfano wa GainForest wa kipato kutokana na data ya uhifadhi na ufadhili wa kuzaa upya kwa jamii za misitu.",
    "media.items.maearth.headline":
      "Kipato kutokana na data ya uhifadhi pamoja na GainForest",
    "media.items.maearth.summary":
      "Ma Earth inazungumza na timu ya GainForest kuhusu chimbuko, mipango ya sasa, ufadhili wa nyuma, AI, Web3 na XPRIZE.",
    "media.items.xprize.headline":
      "GainForest ni mshindi wa XPRIZE Rainforest",
    "media.items.xprize.summary":
      "GainForest na washirika wanatambuliwa na XPRIZE Rainforest kwa teknolojia inayoonyesha na kulinda bayoanuwai.",
    "media.items.swissnex.headline":
      "GainForest na ETH BiodivX katika Amazonia",
    "media.items.swissnex.summary":
      "Swissnex inaripoti ushirikiano kati ya Uswisi na Amazonia, ikiwemo kazi ya ETH BiodivX na GainForest kuhusu data ya bayoanuwai na AI.",
    "media.items.bcg.headline": "BCG & Handelsblatt Vordenker:innen 2022",
    "media.items.bcg.summary":
      "GainForest inaangaziwa miongoni mwa mipango ya mbele inayounganisha mifumo ya chakula, hali ya hewa na ubunifu unaohifadhi asili.",
    "media.items.mades.headline":
      "Paraguay yatangaza ushirikiano na GainForest",
    "media.items.mades.summary":
      "Wizara ya Mazingira na Maendeleo Endelevu yatangaza msaada wa kuimarisha maeneo yaliyolindwa ya Chaco.",
    "media.items.ethalumni.headline":
      "ETH Alumni yaangazia safari ya GainForest ya AI kwa tabianchi",
    "media.items.ethalumni.summary":
      "Mahojiano ya ETH Alumni yanafuata safari ya GainForest kutoka harakati za tabianchi hadi zana za AI zilizoshinda XPRIZE zinazosaidia jamii za asili na za karibu.",
    "media.items.weforum.headline":
      "Jukwaa la Uchumi Duniani: onyo kutoka kwa asili",
    "media.items.weforum.summary":
      "Katika Open Forum 2022 huko Davos, mjadala unaunganisha ukataji misitu, mitindo ya maisha, hatari ya milipuko na uharaka wa kulinda asili.",
    "media.items.ted.headline":
      "TEDx: kujifunza kutoka kwa walinzi wa asili",
    "media.items.ted.summary":
      "Hotuba ya TEDx inaeleza maono ya awali ya GainForest kuhusu sarafu za kidijitali, motisha za jamii na walinzi wa misitu kupunguza ukataji miti.",
    "media.items.folha.headline":
      "Folha: shindano la kimataifa laharakisha utafiti wa bioanuwai Amazon",
    "media.items.folha.summary":
      "Folha inaripoti kutoka fainali za XPRIZE Rainforest huko Manaus, ambako Tainá na teknolojia za uwandani husaidia jamii kurekodi bioanuwai ya Amazon.",
    "media.items.edge.headline":
      "The Edge Malaysia: teknolojia ya tabianchi na njia mbele",
    "media.items.edge.summary":
      "The Edge Malaysia inaonyesha njia za teknolojia ya tabianchi na kujumuisha mkabala wa AI wa GainForest kwa fedha za uhifadhi na ulinzi wa misitu wenye uwazi.",
    "media.items.goethe.headline":
      "Goethe-Institut: ufufuo wa asili",
    "media.items.goethe.summary":
      "Goethe-Institut inaihoji GainForest kuhusu jinsi teknolojia za kisasa zinavyoweza kurejesha imani, kusaidia uhifadhi na kuthamini asili kwa haki zaidi.",
    "media.items.ssir.headline":
      "SSIR Brasil: mlinzi wa kidijitali wa misitu",
    "media.items.ssir.summary":
      "Stanford Social Innovation Review Brasil inaonyesha Taina, chatbot ya GainForest ya kulinda maarifa, haki na bioanuwai katika jamii za Amazon.",
    "media.items.microsoft.headline":
      "Microsoft: kuhamasisha uendelevu na GainForest na Umoja wa Mataifa",
    "media.items.microsoft.summary":
      "Microsoft News inaonyesha matumizi ya awali ya Azure, AI, blockchain na ushirikiano na UN kulipa ulinzi wa misitu unaopimika Amazon.",
    "media.items.swissre.headline":
      "Swiss Re: kutumia akili bandia kwa matumaini",
    "media.items.swissre.summary":
      "Mpango wa Algorithms for Hope wa Swiss Re unaonyesha mkabala wa AI na mifumo ya data wa GainForest kwa ufuatiliaji wa ikolojia na ufadhili wa urejeshaji.",
    "supporters.heading.before": "Merci kwa",
    "supporters.heading.italic": "wafadhili wetu",
    "supporters.heading.after": ".",
    "supporters.body":
      "Wakfu, maabara, na washirika wanaofadhili miundombinu huria nyuma ya kila mradi kwenye ukurasa huu.",
    "footer.legal.entity": "GainForest e.V.",
    "footer.legal.address": "Schwandenacker 35, 8052 Zurich, Uswisi",
    "footer.legal.email": "team@gainforest.net",
    "footer.legal.tax": "GainForest e.V. ni shirika lisilo la faida lililoondolewa kodi.",
    "footer.legal.uid": "UID: CHE-181.901.605",
    "footer.legal.work": "Fanya kazi nasi",
    "footer.legal.support": "Tuunge mkono",
    "footer.legal.bank":
      "Benki: UBS · IBAN (CHF): CH34 0023 0230 7349 7401 C · IBAN (EUR): CH88 0023 0230 7349 7460 R · BIC: UBSWCHZH80A",
  },

  // ── Indonesian ───────────────────────────────────────────────────
  id: {
    "nav.globe": "Globe",
    "nav.forCommunities": "Untuk komunitas",
    "nav.forSupporters": "Untuk pendukung",
    "nav.about": "Tentang",
    "nav.signIn": "Masuk",
    "nav.signedIn": "Telah masuk",
    "nav.getStarted": "Mulai",
    "nav.donate": "Donasi",
    "nav.language": "Bahasa",
    "hero.title.before": "Alat {terbuka} untuk",
    "hero.title.italic": "kecerdasan regeneratif",
    "hero.title.after": "",
    "hero.subtitle":
      "Jelajahi proyek alam di seluruh dunia, dukung pemulihan yang dipimpin komunitas, dan buat Bumicerts yang membuat kepedulian ekologis terlihat dan dapat diverifikasi.",
    "hero.cta.bumicerts": "Jelajahi Bumicerts",
    "hero.cta.globe": "Buka Globe",
    "hero.footnote":
      "Bumicerts ditandatangani di AT Protocol; setiap catatan disimpan di PDS milik komunitas dan jumlah langsung di sebelah kanan diambil langsung dari pengindeks GainForest.",
    "choosePath.heading": "Pilih cara Anda menggunakan GainForest",
    "choosePath.globe.eyebrow": "01 · Jelajahi peta",
    "choosePath.bumicerts.eyebrow": "02 · Kenali sertifikat",
    "choosePath.globe.heading": "Apa itu Green Globe?",
    "choosePath.bumicerts.heading": "Apa itu Bumicert?",
    "choosePath.globe.dragHint": "tarik untuk memutar",
    "choosePath.globe.previewTitle": "Green Globe",
    "choosePath.globe.previewLive": "langsung",
    "choosePath.globe.previewBody":
      "Putar bola dunia dan temukan proyek alam yang dipimpin komunitas; setiap pin adalah organisasi di ATProto.",
    "choosePath.globe.pins": "{n}+ pin langsung",
    "choosePath.globe.caption.projects": "{n}+ proyek",
    "choosePath.globe.cta": "Buka Green Globe",
    "choosePath.bumicerts.cta": "Jelajahi Bumicerts",
    "choosePath.bumicerts.live": "Langsung · 3 terbaru",
    "choosePath.bumicerts.fallback": "Terbaru · 3",
    "choosePath.bumicerts.verified": "Terverifikasi",
    "choosePath.bumicerts.signed": "Ditandatangani di ATProto",
    "choosePath.liveBadge": "Langsung",
    "choosePath.globe.title": "Buka Globe",
    "choosePath.globe.body":
      "Temukan proyek dan ekosistem di seluruh dunia. Jelajahi, pelajari, dan dapatkan inspirasi.",
    "choosePath.bumicerts.title": "Jelajahi Bumicerts",
    "choosePath.bumicerts.body":
      "Telusuri proyek, buat dan kelola Bumicerts, serta dukung dampak komunitas yang terverifikasi.",
    "choosePath.or": "atau",
    "choosePath.allProjects": "Semua proyek",
    "iwantto.heading": "Saya ingin…",
    "iwantto.card1.title": "Menemukan proyek secara visual",
    "iwantto.card1.body":
      "Jelajahi proyek regenerasi di seluruh dunia.",
    "iwantto.card2.title": "Menelusuri proyek untuk didukung",
    "iwantto.card2.body":
      "Temukan inisiatif tepercaya dan dukung yang berarti.",
    "iwantto.card3.title": "Membuat Bumicert",
    "iwantto.card3.body":
      "Dokumentasikan dan verifikasi dampak regeneratif Anda.",
    "iwantto.card4.title": "Mempelajari GainForest",
    "iwantto.card4.body":
      "Pahami misi, pendekatan, dan komunitas kami.",
    "howitworks.heading": "Cara kerjanya",
    "howitworks.step1.title": "Temukan",
    "howitworks.step1.body":
      "Jelajahi proyek dan komunitas di seluruh dunia melalui peta visual kami.",
    "howitworks.step2.title": "Pahami",
    "howitworks.step2.body":
      "Pelajari dampak, metode, dan orang-orang di balik setiap proyek.",
    "howitworks.step3.title": "Dukung",
    "howitworks.step3.body":
      "Sumbangkan pendanaan, sumber daya, atau keahlian untuk mendorong dampak.",
    "howitworks.step4.title": "Tumbuhkan dampak",
    "howitworks.step4.body":
      "Lacak hasil, raih Bumicerts, dan bantu alam berkembang.",
    "natureCta.heading.before": "Alam berkembang ketika kita bertindak",
    "natureCta.heading.italic": "bersama",
    "natureCta.heading.after": ".",
    "natureCta.body":
      "Bergabunglah dengan komunitas global yang membangun masa depan yang adil untuk alam dan manusia.",
    "natureCta.donate": "Donasi",
    "natureCta.exploreProjects": "Jelajahi proyek",
    "natureCta.createBumicert": "Buat Bumicert",
    "footer.rights": "Hak cipta dilindungi.",
    "footer.contact": "Kontak",
    "card.projects": "Proyek",
    "card.organizations": "Organisasi",
    "card.leaderboard": "Papan peringkat",
    "card.searchProjects": "Cari proyek…",
    "card.viewAll": "Lihat semua",
    "card.projectsFound": "{n} proyek ditemukan",
    "card.projectsWorldwide": "{n} proyek di seluruh dunia",
    "card.worldwide": "Di seluruh dunia",
    "card.openTheGlobe": "Buka Globe",
    "taina.shield": "Tanya saya apa saja",
    "taina.role": "Dirancang bersama komunitas adat di Manaus",
    "taina.greetingHello":
      "Halo; aku Taina. Duduklah sebentar, mari kita jelajahi GainForest bersama.",
    "taina.greetingHint":
      "Tanya aku tentang Globe, Bumicerts, kerja komunitas untuk alam, atau kedaulatan data adat; atau sapa saja.",
    "taina.placeholder": "Sapa…",
    "taina.thinking": "Taina sedang berpikir…",
    "awards.label": "Pemenang",
    "awards.alsoLabel": "Diakui oleh",
    "dataCommons.eyebrow": "Komons data terbuka",
    "dataCommons.heading.before": "Komons data",
    "dataCommons.heading.italic": "keanekaragaman hayati",
    "dataCommons.heading.after": "komunitas pertama di dunia.",
    "dataCommons.body":
      "Hanya 1% data keanekaragaman hayati global yang berasal dari hutan hujan terbesar di dunia. Kami mengubah ini dengan membantu komunitas lokal menjadi ilmuwan adat, dan mendukung organisasi membangun produk data yang adil untuk melindungi alam.",
    "dataCommons.stat.value": "1%",
    "dataCommons.stat.label": "data keanekaragaman hayati berasal dari hutan hujan terbesar",
    "equitableAI.eyebrow": "AI local-first",
    "equitableAI.heading.before": "Kami membangun",
    "equitableAI.heading.italic": "teknologi",
    "equitableAI.heading.after": "dan AI local-first",
    "equitableAI.subheading":
      "Tiga pilar riset terbuka yang mengubah data dari komunitas menjadi alat yang dimiliki komunitas.",
    "equitableAI.pillar1.title": "Asisten AI",
    "equitableAI.pillar1.body":
      "Pendamping AI berbasis cerita yang membantu komunitas mengarsipkan dan berbagi pengetahuan dalam bahasa mereka sendiri; dimulai dari Taina, yang dirancang bersama di Greater Manaus.",
    "equitableAI.pillar2.title": "Bioakustik",
    "equitableAI.pillar2.body":
      "Stasiun pendengar pasif di kanopi. Pengklasifikasi spesies terbuka mengubah paduan suara fajar menjadi rekaman keanekaragaman hayati yang hidup.",
    "equitableAI.pillar3.title": "Penginderaan jarak jauh",
    "equitableAI.pillar3.body":
      "Analisis satelit dan drone yang memungkinkan penjaga alam membuktikan pertumbuhan kanopi, stok karbon, dan kontinuitas habitat dari waktu ke waktu.",
    "tainaFeature.eyebrow": "Asisten AI Adat",
    "tainaFeature.heading.before": "Kenalan dengan",
    "tainaFeature.heading.italic": "Taina",
    "tainaFeature.heading.after": ", AI komunitas kami.",
    "tainaFeature.body":
      "Taina memandu komunitas lokal dan adat untuk mengarsipkan dan berbagi pengetahuan lewat bercerita. Data yang ia kumpulkan dapat dihos sendiri atau dikelola oleh Dewan Data GainForest yang dipilih komunitas; tidak pernah diekstraksi.",
    "tainaFeature.cta": "Sapa Taina",
    "research.eyebrow": "Riset",
    "research.heading.before": "Kami meneliti dan",
    "research.heading.italic": "berinovasi",
    "research.heading.after": "bersama.",
    "research.body":
      "Berbasis data berkualitas tinggi dari komunitas, organisasi nirlaba kami menyelenggarakan hackathon tahunan di Swiss dan global untuk berinovasi pada AI dan visualisasi data untuk alam.",
    "research.cta": "Ikut hackathon berikutnya",
    "natureGuild.eyebrow": "Dewan Alam",
    "natureGuild.heading.before": "Kami mendengarkan",
    "natureGuild.heading.italic": "Dewan Alam",
    "natureGuild.heading.after": ".",
    "natureGuild.body":
      "Belajar bersama dan membentuk cara baru menata kepedulian terhadap alam; Dewan adalah lingkaran berputar yang berisi ilmuwan komunitas, ekolog, dan koordinator lapangan yang mengarahkan prioritas riset kami.",
    "partners.eyebrow": "Mitra",
    "partners.heading.before": "Bekerja bersama penjaga alam",
    "partners.heading.italic": "di seluruh dunia",
    "partners.heading.after": ".",
    "partners.body":
      "Kami bermitra dengan koperasi akar rumput, dewan adat, laboratorium ekologi, dan pengelola kawasan lindung di empat benua.",
    "partners.stat": "50+",
    "partners.statLabel": "mitra alam di seluruh dunia",
    "partners.bannerLabel": "Langsung dari Green Globe",
    "partners.bannerCountLabel": "nama",
    "partners.recordLabel": "Rekaman langsung Green Globe",
    "partners.callsEyebrow": "Panggilan komunitas bulanan",
    "partners.callsTitle": "Dengarkan para penjaga di balik titik-titik ini.",
    "partners.callsBody":
      "Tonton sesi terbaru GainForest saat komunitas berbagi kabar lapangan, pelajaran restorasi, dan alat terbuka.",
    "impact.eyebrow": "Laporan dampak",
    "impact.heading": "Baca laporan dampak {tahunan} ke-3 kami.",
    "impact.body":
      "Laporan 24/25 membuka misi global kami, hibah tahunan, sorotan riset komunitas, dan angka-angka; telah diaudit dan terbuka.",
    "impact.cta": "Baca laporannya",
    "media.eyebrow": "Media pilihan",
    "media.heading": "Penghargaan & pers.",
    "media.scroll": "Geser →",
    "media.kind.award": "Penghargaan",
    "media.kind.press": "Pers",
    "media.kind.documentary": "Dokumenter",
    "media.kind.launch": "Peluncuran",
    "media.kind.grant": "Hibah",
    "media.kind.hackathon": "Hackathon",
    "media.kind.talk": "Talk",
    "media.kind.podcast": "Podcast",
    "media.kind.feature": "Liputan",
    "media.kind.blog": "Blog",
    "media.items.ata.headline":
      "After The Algorithm memamerkan Tainá bersama GainForest",
    "media.items.ata.summary":
      "Festival Zürich menampilkan Tainá sebagai karya yang dikembangkan bersama komunitas adat, menunjukkan bagaimana pengetahuan, bahasa, dan data tetap dikelola komunitas.",
    "media.items.simocracy.headline":
      "Simocracy meluncur dengan kembaran digital AI mengalokasikan kas komunitas",
    "media.items.simocracy.summary":
      "Sebuah mini dokumenter mengikuti eksperimen Frontier Tower bersama GainForest, Hypercerts, Funding the Commons, dan sims komunitas yang membahas dana bersama.",
    "media.items.klarna.headline":
      "GainForest terpilih dalam AI for Climate Resilience Program Klarna",
    "media.items.klarna.summary":
      "Klarna menyebut GainForest e.V. di antara enam inovator terpilih yang menggunakan AI untuk mendukung komunitas di garis depan perubahan iklim.",
    "media.items.bhutan.headline":
      "Tim GainForest DeepGov memenangi hackathon internasional NDI Bhutan",
    "media.items.bhutan.summary":
      "Kuensel melaporkan Team DeepGov dan Team Cyberchain menjadi pemenang hackathon tiga hari Bhutan untuk aplikasi terdesentralisasi berbasis Identitas Digital Nasional.",
    "media.items.changenow.headline":
      "GainForest di ChangeNOW: alam sebagai pilihan ekonomi",
    "media.items.changenow.summary":
      "Sesi panggung utama ChangeNOW menampilkan pendekatan GainForest tentang AI, penginderaan jauh, blockchain, dan pemantauan ekosistem untuk pendanaan alam.",
    "media.items.cna.headline":
      "CNA mendokumentasikan bagaimana GainForest membantu konservasi mangrove di Filipina",
    "media.items.cna.summary":
      "Tech To Save The World mengunjungi Filipina dan menunjukkan bagaimana pengumpulan data serta AI mendukung konservasi mangrove bersama komunitas lokal.",
    "media.items.atmos.headline":
      "Atmos mengangkat Taina, komunitas adat menjaga budaya dengan ChatGPT mereka sendiri",
    "media.items.atmos.summary":
      "Liputan Atmos mengikuti Tainá, asisten AI milik komunitas dari GainForest yang menyimpan pengetahuan lokal, cerita, dan pengamatan keanekaragaman hayati sesuai aturan komunitas.",
    "media.items.ftc.headline":
      "GainForest menyambungkan alam, data, dan peluang manusia",
    "media.items.ftc.summary":
      "Funding the Commons menampilkan model GainForest tentang pendapatan dari data konservasi serta pendanaan regeneratif untuk komunitas hutan hujan.",
    "media.items.maearth.headline":
      "Pendapatan dari data konservasi bersama GainForest",
    "media.items.maearth.summary":
      "Ma Earth berbincang dengan tim GainForest tentang kisah awal, inisiatif kini, pendanaan retro, AI, Web3, dan XPRIZE.",
    "media.items.xprize.headline": "GainForest, pemenang XPRIZE Rainforest",
    "media.items.xprize.summary":
      "GainForest dan mitra diakui oleh XPRIZE Rainforest atas teknologi yang mengungkap dan melindungi keanekaragaman hayati.",
    "media.items.swissnex.headline": "GainForest dan ETH BiodivX di Amazonia",
    "media.items.swissnex.summary":
      "Swissnex memberitakan kolaborasi Swiss-Amazonia, termasuk pekerjaan ETH BiodivX dan GainForest seputar data keanekaragaman hayati dan AI.",
    "media.items.bcg.headline": "BCG & Handelsblatt Vordenker:innen 2022",
    "media.items.bcg.summary":
      "GainForest disorot sebagai salah satu inisiatif perintis yang menghubungkan sistem pangan, iklim, dan inovasi pro-alam.",
    "media.items.mades.headline":
      "Paraguay mengumumkan kemitraan dengan GainForest",
    "media.items.mades.summary":
      "Ministerio del Ambiente y Desarrollo Sostenible mengumumkan dukungan untuk memperkuat kawasan lindung di Chaco.",
    "media.items.ethalumni.headline":
      "ETH Alumni menyorot perjalanan AI iklim GainForest",
    "media.items.ethalumni.summary":
      "Wawancara ETH Alumni mengikuti perjalanan GainForest dari aktivisme iklim hingga alat AI pemenang XPRIZE yang mendukung komunitas adat dan lokal.",
    "media.items.weforum.headline":
      "Forum Ekonomi Dunia: panggilan bangun dari alam",
    "media.items.weforum.summary":
      "Di Open Forum 2022 di Davos, diskusi menghubungkan deforestasi, pilihan gaya hidup, risiko pandemi, dan kebutuhan mendesak melindungi alam.",
    "media.items.ted.headline":
      "TEDx: belajar dari penjaga alam",
    "media.items.ted.summary":
      "Talk TEDx memperkenalkan visi awal GainForest tentang mata uang kripto, insentif komunitas, dan membalik deforestasi bersama penjaga hutan.",
    "media.items.folha.headline":
      "Folha: kompetisi internasional mempercepat riset biodiversitas Amazon",
    "media.items.folha.summary":
      "Folha melaporkan final XPRIZE Rainforest di Manaus, tempat Tainá dan teknologi lapangan membantu komunitas mendokumentasikan biodiversitas Amazon.",
    "media.items.edge.headline":
      "The Edge Malaysia: teknologi iklim dan jalan ke depan",
    "media.items.edge.summary":
      "The Edge Malaysia memetakan jalur teknologi iklim dan memuat pendekatan AI GainForest untuk pembiayaan konservasi dan perlindungan hutan yang transparan.",
    "media.items.goethe.headline":
      "Goethe-Institut: kebangkitan alam",
    "media.items.goethe.summary":
      "Goethe-Institut mewawancarai GainForest tentang bagaimana teknologi modern dapat memulihkan kepercayaan, mendukung konservasi, dan menilai alam lebih adil.",
    "media.items.ssir.headline":
      "SSIR Brasil: penjaga virtual hutan",
    "media.items.ssir.summary":
      "Stanford Social Innovation Review Brasil menampilkan Taina, chatbot GainForest untuk menjaga pengetahuan, hak, dan biodiversitas komunitas Amazon.",
    "media.items.microsoft.headline":
      "Microsoft: memberi insentif keberlanjutan bersama GainForest dan PBB",
    "media.items.microsoft.summary":
      "Microsoft News menyorot penggunaan awal Azure, AI, blockchain, dan kolaborasi PBB untuk memberi imbalan atas perlindungan hutan terukur di Amazon.",
    "media.items.swissre.headline":
      "Swiss Re: menggunakan kecerdasan buatan untuk harapan",
    "media.items.swissre.summary":
      "Program Algorithms for Hope dari Swiss Re mempresentasikan pendekatan AI dan sistem data GainForest untuk memantau ekosistem dan mendanai restorasi.",
    "supporters.heading.before": "Merci untuk",
    "supporters.heading.italic": "para pendukung",
    "supporters.heading.after": ".",
    "supporters.body":
      "Yayasan, laboratorium, dan mitra yang mendanai infrastruktur terbuka di balik setiap proyek di halaman ini.",
    "footer.legal.entity": "GainForest e.V.",
    "footer.legal.address": "Schwandenacker 35, 8052 Zurich, Swiss",
    "footer.legal.email": "team@gainforest.net",
    "footer.legal.tax": "GainForest e.V. adalah organisasi nirlaba yang bebas pajak.",
    "footer.legal.uid": "UID: CHE-181.901.605",
    "footer.legal.work": "Bekerja bersama kami",
    "footer.legal.support": "Dukung kami",
    "footer.legal.bank":
      "Bank: UBS · IBAN (CHF): CH34 0023 0230 7349 7401 C · IBAN (EUR): CH88 0023 0230 7349 7460 R · BIC: UBSWCHZH80A",
  },
};

export type MessageKey = keyof Messages;

/** Type-safe getter — used both in components (via the hook) and on the
 *  server when we want to render with a known locale (e.g. /api/sim-chat). */
export function getMessage(locale: Locale, key: MessageKey): string {
  const dict = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  return dict[key] ?? MESSAGES[DEFAULT_LOCALE][key];
}

/** Narrow an arbitrary string to a known locale (or fall back). */
export function asLocale(raw: string | null | undefined): Locale {
  if (raw && (LOCALES as readonly string[]).includes(raw)) {
    return raw as Locale;
  }
  return DEFAULT_LOCALE;
}
