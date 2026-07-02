import { describe, expect, it } from "vitest";
import type { PlayStatus, Subscription } from "../types";
import {
  computeListeningStats,
  filterPlayStatuses,
  getEpisodeStatus,
  isWithinPeriod,
} from "./listeningHistory";

const basePlayStatus: PlayStatus = {
  episodeId: "ep1",
  feedUrl: "https://example.com/feed.xml",
  position: 0,
  duration: 1000,
  completed: false,
  updatedAt: Date.now(),
};

describe("getEpisodeStatus", () => {
  it("returns completed when completed is true", () => {
    expect(getEpisodeStatus({ ...basePlayStatus, completed: true, position: 500 })).toBe(
      "completed",
    );
  });

  it("returns inProgress when not completed and position > 0", () => {
    expect(getEpisodeStatus({ ...basePlayStatus, completed: false, position: 100 })).toBe(
      "inProgress",
    );
  });

  it("returns notStarted when not completed and position is 0", () => {
    expect(getEpisodeStatus({ ...basePlayStatus, completed: false, position: 0 })).toBe(
      "notStarted",
    );
  });
});

describe("isWithinPeriod", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_000_000_000_000;

  it("passes everything through when period is empty", () => {
    expect(isWithinPeriod(now - 1000 * DAY, "", now)).toBe(true);
  });

  it("includes a timestamp exactly at the week boundary", () => {
    expect(isWithinPeriod(now - 7 * DAY, "week", now)).toBe(true);
  });

  it("excludes a timestamp just past the week boundary", () => {
    expect(isWithinPeriod(now - 7 * DAY - 1, "week", now)).toBe(false);
  });

  it("includes a timestamp within the month window", () => {
    expect(isWithinPeriod(now - 15 * DAY, "month", now)).toBe(true);
  });

  it("excludes a timestamp past the month window", () => {
    expect(isWithinPeriod(now - 31 * DAY, "month", now)).toBe(false);
  });

  it("includes a timestamp within the year window", () => {
    expect(isWithinPeriod(now - 200 * DAY, "year", now)).toBe(true);
  });

  it("excludes a timestamp past the year window", () => {
    expect(isWithinPeriod(now - 366 * DAY, "year", now)).toBe(false);
  });
});

describe("filterPlayStatuses", () => {
  const now = 1_000_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  const items: PlayStatus[] = [
    {
      episodeId: "a",
      feedUrl: "https://x.com/f",
      position: 500,
      duration: 1000,
      completed: true,
      updatedAt: now - DAY,
    },
    {
      episodeId: "b",
      feedUrl: "https://y.com/f",
      position: 100,
      duration: 1000,
      completed: false,
      updatedAt: now - 2 * DAY,
    },
    {
      episodeId: "c",
      feedUrl: "https://x.com/f",
      position: 0,
      duration: 1000,
      completed: false,
      updatedAt: now - 40 * DAY,
    },
  ];

  it("returns everything sorted by most recent when no filters applied", () => {
    const result = filterPlayStatuses(items, { feedUrl: "", period: "", status: "" }, now);
    expect(result.map((i) => i.episodeId)).toEqual(["a", "b", "c"]);
  });

  it("filters by feedUrl", () => {
    const result = filterPlayStatuses(
      items,
      { feedUrl: "https://x.com/f", period: "", status: "" },
      now,
    );
    expect(result.map((i) => i.episodeId)).toEqual(["a", "c"]);
  });

  it("filters by period", () => {
    const result = filterPlayStatuses(items, { feedUrl: "", period: "week", status: "" }, now);
    expect(result.map((i) => i.episodeId)).toEqual(["a", "b"]);
  });

  it("filters by status", () => {
    const result = filterPlayStatuses(
      items,
      { feedUrl: "", period: "", status: "notStarted" },
      now,
    );
    expect(result.map((i) => i.episodeId)).toEqual(["c"]);
  });

  it("combines all three filters", () => {
    const result = filterPlayStatuses(
      items,
      { feedUrl: "https://x.com/f", period: "week", status: "completed" },
      now,
    );
    expect(result.map((i) => i.episodeId)).toEqual(["a"]);
  });
});

describe("computeListeningStats", () => {
  const subs: Subscription[] = [
    { url: "https://x.com/f", addedAt: 0, title: "Podcast X" },
    // https://y.com/f intentionally has no subscription row, to exercise the fallback title
  ];

  it("returns zeroed stats for an empty history", () => {
    expect(computeListeningStats([], subs)).toEqual({
      totalTimeSeconds: 0,
      totalEpisodes: 0,
      completedCount: 0,
      topPodcasts: [],
    });
  });

  it("sums position, counts episodes and completions", () => {
    const items: PlayStatus[] = [
      {
        episodeId: "a",
        feedUrl: "https://x.com/f",
        position: 300,
        duration: 1000,
        completed: true,
        updatedAt: 1,
      },
      {
        episodeId: "b",
        feedUrl: "https://x.com/f",
        position: 200,
        duration: 1000,
        completed: false,
        updatedAt: 2,
      },
    ];
    const stats = computeListeningStats(items, subs);
    expect(stats.totalTimeSeconds).toBe(500);
    expect(stats.totalEpisodes).toBe(2);
    expect(stats.completedCount).toBe(1);
  });

  it("resolves subscription titles and falls back to hostname when unsubscribed", () => {
    const items: PlayStatus[] = [
      {
        episodeId: "a",
        feedUrl: "https://x.com/f",
        position: 1,
        duration: 1,
        completed: false,
        updatedAt: 1,
      },
      {
        episodeId: "b",
        feedUrl: "https://y.com/f",
        position: 1,
        duration: 1,
        completed: false,
        updatedAt: 1,
      },
    ];
    const stats = computeListeningStats(items, subs);
    const titles = stats.topPodcasts.map((p) => p.title).sort();
    expect(titles).toEqual(["Podcast X", "y.com"]);
  });

  it("ranks top podcasts by episode count, descending, capped at 5", () => {
    const items: PlayStatus[] = Array.from({ length: 7 }, (_, i) => ({
      episodeId: `ep${i}`,
      feedUrl: `https://feed${i % 7}.com/f`,
      position: 1,
      duration: 1,
      completed: false,
      updatedAt: i,
    }));
    // feed0 gets 2 episodes by adding one more
    items.push({
      episodeId: "extra",
      feedUrl: "https://feed0.com/f",
      position: 1,
      duration: 1,
      completed: false,
      updatedAt: 99,
    });
    const stats = computeListeningStats(items, []);
    expect(stats.topPodcasts).toHaveLength(5);
    expect(stats.topPodcasts[0]).toEqual({
      feedUrl: "https://feed0.com/f",
      title: "feed0.com",
      count: 2,
    });
  });
});
