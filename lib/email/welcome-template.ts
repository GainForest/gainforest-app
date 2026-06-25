import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LOCALES,
  isSupportedLanguageCode,
  resolvePreferredLanguageFromHeader,
  type SupportedLanguageCode,
} from "@/lib/i18n/languages";

export type WelcomeEmailVariant = "direct-signup" | "organization-invite";

type WelcomeActionHrefKey = Exclude<keyof WelcomeEmailLinks, "communityForm">;

type WelcomeAction = {
  title: string;
  body: string;
  icon: string;
  hrefKey: WelcomeActionHrefKey;
};

type WelcomeCopy = {
  directSubject: string;
  inviteSubject: string;
  directHeading: string;
  inviteHeading: string;
  heroKicker: string;
  fallbackName: string;
  fallbackOrganizationName: string;
  greeting: string;
  directIntro: string;
  inviteIntro: string;
  inviteIntroWithInviter: string;
  stewardHeading: string;
  funderHeading: string;
  stewardActions: WelcomeAction[];
  inviteActions: WelcomeAction[];
  funderActions: WelcomeAction[];
  bonusLabel: string;
  bonusTitle: string;
  bonusBody: string;
  bonusItems: string[];
  bonusLinkLabel: string;
  signoff: string;
  teamName: string;
  directFooter: string;
  inviteFooter: string;
};

export type WelcomeEmailLinks = {
  manage: string;
  organizationSetup: string;
  createProject: string;
  createCert: string;
  uploadEvidence: string;
  shareWithFunders: string;
  browseProjects: string;
  viewCerts: string;
  organizations: string;
  communityForm: string | null;
};

export type WelcomeEmailRenderResult = {
  subject: string;
  html: string;
  text: string;
};

const DUMMY_COMMUNITY_FORM_URL = "https://example.com/gainforest-community-network";

