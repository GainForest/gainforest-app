// Scoped i18n for the /explorer page.
//
// Mirrors the pattern used by app/about/_messages.ts and
// app/research/_messages.ts ; a small, self-contained Messages type
// plus one block per locale. Keeping explorer copy here (instead of
// expanding app/_lib/i18n.ts) lets us iterate the page's editorial
// voice without churning every landing string.
//
// Voice on /explorer is data-first ; the page is two live carousels
// of real ATProto records (Bumicerts + Darwin Core occurrences) so
// the surrounding copy stays out of the way and lets the records
// breathe. The wall is honest about what it's showing ; it samples
// the latest image-bearing records rather than the full collection,
// and the right rail labels say so.

import type { Locale } from "../_lib/i18n";

type ExplorerMessages = {
  // Top crumb / hero
  "explorer.eyebrow": string;
  "explorer.live.label": string;
  /** `{phrase}` markers the brushed underline word. */
  "explorer.hero.heading.before": string;
  "explorer.hero.heading.italic": string;
  "explorer.hero.heading.after": string;
  "explorer.hero.lede": string;
  /** Stat triplet captions. Values stream live, labels render below. */
  "explorer.hero.kpi1.label": string;
  "explorer.hero.kpi2.label": string;
  "explorer.hero.kpi3.label": string;

  // Bumicerts marquee
  "explorer.bumicerts.eyebrow": string;
  "explorer.bumicerts.heading.before": string;
  "explorer.bumicerts.heading.italic": string;
  "explorer.bumicerts.heading.after": string;
  "explorer.bumicerts.lede": string;
  "explorer.bumicerts.cta": string;
  "explorer.bumicerts.hint": string;
  "explorer.bumicerts.empty": string;

  // Specimen wall (Darwin Core)
  "explorer.specimens.eyebrow": string;
  "explorer.specimens.heading.before": string;
  "explorer.specimens.heading.italic": string;
  "explorer.specimens.heading.after": string;
  "explorer.specimens.lede": string;
  "explorer.specimens.hint": string;
  /** Status line shown under the wall while the client-side walk is
   *  in progress. `{loaded}` is the running count of resolved
   *  records, `{target}` is the requested target. */
  "explorer.specimens.loading": string;
  "explorer.specimens.unidentified": string;
  "explorer.specimens.taxa": string;
  /** Right-rail line that clarifies the wall is a sample, not the
   *  full collection. `{sample}` is replaced with the in-browser
   *  record count. */
  "explorer.specimens.acrossRecent": string;
  /** Right-rail line that names the global indexer collection.
   *  `{total}` is replaced with the formatted totalCount. */
  "explorer.specimens.indexedTotal": string;
  "explorer.specimens.empty": string;
};

// ── English ─────────────────────────────────────────────────────────
const EN: ExplorerMessages = {
  "explorer.eyebrow": "Explorer",
  "explorer.live.label": "Live",
  "explorer.hero.heading.before": "Browse the {living} data",
  "explorer.hero.heading.italic": "commons",
  "explorer.hero.heading.after": ".",
  "explorer.hero.lede":
    "Two live data streams from the GainForest indexer. The top band lists the latest high-quality Bumicerts; signed certificates of community fieldwork published on ATProto. The bottom band samples the latest Darwin Core species observations the indexer has ingested. Hover either band to pause it.",
  "explorer.hero.kpi1.label": "Bumicerts on ATProto",
  "explorer.hero.kpi2.label": "Darwin Core observations indexed",
  "explorer.hero.kpi3.label": "frontline communities, live on Green Globe",

  "explorer.bumicerts.eyebrow": "Streaming live",
  "explorer.bumicerts.heading.before": "Freshly minted",
  "explorer.bumicerts.heading.italic": "Bumicerts",
  "explorer.bumicerts.heading.after": ".",
  "explorer.bumicerts.lede":
    "A Bumicert is a signed, portable certificate of community fieldwork; photos, audio, GPS, and field notes bundled into a single record on ATProto. Each card below is one Bumicert, issued by a community on their own data server.",
  "explorer.bumicerts.cta": "View all on certs.gainforest.app",
  "explorer.bumicerts.hint": "Hover the band to pause",
  "explorer.bumicerts.empty": "No live Bumicerts available right now.",

  "explorer.specimens.eyebrow": "Darwin Core observations",
  "explorer.specimens.heading.before": "Every species,",
  "explorer.specimens.heading.italic": "one record at a time",
  "explorer.specimens.heading.after": ".",
  "explorer.specimens.lede":
    "Each card below is one Darwin Core species observation indexed on ATProto; scientific name, GPS, date, photograph. Together they form the open biodiversity layer of the GainForest data commons.",
  "explorer.specimens.hint": "Hover the band to pause",
  "explorer.specimens.loading":
    "Streaming {loaded} of {target} records from the indexer…",
  "explorer.specimens.unidentified": "Unidentified",
  "explorer.specimens.taxa": "unique taxa",
  "explorer.specimens.acrossRecent":
    "across the {sample} most-recent image-bearing records",
  "explorer.specimens.indexedTotal":
    "{total} indexed in app.gainforest.dwc.occurrence",
  "explorer.specimens.empty": "No species observations available right now.",
};

