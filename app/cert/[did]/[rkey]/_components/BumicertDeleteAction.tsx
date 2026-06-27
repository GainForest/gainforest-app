"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { deleteRecord } from "@/app/(manage)/manage/_lib/mutations";

const BUMICERT_COLLECTION = "org.hypercerts.claim.activity";

type BumicertDeleteActionProps = {
  rkey: string;
  title: string;
  /** Org DID for group-owned writes; omit for personal repos. */
  mutationRepo?: string;
  /** Where to send the user after a successful delete. */
  redirectHref: string;
};

export function BumicertDeleteAction({ rkey, title, mutationRepo, redirectHref }: BumicertDeleteActionProps) {
  const t = useTranslations("bumicert.detail.actions");
  const modal = useModal();

  const openConfirm = () => {
    modal.pushModal(
      {
        id: `delete-cert-${rkey}`,
        dialogWidth: "max-w-md",
        content: <DeleteConfirm rkey={rkey} title={title} mutationRepo={mutationRepo} redirectHref={redirectHref} />,
      },
      true,
    );
    void modal.show();
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("manage")}</h3>
      <Button
        type="button"
        variant="outline"
        onClick={openConfirm}
        className="w-full border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
      >
        <Trash2Icon className="size-4" />
        {t("deleteBumicert")}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">{t("deleteHint")}</p>
    </div>
  );
}

function DeleteConfirm({ rkey, title, mutationRepo, redirectHref }: BumicertDeleteActionProps) {
  const t = useTranslations("bumicert.detail.actions");
  const modal = useModal();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmValue, setConfirmValue] = useState("");
  const expectedName = title.trim() || "DELETE";
  const nameMatches = confirmValue.trim() === expectedName;

  const close = async () => {
    await modal.hide();
    modal.popModal();
  };

  const confirm = async () => {
    if (!nameMatches || pending) return;
    setPending(true);
    setError(null);
    try {
      await deleteRecord(BUMICERT_COLLECTION, rkey, mutationRepo ? { repo: mutationRepo } : undefined);
      await modal.hide();
      modal.clear();
      router.push(redirectHref);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("deleteError"));
      setPending(false);
    }
  };

  return (
    <ModalContent dismissible={!pending} className="space-y-4">
      <ModalHeader>
        <ModalTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlertIcon className="size-5 shrink-0" />
          {t("deleteConfirmTitle")}
        </ModalTitle>
        <ModalDescription>{t("deleteConfirmDescription", { title })}</ModalDescription>
      </ModalHeader>
      <div className="space-y-2">
        <label htmlFor={`delete-cert-confirm-${rkey}`} className="block text-sm font-medium text-foreground">
          {t("deleteConfirmPrompt")}
        </label>
        <div className="select-all rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm font-medium text-foreground">
          {expectedName}
        </div>
        <input
          id={`delete-cert-confirm-${rkey}`}
          type="text"
          value={confirmValue}
          onChange={(event) => setConfirmValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void confirm();
            }
          }}
          disabled={pending}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={t("deleteConfirmInputAria")}
          placeholder={expectedName}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-destructive/60 focus:ring-2 focus:ring-destructive/25"
        />
        {confirmValue.trim().length > 0 && !nameMatches ? (
          <p className="text-xs text-muted-foreground">{t("deleteConfirmMismatch")}</p>
        ) : null}
      </div>
      {error ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void close()}>
          {t("deleteConfirmCancel")}
        </Button>
        <Button type="button" variant="destructive" disabled={pending || !nameMatches} onClick={() => void confirm()}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          {t("deleteConfirmConfirm")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
