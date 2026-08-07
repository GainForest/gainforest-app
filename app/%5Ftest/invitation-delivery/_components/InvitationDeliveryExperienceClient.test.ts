import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { InvitationActionNotice } from "./InvitationDeliveryExperienceClient";

describe("InvitationActionNotice", () => {
  it("exposes dynamic action feedback as a polite status", () => {
    const html = renderToStaticMarkup(createElement(InvitationActionNotice, { notice: "Invitation link copied." }));

    expect(html).toContain('role="status"');
    expect(html).toContain("Invitation link copied.");
  });
});