// ── Español ─────────────────────────────────────────────────────────
const ES: ExplorerMessages = {
  "explorer.eyebrow": "Explorador",
  "explorer.live.label": "En vivo",
  "explorer.hero.heading.before": "Recorre los bienes",
  "explorer.hero.heading.italic": "comunes vivos",
  "explorer.hero.heading.after": ".",
  "explorer.hero.lede":
    "Dos flujos de datos en vivo del indexador GainForest. La banda superior lista los Bumicerts de alta calidad más recientes; certificados firmados de trabajo de campo comunitario publicados en ATProto. La banda inferior muestrea las últimas observaciones de especies Darwin Core que el indexador ha ingerido. Pasa el ratón sobre cualquier banda para pausarla.",
  "explorer.hero.kpi1.label": "Bumicerts en ATProto",
  "explorer.hero.kpi2.label": "observaciones Darwin Core indexadas",
  "explorer.hero.kpi3.label":
    "comunidades de primera línea, en vivo en Green Globe",

  "explorer.bumicerts.eyebrow": "Transmitiendo en vivo",
  "explorer.bumicerts.heading.before": "Bumicerts recién",
  "explorer.bumicerts.heading.italic": "emitidos",
  "explorer.bumicerts.heading.after": ".",
  "explorer.bumicerts.lede":
    "Un Bumicert es un certificado firmado y portátil de trabajo de campo comunitario; fotos, audio, GPS y notas de campo agrupadas en un único registro en ATProto. Cada tarjeta a continuación es un Bumicert emitido por una comunidad en su propio servidor de datos.",
  "explorer.bumicerts.cta": "Ver todo en certs.gainforest.app",
  "explorer.bumicerts.hint": "Pasa el ratón sobre la banda para pausarla",
  "explorer.bumicerts.empty": "No hay Bumicerts en vivo disponibles ahora mismo.",

  "explorer.specimens.eyebrow": "Observaciones Darwin Core",
  "explorer.specimens.heading.before": "Cada especie,",
  "explorer.specimens.heading.italic": "un registro a la vez",
  "explorer.specimens.heading.after": ".",
  "explorer.specimens.lede":
    "Cada tarjeta debajo es una observación de especie Darwin Core indexada en ATProto; nombre científico, GPS, fecha, fotografía. Juntas forman la capa abierta de biodiversidad de los bienes comunes de GainForest.",
  "explorer.specimens.hint": "Pasa el ratón sobre la banda para pausarla",
  "explorer.specimens.loading":
    "Transmitiendo {loaded} de {target} registros desde el indexador…",
  "explorer.specimens.unidentified": "Sin identificar",
  "explorer.specimens.taxa": "taxones únicos",
  "explorer.specimens.acrossRecent":
    "en los {sample} registros con imagen más recientes",
  "explorer.specimens.indexedTotal":
    "{total} indexadas en app.gainforest.dwc.occurrence",
  "explorer.specimens.empty": "No hay observaciones de especies disponibles ahora.",
};

