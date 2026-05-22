// Scoped i18n for the /research page.
//
// Mirrors the pattern used by `app/about/_messages.ts`: a small,
// self-contained `Messages` type plus one block per locale. Keeping
// research copy here (instead of expanding `app/_lib/i18n.ts`) means
// we can iterate the page's editorial voice without churning every
// landing string in the main file.
//
// All five locales are translated; lookup falls back to English only
// on a typo / missing-key. Headlines follow the same emphasis-word
// rhythm as the landing and about pages (a single italic word per
// h2, with one optional `{phrase}` brushed underline marker).

import type { Locale } from "../_lib/i18n";

type ResearchMessages = {
  // Top crumb / page metadata
  "research.eyebrow": string;
  /** `{phrase}` markers the brushed underline. */
  "research.hero.heading.before": string;
  "research.hero.heading.italic": string;
  "research.hero.heading.after": string;
  "research.hero.lede": string;
  /** "8" / "papers in top venues" caption labels under the hero. */
  "research.hero.kpi1.value": string;
  "research.hero.kpi1.label": string;
  "research.hero.kpi2.value": string;
  "research.hero.kpi2.label": string;
  "research.hero.kpi3.value": string;
  "research.hero.kpi3.label": string;

  // Timeline / Our research story
  "research.timeline.eyebrow": string;
  "research.timeline.heading.before": string;
  "research.timeline.heading.italic": string;
  "research.timeline.heading.after": string;
  "research.timeline.subheading": string;

  // Publications carousel
  "research.publications.eyebrow": string;
  "research.publications.heading": string;
  /** "Drag to scroll" helper, mirroring Media.tsx. */
  "research.publications.scroll": string;
  /** Kind labels for the carousel chip. */
  "research.kind.paper": string;
  "research.kind.essay": string;
  "research.kind.talk": string;
  "research.kind.workshop": string;
  "research.kind.dataset": string;

  // Open infrastructure / lexicon contributions
  "research.ecosystem.eyebrow": string;
  "research.ecosystem.heading.before": string;
  "research.ecosystem.heading.italic": string;
  "research.ecosystem.heading.after": string;
  "research.ecosystem.subheading": string;

  // Closing CTA
  "research.closing.eyebrow": string;
  "research.closing.heading.before": string;
  "research.closing.heading.italic": string;
  "research.closing.heading.after": string;
  "research.closing.body": string;
  "research.closing.essay": string;
  "research.closing.contact": string;
};

// ── English ─────────────────────────────────────────────────────────
const EN: ResearchMessages = {
  "research.eyebrow": "Research",
  "research.hero.heading.before": "Eight years of {open research}, in the",
  "research.hero.heading.italic": "open",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "From a 2017 UN hackathon prototype to peer-reviewed papers at NeurIPS, GainForest's research lab works at the frontier of AI, decentralized systems, and biodiversity, with every dataset, model, and protocol shipped openly.",
  "research.hero.kpi1.value": "8+",
  "research.hero.kpi1.label": "peer-reviewed papers in top AI venues",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "open datasets, models, and protocols",
  "research.hero.kpi3.value": "9",
  "research.hero.kpi3.label": "years co-designing with frontline communities",

  "research.timeline.eyebrow": "Research timeline",
  "research.timeline.heading.before": "From a single prototype to a",
  "research.timeline.heading.italic": "research practice",
  "research.timeline.heading.after": ".",
  "research.timeline.subheading":
    "A few moments that shaped how GainForest's research lab thinks about AI for nature; each one is also an open paper, dataset, or protocol you can read today.",

  "research.publications.eyebrow": "Publications",
  "research.publications.heading":
    "Papers, essays, and talks; all freely available.",
  "research.publications.scroll": "Drag to scroll",
  "research.kind.paper": "Paper",
  "research.kind.essay": "Essay",
  "research.kind.talk": "Invited talk",
  "research.kind.workshop": "Workshop",
  "research.kind.dataset": "Dataset",

  "research.ecosystem.eyebrow": "Open infrastructure",
  "research.ecosystem.heading.before": "Co-developing the",
  "research.ecosystem.heading.italic": "lexicon standard",
  "research.ecosystem.heading.after": " for nature data.",
  "research.ecosystem.subheading":
    "GainForest is a long-time contributor to the ATProto and Hypercerts ecosystems. The lexicons, packages, and services below are open source; built so any community can run its own proof-of-impact infrastructure end to end.",

  "research.closing.eyebrow": "Read the theory",
  "research.closing.heading.before": "All of this builds toward one idea;",
  "research.closing.heading.italic": "regenerative intelligence",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "Our long-form theory of change ties the papers, the datasets, and the protocols into one frame: AI as a tool for repairing the commons, governed by the people closest to the land.",
  "research.closing.essay": "Read the essay",
  "research.closing.contact": "Collaborate with us",
};

