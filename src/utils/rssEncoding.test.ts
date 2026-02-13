import { describe, it, expect } from "vitest";
import {
  toBase64Url,
  fromBase64Url,
  encodeRssFeed,
  decodeRssFeed,
  encodeRssItem,
  decodeRssItem,
  generateEpisodeId,
} from "./rssEncoding";

describe("toBase64Url / fromBase64Url", () => {
  it("encodes to URL-safe base64 without padding", () => {
    const encoded = toBase64Url("test");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });

  it("round-trips correctly", () => {
    const input = "https://example.com/feed.xml?param=value&other=123";
    expect(fromBase64Url(toBase64Url(input))).toBe(input);
  });

  it("replaces + with - and / with _", () => {
    // "n>>" encodes to "bj4+" in standard base64
    const encoded = toBase64Url("n>>");
    expect(encoded).toBe(btoa("n>>").replace(/\+/g, "-").replace(/=+$/, ""));
  });

  it("decodes standard base64 with padding", () => {
    // fromBase64Url should also handle standard base64
    const standard = btoa("hello");
    expect(fromBase64Url(standard)).toBe("hello");
  });
});

describe("encodeRssFeed / decodeRssFeed", () => {
  it("encodes and decodes a feed URL", () => {
    const feedUrl = "https://example.com/feed.xml";
    const encoded = encodeRssFeed(feedUrl);
    expect(decodeRssFeed(encoded)).toBe(feedUrl);
  });

  it("produces URL-safe output", () => {
    const feedUrl = "https://example.com/feed.xml?param=value";
    const encoded = encodeRssFeed(feedUrl);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });
});

describe("encodeRssItem / decodeRssItem", () => {
  it("encodes and decodes an episode", () => {
    const guid = "episode-123";
    const enclosureUrl = "https://example.com/episode.mp3";
    const encoded = encodeRssItem(guid, enclosureUrl);
    const decoded = decodeRssItem(encoded);
    expect(decoded.guid).toBe(guid);
    expect(decoded.enclosureUrl).toBe(enclosureUrl);
  });

  it("handles guid containing commas", () => {
    const guid = "guid,with,commas";
    const enclosureUrl = "https://example.com/episode.mp3";
    const encoded = encodeRssItem(guid, enclosureUrl);
    const decoded = decodeRssItem(encoded);
    expect(decoded.guid).toBe(guid);
    expect(decoded.enclosureUrl).toBe(enclosureUrl);
  });

  it("throws on invalid format (no comma)", () => {
    const invalid = toBase64Url("no-comma-here");
    expect(() => decodeRssItem(invalid)).toThrow("missing comma separator");
  });
});

describe("generateEpisodeId", () => {
  it("generates ID from guid and enclosureUrl", () => {
    const id = generateEpisodeId("my-guid", "https://example.com/ep.mp3");
    const decoded = decodeRssItem(id);
    expect(decoded.guid).toBe("my-guid");
    expect(decoded.enclosureUrl).toBe("https://example.com/ep.mp3");
  });

  it("falls back to enclosureUrl when guid is undefined", () => {
    const url = "https://example.com/ep.mp3";
    const id = generateEpisodeId(undefined, url);
    const decoded = decodeRssItem(id);
    expect(decoded.guid).toBe(url);
    expect(decoded.enclosureUrl).toBe(url);
  });

  it("produces same output as encodeRssItem when guid is provided", () => {
    const guid = "my-guid";
    const url = "https://example.com/ep.mp3";
    expect(generateEpisodeId(guid, url)).toBe(encodeRssItem(guid, url));
  });

  it("produces URL-safe output", () => {
    const id = generateEpisodeId("guid", "https://example.com/ep.mp3");
    expect(id).not.toContain("+");
    expect(id).not.toContain("/");
    expect(id).not.toContain("=");
  });
});
