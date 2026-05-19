"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { renderPetAnimated, type CodexPetState } from "../_lib/codex-pet";
import { TAINA_SIM } from "../_lib/taina-sim";
import { useLocale } from "./LocaleProvider";

// FloatingTaina — port of `simocracy-v2/components/feedback/floating-einstein.tsx`,
// pointed at the "Taina" sim
//   at://did:plc:qc42fmqqlsmdq7jiypiiigww/org.simocracy.sim/3ml7iunv6pp2m
// owned by @daviddao.org.
//
// Replaces the earlier `FloatingCapybara` (same widget, different sim).
// The team's note: "I liked the FloatingCapybara, but I didn't like
// that it was a capybara — use Taina instead". The codex-pet machinery,
// the drag/persist behaviour, and the chat-panel layout are unchanged;
// only the sim binding (sprite assets + system prompt + i18n keys) moved.
//
// Behaviour (unchanged from the capybara version):
//   - Sits bottom-LEFT on desktop / bottom-RIGHT on mobile by default
//     (32 px / 18 px from each edge). Drag anywhere on the viewport;
//     position persists in localStorage.
//   - Pure click toggles a chat panel. The panel anchors to whichever
//     side of the sprite has the most room.
//   - Animation state machine: dragging → running-{left|right}; streaming
//     a reply → review (heads-down); panel just opened → waving (1.6 s);
//     otherwise → idle. All states are real cells from the 1536×1872
//     codex-pet sheet on Taina's PDS (mirrored to /public/codex-pets/).
//   - Chat streams from `/api/sim-chat`. The system prompt is built from
//     Taina's constitution + style records on her owner's PDS, so the
//     companion always speaks in the latest Taina voice.
//   - Hidden inside iframes (no OG/print rendering).

const SPRITE_W = 84;
const SPRITE_H = 90;
// Vertical room reserved below the sprite for the "Ask me anything"
// name-shield. Folded into the viewport clamp so the shield never gets
// pushed off-screen when the user drags the sprite near the bottom.
const BADGE_RESERVE = 24;
const PANEL_W = 340;
const PANEL_H = 460;
const PANEL_GAP = 12;
const VIEWPORT_PADDING = 12;
const DRAG_THRESHOLD_PX = 4;
// Distinct key from the old `floatingCapybara` key so existing visitors
// who positioned the capybara somewhere weird get a fresh default
// position for Taina (and so a future sim swap doesn't surface the
// previous sim's coordinates).
const STORAGE_KEY = "gainforest.floatingTaina.position.v1";
const DESKTOP_MIN_WIDTH = 1024;
const OPEN_WAVE_MS = 1600;

interface Position {
  x: number;
  y: number;
}
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function clampToViewport(pos: Position): Position {
  if (typeof window === "undefined") return pos;
  const maxX = window.innerWidth - SPRITE_W - VIEWPORT_PADDING;
  // Subtract BADGE_RESERVE so the shield below the sprite stays on-screen.
  const maxY =
    window.innerHeight - SPRITE_H - BADGE_RESERVE - VIEWPORT_PADDING;
  return {
    x: Math.max(VIEWPORT_PADDING, Math.min(pos.x, maxX)),
    y: Math.max(VIEWPORT_PADDING, Math.min(pos.y, maxY)),
  };
}

function defaultPosition(): Position {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  // Desktop: bottom-LEFT — the hero composition weights the page right
  // (Bumicerts card + globe), so the floating companion balances it.
  // Mobile: bottom-RIGHT — the layout is a single stacked column, so
  // a left-side sprite would constantly overlap the content stream;
  // bottom-right keeps the corner clear of the column flow.
  const isDesktop = window.innerWidth >= DESKTOP_MIN_WIDTH;
  const edgeInset = isDesktop ? 32 : 18;
  return {
    x: isDesktop
      ? edgeInset
      : window.innerWidth - SPRITE_W - edgeInset,
    y: window.innerHeight - SPRITE_H - BADGE_RESERVE - edgeInset,
  };
}

