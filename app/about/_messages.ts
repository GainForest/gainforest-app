// Scoped i18n for the /about page.
//
// Why not extend `app/_lib/i18n.ts`? That module's `Messages` type
// forces every key to be translated in all five locales. The About
// page would more-than-double the message surface area in one shot;
// keeping its strings in a sibling module lets us iterate copy here
// without churning every locale block in the main file.
//
// Lookup falls back to English when a locale doesn't define a key,
// so it's safe to add a key for `en` first and translate later.

import type { Locale } from "../_lib/i18n";

type AboutMessages = {
  // Top navigation crumb / page title scaffolding
  "about.eyebrow": string;
  "about.hero.heading.before": string;
  "about.hero.heading.italic": string;
  "about.hero.heading.after": string;
  "about.hero.lede": string;

  // Live stats band
  "about.stats.communities": string;
  "about.stats.bumicerts": string;
  "about.stats.years": string;
  "about.stats.continents": string;

  // Mission / Regenerative Intelligence
  "about.mission.eyebrow": string;
  "about.mission.heading.before": string;
  "about.mission.heading.italic": string;
  "about.mission.heading.after": string;
  "about.mission.body1": string;
  "about.mission.body2": string;
  "about.mission.readEssay": string;

  // Timeline / Our story
  "about.story.eyebrow": string;
  "about.story.heading.before": string;
  "about.story.heading.italic": string;
  "about.story.heading.after": string;
  "about.story.subheading": string;

  // Team
  "about.team.eyebrow": string;
  "about.team.heading.before": string;
  "about.team.heading.italic": string;
  "about.team.heading.after": string;
  "about.team.subheading": string;
  "about.team.cofounders": string;
  "about.team.core": string;

  // Recognition
  "about.recognition.eyebrow": string;
  "about.recognition.heading": string;
  "about.recognition.body": string;

  // Closing CTA bridge
  "about.closing.eyebrow": string;
  "about.closing.heading.before": string;
  "about.closing.heading.italic": string;
  "about.closing.heading.after": string;
  "about.closing.body": string;
  "about.closing.donate": string;
  "about.closing.impact": string;
  "about.closing.contact": string;
};

const EN: AboutMessages = {
  "about.eyebrow": "About",
  "about.hero.heading.before": "We are tech support for",
  "about.hero.heading.italic": "nature",
  "about.hero.heading.after": ".",
  "about.hero.lede":
    "GainForest is a Swiss non-profit building open, community-first tools that give the people protecting our planet the funding, data, and governance power they deserve.",

  "about.stats.communities": "frontline communities, live on Green Globe",
  "about.stats.bumicerts": "high-quality Bumicerts signed on ATProto",
  "about.stats.years": "years as a registered non-profit in Zurich",
  "about.stats.continents": "continents: Latin America, Africa, Asia",

  "about.mission.eyebrow": "Our mission",
  "about.mission.heading.before": "Scaling human cooperation through",
  "about.mission.heading.italic": "trustworthy machines",
  "about.mission.heading.after": ".",
  "about.mission.body1":
    "Most climate finance never reaches the grassroots. We close that loop with regenerative intelligence; a research practice for designing sociotechnical systems that preserve human agency, build digital trust, and scale Ostrom's principles of commons governance beyond their local limits.",
  "about.mission.body2":
    "In practice that means open protocols, community-owned data, AI assistants co-designed with Indigenous communities, and Bumicerts that bind a community's photos, audio, and field notes into one signed proof-of-impact record they own.",
  "about.mission.readEssay": "Read the essay",


  "about.story.eyebrow": "Our story",
  "about.story.heading.before": "From a 2017 UN hackathon to the",
  "about.story.heading.italic": "Amazon",
  "about.story.heading.after": ".",
  "about.story.subheading":
    "Eight years of co-designing technology with frontline communities; a few moments that shaped the work.",

  "about.team.eyebrow": "The team",
  "about.team.heading.before": "A small global team, building in the",
  "about.team.heading.italic": "open",
  "about.team.heading.after": ".",
  "about.team.subheading":
    "We're a distributed team of researchers, engineers, ecologists, and community organisers spread across Switzerland, Brazil, Malaysia, the Philippines, and beyond.",
  "about.team.cofounders": "Co-founders",
  "about.team.core": "Core team",

  "about.recognition.eyebrow": "Recognition",
  "about.recognition.heading": "Backed by friends who believe in this future.",
  "about.recognition.body":
    "GainForest e.V. is a small Swiss non-profit standing on the shoulders of foundations, labs, communities, and ecosystems that fund open infrastructure for nature. Every name below has helped move this work forward.",

  "about.closing.eyebrow": "Join us",
  "about.closing.heading.before": "The future of conservation is",
  "about.closing.heading.italic": "transparent",
  "about.closing.heading.after": ".",
  "about.closing.body":
    "If you steward a forest, fund grassroots restoration, build open tools, or just want to learn more; we'd love to hear from you.",
  "about.closing.donate": "Donate",
  "about.closing.impact": "Read the impact report",
  "about.closing.contact": "Get in touch",
};

