"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarIcon,
  GlobeIcon,
  ImageIcon,
  LockIcon,
  MapPinIcon,
  PencilIcon,
  PlusCircleIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountRouteData } from "@/app/account/_lib/account-route";
import { countryFlag } from "@/app/_lib/format";

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function formatSinceDate(value: string | null): { label: string | null; state: "empty" | "valid" | "invalid" } {
  if (!value) return { label: null, state: "empty" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: null, state: "invalid" };
  return {
    label: date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
    state: "valid",
  };
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function getAccountVisibility(): "Public" | "Unlisted" {
  return "Public";
}

interface EditChipProps {
  href: string;
  className?: string;
  children: React.ReactNode;
  isEditing: boolean;
  isEmpty?: boolean;
}

function EditChip({ href, className, children, isEditing, isEmpty = false }: EditChipProps) {
  if (!isEditing) {
    if (isEmpty) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-foreground/60 bg-background/40 backdrop-blur-md border border-border/50 rounded-full px-2.5 py-1 font-medium",
          className,
        )}
      >
        {children}
      </span>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] rounded-full px-2.5 py-1 font-medium border cursor-pointer transition-colors",
          isEmpty
            ? "text-primary/70 bg-primary/5 border-primary/20 hover:bg-primary/10"
            : "text-foreground/60 bg-background/40 backdrop-blur-md border-border/50 hover:bg-background/60 hover:text-foreground/80",
          className,
        )}
      >
        {isEmpty && <PlusCircleIcon className="h-3 w-3 shrink-0" />}
        {!isEmpty && <PencilIcon className="h-3 w-3 shrink-0 opacity-60" />}
        {children}
      </Link>
    </motion.div>
  );
}

