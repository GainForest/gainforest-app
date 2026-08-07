import {
  DEFAULT_LANGUAGE,
  isSupportedLanguageCode,
  resolvePreferredLanguageFromHeader,
  type SupportedLanguageCode,
} from "@/lib/i18n/languages";
import { BIOBLITZ_PRIZES, type BioblitzPrize } from "@/lib/bioblitz-prizes";

const SUPPORT_EMAIL = "fatin@gainforest.net";

type WinnerCopy = {
  subject: string;
  preheader: string;
  heading: string;
  confirmation: string;
  prizes: Record<BioblitzPrize, { label: string; appreciation: string }>;
  awardHeading: string;
  categoryLabel: string;
  paymentLabel: string;
  instructionsHeading: string;
  instructionsIntro: string;
  alreadyHasWallet: string;
  createWalletStep: string;
  distributionStep: string;
  cta: string;
  help: string;
  thanks: string;
  teamName: string;
  footer: string;
};

const copyByLocale = {
  en: {
    subject: "Congrats! You won “{prize}” in BioBlitz {round} 🎉",
    preheader: "Your {amount} award details and how to receive your payment.",
    heading: "Congratulations! 🎉",
    confirmation: "We’re happy to confirm that you won “{prize}” in BioBlitz {round}.",
    prizes: {
      "most-observations": {
        label: "Most Observations",
        appreciation: "Thank you for the time and care you put into documenting nature. Your observations help make local biodiversity more visible and useful.",
      },
      "best-picture": {
        label: "Best Picture",
        appreciation: "Your photo stood out for the way it captured nature. Thank you for sharing it with the GainForest community.",
      },
    },
    awardHeading: "Your award",
    categoryLabel: "Category",
    paymentLabel: "Payment amount",
    instructionsHeading: "How to receive your payment",
    instructionsIntro: "Your payment will be sent to the wallet connected to your GainForest account.",
    alreadyHasWallet: "If you already have a GainForest wallet, you don’t need to do anything.",
    createWalletStep: "If you don’t have one yet, use the button below to create one with a passkey such as Face ID, your fingerprint, or a security key.",
    distributionStep: "Once your wallet is ready, GainForest will send your payment within 7–10 business days.",
    cta: "Create your wallet",
    help: "Need help setting up your wallet or converting your payment into local currency? Email us at {email} and we’ll help you through the process.",
    thanks: "Thank you for taking part in BioBlitz {round}.",
    teamName: "The GainForest team",
    footer: "You’re receiving this because you won a BioBlitz award on GainForest.",
  },
  es: {
    subject: "¡Felicidades! Ganaste “{prize}” en BioBlitz {round} 🎉",
    preheader: "Los detalles de tu premio de {amount} y cómo recibir el pago.",
    heading: "¡Felicidades! 🎉",
    confirmation: "Nos alegra confirmar que ganaste “{prize}” en BioBlitz {round}.",
    prizes: {
      "most-observations": {
        label: "Más observaciones",
        appreciation: "Gracias por el tiempo y el cuidado que dedicaste a documentar la naturaleza. Tus observaciones ayudan a que la biodiversidad local sea más visible y útil.",
      },
      "best-picture": {
        label: "Mejor foto",
        appreciation: "Tu foto destacó por la forma en que capturó la naturaleza. Gracias por compartirla con la comunidad de GainForest.",
      },
    },
    awardHeading: "Tu premio",
    categoryLabel: "Categoría",
    paymentLabel: "Importe del pago",
    instructionsHeading: "Cómo recibir tu pago",
    instructionsIntro: "Tu pago se enviará a la billetera conectada a tu cuenta de GainForest.",
    alreadyHasWallet: "Si ya tienes una billetera de GainForest, no tienes que hacer nada.",
    createWalletStep: "Si todavía no tienes una, usa el botón de abajo para crearla con una llave de acceso, como Face ID, tu huella digital o una llave de seguridad.",
    distributionStep: "Cuando tu billetera esté lista, GainForest enviará tu pago en un plazo de 7 a 10 días laborables.",
    cta: "Crear tu billetera",
    help: "¿Necesitas ayuda para configurar tu billetera o convertir el pago a tu moneda local? Escríbenos a {email} y te ayudaremos durante el proceso.",
    thanks: "Gracias por participar en BioBlitz {round}.",
    teamName: "El equipo de GainForest",
    footer: "Recibes este correo porque ganaste un premio de BioBlitz en GainForest.",
  },
  pt: {
    subject: "Parabéns! Você ganhou “{prize}” no BioBlitz {round} 🎉",
    preheader: "Os detalhes do seu prêmio de {amount} e como receber o pagamento.",
    heading: "Parabéns! 🎉",
    confirmation: "Temos o prazer de confirmar que você ganhou “{prize}” no BioBlitz {round}.",
    prizes: {
      "most-observations": {
        label: "Mais observações",
        appreciation: "Agradecemos o tempo e o cuidado que você dedicou a documentar a natureza. Suas observações ajudam a tornar a biodiversidade local mais visível e útil.",
      },
      "best-picture": {
        label: "Melhor foto",
        appreciation: "Sua foto se destacou pela forma como capturou a natureza. Agradecemos por compartilhá-la com a comunidade do GainForest.",
      },
    },
    awardHeading: "Seu prêmio",
    categoryLabel: "Categoria",
    paymentLabel: "Valor do pagamento",
    instructionsHeading: "Como receber seu pagamento",
    instructionsIntro: "Seu pagamento será enviado para a carteira conectada à sua conta do GainForest.",
    alreadyHasWallet: "Se você já tem uma carteira do GainForest, não precisa fazer nada.",
    createWalletStep: "Se ainda não tem uma, use o botão abaixo para criá-la com uma chave de acesso, como Face ID, impressão digital ou chave de segurança.",
    distributionStep: "Quando sua carteira estiver pronta, o GainForest enviará seu pagamento dentro de 7 a 10 dias úteis.",
    cta: "Criar sua carteira",
    help: "Precisa de ajuda para configurar sua carteira ou converter o pagamento para sua moeda local? Envie um email para {email} e ajudaremos você durante o processo.",
    thanks: "Agradecemos sua participação no BioBlitz {round}.",
    teamName: "Equipe GainForest",
    footer: "Você está recebendo este email porque ganhou um prêmio do BioBlitz no GainForest.",
  },
  sw: {
    subject: "Hongera! Umeshinda “{prize}” katika BioBlitz {round} 🎉",
    preheader: "Maelezo ya tuzo yako ya {amount} na jinsi ya kupokea malipo yako.",
    heading: "Hongera! 🎉",
    confirmation: "Tunafurahi kuthibitisha kwamba umeshinda “{prize}” katika BioBlitz {round}.",
    prizes: {
      "most-observations": {
        label: "Uchunguzi mwingi zaidi",
        appreciation: "Asante kwa muda na umakini uliotumia kurekodi mazingira. Uchunguzi wako husaidia kufanya bayoanuwai ya eneo lako ionekane na itumike zaidi.",
      },
      "best-picture": {
        label: "Picha bora",
        appreciation: "Picha yako ilijitokeza kwa jinsi ilivyonasa mazingira. Asante kwa kuishiriki na jamii ya GainForest.",
      },
    },
    awardHeading: "Tuzo yako",
    categoryLabel: "Kategoria",
    paymentLabel: "Kiasi cha malipo",
    instructionsHeading: "Jinsi ya kupokea malipo yako",
    instructionsIntro: "Malipo yako yatatumwa kwenye pochi iliyounganishwa na akaunti yako ya GainForest.",
    alreadyHasWallet: "Ikiwa tayari una pochi ya GainForest, huhitaji kufanya chochote.",
    createWalletStep: "Ikiwa bado huna pochi, tumia kitufe kilicho hapa chini kuiunda kwa ufunguo wa siri kama vile Face ID, alama ya kidole au ufunguo wa usalama.",
    distributionStep: "Pochi yako ikishakuwa tayari, GainForest itatuma malipo yako ndani ya siku 7–10 za kazi.",
    cta: "Unda pochi yako",
    help: "Unahitaji msaada wa kuweka pochi yako au kubadilisha malipo yako kuwa sarafu ya eneo lako? Tutumie barua pepe kwa {email} na tutakusaidia katika hatua zote.",
    thanks: "Asante kwa kushiriki katika BioBlitz {round}.",
    teamName: "Timu ya GainForest",
    footer: "Unapokea barua pepe hii kwa sababu ulishinda tuzo ya BioBlitz kwenye GainForest.",
  },
  id: {
    subject: "Selamat! Anda memenangkan “{prize}” di BioBlitz {round} 🎉",
    preheader: "Detail hadiah {amount} Anda dan cara menerima pembayaran.",
    heading: "Selamat! 🎉",
    confirmation: "Kami senang mengonfirmasi bahwa Anda memenangkan “{prize}” di BioBlitz {round}.",
    prizes: {
      "most-observations": {
        label: "Observasi terbanyak",
        appreciation: "Terima kasih atas waktu dan perhatian yang Anda berikan untuk mendokumentasikan alam. Observasi Anda membantu membuat keanekaragaman hayati setempat lebih terlihat dan bermanfaat.",
      },
      "best-picture": {
        label: "Foto terbaik",
        appreciation: "Foto Anda menonjol karena caranya menangkap keindahan alam. Terima kasih telah membagikannya kepada komunitas GainForest.",
      },
    },
    awardHeading: "Hadiah Anda",
    categoryLabel: "Kategori",
    paymentLabel: "Jumlah pembayaran",
    instructionsHeading: "Cara menerima pembayaran Anda",
    instructionsIntro: "Pembayaran Anda akan dikirim ke dompet yang terhubung ke akun GainForest Anda.",
    alreadyHasWallet: "Jika Anda sudah memiliki dompet GainForest, Anda tidak perlu melakukan apa pun.",
    createWalletStep: "Jika belum memilikinya, gunakan tombol di bawah untuk membuat dompet dengan kunci sandi seperti Face ID, sidik jari, atau kunci keamanan.",
    distributionStep: "Setelah dompet Anda siap, GainForest akan mengirimkan pembayaran dalam 7–10 hari kerja.",
    cta: "Buat dompet Anda",
    help: "Perlu bantuan menyiapkan dompet atau mengonversi pembayaran ke mata uang lokal? Kirim email kepada kami di {email} dan kami akan membantu Anda melalui prosesnya.",
    thanks: "Terima kasih telah berpartisipasi dalam BioBlitz {round}.",
    teamName: "Tim GainForest",
    footer: "Anda menerima email ini karena memenangkan hadiah BioBlitz di GainForest.",
  },
} satisfies Record<SupportedLanguageCode, WinnerCopy>;

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

