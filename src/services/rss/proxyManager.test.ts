import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../types";
import { encodeRssFeed } from "../../utils/rssEncoding";
import {
  createProxyConfig,
  DEFAULT_PROXIES,
  fetchWithProxy,
  rssQueryRetryDelay,
  SyncProxyAuthError,
  SyncProxyRateLimitError,
} from "./proxyManager";

// Mock storage module
vi.mock("../storage", () => ({
  getSettings: vi.fn(),
}));

// Mock sync client (token refresh) and auth events (UI notification)
const mockTryRefresh = vi.fn<() => Promise<boolean>>();
vi.mock("../sync/client", () => ({
  SyncClient: {
    fromSettings: vi.fn(async () => ({ tryRefresh: mockTryRefresh })),
  },
}));
vi.mock("../sync/authEvents", () => ({
  notifySyncAuthError: vi.fn(),
}));

import { getSettings } from "../storage";
import { notifySyncAuthError } from "../sync/authEvents";

const mockGetSettings = vi.mocked(getSettings);

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const BASE_SETTINGS: AppSettings = {
  locale: "fr",
  proxies: [
    { url: "https://proxy1.example.com/?url=", name: "Proxy1", enabled: true, priority: 1 },
    { url: "https://proxy2.example.com/?url=", name: "Proxy2", enabled: true, priority: 2 },
  ],
};

const SYNC_SETTINGS: AppSettings = {
  ...BASE_SETTINGS,
  syncServerUrl: "https://sync.example.com",
  syncToken: "test-jwt-token",
};

const FEED_URL = "https://example.com/feed.xml";

const okResponse = (text: string) =>
  Promise.resolve({ ok: true, text: () => Promise.resolve(text) } as Response);

const failResponse = () => Promise.resolve({ ok: false, status: 500 } as Response);

const networkError = () => Promise.reject(new Error("Network error"));