export function ManageEditableHero({ account, isEditing }: { account: AccountRouteData; isEditing: boolean }) {
  const displayName = account.displayName;
  const shortDescription = account.description ?? "";
  const country = account.country;
  const website = account.website;
  const startDate = account.createdAt;
  const visibility = getAccountVisibility();
  const coverImageUrl = account.coverUrl;
  const logoUrl = account.avatarUrl;
  const initial = displayName.charAt(0).toUpperCase();
  const sinceDate = formatSinceDate(startDate);
  const sinceLabel = sinceDate.label;
  const countryLabel = country ? countryName(country) : null;
  const flag = country ? countryFlag(country) : "";

  const hasPillRow = isEditing || sinceDate.state === "valid" || countryLabel !== null || website !== null;

  return (
    <section className="relative min-h-[260px] md:min-h-[320px] flex flex-col overflow-hidden rounded-t-4xl border-t border-border">
      {/* ── Cover image (purely decorative layer, z-0) ── */}
      <div className="absolute inset-0 z-0">
        <motion.div
          initial={{ scale: 1.08, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute inset-0"
        >
          {coverImageUrl ? (
            <Image
              src={coverImageUrl}
              alt={`${displayName} cover image`}
              fill
              priority
              unoptimized
              className="object-cover object-center"
              sizes="(max-width: 1152px) 100vw, 1152px"
            />
          ) : (
            <div
              className="absolute inset-0 bg-muted"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 30% 50%, oklch(0.5 0.07 157 / 0.08) 0%, transparent 60%), radial-gradient(circle at 75% 25%, oklch(0.5 0.07 157 / 0.05) 0%, transparent 50%)",
              }}
            />
          )}
          <div className="absolute inset-0 bg-linear-to-b from-background/0 via-background/75 to-background" />
        </motion.div>
      </div>

      {/* ── Bottom content (z-10, same level as top row — never blocks top row) ── */}
      <div className="relative z-10 flex-1 flex flex-col justify-end px-5 pb-6 pt-24">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-3">
          <div className="relative shrink-0">
            <div className="relative h-24 w-24 rounded-full overflow-hidden bg-muted border border-white/15 shadow-sm">
              {logoUrl ? (
                <Image src={logoUrl} alt={displayName} fill unoptimized className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                  {initial}
                </div>
              )}
            </div>
            {isEditing && (
              <Link
                href="/manage?mode=edit"
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-background border border-border flex items-center justify-center shadow-sm hover:bg-muted/60 transition-colors cursor-pointer"
                aria-label={account.kind === "organization" ? "Change logo" : "Change photo"}
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          <div className="max-w-3xl w-full min-w-0">
            {/* Logo + name row */}
            {isEditing ? (
              <input
                type="text"
                value={displayName}
                readOnly
                placeholder="Organization name"
                className={cn(
                  "text-3xl sm:text-4xl md:text-5xl font-light tracking-[-0.02em] leading-none",
                  "font-instrument italic bg-transparent border-b-2 border-white/40 focus:border-primary/60 outline-none",
                  "text-foreground placeholder:text-foreground/40 w-full transition-colors",
                )}
              />
            ) : (
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-light tracking-[-0.02em] leading-none text-foreground font-instrument italic">
                {displayName}
              </h1>
            )}

            {/* Short description */}
            {isEditing ? (
              <textarea
                value={shortDescription}
                readOnly
                placeholder="Short description…"
                rows={2}
                className={cn(
                  "mt-1 w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent border-b border-white/30 focus:border-primary/60 outline-none transition-colors field-sizing-content",
                  "text-muted-foreground placeholder:text-muted-foreground/60 leading-relaxed",
                )}
              />
            ) : (
              shortDescription && (
                <p className="text-muted-foreground line-clamp-4 md:line-clamp-2 mt-1">
                  {shortDescription}
                </p>
              )
            )}
          </div>
        </div>

        {/* Pills row */}
        {hasPillRow && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <EditChip href="/manage?mode=edit" isEditing={isEditing} isEmpty={!countryLabel}>
              {flag && (
                <span className="text-sm leading-none" aria-hidden="true">
                  {flag}
                </span>
              )}
              {countryLabel ?? "Add country"}
            </EditChip>

            <EditChip
              href="/manage?mode=edit"
              isEditing={isEditing}
              isEmpty={isEditing ? sinceDate.state === "empty" : sinceDate.state !== "valid"}
            >
              <CalendarIcon className="h-3 w-3 shrink-0" />
              {sinceDate.state === "valid"
                ? `Since ${sinceLabel}`
                : isEditing && sinceDate.state === "invalid"
                  ? "Invalid Date"
                  : "Add start date"}
            </EditChip>

            <EditChip href="/manage?mode=edit" isEditing={isEditing} isEmpty={!website}>
              <GlobeIcon className="h-3 w-3 shrink-0" />
              {website ? formatWebsite(website) : "Add website"}
            </EditChip>

            {(isEditing || visibility === "Unlisted") && (
              <EditChip href="/manage?mode=edit" isEditing={isEditing} isEmpty={false}>
                {visibility === "Unlisted" ? (
                  <LockIcon className="h-3 w-3 shrink-0" />
                ) : (
                  <MapPinIcon className="h-3 w-3 shrink-0" />
                )}
                {visibility ?? "Public"}
              </EditChip>
            )}
          </div>
        )}
      </div>

      {/*
        ── Top action row (z-10) ──
        Contains: cover-edit button (left, edit mode only) + editing badge / edit link (right)
      */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between p-4">
        {/* Left: change cover button — only in edit mode */}
        <AnimatePresence>
          {isEditing && (
            <motion.div
              key="cover-btn"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Link
                href="/manage?mode=edit"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/55 backdrop-blur-xl border border-white/20 shadow-lg hover:bg-background/70 transition-colors cursor-pointer"
                aria-label="Change cover image"
              >
                <ImageIcon className="h-3.5 w-3.5 text-foreground/80 shrink-0" />
                <span className="text-xs font-medium text-foreground/80">
                  Change cover
                </span>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

export function EditBar({ hasChanges = false }: { hasChanges?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex items-center justify-between gap-4 rounded-3xl bg-muted/80 px-4 py-2.5"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{hasChanges ? "You have unsaved changes." : "No changes yet."}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" type="button" asChild>
          <Link href="/manage">
            <XIcon className="h-3.5 w-3.5" />
            Cancel
          </Link>
        </Button>
        <Button type="button" disabled={!hasChanges}>
          <SaveIcon className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>
    </motion.div>
  );
}