// ── Español ─────────────────────────────────────────────────────────
const ES: ResearchMessages = {
  "research.eyebrow": "Investigación",
  "research.hero.heading.before": "Ocho años de {investigación abierta}, en",
  "research.hero.heading.italic": "abierto",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "Desde un prototipo en un hackathon de la ONU en 2017 hasta artículos revisados por pares en NeurIPS, el laboratorio de investigación de GainForest trabaja en la frontera entre IA, sistemas descentralizados y biodiversidad, con cada conjunto de datos, modelo y protocolo publicado abiertamente.",
  "research.hero.kpi1.value": "8+",
  "research.hero.kpi1.label": "artículos revisados por pares en grandes congresos de IA",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "conjuntos de datos, modelos y protocolos abiertos",
  "research.hero.kpi3.value": "9",
  "research.hero.kpi3.label": "años co-diseñando con comunidades de primera línea",

  "research.timeline.eyebrow": "Línea de tiempo",
  "research.timeline.heading.before": "De un solo prototipo a una",
  "research.timeline.heading.italic": "práctica de investigación",
  "research.timeline.heading.after": ".",
  "research.timeline.subheading":
    "Algunos momentos que dieron forma a cómo el laboratorio de GainForest piensa la IA para la naturaleza; cada uno es también un artículo, conjunto de datos o protocolo abierto que puedes leer hoy.",

  "research.publications.eyebrow": "Publicaciones",
  "research.publications.heading":
    "Artículos, ensayos y charlas; todos disponibles libremente.",
  "research.publications.scroll": "Desliza para ver",
  "research.kind.paper": "Artículo",
  "research.kind.essay": "Ensayo",
  "research.kind.talk": "Charla invitada",
  "research.kind.workshop": "Taller",
  "research.kind.dataset": "Conjunto de datos",

  "research.ecosystem.eyebrow": "Infraestructura abierta",
  "research.ecosystem.heading.before": "Co-desarrollando el",
  "research.ecosystem.heading.italic": "estándar de lexicón",
  "research.ecosystem.heading.after": " para datos de la naturaleza.",
  "research.ecosystem.subheading":
    "GainForest contribuye desde hace años a los ecosistemas de ATProto y Hypercerts. Los lexicones, paquetes y servicios siguientes son de código abierto; construidos para que cualquier comunidad pueda operar su propia infraestructura de prueba de impacto de extremo a extremo.",

  "research.closing.eyebrow": "Lee la teoría",
  "research.closing.heading.before": "Todo esto apunta a una idea;",
  "research.closing.heading.italic": "inteligencia regenerativa",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "Nuestra teoría de cambio enlaza los artículos, los datos y los protocolos en un mismo marco: la IA como herramienta para reparar los bienes comunes, gobernada por quienes están más cerca de la tierra.",
  "research.closing.essay": "Leer el ensayo",
  "research.closing.contact": "Colaborar con nosotros",
};