function interpolateHtml(template: string, values: Record<string, string>, htmlValues: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => htmlValues[key] ?? escapeHtml(values[key] ?? ""));
}

function absoluteUrl(siteUrl: string, path: string): string {
  try {
    return new URL(path, siteUrl).toString();
  } catch {
    return path;
  }
}

export function resolveBioblitzWinnerLocale(options: { explicitLocale?: string | null; acceptLanguage?: string | null }): SupportedLanguageCode {
  const normalized = options.explicitLocale?.trim().toLowerCase();
  if (normalized) {
    if (isSupportedLanguageCode(normalized)) return normalized;
    const base = normalized.split("-")[0];
    if (isSupportedLanguageCode(base)) return base;
  }
  return resolvePreferredLanguageFromHeader(options.acceptLanguage);
}

export function renderBioblitzWinnerEmail({
  locale = DEFAULT_LANGUAGE,
  roundLabel,
  prize,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gainforest.app",
}: {
  locale?: SupportedLanguageCode;
  roundLabel: string;
  prize: BioblitzPrize;
  siteUrl?: string;
}) {
  const copy = copyByLocale[locale];
  const prizeCopy = copy.prizes[prize];
  const amount = prize === "most-observations" ? BIOBLITZ_PRIZES.mostObservations : BIOBLITZ_PRIZES.bestPicture;
  const paymentAmount = `$${amount} USD`;
  const values = { amount: paymentAmount, email: SUPPORT_EMAIL, prize: prizeCopy.label, round: roundLabel };
  const subject = interpolate(copy.subject, values);
  const preheader = interpolate(copy.preheader, values);
  const confirmation = interpolate(copy.confirmation, values);
  const walletUrl = absoluteUrl(siteUrl, "/account/wallet");
  const logoUrl = absoluteUrl(siteUrl, "/assets/media/images/app-icon.png");
  const thanks = interpolate(copy.thanks, values);
  const helpText = interpolate(copy.help, values);
  const helpHtml = interpolateHtml(copy.help, values, {
    email: `<a href="mailto:${SUPPORT_EMAIL}" style="color: #315a43; font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px;">${SUPPORT_EMAIL}</a>`,
  });

  const text = [
    copy.heading,
    "",
    confirmation,
    prizeCopy.appreciation,
    "",
    copy.awardHeading,
    `${copy.categoryLabel}: ${prizeCopy.label}`,
    `${copy.paymentLabel}: ${paymentAmount}`,
    "",
    copy.instructionsHeading,
    copy.instructionsIntro,
    `- ${copy.alreadyHasWallet}`,
    `- ${copy.createWalletStep}`,
    `- ${copy.distributionStep}`,
    "",
    `${copy.cta}: ${walletUrl}`,
    "",
    helpText,
    "",
    thanks,
    copy.teamName,
    "",
    copy.footer,
  ].join("\n");

  const logo = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 0 auto;">
    <tr>
      <td width="38" align="center" valign="middle" style="width: 38px; padding: 0 12px 0 0;">
        <img src="${escapeHtml(logoUrl)}" alt="" width="32" height="32" style="display: block; width: 32px; height: 32px; border: 0; border-radius: 8px;" />
      </td>
      <td valign="middle" style="color: #ffffff; font-size: 17px; line-height: 1; font-weight: 700; letter-spacing: -0.01em;">GainForest</td>
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
      .email-header { padding: 20px !important; }
      .email-body { padding: 24px 20px 16px !important; }
      .email-footer { padding: 12px 20px 24px !important; }
      .award-card { padding: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background: #ffffff; color: #171717; font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">${escapeHtml(preheader)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background: #ffffff; margin: 0; padding: 0;">
    <tr>
      <td align="center" class="email-outer" style="padding: 40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width: 100%; max-width: 600px;">
          <tr>
            <td class="email-header" style="background: #3e7053; padding: 26px 36px; border-radius: 16px;">
              ${logo}
            </td>
          </tr>
          <tr>
            <td class="email-body" style="padding: 40px 36px 24px; text-align: center;">
              <h1 style="margin: 0 0 18px; color: #0f1f16; font-weight: 400; letter-spacing: -0.02em; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic; text-align: center;">
                <span style="display: block; margin: 0 0 6px; font-size: 20px; line-height: 1.2; font-weight: 400;">${escapeHtml(copy.heading)}</span>
                <span style="display: block; font-size: 36px; line-height: 1.05; font-weight: 400;">${escapeHtml(prizeCopy.label)}</span>
                <span style="display: block; margin: 8px 0 0; font-size: 16px; line-height: 1.25; font-weight: 400; color: #5f6964;">BioBlitz ${escapeHtml(roundLabel)}</span>
              </h1>
              <p style="margin: 8px 0 10px; color: #0f1f16; font-size: 15px; line-height: 1.7; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic;">${escapeHtml(confirmation)}</p>
              <p style="margin: 0 0 28px; color: #5f6964; font-size: 14px; line-height: 1.7;">${escapeHtml(prizeCopy.appreciation)}</p>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 0 0 32px; background: #eef7f1; border-radius: 14px; text-align: left;">
                <tr>
                  <td class="award-card" style="padding: 22px 24px;">
                    <p style="margin: 0 0 14px; color: #0f1f16; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;">${escapeHtml(copy.awardHeading)}</p>
                    <p style="margin: 0 0 8px; color: #315a43; font-size: 14px; line-height: 1.5;"><strong>${escapeHtml(copy.categoryLabel)}:</strong> ${escapeHtml(prizeCopy.label)}</p>
                    <p style="margin: 0; color: #315a43; font-size: 14px; line-height: 1.5;"><strong>${escapeHtml(copy.paymentLabel)}:</strong> ${escapeHtml(paymentAmount)}</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px; color: #0f1f16; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; text-align: center;">${escapeHtml(copy.instructionsHeading)}</p>
              <p style="margin: 0 0 22px; color: #5f6964; font-size: 14px; line-height: 1.7;">${escapeHtml(copy.instructionsIntro)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin: 0 0 8px; text-align: left;">
                <tr>
                  <td width="40" valign="top" style="padding: 2px 14px 20px 0; width: 40px; font-size: 21px; line-height: 1;">✓</td>
                  <td valign="top" style="padding: 0 0 20px; color: #5f6964; font-size: 13px; line-height: 1.7;">${escapeHtml(copy.alreadyHasWallet)}</td>
                </tr>
                <tr>
                  <td width="40" valign="top" style="padding: 2px 14px 20px 0; width: 40px; font-size: 21px; line-height: 1;">🔐</td>
                  <td valign="top" style="padding: 0 0 20px; color: #5f6964; font-size: 13px; line-height: 1.7;">${escapeHtml(copy.createWalletStep)}</td>
                </tr>
                <tr>
                  <td width="40" valign="top" style="padding: 2px 14px 20px 0; width: 40px; font-size: 21px; line-height: 1;">💵</td>
                  <td valign="top" style="padding: 0 0 20px; color: #5f6964; font-size: 13px; line-height: 1.7;">${escapeHtml(copy.distributionStep)}</td>
                </tr>
              </table>

              <a href="${escapeHtml(walletUrl)}" style="display: inline-block; margin: 0 0 30px; color: #ffffff; background: #3e7053; font-size: 13px; line-height: 1; font-weight: 700; text-decoration: none; padding: 12px 22px; border-radius: 999px;">${escapeHtml(copy.cta)} &#8594;</a>
              <p style="margin: 0 0 28px; padding: 18px 20px; border-radius: 12px; background: #f7f9f7; color: #5f6964; font-size: 13px; line-height: 1.7;">${helpHtml}</p>
              <p style="margin: 0; color: #0f1f16; font-size: 15px; line-height: 1.65; font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; font-style: italic;">${escapeHtml(thanks)}<br /><em style="font-style: italic;">${escapeHtml(copy.teamName)}</em></p>
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

  return { subject, html, text };
}
