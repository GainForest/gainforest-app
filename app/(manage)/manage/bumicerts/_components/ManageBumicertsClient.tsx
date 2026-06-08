"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  CirclePlusIcon,
  LeafIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BumicertCardSkeleton, BumicertCardVisual } from "@/components/bumicert/BumicertCard";
import type { BumicertRecord } from "@/app/_lib/indexer";
import { localBumicertHref } from "@/app/_lib/urls";

function CreateHeroCard() {
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
            Bumicerts are public impact stories that connect a project to people, places, time periods, and supporting photos or notes. Use them to make field work easier to review, share, and fund.
          </p>
          <Button size="sm" asChild className="shrink-0 self-start sm:self-auto">
            <Link href="/manage/bumicerts/new">
              <CirclePlusIcon />
              Create Bumicert
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

function RecentBumicerts({ bumicerts, did, ownerIdentifier }: { bumicerts: BumicertRecord[]; did: string; ownerIdentifier: string }) {
  return (
    <AnimatePresence mode="wait">
      {bumicerts.length === 0 ? (
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
              No Bumicerts yet
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Your published Bumicerts will appear here.
              <br />Create your first one when you are ready.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="mt-5">
            <Link href="/manage/bumicerts/new">
              <CirclePlusIcon />
              Create first Bumicert
            </Link>
          </Button>
        </motion.div>
      ) : (
        <div key="grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {bumicerts.map((bumicert) => (
            <motion.div
              key={bumicert.id}
              className="h-full"
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
                  objectives={[
                    bumicert.locationCount > 0 ? `${bumicert.locationCount} ${bumicert.locationCount === 1 ? "site" : "sites"}` : "",
                    bumicert.contributorCount > 0 ? `${bumicert.contributorCount} ${bumicert.contributorCount === 1 ? "contributor" : "contributors"}` : "",
                    bumicert.startDate || bumicert.endDate ? "impact period" : "",
                  ].filter(Boolean)}
                  description={bumicert.shortDescription ?? undefined}
                  className="h-full"
                />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

export function ManageBumicertsClient({ did, ownerIdentifier, bumicerts, error }: { did: string; ownerIdentifier: string; bumicerts: BumicertRecord[]; error?: string | null }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="space-y-4">
        <CreateHeroCard />
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-[2rem] bg-muted/30 px-6 text-center"
          >
            <TriangleAlertIcon className="size-8 text-muted-foreground opacity-60" />
            <div className="space-y-1">
              <p className="font-serif text-2xl font-medium text-foreground">Could not load recent Bumicerts</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </motion.div>
        ) : (
          <RecentBumicerts bumicerts={bumicerts} did={did} ownerIdentifier={ownerIdentifier} />
        )}
      </div>
    </div>
  );
}

export function ManageBumicertsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <BumicertCardSkeleton key={index} />
      ))}
    </div>
  );
}
