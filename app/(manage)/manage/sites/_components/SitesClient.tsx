"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CirclePlusIcon,
  LayoutGridIcon,
  ListIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import Container from "@/components/ui/container";
import { deleteRecord, putRecord } from "../../_lib/mutations";
import type { ManagedLocation } from "@/app/_lib/indexer";
import { SitesSkeleton } from "./SitesSkeleton";
import { SiteCard } from "./SiteCard";
import {
  SiteEditorModal,
  SiteEditorModalId,
} from "../../_modals/SiteEditorModal";

const PREVIEW_APP_BASE_URL = "https://polygons-gainforest.vercel.app";
const DEFAULT_SITE_COLLECTION = "app.gainforest.organization.defaultSite";
type ViewMode = "cards" | "list";

function siteRecordUri(did: string, site: ManagedLocation | null, rkey: string | null): string | null {
  if (site?.metadata.uri) return site.metadata.uri;
  return rkey ? `at://${did}/app.certified.location/${rkey}` : null;
}

function generateSitePreviewUrl(siteUri: string | null): string | null {
  return siteUri
    ? `${PREVIEW_APP_BASE_URL}/view?certifiedLocationRecordUri=${encodeURIComponent(siteUri)}`
    : null;
}

function isShapeLocation(site: ManagedLocation): boolean {
  return Boolean(
    site.record.location?.kind === "uri" ||
      (site.record.locationType !== null &&
        site.record.locationType !== "point" &&
        site.record.locationType !== "coordinate-decimal"),
  );
}

