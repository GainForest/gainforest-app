"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import {
  CalendarIcon,
  CloudUploadIcon,
  CrosshairIcon,
  DatabaseIcon,
  LayoutGridIcon,
  ListIcon,
  Loader2Icon,
  MoreVerticalIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  TreesIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import Container from "@/components/ui/container";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteRecord, updateOccurrence } from "../../_lib/mutations";
import type { OccurrenceRecord, UploadTreeDatasetRecord } from "@/app/_lib/indexer";
import { TreesManageSkeleton } from "./TreesManageSkeleton";
import { cn } from "@/lib/utils";

// ── TreeCard ──────────────────────────────────────────────────────────────────

function TreeCard({
  tree,
  onEdit,
  onDeleted,
}: {
  tree: OccurrenceRecord;
  onEdit: (tree: OccurrenceRecord) => void;
  onDeleted: (rkey: string) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteRecord("app.gainforest.dwc.occurrence", tree.rkey);
      onDeleted(tree.rkey);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete tree.");
      setIsDeleting(false);
      setIsConfirming(false);
    }
  };

  const dateLabel = tree.eventDate
    ? (() => {
        try {
          return new Date(tree.eventDate).toLocaleDateString("en-US", { dateStyle: "medium" });
        } catch {
          return tree.eventDate;
        }
      })()
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex items-start justify-between rounded-2xl px-4 py-3 transition-colors duration-300 hover:bg-surface-sunken"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm truncate">
          {tree.scientificName ?? <span className="italic text-muted-foreground">Unknown species</span>}
        </p>
        {tree.vernacularName && (
          <p className="text-xs text-muted-foreground truncate">{tree.vernacularName}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
          {dateLabel && (
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="h-3 w-3 shrink-0" />
              {dateLabel}
            </span>
          )}
          {tree.lat != null && tree.lon != null && (
            <span className="inline-flex items-center gap-1">
              <CrosshairIcon className="h-3 w-3 shrink-0" />
              {tree.lat.toFixed(3)}°, {tree.lon.toFixed(3)}°
            </span>
          )}
          {tree.locality && (
            <span className="truncate max-w-[160px]">{tree.locality}</span>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 ml-2 shrink-0" disabled={isDeleting}>
            {isDeleting ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreVerticalIcon className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(tree)} disabled={isDeleting}>
            <PencilIcon className="h-3.5 w-3.5 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setIsConfirming(true)}
            disabled={isDeleting}
          >
            <Trash2Icon className="h-3.5 w-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isConfirming && (
        <div className="absolute left-0 right-0 bottom-0 mx-3 mb-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg z-10">
          <p className="text-sm text-destructive font-medium mb-1">Delete this tree?</p>
          <p className="text-xs text-muted-foreground mb-3">This cannot be undone.</p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={isDeleting}>
              {isDeleting && <Loader2Icon className="animate-spin h-3 w-3 mr-1" />}
              Delete
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsConfirming(false)} disabled={isDeleting}>
              Cancel
            </Button>
          </div>
          {deleteError && <p className="text-xs text-destructive mt-2">{deleteError}</p>}
        </div>
      )}
    </motion.div>
  );
}

// ── TreeEditor ────────────────────────────────────────────────────────────────

