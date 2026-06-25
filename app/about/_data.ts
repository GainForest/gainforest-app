// Static, hand-curated content for the /about page.
//
// Team data: collected from public sources (LinkedIn, daviddao.org,
// gainforest.earth, Ethereum Next Billion Fellowship announcement,
// Global Landscapes Forum speaker page, GainForest Substack). Roles
// reflect what each person publicly attributes to themselves; if you
// see something out of date, update here in the same PR.
//
// Timeline data: distilled from the 3rd Annual Impact Report (24/25)
// and David's regenerative-intelligence essay. Keep this terse; the
// body copy of each item is a single sentence per editorial rule.
//
// I18n model: each translatable record (TimelineEntry, TeamMember) is
// stored as `Translated<T>` — the base shape is the English source of
// truth, plus an optional `i18n` record mapping non-EN locales to
// partial overrides. `pickLocale(entry, locale)` returns the merged
// view at render time. We do this inline rather than splitting into a
// separate translations module so a steward editing a bio in one
// place sees all five locales next to each other.

import type { Locale } from "../_lib/i18n";

type LocaleOverride<T> = Partial<Record<Exclude<Locale, "en">, Partial<T>>>;
export type Translated<T> = T & { i18n?: LocaleOverride<T> };

/** Merge the locale-specific override (if any) on top of the EN base. */
export function pickLocale<T extends object>(
  entry: Translated<T>,
  locale: Locale,
): T {
  if (locale === "en") return entry;
  const override = entry.i18n?.[locale];
  if (!override) return entry;
  return { ...entry, ...override } as T;
}

export type TeamMember = {
  name: string;
  role: string;
  /** "Switzerland", "Brazil", "Malaysia", "Philippines"… */
  location?: string;
  /** Optional one-line bio. */
  bio?: string;
  /** Optional headshot path under /public. We deliberately don't
   *  fabricate photos — the text-only card design is the default and
   *  remains crisp when no photo is provided. */
  photo?: string;
};

// Team cards are intentionally NOT linked. Per team direction, the
// page should not route a visitor off to a personal LinkedIn / GitHub
// / X profile when they hover or click a team member — the about page
// reads as a single editorial surface, not a directory of social
// handles. If we later want to restore links, add `href?: string` back
// to TeamMember and reintroduce the <Link> wrap in <AboutTeam />.


export const COFOUNDERS: ReadonlyArray<Translated<TeamMember>> = [
  {
    name: "David Dao",
    role: "Co-founder & Chief Scientist",
    location: "Switzerland",
    bio: "Pioneer in data valuation for machine learning with a PhD in AI Systems from ETH Zurich. XPRIZE Rainforest winner working at the frontier of AI and decentralized systems.",
    photo: "/team/david-dao.webp",
    i18n: {
      es: {
        role: "Cofundador y Científico Jefe",
        location: "Suiza",
        bio: "Pionero en valoración de datos para aprendizaje automático, con doctorado en Sistemas de IA por ETH Zürich. Ganador del XPRIZE Rainforest, trabaja en la frontera entre IA y sistemas descentralizados.",
      },
      pt: {
        role: "Cofundador e Cientista-chefe",
        location: "Suíça",
        bio: "Pioneiro em valoração de dados para aprendizado de máquina, com doutorado em Sistemas de IA pela ETH Zurique. Vencedor do XPRIZE Rainforest, trabalha na fronteira entre IA e sistemas descentralizados.",
      },
      sw: {
        role: "Mwanzilishi mwenza na Mwanasayansi Mkuu",
        location: "Uswisi",
        bio: "Mwanzilishi wa thamani ya data kwa ujifunzaji wa mashine, mwenye PhD ya Mifumo ya AI kutoka ETH Zürich. Mshindi wa XPRIZE Rainforest, anafanya kazi mpakani mwa AI na mifumo iliyogatuliwa.",
      },
      id: {
        role: "Pendiri bersama & Ilmuwan Utama",
        location: "Swiss",
        bio: "Pelopor penilaian data untuk pembelajaran mesin dengan PhD Sistem AI dari ETH Zürich. Pemenang XPRIZE Rainforest yang bekerja di perbatasan AI dan sistem terdesentralisasi.",
      },
    },
  },
  {
    name: "Sharfina \"Sharfy\" Adamantine",
    role: "Co-founder & CTO",
    location: "France",
    bio: "Connects climate finance to local conservation through hypercerts and on-chain data systems. Ethereum Next Billion Fellow and XPRIZE Rainforest winner.",
    photo: "/team/sharfy-adamantine.webp",
    i18n: {
      es: {
        role: "Cofundadora y CTO",
        location: "Francia",
        bio: "Conecta el financiamiento climático con la conservación local a través de hypercerts y sistemas de datos on-chain. Ethereum Next Billion Fellow y ganadora del XPRIZE Rainforest.",
      },
      pt: {
        role: "Cofundadora e CTO",
        location: "França",
        bio: "Conecta financiamento climático à conservação local através de hypercerts e sistemas de dados on-chain. Ethereum Next Billion Fellow e vencedora do XPRIZE Rainforest.",
      },
      sw: {
        role: "Mwanzilishi mwenza na CTO",
        location: "Ufaransa",
        bio: "Anaunganisha fedha za hali ya hewa na uhifadhi wa ndani kupitia hypercerts na mifumo ya data ya on-chain. Ethereum Next Billion Fellow na mshindi wa XPRIZE Rainforest.",
      },
      id: {
        role: "Pendiri bersama & CTO",
        location: "Prancis",
        bio: "Menghubungkan pendanaan iklim dengan konservasi lokal melalui hypercerts dan sistem data on-chain. Ethereum Next Billion Fellow dan pemenang XPRIZE Rainforest.",
      },
    },
  },
];