// ── Português ───────────────────────────────────────────────────────
const PT: ResearchMessages = {
  "research.eyebrow": "Pesquisa",
  "research.hero.heading.before": "Oito anos de {pesquisa aberta}, em",
  "research.hero.heading.italic": "aberto",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "De um protótipo num hackathon da ONU em 2017 a artigos revistos por pares no NeurIPS, o laboratório de pesquisa da GainForest trabalha na fronteira entre IA, sistemas descentralizados e biodiversidade, com cada conjunto de dados, modelo e protocolo publicado abertamente.",
  "research.hero.kpi1.value": "8+",
  "research.hero.kpi1.label": "artigos revistos por pares em grandes conferências de IA",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "conjuntos de dados, modelos e protocolos abertos",
  "research.hero.kpi3.value": "9",
  "research.hero.kpi3.label": "anos co-desenhando com comunidades de base",

  "research.timeline.eyebrow": "Linha do tempo",
  "research.timeline.heading.before": "De um único protótipo a uma",
  "research.timeline.heading.italic": "prática de pesquisa",
  "research.timeline.heading.after": ".",
  "research.timeline.subheading":
    "Alguns momentos que moldaram como o laboratório da GainForest pensa a IA para a natureza; cada um é também um artigo, conjunto de dados ou protocolo aberto que pode ser lido hoje.",

  "research.publications.eyebrow": "Publicações",
  "research.publications.heading":
    "Artigos, ensaios e palestras; todos disponíveis livremente.",
  "research.publications.scroll": "Deslize para ver",
  "research.kind.paper": "Artigo",
  "research.kind.essay": "Ensaio",
  "research.kind.talk": "Palestra convidada",
  "research.kind.workshop": "Workshop",
  "research.kind.dataset": "Conjunto de dados",

  "research.ecosystem.eyebrow": "Infraestrutura aberta",
  "research.ecosystem.heading.before": "Co-desenvolvendo o",
  "research.ecosystem.heading.italic": "padrão de léxicons",
  "research.ecosystem.heading.after": " para dados da natureza.",
  "research.ecosystem.subheading":
    "A GainForest é uma contribuidora de longa data dos ecossistemas ATProto e Hypercerts. Os léxicons, pacotes e serviços abaixo são open source; construídos para que qualquer comunidade possa operar a sua infraestrutura de prova de impacto de ponta a ponta.",

  "research.closing.eyebrow": "Leia a teoria",
  "research.closing.heading.before": "Tudo isto aponta para uma ideia;",
  "research.closing.heading.italic": "inteligência regenerativa",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "A nossa teoria de mudança liga os artigos, os dados e os protocolos num só quadro: a IA como ferramenta para reparar os bens comuns, governada por quem está mais próximo da terra.",
  "research.closing.essay": "Ler o ensaio",
  "research.closing.contact": "Colaborar conosco",
};

// ── Kiswahili ───────────────────────────────────────────────────────
const SW: ResearchMessages = {
  "research.eyebrow": "Utafiti",
  "research.hero.heading.before": "Miaka minane ya {utafiti wazi}, kwa",
  "research.hero.heading.italic": "uwazi",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "Kuanzia mfano wa hackathon ya UN ya 2017 hadi makala zilizopitiwa na wenzao kwenye NeurIPS, maabara ya utafiti ya GainForest hufanya kazi mpakani mwa AI, mifumo iliyogatuliwa, na bayoanuwai, huku kila seti ya data, mfano, na itifaki ikichapishwa kwa wazi.",
  "research.hero.kpi1.value": "8+",
  "research.hero.kpi1.label": "makala zilizopitiwa na wenzao katika mikutano mikuu ya AI",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "seti za data, mifano na itifaki wazi",
  "research.hero.kpi3.value": "9",
  "research.hero.kpi3.label": "miaka ya kubuni pamoja na jamii za mstari wa mbele",

  "research.timeline.eyebrow": "Ratiba ya utafiti",
  "research.timeline.heading.before": "Kutoka kwa mfano mmoja hadi",
  "research.timeline.heading.italic": "mazoezi ya utafiti",
  "research.timeline.heading.after": ".",
  "research.timeline.subheading":
    "Baadhi ya nyakati zilizoumba jinsi maabara ya GainForest inavyofikiri AI kwa asili; kila moja pia ni karatasi, seti ya data, au itifaki wazi unaweza kusoma leo.",

  "research.publications.eyebrow": "Machapisho",
  "research.publications.heading":
    "Makala, insha na mihadhara; zote zinapatikana bure.",
  "research.publications.scroll": "Buruta kupita",
  "research.kind.paper": "Makala",
  "research.kind.essay": "Insha",
  "research.kind.talk": "Mhadhara wa mwaliko",
  "research.kind.workshop": "Warsha",
  "research.kind.dataset": "Seti ya data",

  "research.ecosystem.eyebrow": "Miundombinu wazi",
  "research.ecosystem.heading.before": "Kuunda kwa pamoja",
  "research.ecosystem.heading.italic": "kiwango cha lexicon",
  "research.ecosystem.heading.after": " kwa data ya asili.",
  "research.ecosystem.subheading":
    "GainForest ni mchangiaji wa muda mrefu wa mifumo ya ATProto na Hypercerts. Lexicons, paketi na huduma zifuatazo ni za chanzo wazi; zimejengwa ili jamii yoyote iweze kuendesha miundombinu yake ya uthibitisho wa athari kutoka mwanzo hadi mwisho.",

  "research.closing.eyebrow": "Soma nadharia",
  "research.closing.heading.before": "Yote haya yanalenga wazo moja;",
  "research.closing.heading.italic": "akili ya kuzaa upya",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "Nadharia yetu ya mabadiliko inaunganisha makala, data, na itifaki katika fremu moja: AI kama zana ya kurekebisha rasilimali za pamoja, ikitawaliwa na wale walio karibu zaidi na ardhi.",
  "research.closing.essay": "Soma insha",
  "research.closing.contact": "Shirikiana nasi",
};

