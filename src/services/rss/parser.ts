import type { PodcastFeed, Episode } from "../../types";
import { fetchWithProxy } from "./proxyManager";
import { getCachedFeed, cacheFeed } from "../storage";

const getElementText = (parent: Element, tag: string): string => {
  const el = parent.querySelector(tag);
  return el?.textContent || "";
};

const parseEpisode = (item: Element, feedImage: string): Episode => {
  const enclosure = item.querySelector("enclosure");
  const duration = getElementText(item, "itunes\\:duration");
  const itemImage =
    item.querySelector("itunes\\:image")?.getAttribute("href") || feedImage;

  // Get guid or fall back to enclosure URL
  const guidEl = item.querySelector("guid");
  const guid = guidEl?.textContent || undefined;

  // Clean description from HTML tags
  const rawDescription = getElementText(item, "description");
  const cleanDescription = rawDescription
    .replace(/<[^>]*>/g, "")
    .substring(0, 200);

  return {
    title: getElementText(item, "title"),
    description: cleanDescription,
    pubDate: getElementText(item, "pubDate"),
    enclosureUrl: enclosure?.getAttribute("url") || "",
    duration: duration || "",
    image: itemImage,
    guid,
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
      console.log("Feed charge depuis le cache:", cached.title);
      return cached;
    }
  }

  // Fetch with proxy fallback
  const { text } = await fetchWithProxy(url);

  // Parse the RSS
  const feed = parseRSSText(text, url);

  // Cache the result
  await cacheFeed(url, feed);

  console.log("Feed parse avec succes:", feed.title, feed.items.length, "episodes");
  return feed;
};
