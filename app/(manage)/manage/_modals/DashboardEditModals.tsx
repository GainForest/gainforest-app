"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useModal } from "@/components/ui/modal/context";
import {
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal/modal";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { GlobeIcon, LockIcon, CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseOrganizationDate } from "@/lib/date";

type Visibility = "Public" | "Unlisted";

interface WebsiteEditorModalProps {
  currentUrl: string | null;
  onConfirm: (url: string | null) => void;
}

export function WebsiteEditorModal({
  currentUrl,
  onConfirm,
}: WebsiteEditorModalProps) {
  const { hide, popModal, stack } = useModal();
  const t = useTranslations("upload.dashboardModals");
  const [value, setValue] = useState(currentUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleClose = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
    } else {
      popModal();
    }
  };

  const validate = (url: string): boolean => {
    if (!url) return true; // empty = remove website
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      return parsed.hostname.includes(".");
    } catch {
      return false;
    }
  };

  const handleConfirm = async () => {
    const trimmed = value.trim();
    if (trimmed && !validate(trimmed)) {
      setError(t("website.invalid"));
      return;
    }
    const normalised = trimmed
      ? trimmed.startsWith("http")
        ? trimmed
        : `https://${trimmed}`
      : null;
    onConfirm(normalised);
    await handleClose();
  };

  return (
    <ModalContent>
      <ModalHeader backAction={stack.length > 1 ? handleClose : undefined}>
        <ModalTitle>{t("website.title")}</ModalTitle>
        <ModalDescription>{t("website.description")}</ModalDescription>
      </ModalHeader>

      <div className="py-4 flex flex-col gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleConfirm();
          }}
          placeholder={t("website.placeholder")}
          className="w-full h-10 px-3 text-sm bg-muted/40 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
          autoFocus
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <ModalFooter className="flex justify-end gap-2">
        <Button onClick={handleConfirm}>{t("actions.save")}</Button>
        <div className="flex items-center gap-1">
          {value && (
            <Button
              variant="outline"
              onClick={() => {
                setValue("");
                setError(null);
              }}
              className="text-destructive hover:text-destructive flex-1"
            >
              {t("actions.remove")}
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} className="flex-1">
            {t("actions.cancel")}
          </Button>
        </div>
      </ModalFooter>
    </ModalContent>
  );
}

interface StartDateSelectorModalProps {
  currentDate: string | null;
  onConfirm: (date: string | null) => void;
}

export function StartDateSelectorModal({
  currentDate,
  onConfirm,
}: StartDateSelectorModalProps) {
  const { hide, popModal, stack } = useModal();
  const t = useTranslations("upload.dashboardModals");
  const parsedCurrentDate = parseOrganizationDate(currentDate);
  const [selected, setSelected] = useState<Date | undefined>(
    parsedCurrentDate.state === "valid" && parsedCurrentDate.date
      ? parsedCurrentDate.date
      : undefined,
  );

  const handleClose = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
    } else {
      popModal();
    }
  };

  const handleConfirm = async () => {
    const iso = selected ? selected.toISOString().slice(0, 10) : null;
    onConfirm(iso);
    await handleClose();
  };

  return (
    <ModalContent>
      <ModalHeader backAction={stack.length > 1 ? handleClose : undefined}>
        <ModalTitle>{t("startDate.title")}</ModalTitle>
        <ModalDescription>{t("startDate.description")}</ModalDescription>
      </ModalHeader>

      <div className="flex justify-center py-2">
        <Calendar
          captionLayout="dropdown"
          mode="single"
          selected={selected}
          onSelect={setSelected}
          hidden={{ after: new Date() }}
          autoFocus
        />
      </div>

      <ModalFooter className="flex justify-end gap-2">
        <Button onClick={handleConfirm}>{t("actions.confirm")}</Button>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            onClick={() => setSelected(undefined)}
            className="text-destructive hover:text-destructive flex-1"
            disabled={!selected}
          >
            {t("actions.clear")}
          </Button>
          <Button variant="outline" onClick={handleClose} className="flex-1">
            {t("actions.cancel")}
          </Button>
        </div>
      </ModalFooter>
    </ModalContent>
  );
}

const ORG_TYPE_SUGGESTION_KEYS = [
  "nonprofit",
  "ngo",
  "communityGroup",
  "cooperative",
  "researchInstitute",
  "governmentAgency",
  "forProfit",
  "foundation",
] as const;

interface OrgTypeEditorModalProps {
  current: string | null;
  onConfirm: (value: string | null) => void;
}

