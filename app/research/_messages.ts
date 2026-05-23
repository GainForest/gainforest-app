// Scoped i18n for the /research page.
//
// Mirrors the pattern used by `app/about/_messages.ts`: a small,
// self-contained `Messages` type plus one block per locale. Keeping
// research copy here (instead of expanding `app/_lib/i18n.ts`) means
// we can iterate the page's editorial voice without churning every
// landing string in the main file.
//
// Voice on /research is intentionally more technical than the
// landing or /about — the page is read by ML researchers and ATProto
// developers, so summaries name methods, venues, baselines, and
// protocol surfaces rather than handwaving at impact.
//
// All five locales are translated; lookup falls back to English only
// on a typo / missing-key.

import type { Locale } from "../_lib/i18n";

type ResearchMessages = {
  // Top crumb / hero
  "research.eyebrow": string;
  /** Lowercase "Live" indicator next to the streamed KPI; CSS uppercases. */
  "research.live.label": string;
  /** `{phrase}` markers the brushed underline. */
  "research.hero.heading.before": string;
  "research.hero.heading.italic": string;
  "research.hero.heading.after": string;
  "research.hero.lede": string;
  /** Stat triplet captions; values are short numerals. */
  "research.hero.kpi1.value": string;
  "research.hero.kpi1.label": string;
  "research.hero.kpi2.value": string;
  "research.hero.kpi2.label": string;
  "research.hero.kpi3.value": string;
  "research.hero.kpi3.label": string;

  // Publications carousel
  "research.publications.eyebrow": string;
  "research.publications.heading": string;
  "research.publications.scroll": string;
  /** Small-caps section marker between authors and summary on the
   *  paper-preview cards. Same word every academic paper uses. */
  "research.publications.abstract": string;
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

  // ML models, datasets, and pipelines
  "research.models.eyebrow": string;
  "research.models.heading.before": string;
  "research.models.heading.italic": string;
  "research.models.heading.after": string;
  "research.models.subheading": string;

  // Climate Change AI workshop bibliography
  "research.workshop.eyebrow": string;
  "research.workshop.heading.before": string;
  "research.workshop.heading.italic": string;
  "research.workshop.heading.after": string;
  "research.workshop.subheading": string;

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
  "research.live.label": "Live",
  "research.hero.heading.before": "{Open} models for",
  "research.hero.heading.italic": "biodiversity",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "Peer-reviewed papers at NeurIPS, IEEE Field Robotics, and AAAI. Open ATProto lexicons. A self-hostable Hypersphere stack. Built with frontline partners; freely usable.",
  "research.hero.kpi1.value": "4",
  "research.hero.kpi1.label": "peer-reviewed papers at NeurIPS, IEEE, and AAAI",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "open lexicons, datasets, and services",
  // KPI3 streams live from Hyperindex (Darwin Core occurrence
  // total) so the static value here is only a render-time fallback;
  // ResearchHero overrides it with the formatted live count.
  "research.hero.kpi3.value": "",
  "research.hero.kpi3.label":
    "Darwin Core biodiversity records indexed on ATProto",

  "research.publications.eyebrow": "Publications",
  "research.publications.heading":
    "Selected papers, datasets, and writing.",
  "research.publications.scroll": "Drag to scroll",
  "research.publications.abstract": "Abstract",
  "research.kind.paper": "Paper",
  "research.kind.essay": "Essay",
  "research.kind.talk": "Invited talk",
  "research.kind.workshop": "Workshop",
  "research.kind.dataset": "Dataset",

  "research.ecosystem.eyebrow": "Open infrastructure",
  "research.ecosystem.heading.before": "ATProto lexicons for",
  "research.ecosystem.heading.italic": "nature data",
  "research.ecosystem.heading.after": ".",
  "research.ecosystem.subheading":
    "Co-authored with the Hypercerts community and shipped as five reusable layers. Every lexicon, package, and service below is open source and operable end-to-end on your own PDS.",

  "research.models.eyebrow": "Models & datasets",
  "research.models.heading.before": "Open models,",
  "research.models.heading.italic": "open datasets",
  "research.models.heading.after": ".",
  "research.models.subheading":
    "Every artefact behind the papers above is downloadable today. Trained weights and datasets on HuggingFace, benchmark suites and field pipelines on GitHub, and the assistant on community-owned PDS infrastructure.",

  "research.workshop.eyebrow": "Workshop papers",
  "research.workshop.heading.before": "A six-year run at",
  "research.workshop.heading.italic": "Climate Change AI",
  "research.workshop.heading.after": ".",
  "research.workshop.subheading":
    "GainForest's research arc traced through six accepted proposals at the Tackling Climate Change with Machine Learning workshops; from the founding GainForest paper at ICML 2019 to ForestBench at NeurIPS 2022.",

  "research.closing.eyebrow": "The frame",
  "research.closing.heading.before": "The theoretical frame;",
  "research.closing.heading.italic": "regenerative intelligence",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "How the papers, datasets, and protocols above fit one frame: AI as a tool for repairing the commons, governed by the people closest to the land.",
  "research.closing.essay": "Read the essay",
  "research.closing.contact": "Collaborate with us",
};

