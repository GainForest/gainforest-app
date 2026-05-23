// Static, hand-curated content for the /research page.
//
// Two datasets:
//   • PUBLICATIONS     – carousel of papers / datasets / essays / talks.
//                        Every entry points at a real, freely-readable
//                        source (publisher page, arXiv, YouTube).
//   • ECOSYSTEM_PILLARS – the open ATProto + Hypercerts layers
//                        GainForest co-develops upstream.
//
// Translation model is the same `Translated<T>` pattern used in
// `app/about/_data.ts`: EN is the source of truth; non-EN locales
// provide partial overrides on the same object so a steward editing
// a paper's summary sees all five locales side by side.
//
// Voice is technical on purpose. Summaries name methods, baselines,
// venues, and protocol surfaces; readers are ML researchers and
// ATProto developers, not landing-page visitors.

import type { Locale } from "../_lib/i18n";

type LocaleOverride<T> = Partial<Record<Exclude<Locale, "en">, Partial<T>>>;
export type Translated<T> = T & { i18n?: LocaleOverride<T> };

export function pickLocale<T extends object>(
  entry: Translated<T>,
  locale: Locale,
): T {
  if (locale === "en") return entry;
  const override = entry.i18n?.[locale];
  if (!override) return entry;
  return { ...entry, ...override } as T;
}

// ── Publications ────────────────────────────────────────────────────
// Each item is a real, freely-readable artefact. The `href` is the
// canonical destination (publisher page, arXiv abstract, YouTube
// recording, or essay URL).
//
// Keep summary to one sentence with concrete technical detail (method,
// dataset size, baselines, venue) so the carousel reads as an
// academic ref list rather than a marketing strip.
//
// We deliberately omit publication thumbnails — paper PDFs don't have
// cover art, and fabricating illustration would break AGENTS.md
// hard-rule #1 ("no fake data on the landing page"). The carousel
// renders text-only cards with a Garamond year + venue plate instead.
export type PublicationKind =
  | "paper"
  | "essay"
  | "talk"
  | "workshop"
  | "dataset";

export type Publication = {
  slug: string;
  kind: PublicationKind;
  /** Year shown big in the card chrome. */
  year: string;
  /** Venue / publisher label under the title (e.g. "NeurIPS 2023"). */
  venue: string;
  title: string;
  /** Authors as a single string; truncated visually if too long. */
  authors: string;
  summary: string;
  href: string;
};