export const CORE_TEAM: ReadonlyArray<Translated<TeamMember>> = [
  {
    name: "Nurfatin \"Fatin\" Hamzah",
    role: "Community Lead",
    location: "Malaysia",
    bio: "Holds GainForest's global community programme together. Spends weeks each year in the field with Bumicerts partners across the network.",
    photo: "/team/nurfatin-hamzah.webp",
    i18n: {
      es: {
        role: "Responsable de Comunidad",
        location: "Malasia",
        bio: "Mantiene el programa comunitario global de GainForest. Pasa varias semanas al año en el campo con socios de Bumicerts en toda la red.",
      },
      pt: {
        role: "Líder de Comunidade",
        location: "Malásia",
        bio: "Mantém o programa comunitário global da GainForest unido. Passa semanas a cada ano em campo com parceiros do Bumicerts em toda a rede.",
      },
      sw: {
        role: "Kiongozi wa Jamii",
        location: "Malesia",
        bio: "Anashikilia mpango wa kimataifa wa jamii wa GainForest. Hutumia wiki kadhaa kila mwaka nyanjani na washirika wa Bumicerts kote katika mtandao.",
      },
      id: {
        role: "Pemimpin Komunitas",
        location: "Malaysia",
        bio: "Menyatukan program komunitas global GainForest. Menghabiskan beberapa minggu setiap tahun di lapangan bersama mitra Bumicerts di seluruh jaringan.",
      },
    },
  },
  {
    name: "Niña Cerilla",
    role: "Operations Lead",
    location: "Philippines",
    bio: "Runs operations across the global team and leads delivery on the Klarna AI for Climate Resilience grant. Keeps the organisation moving day to day.",
    photo: "/team/nina-cerilla.webp",
    i18n: {
      es: {
        role: "Responsable de Operaciones",
        location: "Filipinas",
        bio: "Lidera las operaciones del equipo global y la ejecución de la beca Klarna AI for Climate Resilience. Mantiene a la organización en marcha día a día.",
      },
      pt: {
        role: "Líder de Operações",
        location: "Filipinas",
        bio: "Lidera as operações da equipe global e a entrega da bolsa Klarna AI for Climate Resilience. Mantém a organização em movimento todos os dias.",
      },
      sw: {
        role: "Kiongozi wa Uendeshaji",
        location: "Ufilipino",
        bio: "Anaongoza uendeshaji wa timu ya kimataifa na utekelezaji wa ruzuku ya Klarna AI for Climate Resilience. Hudumisha shirika kusonga mbele kila siku.",
      },
      id: {
        role: "Pemimpin Operasi",
        location: "Filipina",
        bio: "Memimpin operasi tim global dan pelaksanaan hibah Klarna AI for Climate Resilience. Membuat organisasi tetap bergerak hari demi hari.",
      },
    },
  },
  {
    name: "Diego Rivera Buendia",
    role: "Engineering & AI",
    location: "Mexico",
    bio: "Builds the open-source GainForest stack and the AI tooling on top of it. Ships ATProto integrations, Bumicerts pipelines, and the models behind them.",
    photo: "/team/diego-rivera-buendia.webp",
    i18n: {
      es: {
        role: "Ingeniería e IA",
        location: "México",
        bio: "Construye el stack open-source de GainForest y las herramientas de IA encima. Entrega integraciones de ATProto, pipelines de Bumicerts y los modelos detrás.",
      },
      pt: {
        role: "Engenharia e IA",
        location: "México",
        bio: "Constrói a stack open-source da GainForest e as ferramentas de IA em cima. Entrega integrações ATProto, pipelines do Bumicerts e os modelos por trás deles.",
      },
      sw: {
        role: "Uhandisi na AI",
        location: "Mexico",
        bio: "Anajenga stack ya open-source ya GainForest na zana za AI juu yake. Hutoa ujumuishaji wa ATProto, mabomba ya Bumicerts, na mifano nyuma yake.",
      },
      id: {
        role: "Teknik & AI",
        location: "Meksiko",
        bio: "Membangun stack open-source GainForest dan perangkat AI di atasnya. Mengirimkan integrasi ATProto, pipeline Bumicerts, dan model di baliknya.",
      },
    },
  },
  {
    name: "Satyam Mishra",
    role: "Engineering & Design",
    location: "India",
    bio: "Engineer and designer on Bumicerts. Shapes the product, the interface, and the editorial system that make proof-of-impact records feel inviting.",
    photo: "/team/satyam-mishra.webp",
    i18n: {
      es: {
        role: "Ingeniería y Diseño",
        location: "India",
        bio: "Ingeniero y diseñador en Bumicerts. Da forma al producto, la interfaz y el sistema editorial que hacen que los registros de prueba de impacto se sientan atractivos.",
      },
      pt: {
        role: "Engenharia e Design",
        location: "Índia",
        bio: "Engenheiro e designer no Bumicerts. Molda o produto, a interface e o sistema editorial que tornam os registos de prova de impacto convidativos.",
      },
      sw: {
        role: "Uhandisi na Ubunifu",
        location: "India",
        bio: "Mhandisi na mbunifu kwenye Bumicerts. Anatengeneza bidhaa, kiolesura, na mfumo wa uhariri unaofanya rekodi za uthibitisho wa athari zionekane za kuvutia.",
      },
      id: {
        role: "Teknik & Desain",
        location: "India",
        bio: "Insinyur dan desainer Bumicerts. Membentuk produk, antarmuka, dan sistem editorial yang membuat rekam bukti dampak terasa mengundang.",
      },
    },
  },
  {
    name: "Karma Yoezer",
    role: "Engineering & Infra",
    location: "Bhutan",
    bio: "Engineer on the ATProto and Hypercerts layer that anchors every Bumicert. Contributes across GainForest and the wider Hypersphere ecosystem.",
    photo: "/team/karma-yoezer.webp",
    i18n: {
      es: {
        role: "Ingeniería e Infraestructura",
        location: "Bután",
        bio: "Ingeniero de la capa de ATProto y Hypercerts que ancla cada Bumicert. Contribuye en GainForest y en el ecosistema más amplio de Hypersphere.",
      },
      pt: {
        role: "Engenharia e Infraestrutura",
        location: "Butão",
        bio: "Engenheiro da camada ATProto e Hypercerts que ancora cada Bumicert. Contribui em toda a GainForest e no ecossistema Hypersphere mais amplo.",
      },
      sw: {
        role: "Uhandisi na Miundombinu",
        location: "Bhutan",
        bio: "Mhandisi wa safu ya ATProto na Hypercerts inayoshikilia kila Bumicert. Anachangia katika GainForest na mfumo mpana wa Hypersphere.",
      },
      id: {
        role: "Teknik & Infra",
        location: "Bhutan",
        bio: "Insinyur lapisan ATProto dan Hypercerts yang menjadi jangkar setiap Bumicert. Berkontribusi di GainForest dan ekosistem Hypersphere yang lebih luas.",
      },
    },
  },
  {
    name: "Donald Nwokoro",
    role: "Engineering & Infra",
    location: "Nigeria",
    bio: "Engineer on Green Globe; the live planet view that surfaces community-led nature projects, and the ATProto packages and lexicons that power it.",
    photo: "/team/donald-nwokoro.webp",
    i18n: {
      es: {
        role: "Ingeniería e Infraestructura",
        location: "Nigeria",
        bio: "Ingeniero de Green Globe; la vista en vivo del planeta que muestra proyectos de naturaleza liderados por comunidades, junto con los paquetes y lexicones de ATProto que la impulsan.",
      },
      pt: {
        role: "Engenharia e Infraestrutura",
        location: "Nigéria",
        bio: "Engenheiro do Green Globe; a vista ao vivo do planeta que mostra projetos liderados por comunidades, e os pacotes e léxicons ATProto que o sustentam.",
      },
      sw: {
        role: "Uhandisi na Miundombinu",
        location: "Nigeria",
        bio: "Mhandisi wa Green Globe; mtazamo wa moja kwa moja wa sayari unaoonyesha miradi ya asili inayoongozwa na jamii, pamoja na paketi za ATProto na lexicons zinazoiwezesha.",
      },
      id: {
        role: "Teknik & Infra",
        location: "Nigeria",
        bio: "Insinyur Green Globe; tampilan langsung planet yang menampilkan proyek alam yang dipimpin komunitas, beserta paket dan leksikon ATProto yang menjalankannya.",
      },
    },
  },
];
// Data council & advisors. Independent scientists and platform leads
// who steer GainForest's open-data and conservation-AI work. Roles and
// affiliations collected from public sources (Columbia Engineering /
// Data Science Institute, ETH Environmental Policy Lab, iNaturalist
// team page). Like the core team these cards are intentionally inert;
// Ken-Ichi's iNaturalist profile (inaturalist.org/people/kueda) is the
// public reference but is not rendered as a link per team direction.
export const ADVISORS: ReadonlyArray<Translated<TeamMember>> = [
  {
    name: "Lily Xu",
    role: "Assistant Professor, Columbia",
    location: "United States",
    photo: "/team/lily-xu.webp",
    bio: "Builds AI across machine learning and optimization for biodiversity conservation at Columbia, and leads the AI work behind the SMART protected-area partnership.",
    i18n: {
      es: {
        role: "Profesora adjunta, Columbia",
        location: "Estados Unidos",
        bio: "Desarrolla IA en aprendizaje automático y optimización para la conservación de la biodiversidad en Columbia, y lidera el trabajo de IA detrás de la alianza de áreas protegidas SMART.",
      },
      pt: {
        role: "Professora adjunta, Columbia",
        location: "Estados Unidos",
        bio: "Desenvolve IA em aprendizado de máquina e otimização para a conservação da biodiversidade em Columbia, e lidera o trabalho de IA por trás da parceria de áreas protegidas SMART.",
      },
      sw: {
        role: "Profesa Msaidizi, Columbia",
        location: "Marekani",
        bio: "Anajenga AI katika ujifunzaji wa mashine na uboreshaji kwa ajili ya uhifadhi wa bayoanuwai huko Columbia, na anaongoza kazi ya AI nyuma ya ushirikiano wa maeneo yaliyohifadhiwa wa SMART.",
      },
      id: {
        role: "Asisten Profesor, Columbia",
        location: "Amerika Serikat",
        bio: "Membangun AI lintas pembelajaran mesin dan optimisasi untuk konservasi keanekaragaman hayati di Columbia, dan memimpin kerja AI di balik kemitraan kawasan lindung SMART.",
      },
    },
  },
  {
    name: "Millie Chapman",
    role: "Assistant Professor, ETH Zürich",
    location: "Switzerland",
    photo: "/team/millie-chapman.webp",
    bio: "Leads the Environmental Policy Lab at ETH Zürich, working where decision theory, ecology, and data justice meet to make biodiversity policy effective and equitable.",
    i18n: {
      es: {
        role: "Profesora adjunta, ETH Zúrich",
        location: "Suiza",
        bio: "Dirige el Laboratorio de Política Ambiental en ETH Zúrich, trabajando donde se encuentran la teoría de la decisión, la ecología y la justicia de datos para hacer la política de biodiversidad eficaz y equitativa.",
      },
      pt: {
        role: "Professora adjunta, ETH Zurique",
        location: "Suíça",
        bio: "Dirige o Laboratório de Política Ambiental na ETH Zurique, atuando onde se encontram a teoria da decisão, a ecologia e a justiça de dados para tornar a política de biodiversidade eficaz e equitativa.",
      },
      sw: {
        role: "Profesa Msaidizi, ETH Zürich",
        location: "Uswisi",
        bio: "Anaongoza Maabara ya Sera ya Mazingira katika ETH Zürich, akifanya kazi mahali ambapo nadharia ya maamuzi, ikolojia, na haki ya data hukutana ili kufanya sera ya bayoanuwai kuwa yenye ufanisi na ya haki.",
      },
      id: {
        role: "Asisten Profesor, ETH Zürich",
        location: "Swiss",
        bio: "Memimpin Lab Kebijakan Lingkungan di ETH Zürich, bekerja di titik temu teori keputusan, ekologi, dan keadilan data untuk membuat kebijakan keanekaragaman hayati efektif dan adil.",
      },
    },
  },
  {
    name: "Ken-Ichi Ueda",
    role: "Co-founder, iNaturalist",
    location: "United States",
    photo: "/team/ken-ichi-ueda.webp",
    bio: "Co-founded iNaturalist, the global platform where millions of naturalists document and share the biodiversity observations that ground open ecological data.",
    i18n: {
      es: {
        role: "Cofundador, iNaturalist",
        location: "Estados Unidos",
        bio: "Cofundó iNaturalist, la plataforma global donde millones de naturalistas documentan y comparten las observaciones de biodiversidad que sustentan los datos ecológicos abiertos.",
      },
      pt: {
        role: "Cofundador, iNaturalist",
        location: "Estados Unidos",
        bio: "Cofundou o iNaturalist, a plataforma global onde milhões de naturalistas documentam e partilham as observações de biodiversidade que sustentam os dados ecológicos abertos.",
      },
      sw: {
        role: "Mwanzilishi mwenza, iNaturalist",
        location: "Marekani",
        bio: "Alianzisha iNaturalist, jukwaa la kimataifa ambapo mamilioni ya wanasayansi wa asili huandika na kushiriki uchunguzi wa bayoanuwai unaohimili data huria ya ikolojia.",
      },
      id: {
        role: "Pendiri bersama, iNaturalist",
        location: "Amerika Serikat",
        bio: "Turut mendirikan iNaturalist, platform global tempat jutaan naturalis mendokumentasikan dan berbagi observasi keanekaragaman hayati yang menjadi dasar data ekologi terbuka.",
      },
    },
  },
];

