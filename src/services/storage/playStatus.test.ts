import { beforeEach, describe, expect, it, vi } from "vitest";
import { toBase64Url } from "../../utils/rssEncoding";
import { db, getSettings } from "./index";
import {
  generateEpisodeId,
  getInProgressEpisodes,
  getPlayStatus,
  getPlayStatusForFeed,
  getRecentlyPlayed,
  markAsCompleted,
  savePlayStatus,
  updatePlayPosition,
} from "./playStatus";

// Mock getSettings to avoid sync queue operations by default (syncServerUrl: null)
vi.mock("./index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./index")>();
  return {
    ...actual,
    getSettings: vi.fn().mockResolvedValue({
      syncServerUrl: null,
      syncToken: null,
    }),
  };
});

describe("playStatus", () => {
  beforeEach(async () => {
    // Clear database before each test
    await db.playStatuses.clear();
    await db.syncQueue.clear();
    vi.restoreAllMocks();
    vi.mocked(getSettings).mockResolvedValue({ locale: "fr", proxies: [] });
  });

  describe("generateEpisodeId", () => {
    it("generates ID from guid and enclosure URL", () => {
      const id = generateEpisodeId("my-guid", "https://example.com/ep.mp3");
      expect(id).toBe(toBase64Url("my-guid,https://example.com/ep.mp3"));
    });

    it("uses enclosure URL when guid is undefined", () => {
      const id = generateEpisodeId(undefined, "https://example.com/ep.mp3");
      expect(id).toBe(toBase64Url("https://example.com/ep.mp3,https://example.com/ep.mp3"));
    });
  });

  describe("getPlayStatus", () => {
    it("returns undefined for non-existent episode", async () => {
      const status = await getPlayStatus("non-existent");
      expect(status).toBeUndefined();
    });

    it("returns saved play status", async () => {
      const episodeId = "test-episode-1";
      await db.playStatuses.put({
        episodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 120,
        duration: 1800,
        completed: false,
        updatedAt: Date.now(),
      });

      const status = await getPlayStatus(episodeId);
      expect(status).toBeDefined();
      expect(status?.position).toBe(120);
      expect(status?.duration).toBe(1800);
    });
  });

  describe("getPlayStatusForFeed", () => {
    it("returns all play statuses for a feed", async () => {
      const feedUrl = "https://example.com/feed.xml";

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

      const statuses = await getPlayStatusForFeed(feedUrl);
      expect(statuses).toHaveLength(2);
      expect(statuses.map((s) => s.episodeId)).toContain("ep1");
      expect(statuses.map((s) => s.episodeId)).toContain("ep2");
    });
  });

  describe("savePlayStatus", () => {
    it("saves a new play status", async () => {
      await savePlayStatus({
        episodeId: "new-episode",
        feedUrl: "https://example.com/feed.xml",
        position: 60,
        duration: 1200,
        completed: false,
      });

      const status = await db.playStatuses.get("new-episode");
      expect(status).toBeDefined();
      expect(status?.position).toBe(60);
      expect(status?.updatedAt).toBeDefined();
    });

    it("updates existing play status", async () => {
      const episodeId = "update-test";
      await db.playStatuses.put({
        episodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 100,
        duration: 1000,
        completed: false,
        updatedAt: Date.now() - 10000,
      });

      await savePlayStatus({
        episodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 500,
        duration: 1000,
        completed: false,
      });

      const status = await db.playStatuses.get(episodeId);
      expect(status?.position).toBe(500);
    });
  });

  describe("updatePlayPosition", () => {
    it("creates play status if not exists", async () => {
      await updatePlayPosition("new-ep", "https://example.com/feed.xml", 30, 600);

      const status = await db.playStatuses.get("new-ep");
      expect(status).toBeDefined();
      expect(status?.position).toBe(30);
      expect(status?.duration).toBe(600);
    });

    it("marks as completed at 95% progress", async () => {
      await updatePlayPosition("complete-test", "https://example.com/feed.xml", 950, 1000);

      const status = await db.playStatuses.get("complete-test");
      expect(status?.completed).toBe(true);
    });

    it("does not mark as completed below 95%", async () => {
      await updatePlayPosition("incomplete-test", "https://example.com/feed.xml", 940, 1000);

      const status = await db.playStatuses.get("incomplete-test");
      expect(status?.completed).toBe(false);
    });

    it("preserves completed status once set", async () => {
      // First, mark as completed
      await db.playStatuses.put({
        episodeId: "already-complete",
        feedUrl: "https://example.com/feed.xml",
        position: 1000,
        duration: 1000,
        completed: true,
        updatedAt: Date.now(),
      });

      // Then update position to earlier (e.g., replay)
      await updatePlayPosition("already-complete", "https://example.com/feed.xml", 100, 1000);

      const status = await db.playStatuses.get("already-complete");
      expect(status?.completed).toBe(true);
      expect(status?.position).toBe(100);
    });
  });

  describe("atomicity (sync enabled)", () => {
    beforeEach(() => {
      vi.mocked(getSettings).mockResolvedValue({
        locale: "fr",
        proxies: [],
        syncServerUrl: "https://sync.example.com",
        syncToken: "token",
      });
    });

    it("rolls back savePlayStatus when queuing the sync action fails", async () => {
      vi.spyOn(db.syncQueue, "add").mockRejectedValueOnce(new Error("queue failed"));

      await expect(
        savePlayStatus({
          episodeId: "atomic-save",
          feedUrl: "https://example.com/feed.xml",
          position: 60,
          duration: 1200,
          completed: false,
        }),
      ).rejects.toThrow("queue failed");

      expect(await db.playStatuses.get("atomic-save")).toBeUndefined();
      expect(await db.syncQueue.count()).toBe(0);
    });

    it("rolls back updatePlayPosition when queuing the sync action fails", async () => {
      // Completion always queues regardless of throttle, guaranteeing the queue branch runs
      vi.spyOn(db.syncQueue, "add").mockRejectedValueOnce(new Error("queue failed"));

      await expect(
        updatePlayPosition("atomic-update", "https://example.com/feed.xml", 1000, 1000),
      ).rejects.toThrow("queue failed");

      expect(await db.playStatuses.get("atomic-update")).toBeUndefined();
      expect(await db.syncQueue.count()).toBe(0);
    });
  });

  describe("savePlayStatus throttling (sync enabled)", () => {
    beforeEach(() => {
      vi.mocked(getSettings).mockResolvedValue({
        locale: "fr",
        proxies: [],
        syncServerUrl: "https://sync.example.com",
        syncToken: "token",
      });
    });

    it("queues on the first call", async () => {
      await savePlayStatus({
        episodeId: "throttle-first",
        feedUrl: "https://example.com/feed.xml",
        position: 10,
        duration: 1000,
        completed: false,
      });

      expect(await db.syncQueue.count()).toBe(1);
    });

    it("does not queue again on a second call within the throttle window, but still saves locally", async () => {
      // Queue dedup would collapse two inserts down to a queue count of 1 either way,
      // so count the real db.syncQueue.add calls to prove the second call is skipped.
      const addSpy = vi.spyOn(db.syncQueue, "add");
      const episodeId = "throttle-repeat";
      await savePlayStatus({
        episodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 10,
        duration: 1000,
        completed: false,
      });
      expect(addSpy).toHaveBeenCalledTimes(1);

      await savePlayStatus({
        episodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 20,
        duration: 1000,
        completed: false,
      });

      // Second call within the throttle window must not touch the queue at all
      expect(addSpy).toHaveBeenCalledTimes(1);
      // But the local play status is updated on every call regardless of throttling
      const status = await db.playStatuses.get(episodeId);
      expect(status?.position).toBe(20);
    });

    it("queues immediately when completed, even within the throttle window", async () => {
      const addSpy = vi.spyOn(db.syncQueue, "add");
      const episodeId = "throttle-completed";
      await savePlayStatus({
        episodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 10,
        duration: 1000,
        completed: false,
      });
      expect(addSpy).toHaveBeenCalledTimes(1);

      await savePlayStatus({
        episodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 1000,
        duration: 1000,
        completed: true,
      });

      // Completion forces an immediate queue insert rather than waiting out the throttle window
      expect(addSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("markAsCompleted", () => {
    it("marks episode as completed", async () => {
      await markAsCompleted("mark-complete", "https://example.com/feed.xml", 1800);

      const status = await db.playStatuses.get("mark-complete");
      expect(status?.completed).toBe(true);
      expect(status?.position).toBe(1800);
      expect(status?.duration).toBe(1800);
    });
  });

  describe("getRecentlyPlayed", () => {
    it("returns episodes ordered by updatedAt descending", async () => {
      const now = Date.now();
      await db.playStatuses.bulkPut([
        {
          episodeId: "old",
          feedUrl: "https://example.com/feed.xml",
          position: 100,
          duration: 1000,
          completed: false,
          updatedAt: now - 10000,
        },
        {
          episodeId: "newest",
          feedUrl: "https://example.com/feed.xml",
          position: 200,
          duration: 2000,
          completed: false,
          updatedAt: now,
        },
        {
          episodeId: "middle",
          feedUrl: "https://example.com/feed.xml",
          position: 150,
          duration: 1500,
          completed: false,
          updatedAt: now - 5000,
        },
      ]);

      const recent = await getRecentlyPlayed(3);
      expect(recent[0].episodeId).toBe("newest");
      expect(recent[1].episodeId).toBe("middle");
      expect(recent[2].episodeId).toBe("old");
    });

    it("respects limit parameter", async () => {
      await db.playStatuses.bulkPut(
        Array.from({ length: 20 }, (_, i) => ({
          episodeId: `ep-${i}`,
          feedUrl: "https://example.com/feed.xml",
          position: i * 10,
          duration: 1000,
          completed: false,
          updatedAt: Date.now() - i * 1000,
        })),
      );

      const recent = await getRecentlyPlayed(5);
      expect(recent).toHaveLength(5);
    });
  });

  describe("getInProgressEpisodes", () => {
    it("returns only episodes with position > 0 and not completed", async () => {
      await db.playStatuses.bulkPut([
        {
          episodeId: "in-progress",
          feedUrl: "https://example.com/feed.xml",
          position: 500,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
        {
          episodeId: "completed",
          feedUrl: "https://example.com/feed.xml",
          position: 1000,
          duration: 1000,
          completed: true,
          updatedAt: Date.now(),
        },
        {
          episodeId: "not-started",
          feedUrl: "https://example.com/feed.xml",
          position: 0,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
      ]);

      const inProgress = await getInProgressEpisodes();
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].episodeId).toBe("in-progress");
    });
  });
});
