// URL-safe base64 encoding (RFC 4648 §5)
// Replaces + with -, / with _, strips = padding

export const toBase64Url = (str: string): string => {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromBase64Url = (encoded: string): string => {
  // Convert URL-safe chars back to standard base64
  const standard = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return atob(standard);
};

// Feed URL encoding

export const encodeRssFeed = (feedUrl: string): string => {
  return toBase64Url(feedUrl);
};

export const decodeRssFeed = (encoded: string): string => {
  return fromBase64Url(encoded);
};

// Episode encoding (guid + enclosureUrl)

export const encodeRssItem = (guid: string, enclosureUrl: string): string => {
  return toBase64Url(`${guid},${enclosureUrl}`);
};

// Decode with lastIndexOf because guid might contain commas (RFC 3986: URLs don't)
export const decodeRssItem = (encoded: string): { guid: string; enclosureUrl: string } => {
  const decoded = fromBase64Url(encoded);
  const commaIndex = decoded.lastIndexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid rss_source_item format: missing comma separator");
  }
  return {
    guid: decoded.substring(0, commaIndex),
    enclosureUrl: decoded.substring(commaIndex + 1),
  };
};

// Generate episode ID from guid and enclosure URL
// Falls back to enclosureUrl as identifier when guid is missing
export const generateEpisodeId = (guid: string | undefined, enclosureUrl: string): string => {
  const identifier = guid || enclosureUrl;
  return toBase64Url(`${identifier},${enclosureUrl}`);
};
