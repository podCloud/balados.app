import { describe, expect, it, vi } from "vitest";
import { formatRelativeTime, getFallbackTitle } from "./formatting";

describe("getFallbackTitle", () => {
  it("returns the hostname for a valid URL", () => {
    expect(getFallbackTitle("https://example.com/feed.xml")).toBe("example.com");
  });

  it("truncates and returns the raw string for an invalid URL", () => {
    const long = `not-a-url-${"x".repeat(60)}`;
    expect(getFallbackTitle(long)).toBe(`${long.slice(0, 50)}...`);
  });

  it("returns the raw string as-is when invalid and short", () => {
    expect(getFallbackTitle("not-a-url")).toBe("not-a-url");
  });
});

describe("formatRelativeTime", () => {
  const t = vi.fn((key: string, opts?: Record<string, unknown>) => {
    if (key === "syncSettings.justNow") return "just now";
    if (key === "syncSettings.minutesAgo") return `${opts?.count}m ago`;
    if (key === "syncSettings.hoursAgo") return `${opts?.count}h ago`;
    if (key === "syncSettings.daysAgo") return `${opts?.count}d ago`;
    return key;
  });

  it("returns 'just now' for under a minute", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 30_000, t, now)).toBe("just now");
  });

  it("returns minutes for under an hour", () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 5 * 60 * 1000, t, now)).toBe("5m ago");
  });

  it("returns hours for under a day", () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 3 * 60 * 60 * 1000, t, now)).toBe("3h ago");
  });

  it("returns days for a day or more", () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60 * 1000, t, now)).toBe("2d ago");
  });
});