function canPreviewSite(site: ManagedLocation): boolean {
  return site.record.location?.kind === "uri";
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

export function SitesClient({ did }: { did: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modal = useModal();

  const [sites, setSites] = useState<ManagedLocation[]>([]);
  const [defaultSiteUri, setDefaultSiteUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState<string | null>(null);
  const [deletingRkey, setDeletingRkey] = useState<string | null>(null);
  const [settingDefaultRkey, setSettingDefaultRkey] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [previewingRkey, setPreviewingRkey] = useState<string | null>(searchParams.get("rkey"));
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("cards");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const loadDefaultSite = useCallback(async () => {
    setDefaultError(null);
    try {
      const res = await fetch("/api/manage/sites/default");
      const data = (await res.json()) as { siteUri: string | null } | { error: string };
      if (!res.ok || "error" in data) {
        setDefaultError(("error" in data ? data.error : null) ?? "Could not load the default site.");
      } else {
        setDefaultSiteUri(data.siteUri);
      }
    } catch {
      setDefaultError("Could not load the default site.");
    }
  }, []);

  const loadSites = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    setCardErrors({});
    try {
      const res = await fetch("/api/manage/sites");
      const data = (await res.json()) as ManagedLocation[] | { error: string };
      if (!res.ok || "error" in data) {
        setFetchError(("error" in data ? data.error : null) ?? "Failed to load sites.");
      } else {
        setSites(data);
      }
      await loadDefaultSite();
    } catch {
      setFetchError("Could not reach the server.");
    } finally {
      setIsLoading(false);
    }
  }, [loadDefaultSite]);

  useEffect(() => { void loadSites(); }, [loadSites]);

  useEffect(() => {
    const rkey = searchParams.get("rkey");
    if (!rkey) return;
    const site = sites.find((item) => item.metadata.rkey === rkey) ?? null;
    if (!site || !canPreviewSite(site) || iframeUrl) return;
    setPreviewingRkey(rkey);
    setIframeUrl(generateSitePreviewUrl(siteRecordUri(did, site, rkey)));
  }, [did, iframeUrl, searchParams, sites]);

  const handlePreviewSite = (site: ManagedLocation) => {
    const rkey = site.metadata.rkey;
    const nextSiteUri = siteRecordUri(did, site, rkey);
    const nextUrl = generateSitePreviewUrl(nextSiteUri);
    if (!rkey || !nextUrl || !canPreviewSite(site)) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("rkey", rkey);
    router.push(`?${params.toString()}`, { scroll: false });
    setPreviewingRkey(rkey);

    setIframeUrl((prev) => {
      if (prev === null) return nextUrl;
      iframeRef.current?.contentWindow?.postMessage(
        { type: "load-uri", uri: nextSiteUri },
        PREVIEW_APP_BASE_URL,
      );
      return prev;
    });
  };

  useEffect(() => {
    if (isLoading || fetchError || searchParams.get("rkey") || previewingRkey || iframeUrl) return;

    const previewableSites = sites.filter(canPreviewSite);
    const defaultSite = defaultSiteUri
      ? previewableSites.find((site) => site.metadata.uri === defaultSiteUri) ?? null
      : null;
    const initialSite = defaultSite ?? previewableSites[0] ?? null;
    if (initialSite) handlePreviewSite(initialSite);
  }, [defaultSiteUri, fetchError, iframeUrl, isLoading, previewingRkey, searchParams, sites]);

  const allSiteRkeys = sites
    .filter(canPreviewSite)
    .map((site) => site.metadata.rkey)
    .filter((rkey): rkey is string => typeof rkey === "string" && rkey.length > 0);
  const currentSiteIndex = previewingRkey ? allSiteRkeys.indexOf(previewingRkey) : -1;
  const canShowPreview = currentSiteIndex >= 0 && Boolean(iframeUrl);

  const handleOpenAdd = () => {
    modal.pushModal(
      {
        id: SiteEditorModalId,
        dialogWidth: "max-w-lg",
        content: (
          <SiteEditorModal
            did={did}
            initialData={null}
            onSaved={() => void loadSites()}
          />
        ),
      },
      true,
    );
    void modal.show();
  };

  const handleOpenEdit = (site: ManagedLocation) => {
    const rkey = site.metadata.rkey;
    modal.pushModal(
      {
        id: `${SiteEditorModalId}-${rkey}`,
        dialogWidth: "max-w-lg",
        content: (
          <SiteEditorModal
            did={did}
            initialData={{
              rkey,
              name: site.record.name ?? "",
              hasShapeLocation: isShapeLocation(site),
              recordValue: site.rawRecord ?? null,
            }}
            onSaved={() => void loadSites()}
          />
        ),
      },
      true,
    );
    void modal.show();
  };

  const setCardError = (rkey: string, message: string | null) => {
    setCardErrors((prev) => {
      const next = { ...prev };
      if (message) next[rkey] = message;
      else delete next[rkey];
      return next;
    });
  };

  const handleSetDefault = async (site: ManagedLocation) => {
    const rkey = site.metadata.rkey;
    const siteUri = site.metadata.uri;
    if (!rkey || !siteUri) return;
    setSettingDefaultRkey(rkey);
    setCardError(rkey, null);
    const previousDefault = defaultSiteUri;
    setDefaultSiteUri(siteUri);
    try {
      await putRecord(DEFAULT_SITE_COLLECTION, "self", {
        $type: DEFAULT_SITE_COLLECTION,
        site: siteUri,
        createdAt: new Date().toISOString(),
      });
      void loadDefaultSite();
    } catch (err) {
      setDefaultSiteUri(previousDefault);
      setCardError(rkey, err instanceof Error ? err.message : "Failed to make this the default site.");
    } finally {
      setSettingDefaultRkey(null);
    }
  };

  const handleDelete = async (site: ManagedLocation) => {
    const rkey = site.metadata.rkey;
    if (!rkey) return;
    if (site.metadata.uri && site.metadata.uri === defaultSiteUri) {
      setCardError(rkey, "Choose another default site before deleting this one.");
      return;
    }

    setDeletingRkey(rkey);
    setCardError(rkey, null);
    try {
      await deleteRecord("app.certified.location", rkey);
      setSites((prev) => prev.filter((item) => item.metadata.rkey !== rkey));
      if (previewingRkey === rkey) {
        setPreviewingRkey(null);
        setIframeUrl(null);
        router.push("/manage/sites", { scroll: false });
      }
    } catch (err) {
      setCardError(rkey, err instanceof Error ? err.message : "Failed to delete site.");
    } finally {
      setDeletingRkey(null);
    }
  };

  if (isLoading) {
    return <SitesSkeleton />;
  }

  return (
    <Container className="space-y-6 pb-8 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">My Sites</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage your field locations and mapped project areas.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sites.length > 0 ? <ViewToggle view={view} setView={setView} /> : null}
          <Button size="sm" className="rounded-full" onClick={handleOpenAdd}>
            <CirclePlusIcon />
            Add site
          </Button>
        </div>
      </div>

      {canShowPreview && (
        <div className="relative h-80 w-full overflow-hidden rounded-2xl border border-border">
          <iframe
            ref={iframeRef}
            className="h-full w-full"
            src={iframeUrl ?? undefined}
            title="Site map preview"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between p-4">
            <Button
              size="icon"
              variant="outline"
              className="pointer-events-auto"
              disabled={currentSiteIndex <= 0}
              onClick={() => {
                const prevRkey = allSiteRkeys[currentSiteIndex - 1];
                const prevSite = sites.find((site) => site.metadata.rkey === prevRkey);
                if (prevSite) handlePreviewSite(prevSite);
              }}
              aria-label="Previous site"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="pointer-events-auto"
              disabled={currentSiteIndex >= allSiteRkeys.length - 1}
              onClick={() => {
                const nextRkey = allSiteRkeys[currentSiteIndex + 1];
                const nextSite = sites.find((site) => site.metadata.rkey === nextRkey);
                if (nextSite) handlePreviewSite(nextSite);
              }}
              aria-label="Next site"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {fetchError && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <span>{fetchError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadSites()}>
            Retry
          </Button>
        </div>
      )}
      {defaultError && !fetchError && (
        <p className="text-sm text-destructive">{defaultError}</p>
      )}

      {sites.length === 0 && !fetchError ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex h-48 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border text-center"
        >
          <p className="font-garamond text-xl font-semibold text-muted-foreground">
            No sites yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add your first field location to get started.
          </p>
          <Button variant="outline" size="sm" onClick={handleOpenAdd}>
            <CirclePlusIcon />
            Add a site
          </Button>
        </motion.div>
      ) : (
        <AnimatePresence>
          <div className={view === "list" ? "" : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
            {sites.map((site) => {
              const rkey = site.metadata.rkey;
              if (!rkey) return null;
              const card = (
                <SiteCard
                  site={site}
                  defaultSiteUri={defaultSiteUri}
                  onPreview={() => handlePreviewSite(site)}
                  onEdit={() => handleOpenEdit(site)}
                  onSetDefault={() => void handleSetDefault(site)}
                  onDelete={() => void handleDelete(site)}
                  isPreviewing={previewingRkey === rkey}
                  isSettingDefault={settingDefaultRkey === rkey}
                  isDeleting={deletingRkey === rkey}
                  error={cardErrors[rkey] ?? null}
                  variant={view === "list" ? "list" : "card"}
                />
              );
              return view === "list" ? (
                <div key={site.metadata.uri ?? rkey} className="relative after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                  {card}
                </div>
              ) : (
                <div key={site.metadata.uri ?? rkey}>{card}</div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </Container>
  );
}
