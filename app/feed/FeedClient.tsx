"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BinocularsIcon,
  Building2Icon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  Loader2Icon,
  NewspaperIcon,
  RefreshCwIcon,
} from "lucide-react";
import type { ActivityFeedItem, ActivityFeedKind } from "../_lib/feed";
import { resolveBlobUrl } from "../_lib/pds";
import { formatCompactUsd, formatRelative } from "../_lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Filter = "all" | ActivityFeedKind;

const FILTERS: { key: Filter; Icon: typeof NewspaperIcon }[] = [
  { key: "all", Icon: NewspaperIcon },
  { key: "project", Icon: FolderKanbanIcon },
  { key: "observation", Icon: BinocularsIcon },
  { key: "organization", Icon: Building2Icon },
  { key: "donation", Icon: HeartHandshakeIcon },
];

export function FeedClient({ initialItems }: { initialItems: ActivityFeedItem[] }) {
  const t = useTranslations("common.feed");
  const [items, setItems] = useState<ActivityFeedItem[]>(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(initialItems.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/feed", { cache: "no-store" });
        if (!res.ok) throw new Error("feed fetch failed");
        const data = (await res.json()) as { items?: ActivityFeedItem[] };
        setItems(data.items ?? []);
      } catch {
        setError(true);
      } finally {
        if (mode === "refresh") setRefreshing(false);
        else setLoading(false);
      }
    },
    [],
  );

  // If the server prefetched nothing (e.g. first deploy), fetch client-side.
  useEffect(() => {
    if (initialItems.length === 0) void load("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = filter === "all" ? items : items.filter((item) => item.kind === filter);

  return (
    <section className="-mt-14 pb-24 md:pb-32">
      {/* Hero */}
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-primary/8 via-primary/2 to-transparent" />
        <div className="mx-auto flex max-w-3xl flex-col px-6 pb-6 pt-[72px] sm:px-8 animate-in">
          <div className="flex items-center gap-2 text-primary/70">
            <NewspaperIcon className="size-5" />
            <span className="text-xs font-medium uppercase tracking-[0.16em]">{t("eyebrow")}</span>
          </div>
          <h1
            className="mt-3 text-4xl font-light leading-[0.98] tracking-[-0.035em] text-foreground sm:text-5xl"
            style={{ fontFamily: "var(--font-garamond-var)" }}
          >
            {t("hero.title")}{" "}
            <span style={{ fontFamily: "var(--font-instrument-serif-var)", fontStyle: "italic" }}>
              {t("hero.accent")}
            </span>
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">{t("hero.description")}</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        {/* Filter pills + refresh */}
        <div className="sticky top-14 z-20 -mx-4 mb-2 flex items-center gap-2 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-full sm:border sm:px-3">
          <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            {FILTERS.map(({ key, Icon }) => {
              const active = filter === key;
              const label = key === "all" ? t("filters.all") : t(`filters.${key}`);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void load("refresh")}
            disabled={refreshing}
            aria-label={t("refresh")}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCwIcon className={cn("size-4", refreshing && "animate-spin")} />
          </button>
        </div>

        {/* Timeline */}
        {loading ? (
          <FeedSkeleton />
        ) : error ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">{t("error")}</p>
            <button
              type="button"
              onClick={() => void load("initial")}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {filter === "all" ? t("empty") : t("emptyFiltered")}
            </p>
          </div>
        ) : (
          <ol className="relative">
            {visible.map((item) => (
              <FeedRow key={item.id} item={item} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function FeedRow({ item }: { item: ActivityFeedItem }) {
  const t = useTranslations("common.feed");
  const verb = t(`verbs.${item.kind}`);

  return (
    <li className="relative">
      <Link
        href={item.href}
        className="group flex gap-3 rounded-2xl px-3 py-3.5 transition-colors hover:bg-muted/40"
      >
        {/* Avatar */}
        <FeedAvatar item={item} />

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Author line */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="truncate font-medium text-foreground">
              {item.actorName || item.actorDid ? item.actorName ?? shortDid(item.actorDid) : t("anonymous")}
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span className="shrink-0 text-xs text-muted-foreground/80" title={fullDate(item.createdAt)}>
              {formatRelative(item.createdAt)}
            </span>
          </div>

          {/* Verb line */}
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <KindIcon kind={item.kind} className="size-3.5 shrink-0 text-primary/70" />
            <span className="truncate">{verb}</span>
          </p>

          {/* Headline */}
          {item.title ? (
            <p className="mt-1.5 line-clamp-2 text-[15px] font-medium leading-snug text-foreground">
              {item.title}
            </p>
          ) : null}

          {/* Body text */}
          {item.text ? (
            <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
          ) : null}

          {/* Donation target line */}
          {item.kind === "donation" && item.targetTitle ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {t("to")}: <span className="text-foreground/80">{item.targetTitle}</span>
            </p>
          ) : null}

          {/* Cover image */}
          {hasImage(item) ? (
            <div className="relative mt-2 overflow-hidden rounded-xl border border-border/60">
              <FeedImage item={item} />
            </div>
          ) : null}
        </div>

        {/* Donation amount pill */}
        {item.kind === "donation" && item.amount != null ? (
          <span className="ml-auto mt-0.5 inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary tabular-nums">
            {item.currency === "USD" ? formatCompactUsd(item.amount) : `${item.amount} ${item.currency}`}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function FeedAvatar({ item }: { item: ActivityFeedItem }) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    setResolved(null);
    if (item.imageUrl || !item.actorDid || !item.actorAvatarRef) return;
    const controller = new AbortController();
    resolveBlobUrl(item.actorDid, item.actorAvatarRef, controller.signal)
      .then((url) => setResolved(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolved(null);
      });
    return () => controller.abort();
  }, [item.actorDid, item.actorAvatarRef, item.imageUrl]);

  const src = item.imageUrl ?? resolved;

  return (
    <span
      className={cn(
        "relative mt-0.5 grid size-10 shrink-0 place-items-center overflow-hidden rounded-full",
        !src && "bg-primary/10 text-primary",
      )}
      aria-hidden
    >
      {src ? (
        <Image src={src} alt="" fill unoptimized sizes="40px" className="object-cover" />
      ) : (
        <KindIcon kind={item.kind} className="size-4" />
      )}
    </span>
  );
}

function FeedImage({ item }: { item: ActivityFeedItem }) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    setResolved(null);
    if (item.imageUrl || !item.actorDid || !item.imageRef) return;
    const controller = new AbortController();
    resolveBlobUrl(item.actorDid, item.imageRef, controller.signal)
      .then((url) => setResolved(url))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setResolved(null);
      });
    return () => controller.abort();
  }, [item.actorDid, item.imageRef, item.imageUrl]);

  const src = item.imageUrl ?? resolved;
  if (!src) return null;

  return (
    <div className="relative aspect-[16/9] w-full bg-muted">
      <Image src={src} alt="" fill unoptimized sizes="(max-width: 672px) 100vw, 608px" className="object-cover" />
    </div>
  );
}

function hasImage(item: ActivityFeedItem): boolean {
  return Boolean(item.imageUrl || (item.actorDid && item.imageRef));
}

function KindIcon({ kind, className }: { kind: ActivityFeedKind; className?: string }) {
  switch (kind) {
    case "project":
      return <FolderKanbanIcon className={className} />;
    case "observation":
      return <BinocularsIcon className={className} />;
    case "organization":
      return <Building2Icon className={className} />;
    case "donation":
      return <HeartHandshakeIcon className={className} />;
  }
}

function FeedSkeleton() {
  return (
    <ol className="relative">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex gap-3 rounded-2xl px-3 py-3.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3.5 w-1/3 rounded-full" />
            <Skeleton className="h-3 w-1/4 rounded-full" />
            <Skeleton className="h-4 w-4/5 rounded-full" />
            <Skeleton className="h-3 w-2/3 rounded-full" />
          </div>
        </li>
      ))}
    </ol>
  );
}

function shortDid(did: string): string {
  if (!did) return "";
  return did.length > 18 ? `${did.slice(0, 10)}…${did.slice(-4)}` : did;
}

function fullDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function LoadingFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export { LoadingFallback };