const copyByLocale = {
  en: {
    directSubject: "Welcome to GainForest",
    inviteSubject: "You’ve joined {organizationName} on GainForest",
    directHeading: "Welcome to GainForest",
    inviteHeading: "You’ve joined {organizationName} on GainForest",
    heroKicker: "Welcome to",
    fallbackName: "there",
    fallbackOrganizationName: "your organization",
    greeting: "Hi {name},",
    directIntro:
      "Welcome to GainForest. Whether you’re documenting stewardship work or looking to support it, here’s what you can do on the platform.",
    inviteIntro:
      "You’ve joined {organizationName} on GainForest. An organization admin invited you to collaborate. Here’s what you can do next:",
    inviteIntroWithInviter:
      "{inviterName} invited you to join {organizationName} on GainForest. Here’s what you can do next:",
    stewardHeading: "If you’re a nature steward or community:",
    funderHeading: "If you’re a funder:",
    stewardActions: [
      {
        icon: "□",
        title: "Set up your organization",
        body: "Create your organization and invite your team members to join via a link. Everyone works under one shared space.",
        hrefKey: "organizationSetup",
      },
      {
        icon: "▣",
        title: "Create a project",
        body: "A project is your overarching environmental stewardship effort. A site, a programme, or an initiative you want to report on.",
        hrefKey: "createProject",
      },
      {
        icon: "▤",
        title: "Create Certs for your project",
        body: "Each project can have multiple Certs depending on how you want to report your impact. By phase, by month, or by area.",
        hrefKey: "createCert",
      },
      {
        icon: "↑",
        title: "Upload your evidence",
        body: "Attach biodiversity observations, tree data, drone imagery, audio data, and written reports to each Cert to back up your work.",
        hrefKey: "uploadEvidence",
      },
      {
        icon: "♡",
        title: "Share with funders",
        body: "Use your Certs to attract potential funders or as a progress report for funders you’re already working with.",
        hrefKey: "shareWithFunders",
      },
    ],
    inviteActions: [
      {
        icon: "▣",
        title: "Create a project",
        body: "A project is your overarching environmental stewardship effort. A site, a programme, or an initiative you want to report on.",
        hrefKey: "createProject",
      },
      {
        icon: "▤",
        title: "Create Certs for your project",
        body: "Each project can have multiple Certs depending on how you want to report your impact. By phase, by month, or by area.",
        hrefKey: "createCert",
      },
      {
        icon: "↑",
        title: "Upload your evidence",
        body: "Attach biodiversity observations, tree data, drone imagery, audio data, and written reports to each Cert to back up your work.",
        hrefKey: "uploadEvidence",
      },
      {
        icon: "♡",
        title: "Share with funders",
        body: "Use your Certs to attract potential funders or as a progress report for funders you’re already working with.",
        hrefKey: "shareWithFunders",
      },
    ],
    funderActions: [
      {
        icon: "⌕",
        title: "Browse verified projects",
        body: "Explore stewardship projects from communities actively protecting nature, all backed by real field evidence.",
        hrefKey: "browseProjects",
      },
      {
        icon: "▤",
        title: "View certificates and evidence",
        body: "Each project has Certs showing documented evidence of their work. Biodiversity observations, tree data, drone imagery, audio data, written reports and more.",
        hrefKey: "viewCerts",
      },
      {
        icon: "♡",
        title: "Connect with and fund communities",
        body: "Reach out to the communities behind the projects and support the ones that align with your funding goals.",
        hrefKey: "organizations",
      },
    ],
    bonusLabel: "Bonus",
    bonusTitle: "Join the GainForest Community Network",
    bonusBody:
      "As a nature steward, you can also get access to our community network. Fill out the form to join:",
    bonusItems: [
      "Monthly community calls",
      "A WhatsApp group to connect with other community partners",
      "Capacity building sessions on environmental stewardship tech",
    ],
    bonusLinkLabel: "Fill out the form",
    signoff: "Welcome aboard,",
    teamName: "The GainForest Team",
    directFooter: "You’re receiving this because you created a GainForest account.",
    inviteFooter: "You’re receiving this because you joined a GainForest organization.",
  },
  es: {
    directSubject: "Bienvenido a GainForest",
    inviteSubject: "Te uniste a {organizationName} en GainForest",
    directHeading: "Bienvenido a GainForest",
    inviteHeading: "Te uniste a {organizationName} en GainForest",
    heroKicker: "Bienvenido a",
    fallbackName: "amigo/a",
    fallbackOrganizationName: "tu organización",
    greeting: "Hola {name},",
    directIntro:
      "Bienvenido a GainForest. Ya sea que documentes trabajo de cuidado ambiental o quieras apoyarlo, esto es lo que puedes hacer en la plataforma.",
    inviteIntro:
      "Te uniste a {organizationName} en GainForest. Una persona administradora de la organización te invitó a colaborar. Esto es lo que puedes hacer ahora:",
    inviteIntroWithInviter:
      "{inviterName} te invitó a unirte a {organizationName} en GainForest. Esto es lo que puedes hacer ahora:",
    stewardHeading: "Si eres una comunidad o cuidador de la naturaleza:",
    funderHeading: "Si financias proyectos:",
    stewardActions: [
      { icon: "□", title: "Configura tu organización", body: "Crea tu organización e invita a tu equipo con un enlace. Todas las personas trabajan en un mismo espacio compartido.", hrefKey: "organizationSetup" },
      { icon: "▣", title: "Crea un proyecto", body: "Un proyecto es tu esfuerzo principal de cuidado ambiental: un sitio, un programa o una iniciativa que quieres reportar.", hrefKey: "createProject" },
      { icon: "▤", title: "Crea Certs para tu proyecto", body: "Cada proyecto puede tener varios Certs según cómo quieras reportar tu impacto: por fase, por mes o por área.", hrefKey: "createCert" },
      { icon: "↑", title: "Sube tu evidencia", body: "Agrega observaciones de biodiversidad, datos de árboles, imágenes de dron, audio e informes escritos a cada Cert para respaldar tu trabajo.", hrefKey: "uploadEvidence" },
      { icon: "♡", title: "Comparte con financiadores", body: "Usa tus Certs para atraer posibles financiadores o como informe de avance para quienes ya apoyan tu trabajo.", hrefKey: "shareWithFunders" },
    ],
    inviteActions: [
      { icon: "▣", title: "Crea un proyecto", body: "Un proyecto es tu esfuerzo principal de cuidado ambiental: un sitio, un programa o una iniciativa que quieres reportar.", hrefKey: "createProject" },
      { icon: "▤", title: "Crea Certs para tu proyecto", body: "Cada proyecto puede tener varios Certs según cómo quieras reportar tu impacto: por fase, por mes o por área.", hrefKey: "createCert" },
      { icon: "↑", title: "Sube tu evidencia", body: "Agrega observaciones de biodiversidad, datos de árboles, imágenes de dron, audio e informes escritos a cada Cert para respaldar tu trabajo.", hrefKey: "uploadEvidence" },
      { icon: "♡", title: "Comparte con financiadores", body: "Usa tus Certs para atraer posibles financiadores o como informe de avance para quienes ya apoyan tu trabajo.", hrefKey: "shareWithFunders" },
    ],
    funderActions: [
      { icon: "⌕", title: "Explora proyectos verificados", body: "Descubre proyectos de comunidades que protegen activamente la naturaleza, respaldados por evidencia real de campo.", hrefKey: "browseProjects" },
      { icon: "▤", title: "Ve certificados y evidencia", body: "Cada proyecto tiene Certs con evidencia documentada de su trabajo: observaciones de biodiversidad, datos de árboles, imágenes de dron, audio, informes escritos y más.", hrefKey: "viewCerts" },
      { icon: "♡", title: "Conecta y financia comunidades", body: "Contacta a las comunidades detrás de los proyectos y apoya las que coincidan con tus metas de financiación.", hrefKey: "organizations" },
    ],
    bonusLabel: "Extra",
    bonusTitle: "Únete a la Red Comunitaria de GainForest",
    bonusBody: "Como cuidador de la naturaleza, también puedes acceder a nuestra red comunitaria. Completa el formulario para unirte:",
    bonusItems: ["Llamadas comunitarias mensuales", "Un grupo de WhatsApp para conectar con otros socios comunitarios", "Sesiones de capacitación sobre tecnología para el cuidado ambiental"],
    bonusLinkLabel: "Completar el formulario",
    signoff: "Bienvenido a bordo,",
    teamName: "El equipo de GainForest",
    directFooter: "Recibes este correo porque creaste una cuenta de GainForest.",
    inviteFooter: "Recibes este correo porque te uniste a una organización en GainForest.",
  },
  pt: {
    directSubject: "Boas-vindas ao GainForest",
    inviteSubject: "Você entrou em {organizationName} no GainForest",
    directHeading: "Boas-vindas ao GainForest",
    inviteHeading: "Você entrou em {organizationName} no GainForest",
    heroKicker: "Boas-vindas ao",
    fallbackName: "amigo/a",
    fallbackOrganizationName: "sua organização",
    greeting: "Olá {name},",
    directIntro: "Boas-vindas ao GainForest. Se você documenta trabalho de cuidado ambiental ou quer apoiá-lo, veja o que pode fazer na plataforma.",
    inviteIntro: "Você entrou em {organizationName} no GainForest. Uma pessoa administradora da organização convidou você para colaborar. Veja o que pode fazer agora:",
    inviteIntroWithInviter: "{inviterName} convidou você para entrar em {organizationName} no GainForest. Veja o que pode fazer agora:",
    stewardHeading: "Se você é uma comunidade ou guardião da natureza:",
    funderHeading: "Se você financia projetos:",
    stewardActions: [
      { icon: "□", title: "Configure sua organização", body: "Crie sua organização e convide sua equipe por link. Todos trabalham em um espaço compartilhado.", hrefKey: "organizationSetup" },
      { icon: "▣", title: "Crie um projeto", body: "Um projeto é seu esforço principal de cuidado ambiental: um local, programa ou iniciativa que você quer reportar.", hrefKey: "createProject" },
      { icon: "▤", title: "Crie Certs para seu projeto", body: "Cada projeto pode ter vários Certs, dependendo de como você quer reportar seu impacto: por fase, mês ou área.", hrefKey: "createCert" },
      { icon: "↑", title: "Envie suas evidências", body: "Anexe observações de biodiversidade, dados de árvores, imagens de drone, áudio e relatórios escritos a cada Cert para respaldar seu trabalho.", hrefKey: "uploadEvidence" },
      { icon: "♡", title: "Compartilhe com financiadores", body: "Use seus Certs para atrair possíveis financiadores ou como relatório de progresso para quem já apoia seu trabalho.", hrefKey: "shareWithFunders" },
    ],
    inviteActions: [
      { icon: "▣", title: "Crie um projeto", body: "Um projeto é seu esforço principal de cuidado ambiental: um local, programa ou iniciativa que você quer reportar.", hrefKey: "createProject" },
      { icon: "▤", title: "Crie Certs para seu projeto", body: "Cada projeto pode ter vários Certs, dependendo de como você quer reportar seu impacto: por fase, mês ou área.", hrefKey: "createCert" },
      { icon: "↑", title: "Envie suas evidências", body: "Anexe observações de biodiversidade, dados de árvores, imagens de drone, áudio e relatórios escritos a cada Cert para respaldar seu trabalho.", hrefKey: "uploadEvidence" },
      { icon: "♡", title: "Compartilhe com financiadores", body: "Use seus Certs para atrair possíveis financiadores ou como relatório de progresso para quem já apoia seu trabalho.", hrefKey: "shareWithFunders" },
    ],
    funderActions: [
      { icon: "⌕", title: "Explore projetos verificados", body: "Conheça projetos de comunidades que protegem ativamente a natureza, todos respaldados por evidências reais de campo.", hrefKey: "browseProjects" },
      { icon: "▤", title: "Veja certificados e evidências", body: "Cada projeto tem Certs com evidências documentadas do trabalho: observações de biodiversidade, dados de árvores, imagens de drone, áudio, relatórios escritos e mais.", hrefKey: "viewCerts" },
      { icon: "♡", title: "Conecte-se e financie comunidades", body: "Fale com as comunidades por trás dos projetos e apoie aquelas alinhadas às suas metas de financiamento.", hrefKey: "organizations" },
    ],
    bonusLabel: "Bônus",
    bonusTitle: "Entre na Rede Comunitária da GainForest",
    bonusBody: "Como guardião da natureza, você também pode acessar nossa rede comunitária. Preencha o formulário para participar:",
    bonusItems: ["Chamadas comunitárias mensais", "Um grupo de WhatsApp para se conectar com outros parceiros comunitários", "Sessões de capacitação sobre tecnologia para cuidado ambiental"],
    bonusLinkLabel: "Preencher o formulário",
    signoff: "Boas-vindas,",
    teamName: "Equipe GainForest",
    directFooter: "Você está recebendo este email porque criou uma conta no GainForest.",
    inviteFooter: "Você está recebendo este email porque entrou em uma organização no GainForest.",
  },
  sw: {
    directSubject: "Karibu GainForest",
    inviteSubject: "Umejiunga na {organizationName} kwenye GainForest",
    directHeading: "Karibu GainForest",
    inviteHeading: "Umejiunga na {organizationName} kwenye GainForest",
    heroKicker: "Karibu",
    fallbackName: "rafiki",
    fallbackOrganizationName: "shirika lako",
    greeting: "Habari {name},",
    directIntro: "Karibu GainForest. Iwe unaandika kazi ya utunzaji wa mazingira au unataka kuiunga mkono, haya ndiyo unayoweza kufanya kwenye jukwaa.",
    inviteIntro: "Umejiunga na {organizationName} kwenye GainForest. Msimamizi wa shirika alikualika kushirikiana. Haya ndiyo unayoweza kufanya sasa:",
    inviteIntroWithInviter: "{inviterName} alikualika kujiunga na {organizationName} kwenye GainForest. Haya ndiyo unayoweza kufanya sasa:",
    stewardHeading: "Ikiwa wewe ni mlezi wa mazingira au jamii:",
    funderHeading: "Ikiwa wewe ni mfadhili:",
    stewardActions: [
      { icon: "□", title: "Sanidi shirika lako", body: "Unda shirika lako na uwaalike wanatimu wako kwa kiungo. Kila mtu hufanya kazi kwenye nafasi moja ya pamoja.", hrefKey: "organizationSetup" },
      { icon: "▣", title: "Unda mradi", body: "Mradi ni juhudi yako kuu ya utunzaji wa mazingira: eneo, programu au mpango unaotaka kuripoti.", hrefKey: "createProject" },
      { icon: "▤", title: "Unda Certs za mradi wako", body: "Kila mradi unaweza kuwa na Certs kadhaa kulingana na jinsi unavyotaka kuripoti athari: kwa awamu, mwezi au eneo.", hrefKey: "createCert" },
      { icon: "↑", title: "Pakia ushahidi wako", body: "Ambatisha uchunguzi wa bayoanuwai, data ya miti, picha za droni, sauti na ripoti zilizoandikwa kwenye kila Cert ili kuthibitisha kazi yako.", hrefKey: "uploadEvidence" },
      { icon: "♡", title: "Shiriki na wafadhili", body: "Tumia Certs zako kuvutia wafadhili watarajiwa au kama ripoti ya maendeleo kwa wafadhili unaofanya nao kazi tayari.", hrefKey: "shareWithFunders" },
    ],
    inviteActions: [
      { icon: "▣", title: "Unda mradi", body: "Mradi ni juhudi yako kuu ya utunzaji wa mazingira: eneo, programu au mpango unaotaka kuripoti.", hrefKey: "createProject" },
      { icon: "▤", title: "Unda Certs za mradi wako", body: "Kila mradi unaweza kuwa na Certs kadhaa kulingana na jinsi unavyotaka kuripoti athari: kwa awamu, mwezi au eneo.", hrefKey: "createCert" },
      { icon: "↑", title: "Pakia ushahidi wako", body: "Ambatisha uchunguzi wa bayoanuwai, data ya miti, picha za droni, sauti na ripoti zilizoandikwa kwenye kila Cert ili kuthibitisha kazi yako.", hrefKey: "uploadEvidence" },
      { icon: "♡", title: "Shiriki na wafadhili", body: "Tumia Certs zako kuvutia wafadhili watarajiwa au kama ripoti ya maendeleo kwa wafadhili unaofanya nao kazi tayari.", hrefKey: "shareWithFunders" },
    ],
    funderActions: [
      { icon: "⌕", title: "Vinjari miradi iliyothibitishwa", body: "Gundua miradi ya jamii zinazolinda mazingira kikamilifu, yote ikiungwa mkono na ushahidi halisi wa nyanjani.", hrefKey: "browseProjects" },
      { icon: "▤", title: "Tazama vyeti na ushahidi", body: "Kila mradi una Certs zinazoonyesha ushahidi wa kazi yao: uchunguzi wa bayoanuwai, data ya miti, picha za droni, sauti, ripoti zilizoandikwa na zaidi.", hrefKey: "viewCerts" },
      { icon: "♡", title: "Ungana na ufadhili jamii", body: "Wasiliana na jamii zilizo nyuma ya miradi na uunge mkono zile zinazoendana na malengo yako ya ufadhili.", hrefKey: "organizations" },
    ],
    bonusLabel: "Ziada",
    bonusTitle: "Jiunge na Mtandao wa Jamii wa GainForest",
    bonusBody: "Kama mlezi wa mazingira, unaweza pia kupata ufikiaji wa mtandao wetu wa jamii. Jaza fomu ili kujiunga:",
    bonusItems: ["Mikutano ya jamii kila mwezi", "Kikundi cha WhatsApp cha kuungana na washirika wengine wa jamii", "Vipindi vya kujenga uwezo kuhusu teknolojia ya utunzaji wa mazingira"],
    bonusLinkLabel: "Jaza fomu",
    signoff: "Karibu sana,",
    teamName: "Timu ya GainForest",
    directFooter: "Unapokea barua pepe hii kwa sababu uliunda akaunti ya GainForest.",
    inviteFooter: "Unapokea barua pepe hii kwa sababu umejiunga na shirika la GainForest.",
  },
  id: {
    directSubject: "Selamat datang di GainForest",
    inviteSubject: "Anda bergabung dengan {organizationName} di GainForest",
    directHeading: "Selamat datang di GainForest",
    inviteHeading: "Anda bergabung dengan {organizationName} di GainForest",
    heroKicker: "Selamat datang di",
    fallbackName: "teman",
    fallbackOrganizationName: "organisasi Anda",
    greeting: "Hai {name},",
    directIntro: "Selamat datang di GainForest. Baik Anda mendokumentasikan kerja penjagaan lingkungan maupun ingin mendukungnya, inilah yang dapat Anda lakukan di platform.",
    inviteIntro: "Anda telah bergabung dengan {organizationName} di GainForest. Admin organisasi mengundang Anda untuk berkolaborasi. Inilah yang dapat Anda lakukan selanjutnya:",
    inviteIntroWithInviter: "{inviterName} mengundang Anda untuk bergabung dengan {organizationName} di GainForest. Inilah yang dapat Anda lakukan selanjutnya:",
    stewardHeading: "Jika Anda penjaga alam atau komunitas:",
    funderHeading: "Jika Anda pendana:",
    stewardActions: [
      { icon: "□", title: "Siapkan organisasi Anda", body: "Buat organisasi Anda dan undang anggota tim melalui tautan. Semua orang bekerja dalam satu ruang bersama.", hrefKey: "organizationSetup" },
      { icon: "▣", title: "Buat proyek", body: "Proyek adalah upaya utama penjagaan lingkungan Anda: lokasi, program, atau inisiatif yang ingin Anda laporkan.", hrefKey: "createProject" },
      { icon: "▤", title: "Buat Certs untuk proyek Anda", body: "Setiap proyek dapat memiliki beberapa Cert sesuai cara Anda ingin melaporkan dampak: per fase, bulan, atau area.", hrefKey: "createCert" },
      { icon: "↑", title: "Unggah bukti Anda", body: "Lampirkan observasi keanekaragaman hayati, data pohon, citra drone, audio, dan laporan tertulis ke setiap Cert untuk mendukung kerja Anda.", hrefKey: "uploadEvidence" },
      { icon: "♡", title: "Bagikan dengan pendana", body: "Gunakan Certs Anda untuk menarik calon pendana atau sebagai laporan kemajuan bagi pendana yang sudah bekerja dengan Anda.", hrefKey: "shareWithFunders" },
    ],
    inviteActions: [
      { icon: "▣", title: "Buat proyek", body: "Proyek adalah upaya utama penjagaan lingkungan Anda: lokasi, program, atau inisiatif yang ingin Anda laporkan.", hrefKey: "createProject" },
      { icon: "▤", title: "Buat Certs untuk proyek Anda", body: "Setiap proyek dapat memiliki beberapa Cert sesuai cara Anda ingin melaporkan dampak: per fase, bulan, atau area.", hrefKey: "createCert" },
      { icon: "↑", title: "Unggah bukti Anda", body: "Lampirkan observasi keanekaragaman hayati, data pohon, citra drone, audio, dan laporan tertulis ke setiap Cert untuk mendukung kerja Anda.", hrefKey: "uploadEvidence" },
      { icon: "♡", title: "Bagikan dengan pendana", body: "Gunakan Certs Anda untuk menarik calon pendana atau sebagai laporan kemajuan bagi pendana yang sudah bekerja dengan Anda.", hrefKey: "shareWithFunders" },
    ],
    funderActions: [
      { icon: "⌕", title: "Jelajahi proyek terverifikasi", body: "Temukan proyek penjagaan lingkungan dari komunitas yang aktif melindungi alam, semuanya didukung oleh bukti lapangan nyata.", hrefKey: "browseProjects" },
      { icon: "▤", title: "Lihat sertifikat dan bukti", body: "Setiap proyek memiliki Certs yang menunjukkan bukti kerja mereka: observasi keanekaragaman hayati, data pohon, citra drone, audio, laporan tertulis, dan lainnya.", hrefKey: "viewCerts" },
      { icon: "♡", title: "Terhubung dan danai komunitas", body: "Hubungi komunitas di balik proyek dan dukung yang sesuai dengan tujuan pendanaan Anda.", hrefKey: "organizations" },
    ],
    bonusLabel: "Bonus",
    bonusTitle: "Bergabung dengan Jaringan Komunitas GainForest",
    bonusBody: "Sebagai penjaga alam, Anda juga dapat mengakses jaringan komunitas kami. Isi formulir untuk bergabung:",
    bonusItems: ["Panggilan komunitas bulanan", "Grup WhatsApp untuk terhubung dengan mitra komunitas lain", "Sesi peningkatan kapasitas tentang teknologi penjagaan lingkungan"],
    bonusLinkLabel: "Isi formulir",
    signoff: "Selamat bergabung,",
    teamName: "Tim GainForest",
    directFooter: "Anda menerima email ini karena membuat akun GainForest.",
    inviteFooter: "Anda menerima email ini karena bergabung dengan organisasi GainForest.",
  },
} satisfies Record<SupportedLanguageCode, WelcomeCopy>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function absoluteUrl(siteUrl: string, path: string): string {
  try {
    return new URL(path, siteUrl).toString();
  } catch {
    return path;
  }
}

