// Scoped i18n for the /about page.
//
// Why not extend `app/_lib/i18n.ts`? That module's `Messages` type
// forces every key to be translated in all five locales. The About
// page would more-than-double the message surface area in one shot;
// keeping its strings in a sibling module lets us iterate copy here
// without churning every locale block in the main file.
//
// All keys ARE translated for every locale (EN, ES, PT, SW, ID) so
// the about page reads as native in each language. Lookup still
// falls back to English on a typo/missing-key, but the supported
// locale set is complete.

import type { Locale } from "../_lib/i18n";

type AboutMessages = {
  // Top navigation crumb / page title scaffolding
  "about.eyebrow": string;
  "about.hero.heading.before": string;
  "about.hero.heading.italic": string;
  "about.hero.heading.after": string;
  "about.hero.lede": string;
  /** Lowercase indicator the LIVE badge in the hero. CSS uppercases. */
  "about.live.label": string;
  /** Italic caption under the rotating spotlight (country · {this}). */
  "about.hero.spotlightLabel": string;

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
  "about.team.advisors": string;

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

// ── English ─────────────────────────────────────────────────────────
const EN: AboutMessages = {
  "about.eyebrow": "About",
  // `{tech support}` marks the emphasis phrase that gets the curved
  // hand-drawn brush stroke underneath (same recipe as the landing
  // hero's `{Open}`). Equivalent phrase in each non-EN locale is
  // marked below.
  "about.hero.heading.before": "We are {tech support} for",
  "about.hero.heading.italic": "nature",
  "about.hero.heading.after": ".",
  "about.hero.lede":
    "GainForest is a Swiss non-profit building open, community-first tools that give the people protecting our planet the funding, data, and governance power they deserve.",
  "about.live.label": "Live",
  "about.hero.spotlightLabel": "live partner",

  "about.stats.communities": "frontline communities, live on Green Globe",
  "about.stats.bumicerts": "Bumicerts signed on ATProto",
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
    "We're a distributed team of researchers, engineers, ecologists, and community organisers spread across Switzerland, France, Mexico, India, Bhutan, Nigeria, the Philippines, Malaysia, and beyond.",
  "about.team.cofounders": "Co-founders",
  "about.team.core": "Core team",
  "about.team.advisors": "Data council & advisors",

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

// ── Español ─────────────────────────────────────────────────────────
const ES: AboutMessages = {
  "about.eyebrow": "Acerca de",
  "about.hero.heading.before": "Somos {soporte técnico} para la",
  "about.hero.heading.italic": "naturaleza",
  "about.hero.heading.after": ".",
  "about.hero.lede":
    "GainForest es una organización suiza sin fines de lucro que construye herramientas abiertas y centradas en la comunidad para dar a quienes protegen el planeta el financiamiento, los datos y el poder de gobernanza que merecen.",
  "about.live.label": "En vivo",
  "about.hero.spotlightLabel": "socio en vivo",

  "about.stats.communities": "comunidades en primera línea, en vivo en Green Globe",
  "about.stats.bumicerts": "Bumicerts firmados en ATProto",
  "about.stats.years": "años como ONG registrada en Zúrich",
  "about.stats.continents": "continentes: América Latina, África, Asia",

  "about.mission.eyebrow": "Nuestra misión",
  "about.mission.heading.before": "Escalando la cooperación humana mediante",
  "about.mission.heading.italic": "máquinas confiables",
  "about.mission.heading.after": ".",
  "about.mission.body1":
    "La mayor parte del financiamiento climático nunca llega a las bases. Cerramos ese ciclo con inteligencia regenerativa; una práctica de investigación para diseñar sistemas sociotécnicos que preservan la agencia humana, construyen confianza digital y escalan los principios de gobernanza de los bienes comunes de Ostrom más allá de sus límites locales.",
  "about.mission.body2":
    "En la práctica eso significa protocolos abiertos, datos de propiedad comunitaria, asistentes de IA co-diseñados con comunidades indígenas, y Bumicerts que reúnen las fotos, el audio y las notas de campo de una comunidad en un único registro firmado de prueba de impacto que les pertenece.",
  "about.mission.readEssay": "Leer el ensayo",

  "about.story.eyebrow": "Nuestra historia",
  "about.story.heading.before": "De un hackathon de la ONU en 2017 al",
  "about.story.heading.italic": "Amazonas",
  "about.story.heading.after": ".",
  "about.story.subheading":
    "Ocho años co-diseñando tecnología con comunidades de primera línea; algunos momentos que dieron forma al trabajo.",

  "about.team.eyebrow": "El equipo",
  "about.team.heading.before": "Un pequeño equipo global que construye en",
  "about.team.heading.italic": "abierto",
  "about.team.heading.after": ".",
  "about.team.subheading":
    "Somos un equipo distribuido de investigadoras, ingenieros, ecólogas y organizadoras comunitarias repartidos entre Suiza, Francia, México, India, Bután, Nigeria, Filipinas, Malasia y más allá.",
  "about.team.cofounders": "Cofundadores",
  "about.team.core": "Equipo principal",
  "about.team.advisors": "Consejo de datos y asesores",

  "about.recognition.eyebrow": "Reconocimientos",
  "about.recognition.heading": "Respaldados por amigos que creen en este futuro.",
  "about.recognition.body":
    "GainForest e.V. es una pequeña ONG suiza que se apoya en fundaciones, laboratorios, comunidades y ecosistemas que financian infraestructura abierta para la naturaleza. Cada nombre a continuación ha ayudado a hacer avanzar este trabajo.",

  "about.closing.eyebrow": "Únete",
  "about.closing.heading.before": "El futuro de la conservación es",
  "about.closing.heading.italic": "transparente",
  "about.closing.heading.after": ".",
  "about.closing.body":
    "Si cuidas un bosque, financias la restauración desde la base, construyes herramientas abiertas, o solo quieres saber más; nos encantaría escucharte.",
  "about.closing.donate": "Donar",
  "about.closing.impact": "Leer el reporte de impacto",
  "about.closing.contact": "Contáctanos",
};

// ── Português ───────────────────────────────────────────────────────
const PT: AboutMessages = {
  "about.eyebrow": "Sobre nós",
  "about.hero.heading.before": "Somos {suporte técnico} para a",
  "about.hero.heading.italic": "natureza",
  "about.hero.heading.after": ".",
  "about.hero.lede":
    "A GainForest é uma organização suíça sem fins lucrativos que constrói ferramentas abertas, centradas na comunidade, para dar a quem protege o planeta o financiamento, os dados e o poder de governança que merecem.",
  "about.live.label": "Ao vivo",
  "about.hero.spotlightLabel": "parceiro ao vivo",

  "about.stats.communities": "comunidades de base, ao vivo no Green Globe",
  "about.stats.bumicerts": "Bumicerts assinados no ATProto",
  "about.stats.years": "anos como ONG registrada em Zurique",
  "about.stats.continents": "continentes: América Latina, África, Ásia",

  "about.mission.eyebrow": "Nossa missão",
  "about.mission.heading.before": "Escalando a cooperação humana com",
  "about.mission.heading.italic": "máquinas confiáveis",
  "about.mission.heading.after": ".",
  "about.mission.body1":
    "A maior parte do financiamento climático nunca chega à base. Fechamos esse ciclo com inteligência regenerativa; uma prática de pesquisa para projetar sistemas sociotécnicos que preservam a agência humana, constroem confiança digital e escalam os princípios de governança dos bens comuns de Ostrom para além dos seus limites locais.",
  "about.mission.body2":
    "Na prática isso significa protocolos abertos, dados de propriedade comunitária, assistentes de IA co-desenhados com comunidades indígenas e Bumicerts que reúnem as fotos, o áudio e as notas de campo de uma comunidade num único registo assinado de prova de impacto que pertence a eles.",
  "about.mission.readEssay": "Ler o ensaio",

  "about.story.eyebrow": "Nossa história",
  "about.story.heading.before": "De um hackathon da ONU em 2017 até a",
  "about.story.heading.italic": "Amazônia",
  "about.story.heading.after": ".",
  "about.story.subheading":
    "Oito anos co-desenhando tecnologia com comunidades de base; alguns momentos que moldaram o trabalho.",

  "about.team.eyebrow": "A equipe",
  "about.team.heading.before": "Uma pequena equipe global que constrói em",
  "about.team.heading.italic": "aberto",
  "about.team.heading.after": ".",
  "about.team.subheading":
    "Somos uma equipe distribuída de pesquisadoras, engenheiros, ecólogas e organizadoras comunitárias espalhadas pela Suíça, França, México, Índia, Butão, Nigéria, Filipinas, Malásia e além.",
  "about.team.cofounders": "Cofundadores",
  "about.team.core": "Equipe principal",
  "about.team.advisors": "Conselho de dados e consultores",

  "about.recognition.eyebrow": "Reconhecimento",
  "about.recognition.heading": "Apoiados por amigos que acreditam neste futuro.",
  "about.recognition.body":
    "A GainForest e.V. é uma pequena ONG suíça que se apoia em fundações, laboratórios, comunidades e ecossistemas que financiam infraestrutura aberta para a natureza. Cada nome abaixo ajudou a empurrar este trabalho para a frente.",

  "about.closing.eyebrow": "Junte-se a nós",
  "about.closing.heading.before": "O futuro da conservação é",
  "about.closing.heading.italic": "transparente",
  "about.closing.heading.after": ".",
  "about.closing.body":
    "Se você cuida de uma floresta, financia restauração de base, constrói ferramentas abertas, ou só quer saber mais; vamos adorar ouvir você.",
  "about.closing.donate": "Doar",
  "about.closing.impact": "Ler o relatório de impacto",
  "about.closing.contact": "Fale conosco",
};

// ── Kiswahili ───────────────────────────────────────────────────────
const SW: AboutMessages = {
  "about.eyebrow": "Kuhusu sisi",
  "about.hero.heading.before": "Sisi ni {msaada wa kiteknolojia} kwa",
  "about.hero.heading.italic": "asili",
  "about.hero.heading.after": ".",
  "about.hero.lede":
    "GainForest ni shirika lisilo la faida la Uswisi linalojenga zana wazi zinazoongozwa na jamii ili kuwapa watu wanaolinda sayari yetu fedha, data, na nguvu ya utawala wanazostahili.",
  "about.live.label": "Moja kwa moja",
  "about.hero.spotlightLabel": "mshirika wa moja kwa moja",

  "about.stats.communities": "jamii za mstari wa mbele, moja kwa moja kwenye Green Globe",
  "about.stats.bumicerts": "Bumicerts zilizotiwa saini kwenye ATProto",
  "about.stats.years": "miaka kama shirika lisilo la faida lililosajiliwa Zürich",
  "about.stats.continents": "mabara: Amerika Kusini, Afrika, Asia",

  "about.mission.eyebrow": "Dhamira yetu",
  "about.mission.heading.before": "Kupanua ushirikiano wa binadamu kupitia",
  "about.mission.heading.italic": "mashine zinazoaminika",
  "about.mission.heading.after": ".",
  "about.mission.body1":
    "Sehemu kubwa ya fedha za hali ya hewa hazifiki kwa jamii za mstari wa mbele. Tunafunga mzunguko huo kwa akili ya kuzaa upya; mazoezi ya utafiti ya kubuni mifumo ya kijamii na kiteknolojia inayolinda uwezo wa binadamu, inajenga imani ya kidijitali, na inapanua kanuni za Ostrom za utawala wa rasilimali za pamoja zaidi ya mipaka yake ya kawaida.",
  "about.mission.body2":
    "Kivitendo hii ina maana ya itifaki wazi, data inayomilikiwa na jamii, wasaidizi wa AI walioundwa pamoja na jamii za Asili, na Bumicerts zinazounganisha picha, sauti na maelezo ya nyanjani ya jamii katika rekodi moja iliyotiwa saini ya uthibitisho wa athari ambayo wanaimiliki.",
  "about.mission.readEssay": "Soma insha",

  "about.story.eyebrow": "Hadithi yetu",
  "about.story.heading.before": "Kutoka hackathon ya UN ya 2017 hadi",
  "about.story.heading.italic": "Amazoni",
  "about.story.heading.after": ".",
  "about.story.subheading":
    "Miaka minane ya kubuni teknolojia pamoja na jamii za mstari wa mbele; baadhi ya nyakati zilizoumba kazi hii.",

  "about.team.eyebrow": "Timu",
  "about.team.heading.before": "Timu ndogo ya kimataifa, inayojenga kwa",
  "about.team.heading.italic": "uwazi",
  "about.team.heading.after": ".",
  "about.team.subheading":
    "Sisi ni timu iliyosambazwa ya watafiti, wahandisi, wanaikolojia, na waratibu wa jamii waliosambazwa Uswisi, Ufaransa, Mexico, India, Bhutan, Nigeria, Ufilipino, Malesia na kwingineko.",
  "about.team.cofounders": "Waanzilishi wenza",
  "about.team.core": "Timu kuu",
  "about.team.advisors": "Baraza la data na washauri",

  "about.recognition.eyebrow": "Utambuzi",
  "about.recognition.heading": "Tunaungwa mkono na marafiki wanaoamini katika hii ya baadaye.",
  "about.recognition.body":
    "GainForest e.V. ni shirika dogo lisilo la faida la Uswisi linalosimama juu ya mabega ya wakfu, maabara, jamii, na mifumo inayofadhili miundombinu wazi ya asili. Kila jina hapa chini limesaidia kupeleka kazi hii mbele.",

  "about.closing.eyebrow": "Jiunge nasi",
  "about.closing.heading.before": "Mustakabali wa uhifadhi ni",
  "about.closing.heading.italic": "wazi",
  "about.closing.heading.after": ".",
  "about.closing.body":
    "Iwapo unalinda msitu, unafadhili urejeshaji wa mstari wa mbele, unajenga zana wazi, au unataka tu kujifunza zaidi; tungependa kusikia kutoka kwako.",
  "about.closing.donate": "Changia",
  "about.closing.impact": "Soma ripoti ya athari",
  "about.closing.contact": "Wasiliana nasi",
};

// ── Bahasa Indonesia ────────────────────────────────────────────────
const ID: AboutMessages = {
  "about.eyebrow": "Tentang kami",
  "about.hero.heading.before": "Kami adalah {dukungan teknis} untuk",
  "about.hero.heading.italic": "alam",
  "about.hero.heading.after": ".",
  "about.hero.lede":
    "GainForest adalah lembaga nirlaba Swiss yang membangun alat terbuka berbasis komunitas untuk memberi para pelindung bumi pendanaan, data, dan kekuatan tata kelola yang layak mereka dapatkan.",
  "about.live.label": "Langsung",
  "about.hero.spotlightLabel": "mitra langsung",

  "about.stats.communities": "komunitas garis depan, langsung di Green Globe",
  "about.stats.bumicerts": "Bumicerts ditandatangani di ATProto",
  "about.stats.years": "tahun sebagai nirlaba terdaftar di Zurich",
  "about.stats.continents": "benua: Amerika Latin, Afrika, Asia",

  "about.mission.eyebrow": "Misi kami",
  "about.mission.heading.before": "Memperluas kerja sama manusia melalui",
  "about.mission.heading.italic": "mesin yang dipercaya",
  "about.mission.heading.after": ".",
  "about.mission.body1":
    "Sebagian besar pendanaan iklim tidak pernah mencapai akar rumput. Kami menutup loop itu dengan kecerdasan regeneratif; sebuah praktik riset untuk merancang sistem sosioteknis yang menjaga agensi manusia, membangun kepercayaan digital, dan memperluas prinsip-prinsip tata kelola sumber daya bersama dari Ostrom melampaui batas lokal.",
  "about.mission.body2":
    "Dalam praktiknya itu berarti protokol terbuka, data milik komunitas, asisten AI yang dirancang bersama komunitas Adat, dan Bumicerts yang menggabungkan foto, audio, dan catatan lapangan komunitas menjadi satu rekam bukti dampak yang ditandatangani dan dimiliki sendiri.",
  "about.mission.readEssay": "Baca esai",

  "about.story.eyebrow": "Kisah kami",
  "about.story.heading.before": "Dari hackathon PBB 2017 hingga",
  "about.story.heading.italic": "Amazon",
  "about.story.heading.after": ".",
  "about.story.subheading":
    "Delapan tahun merancang teknologi bersama komunitas garis depan; beberapa momen yang membentuk kerja ini.",

  "about.team.eyebrow": "Tim",
  "about.team.heading.before": "Tim global kecil yang membangun secara",
  "about.team.heading.italic": "terbuka",
  "about.team.heading.after": ".",
  "about.team.subheading":
    "Kami adalah tim terdistribusi yang terdiri dari peneliti, insinyur, ekolog, dan organisator komunitas yang tersebar di Swiss, Prancis, Meksiko, India, Bhutan, Nigeria, Filipina, Malaysia, dan sekitarnya.",
  "about.team.cofounders": "Pendiri bersama",
  "about.team.core": "Tim inti",
  "about.team.advisors": "Dewan data & penasihat",

  "about.recognition.eyebrow": "Pengakuan",
  "about.recognition.heading": "Didukung oleh teman-teman yang percaya pada masa depan ini.",
  "about.recognition.body":
    "GainForest e.V. adalah lembaga nirlaba Swiss kecil yang berdiri di atas bahu yayasan, laboratorium, komunitas, dan ekosistem yang mendanai infrastruktur terbuka untuk alam. Setiap nama di bawah telah membantu memajukan kerja ini.",

  "about.closing.eyebrow": "Bergabunglah",
  "about.closing.heading.before": "Masa depan konservasi adalah",
  "about.closing.heading.italic": "transparan",
  "about.closing.heading.after": ".",
  "about.closing.body":
    "Jika kamu menjaga hutan, mendanai restorasi akar rumput, membangun alat terbuka, atau hanya ingin tahu lebih banyak; kami senang mendengar darimu.",
  "about.closing.donate": "Donasi",
  "about.closing.impact": "Baca laporan dampak",
  "about.closing.contact": "Hubungi kami",
};

const TABLE: Record<Locale, AboutMessages> = {
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