// ── Bahasa Indonesia ────────────────────────────────────────────────
const ID: ResearchMessages = {
  "research.eyebrow": "Riset",
  "research.hero.heading.before": "Delapan tahun {riset terbuka}, secara",
  "research.hero.heading.italic": "terbuka",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "Dari prototipe di hackathon PBB 2017 hingga makalah peer-review di NeurIPS, laboratorium riset GainForest bekerja di perbatasan AI, sistem terdesentralisasi, dan keanekaragaman hayati, dengan setiap dataset, model, dan protokol dirilis secara terbuka.",
  "research.hero.kpi1.value": "8+",
  "research.hero.kpi1.label": "makalah peer-review di konferensi AI besar",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "dataset, model, dan protokol terbuka",
  "research.hero.kpi3.value": "9",
  "research.hero.kpi3.label": "tahun merancang bersama komunitas garis depan",

  "research.timeline.eyebrow": "Linimasa riset",
  "research.timeline.heading.before": "Dari satu prototipe ke sebuah",
  "research.timeline.heading.italic": "praktik riset",
  "research.timeline.heading.after": ".",
  "research.timeline.subheading":
    "Beberapa momen yang membentuk cara laboratorium GainForest memikirkan AI untuk alam; tiap momen juga merupakan makalah, dataset, atau protokol terbuka yang dapat kamu baca hari ini.",

  "research.publications.eyebrow": "Publikasi",
  "research.publications.heading":
    "Makalah, esai, dan ceramah; semuanya tersedia bebas.",
  "research.publications.scroll": "Geser untuk melihat",
  "research.kind.paper": "Makalah",
  "research.kind.essay": "Esai",
  "research.kind.talk": "Ceramah undangan",
  "research.kind.workshop": "Lokakarya",
  "research.kind.dataset": "Dataset",

  "research.ecosystem.eyebrow": "Infrastruktur terbuka",
  "research.ecosystem.heading.before": "Mengembangkan bersama",
  "research.ecosystem.heading.italic": "standar leksikon",
  "research.ecosystem.heading.after": " untuk data alam.",
  "research.ecosystem.subheading":
    "GainForest adalah kontributor lama ekosistem ATProto dan Hypercerts. Leksikon, paket, dan layanan di bawah ini bersifat open source; dibangun agar komunitas mana pun dapat menjalankan infrastruktur bukti-dampaknya sendiri dari ujung ke ujung.",

  "research.closing.eyebrow": "Baca teorinya",
  "research.closing.heading.before": "Semua ini menuju satu ide;",
  "research.closing.heading.italic": "kecerdasan regeneratif",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "Teori perubahan kami merangkai makalah, dataset, dan protokol dalam satu kerangka: AI sebagai alat untuk memperbaiki sumber daya bersama, yang dikelola oleh mereka yang paling dekat dengan tanah.",
  "research.closing.essay": "Baca esai",
  "research.closing.contact": "Berkolaborasi dengan kami",
};

const TABLE: Record<Locale, ResearchMessages> = {
  en: EN,
  es: ES,
  pt: PT,
  sw: SW,
  id: ID,
};

export type ResearchKey = keyof ResearchMessages;

export function getResearchT(locale: Locale): (key: ResearchKey) => string {
  return (key) => TABLE[locale][key] ?? EN[key];
}
