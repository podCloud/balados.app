import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SyncClient,
  SyncApiError,
  encodeRssFeed,
  decodeRssFeed,
  encodeRssItem,
  decodeRssItem,
  subscriptionToSync,
  syncToSubscription,
  playStatusToSync,
  syncToPlayStatus,
} from "./client";
import type { Subscription, PlayStatus } from "../../types";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock storage module
vi.mock("../storage", () => ({
  getSettings: vi.fn().mockResolvedValue({
    locale: "fr",
    proxies: [],
    syncServerUrl: "https://sync.example.com",
    syncToken: "test-token",
  }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}));

describe("Encoding helpers", () => {
  describe("encodeRssFeed / decodeRssFeed", () => {
    it("should encode and decode feed URLs", () => {
      const feedUrl = "https://example.com/feed.xml";
      const encoded = encodeRssFeed(feedUrl);

      expect(encoded).toBe(btoa(feedUrl));
      expect(decodeRssFeed(encoded)).toBe(feedUrl);
    });

    it("should handle special characters in URLs", () => {
      const feedUrl = "https://example.com/feed.xml?param=value&other=123";
      const encoded = encodeRssFeed(feedUrl);
      expect(decodeRssFeed(encoded)).toBe(feedUrl);
    });
  });

  describe("encodeRssItem / decodeRssItem", () => {
    it("should encode and decode episode IDs", () => {
      const guid = "episode-123";
      const enclosureUrl = "https://example.com/episode.mp3";
      const encoded = encodeRssItem(guid, enclosureUrl);

      const decoded = decodeRssItem(encoded);
      expect(decoded.guid).toBe(guid);
      expect(decoded.enclosureUrl).toBe(enclosureUrl);
    });

    it("should handle commas in guid", () => {
      const guid = "episode,with,commas";
      const enclosureUrl = "https://example.com/episode.mp3";
      const encoded = encodeRssItem(guid, enclosureUrl);

      const decoded = decodeRssItem(encoded);
      expect(decoded.guid).toBe(guid);
      expect(decoded.enclosureUrl).toBe(enclosureUrl);
    });

    it("should throw on invalid format (no comma)", () => {
      const invalidEncoded = btoa("no-comma-here");
      expect(() => decodeRssItem(invalidEncoded)).toThrow(
        "Invalid rss_source_item format: missing comma separator"
      );
    });
  });
});

describe("Type converters", () => {
  describe("subscriptionToSync / syncToSubscription", () => {
    it("should convert subscription to sync format", () => {
      const sub: Subscription = {
        url: "https://example.com/feed.xml",
        addedAt: Date.parse("2024-01-15T10:00:00Z"),
        title: "Test Podcast",
      };

      const sync = subscriptionToSync(sub);

      expect(sync.rss_source_feed).toBe(encodeRssFeed(sub.url));
      expect(sync.subscribed_at).toBe("2024-01-15T10:00:00.000Z");
    });

    it("should convert sync format back to subscription", () => {
      const sync = {
        rss_source_feed: encodeRssFeed("https://example.com/feed.xml"),
        subscribed_at: "2024-01-15T10:00:00.000Z",
      };

      const sub = syncToSubscription(sync);

      expect(sub.url).toBe("https://example.com/feed.xml");
      expect(sub.addedAt).toBe(Date.parse("2024-01-15T10:00:00.000Z"));
    });
  });

  describe("playStatusToSync / syncToPlayStatus", () => {
    it("should convert play status to sync format", () => {
      // episodeId is already in btoa(guid,enclosureUrl) format from generateEpisodeId()
      const encodedEpisodeId = encodeRssItem("episode-123", "https://example.com/episode.mp3");
      const status: PlayStatus = {
        episodeId: encodedEpisodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 300,
        duration: 3600,
        completed: false,
        updatedAt: Date.parse("2024-01-15T10:00:00Z"),
      };

      const sync = playStatusToSync(status);

      expect(sync.rss_source_feed).toBe(encodeRssFeed(status.feedUrl));
      expect(sync.rss_source_item).toBe(encodedEpisodeId); // Used directly, not re-encoded
      expect(sync.position).toBe(300);
      expect(sync.played).toBe(false);
      expect(sync.updated_at).toBe("2024-01-15T10:00:00.000Z");
    });

    it("should convert sync format back to play status", () => {
      const encodedItem = encodeRssItem("episode-123", "https://example.com/episode.mp3");
      const sync = {
        rss_source_feed: encodeRssFeed("https://example.com/feed.xml"),
        rss_source_item: encodedItem,
        position: 300,
        played: true,
        updated_at: "2024-01-15T10:00:00.000Z",
      };

      const status = syncToPlayStatus(sync);

      // episodeId is rss_source_item directly (already encoded)
      expect(status.episodeId).toBe(encodedItem);
      expect(status.feedUrl).toBe("https://example.com/feed.xml");
      expect(status.position).toBe(300);
      expect(status.completed).toBe(true);
    });
  });
});

describe("SyncClient", () => {
  let client: SyncClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new SyncClient("https://sync.example.com", "test-token");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should remove trailing slash from server URL", () => {
      const client1 = new SyncClient("https://sync.example.com/");
      expect(client1.getServerUrl()).toBe("https://sync.example.com");
    });

    it("should store token when provided", () => {
      const client1 = new SyncClient("https://sync.example.com", "my-token");
      expect(client1.hasValidToken()).toBe(true);
    });
  });

  describe("fromSettings", () => {
    it("should create client from saved settings", async () => {
      const client = await SyncClient.fromSettings();
      expect(client).not.toBeNull();
      expect(client?.getServerUrl()).toBe("https://sync.example.com");
    });
  });

  describe("testConnection", () => {
    it("should return true on successful connection", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      });

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://sync.example.com/api/v1/health",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should return false on connection error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe("sync", () => {
    it("should send sync request and return response", async () => {
      const mockResponse = {
        subscriptions: [],
        play_statuses: [],
        synced_at: "2024-01-15T10:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.sync({
        subscriptions: [],
        play_statuses: [],
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://sync.example.com/api/v1/sync",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });

    it("should include since parameter for incremental sync", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            subscriptions: [],
            play_statuses: [],
            synced_at: "2024-01-15T10:00:00Z",
          }),
      });

      await client.sync({
        since: "2024-01-14T10:00:00Z",
        subscriptions: [],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("2024-01-14T10:00:00Z"),
        })
      );
    });
  });

  describe("subscriptions", () => {
    it("should get subscriptions", async () => {
      const mockSubs = [
        {
          rss_source_feed: encodeRssFeed("https://example.com/feed.xml"),
          subscribed_at: "2024-01-15T10:00:00Z",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ subscriptions: mockSubs }),
      });

      const result = await client.getSubscriptions();

      expect(result).toEqual(mockSubs);
    });

    it("should add subscription", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({}),
      });

      await client.addSubscription("https://example.com/feed.xml");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://sync.example.com/api/v1/subscriptions",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("rss_source_feed"),
        })
      );
    });

    it("should remove subscription", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await client.removeSubscription("https://example.com/feed.xml");

      const encodedFeed = encodeRssFeed("https://example.com/feed.xml");
      expect(mockFetch).toHaveBeenCalledWith(
        `https://sync.example.com/api/v1/subscriptions/${encodedFeed}`,
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("play status", () => {
    it("should update play status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      // episodeId is already encoded as btoa(guid,enclosureUrl)
      const encodedEpisodeId = encodeRssItem("episode-123", "https://example.com/episode.mp3");
      const status: PlayStatus = {
        episodeId: encodedEpisodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 300,
        duration: 3600,
        completed: false,
        updatedAt: Date.now(),
      };

      await client.updatePlayStatus(status);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://sync.example.com/api/v1/play",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("should get play status", async () => {
      // episodeId is already encoded
      const encodedEpisodeId = encodeRssItem("episode-123", "https://example.com/episode.mp3");
      const mockStatus = {
        rss_source_feed: encodeRssFeed("https://example.com/feed.xml"),
        rss_source_item: encodedEpisodeId,
        position: 300,
        played: false,
        updated_at: "2024-01-15T10:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockStatus),
      });

      const result = await client.getPlayStatus(
        "https://example.com/feed.xml",
        encodedEpisodeId
      );

      expect(result).toEqual(mockStatus);
    });

    it("should return null for 404 on play status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not found"),
      });

      const encodedEpisodeId = encodeRssItem("episode-123", "https://example.com/episode.mp3");
      const result = await client.getPlayStatus(
        "https://example.com/feed.xml",
        encodedEpisodeId
      );

      expect(result).toBeNull();
    });
  });

  describe("proxy", () => {
    it("should fetch RSS through proxy", async () => {
      const mockRssContent = '<?xml version="1.0"?><rss>...</rss>';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockRssContent),
      });

      const result = await client.proxyFetch("https://example.com/feed.xml");

      expect(result).toBe(mockRssContent);
      const encodedFeed = encodeRssFeed("https://example.com/feed.xml");
      expect(mockFetch).toHaveBeenCalledWith(
        `https://sync.example.com/api/v1/rss/proxy/${encodedFeed}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });
  });

  describe("trending", () => {
    it("should get trending podcasts", async () => {
      const mockTrending = {
        podcasts: [
          {
            feed_url: "https://example.com/feed.xml",
            title: "Popular Podcast",
            subscriber_count: 1000,
          },
        ],
        updated_at: "2024-01-15T10:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockTrending),
      });

      const result = await client.getTrending();

      expect(result).toEqual(mockTrending);
    });
  });

  describe("error handling", () => {
    it("should throw SyncApiError on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad request"),
      });

      await expect(client.getSubscriptions()).rejects.toThrow(SyncApiError);
    });

    it("should retry on retryable status codes", async () => {
      // First call fails with 503
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service unavailable"),
      });
      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ subscriptions: [] }),
      });

      const result = await client.getSubscriptions();

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should refresh token on 401 if refresh token available", async () => {
      const clientWithRefresh = new SyncClient(
        "https://sync.example.com",
        "expired-token",
        "refresh-token"
      );

      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });
      // Refresh token call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "new-token",
            expires_in: 3600,
            token_type: "Bearer",
          }),
      });
      // Retry with new token succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ subscriptions: [] }),
      });

      const result = await clientWithRefresh.getSubscriptions();

      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("hasValidToken", () => {
    it("should return false when no token", () => {
      const noTokenClient = new SyncClient("https://sync.example.com");
      expect(noTokenClient.hasValidToken()).toBe(false);
    });

    it("should return true with valid token", () => {
      expect(client.hasValidToken()).toBe(true);
    });

    it("should return false when token expired", () => {
      client.setToken("token", undefined, -1); // Already expired
      expect(client.hasValidToken()).toBe(false);
    });
  });
});