// Place the chat panel adjacent to the sprite, preferring above-and-left
// (since the default anchor is bottom-right). Flip whichever axis runs
// out of room. Identical logic to simocracy's `computePanelPosition`.
function computePanelPosition(spritePos: Position): Position {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = spritePos.x + SPRITE_W - PANEL_W;
  let y = spritePos.y - PANEL_H - PANEL_GAP;
  if (y < VIEWPORT_PADDING) y = spritePos.y + SPRITE_H + PANEL_GAP;
  if (x < VIEWPORT_PADDING) x = spritePos.x;
  x = Math.max(VIEWPORT_PADDING, Math.min(x, vw - PANEL_W - VIEWPORT_PADDING));
  y = Math.max(VIEWPORT_PADDING, Math.min(y, vh - PANEL_H - VIEWPORT_PADDING));
  return { x, y };
}

export function FloatingTaina() {
  const { locale, t } = useLocale();
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragDirection, setDragDirection] = useState<"left" | "right">("right");
  const [waveActive, setWaveActive] = useState(false);
  const [firstFramePainted, setFirstFramePainted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headerCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    lastClientX: number;
    moved: boolean;
  } | null>(null);

  // Restore position from localStorage on mount.
  useLayoutEffect(() => {
    let saved: Position | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.x === "number" &&
          typeof parsed.y === "number"
        ) {
          saved = { x: parsed.x, y: parsed.y };
        }
      }
    } catch {
      // ignore
    }
    setPosition(clampToViewport(saved ?? defaultPosition()));
    setMounted(true);
  }, []);

  // Re-clamp on resize.
  useEffect(() => {
    if (!mounted) return;
    const onResize = () => setPosition((p) => clampToViewport(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mounted]);

  // Persist position.
  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    } catch {
      // ignore
    }
  }, [position, mounted]);

  // Autoscroll the message list when content changes.
  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  // Focus input when panel opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Allow in-page CTAs (e.g. <TainaFeature />'s "Say hi to Taina") to
  // open the floating panel without importing or coupling to this
  // component's local state. CustomEvent keeps the widget optional — if
  // it is ever unmounted again, the CTA simply becomes a no-op.
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setWaveActive(true);
    };
    window.addEventListener("taina:open", onOpen);
    return () => window.removeEventListener("taina:open", onOpen);
  }, []);

  // ─── Drag handling ─────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-drag]")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: position.x,
        startY: position.y,
        lastClientX: e.clientX,
        moved: false,
      };
    },
    [position.x, position.y],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        setDragging(true);
      }
      const stepDx = e.clientX - drag.lastClientX;
      drag.lastClientX = e.clientX;
      if (stepDx > 1) setDragDirection("right");
      else if (stepDx < -1) setDragDirection("left");
      setPosition(
        clampToViewport({ x: drag.startX + dx, y: drag.startY + dy }),
      );
    },
    [],
  );
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const wasDrag = drag.moved;
      dragRef.current = null;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (!wasDrag) {
        setOpen((v) => {
          const next = !v;
          if (next) setWaveActive(true);
          return next;
        });
      }
    },
    [],
  );
  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // ─── Codex-pet state machine ───────────────────────────────────────
  const petState: CodexPetState = useMemo(() => {
    if (dragging) {
      return dragDirection === "left" ? "running-left" : "running-right";
    }
    if (streaming) return "review";
    if (waveActive) return "waving";
    return "idle";
  }, [dragging, dragDirection, streaming, waveActive]);

  const markFirstFrame = useCallback(() => setFirstFramePainted(true), []);

  // Drive the main floating sprite.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return renderPetAnimated(canvas, TAINA_SIM.sheetUrl, petState, markFirstFrame);
  }, [petState, markFirstFrame]);

  // Drive the small header avatar in the chat panel (only while open).
  useEffect(() => {
    if (!open) return;
    const canvas = headerCanvasRef.current;
    if (!canvas) return;
    return renderPetAnimated(canvas, TAINA_SIM.sheetUrl, "idle");
  }, [open]);

  // End the open-wave after one cycle.
  useEffect(() => {
    if (!waveActive) return;
    const t = setTimeout(() => setWaveActive(false), OPEN_WAVE_MS);
    return () => clearTimeout(t);
  }, [waveActive]);

  // ─── Chat ──────────────────────────────────────────────────────────
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
        // `locale` tells the server which language to instruct the
        // model to reply in — see app/api/sim-chat/route.ts.
        body: JSON.stringify({ messages: next, locale }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const reason = err.error || "Something went wrong.";
        const friendly =
          res.status === 503
            ? "I'm not wired up yet — the AI service is not configured on this server."
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
      console.error("[FloatingTaina] chat failed", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ Could not reach the AI service — check your connection and try again.",
        },
      ]);
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming]);

  if (!mounted) return null;
  if (typeof window !== "undefined" && window.self !== window.top) return null;

  const panelPos = open ? computePanelPosition(position) : { x: 0, y: 0 };

  return (
    <>
      {/* CHAT PANEL */}
      {open && (
        <div
          role="dialog"
          aria-label={`Chat with ${TAINA_SIM.name}`}
          className="fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-border-soft bg-background shadow-xl"
          style={{
            left: panelPos.x,
            top: panelPos.y,
            width: PANEL_W,
            height: PANEL_H,
          }}
          data-no-drag
        >
          {/* header */}
          <div className="flex items-center gap-3 border-b border-border-soft px-3 py-2.5">
            <canvas
              ref={headerCanvasRef}
              width={192}
              height={208}
              style={{
                width: 36,
                height: 39,
                imageRendering: "pixelated",
              }}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="font-garamond text-[15px] font-medium text-foreground">
                {TAINA_SIM.name}
              </div>
              <div className="truncate text-[11px] text-foreground/55">
                {t("taina.role")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-full text-foreground/55 hover:bg-foreground/5 hover:text-foreground"
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          {/* messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[13px] leading-relaxed">
            {messages.length === 0 && (
              <div className="rounded-2xl bg-foreground/5 px-3 py-2 text-foreground/70">
                <p>
                  {/* Tropical-leaf glyph (echoes the parrot/sprout
                      emojis in Taina's own constitution sign-off). */}
                  <span aria-hidden>🌿</span> {t("taina.greetingHello")}
                </p>
                <p className="mt-1 text-foreground/55">
                  {t("taina.greetingHint")}
                </p>
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
                {m.content || (
                  <span className="text-foreground/40">…</span>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* input */}
          <form
            className="flex items-end gap-2 border-t border-border-soft px-3 py-2.5"
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
              placeholder={
                streaming ? t("taina.thinking") : t("taina.placeholder")
              }
              rows={1}
              disabled={streaming}
              className="max-h-24 min-h-[36px] flex-1 resize-none rounded-md border border-border-soft bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary/60 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
            >
              ↑
            </button>
          </form>
        </div>
      )}

      {/* SPRITE */}
      <div
        role="button"
        aria-label={`${TAINA_SIM.name} — click to chat, drag to move`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={`fixed z-[55] select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          left: position.x,
          top: position.y,
          width: SPRITE_W,
          height: SPRITE_H,
          touchAction: "none",
        }}
      >
        {/* Static poster covers the canvas load gap. Cross-fades out on
            first paint via opacity. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={TAINA_SIM.posterUrl}
          alt=""
          width={SPRITE_W}
          height={SPRITE_H}
          className="absolute inset-0 transition-opacity duration-200"
          style={{
            imageRendering: "pixelated",
            opacity: firstFramePainted ? 0 : 1,
          }}
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          width={192}
          height={208}
          style={{
            width: SPRITE_W,
            height: SPRITE_H,
            imageRendering: "pixelated",
          }}
          className="absolute inset-0"
        />

        {/* Name shield / legend — sits like a small banner beneath the
            sprite. Clicks bubble up to the parent's pointer handler (no
            data-no-drag, no pointer-events-none) so tapping the shield
            opens chat just like tapping the sprite. Hidden while the
            chat panel is open (redundant) and faded out mid-drag (the
            sprite is busy moving). */}
        {!open && (
          <div
            aria-hidden
            className={
              "pointer-events-none absolute left-1/2 top-full mt-1 " +
              "-translate-x-1/2 whitespace-nowrap rounded-full " +
              "border border-border-soft bg-background/95 " +
              "px-2.5 py-[3px] font-garamond text-[11px] text-primary " +
              "shadow-[0_2px_8px_-3px_rgba(40,50,30,0.22)] " +
              "backdrop-blur-sm transition-opacity duration-150 " +
              (dragging ? "opacity-0" : "opacity-100")
            }
          >
            {t("taina.shield")}
          </div>
        )}
      </div>
    </>
  );
}
