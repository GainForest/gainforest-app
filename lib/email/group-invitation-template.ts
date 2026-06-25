import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LOCALES,
  isSupportedLanguageCode,
  resolvePreferredLanguageFromHeader,
  type SupportedLanguageCode,
} from "@/lib/i18n/languages";

export type GroupInvitationEmailRenderResult = {
  subject: string;
  html: string;
  text: string;
};

type InviteCopy = {
  subject: string;
  heroKicker: string;
  heading: string;
  fallbackName: string;
  fallbackOrganizationName: string;
  greeting: string;
  intro: string;
  introWithInviter: string;
  roleLabel: string;
  cta: string;
  nextHeading: string;
  actions: Array<{ emoji: string; title: string; body: string }>;
  signoff: string;
  teamName: string;
  footer: string;
};

const copyByLocale = {
  en: {
    subject: "You’re invited to join {organizationName} on GainForest",
    heroKicker: "Invitation to",
    heading: "GainForest",
    fallbackName: "there",
    fallbackOrganizationName: "an organization",
    greeting: "Hi {name},",
    intro: "An organization admin invited you to collaborate with {organizationName} on GainForest.",
    introWithInviter: "{inviterName} invited you to collaborate with {organizationName} on GainForest.",
    roleLabel: "Role: {role}",
    cta: "Accept invitation",
    nextHeading: "What you can do after joining:",
    actions: [
      { emoji: "▣", title: "Collaborate from one shared space", body: "Work with the organization account without sharing passwords or recovery details." },
      { emoji: "▤", title: "Create and update Certs", body: "Help document project progress with evidence, stories, and verified records." },
      { emoji: "↑", title: "Upload field evidence", body: "Attach observations, trees, images, audio, and reports to the organization’s work." },
    ],
    signoff: "Welcome aboard,",
    teamName: "The GainForest Team",
    footer: "You’re receiving this because someone invited this email address to a GainForest organization.",
  },
  es: {
    subject: "Te invitaron a unirte a {organizationName} en GainForest",
    heroKicker: "Invitación a",
    heading: "GainForest",
    fallbackName: "amigo/a",
    fallbackOrganizationName: "una organización",
    greeting: "Hola {name},",
    intro: "Una persona administradora te invitó a colaborar con {organizationName} en GainForest.",
    introWithInviter: "{inviterName} te invitó a colaborar con {organizationName} en GainForest.",
    roleLabel: "Rol: {role}",
    cta: "Aceptar invitación",
    nextHeading: "Qué puedes hacer después de unirte:",
    actions: [
      { emoji: "▣", title: "Colaborar en un espacio compartido", body: "Trabaja con la cuenta de la organización sin compartir contraseñas ni datos de recuperación." },
      { emoji: "▤", title: "Crear y actualizar Certs", body: "Ayuda a documentar el progreso del proyecto con evidencia, historias y registros verificados." },
      { emoji: "↑", title: "Subir evidencia de campo", body: "Adjunta observaciones, árboles, imágenes, audio e informes al trabajo de la organización." },
    ],
    signoff: "Bienvenido a bordo,",
    teamName: "El equipo de GainForest",
    footer: "Recibes este correo porque alguien invitó esta dirección a una organización de GainForest.",
  },
  pt: {
    subject: "Você foi convidado para entrar em {organizationName} no GainForest",
    heroKicker: "Convite para",
    heading: "GainForest",
    fallbackName: "amigo/a",
    fallbackOrganizationName: "uma organização",
    greeting: "Olá {name},",
    intro: "Uma pessoa administradora convidou você para colaborar com {organizationName} no GainForest.",
    introWithInviter: "{inviterName} convidou você para colaborar com {organizationName} no GainForest.",
    roleLabel: "Função: {role}",
    cta: "Aceitar convite",
    nextHeading: "O que você pode fazer depois de entrar:",
    actions: [
      { emoji: "▣", title: "Colaborar em um espaço compartilhado", body: "Trabalhe com a conta da organização sem compartilhar senhas ou detalhes de recuperação." },
      { emoji: "▤", title: "Criar e atualizar Certs", body: "Ajude a documentar o progresso do projeto com evidências, histórias e registros verificados." },
      { emoji: "↑", title: "Enviar evidências de campo", body: "Anexe observações, árvores, imagens, áudio e relatórios ao trabalho da organização." },
    ],
    signoff: "Boas-vindas,",
    teamName: "Equipe GainForest",
    footer: "Você está recebendo este email porque alguém convidou este endereço para uma organização do GainForest.",
  },
  sw: {
    subject: "Umealikwa kujiunga na {organizationName} kwenye GainForest",
    heroKicker: "Mwaliko wa",
    heading: "GainForest",
    fallbackName: "rafiki",
    fallbackOrganizationName: "shirika",
    greeting: "Habari {name},",
    intro: "Msimamizi wa shirika alikualika kushirikiana na {organizationName} kwenye GainForest.",
    introWithInviter: "{inviterName} alikualika kushirikiana na {organizationName} kwenye GainForest.",
    roleLabel: "Jukumu: {role}",
    cta: "Kubali mwaliko",
    nextHeading: "Unachoweza kufanya baada ya kujiunga:",
    actions: [
      { emoji: "▣", title: "Shirikiana kwenye nafasi moja", body: "Fanya kazi kupitia akaunti ya shirika bila kushiriki nywila au maelezo ya urejeshaji." },
      { emoji: "▤", title: "Unda na usasishe Certs", body: "Saidia kurekodi maendeleo ya mradi kwa ushahidi, hadithi na rekodi zilizothibitishwa." },
      { emoji: "↑", title: "Pakia ushahidi wa nyanjani", body: "Ambatisha uchunguzi, miti, picha, sauti na ripoti kwenye kazi ya shirika." },
    ],
    signoff: "Karibu sana,",
    teamName: "Timu ya GainForest",
    footer: "Unapokea barua pepe hii kwa sababu mtu alialika anwani hii kwenye shirika la GainForest.",
  },
  id: {
    subject: "Anda diundang bergabung dengan {organizationName} di GainForest",
    heroKicker: "Undangan ke",
    heading: "GainForest",
    fallbackName: "teman",
    fallbackOrganizationName: "organisasi",
    greeting: "Hai {name},",
    intro: "Admin organisasi mengundang Anda untuk berkolaborasi dengan {organizationName} di GainForest.",
    introWithInviter: "{inviterName} mengundang Anda untuk berkolaborasi dengan {organizationName} di GainForest.",
    roleLabel: "Peran: {role}",
    cta: "Terima undangan",
    nextHeading: "Yang dapat Anda lakukan setelah bergabung:",
    actions: [
      { emoji: "▣", title: "Berkolaborasi di satu ruang bersama", body: "Bekerja dengan akun organisasi tanpa berbagi kata sandi atau detail pemulihan." },
      { emoji: "▤", title: "Membuat dan memperbarui Certs", body: "Bantu mendokumentasikan kemajuan proyek dengan bukti, cerita, dan catatan terverifikasi." },
      { emoji: "↑", title: "Unggah bukti lapangan", body: "Lampirkan observasi, pohon, gambar, audio, dan laporan ke pekerjaan organisasi." },
    ],
    signoff: "Selamat bergabung,",
    teamName: "Tim GainForest",
    footer: "Anda menerima email ini karena seseorang mengundang alamat ini ke organisasi GainForest.",
  },
} satisfies Record<SupportedLanguageCode, InviteCopy>;

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

