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

  // ── Equitable AI pillars (3-up: AI Assistants, Bioacoustics, Remote Sensing) ─
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
  "partners.stat": string; // "50+"
  "partners.statLabel": string; // "nature partners globally"

  // ── Impact Report ──────────────────────────────────────────────
  "impact.eyebrow": string;
  "impact.heading": string;
  "impact.body": string;
  "impact.cta": string;

  // ── Selected media ────────────────────────────────────────────
  "media.eyebrow": string;
  "media.heading": string;

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
      "Bumicerts are signed on AT Protocol — every record lives on a community-owned PDS and the live count to the right is pulled straight from the GainForest indexer.",
    "choosePath.heading": "Choose how you want to use GainForest",
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
      "Hi — I'm Taina. Sit a moment and explore GainForest with me.",
    "taina.greetingHint":
      "Ask me about the Globe, Bumicerts, community-led nature work, or Indigenous data sovereignty — or just say hi.",
    "taina.placeholder": "Say hi…",
    "taina.thinking": "Taina is thinking…",
    "awards.label": "Winners of",
    "awards.alsoLabel": "Recognised by",
    "dataCommons.eyebrow": "Open data commons",
    "dataCommons.heading.before": "The world's first community-owned data commons for",
    "dataCommons.heading.italic": "biodiversity",
    "dataCommons.heading.after": ".",
    "dataCommons.body":
      "Only 1% of global biodiversity data comes from the world's largest rainforests. We're changing this by turning local communities into Indigenous scientists \u2014 and helping organisations build equitable data products that can preserve nature.",
    "dataCommons.stat.value": "1%",
    "dataCommons.stat.label": "of biodiversity data comes from the largest rainforests",
    "equitableAI.eyebrow": "Equitable AI",
    "equitableAI.heading.before": "We build equitable",
    "equitableAI.heading.italic": "technology",
    "equitableAI.heading.after": "and AI",
    "equitableAI.subheading":
      "Three open research pillars that turn community-collected data into tools the community keeps.",
    "equitableAI.pillar1.title": "AI Assistants",
    "equitableAI.pillar1.body":
      "Storyteller AI companions that help communities archive and share knowledge in their own language \u2014 starting with Taina, co-designed in Greater Manaus.",
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
      "Taina guides local and Indigenous communities through storytelling on how to archive and share knowledge. The data she collects is self-hosted or governed through a community-elected GainForest Data Council \u2014 never extracted.",
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
      "Learning together and shaping new ways to govern nature stewardship \u2014 the Guild is a rotating circle of community scientists, ecologists, and field leads who steer GainForest's research priorities.",
    "partners.eyebrow": "Partners",
    "partners.heading.before": "Working with nature stewards",
    "partners.heading.italic": "globally",
    "partners.heading.after": ".",
    "partners.body":
      "Our non-profit collaborates with grassroots cooperatives, Indigenous councils, ecological labs, and protected-area managers across four continents.",
    "partners.stat": "50+",
    "partners.statLabel": "nature partners worldwide",
    "impact.eyebrow": "Impact report",
    "impact.heading": "Read our 3rd annual impact report.",
    "impact.body":
      "The 24/25 report unpacks our global mission, the year's grants, community-led research highlights, and the financials \u2014 audited and open.",
    "impact.cta": "Read the report",
    "media.eyebrow": "Selected media",
    "media.heading": "Awards & press.",
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
      "Bank: UBS \u00b7 IBAN (CHF): CH34 0023 0230 7349 7401 C \u00b7 IBAN (EUR): CH88 0023 0230 7349 7460 R \u00b7 BIC: UBSWCHZH80A",
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
    "nav.language": "Idioma",
    "hero.title.before": "Herramientas {abiertas} para la",
    "hero.title.italic": "inteligencia regenerativa",
    "hero.title.after": "",
    "hero.subtitle":
      "Explora proyectos de naturaleza en todo el mundo, apoya la restauración liderada por comunidades y crea Bumicerts que hagan visible y verificable la custodia ecológica.",
    "hero.cta.bumicerts": "Explorar Bumicerts",
    "hero.cta.globe": "Abrir el Globo",
    "hero.footnote":
      "Los Bumicerts se firman en el AT Protocol — cada registro vive en un PDS comunitario y el contador en vivo a la derecha proviene directamente del indexador de GainForest.",
    "choosePath.heading": "Elige cómo quieres usar GainForest",
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
      "Hola — soy Taina. Siéntate un momento y exploremos GainForest juntos.",
    "taina.greetingHint":
      "Pregúntame por el Globo, los Bumicerts, el trabajo de las comunidades en la naturaleza o la soberanía de datos indígenas — o solo saluda.",
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
    "equitableAI.eyebrow": "IA equitativa",
    "equitableAI.heading.before": "Construimos",
    "equitableAI.heading.italic": "tecnología",
    "equitableAI.heading.after": "e IA equitativas",
    "equitableAI.subheading":
      "Tres pilares de investigación abierta que convierten los datos comunitarios en herramientas que la comunidad conserva.",
    "equitableAI.pillar1.title": "Asistentes de IA",
    "equitableAI.pillar1.body":
      "Compañeras de IA narradoras que ayudan a las comunidades a archivar y compartir conocimiento en su propio idioma \u2014 empezando por Taina, co-diseñada en el Gran Manaus.",
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
      "Taina acompaña a comunidades locales e indígenas a archivar y compartir conocimiento a través del relato. Los datos que recoge se autoalojan o se gobiernan vía un Consejo de Datos GainForest elegido por la comunidad \u2014 nunca se extraen.",
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
      "Aprendiendo juntas y dando forma a nuevas maneras de gobernar la custodia de la naturaleza \u2014 el Gremio es un círculo rotativo de científicas comunitarias, ecólogas y referentes de campo que orientan nuestras prioridades de investigación.",
    "partners.eyebrow": "Aliados",
    "partners.heading.before": "Trabajando con guardianes de la naturaleza",
    "partners.heading.italic": "a nivel global",
    "partners.heading.after": ".",
    "partners.body":
      "Colaboramos con cooperativas de base, consejos indígenas, laboratorios ecológicos y administraciones de áreas protegidas en cuatro continentes.",
    "partners.stat": "50+",
    "partners.statLabel": "aliados de naturaleza en el mundo",
    "impact.eyebrow": "Reporte de impacto",
    "impact.heading": "Lee nuestro 3er reporte anual de impacto.",
    "impact.body":
      "El reporte 24/25 abre nuestra misión global, los aportes del año, los hitos de investigación comunitaria y los números \u2014 auditados y abiertos.",
    "impact.cta": "Leer el reporte",
    "media.eyebrow": "Medios seleccionados",
    "media.heading": "Premios y prensa.",
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
      "Banco: UBS \u00b7 IBAN (CHF): CH34 0023 0230 7349 7401 C \u00b7 IBAN (EUR): CH88 0023 0230 7349 7460 R \u00b7 BIC: UBSWCHZH80A",
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
    "nav.language": "Idioma",
    "hero.title.before": "Ferramentas {abertas} para a",
    "hero.title.italic": "inteligência regenerativa",
    "hero.title.after": "",
    "hero.subtitle":
      "Explore projetos de natureza ao redor do mundo, apoie a restauração liderada por comunidades e crie Bumicerts que tornem o cuidado ecológico visível e verificável.",
    "hero.cta.bumicerts": "Explorar Bumicerts",
    "hero.cta.globe": "Abrir o Globo",
    "hero.footnote":
      "Os Bumicerts são assinados no AT Protocol — cada registro vive em um PDS de propriedade comunitária e o contador ao vivo à direita vem direto do indexador da GainForest.",
    "choosePath.heading": "Escolha como você quer usar a GainForest",
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
      "Oi — sou a Taina. Sente um pouco e vamos explorar a GainForest juntas.",
    "taina.greetingHint":
      "Pergunte sobre o Globo, os Bumicerts, o trabalho das comunidades na natureza ou a soberania de dados indígenas — ou só venha dizer oi.",
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
    "equitableAI.eyebrow": "IA equitativa",
    "equitableAI.heading.before": "Construímos",
    "equitableAI.heading.italic": "tecnologia",
    "equitableAI.heading.after": "e IA equitativas",
    "equitableAI.subheading":
      "Três pilares de pesquisa aberta que transformam dados comunitários em ferramentas que a comunidade mantém.",
    "equitableAI.pillar1.title": "Assistentes de IA",
    "equitableAI.pillar1.body":
      "Companheiras de IA contadoras de histórias que ajudam comunidades a arquivar e compartilhar conhecimento na própria língua \u2014 começando pela Taina, co-criada na Grande Manaus.",
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
      "A Taina acompanha comunidades locais e indígenas a arquivar e compartilhar conhecimento através do storytelling. Os dados que ela coleta são auto-hospedados ou governados por um Conselho de Dados GainForest eleito pela comunidade \u2014 nunca extraídos.",
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
      "Aprendendo juntas e desenhando novas formas de governar a guarda da natureza \u2014 o Conselho é um círculo rotativo de cientistas comunitárias, ecólogas e líderes de campo que orientam nossas prioridades de pesquisa.",
    "partners.eyebrow": "Parceiros",
    "partners.heading.before": "Trabalhando com guardiães da natureza",
    "partners.heading.italic": "pelo mundo",
    "partners.heading.after": ".",
    "partners.body":
      "Colaboramos com cooperativas de base, conselhos indígenas, laboratórios ecológicos e gestores de áreas protegidas em quatro continentes.",
    "partners.stat": "50+",
    "partners.statLabel": "parceiros pela natureza no mundo",
    "impact.eyebrow": "Relatório de impacto",
    "impact.heading": "Leia nosso 3º relatório anual de impacto.",
    "impact.body":
      "O relatório 24/25 abre nossa missão global, os aportes do ano, os destaques de pesquisa comunitária e os números \u2014 auditados e abertos.",
    "impact.cta": "Ler o relatório",
    "media.eyebrow": "Mídia selecionada",
    "media.heading": "Prêmios e imprensa.",
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
      "Banco: UBS \u00b7 IBAN (CHF): CH34 0023 0230 7349 7401 C \u00b7 IBAN (EUR): CH88 0023 0230 7349 7460 R \u00b7 BIC: UBSWCHZH80A",
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
    "nav.language": "Lugha",
    "hero.title.before": "Zana {huria} kwa",
    "hero.title.italic": "akili ya kuzaa upya",
    "hero.title.after": "",
    "hero.subtitle":
      "Vinjari miradi ya asili kote duniani, saidia urejeshaji unaoongozwa na jamii, na tengeneza Bumicerts zinazofanya utunzaji wa ikolojia uonekane na kuthibitishwa.",
    "hero.cta.bumicerts": "Vinjari Bumicerts",
    "hero.cta.globe": "Fungua Dunia",
    "hero.footnote":
      "Bumicerts husainiwa kwenye AT Protocol — kila rekodi inaishi kwenye PDS inayomilikiwa na jamii na hesabu ya moja kwa moja upande wa kulia inatoka moja kwa moja kwa kiashiria cha GainForest.",
    "choosePath.heading": "Chagua jinsi unavyotaka kutumia GainForest",
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
      "Habari — mimi ni Taina. Kaa kidogo, tuvinjari GainForest pamoja.",
    "taina.greetingHint":
      "Niulize kuhusu Dunia, Bumicerts, kazi za kijamii za asili au mamlaka ya data ya Kiasili — au tu sema habari.",
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
    "equitableAI.eyebrow": "AI yenye usawa",
    "equitableAI.heading.before": "Tunajenga",
    "equitableAI.heading.italic": "teknolojia",
    "equitableAI.heading.after": "na AI yenye usawa",
    "equitableAI.subheading":
      "Nguzo tatu za utafiti wazi zinazogeuza data ya jamii kuwa zana ambazo jamii inazimiliki.",
    "equitableAI.pillar1.title": "Wasaidizi wa AI",
    "equitableAI.pillar1.body":
      "Wasaidizi wa AI wanaosimulia hadithi wanaowasaidia jamii kuhifadhi na kushiriki maarifa katika lugha yao \u2014 kuanzia na Taina, aliyebuniwa pamoja huko Manaus.",
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
      "Taina anaongoza jamii za kienyeji na za Kiasili kuhifadhi na kushiriki maarifa kwa kusimulia hadithi. Data anayoikusanya inahifadhiwa nyumbani au kusimamiwa na Baraza la Data la GainForest lililochaguliwa na jamii \u2014 haitolewi kamwe.",
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
      "Tukijifunza pamoja na kuunda njia mpya za kusimamia utunzaji wa asili \u2014 Baraza ni mzunguko wa wanasayansi wa jamii, wanaikolojia na viongozi wa eneo wanaoongoza vipaumbele vyetu vya utafiti.",
    "partners.eyebrow": "Washirika",
    "partners.heading.before": "Tunafanya kazi na walinzi wa asili",
    "partners.heading.italic": "duniani kote",
    "partners.heading.after": ".",
    "partners.body":
      "Tunashirikiana na vyama vya msingi, mabaraza ya Kiasili, maabara za kiikolojia, na wasimamizi wa hifadhi katika mabara manne.",
    "partners.stat": "50+",
    "partners.statLabel": "washirika wa asili duniani",
    "impact.eyebrow": "Ripoti ya athari",
    "impact.heading": "Soma ripoti yetu ya 3 ya kila mwaka ya athari.",
    "impact.body":
      "Ripoti ya 24/25 inafichua dhamira yetu ya kimataifa, ruzuku za mwaka, vidokezo vya utafiti wa kijamii na takwimu \u2014 zilizokaguliwa na za wazi.",
    "impact.cta": "Soma ripoti",
    "media.eyebrow": "Vyombo vya habari",
    "media.heading": "Tuzo na vyombo vya habari.",
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
      "Benki: UBS \u00b7 IBAN (CHF): CH34 0023 0230 7349 7401 C \u00b7 IBAN (EUR): CH88 0023 0230 7349 7460 R \u00b7 BIC: UBSWCHZH80A",
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
    "nav.language": "Bahasa",
    "hero.title.before": "Alat {terbuka} untuk",
    "hero.title.italic": "kecerdasan regeneratif",
    "hero.title.after": "",
    "hero.subtitle":
      "Jelajahi proyek alam di seluruh dunia, dukung pemulihan yang dipimpin komunitas, dan buat Bumicerts yang membuat kepedulian ekologis terlihat dan dapat diverifikasi.",
    "hero.cta.bumicerts": "Jelajahi Bumicerts",
    "hero.cta.globe": "Buka Globe",
    "hero.footnote":
      "Bumicerts ditandatangani di AT Protocol — setiap catatan disimpan di PDS milik komunitas dan jumlah langsung di sebelah kanan diambil langsung dari pengindeks GainForest.",
    "choosePath.heading": "Pilih cara Anda menggunakan GainForest",
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
      "Halo — aku Taina. Duduklah sebentar, mari kita jelajahi GainForest bersama.",
    "taina.greetingHint":
      "Tanya aku tentang Globe, Bumicerts, kerja komunitas untuk alam, atau kedaulatan data adat — atau sapa saja.",
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
    "equitableAI.eyebrow": "AI yang adil",
    "equitableAI.heading.before": "Kami membangun",
    "equitableAI.heading.italic": "teknologi",
    "equitableAI.heading.after": "dan AI yang adil",
    "equitableAI.subheading":
      "Tiga pilar riset terbuka yang mengubah data dari komunitas menjadi alat yang dimiliki komunitas.",
    "equitableAI.pillar1.title": "Asisten AI",
    "equitableAI.pillar1.body":
      "Pendamping AI berbasis cerita yang membantu komunitas mengarsipkan dan berbagi pengetahuan dalam bahasa mereka sendiri \u2014 dimulai dari Taina, yang dirancang bersama di Greater Manaus.",
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
      "Taina memandu komunitas lokal dan adat untuk mengarsipkan dan berbagi pengetahuan lewat bercerita. Data yang ia kumpulkan dapat dihos sendiri atau dikelola oleh Dewan Data GainForest yang dipilih komunitas \u2014 tidak pernah diekstraksi.",
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
      "Belajar bersama dan membentuk cara baru menata kepedulian terhadap alam \u2014 Dewan adalah lingkaran berputar yang berisi ilmuwan komunitas, ekolog, dan koordinator lapangan yang mengarahkan prioritas riset kami.",
    "partners.eyebrow": "Mitra",
    "partners.heading.before": "Bekerja bersama penjaga alam",
    "partners.heading.italic": "di seluruh dunia",
    "partners.heading.after": ".",
    "partners.body":
      "Kami bermitra dengan koperasi akar rumput, dewan adat, laboratorium ekologi, dan pengelola kawasan lindung di empat benua.",
    "partners.stat": "50+",
    "partners.statLabel": "mitra alam di seluruh dunia",
    "impact.eyebrow": "Laporan dampak",
    "impact.heading": "Baca laporan dampak tahunan ke-3 kami.",
    "impact.body":
      "Laporan 24/25 membuka misi global kami, hibah tahunan, sorotan riset komunitas, dan angka-angka \u2014 telah diaudit dan terbuka.",
    "impact.cta": "Baca laporannya",
    "media.eyebrow": "Media pilihan",
    "media.heading": "Penghargaan & pers.",
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
      "Bank: UBS \u00b7 IBAN (CHF): CH34 0023 0230 7349 7401 C \u00b7 IBAN (EUR): CH88 0023 0230 7349 7460 R \u00b7 BIC: UBSWCHZH80A",
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
