import type { ProxyConfig } from "../../types";
import { encodeRssFeed } from "../../utils/rssEncoding";
import { getSettings } from "../storage";

export interface FetchResult {
  text: string;
  proxyUsed: string | null;
}

// Fetch URL with proxy fallback strategy
export const fetchWithProxy = async (url: string): Promise<FetchResult> => {
  const settings = await getSettings();
  const enabledProxies = settings.proxies
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  // Try direct fetch first
  try {
    const response = await fetch(url);
    if (response.ok) {
      const text = await response.text();
      return { text, proxyUsed: null };
    }
  } catch {
    // Direct fetch failed, try proxies
  }

  // Try sync server proxy if configured
  if (settings.syncServerUrl && settings.syncToken) {
    try {
      const syncProxyUrl = `${settings.syncServerUrl.replace(/\/$/, "")}/api/v1/rss/proxy/${encodeRssFeed(url)}`;
      const response = await fetch(syncProxyUrl, {
        headers: { Authorization: `Bearer ${settings.syncToken}` },
      });
      if (response.ok) {
        const text = await response.text();
        return { text, proxyUsed: "Sync Server" };
      }
    } catch {
      // Sync server proxy failed, try public proxies
    }
  }

  // Try each proxy in order
  for (const proxy of enabledProxies) {
    try {
      const proxyUrl = `${proxy.url}${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        const text = await response.text();
        return { text, proxyUsed: proxy.name };
      }
    } catch {
      // Proxy failed, try next one
    }
  }

  throw new Error("Impossible de recuperer le flux RSS");
};

// Add a custom proxy
export const createProxyConfig = (
  url: string,
  name: string,
  priority: number = 10,
): ProxyConfig => ({
  url,
  name,
  enabled: true,
  priority,
});

// Default proxies
export const DEFAULT_PROXIES: ProxyConfig[] = [
  {
    url: "https://api.allorigins.win/raw?url=",
    name: "AllOrigins",
    enabled: true,
    priority: 1,
  },
  {
    url: "https://corsproxy.io/?",
    name: "CORS Proxy",
    enabled: true,
    priority: 2,
  },
  {
    url: "https://cors-anywhere.herokuapp.com/",
    name: "CORS Anywhere",
    enabled: false, // Often requires manual activation
    priority: 3,
  },
];
