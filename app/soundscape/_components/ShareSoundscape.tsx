"use client";

/**
 * Sharing a soundscape — the step that turns a browser-local analysis into
 * something other people can see and listen to.
 *
 * Two destinations, one publish: the analysis is first written down as an
 * `app.gainforest.ac.soundscape` record (see lib/soundscape/record.ts), and
 * that record is then either announced in the feed as a post, or attached to
 * one of the author's projects so it lands on that project's evidence
 * timeline. The record is published once per analysis: sharing the same
 * soundscape to the feed and then to two projects writes one soundscape and
 * three pointers at it, not four copies of the data.
 *
 * A whole folder already *has* a record — the living one the workbench
 * auto-publishes at the folder's own rkey (lib/soundscape/auto-publish.ts).
 * Sharing that names the rkey on the input, and publishing becomes an update
 * of the living record instead of a copy beside it. Only a single-day share
 * — a deliberate excerpt — still mints a record of its own.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  FolderKanbanIcon,
  Loader2Icon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ModalContent, ModalDescription, ModalTitle } from "@/components/ui/modal/modal";
import { manageApiHref } from "@/lib/links";
import { cn } from "@/lib/utils";
import { createFeedPost } from "@/app/(manage)/manage/_lib/mutations";
import { useActingRepo } from "@/app/_lib/account-switcher";
import {
  createSoundscapeRecord,
  fetchPublishedSoundscape,
  putSoundscapeRecord,
} from "@/app/_lib/soundscape-record";
import { resolveStrongRef } from "@/app/_lib/pds";
import { createContextAttachment } from "@/app/cert/[did]/[rkey]/_components/timeline/contextAttachmentMutations";
import {
  soundscapeHref,
  SOUNDSCAPE_ATTACHMENT_CONTENT_TYPE,
  type SoundscapeDraft,
  type SoundscapeSource,
} from "@/lib/soundscape/record";

/** Keeps the post inside the feed's 300-character limit with room for the link. */
const POST_MAX = 300;
const CAPTION_MAX = 200;

export { SOUNDSCAPE_ATTACHMENT_CONTENT_TYPE };

export type ShareTarget = {
  /** Group DID when acting as an organization; undefined for the personal repo. */
  repo: string | undefined;
  /** Target for the manage projects API (null when signed out). */
  apiTarget: { kind: "personal" | "group"; did: string } | null;
};

/**
 * The account the author is currently acting as: their own, or an
 * organization they manage. The soundscape record, the feed post and the
 * project attachment all land in that account's repo, and the project picker
 * lists that account's projects.
 */
export function useShareTarget(sessionDid: string | null): ShareTarget {
  const acting = useActingRepo(sessionDid);

  return useMemo(() => {
    if (!sessionDid) return { repo: undefined, apiTarget: null };
    return acting.repo
      ? { repo: acting.repo, apiTarget: { kind: "group" as const, did: acting.repo } }
      : { repo: undefined, apiTarget: { kind: "personal" as const, did: sessionDid } };
  }, [acting.repo, sessionDid]);
}

export type SoundscapePublishInput = {
  title: string;
  ceilingHz: number;
  sources: SoundscapeSource[];
  /** Fixed rkey of the folder's living record, when the share covers the
   *  whole folder — publishing then updates that record in place. */
  rkey?: string;
};

type PublishedRef = { uri: string; did: string; rkey: string; cid: string; signature: string };

/** Identity of an analysis: which recordings it covers. Changing the date
 *  filter (or analyzing more) yields a different soundscape, so the cached
 *  published record is only reused for the exact same set. */
function signatureOf(input: SoundscapePublishInput): string {
  return input.sources
    .map((source) => source.audioUri)
    .sort()
    .join("\n");
}

/**
 * Publish-once helper shared by both destinations. Returns the existing record
 * when the same set of recordings was already published in this session.
 */
export function useSoundscapePublisher(target: ShareTarget) {
  const publishedRef = useRef<PublishedRef | null>(null);

  return useCallback(
    async (input: SoundscapePublishInput, note?: string): Promise<PublishedRef> => {
      const signature = signatureOf(input);
      const cached = publishedRef.current;
      if (cached && cached.signature === signature) return cached;
      const options = target.repo ? { repo: target.repo } : undefined;
      let published: Omit<PublishedRef, "signature">;
      if (input.rkey) {
        /* The folder's living record. A caption becomes its note; without
           one, whatever note it already carries is kept — an empty share
           must not erase the author's earlier words. */
        let keepNote = note;
        if (keepNote === undefined && target.apiTarget) {
          keepNote =
            (await fetchPublishedSoundscape(target.apiTarget.did, input.rkey).catch(() => null))?.note ??
            undefined;
        }
        published = await putSoundscapeRecord(
          input.rkey,
          { title: input.title, note: keepNote, ceilingHz: input.ceilingHz, sources: input.sources },
          options,
        );
      } else {
        const draft: SoundscapeDraft = {
          title: input.title,
          note,
          ceilingHz: input.ceilingHz,
          sources: input.sources,
        };
        published = await createSoundscapeRecord(draft, options);
      }
      const next: PublishedRef = { ...published, signature };
      publishedRef.current = next;
      return next;
    },
    [target.apiTarget, target.repo],
  );
}

