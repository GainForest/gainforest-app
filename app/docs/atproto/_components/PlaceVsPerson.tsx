"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Side-by-side toy comparing the two ways a link can work: a web link that
// points at a place (kill the server and the post dies with it) and an
// atproto link that points at a person (move the host and the link still
// resolves). The at-uri and https strings are technical identifiers and stay
// verbatim, like the record identifiers in the lexicon diagrams.
export function PlaceVsPerson() {
  const t = useTranslations("common.atproto.naming");
  const [serverDown, setServerDown] = useState(false);
  const [movedHost, setMovedHost] = useState(false);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* The old way: location addressed */}
      <Panel
        title={t("web.title")}
        link="https://old-green-app.com/post/42"
        broken={serverDown}
        caption={serverDown ? t("web.downCaption") : t("web.okCaption")}
        action={serverDown ? t("web.undo") : t("web.action")}
        onAction={() => setServerDown((v) => !v)}
        danger={!serverDown}
      >
        <svg viewBox="0 0 280 120" className="block w-full" role="img" aria-label={t("web.aria")}>
          <line
            x1={70}
            y1={60}
            x2={160}
            y2={60}
            stroke={serverDown ? "var(--border)" : "var(--primary)"}
            strokeWidth={1.2}
            strokeDasharray={serverDown ? "3 4" : undefined}
          />
          {/* the link chip */}
          <rect x={16} y={42} width={54} height={36} rx={10} fill="var(--background)" stroke="var(--border)" />
          <text x={43} y={64.5} textAnchor="middle" fontSize="12" className="font-mono" fill="var(--muted-foreground)">
            {t("linkChip")}
          </text>
          {/* the server */}
          <motion.g initial={false} animate={{ opacity: serverDown ? 0.45 : 1 }}>
            <rect
              x={160}
              y={30}
              width={104}
              height={60}
              rx={12}
              fill="var(--background)"
              stroke={serverDown ? "var(--border)" : "var(--primary)"}
              strokeWidth={serverDown ? 1 : 1.4}
              strokeDasharray={serverDown ? "4 4" : undefined}
            />
            <text x={212} y={56} textAnchor="middle" fontSize="12" className="font-mono" fill={serverDown ? "var(--muted-foreground)" : "var(--foreground)"}>
              {t("web.serverLabel")}
            </text>
            <text x={212} y={74} textAnchor="middle" fontSize="16" fill={serverDown ? "#ef4444" : "var(--primary)"}>
              {serverDown ? "✕" : "▣"}
            </text>
          </motion.g>
        </svg>
      </Panel>

      {/* The atproto way: identity addressed */}
      <Panel
        title={t("id.title")}
        link="at://maria.example/post/42"
        broken={false}
        caption={movedHost ? t("id.movedCaption") : t("id.okCaption")}
        action={movedHost ? t("id.undo") : t("id.action")}
        onAction={() => setMovedHost((v) => !v)}
      >
        <svg viewBox="0 0 280 120" className="block w-full" role="img" aria-label={t("id.aria")}>
          {/* link chip to person */}
          <line x1={70} y1={60} x2={104} y2={60} stroke="var(--primary)" strokeWidth={1.2} />
          <rect x={16} y={42} width={54} height={36} rx={10} fill="var(--background)" stroke="var(--border)" />
          <text x={43} y={64.5} textAnchor="middle" fontSize="12" className="font-mono" fill="var(--muted-foreground)">
            {t("linkChip")}
          </text>

          {/* maria, the identity the link points at */}
          <circle cx={122} cy={60} r={16} fill="var(--primary)" opacity={0.14} />
          <circle cx={122} cy={60} r={16} fill="none" stroke="var(--primary)" strokeWidth={1.3} />
          <text x={122} y={65} textAnchor="middle" fontSize="12" fontWeight={600} fill="var(--primary)">
            M
          </text>

          {/* the arrow from maria to her current host */}
          <motion.line
            initial={false}
            animate={{ y2: movedHost ? 89 : 31 }}
            x1={138}
            y1={60}
            x2={176}
            stroke="var(--primary)"
            strokeWidth={1.2}
          />

          <HostBox x={176} y={8} label={t("id.hostA")} active={!movedHost} />
          <HostBox x={176} y={66} label={t("id.hostB")} active={movedHost} />
        </svg>
      </Panel>
    </div>
  );
}

function HostBox({ x, y, label, active }: { x: number; y: number; label: string; active: boolean }) {
  return (
    <g opacity={active ? 1 : 0.45}>
      <rect
        x={x}
        y={y}
        width={92}
        height={46}
        rx={12}
        fill="var(--background)"
        stroke={active ? "var(--primary)" : "var(--border)"}
        strokeWidth={active ? 1.4 : 1}
        strokeDasharray={active ? undefined : "4 4"}
      />
      <text
        x={x + 46}
        y={y + 27.5}
        textAnchor="middle"
        fontSize="11.5"
        className="font-mono"
        fill={active ? "var(--foreground)" : "var(--muted-foreground)"}
      >
        {label}
      </text>
    </g>
  );
}

function Panel({
  title,
  link,
  broken,
  caption,
  action,
  onAction,
  danger,
  children,
}: {
  title: string;
  link: string;
  broken: boolean;
  caption: string;
  action: string;
  onAction: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border/60 px-5 py-4">
      <div className="text-[13.5px] font-medium text-foreground">{title}</div>
      <div
        className={cn(
          "mt-2 w-fit max-w-full truncate rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
          broken
            ? "border-red-500/40 text-red-600 line-through dark:text-red-400"
            : "border-primary/40 text-primary",
        )}
      >
        {link}
      </div>
      <div className="mt-2">{children}</div>
      <div className="mt-1 min-h-[3.5rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={caption}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="m-0 text-[12.5px] leading-relaxed text-muted-foreground"
          >
            {caption}
          </motion.p>
        </AnimatePresence>
      </div>
      <button
        type="button"
        onClick={onAction}
        className={cn(
          "mt-3 w-fit rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
          danger
            ? "border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
            : "border-primary/50 text-primary hover:bg-primary/10",
        )}
      >
        {action}
      </button>
    </div>
  );
}
