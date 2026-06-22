"use client";

import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  LeafIcon,
  MapPinnedIcon,
  MusicIcon,
  TreesIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedTileKind, TimelineFeedTile } from "../../shared/timelineFeedViewModel";

function tileIcon(kind: FeedTileKind): LucideIcon {
  if (kind === "site") return MapPinnedIcon;
  if (kind === "tree") return TreesIcon;
  if (kind === "nature") return LeafIcon;
  if (kind === "audio") return MusicIcon;
  if (kind === "image") return ImageIcon;
  if (kind === "video") return VideoIcon;
  if (kind === "link") return GlobeIcon;
  return FileTextIcon;
}

export function TimelineTileRow({
  tiles,
  activeTileId,
  onTileClick,
}: {
  tiles: TimelineFeedTile[];
  activeTileId: string | null;
  onTileClick: (tile: TimelineFeedTile) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tiles.map((tile) => {
        const Icon = tileIcon(tile.kind);
        const active = activeTileId === tile.id;
        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onTileClick(tile)}
            className={cn(
              "flex min-w-[150px] items-center gap-2 rounded-xl border p-2 text-left transition-colors",
              active
                ? "border-primary bg-primary/10"
                : "border-border/60 bg-background hover:bg-muted/40",
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-foreground">
                {tile.title}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {tile.caption}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
