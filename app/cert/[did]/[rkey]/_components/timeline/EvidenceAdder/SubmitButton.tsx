"use client";

import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  count,
  isSubmitting,
  onClick,
}: {
  count: number;
  isSubmitting: boolean;
  onClick: () => void;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={isSubmitting || count === 0}
      className="w-full"
    >
      {isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
      {isSubmitting
        ? evidenceT("linking")
        : count === 0
          ? evidenceT("chooseAttachment")
          : evidenceT("postUpdate")}
      {!isSubmitting ? <ArrowRightIcon /> : null}
    </Button>
  );
}
