import { describe, it, expect } from "vitest";
import { parseRSSText } from "./parser";

// RSS with image in standard <image><url> format (jsdom-compatible)
const VALID_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Podcast</title>
    <description>A test podcast for unit tests</description>
    <image>
      <url>https://example.com/cover.jpg</url>
    </image>
    <item>
      <title>Episode 1</title>
      <description>First episode description</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/>
      <guid>ep1-guid</guid>
    </item>
    <item>
      <title>Episode 2</title>
      <description>Second episode description</description>
      <pubDate>Mon, 08 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep2.mp3" type="audio/mpeg"/>
      <guid>ep2-guid</guid>
    </item>
  </channel>
</rss>`;

const RSS_WITH_HTML_DESCRIPTION = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>HTML Test</title>
    <description>Test</description>
    <item>
      <title>Episode with HTML</title>
      <description>&lt;p&gt;This is &lt;strong&gt;bold&lt;/strong&gt; text&lt;/p&gt;</description>
      <enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

const RSS_WITHOUT_GUID = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>No GUID Test</title>
    <description>Test</description>
    <item>
      <title>Episode without GUID</title>
      <description>No guid here</description>
      <enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

const INVALID_XML = `not valid xml at all`;

const RSS_WITHOUT_CHANNEL = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>`;

describe("parseRSSText", () => {
  it("parses a valid RSS feed", () => {
    const feed = parseRSSText(VALID_RSS, "https://example.com/feed.xml");

    expect(feed.title).toBe("Test Podcast");
    expect(feed.description).toBe("A test podcast for unit tests");
    expect(feed.image).toBe("https://example.com/cover.jpg");
    expect(feed.url).toBe("https://example.com/feed.xml");
    expect(feed.items).toHaveLength(2);
  });

  it("parses episode details correctly", () => {
    const feed = parseRSSText(VALID_RSS, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.title).toBe("Episode 1");
    expect(episode.description).toBe("First episode description");
    expect(episode.enclosureUrl).toBe("https://example.com/ep1.mp3");
    expect(episode.guid).toBe("ep1-guid");
    expect(episode.pubDate).toBe("Mon, 01 Jan 2024 00:00:00 GMT");
    // Duration is optional (itunes:duration namespace)
    expect(episode.duration).toBeDefined();
  });

  it("strips HTML from descriptions", () => {
    const feed = parseRSSText(RSS_WITH_HTML_DESCRIPTION, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.description).toBe("This is bold text");
    expect(episode.description).not.toContain("<");
    expect(episode.description).not.toContain(">");
  });

  it("handles episodes without guid", () => {
    const feed = parseRSSText(RSS_WITHOUT_GUID, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.guid).toBeUndefined();
    expect(episode.enclosureUrl).toBe("https://example.com/ep.mp3");
  });

  it("uses feed image as fallback for episode image", () => {
    const feed = parseRSSText(VALID_RSS, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.image).toBe("https://example.com/cover.jpg");
  });

  it("throws error for invalid XML", () => {
    expect(() => parseRSSText(INVALID_XML, "https://example.com/feed.xml")).toThrow(
      "Format RSS invalide"
    );
  });

  it("throws error for RSS without channel", () => {
    expect(() => parseRSSText(RSS_WITHOUT_CHANNEL, "https://example.com/feed.xml")).toThrow(
      "Format RSS invalide: pas de channel"
    );
  });

  it("handles empty feed gracefully", () => {
    const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Empty Feed</title>
        <description>No episodes</description>
      </channel>
    </rss>`;

    const feed = parseRSSText(emptyFeed, "https://example.com/feed.xml");

    expect(feed.title).toBe("Empty Feed");
    expect(feed.items).toHaveLength(0);
  });

  it("truncates long descriptions to 200 characters", () => {
    const longDescription = "A".repeat(300);
    const rssWithLongDesc = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Test</title>
        <description>Test</description>
        <item>
          <title>Long Description</title>
          <description>${longDescription}</description>
          <enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/>
        </item>
      </channel>
    </rss>`;

    const feed = parseRSSText(rssWithLongDesc, "https://example.com/feed.xml");
    expect(feed.items[0].description.length).toBe(200);
  });
});
