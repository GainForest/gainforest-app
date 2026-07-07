"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  CirclePlusIcon,
  LayoutGridIcon,
  LeafIcon,
  ListIcon,
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
import { canDeleteRecord } from "../../_lib/cgs-permissions";
import { deleteRecord } from "../../_lib/mutations";

const BUMICERT_COLLECTION = "org.hypercerts.claim.activity";

function CreateHeroCard({ target }: { target: ManageTarget }) {
  return (
    <section className="relative overflow-visible rounded-[1.6rem] border border-border/80 bg-card shadow-sm">
      <div className="relative min-h-[6rem] overflow-hidden rounded-[1.55rem]">
        <Image
          src="/assets/media/images/create-bumicert/hero-light@2x.webp"
          alt=""
          fill
          priority
          quality={95}
          sizes="100vw"
          className="object-cover object-center dark:hidden"
        />
        <Image
          src="/assets/media/images/create-bumicert/hero-dark@2x.webp"
          alt=""
          fill
          priority
          quality={95}
          sizes="100vw"
          className="hidden object-cover object-center dark:block"
        />
        <div className="absolute inset-0 bg-linear-to-r from-background/95 via-background/72 to-background/5 dark:from-background/90 dark:via-background/58 dark:to-background/10" />
        <div className="absolute -top-8 right-[7%] h-28 w-52 rounded-full bg-background/50 blur-2xl dark:bg-primary/10" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-foreground/20 via-foreground/5 to-transparent dark:from-black/55" />

        <div className="relative z-30 flex min-h-[6rem] flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 lg:px-9">
          <p className="w-full text-sm leading-5 text-muted-foreground sm:max-w-[30rem]">
            Certs are impact certificates that connect a project to people, places, time periods, and supporting photos or notes. Use them to make field work easier to review and share, and to raise funds for your project through impact donations.
          </p>
          <Button size="sm" asChild className="shrink-0 self-start sm:self-auto">
            <Link href={manageHref(target, "newBumicert")}>
              <CirclePlusIcon />
              Mint a Cert
            </Link>
          </Button>
        </div>
      </div>
      <Image
        src="/assets/media/images/create-bumicert/plant-light.png"
        alt=""
        width={1002}
        height={1146}
        priority
        className="pointer-events-none absolute bottom-0 right-[4%] z-20 hidden h-[9rem] w-auto max-w-[50%] object-contain dark:hidden md:block"
      />
      <Image
        src="/assets/media/images/create-bumicert/plant-dark.png"
        alt=""
        width={964}
        height={1129}
        priority
        className="pointer-events-none absolute bottom-0 right-[4%] z-20 hidden h-[9rem] w-auto max-w-[50%] object-contain dark:md:block"
      />
    </section>
  );
}

type ViewMode = "cards" | "list";

function RecentBumicerts({ target, bumicerts, did, ownerIdentifier }: { target: ManageTarget; bumicerts: BumicertRecord[]; did: string; ownerIdentifier: string }) {
  const [view, setView] = useState<ViewMode>("cards");
  const [items, setItems] = useState<BumicertRecord[]>(bumicerts);
  const modal = useModal();
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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex min-h-[18rem] flex-col items-center justify-center px-6 text-center"
        >
          <LeafIcon className="mb-4 size-10 text-primary" />
          <div className="space-y-2">
            <p className="font-serif text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground">
              No Certs yet
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Your published Certs will appear here.
              <br />Create your first one when you are ready.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="mt-5">
            <Link href={manageHref(target, "newBumicert")}>
              <CirclePlusIcon />
              Mint your first Cert
            </Link>
          </Button>
        </motion.div>
      ) : (
        <div key="content" className="space-y-4">
          <div className="flex justify-end">
            <ViewToggle view={view} setView={setView} />
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
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <Link href={localBumicertHref((bumicert.did || did) === did ? ownerIdentifier : bumicert.did || did, bumicert.rkey)} className="block h-full">
                    <BumicertCardVisual
                      coverImage={bumicert.imageUrl}
                      logoUrl={null}
                      logoRef={bumicert.creatorAvatarRef}
                      ownerDid={bumicert.did || did}
                      title={bumicert.title}
                      organizationName={bumicert.creatorName ?? "Your profile"}
                      objectives={bumicertObjectives(bumicert)}
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

function bumicertObjectives(bumicert: BumicertRecord): string[] {
  return [
    bumicert.locationCount > 0 ? `${bumicert.locationCount} ${bumicert.locationCount === 1 ? "site" : "sites"}` : "",
    bumicert.contributorCount > 0 ? `${bumicert.contributorCount} ${bumicert.contributorCount === 1 ? "contributor" : "contributors"}` : "",
    bumicert.startDate || bumicert.endDate ? "impact period" : "",
  ].filter(Boolean);
}

function ViewToggle({ view, setView }: { view: ViewMode; setView: (view: ViewMode) => void }) {
  return (
    <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-border bg-background/70 p-0.5 backdrop-blur">
      {([
        { id: "cards", label: "Cards", Icon: LayoutGridIcon },
        { id: "list", label: "List", Icon: ListIcon },
      ] as const).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          aria-label={label}
          title={label}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors ${
            view === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function ManageBumicertListItem({ bumicert, did, ownerIdentifier, onDelete }: { bumicert: BumicertRecord; did: string; ownerIdentifier: string; onDelete?: () => void }) {
  const href = localBumicertHref((bumicert.did || did) === did ? ownerIdentifier : bumicert.did || did, bumicert.rkey);
  const details = bumicertObjectives(bumicert);

  return (
    <div className="group relative">
      <Link href={href} className="flex w-full gap-3 rounded-2xl px-1 py-3 text-left outline-none transition-colors duration-300 hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-primary/60 sm:gap-4 sm:px-2 sm:py-4">
        <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-36">
          {bumicert.imageUrl ? (
            <Image src={bumicert.imageUrl} alt={bumicert.title} fill unoptimized sizes="144px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <span className="grid h-full place-items-center font-garamond text-sm italic text-muted-foreground">No cover image</span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
          <span className="min-w-0">
            <span className="block truncate font-instrument text-2xl italic leading-tight text-foreground">{bumicert.title}</span>
            {bumicert.shortDescription ? <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{bumicert.shortDescription}</span> : null}
          </span>
          <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
            <span className="min-w-0 truncate text-xs text-muted-foreground">{details.length > 0 ? details.join(" · ") : bumicert.creatorName ?? "Your profile"}</span>
            <span className="shrink-0 text-xs font-medium text-foreground transition-colors group-hover:text-primary">Open</span>
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
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="space-y-4">
        <section className="-mx-4 px-4 py-1 sm:-mx-6 sm:px-6">
          <div className="max-w-2xl">
            <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">
              My Certs
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Create and manage the verified impact stories connected to your work.
            </p>
          </div>
        </section>
        <CreateHeroCard target={target} />
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-[2rem] bg-muted/30 px-6 text-center"
          >
            <TriangleAlertIcon className="size-8 text-muted-foreground opacity-60" />
            <div className="space-y-1">
              <p className="font-serif text-2xl font-medium text-foreground">Could not load recent Certs</p>
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
