import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownDocument } from "./MarkdownDocument";

describe("MarkdownDocument", () => {
  it("keeps indented continuation lines inside list items", () => {
    const html = renderToStaticMarkup(
      <MarkdownDocument
        source={[
          "- First item wraps onto",
          "  another line.",
          "- Second item.",
          "",
          "1. Ordered item wraps onto",
          "   another ordered line.",
          "2. Next ordered item.",
        ].join("\n")}
      />,
    );

    expect(html).toContain("First item wraps onto another line.");
    expect(html).toContain("Ordered item wraps onto another ordered line.");
    expect(html.match(/<li/g)).toHaveLength(4);
    expect(html).not.toContain("<p>another line.");
    expect(html).not.toContain("<p>another ordered line.");
  });
});