export function OrgTypeEditorModal({ current, onConfirm }: OrgTypeEditorModalProps) {
  const { hide, popModal, stack } = useModal();
  const t = useTranslations("upload.dashboardModals");
  const [value, setValue] = useState(current ?? "");

  const handleClose = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
    } else {
      popModal();
    }
  };

  const handleConfirm = async () => {
    const trimmed = value.trim();
    onConfirm(trimmed || null);
    await handleClose();
  };

  return (
    <ModalContent>
      <ModalHeader backAction={stack.length > 1 ? handleClose : undefined}>
        <ModalTitle>{t("orgType.title")}</ModalTitle>
        <ModalDescription>{t("orgType.description")}</ModalDescription>
      </ModalHeader>

      <div className="flex flex-col gap-3 py-4">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleConfirm();
          }}
          placeholder={t("orgType.placeholder")}
          className="h-10 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          autoFocus
        />
        <div className="flex flex-wrap gap-1.5">
          {ORG_TYPE_SUGGESTION_KEYS.map((suggestionKey) => {
            const suggestion = t(`orgType.suggestions.${suggestionKey}`);
            return (
              <button
                key={suggestionKey}
                type="button"
                onClick={() => setValue(suggestion)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  value.trim().toLowerCase() === suggestion.toLowerCase()
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/60",
                )}
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      </div>

      <ModalFooter className="flex justify-end gap-2">
        <Button onClick={handleConfirm}>{t("actions.save")}</Button>
        <div className="flex items-center gap-1">
          {value && (
            <Button
              variant="outline"
              onClick={() => setValue("")}
              className="flex-1 text-destructive hover:text-destructive"
            >
              {t("actions.remove")}
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} className="flex-1">
            {t("actions.cancel")}
          </Button>
        </div>
      </ModalFooter>
    </ModalContent>
  );
}

interface SocialLinksEditorModalProps {
  current: string[];
  onConfirm: (urls: string[]) => void;
}

function normaliseLink(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.hostname.includes(".") ? withScheme : null;
  } catch {
    return null;
  }
}

export function SocialLinksEditorModal({ current, onConfirm }: SocialLinksEditorModalProps) {
  const { hide, popModal, stack } = useModal();
  const t = useTranslations("upload.dashboardModals");
  const [links, setLinks] = useState<string[]>(current.length ? current : [""]);
  const [error, setError] = useState<string | null>(null);

  const handleClose = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
    } else {
      popModal();
    }
  };

  const updateLink = (index: number, next: string) => {
    setLinks((prev) => prev.map((value, i) => (i === index ? next : value)));
    setError(null);
  };

  const removeLink = (index: number) => {
    setLinks((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)));
  };

  const handleConfirm = async () => {
    const cleaned: string[] = [];
    for (const link of links) {
      if (!link.trim()) continue;
      const normalised = normaliseLink(link);
      if (!normalised) {
        setError(t("socialLinks.invalid"));
        return;
      }
      if (!cleaned.includes(normalised)) cleaned.push(normalised);
    }
    onConfirm(cleaned);
    await handleClose();
  };

  return (
    <ModalContent>
      <ModalHeader backAction={stack.length > 1 ? handleClose : undefined}>
        <ModalTitle>{t("socialLinks.title")}</ModalTitle>
        <ModalDescription>{t("socialLinks.description")}</ModalDescription>
      </ModalHeader>

      <div className="flex flex-col gap-2 py-4">
        {links.map((link, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="url"
              value={link}
              onChange={(e) => updateLink(index, e.target.value)}
              placeholder={t("socialLinks.placeholder")}
              className="h-10 flex-1 rounded-lg border border-border bg-muted/40 px-3 text-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => removeLink(index)}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-destructive"
              aria-label={t("socialLinks.removeLink")}
            >
              <XIcon className="size-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLinks((prev) => [...prev, ""])}
          className="mt-1 flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <PlusIcon className="size-4" /> {t("socialLinks.addAnother")}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <ModalFooter className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleClose}>
          {t("actions.cancel")}
        </Button>
        <Button onClick={handleConfirm}>{t("actions.save")}</Button>
      </ModalFooter>
    </ModalContent>
  );
}

interface VisibilityOption {
  value: Visibility;
  label: string;
  description: string;
  Icon: typeof GlobeIcon;
}

interface VisibilitySelectorModalProps {
  current: Visibility;
  onConfirm: (value: Visibility) => void;
}

export function VisibilitySelectorModal({
  current,
  onConfirm,
}: VisibilitySelectorModalProps) {
  const { hide, popModal, stack } = useModal();
  const t = useTranslations("upload.dashboardModals");
  const [selected, setSelected] = useState<Visibility>(current);
  const options: VisibilityOption[] = [
    {
      value: "Public",
      label: t("visibility.public"),
      description: t("visibility.publicDescription"),
      Icon: GlobeIcon,
    },
    {
      value: "Unlisted",
      label: t("visibility.unlisted"),
      description: t("visibility.unlistedDescription"),
      Icon: LockIcon,
    },
  ];

  const handleClose = async () => {
    if (stack.length === 1) {
      await hide();
      popModal();
    } else {
      popModal();
    }
  };

  const handleConfirm = async () => {
    onConfirm(selected);
    await handleClose();
  };

  return (
    <ModalContent>
      <ModalHeader backAction={stack.length > 1 ? handleClose : undefined}>
        <ModalTitle>{t("visibility.title")}</ModalTitle>
        <ModalDescription>{t("visibility.description")}</ModalDescription>
      </ModalHeader>

      <div className="flex flex-col gap-2 py-4">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={cn(
              "flex items-start gap-3 w-full px-4 py-3 rounded-xl border text-left transition-colors cursor-pointer",
              selected === opt.value
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:bg-muted/60",
            )}
          >
            <opt.Icon
              className={cn(
                "h-4 w-4 mt-0.5 shrink-0",
                selected === opt.value
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            />
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  selected === opt.value ? "text-primary" : "text-foreground",
                )}
              >
                {opt.label}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                {opt.description}
              </p>
            </div>
            {selected === opt.value && (
              <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            )}
          </button>
        ))}
      </div>

      <ModalFooter className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleClose}>
          {t("actions.cancel")}
        </Button>
        <Button onClick={handleConfirm}>{t("actions.save")}</Button>
      </ModalFooter>
    </ModalContent>
  );
}
