"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  Building2Icon,
  MapPinIcon,
  MicIcon,
  SparklesIcon,
  TreePineIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ManageRouteId = "organization" | "sites" | "audio" | "trees";

type ManageRoute = {
  id: ManageRouteId;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  sourceHref: string;
  Icon: LucideIcon;
};

export const MANAGE_PLACEHOLDER_ROUTES: ManageRoute[] = [
  {
    id: "organization",
    title: "Organization",
    eyebrow: "Manage profile",
    description: "This profile editor is still being prepared for this area.",
    href: "/manage",
    sourceHref: "/upload",
    Icon: Building2Icon,
  },
  {
    id: "sites",
    title: "Sites",
    eyebrow: "Manage locations",
    description: "This sites editor is still being prepared for this area.",
    href: "/manage/sites",
    sourceHref: "/upload/sites",
    Icon: MapPinIcon,
  },
  {
    id: "audio",
    title: "Audio",
    eyebrow: "Manage sound",
    description: "This sound editor is still being prepared for this area.",
    href: "/manage/audio",
    sourceHref: "/upload/audio",
    Icon: MicIcon,
  },
  {
    id: "trees",
    title: "Trees",
    eyebrow: "Manage trees",
    description: "This tree editor is still being prepared for this area.",
    href: "/manage/trees",
    sourceHref: "/upload/trees",
    Icon: TreePineIcon,
  },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
};

export function ManagePlaceholder({ active }: { active: ManageRouteId }) {
  const activeRoute = MANAGE_PLACEHOLDER_ROUTES.find((route) => route.id === active) ?? MANAGE_PLACEHOLDER_ROUTES[0]!;
  const ActiveIcon = activeRoute.Icon;

  return (
    <section className="px-4 pb-16 pt-3 sm:px-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative overflow-hidden rounded-4xl border border-border bg-card p-6 shadow-sm md:p-8"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-primary/[0.08] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 size-64 rounded-full bg-primary/[0.05] blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-2.5 text-primary/80">
                <ActiveIcon className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.22em]">
                  {activeRoute.eyebrow}
                </span>
              </div>
              <h1 className="font-garamond text-5xl font-light leading-none tracking-[-0.03em] text-foreground md:text-7xl">
                {activeRoute.title}
                <span className="font-instrument italic text-foreground/80"> coming soon</span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                {activeRoute.description} Please come back soon.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground shadow-sm backdrop-blur">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <SparklesIcon className="size-4 text-primary" />
                What to expect
              </div>
              <div className="text-xs">
                Tools for keeping your organization&apos;s public work up to date.
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {MANAGE_PLACEHOLDER_ROUTES.map((route) => {
            const Icon = route.Icon;
            const selected = route.id === active;
            return (
              <motion.div key={route.id} variants={cardVariants}>
                <Link href={route.href} className="group block h-full">
                  <div
                    className={cn(
                      "flex h-full min-h-[190px] flex-col justify-between rounded-3xl border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
                      selected ? "border-primary/35 bg-primary/[0.04]" : "border-border hover:border-primary/25",
                    )}
                  >
                    <div>
                      <div className="mb-4 flex size-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary/[0.08] text-primary shadow-inner">
                        <Icon className="size-4" />
                      </div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {route.eyebrow}
                      </p>
                      <h2 className="mt-2 font-instrument text-2xl italic leading-tight text-foreground">
                        {route.title}
                      </h2>
                    </div>
                    <div className="mt-6 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="font-mono">{route.href}</span>
                      <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