export const PUBLICATIONS: ReadonlyArray<Translated<Publication>> = [
  {
    slug: "regenerative-intelligence",
    kind: "essay",
    year: "2026",
    venue: "daviddao.org",
    title: "Governing the Commons in the Intelligent Age",
    authors: "David Dao",
    summary:
      "From Hardin to Ostrom to AI agents; design principles for sociotechnical systems that preserve human agency, build digital trust, and scale commons governance with ML in the loop.",
    href: "https://www.daviddao.org/posts/regenerative-intelligence/",
    i18n: {
      es: {
        summary:
          "De Hardin a Ostrom a los agentes de IA; principios de diseño para sistemas sociotécnicos que preservan la agencia humana, construyen confianza digital y escalan la gobernanza de los bienes comunes con ML en el bucle.",
      },
      pt: {
        summary:
          "De Hardin a Ostrom a agentes de IA; princípios de design para sistemas sociotécnicos que preservam a agência humana, constroem confiança digital e escalam a governança dos bens comuns com ML no loop.",
      },
      sw: {
        summary:
          "Kutoka Hardin hadi Ostrom hadi mawakala wa AI; kanuni za muundo wa mifumo ya kijamii-kiteknolojia inayolinda uwezo wa binadamu, kujenga imani ya kidijitali, na kupanua utawala wa rasilimali za pamoja na ML ndani ya mzunguko.",
      },
      id: {
        summary:
          "Dari Hardin ke Ostrom ke agen AI; prinsip desain untuk sistem sosioteknis yang menjaga agensi manusia, membangun kepercayaan digital, dan memperluas tata kelola sumber daya bersama dengan ML di dalam loop.",
      },
    },
  },
  {
    slug: "biodivx",
    kind: "paper",
    year: "2025",
    venue: "IEEE Trans. on Field Robotics",
    title:
      "Autonomous Aerial-Aquatic Rapid Biodiversity Assessment in the Amazon",
    authors: "ETH BiodivX with GainForest",
    summary:
      "Autonomous aerial and aquatic drones, vision-language models, environmental DNA, and bioacoustic classifiers chained into a 24-hour biodiversity assessment pipeline; full XPRIZE Rainforest field methodology.",
    href: "https://ieeexplore.ieee.org/document/10976628",
    i18n: {
      es: {
        summary:
          "Drones autónomos aéreos y acuáticos, modelos de visión-lenguaje, ADN ambiental y clasificadores bioacústicos encadenados en un pipeline de evaluación de biodiversidad en 24 horas; metodología completa de campo del XPRIZE Rainforest.",
      },
      pt: {
        summary:
          "Drones autónomos aéreos e aquáticos, modelos visão-linguagem, ADN ambiental e classificadores bioacústicos encadeados num pipeline de avaliação de biodiversidade em 24 horas; metodologia completa de campo do XPRIZE Rainforest.",
      },
      sw: {
        summary:
          "Ndege zisizo na rubani za angani na za majini, mifano ya vision-language, DNA ya mazingira, na vikadiriaji vya bioacoustic vimeunganishwa katika bomba la tathmini ya bayoanuwai ya saa 24; mbinu kamili ya nyanjani ya XPRIZE Rainforest.",
      },
      id: {
        summary:
          "Drone otonom udara dan akuatik, model vision-language, DNA lingkungan, dan klasifikator bioakustik dirangkai menjadi pipeline asesmen keanekaragaman hayati 24 jam; metodologi lapangan penuh XPRIZE Rainforest.",
      },
    },
  },
  {
    slug: "oam-tcd",
    kind: "dataset",
    year: "2024",
    venue: "NeurIPS 2024",
    title:
      "OAM-TCD: A Globally Diverse Dataset of High-Resolution Tree Cover Maps",
    authors: "Veitch-Michaelis, Dao, et al.",
    summary:
      "280,000+ instance annotations of individual tree crowns from OpenAerialMap imagery; Mask2Former and SegFormer baselines released alongside the dataset for instance and semantic segmentation.",
    href: "https://arxiv.org/abs/2407.11743",
    i18n: {
      es: {
        summary:
          "Más de 280.000 anotaciones por instancia de copas individuales sobre imágenes de OpenAerialMap; líneas base Mask2Former y SegFormer publicadas junto al conjunto para segmentación por instancia y semántica.",
      },
      pt: {
        summary:
          "Mais de 280.000 anotações por instância de copas individuais sobre imagens do OpenAerialMap; baselines Mask2Former e SegFormer lançados com o dataset para segmentação por instância e semântica.",
      },
      sw: {
        summary:
          "Zaidi ya maelezo 280,000 ya kichanga cha kila mti kutoka picha za OpenAerialMap; vipimo vya Mask2Former na SegFormer vilivyotolewa pamoja na seti kwa ugawaji wa instance na semantic.",
      },
      id: {
        summary:
          "280.000+ anotasi instance untuk tajuk pohon individu dari citra OpenAerialMap; baseline Mask2Former dan SegFormer dirilis bersama dataset untuk segmentasi instance dan semantik.",
      },
    },
  },
  {
    slug: "neurips-talk-2023",
    kind: "talk",
    year: "2023",
    venue: "NeurIPS 2023",
    title: "Collaborative Machine Learning for the Natural World",
    authors: "David Dao",
    summary:
      "Invited NeurIPS workshop talk on community-in-the-loop ML pipelines for biodiversity; field data flows from Ecuador, Brazil, and the Philippines, and how attribution rewards make those pipelines durable.",
    href: "https://neurips.cc/virtual/2023/workshop/66524",
    i18n: {
      es: {
        summary:
          "Charla invitada en un taller de NeurIPS sobre pipelines de ML con la comunidad en el bucle para biodiversidad; flujos de datos de campo en Ecuador, Brasil y Filipinas, y cómo las recompensas de atribución sostienen esos pipelines.",
      },
      pt: {
        summary:
          "Palestra convidada num workshop do NeurIPS sobre pipelines de ML com a comunidade no loop para biodiversidade; fluxos de dados de campo no Equador, Brasil e Filipinas, e como recompensas de atribuição sustentam esses pipelines.",
      },
      sw: {
        summary:
          "Mhadhara wa mwaliko katika warsha ya NeurIPS kuhusu mabomba ya ML yenye jamii ndani ya mzunguko kwa bayoanuwai; mtiririko wa data za nyanjani kutoka Ekuador, Brazili, na Ufilipino, na jinsi tuzo za sifa zinavyodumisha mabomba hayo.",
      },
      id: {
        summary:
          "Ceramah undangan di lokakarya NeurIPS tentang pipeline ML dengan komunitas di dalam loop untuk keanekaragaman hayati; alur data lapangan dari Ekuador, Brasil, dan Filipina, serta bagaimana atribusi membuat pipeline itu bertahan.",
      },
    },
  },
  {
    slug: "geo-bench",
    kind: "paper",
    year: "2023",
    venue: "NeurIPS 2023",
    title:
      "GEO-Bench: Toward Foundation Models for Earth Monitoring",
    authors: "Lacoste, Dao, et al.",
    summary:
      "Six classification and six segmentation tasks across six remote-sensing modalities; standard pretrain / fine-tune protocol and a leaderboard for evaluating Earth-observation foundation models.",
    href: "https://arxiv.org/abs/2306.03831",
    i18n: {
      es: {
        summary:
          "Seis tareas de clasificación y seis de segmentación en seis modalidades de teledetección; protocolo estándar de preentrenamiento y fine-tuning más una tabla de líderes para evaluar foundation models de observación de la Tierra.",
      },
      pt: {
        summary:
          "Seis tarefas de classificação e seis de segmentação em seis modalidades de sensoriamento remoto; protocolo padrão de pré-treino e fine-tuning mais um leaderboard para avaliar foundation models de observação da Terra.",
      },
      sw: {
        summary:
          "Kazi sita za uainishaji na sita za ugawaji katika njia sita za kuhisi kwa mbali; itifaki ya kawaida ya pretrain na fine-tune pamoja na leaderboard ya kutathmini foundation models za uchunguzi wa Dunia.",
      },
      id: {
        summary:
          "Enam tugas klasifikasi dan enam segmentasi pada enam modalitas penginderaan jauh; protokol pretrain / fine-tune standar plus leaderboard untuk mengevaluasi foundation model observasi Bumi.",
      },
    },
  },
  {
    slug: "mbzuai-talk-2023",
    kind: "talk",
    year: "2023",
    venue: "MBZUAI",
    title: "GainForest: AI and Web3 for the Climate Frontline",
    authors: "David Dao",
    summary:
      "Research seminar at MBZUAI covering ReforesTree, deep-learning baselines for forest carbon stock, smart-contract payouts to steward addresses, and the move toward ATProto-anchored proof-of-impact records.",
    href: "https://www.youtube.com/watch?v=gkKqFyHNM10",
    i18n: {
      es: {
        summary:
          "Seminario de investigación en MBZUAI que recorre ReforesTree, líneas base de deep learning para stocks de carbono forestal, pagos por contrato inteligente a direcciones de guardianes y la transición hacia registros de prueba de impacto anclados en ATProto.",
      },
      pt: {
        summary:
          "Seminário de pesquisa na MBZUAI cobrindo o ReforesTree, baselines em deep learning para stocks de carbono florestal, pagamentos via smart contract a endereços de guardiões e a transição para registos de prova de impacto ancorados em ATProto.",
      },
      sw: {
        summary:
          "Semina ya utafiti MBZUAI inayoangazia ReforesTree, vipimo vya deep learning kwa stoki ya kaboni ya msitu, malipo ya mkataba mahiri kwa anwani za walinzi, na uhamiaji kwenye rekodi za uthibitisho wa athari zilizoshikiliwa na ATProto.",
      },
      id: {
        summary:
          "Seminar riset di MBZUAI yang mencakup ReforesTree, baseline deep learning untuk cadangan karbon hutan, pembayaran smart contract ke alamat penjaga, dan peralihan ke rekam bukti dampak yang ditambatkan di ATProto.",
      },
    },
  },
  {
    slug: "reforestree",
    kind: "workshop",
    year: "2022",
    venue: "AAAI Workshop",
    title:
      "ReforesTree: A Dataset for Estimating Tropical Forest Carbon Stock",
    authors: "Reiersen, Dao, et al.",
    summary:
      "Drone photogrammetry across six agroforestry sites in Ecuador with per-tree carbon-stock annotations; CNN regression baselines released openly and later reused in Earth-observation foundation-model evaluations.",
    href: "https://arxiv.org/abs/2201.11192",
    i18n: {
      es: {
        summary:
          "Fotogrametría con dron en seis sitios agroforestales de Ecuador con anotaciones de stock de carbono por árbol; líneas base de regresión con CNN publicadas abiertamente y reutilizadas en evaluaciones posteriores de foundation models de observación de la Tierra.",
      },
      pt: {
        summary:
          "Fotogrametria com drone em seis locais agroflorestais no Equador com anotações de stock de carbono por árvore; baselines de regressão com CNN publicadas abertamente e reutilizadas em avaliações posteriores de foundation models de observação da Terra.",
      },
      sw: {
        summary:
          "Picha za drone katika maeneo sita ya kilimo cha misitu nchini Ekuador zenye maelezo ya stoki ya kaboni kwa kila mti; vipimo vya regression vya CNN vimechapishwa wazi na kutumika tena katika tathmini za baadaye za foundation models za uchunguzi wa Dunia.",
      },
      id: {
        summary:
          "Fotogrametri drone di enam lokasi agroforestri di Ekuador dengan anotasi cadangan karbon per pohon; baseline regresi CNN dirilis terbuka dan kemudian digunakan ulang dalam evaluasi foundation model observasi Bumi.",
      },
    },
  },
  {
    slug: "decentralized-sustainability",
    kind: "essay",
    year: "2018",
    venue: "Medium",
    title:
      "Decentralized Sustainability: Beyond the Tragedy of the Commons with Smart Contracts and AI",
    authors: "David Dao",
    summary:
      "The founding essay; satellite-driven forest-loss prediction wired to a smart-contract escrow paying steward addresses directly, demoed at the 2017 UN Climate Change Hackathon.",
    href: "https://daviddao.medium.com/decentralized-sustainability-9a53223d3001",
    i18n: {
      es: {
        summary:
          "El ensayo fundacional; predicción de pérdida forestal con datos satelitales conectada a un depósito en contrato inteligente que paga directamente a direcciones de guardianes, demostrado en el Hackathon Climático de la ONU de 2017.",
      },
      pt: {
        summary:
          "O ensaio fundador; previsão de perda florestal a partir de satélite ligada a um escrow em smart contract que paga diretamente a endereços de guardiões, demonstrado no Hackathon Climático da ONU de 2017.",
      },
      sw: {
        summary:
          "Insha ya msingi; utabiri wa upotezaji wa msitu kwa kutumia setilaiti uliounganishwa na escrow ya mkataba mahiri inayolipa moja kwa moja anwani za walinzi, ulioonyeshwa kwenye Hackathon ya Mabadiliko ya Hali ya Hewa ya UN ya 2017.",
      },
      id: {
        summary:
          "Esai pendiri; prediksi kehilangan hutan berbasis satelit yang terhubung ke escrow smart contract yang langsung membayar alamat penjaga, didemokan di UN Climate Change Hackathon 2017.",
      },
    },
  },
];

