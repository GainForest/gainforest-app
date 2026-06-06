"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeftIcon,
  CirclePlusIcon,
  LayoutGridIcon,
  ListIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Container from "@/components/ui/container";
import { AudioCard } from "./AudioCard";
import { AudioEditor } from "./AudioEditor";
import type { ManagedAudio } from "@/app/_lib/indexer";

type ViewMode = "grid" | "list" | "add" | "edit";

export function AudioClient({ did }: { did: string }) {
  const [recordings, setRecordings] = useState<ManagedAudio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [editRkey, setEditRkey] = useState<string | null>(null);

  const loadAudio = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/manage/audio");
      const data = (await res.json()) as ManagedAudio[] | { error: string };
      if (!res.ok || "error" in data) {
        setFetchError(("error" in data ? data.error : null) ?? "Failed to load audio.");
      } else {
        setRecordings(data);
      }
    } catch {
      setFetchError("Could not reach the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadAudio(); }, [loadAudio]);

  const filtered = recordings.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.record.name ?? "").toLowerCase().includes(q) ||
      (r.record.description ?? "").toLowerCase().includes(q);
  });

  const isEditorMode = viewMode === "add" || viewMode === "edit";
  const editTarget = viewMode === "edit"
    ? (recordings.find((r) => r.metadata.rkey === editRkey) ?? null)
    : null;

  const handleEdit = (rkey: string) => {
    setEditRkey(rkey);
    setViewMode("edit");
  };

  const handleBack = () => {
    setViewMode("grid");
    setEditRkey(null);
  };

  const handleDeleted = (rkey: string) => {
    setRecordings((prev) => prev.filter((r) => r.metadata.rkey !== rkey));
  };

  const handleSaved = (saved: ManagedAudio) => {
    setRecordings((prev) => {
      const idx = prev.findIndex((r) => r.metadata.rkey === saved.metadata.rkey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...saved, metadata: { ...saved.metadata, did } };
        return next;
      }
      return [{ ...saved, metadata: { ...saved.metadata, did } }, ...prev];
    });
    void loadAudio();
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
      {/* Header — hidden in editor */}
      {!isEditorMode && (
        <div>
          <h1 className="text-2xl font-medium">Audio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage ecoacoustic and field audio evidence.
          </p>
        </div>
      )}

      {/* Editor */}
      {isEditorMode && (
        <>
          <Button variant="ghost" onClick={handleBack} className="-ml-2">
            <ChevronLeftIcon />
            Back
          </Button>
          <AudioEditor
            mode={viewMode as "add" | "edit"}
            initialData={editTarget}
            onClose={handleBack}
            onSaved={handleSaved}
          />
        </>
      )}

      {/* Toolbar — hidden in editor */}
      {!isEditorMode && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recordings…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center border rounded-lg p-0.5 gap-0.5">
            <Button
              size="icon"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              onClick={() => setViewMode("grid")}
              className="h-8 w-8"
            >
              <LayoutGridIcon className="h-4 w-4" />
            </Button>
            <div className="h-4 w-0.5 bg-border" />
            <Button
              size="icon"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              onClick={() => setViewMode("list")}
              className="h-8 w-8"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>

          <Button
            className="rounded-full"
            size="sm"
            onClick={() => setViewMode("add")}
          >
            <CirclePlusIcon />
            Add recording
          </Button>
        </div>
      )}

      {/* Error */}
      {fetchError && !isEditorMode && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center justify-between gap-4">
          <span>{fetchError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadAudio()}>Retry</Button>
        </div>
      )}

      {/* Content — hidden in editor */}
      {!isEditorMode && (
        <section>
          <AnimatePresence mode="wait">
            {filtered.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                className="flex flex-col items-center justify-center h-48 gap-4 rounded-xl border border-dashed border-border text-center"
              >
                {recordings.length === 0 ? (
                  <>
                    <p className="text-xl font-medium text-muted-foreground">No recordings yet</p>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Upload field audio to evidence your biodiversity monitoring work.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setViewMode("add")}>
                      <CirclePlusIcon />
                      Add recording
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No recordings match your search.</p>
                )}
              </motion.div>
            ) : viewMode === "grid" ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {filtered.map((r) => (
                  <AudioCard
                    key={r.metadata.uri ?? r.metadata.rkey}
                    audio={r}
                    onEdit={handleEdit}
                    onDeleted={handleDeleted}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="divide-y divide-border rounded-xl border border-border overflow-hidden"
              >
                {filtered.map((r) => {
                  const dateLabel = r.record.recordedAt
                    ? new Date(r.record.recordedAt).toLocaleDateString("en-US", { dateStyle: "medium" })
                    : null;
                  return (
                    <div
                      key={r.metadata.uri ?? r.metadata.rkey}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {r.record.name ?? "Untitled"}
                        </p>
                        {dateLabel && (
                          <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(r.metadata.rkey)}
                      >
                        Edit
                      </Button>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}
    </Container>
  );
}
