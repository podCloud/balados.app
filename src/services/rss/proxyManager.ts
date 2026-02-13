import { getSettings } from "../storage";
import type { ProxyConfig } from "../../types";

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
    console.log(`Tentative directe sans proxy: ${url}`);
    const response = await fetch(url);
    if (response.ok) {
      const text = await response.text();
      console.log("Succes en direct sans proxy!");
      return { text, proxyUsed: null };
    }
  } catch (e) {
    const error = e as Error;
    console.log("Echec en direct:", error.message);
  }

  // Try sync server proxy if configured
  if (settings.syncServerUrl && settings.syncToken) {
    try {
      const syncProxyUrl = `${settings.syncServerUrl.replace(/\/$/, "")}/api/v1/rss/proxy/${encodeURIComponent(btoa(url))}`;
      console.log("Tentative avec Sync Server proxy");
      const response = await fetch(syncProxyUrl, {
        headers: { Authorization: `Bearer ${settings.syncToken}` },
      });
      if (response.ok) {
        const text = await response.text();
        console.log("Succes avec Sync Server proxy!");
        return { text, proxyUsed: "Sync Server" };
      } else {
        console.log(`Sync Server proxy echec: status ${response.status}`);
      }
    } catch (e) {
      console.log("Echec avec Sync Server proxy:", (e as Error).message);
    }
  }

  // Try each proxy in order
  for (const proxy of enabledProxies) {
    try {
      console.log(`Tentative avec proxy ${proxy.name}`);
      const proxyUrl = `${proxy.url}${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        const text = await response.text();
        console.log(`Succes avec ${proxy.name}`);
        return { text, proxyUsed: proxy.name };
      }
    } catch (e) {
      const error = e as Error;
      console.log(`Echec avec ${proxy.name}:`, error.message);
      continue;
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