// ── Open infrastructure / lexicon pillars ───────────────────────────
// Each pillar is one open-source layer GainForest has contributed
// upstream to the ATProto + Hypercerts ecosystem. The href points to
// the canonical entry point (GitHub repo, lexicon registry, or
// running deployment) wherever one exists.
//
// Voice: technical. We name protocol surfaces (firehose, DPoP,
// com.atproto.label.*, DID → PDS → blob CID) on purpose; readers are
// ATProto developers and the page should let them recognise what
// each layer plugs into.
export type EcosystemPillar = {
  id: string;
  /** Short label, e.g. "Hyperindex". */
  name: string;
  /** Half-sentence subtitle in italic, e.g. "the indexer". */
  role: string;
  body: string;
  href?: string;
};

export const ECOSYSTEM_PILLARS: ReadonlyArray<Translated<EcosystemPillar>> = [
  {
    id: "lexicons",
    name: "org.hypercerts.* lexicons",
    role: "the schema",
    body: "Co-authored ATProto lexicons describing impact claims, evidence collections, and verification labels as portable signed records on any PDS, validated against shared JSON schemas.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "el esquema",
        body: "Lexicones ATProto co-escritos que describen reclamaciones de impacto, colecciones de evidencia y etiquetas de verificación como registros portátiles y firmados en cualquier PDS, validados contra esquemas JSON compartidos.",
      },
      pt: {
        role: "o esquema",
        body: "Léxicons ATProto co-escritos que descrevem reivindicações de impacto, coleções de evidência e labels de verificação como registos portáteis e assinados em qualquer PDS, validados contra esquemas JSON partilhados.",
      },
      sw: {
        role: "muundo",
        body: "Lexicons za ATProto zilizoandikwa kwa pamoja zinazoelezea madai ya athari, makusanyo ya ushahidi, na lebo za uthibitisho kama rekodi zinazoweza kubebwa na zilizotiwa saini kwenye PDS yoyote, zikithibitishwa dhidi ya skema za JSON za pamoja.",
      },
      id: {
        role: "skemanya",
        body: "Leksikon ATProto yang ditulis bersama untuk mendeskripsikan klaim dampak, koleksi bukti, dan label verifikasi sebagai rekam portabel bertanda tangan di PDS mana pun, divalidasi terhadap skema JSON bersama.",
      },
    },
  },
  {
    id: "pds",
    name: "Hypersphere PDS",
    role: "the data home",
    body: "Self-hostable atproto-pds deployment tuned for community use; OAuth with DPoP, blob storage on S3-compatible buckets, and one-command provisioning so a steward can own every record signed against their DID.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "el hogar de datos",
        body: "Despliegue de atproto-pds autoalojable, ajustado para uso comunitario; OAuth con DPoP, almacenamiento de blobs en buckets compatibles con S3 y aprovisionamiento con un solo comando para que cada guardián posea cada registro firmado contra su DID.",
      },
      pt: {
        role: "a casa dos dados",
        body: "Implantação atproto-pds auto-hospedável, ajustada para uso comunitário; OAuth com DPoP, armazenamento de blobs em buckets compatíveis com S3 e provisionamento por um único comando para que cada guardião possua cada registo assinado contra o seu DID.",
      },
      sw: {
        role: "nyumba ya data",
        body: "Usimbaji wa atproto-pds unaoweza kujihifadhi, uliorekebishwa kwa matumizi ya jamii; OAuth na DPoP, hifadhi ya blob kwenye ndoo zinazokubaliana na S3, na uanzishaji kwa amri moja ili mlinzi amiliki kila rekodi iliyotiwa saini dhidi ya DID yake.",
      },
      id: {
        role: "rumah data",
        body: "Deployment atproto-pds yang dapat dihosting sendiri, disetel untuk pemakaian komunitas; OAuth dengan DPoP, penyimpanan blob di bucket kompatibel-S3, dan provisi satu perintah agar penjaga memiliki setiap rekam yang ditandatangani terhadap DID-nya.",
      },
    },
  },
  {
    id: "hyperindex",
    name: "Hyperindex",
    role: "the indexer",
    body: "ATProto firehose subscriber that crawls org.hypercerts.* records across the network, normalises them into Postgres, and exposes the result through a typed GraphQL schema every downstream tool can query.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "el indexador",
        body: "Suscriptor del firehose de ATProto que rastrea registros org.hypercerts.* en toda la red, los normaliza en Postgres y expone el resultado a través de un esquema GraphQL tipado que cualquier herramienta puede consultar.",
      },
      pt: {
        role: "o indexador",
        body: "Subscritor do firehose ATProto que percorre registos org.hypercerts.* em toda a rede, normaliza-os em Postgres e expõe o resultado através de um schema GraphQL tipado que qualquer ferramenta pode consultar.",
      },
      sw: {
        role: "kifaa cha kuorodhesha",
        body: "Msajili wa firehose ya ATProto unaopitia rekodi za org.hypercerts.* katika mtandao mzima, unazirekebisha katika Postgres, na unawasilisha matokeo kupitia skema ya GraphQL yenye aina ambayo zana yoyote inaweza kuuliza.",
      },
      id: {
        role: "pengindeks",
        body: "Pelanggan firehose ATProto yang merayapi rekam org.hypercerts.* di seluruh jaringan, menormalisasi ke Postgres, dan memaparkan hasilnya lewat skema GraphQL bertipe yang dapat dikueri alat apa pun.",
      },
    },
  },
  {
    id: "hyperlabel",
    name: "Hyperlabel",
    role: "the trust layer",
    body: "Labeller service emitting com.atproto.label.* records over Hypercert claims; tier signals (high-quality, verified, contested) feed Bumicerts and any compatible consumer the same way Bluesky labels feed downstream feeds.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "la capa de confianza",
        body: "Servicio etiquetador que emite registros com.atproto.label.* sobre reclamaciones Hypercert; señales por niveles (alta calidad, verificado, en disputa) alimentan los Bumicerts y cualquier consumidor compatible, igual que las etiquetas de Bluesky alimentan los feeds.",
      },
      pt: {
        role: "a camada de confiança",
        body: "Serviço etiquetador que emite registos com.atproto.label.* sobre reivindicações Hypercert; sinais por níveis (alta qualidade, verificado, contestado) alimentam Bumicerts e qualquer consumidor compatível, tal como labels do Bluesky alimentam feeds.",
      },
      sw: {
        role: "safu ya imani",
        body: "Huduma ya kuweka lebo inayotoa rekodi za com.atproto.label.* juu ya madai ya Hypercert; ishara za viwango (ubora wa juu, iliyothibitishwa, iliyo na pingamizi) zinalisha Bumicerts na mtumiaji yeyote anayekubaliana, kama lebo za Bluesky zinavyolisha feeds.",
      },
      id: {
        role: "lapisan kepercayaan",
        body: "Layanan pelabel yang memancarkan rekam com.atproto.label.* di atas klaim Hypercert; sinyal berjenjang (kualitas tinggi, terverifikasi, dipersengketakan) memberi makan Bumicerts dan konsumen kompatibel mana pun, seperti label Bluesky memberi makan feed.",
      },
    },
  },
  {
    id: "hyperscan",
    name: "Hyperscan",
    role: "the explorer",
    body: "Web explorer for org.hypercerts.* records; resolves DID → PDS → blob CID and renders the full evidence trail behind any Bumicert, like a block explorer for community claims.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "el explorador",
        body: "Explorador web para registros org.hypercerts.*; resuelve DID → PDS → blob CID y muestra el rastro completo de evidencia detrás de cualquier Bumicert, como un block explorer para reclamaciones comunitarias.",
      },
      pt: {
        role: "o explorador",
        body: "Explorador web para registos org.hypercerts.*; resolve DID → PDS → blob CID e renderiza a trilha completa de evidência por trás de qualquer Bumicert, como um block explorer para reivindicações comunitárias.",
      },
      sw: {
        role: "kichunguzi",
        body: "Kichunguzi cha wavuti kwa rekodi za org.hypercerts.*; hutatua DID → PDS → blob CID na huonyesha njia kamili ya ushahidi nyuma ya Bumicert yoyote, kama block explorer wa madai ya jamii.",
      },
      id: {
        role: "penjelajah",
        body: "Penjelajah web untuk rekam org.hypercerts.*; menyelesaikan DID → PDS → blob CID dan menampilkan jejak bukti lengkap di balik setiap Bumicert, seperti block explorer untuk klaim komunitas.",
      },
    },
  },
];

