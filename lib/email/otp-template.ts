import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LOCALES,
  isSupportedLanguageCode,
  resolvePreferredLanguageFromHeader,
  type SupportedLanguageCode,
} from "@/lib/i18n/languages";

type OtpEmailTemplateCopy = {
  title: string;
  headlinePrefix: string;
  newUserSubtitle: string;
  returningUserSubtitle: string;
  codeLabel: string;
  expiryNotice: string;
  tagline: string;
  attributionSuffix: string;
};

const copyByLocale = {
  en: {
    title: "Sign in to {{app_name}}",
    headlinePrefix: "Sign in to",
    newUserSubtitle: "Welcome — your account is being created.",
    returningUserSubtitle: "Use this code to continue where you left off.",
    codeLabel: "Verification code",
    expiryNotice:
      "This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.",
    tagline: "Regenerating ecosystems, together",
    attributionSuffix: "by GainForest",
  },
  es: {
    title: "Inicia sesión en {{app_name}}",
    headlinePrefix: "Inicia sesión en",
    newUserSubtitle: "Bienvenido: estamos creando tu cuenta.",
    returningUserSubtitle: "Usa este código para continuar donde lo dejaste.",
    codeLabel: "Código de verificación",
    expiryNotice:
      "Este código vence en 10 minutos. Si no lo solicitaste, puedes ignorar este correo con seguridad.",
    tagline: "Regenerando ecosistemas, juntos",
    attributionSuffix: "por GainForest",
  },
  pt: {
    title: "Entrar em {{app_name}}",
    headlinePrefix: "Entrar em",
    newUserSubtitle: "Boas-vindas — sua conta está sendo criada.",
    returningUserSubtitle: "Use este código para continuar de onde parou.",
    codeLabel: "Código de verificação",
    expiryNotice:
      "Este código expira em 10 minutos. Se você não solicitou isso, pode ignorar este email com segurança.",
    tagline: "Regenerando ecossistemas, juntos",
    attributionSuffix: "por GainForest",
  },
  sw: {
    title: "Ingia kwenye {{app_name}}",
    headlinePrefix: "Ingia kwenye",
    newUserSubtitle: "Karibu — akaunti yako inaandaliwa.",
    returningUserSubtitle: "Tumia msimbo huu kuendelea ulipoishia.",
    codeLabel: "Msimbo wa uthibitishaji",
    expiryNotice:
      "Msimbo huu utaisha baada ya dakika 10. Ikiwa hukuomba msimbo huu, unaweza kupuuza barua pepe hii kwa usalama.",
    tagline: "Tukirejesha mifumo ya ikolojia, pamoja",
    attributionSuffix: "na GainForest",
  },
  id: {
    title: "Masuk ke {{app_name}}",
    headlinePrefix: "Masuk ke",
    newUserSubtitle: "Selamat datang — akun Anda sedang dibuat.",
    returningUserSubtitle: "Gunakan kode ini untuk melanjutkan dari tempat terakhir Anda.",
    codeLabel: "Kode verifikasi",
    expiryNotice:
      "Kode ini kedaluwarsa dalam 10 menit. Jika Anda tidak memintanya, Anda dapat mengabaikan email ini dengan aman.",
    tagline: "Meregenerasi ekosistem, bersama",
    attributionSuffix: "oleh GainForest",
  },
} satisfies Record<SupportedLanguageCode, OtpEmailTemplateCopy>;

export function resolveEmailTemplateLocale(options: {
  explicitLocale?: string | null;
  acceptLanguage?: string | null;
}): SupportedLanguageCode {
  if (options.explicitLocale && isSupportedLanguageCode(options.explicitLocale)) {
    return options.explicitLocale;
  }

  return resolvePreferredLanguageFromHeader(options.acceptLanguage);
}

export function getEmailTemplateLocales(): readonly SupportedLanguageCode[] {
  return SUPPORTED_LOCALES;
}

export function renderOtpEmailTemplate(locale: SupportedLanguageCode = DEFAULT_LANGUAGE): string {
  const copy = copyByLocale[locale];

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${copy.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f7f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #0a0a0a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f7f5; margin: 0; padding: 0;">
    <tr>
      <td align="center" style="padding: 48px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px;">
          <tr>
            <td style="padding: 48px 48px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <img src="{{logo_uri}}" alt="{{app_name}}" width="36" height="36" style="display: block; border-radius: 10px;" />
                    <div style="width: 32px; height: 1px; background: #2FCE8A; margin-top: 24px;"></div>
                    <h1 style="margin: 20px 0 0; font-size: 28px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.25; color: #0a0a0a; font-family: 'EB Garamond', Georgia, 'Times New Roman', serif;">
                      ${copy.headlinePrefix}<br />
                      <span style="font-style: italic; color: #0a0a0a;">{{app_name}}</span>
                    </h1>
                    {{#is_new_user}}
                    <p style="margin: 12px 0 0; font-size: 15px; color: #6b7280; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;">${copy.newUserSubtitle}</p>
                    {{/is_new_user}}
                    {{^is_new_user}}
                    <p style="margin: 12px 0 0; font-size: 15px; color: #6b7280; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;">${copy.returningUserSubtitle}</p>
                    {{/is_new_user}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 48px 44px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.15em; color: #9ca3af; margin-bottom: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;">${copy.codeLabel}</div>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f0f7f4; border: 1px solid #c5edd9; border-radius: 12px;">
                      <tr>
                        <td style="padding: 28px 32px; text-align: center;">
                          <span style="font-size: 40px; font-weight: 500; letter-spacing: 0.25em; color: #0a0a0a; font-family: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;">{{code}}</span>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 16px 0 0; font-size: 13px; color: #9ca3af; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;">${copy.expiryNotice}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 48px 44px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top: 1px solid #f0f0f0; padding-top: 24px;">
                    <p style="margin: 0; font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; font-style: italic; font-size: 14px; color: #b0b0b0; line-height: 1.5;">${copy.tagline}</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #c0c0c0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;">{{app_name}} ${copy.attributionSuffix}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