const statusResponse = (status: number, headers: Record<string, string> = {}) =>
  Promise.resolve({
    ok: false,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchWithProxy", () => {
  it("returns direct fetch result when it succeeds", async () => {
    mockGetSettings.mockResolvedValue(BASE_SETTINGS);
    mockFetch.mockImplementation(() => okResponse("<rss>direct</rss>"));

    const result = await fetchWithProxy(FEED_URL);

    expect(result.text).toBe("<rss>direct</rss>");
    expect(result.proxyUsed).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(FEED_URL);
  });

  it("uses sync server proxy when configured and direct fails", async () => {
    mockGetSettings.mockResolvedValue(SYNC_SETTINGS);
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(() => okResponse("<rss>synced</rss>")); // sync proxy succeeds

    const result = await fetchWithProxy(FEED_URL);

    expect(result.text).toBe("<rss>synced</rss>");
    expect(result.proxyUsed).toBe("Sync Server");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("constructs sync proxy URL with base64-encoded feed URL", async () => {
    mockGetSettings.mockResolvedValue(SYNC_SETTINGS);
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(() => okResponse("<rss/>"));

    await fetchWithProxy(FEED_URL);

    const expectedUrl = `https://sync.example.com/api/v1/rss/proxy/${encodeRssFeed(FEED_URL)}`;
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, {
      headers: { Authorization: "Bearer test-jwt-token" },
    });
  });

  it("sends Authorization header with sync token", async () => {
    mockGetSettings.mockResolvedValue(SYNC_SETTINGS);
    mockFetch
      .mockImplementationOnce(networkError)
      .mockImplementationOnce(() => okResponse("<rss/>"));

    await fetchWithProxy(FEED_URL);

    const syncCall = mockFetch.mock.calls[1];
    expect(syncCall[1]).toEqual({
      headers: { Authorization: "Bearer test-jwt-token" },
    });
  });

  it("skips sync proxy when syncServerUrl is missing", async () => {
    mockGetSettings.mockResolvedValue({
      ...BASE_SETTINGS,
      syncToken: "some-token",
      // no syncServerUrl
    });
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(() => okResponse("<rss>proxy1</rss>")); // proxy1 succeeds

    const result = await fetchWithProxy(FEED_URL);

    expect(result.proxyUsed).toBe("Proxy1");
    // Should only be direct + proxy1 (no sync attempt)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("skips sync proxy when syncToken is missing", async () => {
    mockGetSettings.mockResolvedValue({
      ...BASE_SETTINGS,
      syncServerUrl: "https://sync.example.com",
      // no syncToken
    });
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(() => okResponse("<rss>proxy1</rss>")); // proxy1 succeeds

    const result = await fetchWithProxy(FEED_URL);

    expect(result.proxyUsed).toBe("Proxy1");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to public proxies when sync proxy has network error", async () => {
    mockGetSettings.mockResolvedValue(SYNC_SETTINGS);
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(networkError) // sync proxy fails
      .mockImplementationOnce(() => okResponse("<rss>proxy1</rss>")); // proxy1 succeeds

    const result = await fetchWithProxy(FEED_URL);

    expect(result.text).toBe("<rss>proxy1</rss>");
    expect(result.proxyUsed).toBe("Proxy1");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("falls back to public proxies when sync proxy returns non-ok status", async () => {
    mockGetSettings.mockResolvedValue(SYNC_SETTINGS);
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(failResponse) // sync proxy returns 500
      .mockImplementationOnce(() => okResponse("<rss>proxy1</rss>")); // proxy1 succeeds

    const result = await fetchWithProxy(FEED_URL);

    expect(result.text).toBe("<rss>proxy1</rss>");
    expect(result.proxyUsed).toBe("Proxy1");
  });

  it("strips trailing slash from syncServerUrl", async () => {
    mockGetSettings.mockResolvedValue({
      ...SYNC_SETTINGS,
      syncServerUrl: "https://sync.example.com/",
    });
    mockFetch
      .mockImplementationOnce(networkError)
      .mockImplementationOnce(() => okResponse("<rss/>"));

    await fetchWithProxy(FEED_URL);

    const expectedUrl = `https://sync.example.com/api/v1/rss/proxy/${encodeRssFeed(FEED_URL)}`;
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
  });

  it("tries public proxies in priority order", async () => {
    const settings: AppSettings = {
      locale: "fr",
      proxies: [
        { url: "https://low-priority.com/?url=", name: "LowPrio", enabled: true, priority: 5 },
        { url: "https://high-priority.com/?url=", name: "HighPrio", enabled: true, priority: 1 },
      ],
    };
    mockGetSettings.mockResolvedValue(settings);
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(networkError) // HighPrio fails
      .mockImplementationOnce(() => okResponse("<rss>low</rss>")); // LowPrio succeeds

    const result = await fetchWithProxy(FEED_URL);

    expect(result.proxyUsed).toBe("LowPrio");
    // Verify HighPrio (priority 1) was tried before LowPrio (priority 5)
    const proxyUrls = mockFetch.mock.calls.slice(1).map((c) => c[0] as string);
    expect(proxyUrls[0]).toContain("high-priority.com");
    expect(proxyUrls[1]).toContain("low-priority.com");
  });

  it("skips disabled proxies", async () => {
    const settings: AppSettings = {
      locale: "fr",
      proxies: [
        { url: "https://disabled.com/?url=", name: "Disabled", enabled: false, priority: 1 },
        { url: "https://enabled.com/?url=", name: "Enabled", enabled: true, priority: 2 },
      ],
    };
    mockGetSettings.mockResolvedValue(settings);
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(() => okResponse("<rss>enabled</rss>"));

    const result = await fetchWithProxy(FEED_URL);

    expect(result.proxyUsed).toBe("Enabled");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Should not have called disabled proxy
    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("disabled.com"))).toBe(false);
  });

  it("throws error when all methods fail", async () => {
    mockGetSettings.mockResolvedValue(SYNC_SETTINGS);
    mockFetch.mockImplementation(networkError);

    await expect(fetchWithProxy(FEED_URL)).rejects.toThrow("Impossible de recuperer le flux RSS");
  });
});

describe("fetchWithProxy - sync proxy auth and rate limit", () => {
  beforeEach(() => {
    mockGetSettings.mockResolvedValue(SYNC_SETTINGS);
    mockTryRefresh.mockReset();
  });

  it("throws SyncProxyAuthError on 401 when refresh fails and does not call public proxies", async () => {
    mockTryRefresh.mockResolvedValue(false);
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(() => statusResponse(401)); // sync proxy 401

    await expect(fetchWithProxy(FEED_URL)).rejects.toBeInstanceOf(SyncProxyAuthError);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urls = mockFetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("proxy1.example.com"))).toBe(false);
    expect(notifySyncAuthError).toHaveBeenCalledTimes(1);
  });

  it("retries the sync proxy once with the refreshed token after a 401", async () => {
    mockTryRefresh.mockImplementation(async () => {
      mockGetSettings.mockResolvedValue({ ...SYNC_SETTINGS, syncToken: "new-token" });
      return true;
    });
    mockFetch
      .mockImplementationOnce(networkError) // direct fails
      .mockImplementationOnce(() => statusResponse(401)) // sync proxy 401
      .mockImplementationOnce(() => okResponse("<rss>refreshed</rss>")); // replay OK

    const result = await fetchWithProxy(FEED_URL);

    expect(result.proxyUsed).toBe("Sync Server");
    expect(result.text).toBe("<rss>refreshed</rss>");
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[2][1]).toEqual({
      headers: { Authorization: "Bearer new-token" },
    });
    expect(notifySyncAuthError).not.toHaveBeenCalled();
  });

  it("throws SyncProxyAuthError when the replay after refresh is still 401", async () => {
    mockTryRefresh.mockResolvedValue(true);
    mockFetch
      .mockImplementationOnce(networkError)
      .mockImplementationOnce(() => statusResponse(401))
      .mockImplementationOnce(() => statusResponse(401));

    await expect(fetchWithProxy(FEED_URL)).rejects.toBeInstanceOf(SyncProxyAuthError);
    expect(mockTryRefresh).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("dedupes concurrent refreshes triggered by parallel 401s", async () => {
    let release: (value: boolean) => void = () => {};
    mockTryRefresh.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    mockFetch.mockImplementation((url: string) =>
      String(url).includes("sync.example.com") ? statusResponse(401) : networkError(),
    );

    const pending = Promise.allSettled([
      fetchWithProxy("https://a.example.com/feed.xml"),
      fetchWithProxy("https://b.example.com/feed.xml"),
    ]);
    await vi.waitFor(() => expect(mockTryRefresh).toHaveBeenCalledTimes(1));
    release(false);
    const results = await pending;

    expect(mockTryRefresh).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
  });

  it("throws SyncProxyRateLimitError with retryAfterSeconds on 429 and skips public proxies", async () => {
    mockFetch
      .mockImplementationOnce(networkError)
      .mockImplementationOnce(() => statusResponse(429, { "retry-after": "30" }));

    const error = await fetchWithProxy(FEED_URL).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SyncProxyRateLimitError);
    expect((error as SyncProxyRateLimitError).retryAfterSeconds).toBe(30);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockTryRefresh).not.toHaveBeenCalled();
  });

  it("defaults retryAfterSeconds to 60 when Retry-After is missing", async () => {
    mockFetch
      .mockImplementationOnce(networkError)
      .mockImplementationOnce(() => statusResponse(429));

    const error = await fetchWithProxy(FEED_URL).catch((e: unknown) => e);

    expect((error as SyncProxyRateLimitError).retryAfterSeconds).toBe(60);
  });

  it("still falls back to public proxies on a 500 from the sync proxy", async () => {
    mockFetch
      .mockImplementationOnce(networkError)
      .mockImplementationOnce(() => statusResponse(500))
      .mockImplementationOnce(() => okResponse("<rss>proxy1</rss>"));

    const result = await fetchWithProxy(FEED_URL);

    expect(result.proxyUsed).toBe("Proxy1");
    expect(mockTryRefresh).not.toHaveBeenCalled();
  });
});