// ── Share to the feed ────────────────────────────────────────────────────────

export function ShareSoundscapeToFeedModal({
  input,
  target,
  publish,
  onClose,
}: {
  input: SoundscapePublishInput;
  target: ShareTarget;
  publish: (input: SoundscapePublishInput, note?: string) => Promise<PublishedRef>;
  onClose: () => void;
}) {
  const t = useTranslations("common.soundscape.share");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postedHref, setPostedHref] = useState<string | null>(null);

  const defaultCaption = t("feed.defaultCaption", { count: input.sources.length });

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const text = caption.trim() || defaultCaption;
      const published = await publish(input, caption.trim() || undefined);
      const link = new URL(soundscapeHref(published.did, published.rkey), window.location.origin).toString();
      // The link is what makes the post playable: the feed recognises a
      // soundscape permalink and draws the dial in place of the bare URL.
      const body = `${text}\n${link}`.slice(0, POST_MAX + link.length);
      await createFeedPost({ text: body }, target.repo ? { repo: target.repo } : undefined);
      setPostedHref(soundscapeHref(published.did, published.rkey));
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }, [caption, defaultCaption, input, publish, t, target.repo]);

  if (postedHref) {
    return (
      <ModalContent className="w-full">
        <ModalTitle>{t("feed.postedTitle")}</ModalTitle>
        <ModalDescription className="mt-1">{t("feed.postedBody")}</ModalDescription>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
          <Button asChild>
            <Link href="/feed">{t("feed.viewFeed")}</Link>
          </Button>
        </div>
      </ModalContent>
    );
  }

  return (
    <ModalContent className="w-full">
      <ModalTitle>{t("feed.title")}</ModalTitle>
      <ModalDescription className="mt-1">{t("feed.subtitle", { count: input.sources.length })}</ModalDescription>

      <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="soundscape-caption">
        {t("captionLabel")}
      </label>
      <textarea
        id="soundscape-caption"
        value={caption}
        onChange={(event) => setCaption(event.target.value.slice(0, CAPTION_MAX))}
        rows={3}
        placeholder={defaultCaption}
        className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
      />
      <p className="mt-1 text-xs text-muted-foreground">{t("feed.linkNote")}</p>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {busy ? t("feed.posting") : t("feed.post")}
        </Button>
      </div>
    </ModalContent>
  );
}

// ── Add to a project's evidence timeline ─────────────────────────────────────

type PickerProject = {
  rkey: string;
  did: string;
  atUri: string;
  cid: string | null;
  title: string;
  imageUrl: string | null;
};

type ApiProject = {
  rkey?: unknown;
  did?: unknown;
  atUri?: unknown;
  cid?: unknown;
  title?: unknown;
  imageUrl?: unknown;
};

function toPickerProject(raw: ApiProject, fallbackTitle: string): PickerProject | null {
  if (typeof raw.rkey !== "string" || typeof raw.did !== "string" || typeof raw.atUri !== "string") return null;
  return {
    rkey: raw.rkey,
    did: raw.did,
    atUri: raw.atUri,
    cid: typeof raw.cid === "string" ? raw.cid : null,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : fallbackTitle,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
  };
}

