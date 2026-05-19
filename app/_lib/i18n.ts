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