// Sparse overrides; missing keys fall back to English at lookup time.
const ES: Partial<AboutMessages> = {
  "about.eyebrow": "Acerca de",
  "about.hero.heading.before": "Somos soporte técnico para la",
  "about.hero.heading.italic": "naturaleza",
  "about.hero.heading.after": ".",
  "about.hero.lede":
    "GainForest es una organización suiza sin fines de lucro que construye herramientas abiertas y centradas en la comunidad para dar a quienes protegen el planeta el financiamiento, los datos y el poder de gobernanza que merecen.",
  "about.stats.communities": "comunidades en primera línea, en vivo en Green Globe",
  "about.stats.bumicerts": "Bumicerts de alta calidad firmados en ATProto",
  "about.stats.years": "años como ONG registrada en Zúrich",
  "about.stats.continents": "continentes: América Latina, África, Asia",
  "about.mission.eyebrow": "Nuestra misión",
  "about.mission.readEssay": "Leer el ensayo",
  "about.story.eyebrow": "Nuestra historia",
  "about.team.eyebrow": "El equipo",
  "about.team.cofounders": "Cofundadores",
  "about.team.core": "Equipo principal",
  "about.recognition.eyebrow": "Reconocimientos",
  "about.closing.eyebrow": "Únete",
  "about.closing.donate": "Donar",
  "about.closing.impact": "Leer el reporte de impacto",
  "about.closing.contact": "Contáctanos",
};

const PT: Partial<AboutMessages> = {
  "about.eyebrow": "Sobre nós",
  "about.hero.heading.before": "Somos suporte técnico para a",
  "about.hero.heading.italic": "natureza",
  "about.hero.heading.after": ".",
  "about.hero.lede":
    "A GainForest é uma organização suíça sem fins lucrativos que constrói ferramentas abertas, centradas na comunidade, para dar a quem protege o planeta o financiamento, os dados e o poder de governança que merecem.",
  "about.stats.communities": "comunidades de base, ao vivo no Green Globe",
  "about.stats.bumicerts": "Bumicerts de alta qualidade assinados no ATProto",
  "about.stats.years": "anos como ONG registrada em Zurique",
  "about.stats.continents": "continentes: América Latina, África, Ásia",
  "about.mission.eyebrow": "Nossa missão",
  "about.mission.readEssay": "Ler o ensaio",
  "about.story.eyebrow": "Nossa história",
  "about.team.eyebrow": "A equipe",
  "about.team.cofounders": "Cofundadores",
  "about.team.core": "Equipe principal",
  "about.recognition.eyebrow": "Reconhecimento",
  "about.closing.eyebrow": "Junte-se a nós",
  "about.closing.donate": "Doar",
  "about.closing.impact": "Ler o relatório de impacto",
  "about.closing.contact": "Fale conosco",
};

const SW: Partial<AboutMessages> = {
  "about.eyebrow": "Kuhusu sisi",
  "about.mission.eyebrow": "Dhamira yetu",
  "about.story.eyebrow": "Hadithi yetu",
  "about.team.eyebrow": "Timu",
  "about.team.cofounders": "Waanzilishi wenza",
  "about.team.core": "Timu kuu",
  "about.recognition.eyebrow": "Utambuzi",
  "about.closing.eyebrow": "Jiunge nasi",
  "about.closing.donate": "Changia",
  "about.closing.impact": "Soma ripoti ya athari",
  "about.closing.contact": "Wasiliana nasi",
};

const ID: Partial<AboutMessages> = {
  "about.eyebrow": "Tentang kami",
  "about.hero.heading.before": "Kami adalah dukungan teknis untuk",
  "about.hero.heading.italic": "alam",
  "about.hero.heading.after": ".",
  "about.hero.lede":
    "GainForest adalah lembaga nirlaba Swiss yang membangun alat terbuka berbasis komunitas untuk memberi para pelindung bumi pendanaan, data, dan kekuatan tata kelola yang layak mereka dapatkan.",
  "about.stats.communities": "komunitas garis depan, langsung di Green Globe",
  "about.stats.bumicerts": "Bumicerts berkualitas tinggi ditandatangani di ATProto",
  "about.stats.years": "tahun sebagai nirlaba terdaftar di Zurich",
  "about.stats.continents": "benua: Amerika Latin, Afrika, Asia",
  "about.mission.eyebrow": "Misi kami",
  "about.mission.readEssay": "Baca esai",
  "about.story.eyebrow": "Kisah kami",
  "about.team.eyebrow": "Tim",
  "about.team.cofounders": "Pendiri bersama",
  "about.team.core": "Tim inti",
  "about.recognition.eyebrow": "Pengakuan",
  "about.closing.eyebrow": "Bergabunglah",
  "about.closing.donate": "Donasi",
  "about.closing.impact": "Baca laporan dampak",
  "about.closing.contact": "Hubungi kami",
};

const TABLE: Record<Locale, Partial<AboutMessages>> = {
  en: EN,
  es: ES,
  pt: PT,
  sw: SW,
  id: ID,
};

export type AboutKey = keyof AboutMessages;

export function getAboutT(locale: Locale): (key: AboutKey) => string {
  return (key) => TABLE[locale][key] ?? EN[key];
}