export function AddSoundscapeToProjectModal({
  input,
  target,
  publish,
  onClose,
}: {
  input: SoundscapePublishInput;
  target: ShareTarget;
  publish: (input: SoundscapePublishInput, note?: string) => Promise<PublishedRef>;
  onClose: () => void;
}) {
  const t = useTranslations("common.soundscape.share");
  const [projects, setProjects] = useState<PickerProject[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [caption, setCaption] = useState("");
  const [submittingRkey, setSubmittingRkey] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addedTo, setAddedTo] = useState<PickerProject | null>(null);

  useEffect(() => {
    if (!target.apiTarget) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    setProjects(null);
    setLoadError(false);
    void (async () => {
      try {
        const response = await fetch(manageApiHref("/api/manage/projects", target.apiTarget), {
          cache: "no-store",
        });
        const data = (await response.json()) as ApiProject[] | { error?: string };
        if (cancelled) return;
        if (!response.ok || !Array.isArray(data)) {
          setLoadError(true);
          setProjects([]);
          return;
        }
        setProjects(
          data
            .map((raw) => toPickerProject(raw, t("untitledProject")))
            .filter((project): project is PickerProject => Boolean(project)),
        );
      } catch {
        if (cancelled) return;
        setLoadError(true);
        setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.apiTarget, t]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) => project.title.toLowerCase().includes(normalized));
  }, [projects, query]);

  const addToProject = useCallback(
    async (project: PickerProject) => {
      setSubmittingRkey(project.rkey);
      setSubmitError(null);
      try {
        const published = await publish(input, caption.trim() || undefined);
        // A timeline entry pins the exact version of the project it hangs off,
        // so a project listed without a CID is read from its PDS first.
        const subject = project.cid
          ? { uri: project.atUri, cid: project.cid }
          : await resolveStrongRef(project.atUri);
        await createContextAttachment({
          draft: {
            title: input.title,
            contentType: SOUNDSCAPE_ATTACHMENT_CONTENT_TYPE,
            contents: [published.uri],
            note: caption.trim() || undefined,
          },
          activitySubject: subject,
          organizationDid: project.did,
          repo: target.repo,
        });
        setAddedTo(project);
      } catch {
        setSubmitError(t("errorGeneric"));
      } finally {
        setSubmittingRkey(null);
      }
    },
    [caption, input, publish, t, target.repo],
  );

  if (addedTo) {
    return (
      <ModalContent className="w-full">
        <ModalTitle className="flex items-center gap-2">
          <CheckCircle2Icon className="size-5 text-primary" />
          {t("project.addedTitle")}
        </ModalTitle>
        <ModalDescription className="mt-1">
          {t("project.addedBody", { project: addedTo.title })}
        </ModalDescription>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("close")}
          </Button>
          <Button asChild>
            <Link href={`/projects/${encodeURIComponent(addedTo.did)}/${encodeURIComponent(addedTo.rkey)}`}>
              {t("project.viewProject")}
            </Link>
          </Button>
        </div>
      </ModalContent>
    );
  }

  return (
    <ModalContent className="w-full">
      <ModalTitle>{t("project.title")}</ModalTitle>
      <ModalDescription className="mt-1">{t("project.subtitle")}</ModalDescription>

      <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="soundscape-project-caption">
        {t("captionLabel")}
      </label>
      <textarea
        id="soundscape-project-caption"
        value={caption}
        onChange={(event) => setCaption(event.target.value.slice(0, CAPTION_MAX))}
        rows={2}
        placeholder={t("project.captionPlaceholder")}
        className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
      />

      {projects === null ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> {t("project.loading")}
        </div>
      ) : loadError ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-muted/30 px-6 py-8 text-center">
          <TriangleAlertIcon className="size-7 text-muted-foreground opacity-70" />
          <p className="text-sm text-muted-foreground">{t("project.loadError")}</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-muted/30 px-6 py-8 text-center">
          <FolderKanbanIcon className="size-7 text-muted-foreground opacity-70" />
          <p className="text-sm text-muted-foreground">{t("project.empty")}</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/manage/projects">{t("project.createProject")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {projects.length > 6 ? (
            <div className="relative mt-4">
              <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("project.searchPlaceholder")}
                aria-label={t("project.searchPlaceholder")}
                className="w-full rounded-xl border border-border bg-background py-2 ps-9 pe-3 text-sm outline-none focus:border-primary/50"
              />
            </div>
          ) : null}

          <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
            {filtered.map((project) => {
              const busy = submittingRkey === project.rkey;
              return (
                <li key={`${project.did}/${project.rkey}`}>
                  <button
                    type="button"
                    onClick={() => void addToProject(project)}
                    disabled={submittingRkey !== null}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-start transition-colors hover:bg-muted disabled:opacity-60",
                      busy && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                      {project.imageUrl ? (
                        <Image src={project.imageUrl} alt="" fill sizes="36px" className="object-cover" />
                      ) : (
                        <FolderKanbanIcon className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {project.title}
                    </span>
                    {busy ? (
                      <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
                    ) : (
                      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {submitError ? <p className="mt-3 text-sm text-destructive">{submitError}</p> : null}

      <div className="mt-6 flex justify-end">
        <Button variant="outline" onClick={onClose} disabled={submittingRkey !== null}>
          {t("close")}
        </Button>
      </div>
    </ModalContent>
  );
}
