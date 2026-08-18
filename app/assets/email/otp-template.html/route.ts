import { NextRequest } from "next/server";
import {
  renderOtpEmailTemplate,
  resolveEmailTemplateLocale,
} from "@/lib/email/otp-template";
import { LOCALE_REQUEST_HEADER_NAME } from "@/lib/i18n/routing";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Response {
  const locale = resolveEmailTemplateLocale({
    explicitLocale: request.headers.get(LOCALE_REQUEST_HEADER_NAME),
    acceptLanguage: request.headers.get("accept-language"),
  });

  return new Response(renderOtpEmailTemplate(locale), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600",
      vary: `Accept-Language, ${LOCALE_REQUEST_HEADER_NAME}`,
    },
  });
}
