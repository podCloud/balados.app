import { describe, it, expect } from "vitest";
import {
  mergeSubscriptions,
  mergePlayStatuses,
  subscriptionsToSync,
  playStatusesToSync,
} from "./merger";
import type { Subscription, PlayStatus } from "../../types";
import type { SubscriptionSync, PlayStatusSync } from "./client";

describe("mergeSubscriptions", () => {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;

  it("should keep local-only subscriptions", () => {
    const local: Subscription[] = [
      { url: "https://example.com/feed.xml", addedAt: now },
    ];
    const remote: SubscriptionSync[] = [];

    const result = mergeSubscriptions(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].url).toBe("https://example.com/feed.xml");
    expect(result.conflicts).toHaveLength(0);
  });

  it("should add remote-only subscriptions", () => {
    const local: Subscription[] = [];
    const remote: SubscriptionSync[] = [
      {
        rss_source_feed: btoa("https://example.com/feed.xml"),
        subscribed_at: new Date(now).toISOString(),
      },
    ];

    const result = mergeSubscriptions(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].url).toBe("https://example.com/feed.xml");
    expect(result.conflicts).toHaveLength(0);
  });

  it("should prefer newer local subscription", () => {
    const local: Subscription[] = [
      { url: "https://example.com/feed.xml", addedAt: now, title: "Local Title" },
    ];
    const remote: SubscriptionSync[] = [
      {
        rss_source_feed: btoa("https://example.com/feed.xml"),
        subscribed_at: new Date(dayAgo).toISOString(),
      },
    ];

    const result = mergeSubscriptions(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].addedAt).toBe(now);
    expect(result.merged[0].title).toBe("Local Title");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toBe("local_newer");
  });

  it("should prefer newer remote subscription but keep local metadata", () => {
    const local: Subscription[] = [
      {
        url: "https://example.com/feed.xml",
        addedAt: dayAgo,
        title: "Local Title",
        image: "local-image.jpg",
      },
    ];
    const remote: SubscriptionSync[] = [
      {
        rss_source_feed: btoa("https://example.com/feed.xml"),
        subscribed_at: new Date(now).toISOString(),
      },
    ];

    const result = mergeSubscriptions(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].addedAt).toBe(now);
    expect(result.merged[0].title).toBe("Local Title");
    expect(result.merged[0].image).toBe("local-image.jpg");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toBe("remote_newer");
  });

  it("should respect remote unsubscription when it's newer", () => {
    const local: Subscription[] = [
      { url: "https://example.com/feed.xml", addedAt: dayAgo },
    ];
    const remote: SubscriptionSync[] = [
      {
        rss_source_feed: btoa("https://example.com/feed.xml"),
        subscribed_at: new Date(dayAgo).toISOString(),
        unsubscribed_at: new Date(now).toISOString(),
      },
    ];

    const result = mergeSubscriptions(local, remote);

    expect(result.merged).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toBe("remote_unsubscribed_newer");
  });

  it("should keep local subscription if subscribed after remote unsubscribe", () => {
    const local: Subscription[] = [
      { url: "https://example.com/feed.xml", addedAt: now },
    ];
    const remote: SubscriptionSync[] = [
      {
        rss_source_feed: btoa("https://example.com/feed.xml"),
        subscribed_at: new Date(dayAgo - 1000).toISOString(),
        unsubscribed_at: new Date(dayAgo).toISOString(),
      },
    ];

    const result = mergeSubscriptions(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].addedAt).toBe(now);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toBe("local_subscribe_after_remote_unsubscribe");
  });

  it("should skip remote unsubscribed outside retention period", () => {
    const local: Subscription[] = [];
    const fiftyDaysAgo = now - 50 * 24 * 60 * 60 * 1000;
    const remote: SubscriptionSync[] = [
      {
        rss_source_feed: btoa("https://example.com/feed.xml"),
        subscribed_at: new Date(fiftyDaysAgo - 1000).toISOString(),
        unsubscribed_at: new Date(fiftyDaysAgo).toISOString(),
      },
    ];

    const result = mergeSubscriptions(local, remote);

    expect(result.merged).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("should not create conflict for close timestamps", () => {
    const local: Subscription[] = [
      { url: "https://example.com/feed.xml", addedAt: now },
    ];
    const twoMinutesAgo = now - 2 * 60 * 1000;
    const remote: SubscriptionSync[] = [
      {
        rss_source_feed: btoa("https://example.com/feed.xml"),
        subscribed_at: new Date(twoMinutesAgo).toISOString(),
      },
    ];

    const result = mergeSubscriptions(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it("should merge multiple subscriptions correctly", () => {
    const local: Subscription[] = [
      { url: "https://a.com/feed.xml", addedAt: now },
      { url: "https://b.com/feed.xml", addedAt: dayAgo },
    ];
    const remote: SubscriptionSync[] = [
      {
        rss_source_feed: btoa("https://b.com/feed.xml"),
        subscribed_at: new Date(now).toISOString(),
      },
      {
        rss_source_feed: btoa("https://c.com/feed.xml"),
        subscribed_at: new Date(hourAgo).toISOString(),
      },
    ];

    const result = mergeSubscriptions(local, remote);

    expect(result.merged).toHaveLength(3);
    const urls = result.merged.map((s) => s.url);
    expect(urls).toContain("https://a.com/feed.xml");
    expect(urls).toContain("https://b.com/feed.xml");
    expect(urls).toContain("https://c.com/feed.xml");
  });
});

describe("mergePlayStatuses", () => {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const twoMinutesAgo = now - 2 * 60 * 1000;

  // episodeId format: btoa(guid,enclosureUrl) - same as rss_source_item
  const defaultEpisodeId = btoa("episode-guid-1,https://example.com/episode.mp3");

  const createLocalStatus = (overrides: Partial<PlayStatus> = {}): PlayStatus => ({
    episodeId: defaultEpisodeId,
    feedUrl: "https://example.com/feed.xml",
    position: 100,
    duration: 1000,
    completed: false,
    updatedAt: now,
    ...overrides,
  });

  const createRemoteStatus = (
    overrides: Partial<PlayStatusSync> = {}
  ): PlayStatusSync => ({
    rss_source_feed: btoa("https://example.com/feed.xml"),
    rss_source_item: defaultEpisodeId, // Same format as local episodeId
    position: 100,
    played: false,
    updated_at: new Date(now).toISOString(),
    ...overrides,
  });

  it("should keep local-only play status", () => {
    const local: PlayStatus[] = [createLocalStatus()];
    const remote: PlayStatusSync[] = [];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].episodeId).toBe(defaultEpisodeId);
    expect(result.conflicts).toHaveLength(0);
  });

  it("should add remote-only play status", () => {
    const local: PlayStatus[] = [];
    const remote: PlayStatusSync[] = [createRemoteStatus({ position: 200 })];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].position).toBe(200);
    expect(result.conflicts).toHaveLength(0);
  });

  it("should use higher position when timestamps are close", () => {
    const local: PlayStatus[] = [
      createLocalStatus({ position: 100, updatedAt: now }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({
        position: 200,
        updated_at: new Date(twoMinutesAgo).toISOString(),
      }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].position).toBe(200);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toBe("close_timestamps_remote_position_higher");
  });

  it("should use local position when local is higher and timestamps close", () => {
    const local: PlayStatus[] = [
      createLocalStatus({ position: 300, updatedAt: now }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({
        position: 200,
        updated_at: new Date(twoMinutesAgo).toISOString(),
      }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].position).toBe(300);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toBe("close_timestamps_local_position_higher");
  });

  it("should use local when local timestamp is significantly newer", () => {
    const local: PlayStatus[] = [
      createLocalStatus({ position: 100, updatedAt: now }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({
        position: 500,
        updated_at: new Date(hourAgo).toISOString(),
      }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].position).toBe(100);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toBe("local_timestamp_newer");
  });

  it("should use remote when remote timestamp is significantly newer", () => {
    const local: PlayStatus[] = [
      createLocalStatus({ position: 500, updatedAt: hourAgo }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({
        position: 100,
        updated_at: new Date(now).toISOString(),
      }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].position).toBe(100);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toBe("remote_timestamp_newer");
  });

  it("should preserve completed status (sticky)", () => {
    const local: PlayStatus[] = [
      createLocalStatus({ completed: true, updatedAt: hourAgo }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({
        played: false,
        updated_at: new Date(now).toISOString(),
      }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].completed).toBe(true);
  });

  it("should set completed when remote says played", () => {
    const local: PlayStatus[] = [
      createLocalStatus({ completed: false, updatedAt: now }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({
        played: true,
        updated_at: new Date(hourAgo).toISOString(),
      }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].completed).toBe(true);
  });

  it("should not create conflict when values are identical", () => {
    const local: PlayStatus[] = [
      createLocalStatus({ position: 100, completed: false }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({ position: 100, played: false }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it("should use max timestamp for resolved item", () => {
    const local: PlayStatus[] = [
      createLocalStatus({ position: 100, updatedAt: hourAgo }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({
        position: 200,
        updated_at: new Date(now).toISOString(),
      }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].updatedAt).toBe(now);
  });

  it("should merge multiple play statuses correctly", () => {
    // Create encoded episode IDs in btoa(guid,enclosureUrl) format
    const ep1Id = btoa("ep1-guid,https://example.com/ep1.mp3");
    const ep2Id = btoa("ep2-guid,https://example.com/ep2.mp3");
    const ep3Id = btoa("ep3-guid,https://example.com/ep3.mp3");

    const local: PlayStatus[] = [
      createLocalStatus({ episodeId: ep1Id, position: 100 }),
      createLocalStatus({ episodeId: ep2Id, position: 200 }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({
        rss_source_item: ep2Id,
        position: 300,
      }),
      createRemoteStatus({
        rss_source_item: ep3Id,
        position: 50,
      }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(3);
    const byId = Object.fromEntries(
      result.merged.map((s) => [s.episodeId, s])
    );
    expect(byId[ep1Id].position).toBe(100);
    expect(byId[ep2Id].position).toBe(300); // Remote higher, close timestamps
    expect(byId[ep3Id].position).toBe(50);
  });
});

describe("subscriptionsToSync", () => {
  it("should convert subscriptions to sync format", () => {
    const subscriptions: Subscription[] = [
      {
        url: "https://example.com/feed.xml",
        addedAt: 1704067200000, // 2024-01-01T00:00:00Z
      },
    ];

    const result = subscriptionsToSync(subscriptions);

    expect(result).toHaveLength(1);
    expect(result[0].rss_source_feed).toBe(btoa("https://example.com/feed.xml"));
    expect(result[0].subscribed_at).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("playStatusesToSync", () => {
  it("should convert play statuses to sync format", () => {
    // episodeId is already in btoa(guid,enclosureUrl) format
    const encodedEpisodeId = btoa("episode-guid-1,https://example.com/episode.mp3");

    const statuses: PlayStatus[] = [
      {
        episodeId: encodedEpisodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 120,
        duration: 1000,
        completed: true,
        updatedAt: 1704067200000,
      },
    ];

    const result = playStatusesToSync(statuses);

    expect(result).toHaveLength(1);
    expect(result[0].rss_source_feed).toBe(btoa("https://example.com/feed.xml"));
    // rss_source_item should be the same as episodeId (already encoded)
    expect(result[0].rss_source_item).toBe(encodedEpisodeId);
    expect(result[0].position).toBe(120);
    expect(result[0].played).toBe(true);
    expect(result[0].updated_at).toBe("2024-01-01T00:00:00.000Z");
  });

  it("should not double-encode episode IDs when converting to sync format", () => {
    // This test verifies the fix for the critical encoding bug
    // episodeId is already in btoa(guid,enclosureUrl) format
    const episodeId = btoa("test-guid,https://example.com/episode.mp3");

    const result = playStatusesToSync([
      {
        episodeId,
        feedUrl: "https://example.com/feed.xml",
        position: 60,
        duration: 300,
        completed: false,
        updatedAt: new Date("2024-01-01").getTime(),
      },
    ]);

    // rss_source_item should be exactly the same as episodeId (not double-encoded)
    expect(result[0].rss_source_item).toBe(episodeId);
    expect(result[0].rss_source_item).not.toBe(btoa(episodeId)); // Not double-encoded!
  });
});

describe("Episode ID encoding round-trip", () => {
  it("should correctly identify same episode after sync round-trip", () => {
    // This integration test simulates:
    // 1. Device A creates a play status
    // 2. Converts to sync format and sends to server
    // 3. Device B receives it and merges with local data
    // 4. The episode should be correctly identified

    const guid = "episode-123";
    const enclosureUrl = "https://example.com/episode.mp3";
    const feedUrl = "https://example.com/feed.xml";

    // Device A: Create local play status with encoded episodeId
    const deviceAEpisodeId = btoa(`${guid},${enclosureUrl}`);
    const deviceAStatus: PlayStatus = {
      episodeId: deviceAEpisodeId,
      feedUrl,
      position: 300,
      duration: 600,
      completed: false,
      updatedAt: new Date("2024-01-01T12:00:00Z").getTime(),
    };

    // Device A: Convert to sync format
    const syncFormat = playStatusesToSync([deviceAStatus]);
    expect(syncFormat[0].rss_source_item).toBe(deviceAEpisodeId);

    // Simulate server response (server returns same format)
    const serverResponse: PlayStatusSync[] = [
      {
        rss_source_feed: btoa(feedUrl),
        rss_source_item: syncFormat[0].rss_source_item,
        position: 300,
        played: false,
        updated_at: "2024-01-01T12:00:00.000Z",
      },
    ];

    // Device B: Has the same episode locally (maybe at different position)
    const deviceBStatus: PlayStatus = {
      episodeId: deviceAEpisodeId, // Same encoded ID
      feedUrl,
      position: 100, // Different position
      duration: 600,
      completed: false,
      updatedAt: new Date("2024-01-01T10:00:00Z").getTime(), // Older
    };

    // Device B: Merge remote with local
    const mergeResult = mergePlayStatuses([deviceBStatus], serverResponse);

    // Should recognize as same episode and use remote (newer, higher position)
    expect(mergeResult.merged).toHaveLength(1);
    expect(mergeResult.merged[0].episodeId).toBe(deviceAEpisodeId);
    expect(mergeResult.merged[0].position).toBe(300); // Remote position wins
  });

  it("should handle episodes with commas in guid", () => {
    // Edge case: guid contains commas, which is valid
    const guid = "episode,with,commas";
    const enclosureUrl = "https://example.com/episode.mp3";
    const feedUrl = "https://example.com/feed.xml";

    const episodeId = btoa(`${guid},${enclosureUrl}`);

    const localStatus: PlayStatus = {
      episodeId,
      feedUrl,
      position: 0,
      duration: 600,
      completed: false,
      updatedAt: new Date("2024-01-01").getTime(),
    };

    // Convert to sync format
    const syncFormat = playStatusesToSync([localStatus]);

    // Simulate receiving from server
    const serverResponse: PlayStatusSync[] = [
      {
        rss_source_feed: btoa(feedUrl),
        rss_source_item: syncFormat[0].rss_source_item,
        position: 500,
        played: true,
        updated_at: "2024-01-02T00:00:00.000Z",
      },
    ];

    // Merge should work correctly
    const mergeResult = mergePlayStatuses([localStatus], serverResponse);

    expect(mergeResult.merged).toHaveLength(1);
    expect(mergeResult.merged[0].episodeId).toBe(episodeId);
    expect(mergeResult.merged[0].position).toBe(500);
    expect(mergeResult.merged[0].completed).toBe(true);
  });
});
