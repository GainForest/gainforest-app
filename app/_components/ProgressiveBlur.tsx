import { cn } from "@/lib/utils";

/**
 * A layered "progressive" blur band — a stack of backdrop-blur spans, each
 * masked by a linear gradient, so the blur ramps up gradually toward one edge
 * instead of a hard cut. Used behind the app header and the phone feed
 * composer bar to lift them off the content scrolling underneath.
 *
 * Renders absolutely-positioned inside a `relative`/`fixed` parent. Pair it
 * with a matching background gradient (see callers) for a scrim + blur combo.
 */
export function ProgressiveBlur({
  className,
  height = "30%",
  position = "bottom",
  blurLevels = [1, 4, 10, 20],
}: {
  className?: string;
  height?: string;
  position?: "top" | "bottom" | "both";
  blurLevels?: number[];
}) {
  const renderStack = (stackPosition: "top" | "bottom") => {
    const direction = stackPosition === "top" ? "to top" : "to bottom";
    const step = 100 / (blurLevels.length + 1);

    return blurLevels.map((blur, index) => {
      const fadeStart = index * step;
      const fadeEnd = (index + 1) * step;
      const mask = `linear-gradient(${direction}, transparent ${fadeStart}%, #000 ${fadeEnd}%)`;

      return (
        <span
          key={`${stackPosition}-${index}`}
          style={{
            gridArea: "1 / 1",
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
            maskImage: mask,
            WebkitMaskImage: mask,
          }}
        />
      );
    });
  };

  if (position === "both") {
    return (
      <>
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 grid", className)} style={{ height }}>
          {renderStack("top")}
        </div>
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-10 grid", className)} style={{ height }}>
          {renderStack("bottom")}
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 grid",
        position === "top" ? "top-0" : "bottom-0",
        className,
      )}
      style={{ height }}
    >
      {renderStack(position)}
    </div>
  );
}
