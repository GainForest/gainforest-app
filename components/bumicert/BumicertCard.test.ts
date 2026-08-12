import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextPill } from "./BumicertCard";

describe("TextPill", () => {
  it("exposes the localized overflow label without naming a generic span", () => {
    const html = renderToStaticMarkup(
      createElement(TextPill, {
        text: "+2",
        emphasis: true,
        ariaLabel: "2 more objectives",
      }),
    );

    expect(html).not.toContain("aria-label");
    expect(html).toContain('aria-hidden="true">+2</span>');
    expect(html).toContain('<span class="sr-only">2 more objectives</span>');
  });
});