// ── Español ─────────────────────────────────────────────────────────
const ES: ResearchMessages = {
  "research.eyebrow": "Investigación",
  "research.live.label": "En vivo",
  "research.hero.heading.before": "{Modelos abiertos} para la",
  "research.hero.heading.italic": "biodiversidad",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "Artículos revisados por pares en NeurIPS, IEEE Field Robotics y AAAI. Lexicones ATProto abiertos. Una pila Hypersphere autoalojable. Construido con socios de primera línea; de uso libre.",
  "research.hero.kpi1.value": "4",
  "research.hero.kpi1.label": "artículos revisados por pares en NeurIPS, IEEE y AAAI",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "lexicones, conjuntos de datos y servicios abiertos",
  "research.hero.kpi3.value": "",
  "research.hero.kpi3.label":
    "registros de biodiversidad Darwin Core indexados en ATProto",

  "research.publications.eyebrow": "Publicaciones",
  "research.publications.heading":
    "Artículos, conjuntos de datos y escritos seleccionados.",
  "research.publications.scroll": "Desliza para ver",
  "research.publications.abstract": "Resumen",
  "research.kind.paper": "Artículo",
  "research.kind.essay": "Ensayo",
  "research.kind.talk": "Charla invitada",
  "research.kind.workshop": "Taller",
  "research.kind.dataset": "Conjunto de datos",

  "research.ecosystem.eyebrow": "Infraestructura abierta",
  "research.ecosystem.heading.before": "Lexicones ATProto para",
  "research.ecosystem.heading.italic": "datos de la naturaleza",
  "research.ecosystem.heading.after": ".",
  "research.ecosystem.subheading":
    "Co-escritos con la comunidad Hypercerts y publicados como cinco capas reutilizables. Cada lexicón, paquete y servicio aquí abajo es de código abierto y operable de extremo a extremo en tu propio PDS.",

  "research.models.eyebrow": "Modelos y conjuntos de datos",
  "research.models.heading.before": "Modelos abiertos,",
  "research.models.heading.italic": "datos abiertos",
  "research.models.heading.after": ".",
  "research.models.subheading":
    "Cada artefacto detrás de los artículos anteriores se puede descargar hoy. Pesos entrenados y conjuntos de datos en HuggingFace, suites de benchmark y pipelines de campo en GitHub, y la asistente en infraestructura PDS de propiedad comunitaria.",

  "research.workshop.eyebrow": "Artículos de taller",
  "research.workshop.heading.before": "Seis años en",
  "research.workshop.heading.italic": "Climate Change AI",
  "research.workshop.heading.after": ".",
  "research.workshop.subheading":
    "El arco de investigación de GainForest a través de seis propuestas aceptadas en los talleres Tackling Climate Change with Machine Learning; desde el artículo fundador en ICML 2019 hasta ForestBench en NeurIPS 2022.",

  "research.closing.eyebrow": "El marco",
  "research.closing.heading.before": "El marco teórico;",
  "research.closing.heading.italic": "inteligencia regenerativa",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "Cómo encajan los artículos, conjuntos de datos y protocolos anteriores en un mismo marco: la IA como herramienta para reparar los bienes comunes, gobernada por quienes están más cerca de la tierra.",
  "research.closing.essay": "Leer el ensayo",
  "research.closing.contact": "Colaborar con nosotros",
};

