"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { deleteRecord } from "@/app/(manage)/manage/_lib/mutations";
import { CERT_COLLECTION, PROJECT_COLLECTION } from "@/app/(manage)/manage/_lib/project-cert";

type BumicertDeleteActionProps = {
  /** Cert (claim activity) rkey. */
  rkey: string;
  title: string;
  /** Org DID for group-owned writes; omit for personal repos. */
  mutationRepo?: string;
  /** Where to send the user after a successful delete. */
  redirectHref: string;
  /**
   * When set, this is the project page: the project record is the primary
   * delete target and the 1:1 cert (`rkey`) is removed as best-effort cleanup.
   * When omitted, only the cert is deleted (legacy standalone Cert page).
   */
  projectRkey?: string;
};

/**
 * Resolve the labels for either mode. The project page deletes the project
 * (Certs are retired), the legacy Cert page deletes the Cert — both use the
 * same type-the-name safety confirmation.
 */
function useDeleteLabels(isProject: boolean) {
  const certT = useTranslations("bumicert.detail.actions");
  const projectT = useTranslations("marketplace.manageProjects.editor.deleteModal");
  if (isProject) {
    return {
      manage: projectT("manageHeading"),
      button: projectT("button"),
      hint: projectT("hint"),
      confirmTitle: projectT("title"),
      confirmDescription: (title: string) => projectT("description", { title }),
      prompt: projectT("prompt"),
      inputAria: projectT("inputAria"),
      mismatch: projectT("mismatch"),
      cancel: projectT("cancel"),
      confirm: projectT("confirm"),
      error: projectT("error"),
    };
  }
  return {
    manage: certT("manage"),
    button: certT("deleteBumicert"),
    hint: certT("deleteHint"),
    confirmTitle: certT("deleteConfirmTitle"),
    confirmDescription: (title: string) => certT("deleteConfirmDescription", { title }),
    prompt: certT("deleteConfirmPrompt"),
    inputAria: certT("deleteConfirmInputAria"),
    mismatch: certT("deleteConfirmMismatch"),
    cancel: certT("deleteConfirmCancel"),
    confirm: certT("deleteConfirmConfirm"),
    error: certT("deleteError"),
  };
}

export function BumicertDeleteAction(props: BumicertDeleteActionProps) {
  const { rkey, projectRkey } = props;
  const isProject = Boolean(projectRkey);
  const labels = useDeleteLabels(isProject);
  const modal = useModal();

  const openConfirm = () => {
    modal.pushModal(
      {
        id: `delete-${isProject ? "project" : "cert"}-${projectRkey ?? rkey}`,
        dialogWidth: "max-w-md",
        content: <DeleteConfirm {...props} />,
      },
      true,
    );
    void modal.show();
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{labels.manage}</h3>
      <Button
        type="button"
        variant="outline"
        onClick={openConfirm}
        className="w-full border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
      >
        <Trash2Icon className="size-4" />
        {labels.button}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">{labels.hint}</p>
    </div>
  );
}

function DeleteConfirm({ rkey, title, mutationRepo, redirectHref, projectRkey }: BumicertDeleteActionProps) {
  const isProject = Boolean(projectRkey);
  const labels = useDeleteLabels(isProject);
  const modal = useModal();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmValue, setConfirmValue] = useState("");
  const expectedName = title.trim() || "DELETE";
  const nameMatches = confirmValue.trim() === expectedName;
  const inputId = `delete-${isProject ? "project" : "cert"}-confirm-${projectRkey ?? rkey}`;

  const close = async () => {
    await modal.hide();
    modal.popModal();
  };

  const confirm = async () => {
    if (!nameMatches || pending) return;
    setPending(true);
    setError(null);
    try {
      const repoOptions = mutationRepo ? { repo: mutationRepo } : undefined;
      if (projectRkey) {
        await deleteRecord(PROJECT_COLLECTION, projectRkey, repoOptions);
        // Best-effort: remove the 1:1 cert alongside its project.
        await deleteRecord(CERT_COLLECTION, rkey, repoOptions).catch(() => {});
      } else {
        await deleteRecord(CERT_COLLECTION, rkey, repoOptions);
      }
      await modal.hide();
      modal.clear();
      router.push(redirectHref);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : labels.error);
      setPending(false);
    }
  };

  return (
    <ModalContent dismissible={!pending} className="space-y-4">
      <ModalHeader>
        <ModalTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlertIcon className="size-5 shrink-0" />
          {labels.confirmTitle}
        </ModalTitle>
        <ModalDescription>{labels.confirmDescription(title)}</ModalDescription>
      </ModalHeader>
      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
          {labels.prompt}
        </label>
        <div className="select-all rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm font-medium text-foreground">
          {expectedName}
        </div>
        <input
          id={inputId}
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
          aria-label={labels.inputAria}
          placeholder={expectedName}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-destructive/60 focus:ring-2 focus:ring-destructive/25"
        />
        {confirmValue.trim().length > 0 && !nameMatches ? (
          <p className="text-xs text-muted-foreground">{labels.mismatch}</p>
        ) : null}
      </div>
      {error ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void close()}>
          {labels.cancel}
        </Button>
        <Button type="button" variant="destructive" disabled={pending || !nameMatches} onClick={() => void confirm()}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          {labels.confirm}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
