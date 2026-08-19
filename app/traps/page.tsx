"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircleIcon,
  BarChart3Icon,
  CrosshairIcon,
  EyeIcon,
  FilterIcon,
  ListIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  TargetIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TrapRecordCard } from "./_components/TrapRecordCard";
import { TrapRecordForm } from "./_components/TrapRecordForm";
import { TrapsAnalytics } from "./_components/TrapsAnalytics";
import {
  mergeAndSortTrapRecords,
  type TrapKill,
  type TrapKillRecord,
  type TrapObservation,
  type TrapObservationRecord,
  type TrapRecord,
} from "./_lib/trap-records";

type ViewMode = "all" | "kills" | "observations";
type TabId = "records" | "analytics";

export default function TrapsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kills, setKills] = useState<TrapKill[]>([]);
  const [observations, setObservations] = useState<TrapObservation[]>([]);
  const [sources, setSources] = useState(0);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("records");

  // Filter state
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<"kill" | "observation">("kill");
  const [editingRecord, setEditingRecord] = useState<TrapRecord | null>(null);

  // Delete confirmation state
  const [deleteRecord, setDeleteRecord] = useState<TrapRecord | null>(null);

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/traps/records");
      if (!response.ok) {
        throw new Error("Failed to load records");
      }
      const data = await response.json();
      setKills(data.kills ?? []);
      setObservations(data.observations ?? []);
      setSources(data.sources ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load records");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleAddRecord = (type: "kill" | "observation") => {
    setFormType(type);
    setEditingRecord(null);
    setFormOpen(true);
  };

  const handleEditRecord = (record: TrapRecord) => {
    setFormType(record.type);
    setEditingRecord(record);
    setFormOpen(true);
  };

  const handleDeleteRecord = (record: TrapRecord) => {
    setDeleteRecord(record);
  };

  const confirmDelete = async () => {
    if (!deleteRecord) return;

    try {
      const response = await fetch("/api/traps/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uri: deleteRecord.data.uri,
          collection: deleteRecord.type === "kill" ? "nz.trap.field.kill" : "nz.trap.field.observation",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete record");
      }

      // Remove from local state
      if (deleteRecord.type === "kill") {
        setKills((prev) => prev.filter((k) => k.uri !== deleteRecord.data.uri));
      } else {
        setObservations((prev) => prev.filter((o) => o.uri !== deleteRecord.data.uri));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete record");
    } finally {
      setDeleteRecord(null);
    }
  };

  const handleFormSubmit = async (data: TrapKillRecord | TrapObservationRecord) => {
    const collection = formType === "kill" ? "nz.trap.field.kill" : "nz.trap.field.observation";
    
    const response = await fetch("/api/traps/records", {
      method: editingRecord ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection,
        record: data,
        ...(editingRecord ? { rkey: editingRecord.data.rkey } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message ?? "Failed to save record");
    }

    // Refresh records after save
    await loadRecords();
  };

  // Filter and merge records for display
  const filteredRecords = mergeAndSortTrapRecords(
    viewMode === "observations" ? [] : kills,
    viewMode === "kills" ? [] : observations
  ).filter((record) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const r = record.type === "kill" ? record.data.record : record.data.record;
    return (
      r.species.toLowerCase().includes(query) ||
      r.areaName?.toLowerCase().includes(query) ||
      r.project?.toLowerCase().includes(query) ||
      r.note?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TargetIcon className="size-6 text-primary" />
            Trap.NZ Field Records
          </h1>
          <p className="mt-1 text-muted-foreground">
            View and manage pest control kills and field observations.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadRecords()} disabled={isLoading}>
            <RefreshCwIcon className={cn("mr-1.5 size-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAddRecord("observation")}>
            <EyeIcon className="mr-1.5 size-4" />
            Add Observation
          </Button>
          <Button size="sm" onClick={() => handleAddRecord("kill")}>
            <CrosshairIcon className="mr-1.5 size-4" />
            Add Kill
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircleIcon className="size-4" />
            {error}
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1.5 rounded-full border border-border bg-muted/40 p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("records")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            activeTab === "records"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
          )}
        >
          <ListIcon className="size-4" />
          Records
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            activeTab === "analytics"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
          )}
        >
          <BarChart3Icon className="size-4" />
          Analytics
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "records" ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by species, area, project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <SelectTrigger className="w-[180px]">
                <FilterIcon className="mr-2 size-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All records</SelectItem>
                <SelectItem value="kills">Kills only</SelectItem>
                <SelectItem value="observations">Observations only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading state */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2Icon className="size-8 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Loading records...</p>
            </div>
          ) : (
            <>
              {/* Records count */}
              <p className="text-sm text-muted-foreground">
                Showing {filteredRecords.length} of {kills.length + observations.length} records
                {searchQuery && ` matching "${searchQuery}"`}
              </p>

              {/* Records list */}
              {filteredRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-12 text-center">
                  <TargetIcon className="size-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">No records yet</h3>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    {sources === 0
                      ? "No trap sources are loaded yet. Sign in to see your own records."
                      : `No trap records were found across ${sources} loaded source${sources === 1 ? "" : "s"}. Start by adding a kill or observation record.`}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleAddRecord("observation")}>
                      <EyeIcon className="mr-1.5 size-4" />
                      Add Observation
                    </Button>
                    <Button size="sm" onClick={() => handleAddRecord("kill")}>
                      <CrosshairIcon className="mr-1.5 size-4" />
                      Add Kill
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredRecords.map((record) => (
                    <TrapRecordCard
                      key={record.data.uri}
                      record={record}
                      onEdit={handleEditRecord}
                      onDelete={handleDeleteRecord}
                      canManage={true}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <TrapsAnalytics kills={kills} observations={observations} />
      )}

      {/* Add/Edit form dialog */}
      <TrapRecordForm
        type={formType}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleFormSubmit}
        initialData={
          editingRecord
            ? editingRecord.type === "kill"
              ? editingRecord.data.record
              : editingRecord.data.record
            : undefined
        }
        isEditing={!!editingRecord}
      />

      {/* Delete confirmation dialog */}
      {deleteRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Delete this record?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete the {deleteRecord.type === "kill" ? "kill" : "observation"} record for{" "}
              <strong>
                {deleteRecord.type === "kill" ? deleteRecord.data.record.species : deleteRecord.data.record.species}
              </strong>
              . This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteRecord(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
