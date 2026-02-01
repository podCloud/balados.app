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

  const createLocalStatus = (overrides: Partial<PlayStatus> = {}): PlayStatus => ({
    episodeId: "episode-1",
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
    rss_source_item: btoa("episode-1,https://example.com/feed.xml"),
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
    expect(result.merged[0].episodeId).toBe("episode-1");
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
    const local: PlayStatus[] = [
      createLocalStatus({ episodeId: "ep1", position: 100 }),
      createLocalStatus({ episodeId: "ep2", position: 200 }),
    ];
    const remote: PlayStatusSync[] = [
      createRemoteStatus({
        rss_source_item: btoa("ep2,https://example.com/feed.xml"),
        position: 300,
      }),
      createRemoteStatus({
        rss_source_item: btoa("ep3,https://example.com/feed.xml"),
        position: 50,
      }),
    ];

    const result = mergePlayStatuses(local, remote);

    expect(result.merged).toHaveLength(3);
    const byId = Object.fromEntries(
      result.merged.map((s) => [s.episodeId, s])
    );
    expect(byId["ep1"].position).toBe(100);
    expect(byId["ep2"].position).toBe(300); // Remote higher, close timestamps
    expect(byId["ep3"].position).toBe(50);
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
    const statuses: PlayStatus[] = [
      {
        episodeId: "episode-1",
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
    expect(result[0].rss_source_item).toBe(
      btoa("episode-1,https://example.com/feed.xml")
    );
    expect(result[0].position).toBe(120);
    expect(result[0].played).toBe(true);
    expect(result[0].updated_at).toBe("2024-01-01T00:00:00.000Z");
  });
});
