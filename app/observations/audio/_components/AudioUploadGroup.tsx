"use client";

/**
 * One project's recorder uploads, drawn as a group in the Audio explore flow.
 *
 * Same shape as a soundscape group — the account's logo and name, what they
 * have, and a way in — so the two read as one chronological list. Where a
 * soundscape group shows playable dials, this shows what is there instead:
 * the recordings, still raw, one slot per recorder folder.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon, RadioIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { accountAudioPath } from "@/app/account/_lib/account-route";
import type { AudioProject } from "@/app/_lib/audio-projects";
import { monogram } from "@/app/_lib/did-profile";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { localProjectHref } from "@/app/_lib/urls";

export function AudioUploadGroup({ item }: { item: AudioProject }) {
  const t = useTranslations("common.audiomoth.audioHub");

  const projectHref = localProjectHref(item.project.did, item.project.rkey);
  const organization = item.organizationName ?? t("unknownOrganization");
  const mono = monogram(item.organizationName, item.project.did);

  return (
    <section className="flex flex-col gap-4 border-t border-border/60 pt-6">
      {/* Project header — the same row a soundscape group wears. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span aria-hidden className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          {item.organizationAvatarUrl ? (
            <Image
              src={item.organizationAvatarUrl}
              alt=""
              fill
              sizes="44px"
              unoptimized={!isPdsBlobUrl(item.organizationAvatarUrl)}
              className="object-cover"
            />
          ) : (
            <span
              className="grid h-full w-full place-items-center text-sm font-semibold text-white"
              style={{ backgroundColor: mono.bg }}
            >
              {mono.char}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="min-w-0 truncate text-lg font-medium text-foreground">
            <Link href={projectHref} className="hover:underline">
              {organization}
            </Link>
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {t("uploadedProjectMeta", {
              project: item.project.title,
              recorders: item.recorderCount,
              recordings: item.recordingCount,
            })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href={projectHref}>
            {t("openProject")}
            <ArrowUpRightIcon className="size-3.5" aria-hidden />
          </Link>
        </Button>
      </div>

      {/* One slot per recorder folder: the upload volume and nothing else. */}
      <div className="flex flex-col gap-2">
        {item.uploads.map((upload) => (
          <div key={upload.id} className="rounded-2xl border border-dashed border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">
                  {t("recordingsUploaded", { count: upload.recordingCount })}
                </p>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <RadioIcon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {[upload.recorderName ?? t("recorderFallback"), upload.siteName].filter(Boolean).join(" · ")}
                  </span>
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0 rounded-full">
                <Link href={accountAudioPath(upload.did)}>
                  {t("browseRecordings")}
                  <ArrowUpRightIcon className="size-3.5" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
