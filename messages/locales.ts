import enLanding from "./en.json";
import esLanding from "./es.json";
import idLanding from "./id.json";
import ptLanding from "./pt.json";
import swLanding from "./sw.json";
import enAudioMothGuide from "./en/audiomothGuide.json";
import enBumicert from "./en/bumicert.json";
import enCart from "./en/cart.json";
import enCommon from "./en/common.json";
import enDeleteAccount from "./en/deleteAccount.json";
import enMarketplace from "./en/marketplace.json";
import enModals from "./en/modals.json";
import enUpload from "./en/upload.json";
import enLegacy from "./en/legacy.json";
import enPrivacy from "./en/privacy.json";
import enChangelog from "./en/changelog.json";
import enTainaGuide from "./en/tainaGuide.json";
import esAudioMothGuide from "./es/audiomothGuide.json";
import esBumicert from "./es/bumicert.json";
import esCart from "./es/cart.json";
import esCommon from "./es/common.json";
import esDeleteAccount from "./es/deleteAccount.json";
import esMarketplace from "./es/marketplace.json";
import esModals from "./es/modals.json";
import esUpload from "./es/upload.json";
import esLegacy from "./es/legacy.json";
import esPrivacy from "./es/privacy.json";
import esChangelog from "./es/changelog.json";
import esTainaGuide from "./es/tainaGuide.json";
import idAudioMothGuide from "./id/audiomothGuide.json";
import idBumicert from "./id/bumicert.json";
import idCart from "./id/cart.json";
import idCommon from "./id/common.json";
import idDeleteAccount from "./id/deleteAccount.json";
import idMarketplace from "./id/marketplace.json";
import idModals from "./id/modals.json";
import idUpload from "./id/upload.json";
import idLegacy from "./id/legacy.json";
import idPrivacy from "./id/privacy.json";
import idChangelog from "./id/changelog.json";
import idTainaGuide from "./id/tainaGuide.json";
import ptAudioMothGuide from "./pt/audiomothGuide.json";
import ptBumicert from "./pt/bumicert.json";
import ptCart from "./pt/cart.json";
import ptCommon from "./pt/common.json";
import ptDeleteAccount from "./pt/deleteAccount.json";
import ptMarketplace from "./pt/marketplace.json";
import ptModals from "./pt/modals.json";
import ptUpload from "./pt/upload.json";
import ptLegacy from "./pt/legacy.json";
import ptPrivacy from "./pt/privacy.json";
import ptChangelog from "./pt/changelog.json";
import ptTainaGuide from "./pt/tainaGuide.json";
import swAudioMothGuide from "./sw/audiomothGuide.json";
import swBumicert from "./sw/bumicert.json";
import swCart from "./sw/cart.json";
import swCommon from "./sw/common.json";
import swDeleteAccount from "./sw/deleteAccount.json";
import swMarketplace from "./sw/marketplace.json";
import swModals from "./sw/modals.json";
import swUpload from "./sw/upload.json";
import swLegacy from "./sw/legacy.json";
import swPrivacy from "./sw/privacy.json";
import swChangelog from "./sw/changelog.json";
import swTainaGuide from "./sw/tainaGuide.json";
import type { SupportedLanguageCode } from "@/lib/i18n/languages";

export const messagesByLocale = {
  en: {
    ...enLanding,
    audiomothGuide: enAudioMothGuide,
    common: enCommon,
    marketplace: enMarketplace,
    bumicert: enBumicert,
    cart: enCart,
    upload: enUpload,
    modals: enModals,
    legacy: enLegacy,
    privacy: enPrivacy,
    deleteAccount: enDeleteAccount,
    changelog: enChangelog,
    tainaGuide: enTainaGuide,
  },
  es: {
    ...esLanding,
    audiomothGuide: esAudioMothGuide,
    common: esCommon,
    marketplace: esMarketplace,
    bumicert: esBumicert,
    cart: esCart,
    upload: esUpload,
    modals: esModals,
    legacy: esLegacy,
    privacy: esPrivacy,
    deleteAccount: esDeleteAccount,
    changelog: esChangelog,
    tainaGuide: esTainaGuide,
  },
  pt: {
    ...ptLanding,
    audiomothGuide: ptAudioMothGuide,
    common: ptCommon,
    marketplace: ptMarketplace,
    bumicert: ptBumicert,
    cart: ptCart,
    upload: ptUpload,
    modals: ptModals,
    legacy: ptLegacy,
    privacy: ptPrivacy,
    deleteAccount: ptDeleteAccount,
    changelog: ptChangelog,
    tainaGuide: ptTainaGuide,
  },
  sw: {
    ...swLanding,
    audiomothGuide: swAudioMothGuide,
    common: swCommon,
    marketplace: swMarketplace,
    bumicert: swBumicert,
    cart: swCart,
    upload: swUpload,
    modals: swModals,
    legacy: swLegacy,
    privacy: swPrivacy,
    deleteAccount: swDeleteAccount,
    changelog: swChangelog,
    tainaGuide: swTainaGuide,
  },
  id: {
    ...idLanding,
    audiomothGuide: idAudioMothGuide,
    common: idCommon,
    marketplace: idMarketplace,
    bumicert: idBumicert,
    cart: idCart,
    upload: idUpload,
    modals: idModals,
    legacy: idLegacy,
    privacy: idPrivacy,
    deleteAccount: idDeleteAccount,
    changelog: idChangelog,
    tainaGuide: idTainaGuide,
  },
} satisfies Record<SupportedLanguageCode, object>;
