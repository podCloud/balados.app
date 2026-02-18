import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEvents,
  createSnapshot,
  createSnapshotAndPrune,
  getEventCount,
  getEvents,
  getLatestSnapshot,
  getListeningStats,
  logEvent,
  pruneNonEssentialEvents,
} from "./events";
import { db } from "./index";

describe("events", () => {
  beforeEach(async () => {
    await db.events.clear();
    await db.statsSnapshots.clear();
  });

  describe("logEvent", () => {
    it("should log event with timestamp", async () => {
      await logEvent("play_started", {
        feedUrl: "https://example.com/feed.xml",
        episodeId: "ep1",
      });

      const events = await db.events.toArray();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("play_started");
      expect(events[0].feedUrl).toBe("https://example.com/feed.xml");
      expect(events[0].episodeId).toBe("ep1");
      expect(events[0].timestamp).toBeGreaterThan(0);
    });

    it("should log event without optional fields", async () => {
      await logEvent("subscription_added");

      const events = await db.events.toArray();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("subscription_added");
      expect(events[0].feedUrl).toBeUndefined();
    });

    it("should log event with metadata", async () => {
      await logEvent("play_paused", {
        feedUrl: "https://example.com/feed.xml",
        metadata: { position: 120 },
      });

      const events = await db.events.toArray();
      expect(events[0].metadata).toEqual({ position: 120 });
    });
  });

  describe("getEvents", () => {
    beforeEach(async () => {
      // Add test events
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_completed", { feedUrl: "feed1" });
      await logEvent("play_started", { feedUrl: "feed2" });
      await logEvent("subscription_added", { feedUrl: "feed3" });
    });

    it("should return all events in reverse chronological order", async () => {
      const events = await getEvents();
      expect(events).toHaveLength(4);
      // Most recent first
      expect(events[0].type).toBe("subscription_added");
    });

    it("should filter by type", async () => {
      const events = await getEvents({ type: "play_started" });
      expect(events).toHaveLength(2);
      for (const e of events) expect(e.type).toBe("play_started");
    });

    it("should filter by feedUrl", async () => {
      const events = await getEvents({ feedUrl: "feed1" });
      expect(events).toHaveLength(2);
      for (const e of events) expect(e.feedUrl).toBe("feed1");
    });

    it("should limit results", async () => {
      const events = await getEvents({ limit: 2 });
      expect(events).toHaveLength(2);
    });

    it("should filter by since timestamp", async () => {
      const now = Date.now();
      await logEvent("play_started", { feedUrl: "new" });

      const events = await getEvents({ since: now - 100 });
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some((e) => e.feedUrl === "new")).toBe(true);
    });
  });

  describe("getListeningStats", () => {
    it("should return zero stats when no events", async () => {
      const stats = await getListeningStats();
      expect(stats.totalPlays).toBe(0);
      expect(stats.completedPlays).toBe(0);
      expect(stats.topPodcasts).toHaveLength(0);
    });

    it("should count plays correctly", async () => {
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_completed", { feedUrl: "feed1" });
      await logEvent("play_started", { feedUrl: "feed2" });

      const stats = await getListeningStats();
      expect(stats.totalPlays).toBe(3);
      expect(stats.completedPlays).toBe(1);
    });

    it("should return top podcasts sorted by count", async () => {
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_started", { feedUrl: "feed2" });
      await logEvent("play_started", { feedUrl: "feed2" });
      await logEvent("play_started", { feedUrl: "feed3" });

      const stats = await getListeningStats();
      expect(stats.topPodcasts).toHaveLength(3);
      expect(stats.topPodcasts[0].feedUrl).toBe("feed1");
      expect(stats.topPodcasts[0].count).toBe(3);
      expect(stats.topPodcasts[1].feedUrl).toBe("feed2");
      expect(stats.topPodcasts[1].count).toBe(2);
    });

    it("should filter by since timestamp", async () => {
      await logEvent("play_started", { feedUrl: "old" });
      await new Promise((r) => setTimeout(r, 50));
      const cutoff = Date.now();
      await new Promise((r) => setTimeout(r, 50));
      await logEvent("play_started", { feedUrl: "new" });

      const stats = await getListeningStats(cutoff - 100);
      expect(stats.totalPlays).toBe(2);

      const statsRecent = await getListeningStats(cutoff);
      expect(statsRecent.totalPlays).toBe(1);
    });
  });

  describe("clearEvents", () => {
    it("should clear all events when no timestamp provided", async () => {
      await logEvent("play_started");
      await logEvent("play_completed");

      await clearEvents();

      const events = await db.events.toArray();
      expect(events).toHaveLength(0);
    });

    it("should clear events before timestamp", async () => {
      await logEvent("play_started", { feedUrl: "old" });
      const cutoff = Date.now() + 100;
      await new Promise((r) => setTimeout(r, 150));
      await logEvent("play_started", { feedUrl: "new" });

      await clearEvents(cutoff);

      const events = await db.events.toArray();
      expect(events).toHaveLength(1);
      expect(events[0].feedUrl).toBe("new");
    });
  });

  describe("getEventCount", () => {
    it("should return correct count", async () => {
      expect(await getEventCount()).toBe(0);

      await logEvent("play_started");
      await logEvent("play_completed");

      expect(await getEventCount()).toBe(2);
    });
  });

  describe("pruneNonEssentialEvents", () => {
    it("should preserve play_started and play_completed events", async () => {
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_completed", { feedUrl: "feed1" });
      await logEvent("play_paused", { feedUrl: "feed1" });
      await logEvent("subscription_added", { feedUrl: "feed2" });

      // Wait a bit so events are older than cutoff
      await new Promise((r) => setTimeout(r, 50));

      // Prune events older than 10ms (all of them)
      await pruneNonEssentialEvents(10);

      const events = await db.events.toArray();
      // Only play_started and play_completed should remain
      expect(events).toHaveLength(2);
      expect(events.some((e) => e.type === "play_started")).toBe(true);
      expect(events.some((e) => e.type === "play_completed")).toBe(true);
      expect(events.some((e) => e.type === "play_paused")).toBe(false);
    });

    it("should only prune events older than cutoff", async () => {
      await logEvent("play_paused", { feedUrl: "old" });
      await new Promise((r) => setTimeout(r, 100));
      await logEvent("play_paused", { feedUrl: "new" });

      // Prune events older than 50ms
      await pruneNonEssentialEvents(50);

      const events = await db.events.toArray();
      expect(events).toHaveLength(1);
      expect(events[0].feedUrl).toBe("new");
    });
  });

  describe("createSnapshot", () => {
    it("should create snapshot from play events", async () => {
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_completed", { feedUrl: "feed1" });

      // Wait to ensure events have earlier timestamp than snapshot cutoff
      await new Promise((r) => setTimeout(r, 10));
      const snapshot = await createSnapshot();

      expect(snapshot.totalPlays).toBe(1);
      expect(snapshot.completedPlays).toBe(1);
      expect(snapshot.podcastStats).toHaveLength(1);
      expect(snapshot.podcastStats[0].feedUrl).toBe("feed1");
      expect(snapshot.podcastStats[0].plays).toBe(1);
      expect(snapshot.podcastStats[0].completed).toBe(1);
      expect(snapshot.id).toBeDefined();
    });

    it("should aggregate plays per podcast", async () => {
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_completed", { feedUrl: "feed1" });
      await logEvent("play_started", { feedUrl: "feed2" });

      // Wait to ensure events have earlier timestamp than snapshot cutoff
      await new Promise((r) => setTimeout(r, 10));
      const snapshot = await createSnapshot();

      expect(snapshot.totalPlays).toBe(3);
      expect(snapshot.completedPlays).toBe(1);
      expect(snapshot.podcastStats).toHaveLength(2);

      const feed1Stats = snapshot.podcastStats.find((p) => p.feedUrl === "feed1");
      expect(feed1Stats?.plays).toBe(2);
      expect(feed1Stats?.completed).toBe(1);

      const feed2Stats = snapshot.podcastStats.find((p) => p.feedUrl === "feed2");
      expect(feed2Stats?.plays).toBe(1);
      expect(feed2Stats?.completed).toBe(0);
    });

    it("should ignore events without feedUrl", async () => {
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_started"); // No feedUrl

      // Wait to ensure events have earlier timestamp than snapshot cutoff
      await new Promise((r) => setTimeout(r, 10));
      const snapshot = await createSnapshot();

      expect(snapshot.totalPlays).toBe(1);
      expect(snapshot.podcastStats).toHaveLength(1);
    });
  });

  describe("getLatestSnapshot", () => {
    it("should return null when no snapshots exist", async () => {
      const snapshot = await getLatestSnapshot();
      expect(snapshot).toBeNull();
    });

    it("should return the most recent snapshot", async () => {
      await logEvent("play_started", { feedUrl: "feed1" });
      // Wait to ensure event has earlier timestamp than snapshot cutoff
      await new Promise((r) => setTimeout(r, 10));
      await createSnapshot();

      await new Promise((r) => setTimeout(r, 10));

      await logEvent("play_started", { feedUrl: "feed2" });
      // Wait to ensure event has earlier timestamp than snapshot cutoff
      await new Promise((r) => setTimeout(r, 10));
      const second = await createSnapshot();

      const latest = await getLatestSnapshot();
      expect(latest?.id).toBe(second.id);
      expect(latest?.totalPlays).toBe(2);
    });
  });

  describe("createSnapshotAndPrune", () => {
    it("should create snapshot and prune old play events", async () => {
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_completed", { feedUrl: "feed1" });

      // Wait to ensure events have earlier timestamp than snapshot
      await new Promise((r) => setTimeout(r, 10));

      const { snapshot, prunedCount } = await createSnapshotAndPrune();

      expect(snapshot.totalPlays).toBe(1);
      expect(prunedCount).toBe(2);

      const events = await db.events.toArray();
      expect(events).toHaveLength(0);
    });

    it("should preserve non-play events during prune", async () => {
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("subscription_added", { feedUrl: "feed2" });

      // Wait to ensure events have earlier timestamp than snapshot
      await new Promise((r) => setTimeout(r, 10));

      const { prunedCount } = await createSnapshotAndPrune();

      expect(prunedCount).toBe(1);

      const events = await db.events.toArray();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("subscription_added");
    });
  });

  describe("getListeningStats with snapshots", () => {
    it("should combine snapshot with recent events", async () => {
      // Create old events and snapshot
      await logEvent("play_started", { feedUrl: "feed1" });
      await logEvent("play_completed", { feedUrl: "feed1" });

      // Wait to ensure events have earlier timestamp than snapshot
      await new Promise((r) => setTimeout(r, 10));
      await createSnapshotAndPrune();

      // Add new events after snapshot
      await logEvent("play_started", { feedUrl: "feed2" });

      const stats = await getListeningStats();

      // 1 from snapshot + 1 recent
      expect(stats.totalPlays).toBe(2);
      expect(stats.completedPlays).toBe(1);
      expect(stats.topPodcasts).toHaveLength(2);
    });

    it("should ignore snapshot when since is specified", async () => {
      await logEvent("play_started", { feedUrl: "old" });

      // Wait to ensure event has earlier timestamp than snapshot
      await new Promise((r) => setTimeout(r, 10));
      await createSnapshotAndPrune();

      await new Promise((r) => setTimeout(r, 50));
      const cutoff = Date.now();
      await new Promise((r) => setTimeout(r, 50));

      await logEvent("play_started", { feedUrl: "new" });

      const stats = await getListeningStats(cutoff);

      // Only the new event
      expect(stats.totalPlays).toBe(1);
      expect(stats.topPodcasts[0].feedUrl).toBe("new");
    });
  });
});
