import {
  DEFAULT_LANGUAGE,
  isSupportedLanguageCode,
  resolvePreferredLanguageFromHeader,
  type SupportedLanguageCode,
} from "@/lib/i18n/languages";
import type { BioblitzPrize } from "@/lib/notifications/bioblitz";

const copy = {
  en: { subject: "You won a BioBlitz prize", heading: "You’re a BioBlitz winner", most: "Most observations", best: "Best picture", body: "Your contribution stood out in {round}.", cta: "View BioBlitz", signoff: "Thank you for documenting nature with the GainForest community." },
  es: { subject: "Ganaste un premio de BioBlitz", heading: "Ganaste en BioBlitz", most: "Más observaciones", best: "Mejor foto", body: "Tu contribución se destacó en {round}.", cta: "Ver BioBlitz", signoff: "Gracias por documentar la naturaleza con la comunidad de GainForest." },
  id: { subject: "Anda memenangkan hadiah BioBlitz", heading: "Anda pemenang BioBlitz", most: "Observasi terbanyak", best: "Foto terbaik", body: "Kontribusi Anda menonjol di {round}.", cta: "Lihat BioBlitz", signoff: "Terima kasih telah mendokumentasikan alam bersama komunitas GainForest." },
  pt: { subject: "Você ganhou um prêmio do BioBlitz", heading: "Você venceu no BioBlitz", most: "Mais observações", best: "Melhor foto", body: "Sua contribuição se destacou em {round}.", cta: "Ver BioBlitz", signoff: "Obrigado por documentar a natureza com a comunidade GainForest." },
  sw: { subject: "Umeshinda tuzo ya BioBlitz", heading: "Wewe ni mshindi wa BioBlitz", most: "Uchunguzi mwingi zaidi", best: "Picha bora", body: "Mchango wako ulijitokeza katika {round}.", cta: "Tazama BioBlitz", signoff: "Asante kwa kurekodi mazingira pamoja na jamii ya GainForest." },
} as const;

function escape(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
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
  const value = copy[locale];
  const prizeLabel = prize === "most-observations" ? value.most : value.best;
  const body = value.body.replace("{round}", roundLabel);
  const href = new URL("/bioblitz", siteUrl).toString();
  const subject = `${value.subject} — ${prizeLabel}`;
  const text = [value.heading, "", prizeLabel, body, "", `${value.cta}: ${href}`, "", value.signoff].join("\n");
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f4f7f4;color:#102218;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="background:#173d2a;color:#fff;padding:28px 32px"><p style="margin:0;font-size:14px;letter-spacing:.08em;text-transform:uppercase">GainForest BioBlitz</p><h1 style="margin:10px 0 0;font-size:30px">${escape(value.heading)}</h1></td></tr><tr><td style="padding:32px"><p style="margin:0 0 8px;font-size:18px;font-weight:700">${escape(prizeLabel)}</p><p style="margin:0 0 24px;line-height:1.6;color:#526158">${escape(body)}</p><a href="${escape(href)}" style="display:inline-block;border-radius:999px;background:#2e6b49;color:#fff;padding:12px 20px;text-decoration:none;font-weight:700">${escape(value.cta)}</a><p style="margin:28px 0 0;line-height:1.6;color:#526158">${escape(value.signoff)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
