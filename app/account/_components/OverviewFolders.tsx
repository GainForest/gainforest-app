"use client";

import type { ElementType } from "react";
import Link from "next/link";
import {
  BinocularsIcon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  ImageIcon,
  MapPinIcon,
  TreePineIcon,
  Volume2Icon,
} from "lucide-react";
import BumicertIcon from "@/icons/BumicertIcon";

export type OverviewFolderTile = {
  id: string;
  title: string;
  href: string;
  count: number | null | undefined;
};

const icons: Record<string, ElementType> = {
  certs: BumicertIcon,
  donations: HeartHandshakeIcon,
  projects: FolderKanbanIcon,
  gallery: ImageIcon,
  observations: BinocularsIcon,
  sites: MapPinIcon,
  trees: TreePineIcon,
  audio: Volume2Icon,
};

/** Quiet at-a-glance destinations for a personal profile overview. */
export function OverviewFolders({ tiles }: { tiles: OverviewFolderTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {tiles.map((tile) => {
        const Icon = icons[tile.id] ?? FolderKanbanIcon;
        return (
          <Link
            key={tile.id}
            href={tile.href}
            className="group flex min-h-20 items-center gap-3 rounded-2xl bg-muted/65 px-4 py-3 transition-colors hover:bg-muted motion-reduce:transition-none"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground group-hover:underline">{tile.title}</span>
              {typeof tile.count === "number" ? <span className="mt-0.5 block tabular-nums text-sm text-muted-foreground">{tile.count}</span> : null}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
