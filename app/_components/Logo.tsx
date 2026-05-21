/**
 * The official GainForest "G leaf" mark.
 *
 * We render the real `/decor/gainforest-logo.svg` (copied verbatim from
 * green_globe → `public/assets/logo.webp` and bumicerts →
 * `public/assets/media/images/gainforest-logo.svg`) as a CSS mask, so the
 * artwork is pixel-faithful to what data.gainforest.app and certs.gainforest.app
 * ship, and the colour follows `currentColor`. That makes the same component
 * usable in the cream navbar (`text-primary`), inside the dark globe card
 * (`text-white`), and so on.
 */
export function LogoMark({
  className = "h-7 w-7",
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`inline-block bg-current ${className}`}
      style={{
        WebkitMaskImage: "url(/decor/gainforest-logo.svg)",
        maskImage: "url(/decor/gainforest-logo.svg)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
