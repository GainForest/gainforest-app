"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CirclePlusIcon,
  LeafIcon,
  Loader2Icon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { BumicertCardVisual } from "@/components/bumicert/BumicertCard";
import type { BumicertRecord } from "@/app/_lib/indexer";
import { localBumicertHref } from "@/app/_lib/urls";
import { cn } from "@/lib/utils";
import { manageHref, type ManageTarget } from "@/lib/links";
import { canCreateRecord, canDeleteRecord } from "../../_lib/cgs-permissions";
import { deleteRecord } from "../../_lib/mutations";
import { ManageCollectionHeader, ManageCollectionViewToggle } from "../../projects/_components/ManageCollectionPrimitives";
import { SectionSurface } from "@/components/ui/section-surface";

const BUMICERT_COLLECTION = "org.hypercerts.claim.activity";

function CreateHeroCard({ target }: { target: ManageTarget }) {
  const t = useTranslations("bumicert.create");
  const createPermission = canCreateRecord(target);
  return (
    <SectionSurface variant="muted" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("landing.explainer.body1")}</p>
      {createPermission.allowed ? (
        <Button size="sm" asChild className="shrink-0 self-start sm:self-auto">
          <Link href={manageHref(target, "newBumicert")}>
            <CirclePlusIcon />
            {t("actions.createBumicert")}
          </Link>
        </Button>
      ) : (
        <p className="max-w-sm text-sm text-muted-foreground" role="status">{createPermission.reason}</p>
      )}
    </SectionSurface>
  );
}

type ViewMode = "cards" | "list";

