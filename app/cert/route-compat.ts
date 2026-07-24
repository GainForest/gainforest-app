export const CERT_DETAIL_TABS = ["overview", "site-boundaries", "reviews", "donations", "timeline"] as const;

export type CertDetailTab = (typeof CERT_DETAIL_TABS)[number];
export type RouteSearchParams = Record<string, string | string[] | undefined>;

export function validatedCertTab(value: string | string[] | undefined): CertDetailTab | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return CERT_DETAIL_TABS.find((tab) => tab === candidate) ?? null;
}

export function canonicalCertAliasHref(pathname: string, searchParams: RouteSearchParams): string {
  const tab = validatedCertTab(searchParams.tab);
  if (!tab || tab === "overview") return pathname;
  return `${pathname}?${new URLSearchParams({ tab }).toString()}`;
}

export function parentProjectHref(pathname: string, tab: CertDetailTab): string {
  switch (tab) {
    case "site-boundaries":
      return `${pathname}?tab=places`;
    case "timeline":
      return `${pathname}?tab=updates`;
    case "reviews":
      return `${pathname}?tab=reviews`;
    case "donations":
      return `${pathname}#support`;
    case "overview":
    default:
      return pathname;
  }
}
