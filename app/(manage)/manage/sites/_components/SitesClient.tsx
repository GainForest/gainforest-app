"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgeCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CirclePlusIcon,
  CrosshairIcon,
  GlobeIcon,
  Loader2Icon,
  MapPinIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Container from "@/components/ui/container";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { createRecord, putRecord, deleteRecord } from "../../_lib/mutations";
import type { ManagedLocation } from "@/app/_lib/indexer";

// ── Types ─────────────────────────────────────────────────────────────────────

type LocationType = "point" | "uri";

interface SiteFormState {
  name: string;
  description: string;
  locationType: LocationType;
  lat: string;
  lon: string;
  uri: string;
}

const EMPTY_FORM: SiteFormState = {
  name: "",
  description: "",
  locationType: "point",
  lat: "",
  lon: "",
  uri: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLocationRecord(form: SiteFormState) {
  if (form.locationType === "point") {
    const latNum = parseFloat(form.lat);
    const lonNum = parseFloat(form.lon);
    if (!isNaN(latNum) && !isNaN(lonNum)) {
      return {
        $type: "app.certified.location#string",
        string: `${latNum}, ${lonNum}`,
      };
    }
  }
  if (form.locationType === "uri" && form.uri.trim()) {
    return { $type: "org.hypercerts.defs#uri", uri: form.uri.trim() };
  }
  return undefined;
}

function formFromLocation(site: ManagedLocation): SiteFormState {
  const loc = site.record.location;
  if (loc?.kind === "point") {
    return {
      name: site.record.name ?? "",
      description: site.record.description ?? "",
      locationType: "point",
      lat: String(loc.lat),
      lon: String(loc.lon),
      uri: "",
    };
  }
  if (loc?.kind === "uri") {
    return {
      name: site.record.name ?? "",
      description: site.record.description ?? "",
      locationType: "uri",
      lat: "",
      lon: "",
      uri: loc.uri,
    };
  }
  return {
    name: site.record.name ?? "",
    description: site.record.description ?? "",
    locationType: "point",
    lat: "",
    lon: "",
    uri: "",
  };
}

// ── SiteCard ──────────────────────────────────────────────────────────────────

function SiteCard({
  site,
  onEdit,
  onDelete,
  onPreview,
  isPreviewing,
}: {
  site: ManagedLocation;
  onEdit: (site: ManagedLocation) => void;
  onDelete: (rkey: string) => void;
  onPreview?: (rkey: string) => void;
  isPreviewing?: boolean;
}) {
  const loc = site.record.location;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn("relative rounded-xl border overflow-hidden bg-background hover:border-primary/30 hover:shadow-md transition-all duration-300", isPreviewing ? "border-primary" : "border-border")}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 h-10 pr-11 border-b border-border">
        {loc?.kind === "point" ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPinIcon className="h-3 w-3 shrink-0" />
            Point
          </span>
        ) : loc?.kind === "uri" ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <GlobeIcon className="h-3 w-3 shrink-0" />
            Shapefile
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Location</span>
        )}
        {site.record.locationType && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium capitalize">
            {site.record.locationType}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 flex flex-col gap-1">
        <h3 className="font-medium text-base leading-snug">
          {site.record.name ?? <span className="text-muted-foreground">Unnamed site</span>}
        </h3>

        {loc?.kind === "point" && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CrosshairIcon className="h-3 w-3 shrink-0" />
            {loc.lat.toFixed(4)}°, {loc.lon.toFixed(4)}°
          </span>
        )}
        {loc?.kind === "uri" && (
          <span className="text-xs text-muted-foreground truncate max-w-full">
            {loc.uri}
          </span>
        )}

        {site.record.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {site.record.description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="absolute top-1.5 right-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreVerticalIcon className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onPreview && loc?.kind === "uri" && (
              <>
                <DropdownMenuItem onClick={() => onPreview(site.metadata.rkey)}>
                  <GlobeIcon className="h-3.5 w-3.5 mr-2" />
                  {isPreviewing ? "Viewing" : "View on map"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => onEdit(site)}>
              <PencilIcon className="h-3.5 w-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(site.metadata.rkey)}
            >
              <Trash2Icon className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

// ── SiteEditor (modal-like inline panel) ─────────────────────────────────────

function SiteEditor({
  initialForm,
  editingRkey,
  onClose,
  onSaved,
}: {
  initialForm: SiteFormState;
  editingRkey: string | null;
  onClose: () => void;
  onSaved: (site: ManagedLocation) => void;
}) {
  const [form, setForm] = useState<SiteFormState>(initialForm);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdding = editingRkey === null;

  const setField = (field: keyof SiteFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    const location = buildLocationRecord(form);

    const record: Record<string, unknown> = {
      $type: "app.certified.location",
      name: form.name.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(location ? { location } : {}),
      ...(location ? { locationType: form.locationType === "point" ? "point" : "polygon" } : {}),
      createdAt: new Date().toISOString(),
    };

    setIsPending(true);
    setError(null);
    try {
      let result: { uri: string; cid: string };
      if (isAdding) {
        result = await createRecord("app.certified.location", record);
      } else {
        result = await putRecord("app.certified.location", editingRkey!, record);
      }

      const rkey = result.uri.split("/").pop() ?? editingRkey ?? "unknown";
      const saved: ManagedLocation = {
        metadata: {
          did: "", // will be refreshed on next fetch
          uri: result.uri,
          rkey,
          cid: result.cid,
          createdAt: new Date().toISOString(),
        },
        record: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          locationType: form.locationType === "point" ? "point" : "polygon",
          location:
            form.locationType === "point" && form.lat && form.lon
              ? { kind: "point", lat: parseFloat(form.lat), lon: parseFloat(form.lon) }
              : form.locationType === "uri" && form.uri
                ? { kind: "uri", uri: form.uri.trim() }
                : null,
        },
      };
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save site.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="rounded-2xl border border-border bg-card p-5 space-y-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {isAdding ? "Add site" : "Edit site"}
        </h2>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <XIcon className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="site-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="site-name"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g. Amazon Reserve Plot A"
            maxLength={128}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="site-description">Description</Label>
          <Textarea
            id="site-description"
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Describe this site…"
            rows={2}
            className="resize-none"
            maxLength={512}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Location type</Label>
          <div className="flex gap-2">
            {(["point", "uri"] as LocationType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setField("locationType", type)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  form.locationType === type
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40",
                )}
              >
                {type === "point" ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <MapPinIcon className="h-3.5 w-3.5" /> Coordinates
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <GlobeIcon className="h-3.5 w-3.5" /> Shapefile URL
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {form.locationType === "point" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-lat">Latitude</Label>
              <Input
                id="site-lat"
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => setField("lat", e.target.value)}
                placeholder="-3.4653"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-lon">Longitude</Label>
              <Input
                id="site-lon"
                type="number"
                step="any"
                value={form.lon}
                onChange={(e) => setField("lon", e.target.value)}
                placeholder="-62.2159"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="site-uri">GeoJSON / Shapefile URL</Label>
            <Input
              id="site-uri"
              value={form.uri}
              onChange={(e) => setField("uri", e.target.value)}
              placeholder="https://..."
              type="url"
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={isPending}>
          {isPending && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
          {isAdding ? "Add site" : "Save changes"}
        </Button>
      </div>
    </motion.div>
  );
}

// ── SitesClient ───────────────────────────────────────────────────────────────

const PREVIEW_APP_BASE_URL = "https://polygons-gainforest.vercel.app";

function generateSitePreviewUrl(did: string, rkey: string): string {
  const atUri = `at://${did}/app.certified.location/${rkey}`;
  return `${PREVIEW_APP_BASE_URL}/view?certifiedLocationRecordUri=${encodeURIComponent(atUri)}`;
}

export function SitesClient({ did }: { did: string }) {
  const [sites, setSites] = useState<ManagedLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<
    | { open: false }
    | { open: true; form: SiteFormState; editingRkey: string | null }
  >({ open: false });
  const [deletingRkey, setDeletingRkey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewingRkey, setPreviewingRkey] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const loadSites = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/manage/sites");
      const data = (await res.json()) as ManagedLocation[] | { error: string };
      if (!res.ok || "error" in data) {
        setFetchError(("error" in data ? data.error : null) ?? "Failed to load sites.");
      } else {
        setSites(data);
      }
    } catch {
      setFetchError("Could not reach the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadSites(); }, [loadSites]);

  const handlePreviewSite = (rkey: string) => {
    const previewUrl = generateSitePreviewUrl(did, rkey);
    if (previewingRkey === rkey) {
      // Already loaded — send postMessage to navigate
      if (iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage(
          { type: "load-uri", uri: `at://${did}/app.certified.location/${rkey}` },
          PREVIEW_APP_BASE_URL,
        );
      }
    } else {
      setPreviewingRkey(rkey);
      setIframeUrl(previewUrl);
    }
  };

  const allSiteRkeys = sites.map((s) => s.metadata.rkey).filter(Boolean) as string[];
  const currentSiteIndex = previewingRkey ? allSiteRkeys.indexOf(previewingRkey) : -1;

  const handleOpenAdd = () =>
    setEditorState({ open: true, form: EMPTY_FORM, editingRkey: null });

  const handleOpenEdit = (site: ManagedLocation) =>
    setEditorState({ open: true, form: formFromLocation(site), editingRkey: site.metadata.rkey });

  const handleEditorClose = () => setEditorState({ open: false });

  const handleSaved = (saved: ManagedLocation) => {
    setSites((prev) => {
      const idx = prev.findIndex((s) => s.metadata.rkey === saved.metadata.rkey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...saved, metadata: { ...saved.metadata, did } };
        return next;
      }
      return [{ ...saved, metadata: { ...saved.metadata, did } }, ...prev];
    });
    setEditorState({ open: false });
    // Refresh to get server-confirmed data
    void loadSites();
  };

  const handleDelete = async (rkey: string) => {
    setDeletingRkey(rkey);
    setDeleteError(null);
    try {
      await deleteRecord("app.certified.location", rkey);
      setSites((prev) => prev.filter((s) => s.metadata.rkey !== rkey));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete site.");
    } finally {
      setDeletingRkey(null);
    }
  };

  if (isLoading) {
    return (
      <Container className="pt-4 pb-8">
        <div className="flex items-center justify-center h-40">
          <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Container>
    );
  }

  return (
    <Container className="pt-4 pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Sites</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your certified field locations.
          </p>
        </div>
        <Button size="sm" className="rounded-full" onClick={handleOpenAdd}>
          <CirclePlusIcon />
          Add site
        </Button>
      </div>

      {/* Editor */}
      <AnimatePresence>
        {editorState.open && (
          <SiteEditor
            key="editor"
            initialForm={editorState.form}
            editingRkey={editorState.editingRkey}
            onClose={handleEditorClose}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>

      {/* Map preview iframe */}
      {iframeUrl && previewingRkey && (
        <div className="w-full h-80 rounded-2xl overflow-hidden relative border border-border">
          <iframe
            ref={iframeRef}
            className="h-full w-full"
            src={iframeUrl}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between p-4">
            <Button
              size="icon"
              variant="outline"
              className="pointer-events-auto"
              disabled={currentSiteIndex <= 0}
              onClick={() => {
                const prevRkey = allSiteRkeys[currentSiteIndex - 1];
                if (prevRkey) handlePreviewSite(prevRkey);
              }}
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
                if (nextRkey) handlePreviewSite(nextRkey);
              }}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Errors */}
      {fetchError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center justify-between gap-4">
          <span>{fetchError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadSites()}>
            Retry
          </Button>
        </div>
      )}
      {deleteError && (
        <p className="text-sm text-destructive">{deleteError}</p>
      )}

      {/* Content */}
      {sites.length === 0 && !fetchError ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex flex-col items-center justify-center h-48 gap-4 rounded-xl border border-dashed border-border text-center"
        >
          <p className="text-xl font-medium text-muted-foreground">No sites yet</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Add your first certified field location to get started.
          </p>
          <Button variant="outline" size="sm" onClick={handleOpenAdd}>
            <CirclePlusIcon />
            Add a site
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map((site) => (
            <div key={site.metadata.uri ?? site.metadata.rkey} className="relative">
              {deletingRkey === site.metadata.rkey && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm">
                  <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <SiteCard
                site={site}
                onEdit={handleOpenEdit}
                onDelete={(rkey) => void handleDelete(rkey)}
                onPreview={handlePreviewSite}
                isPreviewing={previewingRkey === site.metadata.rkey}
              />
            </div>
          ))}
        </div>
      )}
    </Container>
  );
}