describe("rssQueryRetryDelay", () => {
  it("uses Retry-After for rate limit errors", () => {
    expect(rssQueryRetryDelay(0, new SyncProxyRateLimitError(45))).toBe(45_000);
  });

  it("uses exponential backoff capped at 30s otherwise", () => {
    expect(rssQueryRetryDelay(0, new Error("x"))).toBe(1_000);
    expect(rssQueryRetryDelay(2, new Error("x"))).toBe(4_000);
    expect(rssQueryRetryDelay(10, new Error("x"))).toBe(30_000);
  });
});

describe("createProxyConfig", () => {
  it("creates a proxy config with default priority", () => {
    const config = createProxyConfig("https://proxy.com/?url=", "MyProxy");

    expect(config).toEqual({
      url: "https://proxy.com/?url=",
      name: "MyProxy",
      enabled: true,
      priority: 10,
    });
  });

  it("creates a proxy config with custom priority", () => {
    const config = createProxyConfig("https://proxy.com/?url=", "MyProxy", 5);

    expect(config.priority).toBe(5);
  });
});

describe("DEFAULT_PROXIES", () => {
  it("contains AllOrigins and CORS Proxy as enabled", () => {
    const enabled = DEFAULT_PROXIES.filter((p) => p.enabled);
    expect(enabled).toHaveLength(2);
    expect(enabled.map((p) => p.name)).toContain("AllOrigins");
    expect(enabled.map((p) => p.name)).toContain("CORS Proxy");
  });

  it("has CORS Anywhere disabled by default", () => {
    const corsAnywhere = DEFAULT_PROXIES.find((p) => p.name === "CORS Anywhere");
    expect(corsAnywhere).toBeDefined();
    expect(corsAnywhere!.enabled).toBe(false);
  });
});