// Marina Mura is already credited on the landing's <NatureGuild />
// (Inhaã-bé, Brazil) and the <TainaFeature /> caption, so we don't
// duplicate her on the About core team. The Nature Guild block is
// the canonical surface for Indigenous Data Council leads.

// Story timeline. Each entry is one editorial moment — keep it terse.
// Year first; the year column doubles as a visual rhythm element.
export type TimelineEntry = {
  year: string;
  title: string;
  body: string;
};

export const TIMELINE: ReadonlyArray<Translated<TimelineEntry>> = [
  {
    year: "2017",
    title: "A hackathon at the United Nations",
    body: "David Dao prototypes a small idea at the UN: an AI model that predicts deforestation, wired to a blockchain that pays forest stewards directly when they protect their land. It wins the grand prize of the hackathon.",
    i18n: {
      es: {
        title: "Un hackathon en las Naciones Unidas",
        body: "David Dao prototipa una pequeña idea en la ONU: un modelo de IA que predice la deforestación, conectado a una blockchain que paga directamente a quienes protegen los bosques. Gana el gran premio del hackathon.",
      },
      pt: {
        title: "Um hackathon nas Nações Unidas",
        body: "David Dao prototipa uma pequena ideia na ONU: um modelo de IA que prevê o desmatamento, ligado a uma blockchain que paga diretamente quem protege a floresta. Ganha o grande prémio do hackathon.",
      },
      sw: {
        title: "Hackathon katika Umoja wa Mataifa",
        body: "David Dao anatengeneza wazo dogo katika UN: mfano wa AI unaotabiri ukataji miti, uliounganishwa na blockchain inayolipa walinzi wa misitu moja kwa moja wanapolinda ardhi yao. Inashinda tuzo kuu ya hackathon.",
      },
      id: {
        title: "Sebuah hackathon di PBB",
        body: "David Dao memprototipekan ide kecil di PBB: model AI yang memprediksi deforestasi, terhubung ke blockchain yang membayar para pelindung hutan secara langsung ketika mereka melindungi tanah mereka. Memenangkan grand prize hackathon.",
      },
    },
  },
  {
    year: "2018",
    title: "Decentralized Sustainability",
    body: "The founding essay publishes on Medium; the concept finds its first community partners across Brazil, Bhutan, Kenya, Paraguay, and the Philippines.",
    i18n: {
      es: {
        title: "Sostenibilidad descentralizada",
        body: "El ensayo fundacional se publica en Medium; el concepto encuentra a sus primeros socios comunitarios en Brasil, Bután, Kenia, Paraguay y Filipinas.",
      },
      pt: {
        title: "Sustentabilidade Descentralizada",
        body: "O ensaio fundador é publicado no Medium; o conceito encontra os primeiros parceiros comunitários no Brasil, Butão, Quénia, Paraguai e Filipinas.",
      },
      sw: {
        title: "Uendelevu Uliogawanywa",
        body: "Insha ya msingi inachapishwa kwenye Medium; dhana hii inapata washirika wake wa kwanza wa jamii nchini Brazili, Bhutan, Kenya, Paraguay na Ufilipino.",
      },
      id: {
        title: "Keberlanjutan Terdesentralisasi",
        body: "Esai pendiri terbit di Medium; konsep ini menemukan mitra komunitas pertamanya di Brasil, Bhutan, Kenya, Paraguay, dan Filipina.",
      },
    },
  },
  {
    year: "2022",
    title: "Registered as a Swiss non-profit",
    body: "GainForest e.V. is registered in Zurich and granted tax-exempt status by the Swiss authorities.",
    i18n: {
      es: {
        title: "Registro como ONG suiza",
        body: "GainForest e.V. se registra en Zúrich y recibe el estatus de exención fiscal por parte de las autoridades suizas.",
      },
      pt: {
        title: "Registada como ONG suíça",
        body: "A GainForest e.V. é registada em Zurique e recebe o estatuto de isenção fiscal das autoridades suíças.",
      },
      sw: {
        title: "Imesajiliwa kama shirika lisilo la faida la Uswisi",
        body: "GainForest e.V. inasajiliwa Zurich na kupewa hadhi ya kutotozwa kodi na mamlaka za Uswisi.",
      },
      id: {
        title: "Terdaftar sebagai nirlaba Swiss",
        body: "GainForest e.V. terdaftar di Zurich dan menerima status bebas pajak dari otoritas Swiss.",
      },
    },
  },
  {
    year: "2023",
    title: "Co-designing Taina with Indigenous communities",
    body: "Taina; the community-owned AI assistant co-designed with four Indigenous and local communities around Manaus, ships its first version on Telegram.",
    i18n: {
      es: {
        title: "Co-diseñando Taina con comunidades indígenas",
        body: "Taina; la asistente de IA de propiedad comunitaria co-diseñada con cuatro comunidades indígenas y locales alrededor de Manaos, lanza su primera versión en Telegram.",
      },
      pt: {
        title: "Co-desenhando a Tainá com comunidades indígenas",
        body: "Tainá; a assistente de IA de propriedade comunitária co-desenhada com quatro comunidades indígenas e locais em torno de Manaus, lança a sua primeira versão no Telegram.",
      },
      sw: {
        title: "Kubuni Taina pamoja na jamii za Asili",
        body: "Taina; msaidizi wa AI anayemilikiwa na jamii aliyebuniwa pamoja na jamii nne za Asili na za ndani karibu na Manaus, anatoa toleo lake la kwanza kwenye Telegram.",
      },
      id: {
        title: "Merancang Taina bersama komunitas Adat",
        body: "Taina; asisten AI milik komunitas yang dirancang bersama empat komunitas Adat dan lokal di sekitar Manaus, merilis versi pertamanya di Telegram.",
      },
    },
  },
  {
    year: "2024",
    title: "Winning the XPRIZE Rainforest finals",
    body: "After five years of competing, GainForest and ETH BiodivX win the XPRIZE Rainforest Bonus Prize in the Amazon, beating 298 teams worldwide.",
    i18n: {
      es: {
        title: "Ganando la final del XPRIZE Rainforest",
        body: "Tras cinco años de competir, GainForest y ETH BiodivX ganan el Premio Bono del XPRIZE Rainforest en la Amazonía, superando a 298 equipos en todo el mundo.",
      },
      pt: {
        title: "Vencendo a final do XPRIZE Rainforest",
        body: "Depois de cinco anos a competir, a GainForest e a ETH BiodivX vencem o Prémio Bónus do XPRIZE Rainforest na Amazónia, batendo 298 equipas em todo o mundo.",
      },
      sw: {
        title: "Kushinda fainali za XPRIZE Rainforest",
        body: "Baada ya miaka mitano ya ushindani, GainForest na ETH BiodivX wanashinda Tuzo ya Ziada ya XPRIZE Rainforest katika Amazon, wakishinda timu 298 ulimwenguni.",
      },
      id: {
        title: "Memenangkan final XPRIZE Rainforest",
        body: "Setelah lima tahun berkompetisi, GainForest dan ETH BiodivX memenangkan XPRIZE Rainforest Bonus Prize di Amazon, mengalahkan 298 tim di seluruh dunia.",
      },
    },
  },
  {
    year: "2024",
    title: "Founding the Indigenous Science Endowment Fund",
    body: "The entire $250,000 XPRIZE prize is donated to a new endowment fund to train Indigenous and grassroots scientists in the Amazon.",
    i18n: {
      es: {
        title: "Fundación del Fondo de Ciencia Indígena",
        body: "El premio entero de 250.000 dólares del XPRIZE se dona a un nuevo fondo de dotación para formar a científicas indígenas y de base en la Amazonía.",
      },
      pt: {
        title: "Fundação do Fundo de Ciência Indígena",
        body: "O prémio inteiro de 250.000 dólares do XPRIZE é doado a um novo fundo de dotação para formar cientistas indígenas e de base na Amazónia.",
      },
      sw: {
        title: "Kuanzisha Mfuko wa Sayansi ya Asili",
        body: "Tuzo nzima ya dola 250,000 ya XPRIZE inachangwa kwa mfuko mpya wa ufadhili kufundisha wanasayansi wa Asili na wa msingi katika Amazon.",
      },
      id: {
        title: "Mendirikan Dana Ilmu Pengetahuan Adat",
        body: "Seluruh hadiah XPRIZE sebesar $250.000 disumbangkan ke dana abadi baru untuk melatih ilmuwan Adat dan akar rumput di Amazon.",
      },
    },
  },
  {
    year: "2025",
    title: "Launching the Nature Guild",
    body: "A rotating circle of stewards from Brazil, India, Uganda, Kenya, Malaysia, and the Philippines is formalised to steer GainForest's research priorities.",
    i18n: {
      es: {
        title: "Lanzamiento del Gremio de la Naturaleza",
        body: "Se formaliza un círculo rotativo de guardianas y guardianes de Brasil, India, Uganda, Kenia, Malasia y Filipinas para orientar las prioridades de investigación de GainForest.",
      },
      pt: {
        title: "Lançamento da Nature Guild",
        body: "É formalizado um círculo rotativo de guardiões do Brasil, Índia, Uganda, Quénia, Malásia e Filipinas para orientar as prioridades de pesquisa da GainForest.",
      },
      sw: {
        title: "Kuzindua Nature Guild",
        body: "Mzunguko wa walinzi kutoka Brazili, India, Uganda, Kenya, Malesia na Ufilipino unarasimishwa ili kuongoza vipaumbele vya utafiti vya GainForest.",
      },
      id: {
        title: "Meluncurkan Nature Guild",
        body: "Sebuah lingkaran bergilir penjaga dari Brasil, India, Uganda, Kenya, Malaysia, dan Filipina diresmikan untuk mengarahkan prioritas riset GainForest.",
      },
    },
  },
];

// External destinations linked from the about page.
export const EXTERNAL = {
  donate: "https://donorbox.org/gainforest",
  impactReport:
    "https://www.canva.com/design/DAGqnTWl-gw/K4V6DWYyqtZW0NK2_0Dpag/view",
  // Current foundational essay; David's piece on Regenerative
  // Intelligence as the theory of change behind GainForest.
  essay: "https://www.daviddao.org/posts/regenerative-intelligence/",
  email: "team@gainforest.net",
  substackOrigin: "https://gainforest.substack.com",
  homepage: "https://www.gainforest.earth",
} as const;
