import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dexie-react-hooks
const mockUseLiveQuery = vi.hoisted(() => vi.fn());
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

// Mock storage
const mockGet = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
const mockAdd = vi.fn();
vi.mock("../services/storage", () => ({
  db: {
    likes: { get: mockGet, put: mockPut, delete: mockDelete },
    syncQueue: { add: mockAdd },
  },
}));

describe("useLike", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    mockAdd.mockResolvedValue(1);
  });

  it("returns isLoading true while DB query is initializing", async () => {
    // useLiveQuery returns undefined while loading
    mockUseLiveQuery.mockReturnValue(undefined);

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike("https://example.com/feed.xml"));

    expect(result.current.isLiked).toBe(false);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.likeDelta).toBe(0);
  });

  it("returns isLiked false when no like exists", async () => {
    // useLiveQuery returns null (no record found)
    mockUseLiveQuery.mockReturnValue(null);

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike("https://example.com/feed.xml"));

    expect(result.current.isLiked).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.likeDelta).toBe(0);
  });

  it("returns isLiked true when a like record exists", async () => {
    mockUseLiveQuery.mockReturnValue({ feedUrl: "https://example.com/feed.xml", likedAt: 123 });

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike("https://example.com/feed.xml"));

    expect(result.current.isLiked).toBe(true);
    expect(result.current.isLoading).toBe(false);
    // Was liked at load, still liked → delta is 0
    expect(result.current.likeDelta).toBe(0);
  });

  it("toggleLike adds a like and queues sync action", async () => {
    mockUseLiveQuery.mockReturnValue(null);

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike("https://example.com/feed.xml"));

    await act(async () => {
      await result.current.toggleLike();
    });

    expect(mockPut).toHaveBeenCalledWith(
      expect.objectContaining({
        feedUrl: "https://example.com/feed.xml",
        likedAt: expect.any(Number),
      }),
    );
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "likePodcast",
        payload: { feedUrl: "https://example.com/feed.xml" },
      }),
    );
  });

  it("toggleLike removes a like and queues unlike action", async () => {
    mockUseLiveQuery.mockReturnValue({ feedUrl: "https://example.com/feed.xml", likedAt: 123 });

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike("https://example.com/feed.xml"));

    await act(async () => {
      await result.current.toggleLike();
    });

    expect(mockDelete).toHaveBeenCalledWith("https://example.com/feed.xml");
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "unlikePodcast",
        payload: { feedUrl: "https://example.com/feed.xml" },
      }),
    );
  });

  it("toggleLike is a no-op while initializing", async () => {
    mockUseLiveQuery.mockReturnValue(undefined);

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike("https://example.com/feed.xml"));

    await act(async () => {
      await result.current.toggleLike();
    });

    expect(mockPut).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("handles errors gracefully in toggleLike", async () => {
    mockUseLiveQuery.mockReturnValue(null);
    mockPut.mockRejectedValue(new Error("DB write failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike("https://example.com/feed.xml"));

    await act(async () => {
      await result.current.toggleLike();
    });

    // Should not throw, and should log the error
    expect(consoleSpy).toHaveBeenCalledWith("[useLike] Failed to toggle like:", expect.any(Error));
    expect(result.current.isLoading).toBe(false);

    consoleSpy.mockRestore();
  });
});