export function resolveGroupInvitationEmailLocale(options: {
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

export function getGroupInvitationEmailLocales(): readonly SupportedLanguageCode[] {
  return SUPPORTED_LOCALES;
}

function renderActions(actions: InviteCopy["actions"]): string {
  return actions.map((action) => `
      <tr>
        <td width="40" valign="top" style="padding: 2px 14px 24px 0; width: 40px; font-size: 22px; line-height: 1; text-align: left;">${escapeHtml(action.emoji)}</td>
        <td valign="top" style="padding: 1px 0 24px 0; text-align: left;">
          <p style="margin: 0 0 6px; color: #0f1f16; font-size: 14px; line-height: 1.3; font-weight: 700; letter-spacing: -0.01em;">${escapeHtml(action.title)}</p>
          <p style="margin: 0; color: #5f6964; font-size: 13px; line-height: 1.7;">${escapeHtml(action.body)}</p>
        </td>
      </tr>`).join("");
}

function renderText(copy: InviteCopy, values: Record<string, string>, acceptUrl: string): string {
  return [
    interpolate(copy.subject, values),
    "",
    interpolate(copy.greeting, values),
    interpolate(values.inviterName ? copy.introWithInviter : copy.intro, values),
    interpolate(copy.roleLabel, values),
    "",
    `${copy.cta}: ${acceptUrl}`,
    "",
    copy.nextHeading,
    ...copy.actions.flatMap((action) => [`- ${action.title}`, `  ${action.body}`]),
    "",
    copy.signoff,
    copy.teamName,
    "",
    copy.footer,
  ].join("\n");
}

export function renderGroupInvitationEmailTemplate({
  locale = DEFAULT_LANGUAGE,
  invitedEmail,
  organizationName,
  inviterName,
  role,
  acceptUrl,
  appName = "GainForest",
  logoUri,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://certs-rewrite.gainforest.app",
}: {
  locale?: SupportedLanguageCode;
  invitedEmail: string;
  organizationName?: string | null;
  inviterName?: string | null;
  role: "member" | "admin";
  acceptUrl: string;
  appName?: string;
  logoUri?: string | null;
  siteUrl?: string;
}): GroupInvitationEmailRenderResult {
  const copy = copyByLocale[locale];
  const safeName = invitedEmail.split("@")[0]?.trim() || copy.fallbackName;
  const safeOrganizationName = organizationName?.trim() || copy.fallbackOrganizationName;
  const safeInviterName = inviterName?.trim() || "";
  const values = { name: safeName, organizationName: safeOrganizationName, inviterName: safeInviterName, role };
  const subject = interpolate(copy.subject, values);
  const intro = interpolate(safeInviterName ? copy.introWithInviter : copy.intro, values);
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
                <span style="display: block; font-size: 32px; line-height: 1.1; font-weight: 400;">${escapeHtml(copy.heading)}</span>
              </h1>
              <p style="margin: 0 0 6px; color: #0f1f16; font-size: 15px; line-height: 1.5; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic;">${escapeHtml(interpolate(copy.greeting, values))}</p>
              <span style="display: inline-block; margin: 10px 0 14px; border-radius: 999px; background: #eef7f1; color: #3e7053; padding: 5px 12px; font-size: 12px; line-height: 1.3; font-weight: 700; letter-spacing: -0.01em;">${escapeHtml(safeOrganizationName)}</span>
              <p style="margin: 0 0 18px; color: #5f6964; font-size: 15px; line-height: 1.7; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic;">${escapeHtml(intro)}</p>
              <p style="margin: 0 0 28px; color: #315a43; font-size: 13px; line-height: 1.5; font-weight: 700;">${escapeHtml(interpolate(copy.roleLabel, values))}</p>
              <a href="${escapeHtml(acceptUrl)}" style="display: inline-block; margin: 0 0 34px; color: #ffffff; background: #3e7053; font-size: 13px; line-height: 1; font-weight: 700; text-decoration: none; padding: 12px 22px; border-radius: 999px;">${escapeHtml(copy.cta)} &#8594;</a>

              <p style="margin: 0 0 20px; color: #0f1f16; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; text-align: center;">${escapeHtml(copy.nextHeading)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align: left;">
                ${renderActions(copy.actions)}
              </table>

              <p style="margin: 8px 0 0; color: #0f1f16; font-size: 15px; line-height: 1.65; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic;">${escapeHtml(copy.signoff)}<br /><em style="font-style: italic;">${escapeHtml(copy.teamName)}</em></p>
            </td>
          </tr>
          <tr>
            <td align="center" class="email-footer" style="padding: 16px 36px 36px;">
              <p style="margin: 0; color: #9ea8a2; font-size: 12px; line-height: 1.55;">${escapeHtml(copy.footer)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text: renderText(copy, values, acceptUrl) };
}