// ── Português ───────────────────────────────────────────────────────
const PT: ExplorerMessages = {
  "explorer.eyebrow": "Explorador",
  "explorer.live.label": "Ao vivo",
  "explorer.hero.heading.before": "Percorre os bens",
  "explorer.hero.heading.italic": "comuns vivos",
  "explorer.hero.heading.after": ".",
  "explorer.hero.lede":
    "Dois fluxos de dados ao vivo do indexador GainForest. A faixa superior lista os Bumicerts de alta qualidade mais recentes; certificados assinados de trabalho de campo comunitário publicados no ATProto. A faixa inferior mostra uma amostra das últimas observações Darwin Core indexadas. Passa o rato sobre qualquer faixa para a pausar.",
  "explorer.hero.kpi1.label": "Bumicerts no ATProto",
  "explorer.hero.kpi2.label": "observações Darwin Core indexadas",
  "explorer.hero.kpi3.label":
    "comunidades de base, ao vivo no Green Globe",

  "explorer.bumicerts.eyebrow": "A transmitir ao vivo",
  "explorer.bumicerts.heading.before": "Bumicerts recém",
  "explorer.bumicerts.heading.italic": "emitidos",
  "explorer.bumicerts.heading.after": ".",
  "explorer.bumicerts.lede":
    "Um Bumicert é um certificado assinado e portátil de trabalho de campo comunitário; fotos, áudio, GPS e notas de campo agrupados num único registo no ATProto. Cada cartão abaixo é um Bumicert emitido por uma comunidade no seu próprio servidor de dados.",
  "explorer.bumicerts.cta": "Ver tudo em certs.gainforest.app",
  "explorer.bumicerts.hint": "Passa o rato sobre a faixa para pausar",
  "explorer.bumicerts.empty": "Sem Bumicerts ao vivo neste momento.",

  "explorer.specimens.eyebrow": "Observações Darwin Core",
  "explorer.specimens.heading.before": "Cada espécie,",
  "explorer.specimens.heading.italic": "um registo de cada vez",
  "explorer.specimens.heading.after": ".",
  "explorer.specimens.lede":
    "Cada cartão abaixo é uma observação Darwin Core indexada no ATProto; nome científico, GPS, data, fotografia. Juntas formam a camada aberta de biodiversidade dos bens comuns da GainForest.",
  "explorer.specimens.hint": "Passa o rato sobre a faixa para pausar",
  "explorer.specimens.loading":
    "A transmitir {loaded} de {target} registos do indexador…",
  "explorer.specimens.unidentified": "Sem identificação",
  "explorer.specimens.taxa": "táxones únicos",
  "explorer.specimens.acrossRecent":
    "nos {sample} registos com imagem mais recentes",
  "explorer.specimens.indexedTotal":
    "{total} indexados em app.gainforest.dwc.occurrence",
  "explorer.specimens.empty": "Sem observações de espécies neste momento.",
};

// ── Kiswahili ───────────────────────────────────────────────────────
const SW: ExplorerMessages = {
  "explorer.eyebrow": "Mchunguzi",
  "explorer.live.label": "Moja kwa moja",
  "explorer.hero.heading.before": "Pitia rasilimali za",
  "explorer.hero.heading.italic": "pamoja zinazoishi",
  "explorer.hero.heading.after": ".",
  "explorer.hero.lede":
    "Mikondo miwili ya data ya moja kwa moja kutoka kwa kihifadhi cha GainForest. Ukanda wa juu unaorodhesha Bumicerts za hivi karibuni za ubora wa juu; vyeti vilivyotiwa saini vya kazi ya uwandani vya jamii vilivyochapishwa kwenye ATProto. Ukanda wa chini unachukua sampuli ya uchunguzi wa hivi karibuni wa spishi za Darwin Core. Weka kishale kwenye ukanda wowote ili kusimamisha.",
  "explorer.hero.kpi1.label": "Bumicerts kwenye ATProto",
  "explorer.hero.kpi2.label": "uchunguzi wa Darwin Core ulioorodheshwa",
  "explorer.hero.kpi3.label":
    "jamii za mstari wa mbele, moja kwa moja kwenye Green Globe",

  "explorer.bumicerts.eyebrow": "Inatangaza moja kwa moja",
  "explorer.bumicerts.heading.before": "Bumicerts mpya",
  "explorer.bumicerts.heading.italic": "kabisa",
  "explorer.bumicerts.heading.after": ".",
  "explorer.bumicerts.lede":
    "Bumicert ni cheti kilichotiwa saini na chenye kubebeka cha kazi ya uwandani ya jamii; picha, sauti, GPS, na maelezo ya uwandani vilivyokusanywa katika rekodi moja kwenye ATProto. Kila kadi hapa chini ni Bumicert iliyotolewa na jamii kwenye seva yao wenyewe ya data.",
  "explorer.bumicerts.cta": "Tazama zote kwenye certs.gainforest.app",
  "explorer.bumicerts.hint": "Weka kishale kwenye ukanda kusimamisha",
  "explorer.bumicerts.empty": "Hakuna Bumicerts za moja kwa moja sasa hivi.",

  "explorer.specimens.eyebrow": "Uchunguzi wa Darwin Core",
  "explorer.specimens.heading.before": "Kila spishi,",
  "explorer.specimens.heading.italic": "rekodi moja kwa wakati",
  "explorer.specimens.heading.after": ".",
  "explorer.specimens.lede":
    "Kila kadi hapa chini ni uchunguzi wa spishi za Darwin Core uliopangwa kwenye ATProto; jina la kisayansi, GPS, tarehe, picha. Pamoja zinaunda safu wazi ya bayoanuwai ya rasilimali za pamoja za GainForest.",
  "explorer.specimens.hint": "Weka kishale kwenye ukanda kusimamisha",
  "explorer.specimens.loading":
    "Inatuma rekodi {loaded} kati ya {target} kutoka kwa kihifadhi…",
  "explorer.specimens.unidentified": "Haijatambuliwa",
  "explorer.specimens.taxa": "taxa za kipekee",
  "explorer.specimens.acrossRecent":
    "katika rekodi {sample} zenye picha za hivi karibuni",
  "explorer.specimens.indexedTotal":
    "{total} zimepangwa katika app.gainforest.dwc.occurrence",
  "explorer.specimens.empty": "Hakuna uchunguzi wa spishi sasa hivi.",
};

