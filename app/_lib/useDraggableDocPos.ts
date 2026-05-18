"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Shared draggable-card hook. Extracted from BumicertsCard so the new
// DraggableGlobeCard can use the same drag semantics:
//
//   - position is in *document* coordinates so the card scrolls with the
//     page (disappears off the top of the screen when you scroll past it)
//     instead of being pinned to the viewport;
//   - the default home position is read from a static placeholder element
//     (`#${anchorId}`) that the server-rendered hero composition places at
//     the desired location;
//   - position persists in localStorage under `storageKey` so the user's
//     drop point survives reloads;
//   - clamping is against the document rectangle (`scrollHeight`/`scrollWidth`)
//     so the card can be dragged below the fold without escaping the page.
//
// Returned values are wired up by the consumer as:
//   <div ref={rootRef} style={{ position:'absolute', left: docPos.x, top: docPos.y }}>
//     <header {...handleProps} />   // drag handle (cursor reflects `dragging`)
//     <body>{children}</body>
//   </div>

interface Position {
  x: number;
  y: number;
}

const EDGE_PADDING = 8;
const DRAG_THRESHOLD_PX = 4;
const MIN_HEIGHT_GUESS = 320;

function docHeight(): number {
  if (typeof document === "undefined") return 0;
  return Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  );
}

function docWidth(): number {
  if (typeof document === "undefined") return 0;
  return Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  );
}

function clampToDocument(
  pos: Position,
  width: number,
  height: number,
): Position {
  if (typeof window === "undefined") return pos;
  const maxX = Math.max(EDGE_PADDING, docWidth() - width - EDGE_PADDING);
  const maxY = Math.max(EDGE_PADDING, docHeight() - height - EDGE_PADDING);
  return {
    x: Math.max(EDGE_PADDING, Math.min(pos.x, maxX)),
    y: Math.max(EDGE_PADDING, Math.min(pos.y, maxY)),
  };
}

interface UseDraggableDocPosOptions {
  storageKey: string;
  anchorId: string;
  width: number;
}

interface UseDraggableDocPosReturn {
  docPos: Position | null;
  dragging: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
  handleProps: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: () => void;
  };
}

export function useDraggableDocPos({
  storageKey,
  anchorId,
  width,
}: UseDraggableDocPosOptions): UseDraggableDocPosReturn {
  const [docPos, setDocPos] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  // Bootstrap initial position on mount. useLayoutEffect runs synchronously
  // before paint so there's no visible flash at (0, 0).
  useLayoutEffect(() => {
    let initial: Position | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.x === "number" &&
          typeof parsed.y === "number"
        ) {
          initial = { x: parsed.x, y: parsed.y };
        }
      }
    } catch {
      // ignore corrupt storage
    }
    if (!initial) {
      const anchor = document.getElementById(anchorId);
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        initial = {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
        };
      } else {
        // Fall back to a hero-area-ish default if the anchor is missing.
        initial = {
          x: Math.min(window.innerWidth * 0.6, window.innerWidth - width - 32),
          y: window.scrollY + 200,
        };
      }
    }
    setDocPos(
      clampToDocument(
        initial,
        width,
        rootRef.current?.offsetHeight ?? MIN_HEIGHT_GUESS,
      ),
    );
  }, [storageKey, anchorId, width]);

  // Re-clamp on viewport resize.
  useEffect(() => {
    if (!docPos) return;
    const onResize = () => {
      const height = rootRef.current?.offsetHeight ?? MIN_HEIGHT_GUESS;
      setDocPos((p) => (p ? clampToDocument(p, width, height) : null));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [docPos, width]);

  // Persist on change.
  useEffect(() => {
    if (!docPos) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(docPos));
    } catch {
      // ignore
    }
  }, [docPos, storageKey]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("a, button, [data-no-drag]")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = rootRef.current?.getBoundingClientRect();
      const startX =
        docPos?.x ?? (rect ? rect.left + window.scrollX : 0);
      const startY =
        docPos?.y ?? (rect ? rect.top + window.scrollY : 0);
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX,
        startY,
        moved: false,
      };
    },
    [docPos],
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
      const height = rootRef.current?.offsetHeight ?? MIN_HEIGHT_GUESS;
      setDocPos(
        clampToDocument(
          { x: drag.startX + dx, y: drag.startY + dy },
          width,
          height,
        ),
      );
    },
    [width],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [],
  );

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  return {
    docPos,
    dragging,
    rootRef,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
