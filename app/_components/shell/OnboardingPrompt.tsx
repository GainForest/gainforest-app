"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRightIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalFooter, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import type { AuthSession } from "../../_lib/auth";

const ONBOARDING_PROMPT_MODAL_ID = "fresh-account-onboarding";
const ONBOARDING_PROMPT_SESSION_KEY_PREFIX = "gainforest:onboarding-prompt-shown:";
const shownOnboardingPromptKeys = new Set<string>();

function onboardingPromptSessionKey(did: string): string {
  return `${ONBOARDING_PROMPT_SESSION_KEY_PREFIX}${did}`;
}

function hasOnboardingPromptBeenShown(key: string): boolean {
  if (shownOnboardingPromptKeys.has(key)) return true;

  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markOnboardingPromptShown(key: string) {
  shownOnboardingPromptKeys.add(key);

  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // In-memory state still prevents repeat prompts when sessionStorage is unavailable.
  }
}

/**
 * Signed-in accounts without a certified profile get a one-time (per browser
 * session) invitation to finish onboarding. Shown from the shell so it works
 * on every page, but suppressed while onboarding itself or when another modal
 * is already open.
 */
export function FreshAccountOnboardingPrompt({
  authSession,
  isProfileLoading,
  hasCertifiedProfile,
}: {
  authSession: AuthSession | null;
  isProfileLoading: boolean;
  hasCertifiedProfile: boolean;
}) {
  const modal = useModal();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const t = useTranslations("common.onboardingPrompt");

  useEffect(() => {
    if (!authSession?.isLoggedIn || isProfileLoading || hasCertifiedProfile) return;
    const promptSessionKey = onboardingPromptSessionKey(authSession.did);
    if (hasOnboardingPromptBeenShown(promptSessionKey)) return;

    const onboardingMode = new URLSearchParams(window.location.search).get("mode")?.startsWith("onboard") === true;
    if (onboardingMode) return;
    if (modal.stack.length > 0) return;

    markOnboardingPromptShown(promptSessionKey);

    modal.pushModal(
      {
        id: ONBOARDING_PROMPT_MODAL_ID,
        content: (
          <ModalContent dismissible={false} className="py-2">
            <div className="flex flex-col items-center pt-4 text-center">
              <motion.div
                className="relative h-20 w-20"
                transition={{ duration: 0.75, type: "spring" }}
                layoutId="gainforest-icon"
                initial={{ scale: 0.2, filter: "blur(20px)", opacity: 0 }}
                animate={{ scale: 1, filter: "blur(0px)", opacity: 1 }}
              >
                <Image className="drop-shadow-2xl" src="/assets/media/images/app-icon.png" fill alt="GainForest" />
              </motion.div>
              <ModalTitle className="mt-4">{t("title")}</ModalTitle>
              <ModalDescription className="mt-1 max-w-sm">
                {t("description")}
              </ModalDescription>
              <ModalFooter className="mt-6 w-full">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    markOnboardingPromptShown(promptSessionKey);
                    void modal.hide().then(() => modal.clear());
                    router.push("/manage?mode=onboard-user");
                  }}
                >
                  {t("continue")}
                  <ArrowRightIcon />
                </Button>
              </ModalFooter>
            </div>
          </ModalContent>
        ),
      },
      true,
    );
    void modal.show();
  }, [authSession, hasCertifiedProfile, isProfileLoading, modal, pathname, router, t]);

  return null;
}
