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

  it("drops event handler attributes but keeps the image source", () => {
    const html = renderShowNotes('<img src="https://example.com/a.jpg" onerror="alert(1)">');

    expect(html).toContain('src="https://example.com/a.jpg"');
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(");
  });

  it("drops javascript: links", () => {
    const html = renderShowNotes('<a href="javascript:alert(1)">x</a>');

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("href=");
  });

  it("strips iframes and inline styles", () => {
    const html = renderShowNotes(
      '<iframe src="https://example.com/embed"></iframe><p style="color:red">text</p>',
    );

    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("style=");
    expect(html).toContain("<p>text</p>");
  });

  it("keeps image dimensions", () => {
    const html = renderShowNotes('<img src="https://example.com/a.jpg" width="100" height="50">');

    expect(html).toContain('width="100"');
    expect(html).toContain('height="50"');
  });

  it("renders markdown to html", () => {
    expect(renderShowNotes("**bold** text")).toContain("<strong>bold</strong>");
  });

  it("returns an empty string for an empty description", () => {
    expect(renderShowNotes("")).toBe("");
  });
});
