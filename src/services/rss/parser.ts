import TurndownService from "turndown";
import type { PodcastFeed, Episode } from "../../types";
import { fetchWithProxy } from "./proxyManager";
import { getCachedFeed, cacheFeed } from "../storage";

const createTurndown = () => {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Remove script, style, iframe tags completely
  td.addRule("removeUnsafe", {
    filter: ["script", "style", "iframe"],
    replacement: () => "",
  });

  return td;
};

// Intentional singleton — rules are set once at module load. Do not mutate after creation.
const turndown = createTurndown();

const getElementText = (parent: Element, tag: string): string => {
  const el = parent.querySelector(tag);
  return el?.textContent || "";
};

const getContentEncoded = (item: Element): string | null => {
  // content:encoded uses a namespace — try both selector forms
  const el =
    item.querySelector("content\\:encoded") ??
    item.getElementsByTagName("content:encoded")[0];
  return el?.textContent || null;
};

const htmlToMarkdown = (html: string): string => {
  if (!html.trim()) return "";
  // If content has no HTML tags, it's plain text — return as-is
  if (!/<[a-z][\s\S]*>/i.test(html)) return html.trim();
  return turndown.turndown(html).trim();
};

const makePlainPreview = (markdown: string, maxLength = 300): string => {
  if (!markdown) return "";
  // Strip markdown syntax for a plain-text preview
  const plain = markdown
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1") // images → alt text
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1") // links → text
    .replace(/#{1,6}\s+/g, "") // headings
    .replace(/^>\s+/gm, "") // blockquote markers
    .replace(/[*_~`]+/g, "") // emphasis/code
    .replace(/\n{2,}/g, " ") // collapse newlines
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ") // collapse multiple spaces
    .trim();
  if (plain.length <= maxLength) return plain;
  // Break at last word boundary to avoid mid-word truncation
  const truncated = plain.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxLength * 0.8 ? truncated.substring(0, lastSpace) : truncated) + "…";
};

const parseEpisode = (item: Element, feedImage: string): Episode => {
  const enclosure = item.querySelector("enclosure");
  const duration = getElementText(item, "itunes\\:duration");
  const itemImage =
    item.querySelector("itunes\\:image")?.getAttribute("href") || feedImage;

  // Get guid or fall back to enclosure URL
  const guidEl = item.querySelector("guid");
  const guid = guidEl?.textContent || undefined;

  // Get episode link — querySelector is scoped to the <item> element,
  // so it won't match <channel>-level <link> elements.
  const link = getElementText(item, "link") || undefined;

  // Prefer content:encoded (richer) over description
  const contentEncoded = getContentEncoded(item);
  const rawDescription = getElementText(item, "description");
  const htmlContent = contentEncoded || rawDescription;

  // Convert HTML to markdown
  const description = htmlToMarkdown(htmlContent);
  const descriptionPreview = makePlainPreview(description);

  return {
    title: getElementText(item, "title"),
    description,
    descriptionPreview,
    pubDate: getElementText(item, "pubDate"),
    enclosureUrl: enclosure?.getAttribute("url") || "",
    duration: duration || "",
    image: itemImage,
    guid,
    link,
  };
};

export const parseRSSText = (text: string, url: string): PodcastFeed => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");

  // Check for parse errors
  const parseError = xml.querySelector("parsererror");
  if (parseError) {
    throw new Error("Format RSS invalide");
  }

  const channel = xml.querySelector("channel");
  if (!channel) {
    throw new Error("Format RSS invalide: pas de channel");
  }

  const title = getElementText(channel, "title");
  const description = getElementText(channel, "description");
  const image =
    channel.querySelector("image url")?.textContent ||
    channel.querySelector("itunes\\:image")?.getAttribute("href") ||
    "";

  const items = Array.from(xml.querySelectorAll("item")).map((item) =>
    parseEpisode(item, image),
  );

  return { title, description, image, items, url };
};

export const fetchAndParseRSS = async (
  url: string,
  options?: { useCache?: boolean },
): Promise<PodcastFeed> => {
  const useCache = options?.useCache !== false;

  // Check cache first
  if (useCache) {
    const cached = await getCachedFeed(url);
    if (cached) {
      return cached;
    }
  }

  // Fetch with proxy fallback
  const { text } = await fetchWithProxy(url);

  // Parse the RSS
  const feed = parseRSSText(text, url);

  // Cache the result
  await cacheFeed(url, feed);

  return feed;
};
