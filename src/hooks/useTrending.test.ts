import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock SyncClient - track constructor calls
const mockGetTrending = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    podcasts: [
      { feed_url: "https://example.com/feed.xml", title: "Test Podcast", subscriber_count: 42 },
    ],
    updated_at: "2026-01-01T00:00:00Z",
  }),
);

const mockConstructorCalls = vi.hoisted(() => [] as string[]);

vi.mock("../services/sync/client", () => {
  class SyncClient {
    serverUrl: string;
    constructor(url: string) {
      this.serverUrl = url;
      mockConstructorCalls.push(url);
    }
    getTrending = mockGetTrending;
  }
  return { SyncClient };
});

// Mock dexie-react-hooks
const mockUseLiveQuery = vi.hoisted(() => vi.fn());
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

// Mock storage
vi.mock("../services/storage", () => ({
  db: { settings: { get: vi.fn() } },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useTrending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConstructorCalls.length = 0;
    mockUseLiveQuery.mockReturnValue({});
  });

  it("fetches trending podcasts", async () => {
    const { useTrending } = await import("./useTrending");
    const { result } = renderHook(() => useTrending(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { feed_url: "https://example.com/feed.xml", title: "Test Podcast", subscriber_count: 42 },
    ]);
    expect(mockGetTrending).toHaveBeenCalledOnce();
  });

  it("falls back to default sync URL when no syncServerUrl configured", async () => {
    mockUseLiveQuery.mockReturnValue({});

    const { useTrending } = await import("./useTrending");
    const { result } = renderHook(() => useTrending(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockConstructorCalls).toContain("https://sync.balados.app");
  });

  it("uses configured sync server URL from settings", async () => {
    mockUseLiveQuery.mockReturnValue({ syncServerUrl: "https://custom.server.com" });

    const { useTrending } = await import("./useTrending");
    const { result } = renderHook(() => useTrending(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockConstructorCalls).toContain("https://custom.server.com");
  });

  it("waits for settings before fetching", async () => {
    mockUseLiveQuery.mockReturnValue(undefined);

    const { useTrending } = await import("./useTrending");
    const { result } = renderHook(() => useTrending(), { wrapper: createWrapper() });

    // Should not fetch while settings are undefined
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetTrending).not.toHaveBeenCalled();
  });

  it("handles API errors gracefully", async () => {
    mockUseLiveQuery.mockReturnValue({});
    mockGetTrending.mockRejectedValueOnce(new Error("Network error"));

    const { useTrending } = await import("./useTrending");
    const { result } = renderHook(() => useTrending(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("caches results with 5-minute staleTime", async () => {
    const { useTrending } = await import("./useTrending");
    const wrapper = createWrapper();

    const { result } = renderHook(() => useTrending(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Re-render same hook in same query client - should not refetch
    const { result: result2 } = renderHook(() => useTrending(), { wrapper });
    await waitFor(() => expect(result2.current.isSuccess).toBe(true));

    // Only one fetch call because of staleTime caching
    expect(mockGetTrending).toHaveBeenCalledOnce();
  });
});
