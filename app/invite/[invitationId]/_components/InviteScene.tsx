"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { monogram } from "@/app/_lib/did-profile";
import { cn } from "@/lib/utils";

export type InviteTone = "neutral" | "success" | "danger";

export type InviteOrg = {
  name: string;
  handle: string | null;
  did: string;
};

const EASE = [0.25, 0.1, 0.25, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: EASE } },
};

const TONE_BADGE: Record<InviteTone, string> = {
  neutral: "bg-primary text-primary-foreground",
  success: "bg-emerald-500 text-white",
  danger: "bg-destructive text-white",
};

const TONE_HALO: Record<InviteTone, string> = {
  neutral: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600",
  danger: "bg-destructive/10 text-destructive",
};

const TONE_GLOW: Record<InviteTone, string> = {
  neutral: "bg-primary/10",
  success: "bg-emerald-500/10",
  danger: "bg-destructive/10",
};

export function InviteScene({
  tone = "neutral",
  icon,
  title,
  description,
  org = null,
  children,
}: {
  tone?: InviteTone;
  icon: ReactNode;
  title: string;
  description: string;
  org?: InviteOrg | null;
  children?: ReactNode;
}) {
  const mono = org ? monogram(org.handle, org.did) : null;

  return (
    <main className="relative isolate flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 py-20">
      <div
        aria-hidden
        className="absolute left-1/2 top-[22%] -z-10 size-[30rem] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-3xl"
      />
      <div
        aria-hidden
        className={cn("absolute bottom-12 right-[22%] -z-10 size-72 rounded-full blur-3xl", TONE_GLOW[tone])}
      />

      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="flex w-full max-w-xl flex-col items-center text-center"
      >
        <motion.div
          variants={item}
          className="relative mb-9"
        >
          {mono ? (
            <span
              style={{ backgroundColor: mono.bg }}
              className="font-instrument flex size-20 items-center justify-center rounded-full text-3xl italic text-white"
            >
              {mono.char}
            </span>
          ) : (
            <span className={cn("flex size-20 items-center justify-center rounded-full", TONE_HALO[tone])}>
              {icon}
            </span>
          )}

          {mono ? (
            <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-background p-1">
              <span className={cn("flex size-9 items-center justify-center rounded-full", TONE_BADGE[tone])}>
                {icon}
              </span>
            </span>
          ) : null}
        </motion.div>

        <motion.h1
          variants={item}
          className="font-instrument text-4xl italic leading-[1.1] text-foreground sm:text-5xl"
        >
          {title}
        </motion.h1>

        {org ? (
          <motion.span
            variants={item}
            className="mt-5 inline-flex items-center rounded-full bg-foreground/[0.06] px-4 py-1.5 text-sm font-medium text-foreground/80"
          >
            {org.name}
          </motion.span>
        ) : null}

        <motion.p
          variants={item}
          className="mt-6 max-w-md text-base leading-7 text-muted-foreground"
        >
          {description}
        </motion.p>

        {children ? (
          <motion.div variants={item} className="mt-9 flex justify-center">
            {children}
          </motion.div>
        ) : null}
      </motion.section>
    </main>
  );
}
