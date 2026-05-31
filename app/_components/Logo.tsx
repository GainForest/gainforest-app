/**
 * The official GainForest "G leaf" mark, rendered as a CSS mask so the
 * artwork follows `currentColor`. Ported verbatim from gainforest-app's
 * Logo.tsx — same `/decor/gainforest-logo.svg`, same mask technique.
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
