import { beforeEach, describe, expect, it } from "vitest";
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
  queueAction,
  queuePlayStatus,
  queueSubscribe,
  queueUnsubscribe,
  removeAction,
} from "./syncQueue";

describe("syncQueue", () => {
  beforeEach(async () => {
    await db.syncQueue.clear();
  });

  describe("queueSubscribe", () => {
    it("adds a subscribe action to the queue", async () => {
      const id = await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });

      expect(id).toBeGreaterThan(0);

      const action = await db.syncQueue.get(id);
      expect(action?.action).toBe("subscribe");
      expect(action?.payload.feedUrl).toBe("https://example.com/feed.xml");
      expect(action?.attempts).toBe(0);
    });

    it("deduplicates subscribe actions for same feed", async () => {
      await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });
      await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });

      const count = await db.syncQueue.count();
      expect(count).toBe(1);
    });

    it("removes existing unsubscribe when subscribing", async () => {
      await queueUnsubscribe({ feedUrl: "https://example.com/feed.xml" });
      await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe("subscribe");
    });
  });

  describe("queueUnsubscribe", () => {
    it("adds an unsubscribe action to the queue", async () => {
      const id = await queueUnsubscribe({ feedUrl: "https://example.com/feed.xml" });

      const action = await db.syncQueue.get(id);
      expect(action?.action).toBe("unsubscribe");
    });

    it("removes existing subscribe when unsubscribing", async () => {
      await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });
      await queueUnsubscribe({ feedUrl: "https://example.com/feed.xml" });

      const actions = await db.syncQueue.toArray();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe("unsubscribe");
    });
  });

  describe("queuePlayStatus", () => {
    it("adds a play status action to the queue", async () => {
      const id = await queuePlayStatus({
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
      await queuePlayStatus({
        episodeId: "ep1",
        feedUrl: "https://example.com/feed.xml",
        position: 100,
        duration: 1000,
        completed: false,
      });
      await queuePlayStatus({
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

  describe("queueAction (legacy)", () => {
    it("routes to queueSubscribe", async () => {
      await queueAction("subscribe", { feedUrl: "https://test.com/feed.xml" });

      const actions = await db.syncQueue.toArray();
      expect(actions[0].action).toBe("subscribe");
    });

    it("routes to queueUnsubscribe", async () => {
      await queueAction("unsubscribe", { feedUrl: "https://test.com/feed.xml" });

      const actions = await db.syncQueue.toArray();
      expect(actions[0].action).toBe("unsubscribe");
    });

    it("routes to queuePlayStatus", async () => {
      await queueAction("updatePlayStatus", {
        episodeId: "ep1",
        feedUrl: "https://test.com/feed.xml",
        position: 50,
        duration: 500,
        completed: false,
      });

      const actions = await db.syncQueue.toArray();
      expect(actions[0].action).toBe("updatePlayStatus");
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
      await queueSubscribe({ feedUrl: "https://a.com/feed.xml" });
      await queueSubscribe({ feedUrl: "https://b.com/feed.xml" });
      await queueSubscribe({ feedUrl: "https://c.com/feed.xml" });

      const count = await getPendingCount();
      expect(count).toBe(3);
    });
  });

  describe("markAttempted", () => {
    it("increments attempts and sets lastAttemptAt", async () => {
      const id = await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });

      await markAttempted(id);

      const action = await db.syncQueue.get(id);
      expect(action?.attempts).toBe(1);
      expect(action?.lastAttemptAt).toBeDefined();
    });

    it("stores error message", async () => {
      const id = await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });

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
      const id = await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });

      await removeAction(id);

      const action = await db.syncQueue.get(id);
      expect(action).toBeUndefined();
    });
  });

  describe("clearQueue", () => {
    it("removes all actions", async () => {
      await queueSubscribe({ feedUrl: "https://a.com/feed.xml" });
      await queueSubscribe({ feedUrl: "https://b.com/feed.xml" });

      await clearQueue();

      const count = await db.syncQueue.count();
      expect(count).toBe(0);
    });
  });

  describe("getRetryableActions", () => {
    it("returns actions with 0 attempts", async () => {
      await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });

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
      await queueSubscribe({ feedUrl: "https://ok.com/feed.xml" });

      const pruned = await pruneFailedActions();

      expect(pruned).toBe(1);
      const remaining = await db.syncQueue.toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].payload.feedUrl).toBe("https://ok.com/feed.xml");
    });

    it("returns 0 when no failed actions", async () => {
      await queueSubscribe({ feedUrl: "https://ok.com/feed.xml" });

      const pruned = await pruneFailedActions();
      expect(pruned).toBe(0);
    });
  });

  describe("enforceQueueLimit", () => {
    it("does nothing when under limit", async () => {
      await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });

      const removed = await enforceQueueLimit();
      expect(removed).toBe(0);
    });

    // Note: Testing the 1000 item limit would be slow, so we trust the logic
  });

  describe("hasPendingActions", () => {
    it("returns false for empty queue", async () => {
      const has = await hasPendingActions();
      expect(has).toBe(false);
    });

    it("returns true when actions exist", async () => {
      await queueSubscribe({ feedUrl: "https://example.com/feed.xml" });

      const has = await hasPendingActions();
      expect(has).toBe(true);
    });
  });
});