// ── Português ───────────────────────────────────────────────────────
const PT: ResearchMessages = {
  "research.eyebrow": "Pesquisa",
  "research.live.label": "Ao vivo",
  "research.hero.heading.before": "{Modelos abertos} para a",
  "research.hero.heading.italic": "biodiversidade",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "Artigos revistos por pares no NeurIPS, IEEE Field Robotics e AAAI. Léxicons ATProto abertos. Uma stack Hypersphere auto-hospedável. Construído com parceiros de base; de uso livre.",
  "research.hero.kpi1.value": "4",
  "research.hero.kpi1.label": "artigos revistos por pares no NeurIPS, IEEE e AAAI",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "léxicons, conjuntos de dados e serviços abertos",
  "research.hero.kpi3.value": "",
  "research.hero.kpi3.label":
    "registos de biodiversidade Darwin Core indexados no ATProto",

  "research.publications.eyebrow": "Publicações",
  "research.publications.heading":
    "Artigos, conjuntos de dados e escritos selecionados.",
  "research.publications.scroll": "Deslize para ver",
  "research.publications.abstract": "Resumo",
  "research.kind.paper": "Artigo",
  "research.kind.essay": "Ensaio",
  "research.kind.talk": "Palestra convidada",
  "research.kind.workshop": "Workshop",
  "research.kind.dataset": "Conjunto de dados",

  "research.ecosystem.eyebrow": "Infraestrutura aberta",
  "research.ecosystem.heading.before": "Léxicons ATProto para",
  "research.ecosystem.heading.italic": "dados da natureza",
  "research.ecosystem.heading.after": ".",
  "research.ecosystem.subheading":
    "Co-escritos com a comunidade Hypercerts e publicados como cinco camadas reutilizáveis. Cada léxicon, pacote e serviço abaixo é open source e operável de ponta a ponta no teu próprio PDS.",

  "research.models.eyebrow": "Modelos e conjuntos de dados",
  "research.models.heading.before": "Modelos abertos,",
  "research.models.heading.italic": "dados abertos",
  "research.models.heading.after": ".",
  "research.models.subheading":
    "Cada artefacto por trás dos artigos acima está disponível para download hoje. Pesos treinados e datasets no HuggingFace, suites de benchmark e pipelines de campo no GitHub, e a assistente em infraestrutura PDS de propriedade comunitária.",

  "research.workshop.eyebrow": "Artigos de workshop",
  "research.workshop.heading.before": "Seis anos no",
  "research.workshop.heading.italic": "Climate Change AI",
  "research.workshop.heading.after": ".",
  "research.workshop.subheading":
    "O arco de pesquisa da GainForest através de seis propostas aceitas nos workshops Tackling Climate Change with Machine Learning; do artigo fundador no ICML 2019 ao ForestBench no NeurIPS 2022.",

  "research.closing.eyebrow": "O quadro",
  "research.closing.heading.before": "O quadro teórico;",
  "research.closing.heading.italic": "inteligência regenerativa",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "Como os artigos, conjuntos de dados e protocolos acima encaixam num só quadro: a IA como ferramenta para reparar os bens comuns, governada por quem está mais próximo da terra.",
  "research.closing.essay": "Ler o ensaio",
  "research.closing.contact": "Colaborar conosco",
};

// ── Kiswahili ───────────────────────────────────────────────────────
const SW: ResearchMessages = {
  "research.eyebrow": "Utafiti",
  "research.live.label": "Moja kwa moja",
  "research.hero.heading.before": "{Mifano wazi} kwa",
  "research.hero.heading.italic": "bayoanuwai",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "Makala zilizopitiwa na wenzao kwenye NeurIPS, IEEE Field Robotics, na AAAI. Lexicons wazi za ATProto. Stack ya Hypersphere inayoweza kujihifadhi. Imejengwa pamoja na washirika wa mstari wa mbele; ya matumizi ya bure.",
  "research.hero.kpi1.value": "4",
  "research.hero.kpi1.label": "makala zilizopitiwa na wenzao katika NeurIPS, IEEE na AAAI",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "lexicons, seti za data, na huduma wazi",
  "research.hero.kpi3.value": "",
  "research.hero.kpi3.label":
    "rekodi za bayoanuwai za Darwin Core zilizoorodheshwa kwenye ATProto",

  "research.publications.eyebrow": "Machapisho",
  "research.publications.heading":
    "Makala, seti za data, na maandishi yaliyochaguliwa.",
  "research.publications.scroll": "Buruta kupita",
  "research.publications.abstract": "Muhtasari",
  "research.kind.paper": "Makala",
  "research.kind.essay": "Insha",
  "research.kind.talk": "Mhadhara wa mwaliko",
  "research.kind.workshop": "Warsha",
  "research.kind.dataset": "Seti ya data",

  "research.ecosystem.eyebrow": "Miundombinu wazi",
  "research.ecosystem.heading.before": "Lexicons za ATProto kwa",
  "research.ecosystem.heading.italic": "data ya asili",
  "research.ecosystem.heading.after": ".",
  "research.ecosystem.subheading":
    "Zimeandikwa pamoja na jamii ya Hypercerts na kutolewa kama safu tano zinazoweza kutumika tena. Kila lexicon, paketi, na huduma hapa chini ni ya chanzo wazi na inafanya kazi kuanzia mwanzo hadi mwisho kwenye PDS yako mwenyewe.",

  "research.models.eyebrow": "Mifano na seti za data",
  "research.models.heading.before": "Mifano wazi,",
  "research.models.heading.italic": "data wazi",
  "research.models.heading.after": ".",
  "research.models.subheading":
    "Kila kifaa nyuma ya makala hapo juu kinaweza kupakuliwa leo. Uzito uliofunzwa na seti za data kwenye HuggingFace, mikusanyiko ya benchmark na mabomba ya nyanjani kwenye GitHub, na msaidizi kwenye miundombinu ya PDS inayomilikiwa na jamii.",

  "research.workshop.eyebrow": "Makala za warsha",
  "research.workshop.heading.before": "Miaka sita katika",
  "research.workshop.heading.italic": "Climate Change AI",
  "research.workshop.heading.after": ".",
  "research.workshop.subheading":
    "Safari ya utafiti ya GainForest kupitia mapendekezo sita yaliyokubaliwa katika warsha za Tackling Climate Change with Machine Learning; kuanzia karatasi ya msingi katika ICML 2019 hadi ForestBench katika NeurIPS 2022.",

  "research.closing.eyebrow": "Fremu",
  "research.closing.heading.before": "Fremu ya kinadharia;",
  "research.closing.heading.italic": "akili ya kuzaa upya",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "Jinsi makala, seti za data, na itifaki hapo juu zinavyofaa katika fremu moja: AI kama zana ya kurekebisha rasilimali za pamoja, ikitawaliwa na wale walio karibu zaidi na ardhi.",
  "research.closing.essay": "Soma insha",
  "research.closing.contact": "Shirikiana nasi",
};

