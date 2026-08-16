import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon, RadioIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { accountAudioPath } from "@/app/account/_lib/account-route";
import { monogram } from "@/app/_lib/did-profile";
import { isPdsBlobUrl } from "@/app/_lib/pds";
import { localProjectHref } from "@/app/_lib/urls";
import type { AudioProject } from "@/app/_lib/audio-projects";

export async function UploadedAudioProjects({ items }: { items: AudioProject[] }) {
  const t = await getTranslations("common.audiomoth.audioHub");
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="uploaded-audio-projects-heading" className="mt-12 border-t border-border/60 pt-8 sm:mt-16 sm:pt-10">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t("uploadedProjectsEyebrow")}</p>
          <h2 id="uploaded-audio-projects-heading" className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t("uploadedProjectsTitle")}
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">{t("uploadedProjectsLede")}</p>
      </div>

      {/* A list, not a grid: every project keeps its place, and the meta line
          stays on one line instead of truncating in a half-width column. */}
      <div className="mt-6 flex flex-col gap-4">
        {items.map((item) => {
          const projectHref = localProjectHref(item.project.did, item.project.rkey);
          const organization = item.organizationName ?? t("unknownOrganization");
          const mono = monogram(item.organizationName, item.project.did);
          return (
            <article key={item.project.atUri} className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                {/* The account that recorded it, shown the way accounts are
                    shown everywhere else: their logo, then their name. */}
                <span aria-hidden className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                  {item.organizationAvatarUrl ? (
                    <Image
                      src={item.organizationAvatarUrl}
                      alt=""
                      fill
                      sizes="56px"
                      unoptimized={!isPdsBlobUrl(item.organizationAvatarUrl)}
                      className="object-cover"
                    />
                  ) : (
                    <span
                      className="grid h-full w-full place-items-center text-lg font-semibold text-white"
                      style={{ backgroundColor: mono.bg }}
                    >
                      {mono.char}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-medium text-foreground">
                    <Link href={projectHref} className="hover:underline">
                      {organization}
                    </Link>
                  </h3>
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

              <div className="mt-4 flex flex-col gap-2">
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