function resolveCommunityFormUrl(explicitUrl?: string): string | null {
  const configuredUrl = explicitUrl?.trim() || process.env.WELCOME_COMMUNITY_FORM_URL?.trim();
  if (configuredUrl) return configuredUrl;
  return process.env.NODE_ENV === "production" ? null : DUMMY_COMMUNITY_FORM_URL;
}

function resolveLinks(siteUrl: string, communityFormUrl: string | null): WelcomeEmailLinks {
  const base = siteUrl.replace(/\/$/, "");
  return {
    manage: absoluteUrl(base, "/manage"),
    organizationSetup: absoluteUrl(base, "/manage?mode=onboard-org"),
    createProject: absoluteUrl(base, "/manage/projects?mode=new"),
    createCert: absoluteUrl(base, "/manage/certs/new"),
    uploadEvidence: absoluteUrl(base, "/manage/trees?mode=upload"),
    shareWithFunders: absoluteUrl(base, "/manage/certs"),
    browseProjects: absoluteUrl(base, "/projects"),
    viewCerts: absoluteUrl(base, "/certs"),
    organizations: absoluteUrl(base, "/organizations"),
    communityForm: communityFormUrl,
  };
}

const WELCOME_EMOJI: Record<WelcomeActionHrefKey, string> = {
  manage: "✏️",
  organizationSetup: "🏛",
  createProject: "🌱",
  createCert: "📜",
  uploadEvidence: "⬆",
  shareWithFunders: "🤝",
  browseProjects: "🔍",
  viewCerts: "📋",
  organizations: "🌐",
};

