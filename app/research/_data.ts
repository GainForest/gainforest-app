// Static, hand-curated content for the /research page.
//
// Three datasets:
//   • TIMELINE         – editorial moments in GainForest's research arc.
//   • PUBLICATIONS     – the carousel of papers / essays / talks. Every
//                        entry points at a real, freely-readable source.
//   • ECOSYSTEM_PILLARS – the open lexicons, packages, and services
//                        GainForest co-develops with the wider ATProto
//                        and Hypercerts communities.
//
// Translation model is the same `Translated<T>` pattern used in
// `app/about/_data.ts`: EN is the source of truth; non-EN locales
// provide partial overrides on the same object so a steward editing
// a paper's summary sees all five locales side by side.

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

// ── Timeline ────────────────────────────────────────────────────────
// One editorial moment per row; each tied to a published research
// artefact where possible. Keep titles ~6 words and bodies one short
// sentence (editorial system rule).
export type TimelineEntry = {
  year: string;
  title: string;
  body: string;
};

export const TIMELINE: ReadonlyArray<Translated<TimelineEntry>> = [
  {
    year: "2017",
    title: "First prototype at the United Nations",
    body: "An AI model predicting deforestation wired to a smart contract that pays forest stewards; the UN Climate Change Hackathon awards it the grand prize.",
    i18n: {
      es: {
        title: "Primer prototipo en las Naciones Unidas",
        body: "Un modelo de IA que predice la deforestación, conectado a un contrato inteligente que paga a quienes protegen los bosques; el Hackathon Climático de la ONU le otorga el gran premio.",
      },
      pt: {
        title: "Primeiro protótipo nas Nações Unidas",
        body: "Um modelo de IA que prevê desmatamento conectado a um contrato inteligente que paga quem protege a floresta; o Hackathon Climático da ONU concede o grande prémio.",
      },
      sw: {
        title: "Mfano wa kwanza katika Umoja wa Mataifa",
        body: "Mfano wa AI unaotabiri ukataji wa miti uliounganishwa na mkataba mahiri unaowalipa walinzi wa misitu; Hackathon ya Mabadiliko ya Hali ya Hewa ya UN inampa tuzo kuu.",
      },
      id: {
        title: "Prototipe pertama di Perserikatan Bangsa-Bangsa",
        body: "Model AI yang memprediksi deforestasi terhubung ke smart contract yang membayar pelindung hutan; UN Climate Change Hackathon memberinya grand prize.",
      },
    },
  },
  {
    year: "2018",
    title: "Decentralized Sustainability, the founding essay",
    body: "Published on Medium: a first sketch of regenerative intelligence; AI plus smart contracts as a way past Hardin's tragedy of the commons.",
    i18n: {
      es: {
        title: "Sostenibilidad descentralizada, el ensayo fundacional",
        body: "Publicado en Medium: un primer boceto de la inteligencia regenerativa; IA junto a contratos inteligentes como vía más allá de la tragedia de los comunes de Hardin.",
      },
      pt: {
        title: "Sustentabilidade descentralizada, o ensaio fundador",
        body: "Publicado no Medium: um primeiro esboço da inteligência regenerativa; IA junto com contratos inteligentes como caminho além da tragédia dos comuns de Hardin.",
      },
      sw: {
        title: "Uendelevu uliogatuliwa, insha ya msingi",
        body: "Imechapishwa Medium: mchoro wa kwanza wa akili ya kuzaa upya; AI pamoja na mikataba mahiri kama njia ya kupita janga la rasilimali za pamoja la Hardin.",
      },
      id: {
        title: "Keberlanjutan terdesentralisasi, esai pendiri",
        body: "Diterbitkan di Medium: sketsa pertama kecerdasan regeneratif; AI bersama smart contract sebagai jalan melampaui tragedi commons milik Hardin.",
      },
    },
  },
  {
    year: "2022",
    title: "ReforesTree: open carbon stock dataset",
    body: "An AAAI workshop paper releases the first open photogrammetric dataset of agroforestry carbon stocks in Ecuador, paired with deep-learning baselines.",
    i18n: {
      es: {
        title: "ReforesTree: conjunto de datos abierto de carbono",
        body: "Un artículo de taller de AAAI publica el primer conjunto fotogramétrico abierto de stocks de carbono en sistemas agroforestales de Ecuador, con líneas base de aprendizaje profundo.",
      },
      pt: {
        title: "ReforesTree: conjunto de dados abertos de carbono",
        body: "Um artigo de workshop da AAAI publica o primeiro conjunto fotogramétrico aberto de stocks de carbono em sistemas agroflorestais no Equador, com baselines em deep learning.",
      },
      sw: {
        title: "ReforesTree: seti wazi ya data ya kaboni",
        body: "Karatasi ya warsha ya AAAI inachapisha seti ya kwanza wazi ya picha za stoki za kaboni katika kilimo cha misitu Ekuador, ikiwa na vipimo vya deep learning.",
      },
      id: {
        title: "ReforesTree: dataset karbon terbuka",
        body: "Makalah workshop AAAI merilis dataset fotogrametri terbuka pertama untuk cadangan karbon agroforestri di Ekuador, lengkap dengan baseline deep learning.",
      },
    },
  },
  {
    year: "2023",
    title: "Geo-Bench at NeurIPS: foundation models for Earth",
    body: "A community benchmark for evaluating Earth-monitoring foundation models lands at NeurIPS 2023; a building block for the rest of our remote-sensing work.",
    i18n: {
      es: {
        title: "Geo-Bench en NeurIPS: modelos fundacionales para la Tierra",
        body: "Un benchmark comunitario para evaluar modelos fundacionales de monitoreo terrestre aterriza en NeurIPS 2023; una pieza fundamental para el resto de nuestro trabajo de teledetección.",
      },
      pt: {
        title: "Geo-Bench no NeurIPS: foundation models para a Terra",
        body: "Um benchmark comunitário para avaliar foundation models de monitoramento terrestre chega ao NeurIPS 2023; uma peça fundamental do nosso trabalho de sensoriamento remoto.",
      },
      sw: {
        title: "Geo-Bench katika NeurIPS: foundation models kwa Dunia",
        body: "Kipimo cha jamii cha kutathmini foundation models za ufuatiliaji wa Dunia kinaingia NeurIPS 2023; msingi wa kazi yetu yote ya kuhisi kwa mbali.",
      },
      id: {
        title: "Geo-Bench di NeurIPS: foundation model untuk Bumi",
        body: "Benchmark komunitas untuk mengevaluasi foundation model pemantauan Bumi tampil di NeurIPS 2023; fondasi untuk seluruh kerja penginderaan jauh kami.",
      },
    },
  },
  {
    year: "2023",
    title: "Co-designing Taina with Indigenous communities",
    body: "First version of the community-owned AI assistant ships on Telegram, built with four Indigenous and local communities around Manaus.",
    i18n: {
      es: {
        title: "Co-diseñando Taina con comunidades indígenas",
        body: "La primera versión de la asistente de IA de propiedad comunitaria se lanza en Telegram, construida con cuatro comunidades indígenas y locales alrededor de Manaos.",
      },
      pt: {
        title: "Co-desenhando a Tainá com comunidades indígenas",
        body: "A primeira versão da assistente de IA de propriedade comunitária é lançada no Telegram, construída com quatro comunidades indígenas e locais em torno de Manaus.",
      },
      sw: {
        title: "Kubuni Taina pamoja na jamii za Asili",
        body: "Toleo la kwanza la msaidizi wa AI anayemilikiwa na jamii linatolewa kwenye Telegram, likijengwa pamoja na jamii nne za Asili na za eneo karibu na Manaus.",
      },
      id: {
        title: "Merancang Taina bersama komunitas Adat",
        body: "Versi pertama asisten AI milik komunitas dirilis di Telegram, dibangun bersama empat komunitas Adat dan lokal di sekitar Manaus.",
      },
    },
  },
  {
    year: "2024",
    title: "OAM-TCD at NeurIPS: open tree-crown delineation",
    body: "A second NeurIPS paper releases an open dataset and instance-segmentation model for individual tree crowns from aerial imagery, trained on 280,000+ annotations.",
    i18n: {
      es: {
        title: "OAM-TCD en NeurIPS: delineación abierta de copas",
        body: "Un segundo artículo en NeurIPS publica un conjunto abierto y un modelo de segmentación por instancias para copas individuales de árboles desde imágenes aéreas, entrenado con más de 280.000 anotaciones.",
      },
      pt: {
        title: "OAM-TCD no NeurIPS: delineamento aberto de copas",
        body: "Um segundo artigo no NeurIPS lança um conjunto aberto e um modelo de segmentação por instâncias para copas individuais a partir de imagens aéreas, treinado com mais de 280.000 anotações.",
      },
      sw: {
        title: "OAM-TCD katika NeurIPS: ugawaji wazi wa kichanga cha mti",
        body: "Karatasi ya pili katika NeurIPS inatoa seti wazi na mfano wa kugawa kichanga cha kila mti kutoka kwa picha za angani, iliyofunzwa na maelezo zaidi ya 280,000.",
      },
      id: {
        title: "OAM-TCD di NeurIPS: delineasi tajuk pohon terbuka",
        body: "Makalah NeurIPS kedua merilis dataset terbuka dan model segmentasi instan untuk tajuk pohon individu dari citra udara, dilatih dengan lebih dari 280.000 anotasi.",
      },
    },
  },
  {
    year: "2024",
    title: "Winning XPRIZE Rainforest in the Amazon",
    body: "GainForest and ETH BiodivX take the Bonus Prize at the XPRIZE Rainforest finals in the Amazon, beating 298 teams; the field campaign becomes the next paper.",
    i18n: {
      es: {
        title: "Ganando el XPRIZE Rainforest en la Amazonía",
        body: "GainForest y ETH BiodivX se llevan el Premio Bono en la final del XPRIZE Rainforest en la Amazonía, superando a 298 equipos; la campaña de campo se convierte en el siguiente artículo.",
      },
      pt: {
        title: "Vencendo o XPRIZE Rainforest na Amazônia",
        body: "GainForest e ETH BiodivX levam o Prémio Bónus na final do XPRIZE Rainforest na Amazônia, batendo 298 equipas; a campanha de campo vira o próximo artigo.",
      },
      sw: {
        title: "Kushinda XPRIZE Rainforest Amazon",
        body: "GainForest na ETH BiodivX wanachukua Tuzo ya Ziada katika fainali za XPRIZE Rainforest Amazon, wakishinda timu 298; kampeni ya nyanjani inakuwa karatasi inayofuata.",
      },
      id: {
        title: "Memenangkan XPRIZE Rainforest di Amazon",
        body: "GainForest dan ETH BiodivX merebut Bonus Prize di final XPRIZE Rainforest Amazon, mengalahkan 298 tim; kampanye lapangan menjadi makalah berikutnya.",
      },
    },
  },
  {
    year: "2025",
    title: "BiodivX paper in IEEE Trans. on Field Robotics",
    body: "The full XPRIZE field methodology is published; autonomous drones, AI agents, and on-site DNA sequencing for rapid biodiversity assessment in the Amazon.",
    i18n: {
      es: {
        title: "Artículo de BiodivX en IEEE Trans. on Field Robotics",
        body: "Se publica la metodología de campo del XPRIZE: drones autónomos, agentes de IA y secuenciación de ADN in situ para evaluación rápida de biodiversidad en la Amazonía.",
      },
      pt: {
        title: "Artigo BiodivX na IEEE Trans. on Field Robotics",
        body: "É publicada a metodologia de campo do XPRIZE: drones autónomos, agentes de IA e sequenciamento de ADN in situ para avaliação rápida da biodiversidade na Amazônia.",
      },
      sw: {
        title: "Karatasi ya BiodivX katika IEEE Trans. on Field Robotics",
        body: "Mbinu kamili ya nyanjani ya XPRIZE inachapishwa; ndege zisizo na rubani, mawakala wa AI, na upangaji wa DNA papo hapo kwa tathmini ya haraka ya bayoanuwai Amazon.",
      },
      id: {
        title: "Makalah BiodivX di IEEE Trans. on Field Robotics",
        body: "Metodologi lapangan penuh XPRIZE diterbitkan; drone otonom, agen AI, dan sekuensing DNA langsung di lokasi untuk asesmen keanekaragaman hayati di Amazon.",
      },
    },
  },
  {
    year: "2026",
    title: "Regenerative Intelligence: the long-form theory",
    body: "David Dao's essay frames the line from Hardin to Ostrom to AI agents; a theory of change that ties every paper, dataset, and protocol into one practice.",
    i18n: {
      es: {
        title: "Inteligencia Regenerativa: la teoría completa",
        body: "El ensayo de David Dao traza la línea de Hardin a Ostrom hasta los agentes de IA; una teoría del cambio que une cada artículo, conjunto de datos y protocolo en una sola práctica.",
      },
      pt: {
        title: "Inteligência Regenerativa: a teoria completa",
        body: "O ensaio de David Dao traça a linha de Hardin a Ostrom até agentes de IA; uma teoria de mudança que une cada artigo, conjunto de dados e protocolo em uma só prática.",
      },
      sw: {
        title: "Akili ya Kuzaa Upya: nadharia kamili",
        body: "Insha ya David Dao inaweka mstari kutoka Hardin hadi Ostrom hadi mawakala wa AI; nadharia ya mabadiliko inayounganisha kila karatasi, seti ya data, na itifaki katika mazoezi moja.",
      },
      id: {
        title: "Regenerative Intelligence: teori lengkap",
        body: "Esai David Dao menarik garis dari Hardin ke Ostrom ke agen AI; teori perubahan yang merangkai setiap makalah, dataset, dan protokol menjadi satu praktik.",
      },
    },
  },
];

