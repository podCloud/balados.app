import { describe, expect, it } from "vitest";
import { renderShowNotes } from "./renderShowNotes";

describe("renderShowNotes", () => {
  it("keeps external links with target and rel, and strips scripts", () => {
    const description =
      '<p>Visit <a href="https://example.com" target="_blank" rel="noopener">our site</a></p>' +
      '<script>alert("xss")</script>';

    const html = renderShowNotes(description);

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
  });

  it("renders markdown to html", () => {
    expect(renderShowNotes("**bold** text")).toContain("<strong>bold</strong>");
  });

  it("returns an empty string for an empty description", () => {
    expect(renderShowNotes("")).toBe("");
  });
});
