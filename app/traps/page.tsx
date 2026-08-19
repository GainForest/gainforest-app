"use client";

import { useCallback, useState } from "react";
import {
  AlertCircleIcon,
  BarChart3Icon,
  CrosshairIcon,
  EyeIcon,
  FilterIcon,
  ListIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  TargetIcon,
  XIcon,
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
  fetchAllTrapRecords,
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kills, setKills] = useState<TrapKill[]>([]);
  const [observations, setObservations] = useState<TrapObservation[]>([]);
  const [didInput, setDidInput] = useState("");
  const [loadedDids, setLoadedDids] = useState<string[]>([]);

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

  const loadRecordsForDid = useCallback(
    async (did: string) => {
      if (!did.startsWith("did:")) {
        setError("Please enter a valid DID (starts with did:)");
        return;
      }

      if (loadedDids.includes(did)) {
        setError("Records from this DID are already loaded");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { kills: newKills, observations: newObs } = await fetchAllTrapRecords(did);

        if (newKills.length === 0 && newObs.length === 0) {
          setError(`No trap records found for ${did}`);
        } else {
          setKills((prev) => [...prev, ...newKills]);
          setObservations((prev) => [...prev, ...newObs]);
          setLoadedDids((prev) => [...prev, did]);
          setDidInput("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load records");
      } finally {
        setIsLoading(false);
      }
    },
    [loadedDids]
  );

  const handleRefresh = useCallback(async () => {
    if (loadedDids.length === 0) return;

    setIsLoading(true);
    setError(null);
    setKills([]);
    setObservations([]);

    try {
      for (const did of loadedDids) {
        const { kills: newKills, observations: newObs } = await fetchAllTrapRecords(did);
        setKills((prev) => [...prev, ...newKills]);
        setObservations((prev) => [...prev, ...newObs]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh records");
    } finally {
      setIsLoading(false);
    }
  }, [loadedDids]);

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

    // In a real implementation, this would call an API to delete the record
    // For now, just remove it from local state
    if (deleteRecord.type === "kill") {
      setKills((prev) => prev.filter((k) => k.uri !== deleteRecord.data.uri));
    } else {
      setObservations((prev) => prev.filter((o) => o.uri !== deleteRecord.data.uri));
    }
    setDeleteRecord(null);
  };

  const handleFormSubmit = async (data: TrapKillRecord | TrapObservationRecord) => {
    // In a real implementation, this would call the PDS to create/update the record
    // For now, we'll just show a success message
    console.log("Form submitted:", { type: formType, data, editing: !!editingRecord });

    // After successful submission, refresh records
    if (loadedDids.length > 0) {
      await handleRefresh();
    }
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
            View and analyze kill and observation records from Trap.NZ users.
          </p>
        </div>

        <div className="flex gap-2">
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

      {/* Load DID input */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="did-input" className="text-sm font-medium">
              Load records from a DID
            </label>
            <div className="flex gap-2">
              <Input
                id="did-input"
                placeholder="did:plc:..."
                value={didInput}
                onChange={(e) => setDidInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadRecordsForDid(didInput)}
              />
              <Button onClick={() => loadRecordsForDid(didInput)} disabled={isLoading || !didInput}>
                {isLoading ? <Loader2Icon className="size-4 animate-spin" /> : <SearchIcon className="size-4" />}
                <span className="ml-1.5 hidden sm:inline">Load</span>
              </Button>
            </div>
          </div>

          {loadedDids.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCwIcon className={`mr-1.5 size-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>

        {loadedDids.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">Loaded:</span>
            {loadedDids.map((did) => (
              <code key={did} className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                {did.slice(0, 20)}...
              </code>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircleIcon className="size-4" />
            {error}
          </p>
        )}
      </div>

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
              <p className="mt-1 text-sm text-muted-foreground">
                Enter a DID above to load trap records from a user&apos;s PDS.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRecords.map((record) => (
                <TrapRecordCard
                  key={record.type === "kill" ? record.data.uri : record.data.uri}
                  record={record}
                  onEdit={handleEditRecord}
                  onDelete={handleDeleteRecord}
                  canManage={true}
                />
              ))}
            </div>
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
