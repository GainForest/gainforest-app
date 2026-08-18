import { NextRequest } from "next/server";
import {
  renderWelcomeEmailTemplate,
  resolveWelcomeEmailLocale,
  type WelcomeEmailVariant,
} from "@/lib/email/welcome-template";
import { LOCALE_REQUEST_HEADER_NAME } from "@/lib/i18n/routing";

export const dynamic = "force-dynamic";

function parseVariant(value: string | null): WelcomeEmailVariant | null {
  return value === "direct-signup" || value === "organization-invite" ? value : null;
}

export function GET(request: NextRequest): Response {
  const variant = parseVariant(request.nextUrl.searchParams.get("variant")) ?? "direct-signup";
  const locale = resolveWelcomeEmailLocale({
    explicitLocale: request.nextUrl.searchParams.get("locale") ?? request.headers.get(LOCALE_REQUEST_HEADER_NAME),
    acceptLanguage: request.headers.get("accept-language"),
  });
  const organizationName = request.nextUrl.searchParams.get("organizationName") ?? undefined;
  const name = request.nextUrl.searchParams.get("name") ?? undefined;
  const siteUrl = request.nextUrl.searchParams.get("siteUrl") ?? undefined;
  const communityFormUrl = request.nextUrl.searchParams.get("communityFormUrl") ?? undefined;
  const invitedByName = request.nextUrl.searchParams.get("invitedByName") ?? undefined;
  const invitedByEmail = request.nextUrl.searchParams.get("invitedByEmail") ?? undefined;

  const rendered = renderWelcomeEmailTemplate({
    variant,
    locale,
    name,
    organizationName,
    siteUrl,
    communityFormUrl,
    invitedByName,
    invitedByEmail,
  });

  return new Response(rendered.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      vary: `Accept-Language, ${LOCALE_REQUEST_HEADER_NAME}`,
      "x-email-subject": encodeURIComponent(rendered.subject),
    },
  });
}
