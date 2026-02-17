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
      <link>https://example.com/ep1</link>
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

const RSS_WITH_LINKS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Links Test</title>
    <description>Test</description>
    <item>
      <title>Episode with links</title>
      <description>&lt;p&gt;Visit &lt;a href="https://example.com"&gt;our site&lt;/a&gt; for more&lt;/p&gt;</description>
      <enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

const RSS_WITH_IMAGES = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Images Test</title>
    <description>Test</description>
    <item>
      <title>Episode with images</title>
      <description>&lt;p&gt;Look at this:&lt;/p&gt;&lt;img src="https://example.com/photo.jpg" alt="A photo"/&gt;</description>
      <enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

const RSS_WITH_SCRIPT = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Script Test</title>
    <description>Test</description>
    <item>
      <title>Episode with script</title>
      <description>&lt;p&gt;Safe content&lt;/p&gt;&lt;script&gt;alert("xss")&lt;/script&gt;&lt;style&gt;body{display:none}&lt;/style&gt;</description>
      <enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

const RSS_WITH_CONTENT_ENCODED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Content Encoded Test</title>
    <description>Test</description>
    <item>
      <title>Episode with content:encoded</title>
      <description>Short plain description</description>
      <content:encoded><![CDATA[<h2>Rich Show Notes</h2><p>This is the <strong>full</strong> content with <a href="https://example.com">links</a>.</p>]]></content:encoded>
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
    expect(episode.descriptionPreview).toBe("First episode description");
    expect(episode.enclosureUrl).toBe("https://example.com/ep1.mp3");
    expect(episode.guid).toBe("ep1-guid");
    expect(episode.pubDate).toBe("Mon, 01 Jan 2024 00:00:00 GMT");
    expect(episode.duration).toBeDefined();
  });

  it("extracts episode link", () => {
    const feed = parseRSSText(VALID_RSS, "https://example.com/feed.xml");
    expect(feed.items[0].link).toBe("https://example.com/ep1");
    expect(feed.items[1].link).toBeUndefined();
  });

  it("converts HTML to markdown", () => {
    const feed = parseRSSText(RSS_WITH_HTML_DESCRIPTION, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.description).toContain("**bold**");
    expect(episode.description).not.toContain("<p>");
    expect(episode.description).not.toContain("<strong>");
  });

  it("converts HTML links to markdown links", () => {
    const feed = parseRSSText(RSS_WITH_LINKS, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.description).toContain("[our site](https://example.com)");
  });

  it("converts HTML images to markdown images", () => {
    const feed = parseRSSText(RSS_WITH_IMAGES, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.description).toContain("![A photo](https://example.com/photo.jpg)");
  });

  it("strips script and style tags", () => {
    const feed = parseRSSText(RSS_WITH_SCRIPT, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.description).toContain("Safe content");
    expect(episode.description).not.toContain("alert");
    expect(episode.description).not.toContain("script");
    expect(episode.description).not.toContain("display:none");
  });

  it("prefers content:encoded over description", () => {
    const feed = parseRSSText(RSS_WITH_CONTENT_ENCODED, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.description).toContain("Rich Show Notes");
    expect(episode.description).toContain("[links](https://example.com)");
    expect(episode.description).not.toBe("Short plain description");
  });

  it("generates plain text descriptionPreview", () => {
    const feed = parseRSSText(RSS_WITH_CONTENT_ENCODED, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.descriptionPreview).not.toContain("[");
    expect(episode.descriptionPreview).not.toContain("](");
    expect(episode.descriptionPreview).not.toContain("**");
    expect(episode.descriptionPreview).not.toContain("##");
    expect(episode.descriptionPreview).toContain("Rich Show Notes");
    expect(episode.descriptionPreview).toContain("links");
  });

  it("passes plain text through unchanged", () => {
    const feed = parseRSSText(VALID_RSS, "https://example.com/feed.xml");
    const episode = feed.items[0];

    expect(episode.description).toBe("First episode description");
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

  it("does not truncate long descriptions", () => {
    const longDescription = "A".repeat(500);
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
    // Full markdown description is preserved (no 200-char truncation)
    expect(feed.items[0].description.length).toBe(500);
    // Preview is truncated with ellipsis at ~300 chars
    expect(feed.items[0].descriptionPreview.length).toBeLessThanOrEqual(301);
    expect(feed.items[0].descriptionPreview).toContain("…");
  });
});