// ── Bahasa Indonesia ────────────────────────────────────────────────
const ID: ResearchMessages = {
  "research.eyebrow": "Riset",
  "research.live.label": "Langsung",
  "research.hero.heading.before": "{Model terbuka} untuk",
  "research.hero.heading.italic": "keanekaragaman hayati",
  "research.hero.heading.after": ".",
  "research.hero.lede":
    "Makalah peer-review di NeurIPS, IEEE Field Robotics, dan AAAI. Leksikon ATProto terbuka. Stack Hypersphere yang dapat dihosting sendiri. Dibangun bersama mitra garis depan; bebas digunakan.",
  "research.hero.kpi1.value": "4",
  "research.hero.kpi1.label": "makalah peer-review di NeurIPS, IEEE, dan AAAI",
  "research.hero.kpi2.value": "5",
  "research.hero.kpi2.label": "leksikon, dataset, dan layanan terbuka",
  "research.hero.kpi3.value": "",
  "research.hero.kpi3.label":
    "rekam keanekaragaman hayati Darwin Core terindeks di ATProto",

  "research.publications.eyebrow": "Publikasi",
  "research.publications.heading":
    "Makalah, dataset, dan tulisan pilihan.",
  "research.publications.scroll": "Geser untuk melihat",
  "research.publications.abstract": "Abstrak",
  "research.kind.paper": "Makalah",
  "research.kind.essay": "Esai",
  "research.kind.talk": "Ceramah undangan",
  "research.kind.workshop": "Lokakarya",
  "research.kind.dataset": "Dataset",

  "research.ecosystem.eyebrow": "Infrastruktur terbuka",
  "research.ecosystem.heading.before": "Leksikon ATProto untuk",
  "research.ecosystem.heading.italic": "data alam",
  "research.ecosystem.heading.after": ".",
  "research.ecosystem.subheading":
    "Ditulis bersama komunitas Hypercerts dan dirilis sebagai lima lapisan yang dapat dipakai ulang. Setiap leksikon, paket, dan layanan di bawah ini bersifat open source dan dapat dijalankan dari ujung ke ujung di PDS milikmu sendiri.",

  "research.models.eyebrow": "Model & dataset",
  "research.models.heading.before": "Model terbuka,",
  "research.models.heading.italic": "data terbuka",
  "research.models.heading.after": ".",
  "research.models.subheading":
    "Setiap artefak di balik makalah-makalah di atas dapat diunduh hari ini. Bobot terlatih dan dataset di HuggingFace, suite benchmark dan pipeline lapangan di GitHub, serta asistennya di infrastruktur PDS milik komunitas.",

  "research.workshop.eyebrow": "Makalah lokakarya",
  "research.workshop.heading.before": "Enam tahun di",
  "research.workshop.heading.italic": "Climate Change AI",
  "research.workshop.heading.after": ".",
  "research.workshop.subheading":
    "Alur riset GainForest melalui enam proposal yang diterima di lokakarya Tackling Climate Change with Machine Learning; dari makalah pendiri di ICML 2019 hingga ForestBench di NeurIPS 2022.",

  "research.closing.eyebrow": "Kerangka",
  "research.closing.heading.before": "Kerangka teoretiknya;",
  "research.closing.heading.italic": "kecerdasan regeneratif",
  "research.closing.heading.after": ".",
  "research.closing.body":
    "Bagaimana makalah, dataset, dan protokol di atas masuk dalam satu kerangka: AI sebagai alat untuk memperbaiki sumber daya bersama, dikelola oleh mereka yang paling dekat dengan tanah.",
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
