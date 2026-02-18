import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./index";
import {
  addSubscription,
  getSubscription,
  getSubscriptions,
  hasSubscription,
  removeSubscription,
  updateSubscription,
} from "./subscriptions";

// Mock getSettings and queueAction to avoid sync queue operations
vi.mock("./index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./index")>();
  return {
    ...actual,
    getSettings: vi.fn().mockResolvedValue({
      syncServerUrl: null,
      syncToken: null,
    }),
    invalidateFeedCache: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("./syncQueue", () => ({
  queueAction: vi.fn().mockResolvedValue(undefined),
}));

describe("subscriptions", () => {
  beforeEach(async () => {
    // Clear database before each test
    await db.subscriptions.clear();
    await db.playStatuses.clear();
  });

  describe("getSubscriptions", () => {
    it("returns empty array when no subscriptions", async () => {
      const subs = await getSubscriptions();
      expect(subs).toEqual([]);
    });

    it("returns subscriptions ordered by addedAt descending", async () => {
      const now = Date.now();
      await db.subscriptions.bulkPut([
        { url: "https://oldest.com/feed.xml", addedAt: now - 10000 },
        { url: "https://newest.com/feed.xml", addedAt: now },
        { url: "https://middle.com/feed.xml", addedAt: now - 5000 },
      ]);

      const subs = await getSubscriptions();
      expect(subs).toHaveLength(3);
      expect(subs[0].url).toBe("https://newest.com/feed.xml");
      expect(subs[1].url).toBe("https://middle.com/feed.xml");
      expect(subs[2].url).toBe("https://oldest.com/feed.xml");
    });
  });

  describe("getSubscription", () => {
    it("returns undefined for non-existent subscription", async () => {
      const sub = await getSubscription("https://nonexistent.com/feed.xml");
      expect(sub).toBeUndefined();
    });

    it("returns subscription by URL", async () => {
      const url = "https://example.com/feed.xml";
      await db.subscriptions.put({
        url,
        addedAt: Date.now(),
        title: "Test Podcast",
      });

      const sub = await getSubscription(url);
      expect(sub).toBeDefined();
      expect(sub?.url).toBe(url);
      expect(sub?.title).toBe("Test Podcast");
    });
  });

  describe("addSubscription", () => {
    it("adds a new subscription", async () => {
      const url = "https://new.com/feed.xml";
      const sub = await addSubscription(url);

      expect(sub.url).toBe(url);
      expect(sub.addedAt).toBeDefined();

      const stored = await db.subscriptions.get(url);
      expect(stored).toBeDefined();
    });

    it("returns existing subscription if already subscribed", async () => {
      const url = "https://existing.com/feed.xml";
      const originalTime = Date.now() - 10000;
      await db.subscriptions.put({
        url,
        addedAt: originalTime,
      });

      const sub = await addSubscription(url);
      expect(sub.addedAt).toBe(originalTime);
    });

    it("does not create duplicate subscriptions", async () => {
      const url = "https://test.com/feed.xml";
      await addSubscription(url);
      await addSubscription(url);

      const count = await db.subscriptions.count();
      expect(count).toBe(1);
    });
  });

  describe("updateSubscription", () => {
    it("updates subscription properties", async () => {
      const url = "https://update.com/feed.xml";
      await db.subscriptions.put({
        url,
        addedAt: Date.now(),
      });

      await updateSubscription(url, {
        title: "Updated Title",
        image: "https://example.com/cover.jpg",
      });

      const sub = await db.subscriptions.get(url);
      expect(sub?.title).toBe("Updated Title");
      expect(sub?.image).toBe("https://example.com/cover.jpg");
    });

    it("preserves existing properties when updating", async () => {
      const url = "https://preserve.com/feed.xml";
      const addedAt = Date.now() - 5000;
      await db.subscriptions.put({
        url,
        addedAt,
        title: "Original Title",
      });

      await updateSubscription(url, { image: "https://example.com/new.jpg" });

      const sub = await db.subscriptions.get(url);
      expect(sub?.title).toBe("Original Title");
      expect(sub?.addedAt).toBe(addedAt);
    });
  });

  describe("removeSubscription", () => {
    it("removes subscription by URL", async () => {
      const url = "https://remove.com/feed.xml";
      await db.subscriptions.put({
        url,
        addedAt: Date.now(),
      });

      await removeSubscription(url);

      const sub = await db.subscriptions.get(url);
      expect(sub).toBeUndefined();
    });

    it("removes associated play statuses", async () => {
      const feedUrl = "https://cleanup.com/feed.xml";
      await db.subscriptions.put({
        url: feedUrl,
        addedAt: Date.now(),
      });
      await db.playStatuses.bulkPut([
        {
          episodeId: "ep1",
          feedUrl,
          position: 100,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
        {
          episodeId: "ep2",
          feedUrl,
          position: 200,
          duration: 2000,
          completed: true,
          updatedAt: Date.now(),
        },
        {
          episodeId: "ep3",
          feedUrl: "https://other.com/feed.xml",
          position: 300,
          duration: 3000,
          completed: false,
          updatedAt: Date.now(),
        },
      ]);

      await removeSubscription(feedUrl);

      const remainingStatuses = await db.playStatuses.toArray();
      expect(remainingStatuses).toHaveLength(1);
      expect(remainingStatuses[0].feedUrl).toBe("https://other.com/feed.xml");
    });

    it("handles removal of non-existent subscription gracefully", async () => {
      await expect(removeSubscription("https://nonexistent.com/feed.xml")).resolves.not.toThrow();
    });
  });

  describe("hasSubscription", () => {
    it("returns false when not subscribed", async () => {
      const has = await hasSubscription("https://nonexistent.com/feed.xml");
      expect(has).toBe(false);
    });

    it("returns true when subscribed", async () => {
      const url = "https://subscribed.com/feed.xml";
      await db.subscriptions.put({
        url,
        addedAt: Date.now(),
      });

      const has = await hasSubscription(url);
      expect(has).toBe(true);
    });
  });
});
