import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./index";
import {
  clearQueue,
  enforceQueueLimit,
  getPendingActions,
  getPendingCount,
  getRetryableActions,
  hasPendingActions,
  markAttempted,
  pruneFailedActions,
  queueLikeAction,
  queuePlayStatusAction,
  queueSubscribeAction,
  queueUnsubscribeAction,
  removeAction,
} from "./syncQueue";

describe("syncQueue", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.syncQueue.clear();
  });

  describe("queueSubscribeAction", () => {
    it("adds a subscribe action to the queue", async () => {
      const id = await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      expect(id).toBeGreaterThan(0);

      const action = await db.syncQueue.get(id);
      expect(action?.action).toBe("subscribe");
      expect(action?.payload.feedUrl).toBe("https://example.com/feed.xml");
      expect(action?.attempts).toBe(0);
    });

    it("deduplicates subscribe actions for same feed", async () => {
      await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });
      await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      const count = await db.syncQueue.count();
      expect(count).toBe(1);
    });

    it("removes existing unsubscribe when subscribing", async () => {
      await queueUnsubscribeAction({ feedUrl: "https://example.com/feed.xml" });
      await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe("subscribe");
    });
  });

  describe("queueUnsubscribeAction", () => {
    it("adds an unsubscribe action to the queue", async () => {
      const id = await queueUnsubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      const action = await db.syncQueue.get(id);
      expect(action?.action).toBe("unsubscribe");
    });

    it("removes existing subscribe when unsubscribing", async () => {
      await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });
      await queueUnsubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe("unsubscribe");
    });
  });

  describe("queuePlayStatusAction", () => {
    it("adds a play status action to the queue", async () => {
      const id = await queuePlayStatusAction({
        episodeId: "ep1",
        feedUrl: "https://example.com/feed.xml",
        position: 100,
        duration: 1000,
        completed: false,
      });

      const action = await db.syncQueue.get(id);
      expect(action?.action).toBe("updatePlayStatus");
      expect((action?.payload as { episodeId: string }).episodeId).toBe("ep1");
    });

    it("keeps only latest play status for same episode", async () => {
      await queuePlayStatusAction({
        episodeId: "ep1",
        feedUrl: "https://example.com/feed.xml",
        position: 100,
        duration: 1000,
        completed: false,
      });
      await queuePlayStatusAction({
        episodeId: "ep1",
        feedUrl: "https://example.com/feed.xml",
        position: 500,
        duration: 1000,
        completed: false,
      });

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect((actions[0].payload as { position: number }).position).toBe(500);
    });
  });

  describe("queueLikeAction", () => {
    it("adds a likePodcast action to the queue", async () => {
      const id = await queueLikeAction("likePodcast", { feedUrl: "https://example.com/feed.xml" });

      const action = await db.syncQueue.get(id);
      expect(action?.action).toBe("likePodcast");
      expect(action?.payload.feedUrl).toBe("https://example.com/feed.xml");
    });

    it("deduplicates repeated like actions for the same feed", async () => {
      await queueLikeAction("likePodcast", { feedUrl: "https://example.com/feed.xml" });
      await queueLikeAction("likePodcast", { feedUrl: "https://example.com/feed.xml" });

      const count = await db.syncQueue.count();
      expect(count).toBe(1);
    });

    it("removes an existing likePodcast action when unliking", async () => {
      await queueLikeAction("likePodcast", { feedUrl: "https://example.com/feed.xml" });
      await queueLikeAction("unlikePodcast", { feedUrl: "https://example.com/feed.xml" });

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe("unlikePodcast");
    });

    it("removes an existing unlikePodcast action when liking", async () => {
      await queueLikeAction("unlikePodcast", { feedUrl: "https://example.com/feed.xml" });
      await queueLikeAction("likePodcast", { feedUrl: "https://example.com/feed.xml" });

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe("likePodcast");
    });

    it("does not affect actions for a different feed", async () => {
      await queueLikeAction("likePodcast", { feedUrl: "https://other.com/feed.xml" });
      await queueLikeAction("likePodcast", { feedUrl: "https://example.com/feed.xml" });

      const count = await db.syncQueue.count();
      expect(count).toBe(2);
    });
  });

  describe("getPendingActions", () => {
    it("returns empty array when queue is empty", async () => {
      const actions = await getPendingActions();
      expect(actions).toEqual([]);
    });

    it("returns actions ordered by createdAt", async () => {
      await db.syncQueue.add({
        action: "subscribe",
        payload: { feedUrl: "https://old.com/feed.xml" },
        createdAt: Date.now() - 10000,
        attempts: 0,
      });
      await db.syncQueue.add({
        action: "subscribe",
        payload: { feedUrl: "https://new.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 0,
      });

      const actions = await getPendingActions();
      expect(actions[0].payload.feedUrl).toBe("https://old.com/feed.xml");
      expect(actions[1].payload.feedUrl).toBe("https://new.com/feed.xml");
    });
  });

  describe("getPendingCount", () => {
    it("returns 0 for empty queue", async () => {
      const count = await getPendingCount();
      expect(count).toBe(0);
    });

    it("returns correct count", async () => {
      await queueSubscribeAction({ feedUrl: "https://a.com/feed.xml" });
      await queueSubscribeAction({ feedUrl: "https://b.com/feed.xml" });
      await queueSubscribeAction({ feedUrl: "https://c.com/feed.xml" });

      const count = await getPendingCount();
      expect(count).toBe(3);
    });
  });

  describe("markAttempted", () => {
    it("increments attempts and sets lastAttemptAt", async () => {
      const id = await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      await markAttempted(id);

      const action = await db.syncQueue.get(id);
      expect(action?.attempts).toBe(1);
      expect(action?.lastAttemptAt).toBeDefined();
    });

    it("stores error message", async () => {
      const id = await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      await markAttempted(id, "Network error");

      const action = await db.syncQueue.get(id);
      expect(action?.error).toBe("Network error");
    });

    it("handles non-existent action gracefully", async () => {
      await expect(markAttempted(99999)).resolves.not.toThrow();
    });
  });

  describe("removeAction", () => {
    it("removes action from queue", async () => {
      const id = await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      await removeAction(id);

      const action = await db.syncQueue.get(id);
      expect(action).toBeUndefined();
    });
  });

  describe("clearQueue", () => {
    it("removes all actions", async () => {
      await queueSubscribeAction({ feedUrl: "https://a.com/feed.xml" });
      await queueSubscribeAction({ feedUrl: "https://b.com/feed.xml" });

      await clearQueue();

      const count = await db.syncQueue.count();
      expect(count).toBe(0);
    });
  });

  describe("getRetryableActions", () => {
    it("returns actions with 0 attempts", async () => {
      await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      const retryable = await getRetryableActions();
      expect(retryable).toHaveLength(1);
    });

    it("excludes actions with max attempts", async () => {
      await db.syncQueue.add({
        action: "subscribe",
        payload: { feedUrl: "https://failed.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 5,
        lastAttemptAt: Date.now() - 100000,
      });

      const retryable = await getRetryableActions();
      expect(retryable).toHaveLength(0);
    });

    it("respects exponential backoff", async () => {
      const now = Date.now();
      await db.syncQueue.add({
        action: "subscribe",
        payload: { feedUrl: "https://retry.com/feed.xml" },
        createdAt: now - 10000,
        attempts: 2,
        lastAttemptAt: now - 1000, // 1 second ago, but backoff is 4 seconds
      });

      const retryable = await getRetryableActions();
      expect(retryable).toHaveLength(0);
    });

    it("includes actions after backoff period", async () => {
      const now = Date.now();
      await db.syncQueue.add({
        action: "subscribe",
        payload: { feedUrl: "https://retry.com/feed.xml" },
        createdAt: now - 10000,
        attempts: 1,
        lastAttemptAt: now - 3000, // 3 seconds ago, backoff is 2 seconds
      });

      const retryable = await getRetryableActions();
      expect(retryable).toHaveLength(1);
    });
  });

  describe("pruneFailedActions", () => {
    it("removes actions with max attempts", async () => {
      await db.syncQueue.add({
        action: "subscribe",
        payload: { feedUrl: "https://failed.com/feed.xml" },
        createdAt: Date.now(),
        attempts: 5,
      });
      await queueSubscribeAction({ feedUrl: "https://ok.com/feed.xml" });

      const pruned = await pruneFailedActions();

      expect(pruned).toBe(1);
      const remaining = await db.syncQueue.toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].payload.feedUrl).toBe("https://ok.com/feed.xml");
    });

    it("returns 0 when no failed actions", async () => {
      await queueSubscribeAction({ feedUrl: "https://ok.com/feed.xml" });

      const pruned = await pruneFailedActions();
      expect(pruned).toBe(0);
    });
  });

  describe("enforceQueueLimit", () => {
    it("does nothing when under limit", async () => {
      await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      const removed = await enforceQueueLimit();
      expect(removed).toBe(0);
    });

    // Note: Testing the 1000 item limit would be slow, so we trust the logic
  });

  describe("atomicity (composed inside a caller transaction)", () => {
    // The *Action helpers are pure Dexie ops with no transaction of their own (see
    // insertDeduped's docstring in syncQueue.ts) — callers (subscriptions.ts,
    // playStatus.ts, useLike.ts) compose them inside their own db.transaction(...).
    // These tests reproduce that composition to prove the dedup-delete-then-insert
    // sequence rolls back as a unit when the caller's transaction aborts.
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("keeps the existing unsubscribe action if the new subscribe insert fails", async () => {
      await queueUnsubscribeAction({ feedUrl: "https://example.com/feed.xml" });
      vi.spyOn(db.syncQueue, "add").mockRejectedValueOnce(new Error("add failed"));

      await expect(
        db.transaction("rw", db.syncQueue, () =>
          queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" }),
        ),
      ).rejects.toThrow("add failed");

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe("unsubscribe");
    });

    it("keeps the existing subscribe action if the new unsubscribe insert fails", async () => {
      await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });
      vi.spyOn(db.syncQueue, "add").mockRejectedValueOnce(new Error("add failed"));

      await expect(
        db.transaction("rw", db.syncQueue, () =>
          queueUnsubscribeAction({ feedUrl: "https://example.com/feed.xml" }),
        ),
      ).rejects.toThrow("add failed");

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe("subscribe");
    });

    it("keeps the existing play status action if the new insert fails", async () => {
      await queuePlayStatusAction({
        episodeId: "ep1",
        feedUrl: "https://example.com/feed.xml",
        position: 100,
        duration: 1000,
        completed: false,
      });
      vi.spyOn(db.syncQueue, "add").mockRejectedValueOnce(new Error("add failed"));

      await expect(
        db.transaction("rw", db.syncQueue, () =>
          queuePlayStatusAction({
            episodeId: "ep1",
            feedUrl: "https://example.com/feed.xml",
            position: 500,
            duration: 1000,
            completed: false,
          }),
        ),
      ).rejects.toThrow("add failed");

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect((actions[0].payload as { position: number }).position).toBe(100);
    });

    it("keeps the existing likePodcast action if the new unlike insert fails", async () => {
      await queueLikeAction("likePodcast", { feedUrl: "https://example.com/feed.xml" });
      vi.spyOn(db.syncQueue, "add").mockRejectedValueOnce(new Error("add failed"));

      await expect(
        db.transaction("rw", db.syncQueue, () =>
          queueLikeAction("unlikePodcast", { feedUrl: "https://example.com/feed.xml" }),
        ),
      ).rejects.toThrow("add failed");

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe("likePodcast");
    });
  });

  describe("hasPendingActions", () => {
    it("returns false for empty queue", async () => {
      const has = await hasPendingActions();
      expect(has).toBe(false);
    });

    it("returns true when actions exist", async () => {
      await queueSubscribeAction({ feedUrl: "https://example.com/feed.xml" });

      const has = await hasPendingActions();
      expect(has).toBe(true);
    });
  });
});