function TreeEditor({
  tree,
  onClose,
  onSaved,
}: {
  tree: OccurrenceRecord;
  onClose: () => void;
  onSaved: (updated: OccurrenceRecord) => void;
}) {
  const [scientificName, setScientificName] = useState(tree.scientificName ?? "");
  const [vernacularName, setVernacularName] = useState(tree.vernacularName ?? "");
  const [eventDate, setEventDate] = useState(tree.eventDate ?? "");
  const [lat, setLat] = useState(tree.lat != null ? String(tree.lat) : "");
  const [lon, setLon] = useState(tree.lon != null ? String(tree.lon) : "");
  const [locality, setLocality] = useState(tree.locality ?? "");
  const [remarks, setRemarks] = useState(tree.remarks ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!scientificName.trim()) { setError("Scientific name is required."); return; }
    setIsPending(true);
    setError(null);
    try {
      const trimmedScientificName = scientificName.trim();
      const trimmedEventDate = eventDate.trim();
      const trimmedVernacularName = vernacularName.trim();
      const trimmedLocality = locality.trim();
      const trimmedRemarks = remarks.trim();
      const trimmedLat = lat.trim();
      const trimmedLon = lon.trim();
      const data: Parameters<typeof updateOccurrence>[0]["data"] = {
        scientificName: trimmedScientificName,
      };
      const unset: string[] = [];

      if (trimmedEventDate) data.eventDate = trimmedEventDate;
      if (trimmedVernacularName) data.vernacularName = trimmedVernacularName;
      else unset.push("vernacularName");
      if (trimmedLocality) data.locality = trimmedLocality;
      else unset.push("locality");
      if (trimmedRemarks) data.occurrenceRemarks = trimmedRemarks;
      else unset.push("occurrenceRemarks");

      if ((trimmedLat && !trimmedLon) || (!trimmedLat && trimmedLon)) {
        setError("Enter both latitude and longitude, or leave both unchanged.");
        setIsPending(false);
        return;
      }
      if (trimmedLat && trimmedLon) {
        const nextLat = Number(trimmedLat);
        const nextLon = Number(trimmedLon);
        if (!Number.isFinite(nextLat) || nextLat < -90 || nextLat > 90 || !Number.isFinite(nextLon) || nextLon < -180 || nextLon > 180) {
          setError("Enter a valid latitude and longitude.");
          setIsPending(false);
          return;
        }
        data.decimalLatitude = String(nextLat);
        data.decimalLongitude = String(nextLon);
      }

      await updateOccurrence({ rkey: tree.rkey, data, unset });

      onSaved({
        ...tree,
        scientificName: trimmedScientificName || null,
        vernacularName: trimmedVernacularName || null,
        eventDate: trimmedEventDate || tree.eventDate,
        lat: trimmedLat && trimmedLon ? Number(trimmedLat) : tree.lat,
        lon: trimmedLat && trimmedLon ? Number(trimmedLon) : tree.lon,
        locality: trimmedLocality || null,
        remarks: trimmedRemarks || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tree could not be saved.");
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
        <h2 className="text-lg font-semibold">Edit tree</h2>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <XIcon className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tree-sci">
            Scientific name <span className="text-destructive">*</span>
          </Label>
          <Input id="tree-sci" value={scientificName} onChange={(e) => { setScientificName(e.target.value); setError(null); }} placeholder="e.g. Cedrela odorata" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tree-vern">Common name</Label>
          <Input id="tree-vern" value={vernacularName} onChange={(e) => setVernacularName(e.target.value)} placeholder="e.g. Spanish cedar" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tree-date">Event date</Label>
          <Input id="tree-date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} placeholder="YYYY-MM-DD" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tree-locality">Locality</Label>
          <Input id="tree-locality" value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="e.g. Amazon Reserve" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tree-lat">Latitude</Label>
          <Input id="tree-lat" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-3.4653" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tree-lon">Longitude</Label>
          <Input id="tree-lon" type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-62.2159" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tree-remarks">Remarks</Label>
          <Textarea
            id="tree-remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Field notes…"
            rows={2}
            className="resize-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button onClick={() => void handleSave()} disabled={isPending}>
          {isPending && <Loader2Icon className="animate-spin h-3.5 w-3.5" />}
          Save changes
        </Button>
      </div>
    </motion.div>
  );
}

// ── TreesClient ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
type DatasetViewMode = "cards" | "list";

const DATASET_VIEW_MODES: DatasetViewMode[] = ["cards", "list"];
const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
const SEARCH_QUERY_STATE_OPTIONS = { ...QUERY_STATE_OPTIONS, throttleMs: 200 } as const;

function DatasetViewToggle({ view, setView }: { view: DatasetViewMode; setView: (view: DatasetViewMode) => void }) {
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
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function TreesClient({ did, onUpload }: { did: string; onUpload?: () => void }) {
  const [trees, setTrees] = useState<OccurrenceRecord[]>([]);
  const [datasets, setDatasets] = useState<UploadTreeDatasetRecord[]>([]);
  const [selectedDatasetUri, setSelectedDatasetUri] = useQueryState(
    "dataset",
    parseAsString.withOptions(QUERY_STATE_OPTIONS),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions(SEARCH_QUERY_STATE_OPTIONS),
  );
  const [page, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions(QUERY_STATE_OPTIONS),
  );
  const [editingTree, setEditingTree] = useState<OccurrenceRecord | null>(null);
  const [datasetView, setDatasetView] = useQueryState(
    "treeView",
    parseAsStringEnum<DatasetViewMode>(DATASET_VIEW_MODES).withDefault("cards").withOptions(QUERY_STATE_OPTIONS),
  );

  const loadTrees = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [treeRes, datasetRes] = await Promise.all([
        fetch("/api/manage/trees"),
        fetch("/api/manage/trees/datasets"),
      ]);
      const data = (await treeRes.json()) as OccurrenceRecord[] | { error: string };
      const datasetData = (await datasetRes.json()) as UploadTreeDatasetRecord[] | { error: string };
      if (!treeRes.ok || "error" in data) {
        setFetchError(("error" in data ? data.error : null) ?? "Failed to load trees.");
      } else {
        setTrees(data);
      }
      if (datasetRes.ok && !("error" in datasetData)) {
        setDatasets(datasetData);
      }
    } catch {
      setFetchError("Could not reach the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadTrees(); }, [loadTrees]);

  const treesInDataset = selectedDatasetUri
    ? trees.filter((tree) => tree.datasetRef === selectedDatasetUri)
    : trees;

  const filtered = treesInDataset.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (t.scientificName ?? "").toLowerCase().includes(q) ||
      (t.vernacularName ?? "").toLowerCase().includes(q) ||
      (t.locality ?? "").toLowerCase().includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSearchChange = (val: string) => {
    void setSearch(val);
    void setPage(1);
  };

  const handleDatasetChange = (uri: string | null) => {
    void setSelectedDatasetUri(uri);
    void setPage(1);
    void setSearch("");
  };

  const handleDeleted = (rkey: string) => {
    setTrees((prev) => prev.filter((t) => t.rkey !== rkey));
  };

  const handleSaved = (updated: OccurrenceRecord) => {
    setTrees((prev) => prev.map((t) => t.rkey === updated.rkey ? updated : t));
    setEditingTree(null);
  };

  if (isLoading) {
    return <TreesManageSkeleton />;
  }

  return (
    <Container className="pt-4 pb-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-garamond">Trees</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage tree groups and saved tree information.
          </p>
        </div>
        {onUpload && (
          <Button variant="outline" size="sm" onClick={onUpload}>
            <CloudUploadIcon className="h-3.5 w-3.5" />
            Upload tree data
          </Button>
        )}
      </div>

      {datasets.length > 0 && !editingTree && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold font-garamond">Tree groups</h2>
              <p className="text-sm text-muted-foreground">Browse trees by group.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DatasetViewToggle view={datasetView} setView={(nextView) => void setDatasetView(nextView)} />
              {selectedDatasetUri && (
                <Button variant="ghost" size="sm" onClick={() => handleDatasetChange(null)}>
                  Back to groups
                </Button>
              )}
            </div>
          </div>
          <div className={datasetView === "list" ? "[&>*]:relative [&>*:not(:last-child)]:after:absolute [&>*:not(:last-child)]:after:inset-x-4 [&>*:not(:last-child)]:after:bottom-0 [&>*:not(:last-child)]:after:h-px [&>*:not(:last-child)]:after:bg-border" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
            {datasets.map((dataset) => {
              const count = trees.filter((tree) => tree.datasetRef === dataset.uri).length;
              const selected = selectedDatasetUri === dataset.uri;
              return (
                <button
                  key={dataset.uri}
                  type="button"
                  onClick={() => handleDatasetChange(selected ? null : dataset.uri)}
                  className={cn(
                    "group text-left outline-none transition-colors duration-300 hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-primary/60",
                    datasetView === "list" ? "w-full rounded-2xl px-1 py-3 sm:px-2" : "rounded-2xl border p-4 hover:border-primary/40",
                    selected && datasetView === "list" ? "bg-primary/5" : null,
                    selected && datasetView === "cards" ? "border-primary bg-primary/5" : null,
                    !selected && datasetView === "cards" ? "border-border bg-background" : null,
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="rounded-full bg-primary/10 p-2 text-primary"><DatabaseIcon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{dataset.name}</span>
                      <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{dataset.description ?? "No description"}</span>
                      <span className="mt-3 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{dataset.recordCount ?? count} trees</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Editor */}
      <AnimatePresence>
        {editingTree && (
          <TreeEditor
            key={editingTree.rkey}
            tree={editingTree}
            onClose={() => setEditingTree(null)}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>

      {/* Error */}
      {fetchError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center justify-between gap-4">
          <span>{fetchError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadTrees()}>Retry</Button>
        </div>
      )}

      {/* Toolbar */}
      {!fetchError && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 sm:max-w-sm">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by species or locality…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <p className="text-sm text-muted-foreground shrink-0">
            {filtered.length} of {trees.length} record{trees.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* List */}
      {!fetchError && (
        <>
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex flex-col items-center justify-center h-48 gap-4 rounded-xl border border-dashed border-border text-center"
            >
              {trees.length === 0 ? (
                <>
                  <p className="text-xl font-semibold text-muted-foreground font-garamond">No tree records yet</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Upload a CSV of tree occurrences to get started.
                  </p>
                  {onUpload && (
                    <Button variant="outline" size="sm" onClick={onUpload}>
                      <TreesIcon />
                      Upload tree data
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">No records match your search.</p>
              )}
            </motion.div>
          ) : (
            <div className="rounded-xl border border-border p-1">
              {paginated.map((tree) => (
                <div key={`${tree.did}-${tree.rkey}`} className="relative after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                  <TreeCard
                    tree={tree}
                    onEdit={setEditingTree}
                    onDeleted={handleDeleted}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => void setPage(Math.max(1, currentPage - 1))}
              >
                Previous
              </Button>
              <span>Page {currentPage} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => void setPage(Math.min(totalPages, currentPage + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