// ── ML models, datasets, and pipelines ─────────────────────────────
// Companion grid to ECOSYSTEM_PILLARS, focused on the open ML
// artefacts behind the papers in the carousel. Each row points at a
// real, downloadable destination (HuggingFace dataset card, GitHub
// repo, or arXiv abstract when a canonical code release is not
// public). Same shape as EcosystemPillar so the renderer is a single
// component family.
//
// `channel` is the short "HuggingFace" / "GitHub" / "arXiv" label
// that surfaces next to the name, the way the ATProto section uses
// `role`. It tells an ML reader where the artefact actually lives.
export type MlArtefact = {
  id: string;
  /** Short label, e.g. "ReforesTree". */
  name: string;
  /** Channel label in italic, e.g. "on arXiv". */
  channel: string;
  body: string;
  href?: string;
};

export const ML_ARTEFACTS: ReadonlyArray<Translated<MlArtefact>> = [
  {
    id: "oam-tcd",
    name: "OAM-TCD",
    channel: "on HuggingFace",
    body: "280,000+ instance annotations of individual tree crowns over OpenAerialMap imagery, plus Mask2Former and SegFormer baselines fine-tuned for instance and semantic segmentation; dataset and weights both released.",
    href: "https://huggingface.co/restor/tcd-mask2former-r50",
    i18n: {
      es: {
        channel: "en HuggingFace",
        body: "Más de 280.000 anotaciones por instancia de copas individuales sobre imágenes de OpenAerialMap, junto con líneas base Mask2Former y SegFormer afinadas para segmentación por instancia y semántica; conjunto y pesos publicados.",
      },
      pt: {
        channel: "no HuggingFace",
        body: "Mais de 280.000 anotações por instância de copas individuais sobre imagens do OpenAerialMap, com baselines Mask2Former e SegFormer afinados para segmentação por instância e semântica; dataset e pesos publicados.",
      },
      sw: {
        channel: "kwenye HuggingFace",
        body: "Zaidi ya maelezo 280,000 ya kichanga cha kila mti kutoka picha za OpenAerialMap, pamoja na vipimo vya Mask2Former na SegFormer vilivyolinganishwa kwa ugawaji wa instance na semantic; seti na uzito vimetolewa.",
      },
      id: {
        channel: "di HuggingFace",
        body: "280.000+ anotasi instance untuk tajuk pohon individu dari citra OpenAerialMap, plus baseline Mask2Former dan SegFormer yang di-fine-tune untuk segmentasi instance dan semantik; dataset dan bobotnya sama-sama dirilis.",
      },
    },
  },
  {
    id: "geo-bench",
    name: "Geo-Bench",
    channel: "on GitHub",
    body: "Community benchmark suite for Earth-observation foundation models; six classification and six segmentation tasks across six remote-sensing modalities, with a shared pretrain / fine-tune protocol and leaderboard.",
    href: "https://github.com/ServiceNow/geo-bench",
    i18n: {
      es: {
        channel: "en GitHub",
        body: "Suite comunitaria de benchmark para foundation models de observación de la Tierra; seis tareas de clasificación y seis de segmentación en seis modalidades de teledetección, con un protocolo común de preentrenamiento y fine-tuning más leaderboard.",
      },
      pt: {
        channel: "no GitHub",
        body: "Suite comunitária de benchmark para foundation models de observação da Terra; seis tarefas de classificação e seis de segmentação em seis modalidades de sensoriamento remoto, com um protocolo partilhado de pré-treino e fine-tuning mais leaderboard.",
      },
      sw: {
        channel: "kwenye GitHub",
        body: "Mkusanyiko wa benchmark wa jamii kwa foundation models za uchunguzi wa Dunia; kazi sita za uainishaji na sita za ugawaji katika njia sita za kuhisi kwa mbali, na itifaki ya pamoja ya pretrain na fine-tune pamoja na leaderboard.",
      },
      id: {
        channel: "di GitHub",
        body: "Suite benchmark komunitas untuk foundation model observasi Bumi; enam tugas klasifikasi dan enam segmentasi pada enam modalitas penginderaan jauh, dengan protokol pretrain / fine-tune bersama plus leaderboard.",
      },
    },
  },
  {
    id: "reforestree",
    name: "ReforesTree",
    channel: "on arXiv",
    body: "Drone photogrammetry across six agroforestry sites in Ecuador with per-tree carbon-stock annotations and CNN regression baselines; reused as a downstream task in later Earth-observation foundation-model evaluations.",
    href: "https://arxiv.org/abs/2201.11192",
    i18n: {
      es: {
        channel: "en arXiv",
        body: "Fotogrametría con dron en seis sitios agroforestales de Ecuador con anotaciones de stock de carbono por árbol y líneas base de regresión con CNN; reutilizado como tarea downstream en evaluaciones posteriores de foundation models de observación de la Tierra.",
      },
      pt: {
        channel: "no arXiv",
        body: "Fotogrametria com drone em seis locais agroflorestais no Equador com anotações de stock de carbono por árvore e baselines de regressão com CNN; reutilizado como tarefa downstream em avaliações posteriores de foundation models de observação da Terra.",
      },
      sw: {
        channel: "kwenye arXiv",
        body: "Picha za drone katika maeneo sita ya kilimo cha misitu Ekuador zenye maelezo ya stoki ya kaboni kwa kila mti na vipimo vya regression vya CNN; imetumika tena kama kazi ya downstream katika tathmini za baadaye za foundation models za uchunguzi wa Dunia.",
      },
      id: {
        channel: "di arXiv",
        body: "Fotogrametri drone di enam lokasi agroforestri di Ekuador dengan anotasi cadangan karbon per pohon dan baseline regresi CNN; digunakan ulang sebagai tugas downstream dalam evaluasi foundation model observasi Bumi berikutnya.",
      },
    },
  },
  {
    id: "biodivx-agents",
    name: "BiodivX agents",
    channel: "in IEEE T-FR",
    body: "Multi-modal field pipeline behind the XPRIZE Rainforest win: autonomous aerial and aquatic drones, vision-language agents, bioacoustic classifiers, and on-site environmental DNA sequencing chained into a 24-hour biodiversity assessment.",
    href: "https://ieeexplore.ieee.org/document/10976628",
    i18n: {
      es: {
        channel: "en IEEE T-FR",
        body: "Pipeline de campo multimodal detrás del triunfo en el XPRIZE Rainforest: drones autónomos aéreos y acuáticos, agentes visión-lenguaje, clasificadores bioacústicos y secuenciación de ADN ambiental in situ encadenados en una evaluación de biodiversidad de 24 horas.",
      },
      pt: {
        channel: "na IEEE T-FR",
        body: "Pipeline de campo multimodal por trás da vitória no XPRIZE Rainforest: drones autónomos aéreos e aquáticos, agentes visão-linguagem, classificadores bioacústicos e sequenciamento de ADN ambiental in situ encadeados numa avaliação de biodiversidade de 24 horas.",
      },
      sw: {
        channel: "katika IEEE T-FR",
        body: "Bomba la nyanjani la multi-modal nyuma ya ushindi wa XPRIZE Rainforest: ndege zisizo na rubani za angani na za majini, mawakala wa vision-language, vikadiriaji vya bioacoustic, na upangaji wa DNA ya mazingira papo hapo vimeunganishwa katika tathmini ya bayoanuwai ya saa 24.",
      },
      id: {
        channel: "di IEEE T-FR",
        body: "Pipeline lapangan multi-modal di balik kemenangan XPRIZE Rainforest: drone otonom udara dan akuatik, agen vision-language, klasifikator bioakustik, dan sekuensing DNA lingkungan langsung di lokasi dirangkai menjadi asesmen keanekaragaman hayati 24 jam.",
      },
    },
  },
  {
    id: "taina",
    name: "Taina",
    channel: "on PDS + Telegram",
    body: "Community-owned multilingual LLM assistant co-designed with Indigenous and local communities around Manaus; memory and contributions are stored as signed records on the contributor's own PDS rather than a vendor's database.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        channel: "en PDS + Telegram",
        body: "Asistente LLM multilingüe de propiedad comunitaria, co-diseñado con comunidades indígenas y locales alrededor de Manaos; la memoria y las contribuciones se guardan como registros firmados en el PDS de quien aporta y no en la base de datos de un proveedor.",
      },
      pt: {
        channel: "em PDS + Telegram",
        body: "Assistente LLM multilingue de propriedade comunitária, co-desenhado com comunidades indígenas e locais em torno de Manaus; a memória e as contribuições são guardadas como registos assinados no PDS de quem contribui e não na base de dados de um fornecedor.",
      },
      sw: {
        channel: "kwenye PDS + Telegram",
        body: "Msaidizi wa LLM wa lugha nyingi anayemilikiwa na jamii, aliyebuniwa pamoja na jamii za Asili na za eneo karibu na Manaus; kumbukumbu na michango huhifadhiwa kama rekodi zilizotiwa saini kwenye PDS ya mchangiaji badala ya hifadhidata ya muuzaji.",
      },
      id: {
        channel: "di PDS + Telegram",
        body: "Asisten LLM multibahasa milik komunitas, dirancang bersama komunitas Adat dan lokal di sekitar Manaus; memori dan kontribusi disimpan sebagai rekam bertanda tangan di PDS milik kontributor, bukan di basis data vendor.",
      },
    },
  },
];

