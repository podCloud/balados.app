import type { ProxyConfig } from "../../types";
import { encodeRssFeed } from "../../utils/rssEncoding";
import { getSettings } from "../storage";
import { notifySyncAuthError } from "../sync/authEvents";
import { SyncApiError, SyncClient } from "../sync/client";

export interface FetchResult {
  text: string;
  proxyUsed: string | null;
}

/** The sync server rejected our token (401/403) and it could not be refreshed. */
export class SyncProxyAuthError extends SyncApiError {
  readonly status = 401;

  constructor() {
    super("Sync server rejected the token; reconnect the sync server", 401, false);
    this.name = "SyncProxyAuthError";
  }
}

/** The sync server rate-limited the proxy (429). */
export class SyncProxyRateLimitError extends SyncApiError {
  readonly status = 429;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Sync server proxy rate limited; retry in ${retryAfterSeconds}s`, 429, true);
    this.name = "SyncProxyRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_BACKOFF_MS = 30_000;
/** Longest Retry-After we are willing to wait for (and retry on). */
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_QUERY_RETRIES = 2;

/** TanStack Query `retry`: never retry a dead token or a long rate limit. */
export const rssQueryRetry = (failureCount: number, error: unknown): boolean => {
  if (error instanceof SyncProxyAuthError) return false;
  if (
    error instanceof SyncProxyRateLimitError &&
    error.retryAfterSeconds * 1000 > MAX_RETRY_AFTER_MS
  ) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
};

/** TanStack Query `retryDelay` honouring Retry-After (capped) for proxy rate limits. */
export const rssQueryRetryDelay = (failureCount: number, error: unknown): number => {
  if (error instanceof SyncProxyRateLimitError) {
    return Math.min(error.retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS);
  }
  return Math.min(1000 * 2 ** failureCount, MAX_BACKOFF_MS);
};

/** Retry-After is either delta-seconds or an HTTP-date (RFC 9110 §10.2.3). */
const parseRetryAfter = (response: Response): number => {
  const header = response.headers.get("retry-after")?.trim() ?? "";
  if (/^\d+$/.test(header)) {
    const seconds = Number.parseInt(header, 10);
    return seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
  }
  const at = Date.parse(header);
  if (!Number.isNaN(at)) {
    const seconds = Math.ceil((at - Date.now()) / 1000);
    return seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
  }
  return DEFAULT_RETRY_AFTER_SECONDS;
};

// One refresh in flight at a time: parallel feed fetches hitting 401 together
// must not each consume the refresh token.
let refreshInFlight: Promise<boolean> | null = null;

const refreshSyncToken = (): Promise<boolean> => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const client = await SyncClient.fromSettings();
        return client ? await client.tryRefresh() : false;
      } catch {
        return false; // storage or client failure: same as a failed refresh
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

const fetchFromSyncProxy = (serverUrl: string, token: string, url: string): Promise<Response> => {
  const syncProxyUrl = `${serverUrl.replace(/\/$/, "")}/api/v1/rss/proxy/${encodeRssFeed(url)}`;
  return fetch(syncProxyUrl, { headers: { Authorization: `Bearer ${token}` } });
};

const authFailure = (): never => {
  notifySyncAuthError();
  throw new SyncProxyAuthError();
};

/**
 * Fetch through the sync server proxy.
 * Returns the body text on success, null when the caller should fall back to
 * public proxies, and throws on auth failure (401/403, after at most one
 * refresh attempt) or rate limit (429).
 */
const trySyncProxy = async (
  serverUrl: string,
  token: string,
  url: string,
): Promise<string | null> => {
  let response: Response;
  try {
    response = await fetchFromSyncProxy(serverUrl, token, url);
  } catch {
    return null; // network error: fall back to public proxies
  }

  if (response.status === 403) return authFailure();

  if (response.status === 401) {
    // Another caller may already have refreshed while our request was in
    // flight: in that case replay with the newer token, no second refresh.
    let fresh = await getSettings();
    const tokenChanged = fresh.syncToken !== undefined && fresh.syncToken !== token;
    if (!tokenChanged) {
      if (!(await refreshSyncToken())) return authFailure();
      fresh = await getSettings();
    }
    if (!fresh.syncServerUrl || !fresh.syncToken) {
      return null; // user disconnected meanwhile: standalone mode, no error
    }
    try {
      response = await fetchFromSyncProxy(fresh.syncServerUrl, fresh.syncToken, url);
    } catch {
      return null;
    }
    if (response.status === 401 || response.status === 403) return authFailure();
  }

  if (response.status === 429) {
    throw new SyncProxyRateLimitError(parseRetryAfter(response));
  }

  return response.ok ? response.text() : null;
};

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

  // Try sync server proxy if configured. Auth (401) and quota (429) errors are
  // surfaced instead of silently leaking the feed to public proxies.
  if (settings.syncServerUrl && settings.syncToken) {
    // Circuit breaker: the token is known dead until the user reconnects.
    if (settings.syncAuthExpired) throw new SyncProxyAuthError();
    const text = await trySyncProxy(settings.syncServerUrl, settings.syncToken, url);
    if (text !== null) {
      return { text, proxyUsed: "Sync Server" };
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
