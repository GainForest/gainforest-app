"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, Share2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export function BumicertShareButton({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <motion.button
      type="button"
      onClick={handleShare}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 backdrop-blur-sm transition-colors hover:bg-muted/60",
        className,
      )}
      aria-label="Copy link"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="copied"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5"
          >
            <CheckIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-xs font-medium text-primary">Copied!</span>
          </motion.span>
        ) : (
          <motion.span
            key="share"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5"
          >
            <Share2Icon className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
            <span className="text-xs font-medium text-foreground/60">Share</span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
