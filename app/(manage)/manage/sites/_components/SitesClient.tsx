"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CirclePlusIcon,
  LayoutGridIcon,
  ListIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { manageApiHref, manageHref, type ManageTarget } from "@/lib/links";
import { useModal } from "@/components/ui/modal/context";
import Container from "@/components/ui/container";
import { canCreateRecord, canDeleteRecord, canUpdateRecord } from "../../_lib/cgs-permissions";
import { deleteRecord, putRecord } from "../../_lib/mutations";
import type { ManagedLocation } from "@/app/_lib/indexer";
import { SitesSkeleton } from "./SitesSkeleton";
import { SiteCard } from "./SiteCard";
import {
  SiteEditorModal,
  SiteEditorModalId,
} from "../../_modals/SiteEditorModal";
import { takeAddDataHandoff } from "../../_lib/upload/add-data-handoff";
import { ManageViewToggle } from "../../_components/ManageViewToggle";
import { ManageSectionHeader } from "../../_components/ManageSectionHeader";

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

export function SitesClient({ did, target }: { did: string; target: ManageTarget }) {
  const t = useTranslations("upload.sites");
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
  const createPermission = canCreateRecord(target);
  const updatePermission = canUpdateRecord(target);
  const deletePermission = canDeleteRecord(target);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const loadDefaultSite = useCallback(async () => {
    setDefaultError(null);
    try {
      const res = await fetch(manageApiHref("/api/manage/sites/default", target));
      const data = (await res.json()) as { siteUri: string | null } | { error: string };
      if (!res.ok || "error" in data) {
        if ("error" in data) console.error("Default site load failed", data.error);
        setDefaultError(t("defaultLoadError"));
      } else {
        setDefaultSiteUri(data.siteUri);
      }
    } catch (error) {
      console.error("Default site load failed", error);
      setDefaultError(t("defaultLoadError"));
    }
  }, [t, target]);

  const loadSites = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    setCardErrors({});
    try {
      const res = await fetch(manageApiHref("/api/manage/sites", target));
      const data = (await res.json()) as ManagedLocation[] | { error: string };
      if (!res.ok || "error" in data) {
        if ("error" in data) console.error("Site list load failed", data.error);
        setFetchError(t("loadError"));
      } else {
        setSites(data);
      }
      await loadDefaultSite();
    } catch (error) {
      console.error("Site list load failed", error);
      setFetchError(t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [loadDefaultSite, t, target]);

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

  const handleOpenAdd = useCallback((initialFile: File | null = null) => {
    if (!createPermission.allowed) {
      setFetchError(t("createDenied"));
      return;
    }
    modal.pushModal(
      {
        id: SiteEditorModalId,
        dialogWidth: "max-w-lg",
        content: (
          <SiteEditorModal
            did={did}
            target={target}
            initialData={null}
            initialFile={initialFile}
            onSaved={() => void loadSites()}
          />
        ),
      },
      true,
    );
    void modal.show();
  }, [createPermission.allowed, did, loadSites, modal, t, target]);

  // Open the site editor when arriving from the unified "Add data" drop zone
  // (?add=1), preloading any handed-off GeoJSON boundary file. Runs once.
  const addHandledRef = useRef(false);
  useEffect(() => {
    if (addHandledRef.current) return;
    if (searchParams.get("add") !== "1") return;
    addHandledRef.current = true;
    const [file] = takeAddDataHandoff("site");
    handleOpenAdd(file ?? null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("add");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [handleOpenAdd, router, searchParams]);

  const handleOpenEdit = (site: ManagedLocation) => {
    if (!updatePermission.allowed) {
      if (site.metadata.rkey) setCardError(site.metadata.rkey, t("editDenied"));
      return;
    }
    const rkey = site.metadata.rkey;
    modal.pushModal(
      {
        id: `${SiteEditorModalId}-${rkey}`,
        dialogWidth: "max-w-lg",
        content: (
          <SiteEditorModal
            did={did}
            target={target}
            initialData={{
              rkey,
              cid: site.metadata.cid,
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
    if (!updatePermission.allowed) {
      setCardError(rkey, t("defaultDenied"));
      return;
    }
    setSettingDefaultRkey(rkey);
    setCardError(rkey, null);
    const previousDefault = defaultSiteUri;
    setDefaultSiteUri(siteUri);
    try {
      await putRecord(DEFAULT_SITE_COLLECTION, "self", {
        $type: DEFAULT_SITE_COLLECTION,
        site: siteUri,
        createdAt: new Date().toISOString(),
      }, target.kind === "group" ? { repo: target.did } : undefined);
      void loadDefaultSite();
    } catch (err) {
      console.error("Default site update failed", err);
      setDefaultSiteUri(previousDefault);
      setCardError(rkey, t("defaultError"));
    } finally {
      setSettingDefaultRkey(null);
    }
  };

  const handleDelete = async (site: ManagedLocation) => {
    const rkey = site.metadata.rkey;
    if (!rkey) return;
    if (site.metadata.uri && site.metadata.uri === defaultSiteUri) {
      setCardError(rkey, t("deleteDefaultBlocked"));
      return;
    }
    if (!deletePermission.allowed) {
      setCardError(rkey, t("deleteDenied"));
      return;
    }

    setDeletingRkey(rkey);
    setCardError(rkey, null);
    try {
      await deleteRecord("app.certified.location", rkey, target.kind === "group" ? { repo: target.did } : undefined);
      setSites((prev) => prev.filter((item) => item.metadata.rkey !== rkey));
      if (previewingRkey === rkey) {
        setPreviewingRkey(null);
        setIframeUrl(null);
        router.push(manageHref(target, "sites"), { scroll: false });
      }
    } catch (err) {
      console.error("Site deletion failed", err);
      setCardError(rkey, t("deleteError"));
    } finally {
      setDeletingRkey(null);
    }
  };

  if (isLoading) {
    return <SitesSkeleton />;
  }

  return (
    <Container className="space-y-6 pb-8 pt-4">
      <ManageSectionHeader
        title={t("title")}
        actions={(
          <>
            {sites.length > 0 ? (
              <ManageViewToggle
                value={view}
                onChange={setView}
                options={[
                  { id: "cards", label: t("cardsView"), icon: LayoutGridIcon },
                  { id: "list", label: t("listView"), icon: ListIcon },
                ]}
              />
            ) : null}
            <Button size="sm" className="rounded-full" onClick={() => handleOpenAdd()} disabled={!createPermission.allowed} aria-describedby={!createPermission.allowed ? "sites-create-permission" : undefined}>
              <CirclePlusIcon />
              {t("addSite")}
            </Button>
          </>
        )}
      />
      {!createPermission.allowed ? <p id="sites-create-permission" className="text-sm text-muted-foreground">{t("createDenied")}</p> : null}

      {canShowPreview && (
        <div className="relative h-80 w-full overflow-hidden rounded-2xl border border-border">
          <iframe
            ref={iframeRef}
            className="h-full w-full"
            src={iframeUrl ?? undefined}
            title={t("mapPreview")}
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
              aria-label={t("previousSite")}
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
              aria-label={t("nextSite")}
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
            {t("retry")}
          </Button>
        </div>
      )}
      {defaultError && !fetchError && (
        <p className="text-sm text-destructive">{defaultError}</p>
      )}

      {sites.length === 0 && !fetchError ? (
        <div className="flex h-48 flex-col items-center justify-center gap-4 rounded-2xl bg-muted px-6 text-center">
          <h2 className="font-instrument text-xl font-semibold italic text-foreground">
            {t("emptyTitle")}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
          <Button variant="outline" size="sm" onClick={() => handleOpenAdd()} disabled={!createPermission.allowed} title={!createPermission.allowed ? t("createDenied") : undefined}>
            <CirclePlusIcon />
            {t("addASite")}
          </Button>
        </div>
      ) : (
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
                  updateDisabledReason={!updatePermission.allowed ? t("editDenied") : null}
                  deleteDisabledReason={!deletePermission.allowed ? t("deleteDenied") : null}
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
      )}
    </Container>
  );
}
