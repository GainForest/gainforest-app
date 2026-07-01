import enLanding from "./en.json";
import esLanding from "./es.json";
import idLanding from "./id.json";
import ptLanding from "./pt.json";
import swLanding from "./sw.json";
import enBumicert from "./en/bumicert.json";
import enCommon from "./en/common.json";
import enMarketplace from "./en/marketplace.json";
import enModals from "./en/modals.json";
import enUpload from "./en/upload.json";
import enLegacy from "./en/legacy.json";
import enPrivacy from "./en/privacy.json";
import esBumicert from "./es/bumicert.json";
import esCommon from "./es/common.json";
import esMarketplace from "./es/marketplace.json";
import esModals from "./es/modals.json";
import esUpload from "./es/upload.json";
import esLegacy from "./es/legacy.json";
import esPrivacy from "./es/privacy.json";
import idBumicert from "./id/bumicert.json";
import idCommon from "./id/common.json";
import idMarketplace from "./id/marketplace.json";
import idModals from "./id/modals.json";
import idUpload from "./id/upload.json";
import idLegacy from "./id/legacy.json";
import idPrivacy from "./id/privacy.json";
import ptBumicert from "./pt/bumicert.json";
import ptCommon from "./pt/common.json";
import ptMarketplace from "./pt/marketplace.json";
import ptModals from "./pt/modals.json";
import ptUpload from "./pt/upload.json";
import ptLegacy from "./pt/legacy.json";
import ptPrivacy from "./pt/privacy.json";
import swBumicert from "./sw/bumicert.json";
import swCommon from "./sw/common.json";
import swMarketplace from "./sw/marketplace.json";
import swModals from "./sw/modals.json";
import swUpload from "./sw/upload.json";
import swLegacy from "./sw/legacy.json";
import swPrivacy from "./sw/privacy.json";
import type { SupportedLanguageCode } from "@/lib/i18n/languages";

export const messagesByLocale = {
  en: {
    ...enLanding,
    common: enCommon,
    marketplace: enMarketplace,
    bumicert: enBumicert,
    upload: enUpload,
    modals: enModals,
    legacy: enLegacy,
    privacy: enPrivacy,
  },
  es: {
    ...esLanding,
    common: esCommon,
    marketplace: esMarketplace,
    bumicert: esBumicert,
    upload: esUpload,
    modals: esModals,
    legacy: esLegacy,
    privacy: esPrivacy,
  },
  pt: {
    ...ptLanding,
    common: ptCommon,
    marketplace: ptMarketplace,
    bumicert: ptBumicert,
    upload: ptUpload,
    modals: ptModals,
    legacy: ptLegacy,
    privacy: ptPrivacy,
  },
  sw: {
    ...swLanding,
    common: swCommon,
    marketplace: swMarketplace,
    bumicert: swBumicert,
    upload: swUpload,
    modals: swModals,
    legacy: swLegacy,
    privacy: swPrivacy,
  },
  id: {
    ...idLanding,
    common: idCommon,
    marketplace: idMarketplace,
    bumicert: idBumicert,
    upload: idUpload,
    modals: idModals,
    legacy: idLegacy,
    privacy: idPrivacy,
  },
} satisfies Record<SupportedLanguageCode, object>;
