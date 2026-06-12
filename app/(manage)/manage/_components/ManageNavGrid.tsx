"use client";

/**
 * ManageNavGrid
 *
 * A dashboard grid shown in view mode below the org about section.
 * Each card navigates to a section of the MANAGE platform.
 *
 * Cards:
 *   Sites         → /manage/sites
 *   Audio         → /manage/audio
 *   Trees         → /manage/trees
 *   Bumicerts     → /manage/bumicerts
 *   Organizations → /manage/organizations
 */

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronRightIcon,
  MapPinIcon,
  MicIcon,
  TreesIcon,
  Building2Icon,
} from "lucide-react";
import BumicertIcon from "@/icons/BumicertIcon";
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

type AccountKind = "organization" | "user";

interface NavCard {
  id: string;
  label: "Sites" | "Audio" | "Trees" | "Bumicerts" | "Organizations";
  description: string;
  href: string;
  Icon: LucideIcon | ComponentType<{ className?: string }>;
}

const ORG_NAV_CARDS: NavCard[] = [
  {
    id: "sites",
    label: "Sites",
    description: "Manage your organization sites and mapped site boundaries.",
    href: "/manage/sites",
    Icon: MapPinIcon,
  },
  {
    id: "audio",
    label: "Audio",
    description: "Manage field sound recordings.",
    href: "/manage/audio",
    Icon: MicIcon,
  },
  {
    id: "trees",
    label: "Trees",
    description: "Manage tree lists and add nature information.",
    href: "/manage/trees",
    Icon: TreesIcon,
  },
  {
    id: "bumicerts",
    label: "Bumicerts",
    description: "Create and publish verified impact certificates.",
    href: "/manage/bumicerts",
    Icon: BumicertIcon,
  },
  {
    id: "organizations",
    label: "Organizations",
    description: "Open organization accounts and manage members.",
    href: "/manage/organizations",
    Icon: Building2Icon,
  },
];

export function ManageNavGrid({
  accountKind = "organization",
}: {
  accountKind?: AccountKind;
}) {
  const cards = accountKind === "organization"
    ? ORG_NAV_CARDS
    : ORG_NAV_CARDS.filter((card) => card.id === "organizations");
  if (cards.length === 0) return null;

  return (
    <div className="pb-2">
      <h1 className="text-2xl font-medium">
        Manage{" "}
        {accountKind === "organization" && (
          <span className="text-muted-foreground">
            your organization work
          </span>
        )}
      </h1>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {cards.map((card, i) => {
          const Icon = card.Icon;
          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: i * 0.06,
                ease: [0.25, 0.1, 0.25, 1],
              }}
            >
              <Link
                href={card.href}
                className="group flex flex-col gap-3 h-full p-4 rounded-2xl bg-muted/50 hover:bg-muted transition-all duration-300 overflow-hidden"
              >
                {/*<div className="absolute z-0 bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1/2 aspect-square rounded-full blur-3xl scale-0 group-hover:scale-100 opacity-0 group-hover:opacity-50 transition-all duration-500 bg-primary" />*/}
                {/* Icon */}
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-muted-foreground opacity-60 group-hover:text-primary transition-colors duration-300" />
                  <ChevronRightIcon className="size-6 text-muted-foreground opacity-10 group-hover:opacity-30 group-hover:translate-x-0.5 transition-all duration-300" />
                </div>

                {/* Text */}
                <div>
                  <p className="text-lg font-medium text-foreground group-hover:text-primary transition-all duration-300 mb-1">
                    {card.label}
                  </p>
                  <p className="text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
