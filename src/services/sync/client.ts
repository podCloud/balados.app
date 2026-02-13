import { getSettings, saveSettings } from "../storage";
import type { Subscription, PlayStatus } from "../../types";
import { encodeRssFeed, decodeRssFeed } from "../../utils/rssEncoding";

// API Response types
export interface SyncConfig {
  serverUrl: string;
  token: string;
  refreshToken?: string;
  autoSync: boolean;
  syncInterval: number; // minutes
}

export interface SubscriptionSync {
  rss_source_feed: string; // base64(feedUrl)
  rss_source_id?: string;
  subscribed_at: string; // ISO date
  unsubscribed_at?: string; // ISO date
}

export interface PlayStatusSync {
  rss_source_feed: string; // base64(feedUrl)
  rss_source_item: string; // base64(guid,enclosureUrl)
  position: number;
  played: boolean;
  updated_at: string; // ISO date
}

export interface SyncRequest {
  since?: string; // ISO date for incremental sync
  subscriptions?: SubscriptionSync[];
  play_statuses?: PlayStatusSync[];
}

export interface SyncResponse {
  subscriptions: SubscriptionSync[];
  play_statuses: PlayStatusSync[];
  synced_at: string;
}

export interface TrendingPodcast {
  feed_url: string;
  title: string;
  image?: string;
  subscriber_count: number;
}

export interface TrendingResponse {
  podcasts: TrendingPodcast[];
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export type SyncStatus =
  | "disconnected"
  | "connected"
  | "syncing"
  | "pending"
  | "error";

export interface SyncState {
  status: SyncStatus;
  serverUrl: string | null;
  lastSyncAt: number | null;
  pendingCount: number;
  error: string | null;
}

// API Error class
export class SyncApiError extends Error {
  statusCode: number;
  isRetryable: boolean;

  constructor(message: string, statusCode: number, isRetryable = false) {
    super(message);
    this.name = "SyncApiError";
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

// Re-export encoding helpers from shared util
export { encodeRssFeed, decodeRssFeed, encodeRssItem, decodeRssItem } from "../../utils/rssEncoding";

// Convert local types to sync format
export const subscriptionToSync = (sub: Subscription): SubscriptionSync => ({
  rss_source_feed: encodeRssFeed(sub.url),
  subscribed_at: new Date(sub.addedAt).toISOString(),
});

export const syncToSubscription = (sync: SubscriptionSync): Subscription => ({
  url: decodeRssFeed(sync.rss_source_feed),
  addedAt: new Date(sync.subscribed_at).getTime(),
});

/**
 * Convert local PlayStatus to sync format.
 * Note: episodeId is already in format base64url(guid,enclosureUrl) from generateEpisodeId(),
 * so we use it directly as rss_source_item.
 */
export const playStatusToSync = (status: PlayStatus): PlayStatusSync => ({
  rss_source_feed: encodeRssFeed(status.feedUrl),
  rss_source_item: status.episodeId, // Already encoded as base64url(guid,enclosureUrl)
  position: status.position,
  played: status.completed,
  updated_at: new Date(status.updatedAt).toISOString(),
});

/**
 * Convert sync format to local PlayStatus.
 * Note: duration is not included in sync data (it's episode metadata, not play state).
 * Callers must provide duration separately when needed.
 */
export const syncToPlayStatus = (
  sync: PlayStatusSync
): Omit<PlayStatus, "duration"> => {
  // rss_source_item is already in base64url(guid,enclosureUrl) format, use as episodeId directly
  return {
    episodeId: sync.rss_source_item,
    feedUrl: decodeRssFeed(sync.rss_source_feed),
    position: sync.position,
    completed: sync.played,
    updatedAt: new Date(sync.updated_at).getTime(),
  };
};

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * SyncClient - API client for balados.sync server
 */
export class SyncClient {
  private serverUrl: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(serverUrl: string, token?: string, refreshToken?: string) {
    this.serverUrl = serverUrl.replace(/\/$/, ""); // Remove trailing slash
    this.token = token ?? null;
    this.refreshToken = refreshToken ?? null;
  }

  /**
   * Create a SyncClient from saved settings
   */
  static async fromSettings(): Promise<SyncClient | null> {
    const settings = await getSettings();
    if (!settings.syncServerUrl || !settings.syncToken) {
      return null;
    }
    return new SyncClient(settings.syncServerUrl, settings.syncToken);
  }

  /**
   * Save current credentials to settings
   */
  async saveCredentials(): Promise<void> {
    await saveSettings({
      syncServerUrl: this.serverUrl,
      syncToken: this.token ?? undefined,
    });
  }

  /**
   * Clear credentials from settings
   */
  async clearCredentials(): Promise<void> {
    await saveSettings({
      syncServerUrl: undefined,
      syncToken: undefined,
    });
  }

  /**
   * Set authentication token
   */
  setToken(token: string, refreshToken?: string, expiresIn?: number): void {
    this.token = token;
    this.refreshToken = refreshToken ?? null;
    this.tokenExpiresAt = expiresIn
      ? Date.now() + expiresIn * 1000
      : null;
  }

  /**
   * Check if client has valid token
   */
  hasValidToken(): boolean {
    if (!this.token) return false;
    if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt) return false;
    return true;
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Make authenticated API request with retry logic
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    const url = `${this.serverUrl}${endpoint}`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };

    if (this.token) {
      (headers as Record<string, string>)["Authorization"] =
        `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle token refresh if 401
      if (response.status === 401 && this.refreshToken && retryCount === 0) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.request<T>(endpoint, options, retryCount + 1);
        }
      }

      // Handle retryable errors
      if (
        RETRYABLE_STATUS_CODES.includes(response.status) &&
        retryCount < MAX_RETRIES
      ) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
        await this.sleep(delay);
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new SyncApiError(
          errorBody || `HTTP ${response.status}`,
          response.status,
          RETRYABLE_STATUS_CODES.includes(response.status)
        );
      }

      // Handle empty response (204 No Content)
      if (response.status === 204) {
        return {} as T;
      }

      return response.json();
    } catch (error) {
      // Network errors are retryable
      if (
        error instanceof TypeError &&
        error.message.includes("fetch") &&
        retryCount < MAX_RETRIES
      ) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
        await this.sleep(delay);
        return this.request<T>(endpoint, options, retryCount + 1);
      }
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(`${this.serverUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });

      if (!response.ok) return false;

      const data: TokenResponse = await response.json();
      this.setToken(data.access_token, data.refresh_token, data.expires_in);
      await this.saveCredentials();
      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return false;
    }
  }

