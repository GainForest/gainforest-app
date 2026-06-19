"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";

export function OptionalNote({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const evidenceT = useTranslations("bumicert.detail.evidenceAdder");
  const noteId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={noteId} className="text-sm font-medium">
        {evidenceT("optionalNote")}
      </label>
      <Textarea
        id={noteId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={evidenceT("optionalNotePlaceholder")}
        rows={3}
      />
    </div>
  );
}