// ── Bahasa Indonesia ────────────────────────────────────────────────
const ID: ExplorerMessages = {
  "explorer.eyebrow": "Penjelajah",
  "explorer.live.label": "Langsung",
  "explorer.hero.heading.before": "Jelajahi data bersama",
  "explorer.hero.heading.italic": "yang hidup",
  "explorer.hero.heading.after": ".",
  "explorer.hero.lede":
    "Dua aliran data langsung dari pengindeks GainForest. Pita atas mencantumkan Bumicerts berkualitas tinggi terbaru; sertifikat kerja lapangan komunitas yang ditandatangani dan diterbitkan di ATProto. Pita bawah mengambil sampel observasi spesies Darwin Core terbaru yang diindeks. Arahkan kursor ke salah satu pita untuk menjeda.",
  "explorer.hero.kpi1.label": "Bumicerts di ATProto",
  "explorer.hero.kpi2.label": "observasi Darwin Core terindeks",
  "explorer.hero.kpi3.label":
    "komunitas garis depan, langsung di Green Globe",

  "explorer.bumicerts.eyebrow": "Mengalir langsung",
  "explorer.bumicerts.heading.before": "Bumicerts yang baru",
  "explorer.bumicerts.heading.italic": "diterbitkan",
  "explorer.bumicerts.heading.after": ".",
  "explorer.bumicerts.lede":
    "Bumicert adalah sertifikat kerja lapangan komunitas yang ditandatangani dan portabel; foto, audio, GPS, dan catatan lapangan disatukan dalam satu rekam di ATProto. Setiap kartu di bawah adalah satu Bumicert yang diterbitkan oleh sebuah komunitas di server data mereka sendiri.",
  "explorer.bumicerts.cta": "Lihat semua di certs.gainforest.app",
  "explorer.bumicerts.hint": "Arahkan kursor ke pita untuk menjeda",
  "explorer.bumicerts.empty": "Belum ada Bumicerts langsung saat ini.",

  "explorer.specimens.eyebrow": "Observasi Darwin Core",
  "explorer.specimens.heading.before": "Setiap spesies,",
  "explorer.specimens.heading.italic": "satu rekam sekali waktu",
  "explorer.specimens.heading.after": ".",
  "explorer.specimens.lede":
    "Setiap kartu di bawah adalah satu observasi spesies Darwin Core yang terindeks di ATProto; nama ilmiah, GPS, tanggal, foto. Bersama-sama membentuk lapisan keanekaragaman hayati terbuka dari sumber daya bersama GainForest.",
  "explorer.specimens.hint": "Arahkan kursor ke pita untuk menjeda",
  "explorer.specimens.loading":
    "Mengalirkan {loaded} dari {target} rekam dari pengindeks…",
  "explorer.specimens.unidentified": "Belum diidentifikasi",
  "explorer.specimens.taxa": "taksa unik",
  "explorer.specimens.acrossRecent":
    "dari {sample} rekam dengan gambar terbaru",
  "explorer.specimens.indexedTotal":
    "{total} terindeks di app.gainforest.dwc.occurrence",
  "explorer.specimens.empty": "Belum ada observasi spesies saat ini.",
};

const TABLE: Record<Locale, ExplorerMessages> = {
  en: EN,
  es: ES,
  pt: PT,
  sw: SW,
  id: ID,
};

export type ExplorerKey = keyof ExplorerMessages;

export function getExplorerT(locale: Locale): (key: ExplorerKey) => string {
  return (key) => TABLE[locale][key] ?? EN[key];
}
