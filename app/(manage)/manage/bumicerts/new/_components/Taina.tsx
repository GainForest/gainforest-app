"use client";

import { AnimatePresence, motion } from "framer-motion";
import { XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderPetAnimated, type CodexPetState } from "@/app/_lib/codex-pet";
import { TAINA_SIM } from "@/app/_lib/taina-sim";
import { cn } from "@/lib/utils";

// Taina — the Bumicert writing companion (chat ported from gainforest-app's
// FloatingTaina). She replaces the old static "Tips" list on the
// create-a-Bumicert page. Two surfaces, one shared chat card:
//
//   - Desktop (`<TainaChatDock />`): the chat is shown inline, docked in the
//     sticky sidebar just below the live-preview card. No sprite, no drag —
//     it's always open.
//   - Phones (`<TainaMobileTrigger />`): a fixed sprite button pinned just
//     above the "Preview" button; tapping it opens the same chat in a bottom
//     sheet.
//
// Chat streams from `/api/sim-chat`, which builds the system prompt from
// Taina's constitution + style records on her owner's PDS.

// English copy (ported from gainforest-app's i18n `taina.*` keys, retuned
// from "welcome a landing visitor" to "help write a Bumicert").
const COPY = {
  role: "Your Bumicert writing companion",
  greetingHello: "Hi; I'm Taina. Writing a Bumicert? I can help you make it land.",
  greetingHint:
    "Ask me how to title it, what to lead the summary with, or what evidence funders look for — or paste a draft and I'll react.",
  placeholder: "Ask me for tips…",
  thinking: "Taina is thinking…",
} as const;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Progressive blur ───────────────────────────────────────────────
// Same technique as the app header (see HomeLanding's ProgressiveBlur): a
// stack of backdrop-filter layers, each masked by a gradient, so the blur
// ramps from heavy at the edge to nothing toward the centre. Used behind the
// chat's transparent header/footer to soften the messages scrolling under
// them without an opaque bar or a hard divider line.
function ProgressiveBlur({
  height = "30%",
  position = "bottom",
  blurLevels = [0.5, 1, 2, 4, 8],
}: {
  height?: string;
  position?: "top" | "bottom";
  blurLevels?: number[];
}) {
  const direction = position === "top" ? "to top" : "to bottom";
  const step = 100 / (blurLevels.length + 1);
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 grid",
        position === "top" ? "top-0" : "bottom-0",
      )}
      style={{ height }}
    >
      {blurLevels.map((blur, index) => {
        const fadeStart = index * step;
        const fadeEnd = (index + 1) * step;
        const mask = `linear-gradient(${direction}, transparent ${fadeStart}%, #000 ${fadeEnd}%)`;
        return (
          <span
            key={blur}
            style={{
              gridArea: "1 / 1",
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Animated sprite ────────────────────────────────────────────────
function TainaSprite({
  size,
  state = "idle",
  className,
}: {
  size: number;
  state?: CodexPetState;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return renderPetAnimated(canvas, TAINA_SIM.sheetUrl, state);
  }, [state]);
  return (
    <canvas
      ref={ref}
      width={192}
      height={208}
      style={{ width: size, height: size * (208 / 192), imageRendering: "pixelated" }}
      className={className}
    />
  );
}

// ─── Shared chat card (header + messages + input + streaming logic) ──
function TainaChatCard({
  className,
  onClose,
}: {
  className?: string;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Autoscroll on new content.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setStreaming(true);

    let assistant = "";
    try {
      const res = await fetch("/api/sim-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const reason = err.error || "Something went wrong.";
        const friendly =
          res.status === 503
            ? "I'm not wired up yet; the AI service is not configured on this server."
            : res.status === 502
              ? "The AI service is briefly unreachable. Try again in a moment."
              : reason;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ ${friendly}` },
        ]);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "⚠️ No response stream" },
        ]);
        return;
      }
      const decoder = new TextDecoder();
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data: ")) continue;
          const data = t.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistant += delta;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistant,
                };
                return updated;
              });
            }
          } catch {
            // skip unparseable
          }
        }
      }
      if (!assistant) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "⚠️ No response received.",
          };
          return updated;
        });
      }
    } catch (err) {
      console.error("[Taina] chat failed", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ Could not reach the AI service; check your connection and try again.",
        },
      ]);
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border-soft bg-background",
        className,
      )}
    >
      {/* messages — fill the card and scroll behind the transparent header
          and footer; the padding keeps the first/last bubbles clear of them */}
      <div className="absolute inset-0 space-y-3 overflow-y-auto px-3 pt-[60px] pb-[64px] text-[13px] leading-relaxed">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-foreground/5 px-3 py-2 text-foreground/70">
            <p>
              <span aria-hidden>🌿</span> {COPY.greetingHello}
            </p>
            <p className="mt-1 text-foreground/55">{COPY.greetingHint}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-2xl bg-primary px-3 py-2 text-primary-foreground"
                : "mr-8 rounded-2xl bg-foreground/5 px-3 py-2 text-foreground"
            }
          >
            {m.content || <span className="text-foreground/40">…</span>}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* header — transparent; progressive blur softens whatever scrolls
          under, and a background gradient over it lifts contrast (same combo
          as the app header) */}
      <ProgressiveBlur position="top" height="84px" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[84px] bg-gradient-to-b from-background/85 to-background/0"
      />
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-3 pt-3 pb-2">
        <TainaSprite size={36} state={streaming ? "review" : "idle"} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-foreground">
            {TAINA_SIM.name}
          </div>
          <div className="truncate text-[11px] text-foreground/55">{COPY.role}</div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full text-foreground/55 hover:bg-foreground/5 hover:text-foreground"
            aria-label="Close chat"
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>

      {/* footer — transparent; progressive blur + gradient, mirrored upward */}
      <ProgressiveBlur position="bottom" height="96px" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[96px] bg-gradient-to-t from-background/85 to-background/0"
      />
      <form
        className="absolute inset-x-0 bottom-0 z-20 flex items-end gap-2 px-3 pt-2 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          placeholder={streaming ? COPY.thinking : COPY.placeholder}
          rows={1}
          className="max-h-24 min-h-[36px] flex-1 resize-none rounded-2xl border border-border-soft bg-background/70 px-3.5 py-2 text-[13px] outline-none focus:border-primary/60"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

// ─── Desktop: inline docked chat below the live preview ──────────────
export function TainaChatDock() {
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
        Tips from Taina
      </p>
      <TainaChatCard className="h-[26rem]" />
    </div>
  );
}

// ─── Mobile: fixed sprite trigger + bottom-sheet chat ────────────────
// Render this inside the page's fixed bottom-right button stack, above the
// "Preview" button, so it sits exactly where the old "Tips" button did.
export function TainaMobileTrigger() {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the sheet is open (matches the Preview sheet).
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Taina for tips"
        className="grid size-14 place-items-center rounded-full border border-border-soft bg-background shadow-lg"
      >
        <TainaSprite size={44} />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div className="fixed inset-0 z-50 xl:hidden" initial={false}>
            <motion.div
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-background px-4 pb-6 pt-3 shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
              <TainaChatCard className="h-[68vh] border-0" onClose={() => setOpen(false)} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