// ── Publications ────────────────────────────────────────────────────
// Each item is a real, freely-readable artefact. The `href` is the
// canonical destination (publisher page, arXiv abstract, YouTube
// recording, or essay URL).
//
// Keep summary one sentence so the carousel cards stay editorial.
//
// We deliberately omit publication thumbnails — paper PDFs don't have
// cover art, and fabricating illustration would break AGENTS.md
// hard-rule #1 ("no fake data on the landing page"). The carousel
// renders text-only cards.
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
      "The long-form theory of change behind GainForest; from Hardin and Ostrom to AI agents that scale human cooperation rather than replace it.",
    href: "https://www.daviddao.org/posts/regenerative-intelligence/",
    i18n: {
      es: {
        summary:
          "La teoría completa del cambio detrás de GainForest; de Hardin y Ostrom a agentes de IA que escalan la cooperación humana en lugar de reemplazarla.",
      },
      pt: {
        summary:
          "A teoria completa de mudança por trás da GainForest; de Hardin e Ostrom a agentes de IA que escalam a cooperação humana em vez de a substituírem.",
      },
      sw: {
        summary:
          "Nadharia kamili ya mabadiliko nyuma ya GainForest; kutoka Hardin na Ostrom hadi mawakala wa AI wanaopanua ushirikiano wa binadamu badala ya kuubadilisha.",
      },
      id: {
        summary:
          "Teori perubahan lengkap di balik GainForest; dari Hardin dan Ostrom ke agen AI yang memperluas kerja sama manusia, bukan menggantikannya.",
      },
    },
  },
  {
    slug: "biodivx",
    kind: "paper",
    year: "2025",
    venue: "IEEE Trans. on Field Robotics",
    title:
      "Autonomous Aerial-Aquatic Rapid Biodiversity Assessment with the BiodivX Team",
    authors: "ETH BiodivX & GainForest team",
    summary:
      "The full XPRIZE Rainforest field methodology: autonomous drones, AI agents, and on-site DNA sequencing for 24-hour biodiversity assessment in the Amazon.",
    href: "https://ieeexplore.ieee.org/document/10976628",
    i18n: {
      es: {
        summary:
          "La metodología de campo completa del XPRIZE Rainforest: drones autónomos, agentes de IA y secuenciación de ADN in situ para evaluación de biodiversidad en 24 horas en la Amazonía.",
      },
      pt: {
        summary:
          "A metodologia de campo completa do XPRIZE Rainforest: drones autónomos, agentes de IA e sequenciamento de ADN in situ para avaliação da biodiversidade em 24 horas na Amazônia.",
      },
      sw: {
        summary:
          "Mbinu kamili ya nyanjani ya XPRIZE Rainforest: ndege zisizo na rubani, mawakala wa AI, na upangaji wa DNA papo hapo kwa tathmini ya bayoanuwai ya saa 24 Amazon.",
      },
      id: {
        summary:
          "Metodologi lapangan penuh XPRIZE Rainforest: drone otonom, agen AI, dan sekuensing DNA langsung di lokasi untuk asesmen keanekaragaman hayati 24 jam di Amazon.",
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
      "An open-source aerial-imagery dataset and instance-segmentation model for individual tree crowns, with over 280,000 annotations across diverse biomes.",
    href: "https://arxiv.org/abs/2407.11743",
    i18n: {
      es: {
        summary:
          "Un conjunto open-source de imágenes aéreas y un modelo de segmentación por instancias para copas individuales, con más de 280.000 anotaciones en biomas diversos.",
      },
      pt: {
        summary:
          "Um conjunto open-source de imagens aéreas e um modelo de segmentação por instâncias para copas individuais, com mais de 280.000 anotações em biomas diversos.",
      },
      sw: {
        summary:
          "Seti ya open-source ya picha za angani na mfano wa ugawaji wa kichanga cha mti, ukiwa na maelezo zaidi ya 280,000 katika mazingira mbalimbali.",
      },
      id: {
        summary:
          "Dataset citra udara open-source dan model segmentasi instan untuk tajuk pohon individu, dengan lebih dari 280.000 anotasi di berbagai bioma.",
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
      "Invited talk at NeurIPS 2023; how the GainForest team brings frontline communities into the loop for machine learning that protects biodiversity.",
    href: "https://neurips.cc/virtual/2023/workshop/66524",
    i18n: {
      es: {
        summary:
          "Charla invitada en NeurIPS 2023; cómo el equipo de GainForest integra a las comunidades de primera línea en el aprendizaje automático para proteger la biodiversidad.",
      },
      pt: {
        summary:
          "Palestra convidada no NeurIPS 2023; como a equipa GainForest traz comunidades de base para o loop do aprendizado de máquina que protege a biodiversidade.",
      },
      sw: {
        summary:
          "Mhadhara wa mwaliko NeurIPS 2023; jinsi timu ya GainForest inavyowashirikisha jamii za mstari wa mbele katika ujifunzaji wa mashine unaolinda bayoanuwai.",
      },
      id: {
        summary:
          "Ceramah undangan di NeurIPS 2023; bagaimana tim GainForest melibatkan komunitas garis depan dalam pembelajaran mesin yang melindungi keanekaragaman hayati.",
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
      "A community benchmark suite for evaluating foundation models on Earth-observation tasks; six classification and segmentation datasets, six remote-sensing modalities.",
    href: "https://arxiv.org/abs/2306.03831",
    i18n: {
      es: {
        summary:
          "Un benchmark comunitario para evaluar foundation models en tareas de observación de la Tierra; seis conjuntos de clasificación y segmentación en seis modalidades de teledetección.",
      },
      pt: {
        summary:
          "Um benchmark comunitário para avaliar foundation models em tarefas de observação da Terra; seis conjuntos de classificação e segmentação em seis modalidades de sensoriamento remoto.",
      },
      sw: {
        summary:
          "Kipimo cha jamii cha kutathmini foundation models katika kazi za uchunguzi wa Dunia; seti sita za uainishaji na ugawaji katika njia sita za kuhisi kwa mbali.",
      },
      id: {
        summary:
          "Benchmark komunitas untuk mengevaluasi foundation model pada tugas observasi Bumi; enam dataset klasifikasi dan segmentasi pada enam modalitas penginderaan jauh.",
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
      "Invited research talk at MBZUAI walking through GainForest's AI + decentralized systems stack for community-led conservation.",
    href: "https://www.youtube.com/watch?v=gkKqFyHNM10",
    i18n: {
      es: {
        summary:
          "Charla de investigación invitada en MBZUAI que recorre la pila de IA y sistemas descentralizados de GainForest para la conservación liderada por comunidades.",
      },
      pt: {
        summary:
          "Palestra de pesquisa convidada na MBZUAI que percorre a stack de IA e sistemas descentralizados da GainForest para conservação liderada por comunidades.",
      },
      sw: {
        summary:
          "Mhadhara wa utafiti wa mwaliko MBZUAI unaopita kupitia stack ya AI na mifumo iliyogatuliwa ya GainForest kwa uhifadhi unaoongozwa na jamii.",
      },
      id: {
        summary:
          "Ceramah riset undangan di MBZUAI yang menelusuri stack AI dan sistem terdesentralisasi GainForest untuk konservasi yang dipimpin komunitas.",
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
      "The first open photogrammetric dataset of tropical agroforestry carbon stocks; six sites in Ecuador with paired drone imagery and deep-learning baselines.",
    href: "https://arxiv.org/abs/2201.11192",
    i18n: {
      es: {
        summary:
          "El primer conjunto fotogramétrico abierto de stocks de carbono en agroforestería tropical; seis sitios en Ecuador con imágenes de dron y líneas base de aprendizaje profundo.",
      },
      pt: {
        summary:
          "O primeiro conjunto fotogramétrico aberto de stocks de carbono em agrofloresta tropical; seis locais no Equador com imagens de drone e baselines em deep learning.",
      },
      sw: {
        summary:
          "Seti ya kwanza wazi ya picha za stoki za kaboni katika kilimo cha misitu cha kitropiki; maeneo sita Ekuador yenye picha za drone na vipimo vya deep learning.",
      },
      id: {
        summary:
          "Dataset fotogrametri terbuka pertama untuk cadangan karbon agroforestri tropis; enam lokasi di Ekuador dengan citra drone dan baseline deep learning.",
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
      "The founding essay; first sketch of how AI plus smart contracts can pay forest stewards directly, drawn from the UN Climate Change Hackathon prototype.",
    href: "https://daviddao.medium.com/decentralized-sustainability-9a53223d3001",
    i18n: {
      es: {
        summary:
          "El ensayo fundacional; primer boceto de cómo la IA junto a los contratos inteligentes pueden pagar directamente a quienes protegen los bosques, a partir del prototipo del Hackathon Climático de la ONU.",
      },
      pt: {
        summary:
          "O ensaio fundador; primeiro esboço de como IA junto a contratos inteligentes pode pagar diretamente a quem protege a floresta, a partir do protótipo do Hackathon Climático da ONU.",
      },
      sw: {
        summary:
          "Insha ya msingi; mchoro wa kwanza wa jinsi AI pamoja na mikataba mahiri vinavyoweza kulipa walinzi wa misitu moja kwa moja, kuanzia mfano wa Hackathon ya Mabadiliko ya Hali ya Hewa ya UN.",
      },
      id: {
        summary:
          "Esai pendiri; sketsa pertama bagaimana AI bersama smart contract dapat membayar pelindung hutan secara langsung, diambil dari prototipe UN Climate Change Hackathon.",
      },
    },
  },
];

// ── Open infrastructure / lexicon pillars ───────────────────────────
// Each pillar is one open-source layer GainForest has contributed
// upstream to the ATProto + Hypercerts ecosystem. The href points to
// the canonical entry point (GitHub repo, lexicon registry, or
// running deployment) wherever one exists.
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
    body: "ATProto lexicons co-authored with the Hypercerts community to describe claims, evidence, and impact records as portable, signed data on PDS infrastructure.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "el esquema",
        body: "Lexicones de ATProto co-escritos con la comunidad Hypercerts para describir reclamaciones, evidencia y registros de impacto como datos portátiles y firmados en infraestructura PDS.",
      },
      pt: {
        role: "o esquema",
        body: "Léxicons ATProto co-escritos com a comunidade Hypercerts para descrever reivindicações, evidência e registos de impacto como dados portáteis e assinados em infraestrutura PDS.",
      },
      sw: {
        role: "muundo",
        body: "Lexicons za ATProto zilizoandikwa kwa pamoja na jamii ya Hypercerts kuelezea madai, ushahidi na rekodi za athari kama data inayoweza kubebwa na iliyotiwa saini kwenye miundombinu ya PDS.",
      },
      id: {
        role: "skemanya",
        body: "Leksikon ATProto yang ditulis bersama komunitas Hypercerts untuk mendeskripsikan klaim, bukti, dan rekam dampak sebagai data portabel bertanda tangan di infrastruktur PDS.",
      },
    },
  },
  {
    id: "pds",
    name: "Hypersphere PDS",
    role: "the data home",
    body: "Self-hostable Personal Data Server that lets communities own every photo, audio file, and field note signed into their Bumicerts, with no central custodian.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "el hogar de datos",
        body: "Servidor de Datos Personales autoalojable que permite a las comunidades ser dueñas de cada foto, audio y nota de campo firmada en sus Bumicerts, sin custodia centralizada.",
      },
      pt: {
        role: "a casa dos dados",
        body: "Personal Data Server auto-hospedado que permite às comunidades possuir cada foto, áudio e nota de campo assinada nos seus Bumicerts, sem custódia central.",
      },
      sw: {
        role: "nyumba ya data",
        body: "Personal Data Server inayoweza kujihifadhi ambayo huruhusu jamii kumiliki kila picha, sauti, na maelezo ya nyanjani yaliyotiwa saini katika Bumicerts zao, bila mhifadhi mkuu.",
      },
      id: {
        role: "rumah data",
        body: "Personal Data Server yang dapat dihosting sendiri sehingga komunitas memiliki setiap foto, audio, dan catatan lapangan yang ditandatangani dalam Bumicerts mereka, tanpa kustodian pusat.",
      },
    },
  },
  {
    id: "hyperindex",
    name: "Hyperindex",
    role: "the indexer",
    body: "Open-source ATProto indexer that crawls org.hypercerts.* records across PDS instances and exposes them through a GraphQL surface every downstream tool can query.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "el indexador",
        body: "Indexador ATProto open-source que rastrea los registros org.hypercerts.* en las instancias PDS y los expone a través de una capa GraphQL que cualquier herramienta puede consultar.",
      },
      pt: {
        role: "o indexador",
        body: "Indexador ATProto open-source que percorre os registos org.hypercerts.* nas instâncias PDS e os expõe através de uma camada GraphQL que qualquer ferramenta pode consultar.",
      },
      sw: {
        role: "kifaa cha kuorodhesha",
        body: "Indexer wazi wa ATProto unaopitia rekodi za org.hypercerts.* katika mifano ya PDS na kuziwasilisha kupitia safu ya GraphQL ambayo zana yoyote inayoifuatia inaweza kuuliza.",
      },
      id: {
        role: "pengindeks",
        body: "Indexer ATProto open-source yang merayapi rekam org.hypercerts.* di instans PDS dan memaparkannya lewat lapisan GraphQL yang dapat dikueri oleh alat mana pun.",
      },
    },
  },
  {
    id: "hyperlabel",
    name: "Hyperlabel",
    role: "the trust layer",
    body: "Community-run labelling service that surfaces tier-graded Bumicerts (high-quality, verified, contested), the same way ATProto labels surface trust signals on Bluesky.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "la capa de confianza",
        body: "Servicio comunitario de etiquetado que muestra Bumicerts por niveles (alta calidad, verificado, en disputa), igual que las etiquetas de ATProto en Bluesky.",
      },
      pt: {
        role: "a camada de confiança",
        body: "Serviço de etiquetagem operado pela comunidade que expõe Bumicerts por níveis (alta qualidade, verificado, contestado), tal como os labels do ATProto no Bluesky.",
      },
      sw: {
        role: "safu ya imani",
        body: "Huduma ya kuweka lebo inayoendeshwa na jamii inayoonyesha Bumicerts kwa viwango (ubora wa juu, iliyothibitishwa, iliyo na pingamizi), kama vile lebo za ATProto kwenye Bluesky.",
      },
      id: {
        role: "lapisan kepercayaan",
        body: "Layanan pelabelan yang dijalankan komunitas yang menampilkan Bumicerts berjenjang (kualitas tinggi, terverifikasi, dipersengketakan), seperti label ATProto di Bluesky.",
      },
    },
  },
  {
    id: "hyperscan",
    name: "Hyperscan",
    role: "the explorer",
    body: "Open block-explorer style viewer for org.hypercerts.* records; auditors, journalists, and stewards can read the full evidence trail behind any Bumicert.",
    href: "https://github.com/GainForest",
    i18n: {
      es: {
        role: "el explorador",
        body: "Visor estilo block-explorer abierto para registros org.hypercerts.*; auditoras, periodistas y guardianas pueden leer la cadena completa de evidencia detrás de cualquier Bumicert.",
      },
      pt: {
        role: "o explorador",
        body: "Visor estilo block-explorer aberto para registos org.hypercerts.*; auditores, jornalistas e guardiões podem ler a cadeia completa de evidência por trás de qualquer Bumicert.",
      },
      sw: {
        role: "kichunguzi",
        body: "Mtazamaji wa wazi wa mtindo wa block-explorer kwa rekodi za org.hypercerts.*; wakaguzi, waandishi wa habari, na walinzi wanaweza kusoma njia kamili ya ushahidi nyuma ya Bumicert yoyote.",
      },
      id: {
        role: "penjelajah",
        body: "Penampil terbuka bergaya block-explorer untuk rekam org.hypercerts.*; auditor, jurnalis, dan penjaga dapat membaca seluruh jejak bukti di balik setiap Bumicert.",
      },
    },
  },
];

// ── External destinations linked from the research page ────────────
export const EXTERNAL = {
  essay: "https://www.daviddao.org/posts/regenerative-intelligence/",
  email: "team@gainforest.net",
  scholar:
    "https://scholar.google.com/citations?user=qg-c7VgAAAAJ",
  github: "https://github.com/GainForest",
} as const;
