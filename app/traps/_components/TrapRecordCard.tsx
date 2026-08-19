"use client";

import { formatDistanceToNow } from "date-fns";
import {
  CalendarIcon,
  CrosshairIcon,
  EyeIcon,
  MapPinIcon,
  MessageSquareIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TrapRecord, TrapKill, TrapObservation } from "../_lib/trap-records";

type Props = {
  record: TrapRecord;
  onEdit?: (record: TrapRecord) => void;
  onDelete?: (record: TrapRecord) => void;
  canManage?: boolean;
  ownerName?: string;
};

function formatDate(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "destructive" | "secondary" | "outline" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
      variant === "destructive" && "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
      variant === "secondary" && "bg-muted text-muted-foreground",
      variant === "outline" && "border border-border text-muted-foreground",
      variant === "default" && "bg-primary/10 text-primary",
    )}>
      {children}
    </span>
  );
}

function KillCard({
  kill,
  onEdit,
  onDelete,
  canManage,
  ownerName,
}: {
  kill: TrapKill;
  onEdit?: () => void;
  onDelete?: () => void;
  canManage?: boolean;
  ownerName?: string;
}) {
  const { record } = kill;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-red-200 bg-card p-4 dark:border-red-900/50">
      <div className="absolute left-0 top-0 h-full w-1 bg-red-500" />
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CrosshairIcon className="size-4 text-red-500" />
          <Badge variant="destructive">Kill</Badge>
          <span className="font-semibold text-foreground">{record.species}</span>
          {record.count > 1 && <Badge variant="secondary">×{record.count}</Badge>}
        </div>
        {canManage && (
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onEdit} aria-label="Edit">
              <PencilIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0 text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label="Delete"
            >
              <TrashIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarIcon className="size-3.5" />
            {formatDate(record.occurredAt)}
          </span>
          <span>via {record.controlMeans}</span>
          {record.sex && record.sex !== "Unknown" && <span>{record.sex}</span>}
          {record.maturity && record.maturity !== "Unknown" && <span>{record.maturity}</span>}
        </div>

        {(record.areaName || record.location) && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPinIcon className="size-3.5" />
            {record.areaName || `${record.location?.latitude}, ${record.location?.longitude}`}
          </div>
        )}

        {record.note && (
          <div className="flex items-start gap-1 text-muted-foreground">
            <MessageSquareIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{record.note}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {ownerName && <span className="text-xs text-muted-foreground">by {ownerName}</span>}
          {record.visibility && <Badge variant="outline">{record.visibility}</Badge>}
        </div>
      </div>
    </div>
  );
}

function ObservationCard({
  observation,
  onEdit,
  onDelete,
  canManage,
  ownerName,
}: {
  observation: TrapObservation;
  onEdit?: () => void;
  onDelete?: () => void;
  canManage?: boolean;
  ownerName?: string;
}) {
  const { record } = observation;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-blue-200 bg-card p-4 dark:border-blue-900/50">
      <div className="absolute left-0 top-0 h-full w-1 bg-blue-500" />
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <EyeIcon className="size-4 text-blue-500" />
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            {record.observationType}
          </span>
          <span className="font-semibold text-foreground">{record.species}</span>
          {record.count != null && record.count > 1 && <Badge variant="secondary">×{record.count}</Badge>}
        </div>
        {canManage && (
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onEdit} aria-label="Edit">
              <PencilIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0 text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label="Delete"
            >
              <TrashIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarIcon className="size-3.5" />
            {formatDate(record.occurredAt)}
          </span>
        </div>

        {(record.areaName || record.location) && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <MapPinIcon className="size-3.5" />
            {record.areaName || `${record.location?.latitude}, ${record.location?.longitude}`}
          </div>
        )}

        {record.note && (
          <div className="flex items-start gap-1 text-muted-foreground">
            <MessageSquareIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{record.note}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {ownerName && <span className="text-xs text-muted-foreground">by {ownerName}</span>}
          {record.visibility && <Badge variant="outline">{record.visibility}</Badge>}
        </div>
      </div>
    </div>
  );
}

export function TrapRecordCard({ record, onEdit, onDelete, canManage, ownerName }: Props) {
  if (record.type === "kill") {
    return (
      <KillCard
        kill={record.data}
        onEdit={() => onEdit?.(record)}
        onDelete={() => onDelete?.(record)}
        canManage={canManage}
        ownerName={ownerName}
      />
    );
  }

  return (
    <ObservationCard
      observation={record.data}
      onEdit={() => onEdit?.(record)}
      onDelete={() => onDelete?.(record)}
      canManage={canManage}
      ownerName={ownerName}
    />
  );
}