function RecentBumicerts({ target, bumicerts, did, ownerIdentifier }: { target: ManageTarget; bumicerts: BumicertRecord[]; did: string; ownerIdentifier: string }) {
  const [view, setView] = useState<ViewMode>("cards");
  const [items, setItems] = useState<BumicertRecord[]>(bumicerts);
  const t = useTranslations("bumicert.create.recent");
  const viewT = useTranslations("marketplace.projects.view");
  const profileT = useTranslations("common.sidebar.profileRow");
  const detailsT = useTranslations("marketplace.manageProjectCerts.details");
  const reduceMotion = useReducedMotion();
  const modal = useModal();
  const createPermission = canCreateRecord(target);
  const deletePermission = canDeleteRecord(target);

  useEffect(() => {
    setItems(bumicerts);
  }, [bumicerts]);

  const requestDelete = (bumicert: BumicertRecord) => {
    modal.pushModal(
      {
        id: `delete-cert-${bumicert.rkey}`,
        dialogWidth: "max-w-md",
        content: (
          <DeleteBumicertModal
            title={bumicert.title}
            onConfirm={async () => {
              await deleteRecord(
                BUMICERT_COLLECTION,
                bumicert.rkey,
                target.kind === "group" ? { repo: target.did } : undefined,
              );
              setItems((current) => current.filter((item) => item.id !== bumicert.id));
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  };

  return (
    <AnimatePresence mode="wait">
      {items.length === 0 ? (
        <motion.div
          key="empty"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex min-h-[18rem] flex-col items-center justify-center px-6 text-center"
        >
          <LeafIcon className="mb-4 size-10 text-primary" />
          <div className="space-y-2">
            <h2 className="font-instrument text-2xl italic leading-tight text-foreground">{t("emptyTitle")}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{t("emptyLine1")} {t("emptyLine2")}</p>
          </div>
          {createPermission.allowed ? (
            <Button variant="outline" size="sm" asChild className="mt-5">
              <Link href={manageHref(target, "newBumicert")}>
                <CirclePlusIcon />
                {t("createFirst")}
              </Link>
            </Button>
          ) : (
            <p className="mt-4 max-w-sm text-sm text-muted-foreground" role="status">{createPermission.reason}</p>
          )}
        </motion.div>
      ) : (
        <div key="content" className="space-y-4">
          <div className="flex justify-end">
            <ManageCollectionViewToggle value={view} onChange={setView} cardsLabel={viewT("cards")} listLabel={viewT("list")} compact />
          </div>
          {view === "list" ? (
            <div>
              {items.map((bumicert) => (
                <div key={bumicert.id} className="relative after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                  <ManageBumicertListItem
                    bumicert={bumicert}
                    did={did}
                    ownerIdentifier={ownerIdentifier}
                    onDelete={deletePermission.allowed ? () => requestDelete(bumicert) : undefined}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((bumicert) => (
                <motion.div
                  key={bumicert.id}
                  className="group relative h-full"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <Link href={localBumicertHref((bumicert.did || did) === did ? ownerIdentifier : bumicert.did || did, bumicert.rkey)} className="block h-full">
                    <BumicertCardVisual
                      coverImage={bumicert.imageUrl}
                      logoUrl={null}
                      logoRef={bumicert.creatorAvatarRef}
                      ownerDid={bumicert.did || did}
                      title={bumicert.title}
                      organizationName={bumicert.creatorName ?? profileT("fallbackName")}
                      objectives={bumicertObjectives(bumicert, detailsT)}
                      description={bumicert.shortDescription ?? undefined}
                      className="h-full"
                    />
                  </Link>
                  {deletePermission.allowed ? (
                    <CertDeleteButton
                      title={bumicert.title}
                      onClick={() => requestDelete(bumicert)}
                      className="absolute right-3 top-3 z-10"
                    />
                  ) : null}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}

function bumicertObjectives(bumicert: BumicertRecord, t: ReturnType<typeof useTranslations>): string[] {
  return [
    bumicert.locationCount > 0 ? t("sites", { count: bumicert.locationCount }) : "",
    bumicert.contributorCount > 0 ? t("contributors", { count: bumicert.contributorCount }) : "",
    bumicert.startDate || bumicert.endDate ? t("impactPeriod") : "",
  ].filter(Boolean);
}

function ManageBumicertListItem({ bumicert, did, ownerIdentifier, onDelete }: { bumicert: BumicertRecord; did: string; ownerIdentifier: string; onDelete?: () => void }) {
  const cardT = useTranslations("marketplace.recordExplorer.card");
  const profileT = useTranslations("common.sidebar.profileRow");
  const detailsT = useTranslations("marketplace.manageProjectCerts.details");
  const actionT = useTranslations("marketplace.recordDrawer.actions");
  const href = localBumicertHref((bumicert.did || did) === did ? ownerIdentifier : bumicert.did || did, bumicert.rkey);
  const details = bumicertObjectives(bumicert, detailsT);

  return (
    <div className="group relative">
      <Link href={href} className="flex w-full gap-3 rounded-2xl px-1 py-3 text-left outline-none transition-colors duration-300 hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-primary/60 sm:gap-4 sm:px-2 sm:py-4">
        <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-36">
          {bumicert.imageUrl ? (
            <Image src={bumicert.imageUrl} alt={bumicert.title} fill unoptimized sizes="144px" className="object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100" />
          ) : (
            <span className="grid h-full place-items-center text-sm text-muted-foreground">{cardT("noCover")}</span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
          <span className="min-w-0">
            <span className="block truncate font-instrument text-2xl italic leading-tight text-foreground">{bumicert.title}</span>
            {bumicert.shortDescription ? <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{bumicert.shortDescription}</span> : null}
          </span>
          <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
            <span className="min-w-0 truncate text-xs text-muted-foreground">{details.length > 0 ? details.join(" · ") : bumicert.creatorName ?? profileT("fallbackName")}</span>
            <span className="shrink-0 text-xs font-medium text-foreground transition-colors group-hover:text-primary">{actionT("view")}</span>
          </span>
        </span>
      </Link>
      {onDelete ? (
        <CertDeleteButton
          title={bumicert.title}
          onClick={onDelete}
          className="absolute right-2 top-2 z-10"
        />
      ) : null}
    </div>
  );
}

function CertDeleteButton({ title, onClick, className }: { title: string; onClick: () => void; className?: string }) {
  const t = useTranslations("marketplace.manageBumicerts.actions");
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      aria-label={t("deleteAria", { title })}
      title={t("delete")}
      className={cn(
        "size-8 rounded-full border border-border bg-background/85 text-muted-foreground shadow-sm backdrop-blur hover:bg-destructive hover:text-destructive-foreground",
        className,
      )}
    >
      <Trash2Icon className="size-4" />
    </Button>
  );
}

function DeleteBumicertModal({ title, onConfirm }: { title: string; onConfirm: () => Promise<void> }) {
  const modal = useModal();
  const t = useTranslations("marketplace.manageBumicerts.deleteModal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = async () => {
    await modal.hide();
    modal.popModal();
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      await close();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("error"));
      setPending(false);
    }
  };

  return (
    <ModalContent dismissible={!pending} className="space-y-4">
      <ModalHeader>
        <ModalTitle>{t("title")}</ModalTitle>
        <ModalDescription>{t("description", { title })}</ModalDescription>
      </ModalHeader>
      {error ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs font-medium text-foreground/75">
          <TriangleAlertIcon className="size-3.5 text-warn" /> {error}
        </p>
      ) : null}
      <ModalFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void close()}>{t("cancel")}</Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => void confirm()}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          {t("confirm")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}

export function ManageBumicertsClient({ target, did, ownerIdentifier, bumicerts, error }: { target: ManageTarget; did: string; ownerIdentifier: string; bumicerts: BumicertRecord[]; error?: string | null }) {
  const tabT = useTranslations("common.accountTabs");
  const createT = useTranslations("bumicert.create");
  const recentT = useTranslations("bumicert.create.recent");
  const reduceMotion = useReducedMotion();
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="space-y-4">
        <ManageCollectionHeader title={tabT("bumicerts")} description={createT("landing.hero.description")} />
        <CreateHeroCard target={target} />
        {error ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-[2rem] bg-muted/30 px-6 text-center"
          >
            <TriangleAlertIcon className="size-8 text-muted-foreground opacity-60" />
            <div className="space-y-1">
              <h2 className="font-instrument text-2xl italic text-foreground">{recentT("errorTitle")}</h2>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </motion.div>
        ) : (
          <RecentBumicerts target={target} bumicerts={bumicerts} did={did} ownerIdentifier={ownerIdentifier} />
        )}
      </div>
    </div>
  );
}