// ── Climate Change AI workshop bibliography ───────────────────────────
// Companion list to the main publications carousel, scoped to
// papers accepted at the Tackling Climate Change with Machine
// Learning (CCAI) workshops at NeurIPS / ICML / ICLR. Together
// these six entries trace GainForest's research arc from the
// founding 2019 proposal through ForestBench 2022; they sit on the
// /research page as a compact academic bibliography rather than as
// carousel cards (the carousel headline is 'Selected', and surfacing
// the full CCAI run there would dilute that signal).
//
// Authors fields keep the en-dash-free latin-name spelling the way
// the CCAI paper pages list them, including diacritics ("Lütjens").
// `award` mirrors what each paper carries on its CCAI page; we don't
// invent recognitions that aren't there.
export type WorkshopPaper = {
  slug: string;
  year: string;
  /** Venue label like "NeurIPS CCAI" or "ICML CCAI". */
  venue: string;
  title: string;
  authors: string;
  /** Optional CCAI recognition ("Spotlight", "Best Proposal Award"); rendered as a small primary-tinted chip if present. */
  award?: string;
  href: string;
};

export const WORKSHOP_PAPERS: ReadonlyArray<WorkshopPaper> = [
  {
    slug: "forestbench",
    year: "2022",
    venue: "NeurIPS CCAI",
    title:
      "ForestBench: Equitable Benchmarks for Monitoring, Reporting, and Verification of Nature-Based Solutions with Machine Learning",
    authors:
      "Newman, Exposito-Alonso, Czech, Dao, Lütjens, Gillespie, Hao, Cottam",
    href: "https://www.climatechange.ai/papers/neurips2022/107",
  },
  {
    slug: "overestimation-forest-carbon",
    year: "2021",
    venue: "ICML CCAI",
    title:
      "Tackling the Overestimation of Forest Carbon with Deep Learning and Aerial Imagery",
    authors: "Reiersen, Dao, Lütjens, Klemmer, Zhu, Zhang",
    award: "Spotlight",
    href: "https://www.climatechange.ai/papers/icml2021/79",
  },
  {
    slug: "xingu",
    year: "2020",
    venue: "ICLR CCAI",
    title:
      "Xingu: Explaining Critical Geospatial Predictions in Weak Supervision for Climate Finance",
    authors: "Dao, Rausch, Zhang, Rott",
    href: "https://www.climatechange.ai/papers/iclr2020/25",
  },
  {
    slug: "truebranch",
    year: "2020",
    venue: "ICLR CCAI",
    title:
      "TrueBranch: Metric Learning-based Verification of Forest Conservation Projects",
    authors: "Santamaria, Dao, Lütjens, Zhang",
    award: "Best Proposal Award",
    href: "https://www.climatechange.ai/papers/iclr2020/23",
  },
  {
    slug: "geolabels",
    year: "2019",
    venue: "NeurIPS CCAI",
    title:
      "GeoLabels: Towards Efficient Ecosystem Monitoring using Data Programming on Geospatial Information",
    authors: "Dao, Rausch, Zhang",
    href: "https://www.climatechange.ai/papers/neurips2019/51",
  },
  {
    slug: "gainforest-2019",
    year: "2019",
    venue: "ICML CCAI",
    title:
      "GainForest: Scaling Climate Finance for Forest Conservation using Interpretable Machine Learning on Satellite Imagery",
    authors:
      "Dao, Cang, Fung, Zhang, Pawlowski, Gonzales, Beglinger, Liu Zhang",
    href: "https://www.climatechange.ai/papers/icml2019/36",
  },
];

// ── External destinations linked from the research page ────────────
export const EXTERNAL = {
  essay: "https://www.daviddao.org/posts/regenerative-intelligence/",
  email: "team@gainforest.net",
  scholar: "https://scholar.google.com/citations?user=qg-c7VgAAAAJ",
  github: "https://github.com/GainForest",
} as const;
