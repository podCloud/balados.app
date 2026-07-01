import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../services/storage";

// Mock dexie-react-hooks (only the read side; writes go through the real Dexie DB
// backed by fake-indexeddb so transaction/rollback semantics are genuinely exercised)
const mockUseLiveQuery = vi.hoisted(() => vi.fn());
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

const feedUrl = "https://example.com/feed.xml";

describe("useLike", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    mockUseLiveQuery.mockReset();
    await db.likes.clear();
    await db.syncQueue.clear();
  });

  it("returns isLoading true while DB query is initializing", async () => {
    // useLiveQuery returns undefined while loading
    mockUseLiveQuery.mockReturnValue(undefined);

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    expect(result.current.isLiked).toBe(false);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.likeDelta).toBe(0);
  });

  it("returns isLiked false when no like exists", async () => {
    // useLiveQuery returns null (no record found)
    mockUseLiveQuery.mockReturnValue(null);

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    expect(result.current.isLiked).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.likeDelta).toBe(0);
  });

  it("returns isLiked true when a like record exists", async () => {
    mockUseLiveQuery.mockReturnValue({ feedUrl, likedAt: 123 });

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    expect(result.current.isLiked).toBe(true);
    expect(result.current.isLoading).toBe(false);
    // Was liked at load, still liked → delta is 0
    expect(result.current.likeDelta).toBe(0);
  });

  it("toggleLike adds a like and queues sync action", async () => {
    mockUseLiveQuery.mockReturnValue(null);

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    await act(async () => {
      await result.current.toggleLike();
    });

    const like = await db.likes.get(feedUrl);
    expect(like).toEqual(expect.objectContaining({ feedUrl, likedAt: expect.any(Number) }));

    const queued = await db.syncQueue.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toEqual(
      expect.objectContaining({ action: "likePodcast", payload: { feedUrl } }),
    );
  });

  it("toggleLike removes a like and queues unlike action", async () => {
    await db.likes.put({ feedUrl, likedAt: 123 });
    mockUseLiveQuery.mockReturnValue({ feedUrl, likedAt: 123 });

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    await act(async () => {
      await result.current.toggleLike();
    });

    expect(await db.likes.get(feedUrl)).toBeUndefined();
    const queued = await db.syncQueue.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toEqual(
      expect.objectContaining({ action: "unlikePodcast", payload: { feedUrl } }),
    );
  });

  it("toggleLike is a no-op while initializing", async () => {
    mockUseLiveQuery.mockReturnValue(undefined);

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    await act(async () => {
      await result.current.toggleLike();
    });

    expect(await db.likes.get(feedUrl)).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("handles errors gracefully in toggleLike", async () => {
    mockUseLiveQuery.mockReturnValue(null);
    vi.spyOn(db.likes, "put").mockRejectedValueOnce(new Error("DB write failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    await act(async () => {
      await result.current.toggleLike();
    });

    // Should not throw, and should log the error
    expect(consoleSpy).toHaveBeenCalledWith("[useLike] Failed to toggle like:", expect.any(Error));
    expect(result.current.isLoading).toBe(false);
  });

  it("rolls back the like write when queuing the sync action fails", async () => {
    mockUseLiveQuery.mockReturnValue(null);
    vi.spyOn(db.syncQueue, "add").mockRejectedValueOnce(new Error("Queue write failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    await act(async () => {
      await result.current.toggleLike();
    });

    // The like put must be rolled back since the transaction failed on the queue write
    expect(await db.likes.get(feedUrl)).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("rolls back the like deletion when queuing the unlike action fails", async () => {
    await db.likes.put({ feedUrl, likedAt: 123 });
    mockUseLiveQuery.mockReturnValue({ feedUrl, likedAt: 123 });
    vi.spyOn(db.syncQueue, "add").mockRejectedValueOnce(new Error("Queue write failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    await act(async () => {
      await result.current.toggleLike();
    });

    // The like deletion must be rolled back since the transaction failed on the queue write
    expect(await db.likes.get(feedUrl)).toEqual(expect.objectContaining({ feedUrl }));
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("ignores a second toggleLike call while the first is still in flight", async () => {
    mockUseLiveQuery.mockReturnValue(null);

    const { useLike } = await import("./useLike");
    const { result } = renderHook(() => useLike(feedUrl));

    await act(async () => {
      await Promise.all([result.current.toggleLike(), result.current.toggleLike()]);
    });

    // Only the first call should have run; the second is a no-op re-entrancy guard
    expect(await db.syncQueue.count()).toBe(1);
  });
});