  // ========== API Methods ==========

  /**
   * Test connection to server
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request<{ ok: boolean }>("/api/v1/health", { method: "GET" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Full sync - send and receive all data
   */
  async sync(data: SyncRequest): Promise<SyncResponse> {
    return this.request<SyncResponse>("/api/v1/sync", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Get all subscriptions from server
   */
  async getSubscriptions(): Promise<SubscriptionSync[]> {
    const response = await this.request<{ subscriptions: SubscriptionSync[] }>(
      "/api/v1/subscriptions",
      { method: "GET" }
    );
    return response.subscriptions;
  }

  /**
   * Add a subscription
   */
  async addSubscription(feedUrl: string): Promise<void> {
    await this.request("/api/v1/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        rss_source_feed: encodeRssFeed(feedUrl),
        subscribed_at: new Date().toISOString(),
      }),
    });
  }

  /**
   * Remove a subscription
   */
  async removeSubscription(feedUrl: string): Promise<void> {
    const encodedFeed = encodeRssFeed(feedUrl);
    await this.request(`/api/v1/subscriptions/${encodedFeed}`, {
      method: "DELETE",
    });
  }

  /**
   * Update play status for an episode
   */
  async updatePlayStatus(status: PlayStatus): Promise<void> {
    await this.request("/api/v1/play", {
      method: "POST",
      body: JSON.stringify(playStatusToSync(status)),
    });
  }

  /**
   * Get play status for an episode.
   * @param feedUrl - The feed URL
   * @param episodeId - The episode ID (already in base64url(guid,enclosureUrl) format)
   */
  async getPlayStatus(
    feedUrl: string,
    episodeId: string
  ): Promise<PlayStatusSync | null> {
    try {
      const encodedFeed = encodeRssFeed(feedUrl);
      // episodeId is already encoded as base64url(guid,enclosureUrl), use directly
      return await this.request<PlayStatusSync>(
        `/api/v1/play/${encodedFeed}/${episodeId}`,
        { method: "GET" }
      );
    } catch (error) {
      if (error instanceof SyncApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Fetch RSS feed through server's CORS proxy
   */
  async proxyFetch(feedUrl: string): Promise<string> {
    const encodedFeed = encodeRssFeed(feedUrl);
    const response = await fetch(
      `${this.serverUrl}/api/v1/rss/proxy/${encodedFeed}`,
      {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      }
    );

    if (!response.ok) {
      throw new SyncApiError(
        `Proxy fetch failed for ${feedUrl}: ${response.status}`,
        response.status,
        RETRYABLE_STATUS_CODES.includes(response.status)
      );
    }

    return response.text();
  }

  /**
   * Get trending podcasts (public endpoint)
   */
  async getTrending(): Promise<TrendingResponse> {
    return this.request<TrendingResponse>("/api/v1/public/trending/podcasts", {
      method: "GET",
    });
  }

  /**
   * Get user's aggregated RSS feed URL.
   *
   * Note: This uses the play token (user_token), not the JWT auth token.
   * Play tokens are designed to be public/shareable - they only grant access
   * to RSS feeds and play gateway, not to account API.
   *
   * @param playToken - The user's play token (obtained from server)
   * @returns The aggregated RSS feed URL, or null if no token provided
   */
  getAggregatedFeedUrl(playToken?: string): string | null {
    const token = playToken ?? this.playToken;
    if (!token) return null;
    return `${this.serverUrl}/api/v1/rss/user/${token}/subscriptions`;
  }

  private playToken: string | null = null;

  /**
   * Set the play token for aggregated feeds access.
   * Play tokens are separate from JWT auth tokens and are safe to use in URLs.
   */
  setPlayToken(playToken: string): void {
    this.playToken = playToken;
  }
}

// Default export for convenience
export default SyncClient;