function renderActions(actions: WelcomeAction[], links: WelcomeEmailLinks): string {
  return actions.map((action) => {
    const href = links[action.hrefKey];
    const emoji = WELCOME_EMOJI[action.hrefKey];
    return `
      <tr>
        <td width="40" valign="top" style="padding: 2px 14px 26px 0; width: 40px; font-size: 22px; line-height: 1; text-align: left;">${emoji}</td>
        <td valign="top" style="padding: 1px 0 26px 0; text-align: left;">
          <a href="${escapeHtml(href)}" style="display: inline-block; margin: 0 0 6px; color: #0f1f16; font-size: 14px; line-height: 1.3; font-weight: 700; text-decoration: none; letter-spacing: -0.01em;">${escapeHtml(action.title)}</a>
          <p style="margin: 0; color: #5f6964; font-size: 13px; line-height: 1.7;">${escapeHtml(action.body)}</p>
        </td>
      </tr>`;
  }).join("");
}

function renderBonus(copy: WelcomeCopy, links: WelcomeEmailLinks): string {
  if (!links.communityForm) return "";
  const items = copy.bonusItems.map((item) => `<li style="margin: 0 0 8px; color: #315a43;">${escapeHtml(item)}</li>`).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 28px; background: #eef7f1; border-radius: 14px;">
      <tr>
        <td style="padding: 22px 24px;">
          <span style="display: inline-block; margin: 0 0 12px; border-radius: 999px; background: #3e7053; color: #ffffff; padding: 3px 10px; font-size: 10px; line-height: 1.4; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">${escapeHtml(copy.bonusLabel)}</span>
          <h2 style="margin: 0 0 10px; color: #0f1f16; font-size: 15px; line-height: 1.4; font-weight: 700; letter-spacing: -0.01em;">${escapeHtml(copy.bonusTitle)}</h2>
          <p style="margin: 0 0 12px; color: #315a43; font-size: 13px; line-height: 1.7;">${escapeHtml(copy.bonusBody)}</p>
          <ul style="margin: 0 0 18px; padding-left: 18px; font-size: 13px; line-height: 1.55; text-align: left;">${items}</ul>
          <a href="${escapeHtml(links.communityForm)}" style="display: inline-block; color: #ffffff; background: #3e7053; font-size: 12px; line-height: 1; font-weight: 700; text-decoration: none; padding: 9px 18px; border-radius: 999px;">${escapeHtml(copy.bonusLinkLabel)} &#8594;</a>
        </td>
      </tr>
    </table>`;
}

function inviteIntroTemplate(copy: WelcomeCopy, values: Record<string, string>): string {
  return values.inviterName ? copy.inviteIntroWithInviter : copy.inviteIntro;
}

function renderText({
  copy,
  variant,
  values,
  includeBonus,
}: {
  copy: WelcomeCopy;
  variant: WelcomeEmailVariant;
  values: Record<string, string>;
  includeBonus: boolean;
}): string {
  const heading = interpolate(variant === "organization-invite" ? copy.inviteHeading : copy.directHeading, values);
  const intro = interpolate(variant === "organization-invite" ? inviteIntroTemplate(copy, values) : copy.directIntro, values);
  const primaryActions = variant === "organization-invite" ? copy.inviteActions : copy.stewardActions;
  const sections = [
    heading,
    interpolate(copy.greeting, values),
    intro,
    "",
    ...(variant === "direct-signup" ? [copy.stewardHeading] : []),
    ...primaryActions.flatMap((action) => [`- ${action.title}`, `  ${action.body}`]),
    "",
    ...(includeBonus ? [
      `${copy.bonusLabel}: ${copy.bonusTitle}`,
      copy.bonusBody,
      ...copy.bonusItems.map((item) => `- ${item}`),
      "",
    ] : []),
    ...(variant === "direct-signup" ? [copy.funderHeading, ...copy.funderActions.flatMap((action) => [`- ${action.title}`, `  ${action.body}`]), ""] : []),
    copy.signoff,
    copy.teamName,
    "",
    variant === "organization-invite" ? copy.inviteFooter : copy.directFooter,
  ];
  return sections.filter((line) => line !== undefined).join("\n");
}

export function resolveWelcomeEmailLocale(options: {
  explicitLocale?: string | null;
  acceptLanguage?: string | null;
}): SupportedLanguageCode {
  if (options.explicitLocale) {
    const normalized = options.explicitLocale.trim().toLowerCase();
    if (isSupportedLanguageCode(normalized)) return normalized;

    const baseLocale = normalized.split("-")[0];
    if (isSupportedLanguageCode(baseLocale)) return baseLocale;
  }

  return resolvePreferredLanguageFromHeader(options.acceptLanguage);
}

export function getWelcomeEmailLocales(): readonly SupportedLanguageCode[] {
  return SUPPORTED_LOCALES;
}

export function renderWelcomeEmailTemplate({
  variant,
  locale = DEFAULT_LANGUAGE,
  name,
  organizationName,
  appName = "GainForest",
  logoUri,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://certs-rewrite.gainforest.app",
  communityFormUrl,
  invitedByName,
}: {
  variant: WelcomeEmailVariant;
  locale?: SupportedLanguageCode;
  name?: string | null;
  organizationName?: string | null;
  appName?: string;
  logoUri?: string | null;
  siteUrl?: string;
  communityFormUrl?: string;
  invitedByName?: string | null;
  invitedByEmail?: string | null;
}): WelcomeEmailRenderResult {
  const copy = copyByLocale[locale];
  const safeName = name?.trim() || copy.fallbackName;
  const safeOrganizationName = organizationName?.trim() || copy.fallbackOrganizationName;
  const safeInviterName = invitedByName?.trim() || "";
  const values = { name: safeName, organizationName: safeOrganizationName, inviterName: safeInviterName };
  const subject = interpolate(variant === "organization-invite" ? copy.inviteSubject : copy.directSubject, values);
  const intro = interpolate(variant === "organization-invite" ? inviteIntroTemplate(copy, values) : copy.directIntro, values);
  const links = resolveLinks(siteUrl, resolveCommunityFormUrl(communityFormUrl));
  const primaryActions = variant === "organization-invite" ? copy.inviteActions : copy.stewardActions;
  const footer = variant === "organization-invite" ? copy.inviteFooter : copy.directFooter;
  const resolvedLogoUri = logoUri?.trim() || absoluteUrl(siteUrl, "/assets/media/images/app-icon.png");
  const logo = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 0 auto;">
    <tr>
      <td width="38" align="center" valign="middle" style="width: 38px; padding: 0 12px 0 0;">
        <img src="${escapeHtml(resolvedLogoUri)}" alt="" width="32" height="32" style="display: block; width: 32px; height: 32px; border: 0; border-radius: 8px;" />
      </td>
      <td valign="middle" style="color: #ffffff; font-size: 17px; line-height: 1; font-weight: 700; letter-spacing: -0.01em;">${escapeHtml(appName)}</td>
    </tr>
  </table>`;

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" type="text/css" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Instrument+Serif:ital@0;1&display=swap');
    @media only screen and (max-width: 480px) {
      .email-outer { padding: 16px 8px !important; }
      .email-header { padding: 20px 20px !important; }
      .email-body { padding: 24px 20px 16px !important; }
      .email-footer { padding: 12px 20px 24px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background: #ffffff; color: #171717; font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; margin: 0; padding: 0;">
    <tr>
      <td align="center" class="email-outer" style="padding: 40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px;">
          <tr>
            <td class="email-header" style="background: #3e7053; padding: 26px 36px; border-radius: 16px;">
              ${logo}
            </td>
          </tr>
          <tr>
            <td class="email-body" style="padding: 40px 36px 24px; text-align: center;">
              <h1 style="margin: 0 0 18px; color: #0f1f16; font-weight: 400; letter-spacing: -0.02em; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic; text-align: center;">
                <span style="display: block; margin: 0 0 4px; font-size: 20px; line-height: 1.2; font-weight: 400;">${escapeHtml(copy.heroKicker)}</span>
                <span style="display: block; font-size: 32px; line-height: 1.1; font-weight: 400;">${escapeHtml(appName)}</span>
              </h1>
              <p style="margin: 0 0 6px; color: #0f1f16; font-size: 15px; line-height: 1.5; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic;">${escapeHtml(interpolate(copy.greeting, values))}</p>
              ${variant === "organization-invite" ? `<span style="display: inline-block; margin: 10px 0 14px; border-radius: 999px; background: #eef7f1; color: #3e7053; padding: 5px 12px; font-size: 12px; line-height: 1.3; font-weight: 700; letter-spacing: -0.01em;">${escapeHtml(safeOrganizationName)}</span>` : ""}
              <p style="margin: ${variant === "organization-invite" ? "0" : "8px"} 0 32px; color: #5f6964; font-size: 15px; line-height: 1.7; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic;">${escapeHtml(intro)}</p>

              ${variant === "direct-signup" ? `<p style="margin: 0 0 20px; color: #0f1f16; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; text-align: center;">${escapeHtml(copy.stewardHeading)}</p>` : ""}
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align: left;">
                ${renderActions(primaryActions, links)}
              </table>

              ${renderBonus(copy, links)}

              ${variant === "direct-signup" ? `
                <p style="margin: 12px 0 20px; color: #0f1f16; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; text-align: center;">${escapeHtml(copy.funderHeading)}</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align: left;">
                  ${renderActions(copy.funderActions, links)}
                </table>` : ""}

              <p style="margin: 8px 0 0; color: #0f1f16; font-size: 15px; line-height: 1.65; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic;">${escapeHtml(copy.signoff)}<br /><em style="font-style: italic;">${escapeHtml(copy.teamName)}</em></p>
            </td>
          </tr>
          <tr>
            <td align="center" class="email-footer" style="padding: 16px 36px 36px;">
              <p style="margin: 0; color: #9ea8a2; font-size: 12px; line-height: 1.55;">${escapeHtml(footer)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    html,
    text: renderText({ copy, variant, values, includeBonus: Boolean(links.communityForm) }),
  };
}
